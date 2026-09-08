// Isolated disk database; production student/admin handlers, real HTTP and socket IPs.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LanStore}=require('../../web/lan-store.cjs');
const {createStudentApp,createAdminApp}=require('../../web/lan-app.cjs');
const {SyncWorker}=require('../../web/sheets.cjs');
const {ranges}=require('../../web/security.cjs');
async function startFixture(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-lan-browser-')),store=new LanStore(path.join(directory,'test.sqlite'));
  const config={origin:'',adminOrigins:[],campus:ranges(['127.0.0.1/32']),campusCidrs:['127.0.0.1/32'],network:'Wi-Fi'},worker=new SyncWorker(store,null);
  const start=app=>new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  const student=await start(createStudentApp(config,store)),admin=await start(createAdminApp(config,store,worker));
  config.origin='http://127.0.0.1:'+student.address().port;config.adminOrigins=['http://127.0.0.1:'+admin.address().port];
  return {origin:config.origin,adminOrigin:config.adminOrigins[0],store,async close(){await Promise.all([student,admin].map(s=>new Promise(r=>s.close(r))));store.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
module.exports={startFixture};
