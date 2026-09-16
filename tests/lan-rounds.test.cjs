const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {LanStore}=require('../web/lan-store.cjs'),{Store}=require('../web/store.cjs');
const {today,hash,random,issueQr}=require('../web/security.cjs'),{scan}=require('../web/lan-qr.cjs');
const {migrateRounds}=require('../web/lan-rounds.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs');
const at=Date.parse('2026-09-16T06:00:00Z'),date=today(at),ip='192.168.2.3';
const body=(round,id='001',extra={})=>({sessionId:round.id,studentId:id,name:'Sinh viên '+id,seat:'B-'+id,requestId:randomBytes(16).toString('hex'),...extra});
function admission(store,round,id,now,address=ip){return body(round,id,{scanTicket:store.scan({code:store.currentQr(now).code},address,now).scanTicket});}

test('multiple rounds share one date, keep per-round dedup/IP review and report progress without automatic grading',()=>{
  const s=new LanStore(':memory:');try{
    const first=s.open(date,5,'TA',at,'Đầu giờ'),one=body(first);
    s.submit(one,ip,at);assert.throws(()=>s.open(date,5,'TA',at),e=>e.code==='ROUND_ACTIVE');
    assert.throws(()=>s.submit(body(first),ip,at),e=>e.code==='ALREADY_RECORDED');
    s.closeSession(first.id,'TA',at+1000);const second=s.open(date,5,'TA',at+2000,'Giữa giờ');
    s.submit(body(second),ip,at+2000);s.submit(body(second,'002'),ip,at+2000);
    assert.equal(s.entries(first.id)[0].status,'RECORDED');assert.ok(s.entries(second.id).every(r=>r.status==='PENDING'));
    s.closeSession(second.id,'TA',at+3000);const third=s.open(date,5,'TA',at+4000,'Cuối giờ');
    s.submit(body(third),ip,at+4000);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);assert.equal(s.sessions().length,3);
    const matrix=s.matrix();assert.deepEqual(matrix[0],['MSSV','Họ tên','Email trường',date]);
    assert.equal(matrix[1][3],'Đã gửi 3/3 đợt · 1 cần xác nhận');assert.equal(matrix[2][3],'Đã gửi 1/3 đợt · 1 cần xác nhận');
    assert.equal(s.history(date).length,4);assert.match(s.report('detail',date).csv,/Giữa giờ/);assert.match(s.report('detail',date).csv,/Cuối giờ/);
    assert.equal(s.checkIn(one,'192.168.2.99',at+5000).duplicate,true,'already committed old request is recoverable, not counted in the new round');
    assert.throws(()=>s.checkIn({...one,sessionId:third.id},ip,at+5000),e=>e.code==='REQUEST_CHANGED');
    assert.deepEqual(s.snapshot().red,[{row:1,col:3},{row:2,col:3}]);
  }finally{s.close();}
});

test('reopening preserves entries but revokes old QR and unused tickets, even in the same millisecond',()=>{
  const s=new LanStore(':memory:');try{
    const first=s.open(date,5,'TA',at),qr=s.currentQr(at),saved=admission(s,first,'001',at),unused=admission(s,first,'002',at);
    s.checkIn(saved,ip,at);s.closeSession(first.id,'TA',at);
    const reopened=s.reopen(first.id,10,'TA',at);assert.equal(reopened.number,1);assert.equal(reopened.generation,2);
    assert.notEqual(s.currentQr(at).code,qr.code);
    assert.throws(()=>s.scan({token:qr.token},ip,at),e=>e.code==='QR_EXPIRED');
    assert.throws(()=>s.scan({code:qr.code},ip,at),e=>e.code==='QR_EXPIRED');
    assert.throws(()=>s.checkIn(unused,ip,at),e=>e.code==='SCAN_INVALID');
    assert.equal(s.checkIn(saved,ip,at).duplicate,true);
    assert.throws(()=>s.checkIn(admission(s,reopened,'001',at),ip,at),e=>e.code==='ALREADY_RECORDED');
    s.checkIn(admission(s,reopened,'002',at),ip,at);assert.equal(s.entries().length,2);
    assert.throws(()=>s.reopen(first.id,5,'TA',at),e=>e.code==='ROUND_ACTIVE');
    s.closeSession(first.id,'TA',at+1000);assert.throws(()=>s.reopen(first.id,5,'TA',at+86400000),e=>e.code==='DATE_NOT_TODAY');
    assert.ok(s.db.prepare("SELECT COUNT(*) n FROM audit WHERE event='ROUND_REOPEN'").get().n===1);
  }finally{s.close();}
});

