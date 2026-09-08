const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../web/app.cjs');
const {Store}=require('../web/store.cjs');
const {SyncWorker}=require('../web/sheets.cjs');
const {ranges}=require('../web/security.cjs');

async function fixture(overrides={}){
  const now={value:Date.parse('2026-09-09T06:00:00Z')};
  const config={demo:false,origin:'https://attendance.school.example',clientId:'test-client',domains:['school.example'],admins:['ta@school.example'],secret:'k'.repeat(64),campusCidrs:['203.0.113.0/24'],campus:ranges(['203.0.113.0/24']),proxies:ranges(['127.0.0.1/32']),...overrides};
  const store=new Store(':memory:');store.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example\n002,Bình,b@school.example','test');
  const worker=new SyncWorker(store,null);
  const app=createApp(config,store,worker,{clock:()=>now.value,verifyGoogle:async token=>JSON.parse(token)});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base='http://127.0.0.1:'+server.address().port;
  function client(){
    const jar=new Map();let csrf='';
    return {
      async request(route,data,extra={}){
        const response=await fetch(base+route,{headers:{'X-Forwarded-For':'203.0.113.8',Origin:config.origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf}),...extra},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
        for(const raw of response.headers.getSetCookie()){const [key,value]=raw.split(';')[0].split('=');if(value)jar.set(key,value);else jar.delete(key);}
        const body=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();if(body.csrf)csrf=body.csrf;return {status:response.status,body};
      },
      async login(email='a@school.example',sub='g-a',delta={}){
        const b=await this.request('/api/bootstrap');assert.equal(b.status,200);
        const credential=JSON.stringify({aud:config.clientId,iss:'https://accounts.google.com',sub,email,email_verified:true,hd:'school.example',nonce:b.body.nonce,exp:now.value/1000+3600,...delta});
        const result=await this.request('/api/auth/google',{credential});
        if(result.status===200)await this.request('/api/bootstrap');return result;
      }
    };
  }
  return {config,store,now,client,close:async()=>{await new Promise(r=>server.close(r));store.close();}};
}
test('untrusted forwarded headers cannot spoof campus membership',async()=>{
  const f=await fixture({proxies:[]});try{
    assert.equal((await f.client().request('/api/bootstrap')).status,403);
    const page=await f.client().request('/',undefined,{Accept:'text/html'});assert.equal(page.status,403);assert.match(page.body,/Hãy kết nối Wi‑Fi USTH/);
  }finally{await f.close();}
});
test('trusted proxy checks closest untrusted hop, not attacker prepended campus IP',async()=>{
  const f=await fixture();try{
    const response=await f.client().request('/api/bootstrap',undefined,{'X-Forwarded-For':'203.0.113.8, 198.51.100.9'});
    assert.equal(response.status,403);assert.equal(response.body.code,'NETWORK_DENIED');
  }finally{await f.close();}
});
test('switching network after login blocks check-in; QR cannot be fetched by a student',async()=>{
  const f=await fixture();try{
    const admin=f.client();await admin.login('ta@school.example','g-ta');
    const opened=await admin.request('/api/admin/sessions',{date:'2026-09-09',minutes:5});assert.equal(opened.status,200);
    const sid=opened.body.session.id;const qr=(await admin.request('/api/admin/sessions/'+sid+'/qr')).body;
    const student=f.client();assert.equal((await student.login()).status,200);
    assert.equal((await student.request('/api/admin/sessions/'+sid+'/qr')).status,403);
    const denied=await student.request('/api/check-in',{token:qr.token},{'X-Forwarded-For':'198.51.100.1'});
    assert.equal(denied.status,403);assert.equal(f.store.sessions()[0].count,0);
    const accepted=await student.request('/api/check-in',{token:qr.token,studentId:'002'});
    assert.equal(accepted.status,200);assert.equal(accepted.body.receipt.studentId,'001');
    assert.equal((await student.request('/api/check-in',{token:qr.token})).body.receipt.duplicate,true);
    f.now.value+=30000;
    assert.equal((await student.request('/api/check-in',{token:qr.token})).body.code,'QR_EXPIRED');
    const fresh=(await admin.request('/api/admin/sessions/'+sid+'/qr')).body;
    await admin.request('/api/admin/sessions/'+sid+'/close',{});
    assert.equal((await student.request('/api/check-in',{token:fresh.token})).body.code,'SESSION_CLOSED');
  }finally{await f.close();}
});
test('wrong hosted domain, unverified email, nonce and unknown roster email cannot log in',async()=>{
  const f=await fixture();try{
    for(const delta of [{hd:'gmail.com'},{email_verified:false},{nonce:'attacker'},{aud:'another-app'}])assert.equal((await f.client().login('a@school.example','g-a',delta)).status,401);
    assert.equal((await f.client().login('outsider@school.example','g-x')).status,403);
  }finally{await f.close();}
});
test('cross-origin and missing CSRF requests cannot modify a session',async()=>{
  const f=await fixture();try{
    const admin=f.client();await admin.login('ta@school.example','g-ta');
    assert.equal((await admin.request('/api/admin/sessions',{date:'2026-09-09',minutes:5},{Origin:'https://evil.example'})).status,403);
    assert.equal((await admin.request('/api/admin/sessions',{date:'2026-09-09',minutes:5},{'X-CSRF-Token':''})).status,403);
    assert.equal(f.store.sessions().length,0);
    assert.equal((await admin.request('/api/demo/login',{kind:'admin'})).status,404);
  }finally{await f.close();}
});
test('one login nonce can only be consumed once, even with concurrent submissions',async()=>{
  const f=await fixture();try{
    const c=f.client(),b=(await c.request('/api/bootstrap')).body;
    const credential=JSON.stringify({aud:f.config.clientId,iss:'https://accounts.google.com',sub:'g-a',email:'a@school.example',email_verified:true,hd:'school.example',nonce:b.nonce,exp:f.now.value/1000+3600});
    const replies=await Promise.all([c.request('/api/auth/google',{credential}),c.request('/api/auth/google',{credential})]);
    assert.equal(replies.filter(r=>r.status===200).length,1);
  }finally{await f.close();}
});
test('removing a student revokes their existing session and health reports DB failure',async()=>{
  const f=await fixture();try{
    const student=f.client();assert.equal((await student.login()).status,200);
    f.store.importRoster('MSSV,Họ tên,Email trường\n002,Bình,b@school.example','ta');
    assert.equal((await student.request('/api/me/attendance')).status,403);
    assert.equal((await student.request('/readyz')).status,200);
    const prepare=f.store.db.prepare;
    f.store.db.prepare=()=>{throw Error('Simulated unavailable database');};
    try{assert.equal((await student.request('/readyz')).status,503);}finally{f.store.db.prepare=prepare;}
  }finally{await f.close();}
});
test('session quota resets after a minute and invalid cookies cannot allocate unlimited buckets',async()=>{
  const f=await fixture();try{
    const student=f.client();await student.login();
    let result;
    for(let i=0;i<240;i++)result=await student.request('/api/me/attendance');
    assert.equal(result.status,429);
    f.now.value+=60000;
    assert.equal((await student.request('/api/me/attendance')).status,200);
    // No challenge writes: use an authenticated-only route with 5,001 fake cookies.
    const stranger=f.client();
    for(let i=0;i<5001;i++)result=await stranger.request('/api/me/attendance',undefined,{Cookie:'__Host-bp_auth=fake-'+i});
    assert.equal(result.status,429);
  }finally{await f.close();}
});
test('700 students behind one campus IP can log in and submit with idempotent retries',async()=>{
  const f=await fixture();try{
    f.store.importRoster('MSSV,Họ tên,Email trường\n'+Array.from({length:700},(_,i)=>'S'+String(i).padStart(4,'0')+',Student '+i+',s'+i+'@school.example').join('\n'),'ta');
    const session=f.store.open('2026-09-09',8,'ta',f.now.value);
    const {issueQr}=require('../web/security.cjs');const qr=issueQr(session,f.config.secret,f.now.value);
    // Actual local HTTP + SQLite; Google verification and clock are simulated.
    for(let start=0;start<700;start+=100)await Promise.all(Array.from({length:100},async(_,j)=>{
      const i=start+j,c=f.client();assert.equal((await c.login('s'+i+'@school.example','sub-'+i)).status,200);
      const first=await c.request('/api/check-in',{token:qr.token});assert.equal(first.status,200);
      assert.equal((await c.request('/api/check-in',{token:qr.token})).body.receipt.duplicate,true);
    }));
    assert.equal(f.store.sessions()[0].count,700);assert.equal(f.store.matrix().length,703); // Previously enrolled students keep history rows.
  }finally{await f.close();}
});
