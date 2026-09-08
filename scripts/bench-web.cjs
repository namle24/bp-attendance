// Local-only load measurement. Never connects to Google or a deployed attendance site.
const http=require('node:http');
const {fork}=require('node:child_process');
const {mkdtempSync,rmSync,writeFileSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');

async function serverProcess(){
  const {Store}=require('../web/store.cjs');
  const {createApp}=require('../web/app.cjs');
  const {SyncWorker}=require('../web/sheets.cjs');
  const {ranges,issueQr,today,hash}=require('../web/security.cjs');
  const config={demo:false,origin:'https://attendance.school.example',clientId:'unused',domains:['school.example'],admins:['ta@school.example'],secret:'benchmark-only-secret-'.repeat(3),campusCidrs:['203.0.113.0/24'],campus:ranges(['203.0.113.0/24']),proxies:ranges(['127.0.0.1/32'])};
  const filename=process.argv[3],count=Number(process.argv[4]);
  const store=new Store(filename);
  store.importRoster('MSSV,Họ tên,Email trường\n'+Array.from({length:count},(_,i)=>`S${i},Student ${i},s${i}@school.example`).join('\n'),'benchmark');
  // Seed already authenticated users. Google login is deliberately outside this measurement.
  const identities=Array.from({length:count},(_,i)=>{
    const identity={email:`s${i}@school.example`,sub:`benchmark-${i}`};
    store.bindStudent(identity);
    const challenge=store.challenge();
    return store.authenticate(hash(challenge.token),identity);
  });
  // Keep Sheets unavailable: receipts must not depend on its network response.
  let releaseSheets;
  const pendingSheets=new Promise(resolve=>{releaseSheets=resolve;});
  const worker=new SyncWorker(store,{write:()=>pendingSheets});
  const app=createApp(config,store,worker,{verifyGoogle:async()=>{throw Error('Google is outside this benchmark');}});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  process.on('message',async message=>{
    if(message==='start'){
      const session=store.open(today(Date.now()),5,'benchmark');
      const qr=issueQr(session,config.secret,Date.now());
      void worker.sync();
      process.send({kind:'start',qr,session:session.id});
    }else if(message==='stats'){
      process.send({kind:'stats',records:store.db.prepare('SELECT COUNT(*) AS n FROM attendance').get().n,sync:worker.status(),rssMiB:process.memoryUsage().rss/1024/1024});
    }else if(message==='stop'){
      await new Promise(resolve=>server.close(resolve));
      releaseSheets();
      // Let the pending worker finish before closing SQLite.
      await new Promise(resolve=>setImmediate(resolve));
      store.close();
      const reopened=new Store(filename);
      const records=reopened.db.prepare('SELECT COUNT(*) AS n FROM attendance').get().n;
      reopened.close();process.send({kind:'stop',persistedRecords:records});process.disconnect();
    }
  });
  process.send({kind:'ready',port:server.address().port,identities,sqlite:{journal:store.db.prepare('PRAGMA journal_mode').get(),synchronous:store.db.prepare('PRAGMA synchronous').get()}});
}

function receive(child,kind){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>finish(Error('Child timed out: '+kind)),60000);
    const onMessage=msg=>{if(msg.kind===kind)finish(null,msg);};
    const onExit=code=>finish(Error('Child exited before '+kind+': '+code));
    function finish(error,value){clearTimeout(timeout);child.off('message',onMessage);child.off('exit',onExit);child.off('error',onError);error?reject(error):resolve(value);}
    const onError=error=>finish(error);
    child.on('message',onMessage);child.once('exit',onExit);child.once('error',onError);
  });
}
function command(child,kind){const result=receive(child,kind);child.send(kind);return result;}