test('expired rounds can reopen or be followed by a new round; online stays in the same daily cell',()=>{
  const s=new LanStore(':memory:');try{
    s.importRoster('MSSV,Họ tên,Email trường\n001,An,an@usth.edu.vn','TA');
    const first=s.open(date,2,'TA',at);s.submit(body(first),ip,at);
    assert.equal(s.activeSession(at+120000),undefined);
    s.reopen(first.id,2,'TA',at+120000);assert.equal(s.entries(first.id).length,1);
    const second=s.open(date,2,'TA',at+240000);assert.equal(second.number,2);
    s.importOnline(date,'001','Google Form','TA',at+240000);
    assert.equal(s.matrix()[1][3],'ON · Đã gửi 1/2 đợt');
    assert.equal(s.db.prepare("SELECT COUNT(*) n FROM sessions WHERE mode='OFFLINE'").get().n,1);
  }finally{s.close();}
});

function oldDatabase(filename){
  const s=new Store(filename);s.setMeta('lanQrSecret',random());s.setMeta('lanSchema','1');s.setMeta('sheetOwner','existing-owner');
  const round=s.open(date,8,'TA',at,false);
  s.db.exec(`CREATE TABLE lan_attendance (
    id INTEGER PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),student_id TEXT NOT NULL,name TEXT NOT NULL,seat TEXT NOT NULL,
    ip TEXT NOT NULL,at INTEGER NOT NULL,request_hash TEXT NOT NULL UNIQUE,review TEXT NOT NULL DEFAULT '',reviewed_peers INTEGER NOT NULL DEFAULT 0,
    review_note TEXT NOT NULL DEFAULT '',reviewed_by TEXT NOT NULL DEFAULT '',reviewed_at INTEGER,UNIQUE(session_id,student_id));
    CREATE INDEX lan_session_ip ON lan_attendance(session_id,ip);
    CREATE TABLE lan_scan_uses (grant_id TEXT PRIMARY KEY,attendance_id INTEGER NOT NULL UNIQUE REFERENCES lan_attendance(id));`);
  const used=scan({token:issueQr(round,s.meta('lanQrSecret'),at).token},round,s.meta('lanQrSecret'),ip,at);
  const input=body(round,'001',{scanTicket:used.scanTicket});
  s.db.prepare('INSERT INTO lan_attendance VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(7,round.id,'001',input.name,input.seat,ip,at,hash(input.requestId),'CONFIRMED',1,'Đã đối chiếu thẻ','TA',at+1);
  const grantId=JSON.parse(Buffer.from(used.scanTicket.split('.')[0],'base64url').toString()).id;
  s.db.prepare('INSERT INTO lan_scan_uses VALUES (?,?)').run(grantId,7);
  const unused=scan({code:issueQr(round,s.meta('lanQrSecret'),at).code},round,s.meta('lanQrSecret'),ip,at);
  return {store:s,round,input,unused,grantId};
}

test('migration backs up and preserves legacy receipts, reviews, scan uses and active grants across restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-round-migration-')),filename=path.join(dir,'class.sqlite');let store;
  try{
    const old=oldDatabase(filename);old.store.close();store=new LanStore(filename);
    assert.equal(store.meta('sheetOwner'),'existing-owner');assert.equal(store.session(old.round.id).number,1);
    assert.equal(store.entries()[0].id,7);assert.equal(store.entries()[0].status,'CONFIRMED');assert.equal(store.entries()[0].review_note,'Đã đối chiếu thẻ');
    assert.equal(store.checkIn(old.input,ip,at+1000).duplicate,true);
    assert.throws(()=>store.checkIn(body(old.round,'003',{scanTicket:old.input.scanTicket}),ip,at+1000),e=>e.code==='SCAN_USED');
    store.checkIn(body(old.round,'002',{scanTicket:old.unused.scanTicket}),ip,at+1000);
    const backup=fs.readdirSync(dir).find(f=>f.includes('.before-rounds-'));assert.ok(backup);
    const saved=new DatabaseSync(path.join(dir,backup),{readOnly:true});
    assert.equal(saved.prepare('SELECT COUNT(*) n FROM lan_attendance').get().n,1);assert.equal(saved.prepare('PRAGMA table_info(lan_attendance)').all().some(c=>c.name==='round_id'),false);saved.close();
    store.closeSession(old.round.id,'TA',at+2000);const second=store.open(date,5,'TA',at+3000,'Cuối giờ');store.submit(body(second),ip,at+3000);
    store.close();store=new LanStore(filename);assert.equal(store.entries().length,3);assert.equal(store.sessions().length,2);assert.equal(store.activeSession(at+4000).id,second.id);
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(fs.readdirSync(dir).filter(f=>f.includes('.before-rounds-')).length,1,'migration does not repeat');
  }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('failure after schema replacement rolls the entire migration back',()=>{
  const old=oldDatabase(':memory:'),s=old.store,exec=s.db.exec.bind(s.db);
  try{
    s.db.exec=sql=>{exec(sql);if(sql.includes('ALTER TABLE lan_attendance_next'))throw Error('Simulated interruption before commit');};
    assert.throws(()=>migrateRounds(s,':memory:'),/Simulated interruption/);s.db.exec=exec;
    assert.equal(s.db.prepare('PRAGMA table_info(lan_attendance)').all().some(c=>c.name==='round_id'),false);
    assert.equal(s.db.prepare('SELECT request_hash FROM lan_attendance WHERE id=7').get().request_hash,hash(old.input.requestId));
    assert.equal(s.db.prepare('SELECT grant_id FROM lan_scan_uses').get().grant_id,old.grantId);
    assert.equal(s.meta('lanSchema'),'1');assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
    migrateRounds(s,':memory:');assert.equal(s.meta('lanSchema'),'2');
  }finally{s.db.exec=exec;s.close();}
});

