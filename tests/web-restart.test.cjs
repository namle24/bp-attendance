const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const net=require('node:net');
const path=require('node:path');
const os=require('node:os');

test('actual server retains sessions and acknowledged attendance after SIGKILL',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'bp-restart-'));
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const origin='http://127.0.0.1:'+port;
  let child;
  async function start(){
    child=spawn(process.execPath,['web/server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,BP_MODE:'demo',PORT:String(port),PUBLIC_ORIGIN:origin,BP_DATABASE:path.join(temp,'test.sqlite'),QR_SECRET:'test-only-stable-key-'.repeat(4)},stdio:['ignore','pipe','pipe']});
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
  function client(){const jar=new Map();let csrf='';return {
    async request(route,data){const res=await fetch(origin+route,{headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
      for(const raw of res.headers.getSetCookie()){const [key,value]=raw.split(';')[0].split('=');if(value)jar.set(key,value);else jar.delete(key);}
      const body=await res.json();if(body.csrf)csrf=body.csrf;assert.equal(res.status,200,JSON.stringify(body));return body;},
    async login(kind){await this.request('/api/bootstrap');await this.request('/api/demo/login',{kind});return this.request('/api/bootstrap');}
  };}
  try{
    await start();const admin=client(),student=client();const profile=await admin.login('admin');await student.login('student');
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
