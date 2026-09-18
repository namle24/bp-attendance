const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanStore}=require('../web/lan-store.cjs'),geo=require('../web/location.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs');
const now=Date.parse('2026-09-18T06:00:00Z'),center={enabled:true,latitude:21,longitude:105,accuracy:5,radius:100};
const sample={status:'OK',latitude:21,longitude:105,accuracy:8,ageMs:0};
const payload=(sid,id,location)=>({sessionId:sid,studentId:id,name:'Synthetic Student',seat:'B-2',requestId:randomBytes(16).toString('hex'),location});
test('geofence accounts for both uncertainties and never accepts missing, stale or forged verdicts',()=>{
  assert.equal(geo.evaluate(center,sample).status,'INSIDE');
  assert.equal(geo.evaluate(center,{...sample,latitude:21.01}).status,'OUTSIDE');
  assert.equal(geo.evaluate(center,{...sample,latitude:21.0009}).status,'UNCERTAIN');
  assert.equal(geo.evaluate(center,{...sample,accuracy:1000}).status,'UNCERTAIN');
  assert.equal(geo.evaluate(center,{...sample,ageMs:60001}).status,'STALE');
  assert.equal(geo.evaluate(center,null).status,'MISSING');
  for(const status of ['DENIED','TIMEOUT','UNAVAILABLE','UNSUPPORTED'])assert.equal(geo.evaluate(center,{status}).status,status);
  for(const input of [{status:'INSIDE',distance:0},{...sample,latitude:91},{...sample,accuracy:-1},{...sample,longitude:NaN}])assert.equal(geo.evaluate(center,input).status,'INVALID');
  assert.equal(geo.evaluate({enabled:false},sample).status,'OFF');
  assert.ok(geo.distance({latitude:0,longitude:179.999},{latitude:0,longitude:-179.999})<223);
  for(const input of [{}, {...center,radius:1},{...center,accuracy:51},{...center,latitude:'21'}])assert.throws(()=>geo.policy(input));
});
test('outside locations become review cases, Sheets flags and exports; TA decisions and retries remain authoritative',()=>{
  const store=new LanStore(':memory:');try{
    store.configureLocation(center,'TA',now);const round=store.open('2026-09-18',8,'TA',now);
    const body=payload(round.id,'001',{...sample,latitude:21.01});
    const receipt=store.submit(body,'192.168.2.3',now+1000);assert.equal(receipt.status,'PENDING');assert.equal(receipt.location.status,'OUTSIDE');
    store.submit(payload(round.id,'002',sample),'192.168.2.4',now+1000);
    store.submit(payload(round.id,'003'),'192.168.2.5',now+1000);
    assert.deepEqual(store.entries().map(r=>r.status),['PENDING','RECORDED','PENDING']);assert.equal(store.snapshot().red.length,2);
    assert.match(store.issues().entries[0].reason,/ngoài phạm vi/);assert.match(store.report('detail').csv,/Ngoài phạm vi/);
    assert.doesNotMatch(JSON.stringify(store.entries()),/latitude|longitude/);assert.equal(store.db.prepare('PRAGMA table_info(lan_attendance_locations)').all().some(c=>/latitude|longitude/.test(c.name)),false);
    assert.equal(store.submit({...body,location:sample},'192.168.2.3',now+2000).location.status,'OUTSIDE');
    const entry=store.entries()[0];store.reviewEntry(entry.id,'CONFIRMED','Đã đối chiếu tại ghế',1,'TA',now+3000);
    assert.equal(store.entries()[0].status,'CONFIRMED');assert.equal(store.snapshot().red.length,1);
    store.submit(payload(round.id,'004',sample),'192.168.2.3',now+4000);assert.equal(store.entries()[0].status,'PENDING');
    assert.match(store.issues().entries[0].reason,/Trùng IP/);assert.doesNotMatch(store.issues().entries[0].reason,/ngoài phạm vi/);
  }finally{store.close();}
});
test('a round freezes its location policy, reopening preserves it and another date requires confirmation',()=>{
  const store=new LanStore(':memory:');try{
    const first=store.open('2026-09-18',8,'TA',now);store.closeSession(first.id,'TA',now+1000);
    store.configureLocation(center,'TA',now+2000);const second=store.open('2026-09-18',8,'TA',now+2000);
    assert.equal(store.roundLocation(first.id).enabled,false);assert.equal(store.roundLocation(second.id).radius,100);
    assert.throws(()=>store.configureLocation({enabled:false},'TA',now+3000),e=>e.code==='ROUND_ACTIVE');
    store.closeSession(second.id,'TA',now+4000);store.configureLocation({...center,radius:200},'TA',now+5000);
    store.reopen(second.id,8,'TA',now+6000);assert.equal(store.roundLocation(second.id).radius,100);
    assert.throws(()=>store.open('2026-09-19',8,'TA',now+86400000),e=>e.code==='LOCATION_SETUP_REQUIRED');
    store.configureLocation({...center,radius:200},'TA',now+86400000);const third=store.open('2026-09-19',8,'TA',now+86400000);assert.equal(store.roundLocation(third.id).radius,200);
  }finally{store.close();}
});
test('location evidence survives restart with no changes to existing non-location attendance',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-geo-')),file=path.join(dir,'test.sqlite');let store=new LanStore(file);
  try{
    const first=store.open('2026-09-18',8,'TA',now);store.submit(payload(first.id,'001'),'192.168.2.3',now+1000);store.closeSession(first.id,'TA',now+2000);
    store.configureLocation(center,'TA',now+3000);const second=store.open('2026-09-18',8,'TA',now+3000);store.submit(payload(second.id,'001',{status:'DENIED'}),'192.168.2.3',now+4000);
    const snapshot=store.snapshot();store.close();store=new LanStore(file);assert.deepEqual(store.snapshot(),snapshot);assert.equal(store.entries(first.id)[0].status,'RECORDED');assert.equal(store.entries(second.id)[0].location_status,'DENIED');
  }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('location configuration stays TA-only; QR/LAN admission still required and public policy omits class coordinates',async()=>{
  const f=await startFixture();try{
    const d=await fetch(f.adminOrigin+'/api/dashboard').then(r=>r.json());
    const post=(origin,route,body,csrf)=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})},body:JSON.stringify(body)});
    assert.equal((await post(f.adminOrigin,'/api/location-config',center)).status,403);
    assert.equal((await fetch(f.origin+'/api/location-config')).status,404);
    assert.equal((await post(f.adminOrigin,'/api/location-config',center,d.csrf)).status,200);
    const round=(await (await post(f.adminOrigin,'/api/sessions',{minutes:8},d.csrf)).json()).session;
    const info=await fetch(f.origin+'/api/session').then(r=>r.json());assert.equal(info.session.location.enabled,true);assert.doesNotMatch(JSON.stringify(info),/latitude|longitude/);
    const body=payload(round.id,'001',sample);assert.equal((await post(f.origin,'/api/check-in',body)).status,403);
    const qr=(await fetch(f.adminOrigin+'/api/qr').then(r=>r.json())).qr;
    const grant=await (await post(f.origin,'/api/scan',{code:qr.code})).json();assert.doesNotMatch(JSON.stringify(grant),/latitude|longitude/);
    body.scanTicket=grant.scanTicket;const response=await post(f.origin,'/api/check-in',body);assert.equal(response.status,200);assert.equal((await response.json()).receipt.location.status,'INSIDE');
    assert.equal((await post(f.adminOrigin,'/api/location-config',{enabled:false},d.csrf)).status,409);
  }finally{await f.close();}
});
