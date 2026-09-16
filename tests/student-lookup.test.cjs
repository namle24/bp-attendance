const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanStore}=require('../web/lan-store.cjs');
const {StudentLookup,parseResults,sourceInput}=require('../web/student-lookup.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs');
const source={spreadsheetId:'abcdefghijklmnop12345',tab:'Offline'};
const values=[['MSSV','Họ tên','Email trường','2026-09-16','09/09/2026'],['001','Private name','private@example.invalid','Đã gửi 2/3 đợt',''],['AB-02','Another name','','OFF','ON']];

test('lookup parses the TA matrix and long format without personal columns or inferred absences',()=>{
  const rows=parseResults(values);assert.deepEqual(rows[0],{id:'001',days:[{date:'2026-09-16',result:'Đã gửi 2/3 đợt'},{date:'2026-09-09',result:''}]});
  assert.doesNotMatch(JSON.stringify(rows),/Private|@|Họ tên/);
  assert.deepEqual(parseResults([['Mã sinh viên','Ngày','Kết quả'],['ab-02','16/09/2026','TA xác nhận'],['AB-02','09/09/2026','V']]),[{id:'AB-02',days:[{date:'2026-09-16',result:'TA xác nhận'},{date:'2026-09-09',result:'V'}]}]);
  for(const rows of [[],[['MSSV','Họ tên'],['001','An']],[...values,values[1]],[['MSSV','2026-09-16','16/09/2026']],[['MSSV','Ngày','Kết quả'],['001','30/02/2026','OFF']],[['MSSV','2026-09-16'],['001','x'.repeat(201)]]])assert.throws(()=>parseResults(rows));
});
test('lookup source accepts only Google spreadsheet IDs/URLs and prevents writer conflicts',()=>{
  assert.deepEqual(sourceInput({spreadsheetId:'https://docs.google.com/spreadsheets/d/'+source.spreadsheetId+'/edit?gid=0',tab:'Offline'}),{...source,gid:'0'});
  assert.deepEqual(sourceInput({spreadsheetId:'https://docs.google.com/spreadsheets/d/'+source.spreadsheetId+'/edit#gid=123',tab:'Offline'}),{...source,gid:'123'});
  for(const spreadsheetId of ['http://127.0.0.1/secrets','https://docs.google.com.evil.invalid/spreadsheets/d/'+source.spreadsheetId,'https://docs.google.com/document/d/'+source.spreadsheetId])assert.throws(()=>sourceInput({spreadsheetId,tab:'Offline'}));
  const store=new LanStore(':memory:');try{const lookup=new StudentLookup(store,{writerConfig:{spreadsheetId:source.spreadsheetId,sheetTitle:'Offline'}});assert.throws(()=>lookup.configure(source,'TA'),e=>e.code==='LOOKUP_WRITER_CONFLICT');}finally{store.close();}
});
test('public CSV reads preserve mixed MSSVs and select the exact gid without credentials',async()=>{
  const store=new LanStore(':memory:');try{
    const lookup=new StudentLookup(store,{fetch:async(url,options)=>{
      assert.equal(url.origin,'https://docs.google.com');assert.equal(url.searchParams.get('gid'),'0');assert.match(url.pathname,/\/export$/);assert.equal(options.cache,'no-store');
      return new Response('"MSSV","Họ tên","2026-09-16"\r\n"001","Private","2/3"\r\n"23BA12345","Private","OFF"\r\n"2453366","Private","ON"',{headers:{'content-type':'text/csv; charset=utf-8'}});
    }});
    lookup.configure({...source,gid:'0'},'TA');await lookup.sync();
    for(const id of ['001','23BA12345','2453366'])assert.equal(lookup.search(id).found,true);
  }finally{store.close();}
});
test('Sheet snapshots refresh atomically, preserve stale data on failure and survive restart',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-lookup-')),filename=path.join(dir,'test.sqlite');let store=new LanStore(filename),now=1789538000000;
  try{
    let incoming=values;const lookup=new StudentLookup(store,{clock:()=>now,fetchValues:async()=>incoming});
    assert.throws(()=>lookup.search('001'),e=>e.code==='LOOKUP_NOT_CONFIGURED');lookup.configure(source,'TA');
    assert.throws(()=>lookup.search('001'),e=>e.code==='LOOKUP_NOT_READY');await lookup.sync();
    assert.equal(lookup.search(' 001 ').days[0].result,'Đã gửi 2/3 đợt');assert.equal(lookup.search('00').found,false);
    for(const id of ['',null,{},'001 OR 1=1'])assert.throws(()=>lookup.search(id),e=>e.code==='ID_INVALID');
    incoming=[values[0],['001','Secret','','TA đã xác nhận','']];now+=60000;await lookup.sync();assert.equal(lookup.search('001').days[0].result,'TA đã xác nhận');assert.equal(lookup.search('AB-02').found,false);
    incoming=[['Broken header']];await lookup.sync();assert.equal(lookup.search('001').stale,true);assert.equal(lookup.search('001').updatedAt,now);
    assert.equal(lookup.search('001').days[0].result,'TA đã xác nhận');
    store.close();store=new LanStore(filename);const restarted=new StudentLookup(store,{clock:()=>now+130000});
    assert.equal(restarted.search('001').days[0].result,'TA đã xác nhận');assert.equal(restarted.search('001').stale,true);
    restarted.configure({...source,tab:'Other'},'TA');assert.throws(()=>restarted.search('001'),e=>e.code==='LOOKUP_NOT_READY');
  }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('concurrent reads share one refresh and a changed source never receives the old response',async()=>{
  const store=new LanStore(':memory:');try{
    let release,calls=0;const lookup=new StudentLookup(store,{fetchValues:async s=>{calls++;if(s.tab==='Offline')return new Promise(r=>{release=r;});return [values[0],['NEW','','','Updated','']];}});
    lookup.configure(source,'TA');const first=lookup.sync();assert.equal(lookup.sync(),first);await Promise.resolve();
    lookup.configure({...source,tab:'Other'},'TA');release(values);await first;while(lookup.busy)await lookup.busy;
    assert.equal(calls,2);assert.equal(lookup.search('001').found,false);assert.equal(lookup.search('NEW').days[0].result,'Updated');
  }finally{store.close();}
});
test('lookup API exposes one exact ID, preserves LAN gates and keeps configuration TA-only',async()=>{
  const f=await startFixture();try{
    f.lookup.fetchValues=async()=>values;
    const d=await fetch(f.adminOrigin+'/api/dashboard').then(r=>r.json());
    const post=(origin,route,body,csrf)=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(body)});
    assert.equal((await post(f.adminOrigin,'/api/lookup-source',source)).status,403);
    assert.equal((await post(f.origin,'/api/lookup-source',source)).status,404);
    assert.equal((await post(f.adminOrigin,'/api/lookup-source',source,d.csrf)).status,200);while(f.lookup.busy)await f.lookup.busy;
    const response=await post(f.origin,'/api/student-history',{studentId:'001'});assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.equal(result.studentId,'001');assert.equal(result.days.length,2);
    assert.doesNotMatch(JSON.stringify(result),/Private|Another|AB-02|@|ip|secret|request_hash|spreadsheetId/);
    assert.equal((await fetch(f.origin+'/api/student-history')).status,404);
    assert.equal((await fetch(f.origin+'/api/student-history',{method:'POST',headers:{Origin:'https://outside.invalid','Content-Type':'application/json'},body:'{"studentId":"001"}'})).status,403);
    assert.equal((await fetch(f.origin+'/api/lookup-source')).status,404);
    assert.equal((await fetch(f.origin+'/history')).status,200);
    const requests=await Promise.all(Array.from({length:700},()=>post(f.origin,'/api/student-history',{studentId:'001'})));
    assert.ok(requests.every(r=>r.status===200));
  }finally{await f.close();}
});