test('TA HTTP can create/reopen rounds; student access is blocked and projector follows the active round',async()=>{
  const f=await startFixture();
  try{
    const dashboard=await (await fetch(f.adminOrigin+'/api/dashboard')).json();
    const post=(route,data,csrf=dashboard.csrf)=>fetch(f.adminOrigin+route,{method:'POST',headers:{Origin:f.adminOrigin,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});
    const first=(await (await post('/api/sessions',{minutes:5,label:'Đầu giờ'})).json()).session;
    await post('/api/sessions/'+first.id+'/close',{});
    const second=(await (await post('/api/sessions',{minutes:5,label:'Cuối giờ'})).json()).session;
    await post('/api/sessions/'+second.id+'/close',{});
    assert.equal((await post('/api/sessions/'+first.id+'/reopen',{minutes:5},'wrong')).status,403);
    assert.equal((await fetch(f.origin+'/api/sessions/'+first.id+'/reopen',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:'{"minutes":5}'})).status,404);
    assert.equal((await post('/api/sessions/'+first.id+'/reopen',{minutes:5})).status,200);
    const projector=await (await fetch(f.adminOrigin+'/api/projector')).json();assert.equal(projector.session.id,first.id);assert.equal(projector.session.number,1);assert.equal(projector.session.label,'Đầu giờ');assert.ok(projector.qr);
    assert.equal((await (await fetch(f.origin+'/api/session')).json()).session.id,first.id);
    assert.equal((await post('/api/sessions',{minutes:5})).status,409);
  }finally{await f.close();}
});
