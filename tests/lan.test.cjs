const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {LanStore,canonicalIP}=require('../web/lan-store.cjs');
const {createStudentApp,createAdminApp}=require('../web/lan-app.cjs');
const {loadLanConfig}=require('../web/lan-config.cjs');
const {SheetsWriter,SyncWorker}=require('../web/sheets.cjs');
const {ranges}=require('../web/security.cjs');
const now=Date.parse('2026-09-09T06:00:00Z');
const payload=(sid,id='001')=>({sessionId:sid,studentId:id,name:'Nguyễn An',seat:'B-12',requestId:randomBytes(16).toString('hex')});
function setup(){const store=new LanStore(':memory:');const session=store.open('2026-09-09',8,'TA',now);return {store,session};}

test('LAN needs no roster or Google; canonical IP groups flag every distinct MSSV in the same session',()=>{
  const {store,session}=setup();try{
    const first=payload(session.id);assert.equal(store.submit(first,'::ffff:192.168.2.50',now).status,'RECORDED');
    assert.equal(store.submit(first,'192.168.2.50',now+1).duplicate,true);assert.equal(store.entries()[0].peers,1);
    store.submit(payload(session.id,'002'),'192.168.2.50',now+2);
    assert.deepEqual(store.entries().map(e=>e.status),['PENDING','PENDING']);assert.deepEqual(store.snapshot().red,[{row:1,col:3},{row:2,col:3}]);
    assert.equal(store.matrix()[1][3],'OFF cần xác nhận');assert.equal(store.sessions()[0].count,2);
    assert.equal(canonicalIP('2001:0db8:0:0:0:0:0:1'),'2001:db8::1');
    const next=store.open('2026-09-16',8,'TA',now+7*86400000);store.submit(payload(next.id),'192.168.2.50',now+7*86400000);
    assert.equal(store.entries(next.id)[0].status,'RECORDED');assert.equal(store.matrix()[1][3],'OFF cần xác nhận');assert.equal(store.matrix()[1][4],'OFF');
  }finally{store.close();}
});
test('uncertain submissions recover after closing; guessed MSSV cannot obtain another receipt or change its fields/IP',()=>{
  const {store,session}=setup();try{
    const body=payload(session.id),receipt=store.submit(body,'192.168.2.4',now);
    assert.throws(()=>store.submit({...body,seat:'C-99'},'192.168.2.9',now),e=>e.code==='REQUEST_CHANGED');
    assert.throws(()=>store.submit(payload(session.id),'192.168.2.9',now),e=>e.code==='ALREADY_RECORDED');
    store.closeSession(session.id,'TA',now+1);assert.equal(store.submit(body,'192.168.2.9',now+600000).at,receipt.at);
    assert.equal(store.entries()[0].ip,'192.168.2.4');assert.equal(store.entries()[0].seat,'B-12');
    assert.throws(()=>store.submit(payload(session.id,'002'),'192.168.2.9',now+2),e=>e.code==='SESSION_CLOSED');
  }finally{store.close();}
});
test('TA review is audited, clears red, persists rejections and reflags confirmed members on new arrivals',()=>{
  const {store,session}=setup();try{
    for(const id of ['001','002'])store.submit(payload(session.id,id),'192.168.2.1',now);
    let [a,b]=store.entries();store.reviewEntry(a.id,'CONFIRMED','Đã kiểm tra thẻ, ghế B-12',2,'TA',now);
    store.reviewEntry(b.id,'REJECTED','Không có mặt tại ghế khai báo',2,'TA',now);
    assert.deepEqual(store.snapshot().red,[]);assert.equal(store.matrix()[1][3],'OFF');assert.equal(store.matrix()[2][3],'OFF không được xác nhận');
    store.submit(payload(session.id,'003'),'192.168.2.1',now);
    assert.deepEqual(store.entries().map(e=>e.status),['PENDING','REJECTED','PENDING']);
    assert.throws(()=>store.reviewEntry(a.id,'CONFIRMED','Đã đối chiếu',2,'TA',now),e=>e.code==='GROUP_CHANGED');
    assert.throws(()=>store.reviewEntry(a.id,'CONFIRMED','',3,'TA',now),e=>e.code==='INPUT_INVALID');
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event='LAN_REVIEW'").get().n,2);
  }finally{store.close();}
});
test('self-declared inputs are bounded, normalized and CSV formula injection is escaped',()=>{
  const {store,session}=setup();try{
    for(const fields of [{studentId:'bad id'},{name:''},{seat:''},{name:'abc\nxyz'},{seat:'x'.repeat(33)},{requestId:'guess'}])assert.throws(()=>store.submit({...payload(session.id),...fields},'192.168.2.1',now));
    const body={...payload(session.id),studentId:'sv_001',name:'  =1+1  ',seat:'@SUM(A1)'};
    const result=store.submit(body,'192.168.2.1',now);assert.equal(result.studentId,'SV_001');assert.equal(result.name,'=1+1');assert.match(store.detailCSV(),/'=1\+1/);assert.match(store.detailCSV(),/'@SUM/);
  }finally{store.close();}
});
test('additive LAN migration keeps historical roster, offline, reviewed online and daily columns',()=>{
  const {store,session}=setup();try{
    store.importRoster('MSSV,Họ tên,Email trường\n001,Nguyễn An,a@school.example\n002,Trần Bình,b@school.example','TA');
    store.importOnline('2026-09-09','001','Form đã đối chiếu','TA',now);
    store.submit(payload(session.id),'192.168.2.3',now);assert.equal(store.matrix()[1][3],'BOTH');
    store.submit(payload(session.id,'002'),'192.168.2.3',now);assert.equal(store.matrix()[1][3],'ON · OFF cần xác nhận');
    assert.equal(store.roster().length,2);assert.equal(store.snapshot().detail.length,3);
  }finally{store.close();}
});
test('LAN config selects current Wi-Fi subnet, rejects public/loopback and runs without Google credentials',()=>{
  const interfaces={wifi:[{family:'IPv4',internal:false,address:'192.168.8.20',cidr:'192.168.8.20/24'}]};
  const config=loadLanConfig({LAN_INTERFACE:'wifi'},interfaces);assert.equal(config.origin,'http://192.168.8.20:4180');assert.equal(config.adminOrigins[0],'http://127.0.0.1:4181');assert.equal(config.spreadsheetId,'');
  for(const env of [{CAMPUS_CIDRS:'0.0.0.0/0'},{CAMPUS_CIDRS:'127.0.0.1/32'},{CAMPUS_CIDRS:'192.168.9.0/24'},{ADMIN_PORT:'4180'},{LAN_INTERFACE:'missing'}])assert.throws(()=>loadLanConfig({LAN_INTERFACE:'wifi',...env},interfaces));
});
async function fixture(){
  const {store,session}=setup(),worker=new SyncWorker(store,null);
  const config={origin:'',adminOrigins:[],campus:ranges(['127.0.0.1/32']),campusCidrs:['127.0.0.1/32'],network:'test'};
  const start=app=>new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const student=await start(createStudentApp(config,store,{clock:()=>now})),admin=await start(createAdminApp(config,store,worker,{clock:()=>now}));
  config.origin='http://127.0.0.1:'+student.address().port;config.adminOrigins=['http://127.0.0.1:'+admin.address().port];
  return {store,session,config,async close(){await Promise.all([student,admin].map(s=>new Promise(resolve=>s.close(resolve))));store.close();}};
}
function post(origin,body,headers={}){return {method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)};}
test('HTTP ignores forwarded and submitted IP, separates TA API, enforces origin/host/CSRF and protects receipts',async()=>{
  const f=await fixture();try{
    const origin=f.config.origin,admin=f.config.adminOrigins[0],body=payload(f.session.id);
    let res=await fetch(origin+'/api/check-in',post(origin,{...body,ip:'10.1.2.3'},{'X-Forwarded-For':'10.1.2.3'}));assert.equal(res.status,200);assert.equal(f.store.entries()[0].ip,'127.0.0.1');
    assert.equal((await fetch(origin+'/api/dashboard')).status,404);assert.equal((await fetch(origin+'/api/entries')).status,404);
    const wrongHostStatus=await new Promise((resolve,reject)=>{require('node:http').get(origin+'/api/session',{headers:{Host:'evil.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});assert.equal(wrongHostStatus,403);
    assert.equal((await fetch(origin+'/api/check-in',post('https://evil.example',payload(f.session.id,'002')))).status,403);
    assert.equal((await fetch(admin+'/api/sessions',post(admin,{minutes:8}))).status,403);
    const dashboard=await (await fetch(admin+'/api/dashboard')).json();assert.ok(dashboard.csrf);
    assert.equal((await fetch(admin+'/api/sessions/'+f.session.id+'/close',post(admin,{}, {'X-CSRF-Token':dashboard.csrf}))).status,200);
    f.config.campus=ranges(['203.0.113.0/24']);assert.equal((await fetch(origin+'/api/session',{headers:{'X-Forwarded-For':'203.0.113.8'}})).status,403);
  }finally{await f.close();}
});
test('700 same-IP HTTP submissions and retries succeed without Sheets and mark all 700 for review',async()=>{
  const f=await fixture();try{
    const bodies=Array.from({length:700},(_,i)=>payload(f.session.id,'S'+String(i).padStart(4,'0')));
    for(const duplicate of [false,true]){
      const replies=await Promise.all(bodies.map(async body=>{const res=await fetch(f.config.origin+'/api/check-in',post(f.config.origin,body));assert.equal(res.status,200);return res.json();}));
      assert.ok(replies.every(r=>r.receipt.duplicate===duplicate));
    }
    assert.equal(f.store.entries().length,700);assert.equal(f.store.snapshot().detailRed.length,700);assert.ok(f.store.entries().every(e=>e.peers===700));
  }finally{await f.close();}
});
test('Sheets writes owned detail tab and red formatting for both IP peers; confirmation clears colors',async()=>{
  const {store,session}=setup();try{
    for(const id of ['001','002'])store.submit(payload(session.id,id),'192.168.2.1',now);
    const requests=[],writer=new SheetsWriter({sheetTitle:'BP_Web_Attendance'},store);
    const request=async(suffix,method,data)=>{requests.push({suffix,method,data});return {sheets:[]};};writer.request=request;
    writer.detailWriter=new SheetsWriter({sheetTitle:'BP_Offline_Check'},store);writer.detailWriter.request=request;
    const worker=new SyncWorker(store,writer);await worker.sync(true);assert.equal(worker.status().error,'');
    assert.equal(requests.filter(r=>r.method==='PUT').length,2);
    const formatting=requests.at(-1).data.requests;
    assert.equal(formatting.filter(r=>r.repeatCell.cell.userEnteredFormat.backgroundColor.green===.8).length,2);
    const detailWrite=requests.find(r=>r.method==='PUT'&&decodeURIComponent(r.suffix).includes('BP_Offline_Check'));assert.equal(detailWrite.data.values[1][4],'192.168.2.1');
    for(const row of store.entries())store.reviewEntry(row.id,'CONFIRMED','Đã đối chiếu tại ghế',2,'TA',now);
    await worker.sync(true);assert.equal(requests.at(-1).data.requests.length,2);assert.equal(worker.status().pending,false);
  }finally{store.close();}
});
test('Sheets formatting failures retry whole snapshot and do not acknowledge concurrent changes',async()=>{
  const {store,session}=setup();try{
    store.submit(payload(session.id),'192.168.2.1',now);let attempt=0;
    const worker=new SyncWorker(store,{write:async(values,snapshot)=>{assert.equal(values,snapshot.values);if(++attempt===1)throw Error('format failed');if(attempt===2)store.submit(payload(session.id,'002'),'192.168.2.1',now);}});
    await worker.sync(true);assert.equal(worker.status().pending,true);await worker.sync(true);assert.equal(worker.status().pending,true);await worker.sync(true);assert.equal(worker.status().pending,false);
  }finally{store.close();}
});
