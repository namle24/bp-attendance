const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const https=require('node:https');
const net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {createApp}=require('../web/app.cjs');
const {Store}=require('../web/store.cjs');
const {SyncWorker}=require('../web/sheets.cjs');
const {ranges}=require('../web/security.cjs');
const caddy=path.resolve(__dirname,'../data/bin/caddy');
test('Caddy serves verified local TLS and overwrites a forged campus forwarding header',{skip:!fs.existsSync(caddy)},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-proxy-')),cert=path.join(dir,'cert.pem'),key=path.join(dir,'key.pem');
  const store=new Store(':memory:');let child,server;
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=attendance.school.example','-addext','subjectAltName=DNS:attendance.school.example'],{stdio:'ignore'});
    const config={origin:'https://attendance.school.example',clientId:'unused',domains:['school.example'],admins:[],secret:'test-key-'.repeat(8),campus:ranges(['203.0.113.0/24']),proxies:ranges(['127.0.0.1/32'])};
    const app=createApp(config,store,new SyncWorker(store,null));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
    const port=reservation.address().port;await new Promise(r=>reservation.close(r));
    const file=path.join(dir,'Caddyfile');
    fs.writeFileSync(file,fs.readFileSync(path.resolve(__dirname,'../deploy/Caddyfile.lan'),'utf8').replace('127.0.0.1:4180','127.0.0.1:'+server.address().port));
    const env={...process.env,ATTENDANCE_HOST:'attendance.school.example',ATTENDANCE_PORT:String(port),LAPTOP_LAN_IP:'127.0.0.1',ATTENDANCE_CERT_FILE:cert,ATTENDANCE_KEY_FILE:key,XDG_DATA_HOME:dir,XDG_CONFIG_HOME:dir};
    execFileSync(caddy,['validate','--config',file,'--adapter','caddyfile'],{env,stdio:'pipe',timeout:10000});
    child=spawn(caddy,['run','--config',file,'--adapter','caddyfile'],{env,stdio:['ignore','ignore','pipe']});
    let log='';child.stderr.on('data',b=>{log+=b;});
    function request(route,headers={}){return new Promise((resolve,reject)=>{
      const req=https.get({hostname:'127.0.0.1',port,path:route,servername:'attendance.school.example',ca:fs.readFileSync(cert),headers:{Host:'attendance.school.example:'+port,...headers}},res=>{let body='';res.on('data',b=>{body+=b;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));});
      req.setTimeout(1000,()=>req.destroy(Error('timeout')));req.on('error',reject);
    });}
    const deadline=Date.now()+10000;let ready;
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw Error('Caddy stopped: '+log);
      try{ready=await request('/readyz');break;}catch{await new Promise(r=>setTimeout(r,50));}
    }
    assert.equal(ready?.status,200);
    const forged=await request('/api/bootstrap',{'X-Forwarded-For':'203.0.113.8','X-Real-IP':'203.0.113.8'});
    assert.equal(forged.status,403);assert.equal(forged.body.code,'NETWORK_DENIED');
    const direct=await fetch('http://127.0.0.1:'+server.address().port+'/api/bootstrap',{headers:{'X-Forwarded-For':'203.0.113.8'}});
    assert.equal(direct.status,200,'Control request confirms the server accepts the configured proxy header before Caddy overwrites it');
  }finally{
    if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}
    if(server)await new Promise(r=>server.close(r));store.close();fs.rmSync(dir,{recursive:true,force:true});
  }
});
