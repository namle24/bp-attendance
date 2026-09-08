const test=require('node:test');
const assert=require('node:assert/strict');
const {ranges,contains,issueQr,verifyQr,validateIdentity}=require('../web/security.cjs');
const {loadConfig}=require('../web/config.cjs');
const {Store}=require('../web/store.cjs');
const {SyncWorker,SheetsWriter}=require('../web/sheets.cjs');
const secret='a'.repeat(64),now=Date.parse('2026-09-09T06:00:00Z');

test('network matching covers IPv4, mapped IPv4 and IPv6; rejects unrelated networks',()=>{
  const allow=ranges(['203.0.113.0/24','2001:db8:1234::/48']);
  for(const ip of ['203.0.113.5','::ffff:203.0.113.5','2001:db8:1234::a'])assert.equal(contains(ip,allow),true);
  for(const ip of ['203.0.114.5','2001:db8:1235::a','203.0.113.5.evil','unknown',''])assert.equal(contains(ip,allow),false);
  assert.throws(()=>ranges(['0.0.0.0/0']),/\/0/);assert.throws(()=>ranges(['::/0']),/\/0/);
});
test('QR rotates at 30 seconds with zero stale-code grace and rejects tampering',()=>{
  const s={id:'session-1',mode:'OFFLINE',opened_at:now,ends_at:now+300000};
  const a=issueQr(s,secret,now+1000),same=issueQr(s,secret,now+29999),b=issueQr(s,secret,now+30000);
  assert.equal(a.token,same.token);assert.notEqual(a.token,b.token);
  assert.equal(verifyQr(a.token,secret,now+29999).sid,s.id);
  assert.throws(()=>verifyQr(a.token,secret,now+30000),e=>e.code==='QR_EXPIRED');
  assert.throws(()=>verifyQr(a.token+'x',secret,now+1000),e=>e.code==='QR_INVALID');
  assert.throws(()=>verifyQr(b.token,secret,now),e=>e.code==='QR_INVALID');
  assert.throws(()=>issueQr({...s,closed_at:now},secret,now+10),e=>e.code==='SESSION_CLOSED');
});
test('Google identity requires hosted domain, verified email, audience, issuer, nonce and expiration',()=>{
  const c={clientId:'client',domains:['school.example']};
  const p={sub:'google-1',email:'a@school.example',email_verified:true,hd:'school.example',aud:'client',iss:'https://accounts.google.com',nonce:'nonce',exp:now/1000+600};
  assert.equal(validateIdentity(p,c,'nonce',now).sub,'google-1');
  for(const delta of [{hd:undefined},{hd:'gmail.com'},{email_verified:false},{aud:'other'},{iss:'other'},{nonce:'other'},{exp:now/1000}])
    assert.throws(()=>validateIdentity({...p,...delta},c,'nonce',now),e=>e.code==='GOOGLE_IDENTITY_INVALID');
});
test('live startup fails closed when deployment credentials or network ranges are absent',()=>{
  assert.throws(()=>loadConfig({}),/CAMPUS_CIDRS/);
  assert.throws(()=>loadConfig({BP_MODE:'demo',BIND_HOST:'0.0.0.0'}),/localhost/);
  assert.throws(()=>loadConfig({BP_MODE:'demo',GOOGLE_CLIENT_ID:'live-client'}),/cấu hình Google/);
  assert.equal(loadConfig({BP_MODE:'demo'}).demo,true);
  assert.throws(()=>loadConfig({PUBLIC_ORIGIN:'https://school.example',GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_HOSTED_DOMAINS:'school.example',ADMIN_EMAILS:'ta@school.example',QR_SECRET:secret,GOOGLE_SHEET_ID:'sheet',CAMPUS_CIDRS:'127.0.0.1/32'}),/localhost/);
});
test('attendance and sheet ownership survive closing and reopening the database',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-persistence-')),file=path.join(directory,'db.sqlite');
  let store=new Store(file);
  try{
    store.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example','ta');
    store.bindStudent({sub:'g1',email:'a@school.example'});
    const s=store.open('2026-09-09',5,'ta',now);store.checkIn(s.id,{sub:'g1',email:'a@school.example'},'203.0.113.1',now+1000);store.setMeta('sheetOwner','owner');
    store.close();store=new Store(file);
    assert.equal(store.matrix()[1][3],'OFF');assert.equal(store.meta('sheetOwner'),'owner');assert.equal(store.sessions()[0].count,1);
  }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('SQLite deduplicates submissions and preserves prior week after roster reorder/import',()=>{
  const s=new Store(':memory:');try{
    s.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example\n002,Bình,b@school.example','ta');
    const identity={sub:'g1',email:'a@school.example'};s.bindStudent(identity);
    const session=s.open('2026-09-09',5,'ta',now);
    assert.equal(s.checkIn(session.id,identity,'203.0.113.1',now+1000).duplicate,false);
    assert.equal(s.checkIn(session.id,identity,'203.0.113.1',now+2000).duplicate,true);
    s.importRoster('MSSV,Họ tên,Email trường\n002,Bình,b@school.example','ta');
    assert.throws(()=>s.checkIn(session.id,identity,'203.0.113.1',now+3000),e=>e.code==='NOT_ENROLLED');
    assert.equal(s.matrix()[1][3],'OFF');
    const next=now+7*86400000;s.open('2026-09-16',5,'ta',next);
    assert.deepEqual(s.matrix()[0].slice(3),['2026-09-09','2026-09-16']);
    assert.equal(s.matrix()[1][3],'OFF');
  }finally{s.close();}
});
test('linked Google subject cannot silently move to another MSSV',()=>{
  const s=new Store(':memory:');try{
    s.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example\n002,Bình,b@school.example','ta');
    s.bindStudent({sub:'g1',email:'a@school.example'});
    assert.throws(()=>s.bindStudent({sub:'g1',email:'b@school.example'}),e=>e.code==='IDENTITY_CONFLICT');
    assert.throws(()=>s.bindStudent({sub:'g2',email:'a@school.example'}),e=>e.code==='IDENTITY_CHANGED');
    assert.throws(()=>s.importRoster('MSSV,Họ tên,Email trường\n001,An,new@school.example','ta'),e=>e.code==='IDENTITY_BOUND');
  }finally{s.close();}
});
test('Sheets failure leaves persisted results pending; retry and concurrent arrivals are safe',async()=>{
  const s=new Store(':memory:');try{
    s.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example','ta');
    let fail=true,calls=0;const writer={write:async()=>{calls++;if(fail)throw Error('API unavailable');s.dirty();}};
    const worker=new SyncWorker(s,writer);
    assert.equal((await worker.sync(true)).pending,true);assert.match(worker.status().error,/unavailable/);
    fail=false;await worker.sync(true);assert.equal(worker.status().pending,true);
    writer.write=async()=>{calls++;};await worker.sync(true);assert.equal(worker.status().pending,false);assert.equal(worker.status().error,'');assert.equal(calls,3);
  }finally{s.close();}
});
test('Sheets writer refuses to overwrite a tab owned by another database',async()=>{
  const s=new Store(':memory:');try{
    const writer=new SheetsWriter({sheetTitle:'BP_Web_Attendance'},s);
    writer.request=async()=>({sheets:[{properties:{sheetId:1,title:'BP_Web_Attendance'},developerMetadata:[]}]});
    await assert.rejects(()=>writer.write([['header']]),/không thuộc database/);
  }finally{s.close();}
});
test('Sheets creates owned tab, expands capacity and writes strings using RAW',async()=>{
  const s=new Store(':memory:');try{
    const writer=new SheetsWriter({sheetTitle:'BP_Web_Attendance'},s),requests=[];
    writer.request=async(suffix,method,data)=>{requests.push({suffix,method,data});return {sheets:[]};};
    await writer.write(Array.from({length:1200},()=>Array.from({length:40},()=> '=not-a-formula')));
    assert.ok(requests[1].data.requests.some(r=>r.createDeveloperMetadata));
    assert.equal(requests[2].data.requests[0].updateSheetProperties.properties.gridProperties.rowCount,1200);
    assert.match(requests[3].suffix,/valueInputOption=RAW/);assert.equal(requests[3].data.values[0][0],'=not-a-formula');
  }finally{s.close();}
});
