const {loadLanConfig}=require('./lan-config.cjs');
const {LanStore}=require('./lan-store.cjs');
const {createStudentApp,createAdminApp}=require('./lan-app.cjs');
const {SheetsWriter,SyncWorker}=require('./sheets.cjs');
const {listen:listenHTTP}=require('./listener.cjs');
async function main(){
  const config=loadLanConfig(),store=new LanStore(config.database);
  const worker=new SyncWorker(store,config.spreadsheetId?new SheetsWriter(config,store):null);
  const servers=[];let timer,stopping=false;
  function listen(app,port,host){return new Promise((resolve,reject)=>{
    const server=listenHTTP(app,port,host);servers.push(server);
    server.headersTimeout=15000;server.requestTimeout=20000;server.keepAliveTimeout=5000;server.setTimeout(30000,socket=>socket.destroy());
    server.once('error',reject);server.once('listening',()=>{server.on('error',error=>{console.error('Lỗi server: '+error.code);void stop(1);});resolve(server);});
  });}
  async function stop(code=0){
    if(stopping)return;stopping=true;clearInterval(timer);
    const deadline=setTimeout(()=>process.exit(1),35000);deadline.unref();
    await Promise.all(servers.map(server=>new Promise(resolve=>{if(!server.listening)return resolve();server.close(resolve);})));
    while(worker.busy)await new Promise(resolve=>setTimeout(resolve,100));
    store.close();clearTimeout(deadline);process.exitCode=code;
  }
  try{
    await listen(createAdminApp(config,store,worker),config.adminPort,'127.0.0.1');
    await listen(createStudentApp(config,store),config.port,config.host);
    timer=setInterval(()=>void worker.sync(),15000);timer.unref();
    console.log('Sinh viên: '+config.origin+' · '+config.network+' · '+config.campusCidrs.join(', '));
    console.log('TA trên laptop: '+config.adminOrigins[0]);
    console.log(config.spreadsheetId?'Sheets: đồng bộ theo lô; xem trạng thái trên trang TA.':'Sheets chưa cấu hình. Điểm danh lưu trên laptop; TA tải CSV hoặc cấu hình Sheets để đồng bộ sau.');
    process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
  }catch(error){await stop(1);throw error;}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