async function burst(port,identities,token){
  const agent=new http.Agent({keepAlive:true,maxSockets:identities.length});
  const payload=JSON.stringify({token}),start=performance.now();
  let lastDispatch=start;
  const pending=identities.map(identity=>new Promise(resolve=>{
    const before=performance.now();lastDispatch=before;
    const req=http.request({hostname:'127.0.0.1',port,path:'/api/check-in',method:'POST',agent,headers:{Origin:'https://attendance.school.example','X-Forwarded-For':'203.0.113.8','Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),'X-CSRF-Token':identity.csrf,Cookie:'__Host-bp_auth='+identity.token}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});
      res.on('end',()=>{let parsed;try{parsed=JSON.parse(body);}catch{parsed={code:'INVALID_JSON'};}resolve({ms:performance.now()-before,status:res.statusCode,body:parsed});});
      res.on('error',error=>resolve({ms:performance.now()-before,status:0,body:{code:error.code||error.message}}));
    });
    req.setTimeout(45000,()=>req.destroy(Error('REQUEST_TIMEOUT')));
    req.on('error',error=>resolve({ms:performance.now()-before,status:0,body:{code:error.code||error.message}}));
    req.end(payload);
  }));
  try{
    const replies=await Promise.all(pending),elapsed=performance.now()-start;
    const latencies=replies.map(r=>r.ms).sort((a,b)=>a-b),round=n=>Math.round(n*10)/10;
    const errors={};for(const r of replies)if(r.status!==200){const key=r.status+':'+(r.body.code||'UNKNOWN');errors[key]=(errors[key]||0)+1;}
    return {requests:identities.length,success:replies.filter(r=>r.status===200).length,duplicates:replies.filter(r=>r.body.receipt?.duplicate).length,errors,dispatchMs:round(lastDispatch-start),elapsedMs:round(elapsed),p50Ms:round(latencies[Math.ceil(latencies.length*.5)-1]),p95Ms:round(latencies[Math.ceil(latencies.length*.95)-1]),maxMs:round(latencies.at(-1))};
  }finally{agent.destroy();}
}

async function measure(count,run){
  const dir=mkdtempSync(path.join(os.tmpdir(),'bp-attendance-bench-'));
  const child=fork(__filename,['--server',path.join(dir,'bench.sqlite'),String(count)],{stdio:['ignore','ignore','inherit','ipc']});
  try{
    const ready=await receive(child,'ready');
    const started=await command(child,'start');
    const first=await burst(ready.port,ready.identities,started.qr.token);
    const retry=await burst(ready.port,ready.identities,started.qr.token);
    const stats=await command(child,'stats');
    const stopped=await command(child,'stop');
    const result={count,run,first,retry,records:stats.records,persistedRecords:stopped.persistedRecords,sheetsBlocked:stats.sync.busy&&stats.sync.pending,rssMiB:Math.round(stats.rssMiB),sqlite:ready.sqlite};
    console.log(JSON.stringify(result));
    assert.equal(first.success,count,'First submissions must all succeed');
    assert.equal(first.duplicates,0);assert.equal(retry.success,count);assert.equal(retry.duplicates,count);
    assert.equal(stats.records,count);assert.equal(stopped.persistedRecords,count);assert.equal(result.sheetsBlocked,true);
    return result;
  }finally{
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
    rmSync(dir,{recursive:true,force:true});
  }
}

async function main(){
  const report={measuredAt:new Date().toISOString(),node:process.version,cpu:os.cpus()[0]?.model,availableParallelism:os.availableParallelism(),totalMemoryGiB:Math.round(os.totalmem()/1024**3),method:'Separate server/load processes, loopback HTTP, temporary disk SQLite WAL, real clock and 30-second QR; already logged-in users; one simulated campus IP; Sheets writer held pending; no Google, TLS, Wi-Fi or browser load.',results:[]};
  for(const count of [100,300,700])for(let run=1;run<=3;run++)report.results.push(await measure(count,run));
  if(process.argv[2])writeFileSync(path.resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');
  console.log('All bursts and duplicate retries passed; records persisted after reopening SQLite.');
}
(process.argv[2]==='--server'?serverProcess():main()).catch(error=>{console.error(error);process.exitCode=1;});
