const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parse}=require('csv-parse/sync');
const {LanStore}=require('../web/lan-store.cjs');
const {createStudentApp,createAdminApp}=require('../web/lan-app.cjs');
const {ranges}=require('../web/security.cjs');
const {SyncWorker}=require('../web/sheets.cjs');
const first=Date.parse('2026-09-09T06:00:00Z'),second=first+7*86400000;
function seed(store){
  const a=store.open('2026-09-09',8,'TA',first),b=store.open('2026-09-16',8,'TA',second);
  const send=(session,now,studentId,ip)=>store.submit({sessionId:session.id,studentId,name:'Nguyễn An '+studentId,seat:'B-'+studentId,requestId:randomBytes(16).toString('hex')},ip,now);
  for(const id of ['001','002','003'])send(a,first,id,id==='003'?'192.168.2.3':'192.168.2.1');
  for(const id of ['001','004','005'])send(b,second,id,id==='005'?'192.168.2.5':'192.168.2.1');
  const rejected=store.entries(a.id).find(e=>e.student_id==='002');
  store.reviewEntry(rejected.id,'REJECTED','Không có mặt tại ghế B-002',2,'TA',first+1000);
  const confirmed=store.entries(b.id).find(e=>e.student_id==='001');store.reviewEntry(confirmed.id,'CONFIRMED','Đã kiểm tra thẻ',2,'TA',second+1000);
  return {a,b};
}
const csv=text=>parse(text,{bom:true});
test('daily/all CSV and history preserve exact date boundaries, leading zero IDs, notes and other days',()=>{
  const store=new LanStore(':memory:');try{
    seed(store);const before=store.snapshot(),revision=store.meta('revision');
    const all=csv(store.report('summary').csv),day=store.report('summary','2026-09-09'),rows=csv(day.csv);
    assert.deepEqual(all[0].slice(3),['2026-09-09','2026-09-16']);assert.equal(all.length,6);
    assert.deepEqual(rows[0],['MSSV','Họ tên','Email trường','2026-09-09']);assert.deepEqual(rows.slice(1).map(r=>r[0]),['001','002','003']);assert.match(day.filename,/2026-09-09\.csv$/);
    assert.equal(rows[1][3],'OFF cần xác nhận');assert.equal(rows[2][3],'OFF không được xác nhận');
    const detail=csv(store.report('detail','2026-09-16').csv);assert.equal(detail.length,4);assert.ok(detail.slice(1).every(r=>r[0]==='2026-09-16'));assert.deepEqual(detail.slice(1).map(r=>r[1]),['001','004','005']);
    assert.equal(csv(store.report('detail').csv).length,7);assert.equal(store.history('2026-09-09').length,3);assert.equal(store.history().length,6);
    assert.equal(store.meta('revision'),revision);assert.deepEqual(store.snapshot(),before);
    assert.ok(store.report('detail','2026-09-09').csv.includes('Không có mặt tại ghế B-002'));
  }finally{store.close();}
});
test('cases screen/export separate pending and rejected per date and keep confirmed students in history',()=>{
  const store=new LanStore(':memory:');try{
    const {a}=seed(store);
    assert.deepEqual(store.issues().counts,{pending:2,rejected:1});assert.equal(store.issues().entries.length,3);
    assert.deepEqual(store.issues('2026-09-09').counts,{pending:1,rejected:1});
    const rejected=store.issues('2026-09-09','REJECTED');assert.equal(rejected.entries.length,1);assert.equal(rejected.entries[0].student_id,'002');assert.equal(rejected.entries[0].reason,'Không có mặt tại ghế B-002');
    assert.equal(store.issues('2026-09-16','REJECTED').entries.length,0);
    const rows=csv(store.report('issues','2026-09-09','REJECTED').csv);assert.equal(rows.length,2);assert.equal(rows[1][1],'002');assert.equal(rows[1].at(-1),rejected.entries[0].reason);
    assert.ok(store.issues('2026-09-09','PENDING').entries[0].reason.includes('2 MSSV'));
    const row=store.entries(a.id).find(e=>e.student_id==='001');store.reviewEntry(row.id,'CONFIRMED','Đã kiểm tra thẻ và ghế',2,'TA',first+2000);
    assert.equal(store.issues('2026-09-09','PENDING').entries.length,0);assert.equal(store.history('2026-09-09').length,3);
  }finally{store.close();}
});
test('date/status filters fail explicitly, empty reports retain headers and review notes cannot inject formulas',()=>{
  const store=new LanStore(':memory:');try{
    assert.equal(csv(store.report('detail').csv).length,1);assert.equal(csv(store.report('issues').csv).length,1);
    const {a}=seed(store);const empty=store.open('2026-09-23',8,'TA',second+7*86400000);
    assert.equal(csv(store.report('summary',empty.date).csv).length,1);assert.equal(csv(store.report('detail',empty.date).csv).length,1);
    for(const date of ['2026-02-30','not-a-date',['2026-09-09','2026-09-16'],null])assert.throws(()=>store.report('detail',date),e=>e.code==='DATE_INVALID');
    assert.throws(()=>store.history('2026-09-10'),e=>e.code==='DATE_UNKNOWN');assert.throws(()=>store.report('issues','','CONFIRMED'),e=>e.code==='STATUS_INVALID');
    const row=store.entries(a.id)[0];store.reviewEntry(row.id,'REJECTED','=HYPERLINK("https://example.invalid")',2,'TA',first+2000);
    const records=csv(store.report('issues',a.date,'REJECTED').csv);assert.ok(records[1][7].startsWith("'="));assert.ok(records[1].at(-1).startsWith("'="));
  }finally{store.close();}
});
test('daily report and case decisions remain available after reopening the on-disk database',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-reports-')),filename=path.join(directory,'attendance.sqlite');let store;
  try{
    store=new LanStore(filename);seed(store);const daily=store.report('detail','2026-09-09').csv,cases=store.report('issues').csv;
    store.close();store=new LanStore(filename);assert.equal(store.report('detail','2026-09-09').csv,daily);assert.equal(store.report('issues').csv,cases);assert.equal(store.sessions().length,2);
  }finally{store?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('HTTP daily/all exports match filters and names, reject malformed queries and remain inaccessible to students',async()=>{
  const store=new LanStore(':memory:');seed(store);
  const config={origin:'',adminOrigins:[],campus:ranges(['127.0.0.1/32']),campusCidrs:['127.0.0.1/32'],network:'test'};
  const listen=app=>new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const admin=await listen(createAdminApp(config,store,new SyncWorker(store,null))),student=await listen(createStudentApp(config,store));
  config.origin='http://127.0.0.1:'+student.address().port;const origin='http://127.0.0.1:'+admin.address().port;config.adminOrigins=[origin];
  try{
    for(const [route,rows] of [['export.csv?date=2026-09-09',4],['detail.csv?date=2026-09-16',4],['detail.csv',7],['issues.csv?date=2026-09-09&status=REJECTED',2]]){
      const response=await fetch(origin+'/api/'+route);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);assert.equal(csv(await response.text()).length,rows);
      if(route.includes('date='))assert.match(response.headers.get('content-disposition'),/2026-09-(09|16)/);
      assert.equal((await fetch(config.origin+'/api/'+route)).status,404);
    }
    assert.equal((await (await fetch(origin+'/api/history?date=2026-09-16')).json()).entries.length,3);
    const issues=await (await fetch(origin+'/api/issues?status=REJECTED')).json();assert.equal(issues.entries[0].student_id,'002');assert.equal(issues.entries[0].request_hash,undefined);
    for(const route of ['history?date=bad','issues?status=NOPE','detail.csv?date=2026-09-09&date=2026-09-16','issues.csv?status=ALL&status=REJECTED'])assert.equal((await fetch(origin+'/api/'+route)).status,400);
    assert.equal((await fetch(origin+'/api/export.csv?date=2026-09-10')).status,404);
    for(const route of ['history','issues'])assert.equal((await fetch(config.origin+'/api/'+route)).status,404);
  }finally{await Promise.all([admin,student].map(server=>new Promise(resolve=>server.close(resolve))));store.close();}
});
