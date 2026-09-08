const {loadConfig}=require('./config.cjs');
const {Store}=require('./store.cjs');
const {createApp}=require('./app.cjs');
const {SheetsWriter,SyncWorker}=require('./sheets.cjs');
try{
  const config=loadConfig();const store=new Store(config.database);
  const worker=new SyncWorker(store,new SheetsWriter(config,store));
  const app=createApp(config,store,worker);
  const server=app.listen(config.port,config.host,()=>console.log('BP Attendance: '+config.origin));
  server.headersTimeout=15000;server.requestTimeout=20000;server.keepAliveTimeout=5000;
  server.setTimeout(30000,socket=>socket.destroy());
  const timer=setInterval(()=>worker.sync(),15000);timer.unref();
  server.on('error',e=>{console.error('Không mở được server: '+e.code);clearInterval(timer);store.close();process.exitCode=1;});
  let stopping=false;
  async function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close(async()=>{while(worker.busy)await new Promise(r=>setTimeout(r,100));store.close();process.exit(0);});}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}catch(e){console.error(e.message);process.exitCode=1;}
