const test=require('node:test'),assert=require('node:assert/strict'),{randomBytes,createHash}=require('node:crypto'),http=require('node:http'),{gunzipSync}=require('node:zlib');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs'),{client}=require('./helpers/lan-http-client.cjs'),{today}=require('../web/security.cjs');
const body=(round,grant,id='001')=>({sessionId:round.id,scanTicket:grant.scanTicket,requestId:randomBytes(16).toString('hex'),studentId:id,name:'Synthetic Student'});
test('browser lock is transactional, survives fresh scans/reopening, and allows new rounds; IP peers remain flagged',async()=>{
  const f=await startFixture();try{
    const round=f.store.open(today(),8,'TA'),one=client(f.origin),two=client(f.origin),three=client(f.origin);
    const code=f.store.currentQr().code,a=(await one.request('/api/scan',{code})).body,b=(await one.request('/api/scan',{code})).body;
    await two.request('/api/session');
    assert.equal((await two.request('/api/check-in',body(round,a))).body.code,'DEVICE_CHANGED','Copied grant cannot move to another cookie');
    const first=body(round,a),other=body(round,b,'002');
    const results=await Promise.all([one.request('/api/check-in',first),one.request('/api/check-in',other)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.store.entries().length,1);
    const accepted=results[0].status===200?first:other;
    assert.equal((await one.request('/api/check-in',accepted)).body.receipt.duplicate,true);
    const again=(await one.request('/api/scan',{code})).body;assert.equal(again.receipt.studentId,accepted.studentId);
    assert.equal((await one.request('/api/check-in',body(round,again,'003'))).body.code,'DEVICE_RECORDED');
    const newGrant=(await two.request('/api/scan',{code})).body;
    assert.equal((await two.request('/api/check-in',body(round,newGrant,accepted.studentId))).body.code,'ALREADY_RECORDED');
    assert.equal((await two.request('/api/check-in',body(round,newGrant,'004'))).status,200);
    assert.ok(f.store.entries().every(r=>r.peers===2&&r.status==='PENDING'&&r.seat===''));
    assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM lan_attendance_locations').get().n,0);
    const fresh=(await three.request('/api/session')).body;assert.equal(fresh.receipt,null,'Other browser cannot retrieve private receipt');
    assert.equal((await three.request('/api/check-in',accepted)).body.code,'DEVICE_CHANGED');
    f.store.closeSession(round.id,'TA');assert.equal((await one.request('/api/check-in',accepted)).status,200);
    f.store.reopen(round.id,8,'TA');assert.equal((await one.request('/api/check-in',body(round,(await one.request('/api/scan',{code:f.store.currentQr().code})).body,'005'))).body.code,'DEVICE_RECORDED');
    f.store.closeSession(round.id,'TA');const next=f.store.open(today(),8,'TA');
    assert.equal((await one.request('/api/session')).body.receipt,null);
    assert.equal((await one.request('/api/check-in',body(next,(await one.request('/api/scan',{code:f.store.currentQr().code})).body,accepted.studentId))).status,200);
  }finally{await f.close();}
});
test('missing/tampered cookies cannot bypass device admission',async()=>{
  const f=await startFixture();try{
    const round=f.store.open(today(),8,'TA'),one=client(f.origin),grant=(await one.request('/api/scan',{code:f.store.currentQr().code})).body;
    for(const cookie of ['',one.cookie.slice(0,-1)+'!',one.cookie+'; '+one.cookie]){
      const r=await fetch(f.origin+'/api/check-in',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body(round,grant))});
      assert.equal(r.status,403);assert.equal((await r.json()).code,'COOKIES_REQUIRED');
    }
    assert.equal(f.store.entries().length,0);
  }finally{await f.close();}
});
test('simple form uses live QR, signed CSRF and same browser lock without JavaScript; lost replies can retry after closing',async()=>{
  const f=await startFixture();try{
    const round=f.store.open(today(),8,'TA'),page=await fetch(f.origin+'/simple'),cookie=page.headers.get('set-cookie').split(';')[0],html=await page.text();
    const fields=Object.fromEntries([...html.matchAll(/name="(formToken|requestId|sessionId)" value="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    const input={...fields,code:f.store.currentQr().code,studentId:'001',name:'Nguyễn An'};
    const submit=(values,origin=f.origin)=>fetch(f.origin+'/simple',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
    assert.equal((await submit(input,'https://evil.example')).status,403);
    assert.equal((await submit({...input,formToken:'invalid'})).status,403);
    assert.equal((await submit({...input,code:'WRONG123'})).status,410);
    const sent=await submit(input,'null');assert.equal(sent.status,200);assert.match(await sent.text(),/Đã ghi nhận/);assert.equal(f.store.entries().length,1);
    f.store.closeSession(round.id,'TA');assert.equal((await submit(input)).status,200);assert.equal(f.store.entries().length,1);
    f.store.reopen(round.id,8,'TA');assert.equal((await submit({...input,studentId:'002',requestId:randomBytes(16).toString('hex'),code:f.store.currentQr().code})).status,409);
    assert.equal((await fetch(f.origin+'/simple',{headers:{Cookie:cookie}}).then(r=>r.text())).includes('<form'),false);
    assert.equal(f.store.entries().length,1);
  }finally{await f.close();}
});
test('student documents contain their critical assets, valid CSP hashes and gzip; diagnosis is TA-only and redacts queries',async()=>{
  const f=await startFixture();try{
    for(const path of ['/','/history']){
      const r=await fetch(f.origin+path),html=await r.text(),csp=r.headers.get('content-security-policy');
      assert.equal(r.status,200);assert.doesNotMatch(html,/<script src=|<link rel="stylesheet"|location-client/);
      for(const tag of ['style','script'])for(const match of html.matchAll(new RegExp('<'+tag+'>([\\s\\S]*?)</'+tag+'>','g')))assert.ok(csp.includes("'sha256-"+createHash('sha256').update(match[1]).digest('base64')+"'"));
      assert.ok(Buffer.byteLength(html)<100000);
      const raw=await new Promise((resolve,reject)=>http.get(f.origin+path,{headers:{'Accept-Encoding':'gzip'}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({headers:res.headers,data:Buffer.concat(chunks)}));}).on('error',reject));
      assert.equal(raw.headers['content-encoding'],'gzip');assert.equal(gunzipSync(raw.data).toString(),html);assert.ok(raw.data.length<35000);
    }
    await fetch(f.origin+'/?code=SHOULD_NOT_BE_LOGGED&name=PRIVATE');await fetch(f.origin+'/api/session');
    assert.equal((await fetch(f.origin+'/api/connections')).status,404);
    const info=await fetch(f.adminOrigin+'/api/connections').then(r=>r.json());assert.equal(info.rows.length,1);assert.equal(info.rows[0].api,true);assert.doesNotMatch(JSON.stringify(info),/SHOULD_NOT|PRIVATE|cookie|MSSV/);
  }finally{await f.close();}
});
