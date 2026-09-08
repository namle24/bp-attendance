const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {randomBytes}=require('node:crypto');
const {loadLanConfig}=require('../web/lan-config.cjs');
const {LanStore}=require('../web/lan-store.cjs');
test('production LAN server survives SIGKILL with receipts, seats, IP flags, TA decisions and local-only admin intact',async t=>{
  const available=Object.keys(os.networkInterfaces()).find(name=>{try{loadLanConfig({LAN_INTERFACE:name});return true;}catch{return false;}});
  if(!available)return t.skip('No private LAN interface available');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-lan-restart-')),database=path.join(dir,'test.sqlite');
  async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
  const env={PATH:process.env.PATH,PORT:String(await port()),ADMIN_PORT:String(await port()),LAN_INTERFACE:available,BP_DATABASE:database};
  const config=loadLanConfig(env);env.CAMPUS_CIDRS=config.host+'/32';let child;
  async function start(){
    child=spawn(process.execPath,['web/server.cjs'],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',chunk=>error+=chunk);
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error(error);
      try{if((await fetch(config.origin+'/readyz',{signal:AbortSignal.timeout(300)})).ok)return;}catch{}
      await new Promise(r=>setTimeout(r,30));
    }throw Error('Server did not start: '+error);
  }
  async function stop(signal){if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill(signal);await done;}}
  async function request(origin,route,data,csrf){const response=await fetch(origin+route,{...(data?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf||''},body:JSON.stringify(data)}:{})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}
  try{
    await start();const admin=config.adminOrigins[0],profile=await request(admin,'/api/dashboard');
    const {session}=await request(admin,'/api/sessions',{minutes:8},profile.csrf);
    const bodies=['001','002'].map((id,i)=>({sessionId:session.id,studentId:id,name:'Student '+id,seat:'B-'+(i+1),requestId:randomBytes(16).toString('hex')}));
    const before=await request(config.origin,'/api/check-in',bodies[0]);await request(config.origin,'/api/check-in',bodies[1]);
    const {entries}=await request(admin,'/api/entries');await request(admin,'/api/entries/'+entries[0].id+'/review',{review:'CONFIRMED',note:'Đã đối chiếu thẻ và ghế B-1',peers:2},profile.csrf);
    await assert.rejects(()=>fetch('http://'+config.host+':'+config.adminPort+'/api/dashboard',{signal:AbortSignal.timeout(500)}));
    await stop('SIGKILL');await start();
    const after=await request(config.origin,'/api/check-in',bodies[0]);assert.equal(after.receipt.at,before.receipt.at);assert.equal(after.receipt.duplicate,true);
    const recovered=await request(admin,'/api/entries');assert.deepEqual(recovered.entries.map(e=>e.status),['CONFIRMED','PENDING']);assert.equal(recovered.entries[0].seat,'B-1');assert.equal(recovered.entries[0].ip,config.host);
    const nextProfile=await request(admin,'/api/dashboard');assert.notEqual(nextProfile.csrf,profile.csrf);assert.equal(nextProfile.sync.enabled,false);
    await stop('SIGTERM');const db=new LanStore(database);assert.equal(db.db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.equal(db.entries().length,2);db.close();
  }finally{await stop('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
