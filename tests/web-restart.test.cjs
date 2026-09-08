const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const net=require('node:net');
const path=require('node:path');
const os=require('node:os');
const {Store}=require('../web/store.cjs');
const {hash}=require('../web/security.cjs');

test('historical Google storage retains sessions and acknowledged attendance after SIGKILL',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'bp-restart-'));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin='http://127.0.0.1:'+port;
  const publicOrigin='https://attendance.school.example',database=path.join(temp,'test.sqlite');
  const store=new Store(database);
  store.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example','test');
  const identities={admin:{email:'ta@school.example',sub:'g-ta'},student:{email:'a@school.example',sub:'g-a'}};
  const sessions={};
  for(const [kind,identity] of Object.entries(identities)){
    if(kind==='student')store.bindStudent(identity);
    const challenge=store.challenge();sessions[kind]=store.authenticate(hash(challenge.token),identity);
  }
  store.close();let child;
  async function start(){
    child=spawn(process.execPath,['tests/helpers/legacy-server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_ORIGIN:publicOrigin,BP_DATABASE:database,GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_HOSTED_DOMAINS:'school.example',ADMIN_EMAILS:'ta@school.example',CAMPUS_CIDRS:'203.0.113.0/24',TRUSTED_PROXY_CIDRS:'127.0.0.1/32',GOOGLE_SHEET_ID:'test-sheet',GOOGLE_APPLICATION_CREDENTIALS:path.join(temp,'absent.json'),QR_SECRET:'test-only-stable-key-'.repeat(4)},stdio:['ignore','pipe','pipe']});
    let error='';child.stderr.on('data',chunk=>{error+=chunk;});
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error('Server failed: '+error);
      try{if((await fetch(origin+'/readyz',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}
      await new Promise(resolve=>setTimeout(resolve,30));
    }
    throw Error('Server startup timeout: '+error);
  }
  async function stop(signal){if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill(signal);await done;}}
  function client(kind){const jar=new Map([['__Host-bp_auth',sessions[kind].token]]);let csrf=sessions[kind].csrf;return {
    async request(route,data){const res=await fetch(origin+route,{headers:{Origin:publicOrigin,'X-Forwarded-For':'203.0.113.8',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
      for(const raw of res.headers.getSetCookie()){const [key,value]=raw.split(';')[0].split('=');if(value)jar.set(key,value);else jar.delete(key);}
      const body=await res.json();if(body.csrf)csrf=body.csrf;assert.equal(res.status,200,JSON.stringify(body));return body;},
    async login(){return this.request('/api/bootstrap');}
  };}
  try{
    await start();const admin=client('admin'),student=client('student');const profile=await admin.login('admin');await student.login('student');
    const {session}=await admin.request('/api/admin/sessions',{date:profile.today,minutes:5});
    const qr=await admin.request('/api/admin/sessions/'+session.id+'/qr');
    const before=await student.request('/api/check-in',{token:qr.token});assert.equal(before.receipt.duplicate,false);
    await stop('SIGKILL');await start();
    // Existing signed-in cookies, QR and roster bindings survive the process loss.
    const after=await student.request('/api/check-in',{token:qr.token});
    assert.equal(after.receipt.duplicate,true);assert.equal(after.receipt.at,before.receipt.at);
    assert.equal((await admin.request('/api/admin/dashboard')).sessions[0].count,1);
    assert.equal((await student.request('/api/me/attendance')).records.length,1);
  }finally{await stop('SIGTERM');rmSync(temp,{recursive:true,force:true});}
});
