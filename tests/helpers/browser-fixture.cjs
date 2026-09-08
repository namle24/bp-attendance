// Isolated browser test harness. Never imported by the production entry point.
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createApp}=require('../../web/app.cjs');
const {Store}=require('../../web/store.cjs');
const {SyncWorker}=require('../../web/sheets.cjs');
const {ranges}=require('../../web/security.cjs');
async function startFixture(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-browser-'));
  const key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const store=new Store(path.join(directory,'test.sqlite'));
  store.importRoster('MSSV,Họ tên,Email trường\n001,Nguyễn An,a@school.example\n002,Trần Bình,b@school.example','test');
  const config={origin:'',clientId:'test-client',domains:['school.example'],admins:['ta@school.example'],secret:'test-key-'.repeat(8),campusCidrs:['203.0.113.0/24'],campus:ranges(['203.0.113.0/24']),proxies:ranges(['127.0.0.1/32'])};
  const worker=new SyncWorker(store,{write:async()=>{}});
  const app=createApp(config,store,worker,{verifyGoogle:async credential=>JSON.parse(credential)});
  const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  config.origin='https://127.0.0.1:'+server.address().port;
  return {origin:config.origin,store,async context(browser,identity,viewport={width:1140,height:950}){
    const context=await browser.newContext({ignoreHTTPSErrors:true,extraHTTPHeaders:{'X-Forwarded-For':'203.0.113.8'},viewport});
    // Stub only the external identity provider in the test browser; the app's nonce,
    // cookie, Google-claim, roster, campus and CSRF checks still execute.
    await context.route('https://accounts.google.com/**',async route=>{
      if(route.request().url()!=='https://accounts.google.com/gsi/client')throw Error('Unexpected external request');
      await route.fulfill({contentType:'application/javascript',body:`window.google={accounts:{id:{initialize(options){this.options=options},renderButton(element){const button=document.createElement('button');button.className='secondary';button.textContent='Đăng nhập bằng Google';button.onclick=()=>this.options.callback({credential:JSON.stringify({...${JSON.stringify(identity)},aud:'test-client',iss:'https://accounts.google.com',hd:'school.example',email_verified:true,exp:Math.floor(Date.now()/1000)+3600,nonce:this.options.nonce})});element.append(button)}}}};`});
    });
    return context;
  },async close(){await new Promise(resolve=>server.close(resolve));store.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
module.exports={startFixture};
