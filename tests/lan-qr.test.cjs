const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanStore}=require('../web/lan-store.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs');
const now=Date.parse('2026-09-09T06:00:00Z'),ip='192.168.2.3';
const body=(sid,grant,id='001')=>({sessionId:sid,studentId:id,name:'Nguyễn An',seat:'B-12',requestId:randomBytes(16).toString('hex'),scanTicket:grant});
test('rotating QR expires exactly at 30s; code and QR give an IP-bound three-minute admission',()=>{
  const store=new LanStore(':memory:');try{
    const session=store.open('2026-09-09',8,'TA',now),qr=store.currentQr(now);
    assert.equal(store.currentQr(now+29999).token,qr.token);assert.notEqual(store.currentQr(now+30000).token,qr.token);
    assert.throws(()=>store.scan({token:qr.token},ip,now+30000),e=>e.code==='QR_EXPIRED');
    assert.throws(()=>store.scan({code:qr.code},ip,now+30000),e=>e.code==='QR_EXPIRED');
    const admitted=store.scan({code:qr.code},ip,now+29999),input=body(session.id,admitted.scanTicket);
    assert.equal(admitted.expiresAt,now+29999+180000);
    assert.throws(()=>store.checkIn(input,'192.168.2.4',now+30000),e=>e.code==='SCAN_INVALID');
    assert.throws(()=>store.checkIn({...input,scanTicket:input.scanTicket.slice(0,-2)+'xx'},ip,now+30000),e=>e.code==='SCAN_INVALID');
    assert.throws(()=>store.checkIn({...input,scanTicket:undefined},ip,now+30000),e=>e.code==='SCAN_REQUIRED');
    const saved=store.checkIn(input,ip,now+60000);assert.equal(saved.duplicate,false);
    assert.throws(()=>store.checkIn(body(session.id,admitted.scanTicket,'002'),ip,now+60000),e=>e.code==='SCAN_USED');
    const other=store.scan({token:store.currentQr(now+60000).token},ip,now+60000);
    assert.throws(()=>store.checkIn(body(session.id,other.scanTicket,'002'),ip,other.expiresAt),e=>e.code==='SCAN_EXPIRED');
    store.closeSession(session.id,'TA',now+90000);
    assert.equal(store.checkIn(input,'192.168.2.4',now+600000).at,saved.at,'lost-response receipt recovery remains possible after expiry/closure/IP change');
    assert.equal(store.entries().length,1);
  }finally{store.close();}
});
test('admission and one-use binding survive a restart without changing historical records',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-qr-restart-')),filename=path.join(directory,'test.sqlite');let store=new LanStore(filename);
  try{
    const session=store.open('2026-09-09',8,'TA',now),qr=store.currentQr(now),grant=store.scan({token:qr.token},ip,now),input=body(session.id,grant.scanTicket);
    store.close();store=new LanStore(filename);assert.equal(store.currentQr(now).token,qr.token);store.checkIn(input,ip,now+1000);
    store.close();store=new LanStore(filename);assert.throws(()=>store.checkIn(body(session.id,grant.scanTicket,'002'),ip,now+2000),e=>e.code==='SCAN_USED');assert.equal(store.checkIn(input,ip,now+2000).duplicate,true);
  }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('public HTTP cannot obtain the current QR or bypass scanning; actual socket IP owns the admission',async()=>{
  const f=await startFixture();
  async function post(route,input){const response=await fetch(f.origin+route,{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};}
  try{
    const session=f.store.open(require('../web/security.cjs').today(),8,'TA'),input=body(session.id);
    assert.equal((await post('/api/check-in',input)).status,403);
    assert.equal((await fetch(f.origin+'/api/qr')).status,404);
    const info=await (await fetch(f.origin+'/api/session')).json();assert.equal(info.qr,undefined);assert.equal(info.token,undefined);
    const {qr}=await (await fetch(f.adminOrigin+'/api/qr')).json();assert.match(qr.url,/#code=/);
    const scan=await post('/api/scan',{token:qr.token,ip:'10.1.1.1'});assert.equal(scan.status,200);
    input.scanTicket=scan.body.scanTicket;assert.equal((await post('/api/check-in',input)).status,200);assert.equal(f.store.entries()[0].ip,'127.0.0.1');
    assert.equal((await post('/api/check-in',body(session.id,scan.body.scanTicket,'002'))).status,409);
  }finally{await f.close();}
});
