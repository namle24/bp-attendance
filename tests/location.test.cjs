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
test('retiring location ignores saved settings and submitted GPS, preserving historical evidence on restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-geo-')),file=path.join(dir,'test.sqlite');let store=new LanStore(file);
  try{
    store.setMeta('locationPolicy',JSON.stringify({...center,date:'2026-09-17'}));
    const round=store.open('2026-09-18',8,'TA',now);assert.equal(store.roundLocation(round.id).enabled,false);
    store.submit(payload(round.id,'001',sample),'192.168.2.3',now+1000);
    const old=store.entries()[0];store.db.prepare('INSERT INTO lan_attendance_locations VALUES (?,?,?,?,?,?)').run(old.id,'OUTSIDE',1100,8,100,'Bằng chứng cũ ngoài phạm vi');
    store.db.prepare('UPDATE lan_round_locations SET policy=? WHERE round_id=?').run(JSON.stringify(center),round.id);
    store.submit(payload(round.id,'002',{status:'DENIED'}),'192.168.2.4',now+2000);
    assert.equal(store.entries()[1].location_status,null);assert.equal(store.entries()[1].status,'RECORDED');
    assert.equal(store.entries()[0].status,'PENDING');assert.match(store.report('detail').csv,/Ngoài phạm vi/);
    const snapshot=store.snapshot();store.close();store=new LanStore(file);assert.deepEqual(store.snapshot(),snapshot);
    store.closeSession(round.id,'TA',now+3000);store.reopen(round.id,8,'TA',now+4000);
    store.submit(payload(round.id,'003',{status:'DENIED'}),'192.168.2.5',now+5000);assert.equal(store.entries()[2].status,'RECORDED');
    const next=store.open('2026-09-19',8,'TA',now+86400000);assert.equal(store.roundLocation(next.id).enabled,false);
  }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('location settings APIs are retired and public admission always has location off',async()=>{
  const f=await startFixture();try{
    const d=await fetch(f.adminOrigin+'/api/dashboard').then(r=>r.json());
    assert.equal((await fetch(f.adminOrigin+'/api/location-config')).status,404);
    assert.equal((await fetch(f.adminOrigin+'/api/location-config',{method:'POST',headers:{Origin:f.adminOrigin,'Content-Type':'application/json','X-CSRF-Token':d.csrf},body:JSON.stringify(center)})).status,404);
    const round=f.store.open(require('../web/security.cjs').today(),8,'TA');
    const student=require('./helpers/lan-http-client.cjs').client(f.origin),grant=await student.request('/api/scan',{code:f.store.currentQr().code});
    assert.equal(grant.body.session.location.enabled,false);
    const result=await student.request('/api/check-in',{...payload(round.id,'001',sample),scanTicket:grant.body.scanTicket});
    assert.equal(result.status,200);assert.equal(result.body.receipt.location,undefined);
  }finally{await f.close();}
});
