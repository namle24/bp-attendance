// Local-only load measurement. Never connects to Google or a deployed attendance site.
const http=require('node:http');
const {fork}=require('node:child_process');
const {mkdtempSync,rmSync,writeFileSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');

async function serverProcess(){
  const {LanStore:Store}=require('../web/lan-store.cjs');
  const {createStudentApp}=require('../web/lan-app.cjs');
  const {SyncWorker}=require('../web/sheets.cjs');
  const {ranges,today}=require('../web/security.cjs');
  const config={origin:'',campus:ranges(['127.0.0.1/32'])};
  const filename=process.argv[3],count=Number(process.argv[4]);
  const store=new Store(filename);
  const identities=Array.from({length:count},(_,i)=>({studentId:'S'+String(i).padStart(4,'0'),name:'Student '+i,requestId:randomBytes(16).toString('hex')}));

  // Keep Sheets unavailable: receipts must not depend on its network response.
  let releaseSheets;
  const pendingSheets=new Promise(resolve=>{releaseSheets=resolve;});
  const worker=new SyncWorker(store,{write:()=>pendingSheets});
  const app=createStudentApp(config,store);
  const server=await new Promise(resolve=>{const s=require('../web/listener.cjs').listen(app,0,'127.0.0.1',()=>resolve(s));});
  config.origin='http://127.0.0.1:'+server.address().port;
  process.on('message',async message=>{
    if(message==='start'){
      const previous=store.activeSession();if(previous)store.closeSession(previous.id,'benchmark');
      const session=store.open(today(Date.now()),5,'benchmark');
      const qr={sessionId:session.id,code:store.currentQr().code};
      void worker.sync();
      process.send({kind:'start',qr,session:session.id});
    }else if(message==='stats'){
      process.send({kind:'stats',records:store.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance').get().n,flagged:store.entries().filter(e=>e.status==='PENDING').length,locations:Object.fromEntries(store.db.prepare('SELECT status,COUNT(*) AS n FROM lan_attendance_locations GROUP BY status').all().map(row=>[row.status,row.n])),sync:worker.status(),rssMiB:process.memoryUsage().rss/1024/1024});
    }else if(message==='stop'){
      await new Promise(resolve=>server.close(resolve));
      releaseSheets();
      // Let the pending worker finish before closing SQLite.
      await new Promise(resolve=>setImmediate(resolve));
      store.close();
      const reopened=new Store(filename);
      const records=reopened.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance').get().n;
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

async function burst(agent,port,identities,qr,route='/api/check-in'){
  const start=performance.now();
  let lastDispatch=start;
  const pending=identities.map(identity=>new Promise(resolve=>{
    const before=performance.now();lastDispatch=before;const document=route==='/',read=document||route==='/api/receipt';const payload=JSON.stringify(route==='/api/scan'?{code:qr.code}:{...identity,sessionId:qr.sessionId});
    const req=http.request({hostname:'127.0.0.1',port,path:route==='/api/receipt'?route+'?round='+encodeURIComponent(qr.sessionId):route,method:read?'GET':'POST',agent,headers:{'Accept-Encoding':'gzip',Origin:'http://127.0.0.1:'+port,'Content-Type':'application/json','Content-Length':read?0:Buffer.byteLength(payload),...(identity.cookie?{Cookie:identity.cookie}:{})}},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});
      res.on('end',()=>{let parsed;try{parsed=document?{}:JSON.parse(body);}catch{parsed={code:'INVALID_JSON'};}resolve({ms:performance.now()-before,status:res.statusCode,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],body:parsed});});
      res.on('error',error=>resolve({ms:performance.now()-before,status:0,body:{code:error.code||error.message}}));
    });
    req.setTimeout(45000,()=>req.destroy(Error('REQUEST_TIMEOUT')));
    req.on('error',error=>resolve({ms:performance.now()-before,status:0,body:{code:error.code||error.message}}));
    req.end(read?undefined:payload);
  }));
  const replies=await Promise.all(pending),elapsed=performance.now()-start;
  const latencies=replies.map(r=>r.ms).sort((a,b)=>a-b),round=n=>Math.round(n*10)/10;
  const errors={};for(const r of replies)if(r.status!==200){const key=r.status+':'+(r.body.code||'UNKNOWN');errors[key]=(errors[key]||0)+1;}
  return {cookies:['/','/api/scan'].includes(route)?replies.map(r=>r.cookie):undefined,tickets:route==='/api/scan'?replies.map(r=>r.body.scanTicket):undefined,...(route==='/api/receipt'?{matchingReceipts:replies.filter((r,i)=>r.body.receipt?.studentId===identities[i].studentId).length}:{}),requests:identities.length,success:replies.filter(r=>r.status===200).length,duplicates:replies.filter(r=>r.body.receipt?.duplicate).length,errors,dispatchMs:round(lastDispatch-start),elapsedMs:round(elapsed),p50Ms:round(latencies[Math.ceil(latencies.length*.5)-1]),p95Ms:round(latencies[Math.ceil(latencies.length*.95)-1]),maxMs:round(latencies.at(-1))};
}

async function measure(count,run,roundCount=1){
  const dir=mkdtempSync(path.join(os.tmpdir(),'bp-attendance-bench-'));
  // Reuse the full concurrent connection pool between bursts. Creating and
  // destroying a fresh pool for every phase exhausts the load generator's
  // ephemeral ports (TIME_WAIT) on systems with a small source-port range.
  const agent=new http.Agent({keepAlive:true,maxSockets:count,maxFreeSockets:count});
  const child=fork(__filename,['--server',path.join(dir,'bench.sqlite'),String(count)],{stdio:['ignore','ignore','inherit','ipc']});
  try{
    const ready=await receive(child,'ready');
    const rounds=[];let stats;
    for(let round=1;round<=roundCount;round++){
      const started=await command(child,'start');
      const identities=ready.identities.map(identity=>({...identity,requestId:randomBytes(16).toString('hex')}));
      const {cookies:pageCookies,tickets:unused,...page}=await burst(agent,ready.port,identities,started.qr,'/');assert.equal(page.success,count,JSON.stringify(page));
      identities.forEach((identity,i)=>{identity.cookie=pageCookies[i];});
      const {tickets,cookies,...scan}=await burst(agent,ready.port,identities,started.qr,'/api/scan');
      assert.equal(scan.success,count,JSON.stringify(scan));
      identities.forEach((identity,i)=>{identity.scanTicket=tickets[i];identity.cookie=cookies[i]||identity.cookie;});
      const first=await burst(agent,ready.port,identities,started.qr);
      const retry=await burst(agent,ready.port,identities,started.qr);
      const receipt=await burst(agent,ready.port,identities,started.qr,'/api/receipt');
      assert.equal(receipt.success,count,JSON.stringify(receipt));assert.equal(receipt.matchingReceipts,count);
      stats=await command(child,'stats');
      assert.equal(first.success,count,JSON.stringify(first));assert.equal(first.duplicates,0);
      assert.equal(retry.success,count,JSON.stringify(retry));assert.equal(retry.duplicates,count);
      assert.equal(stats.records,count*round);assert.equal(stats.flagged,count*round);
      assert.deepEqual(stats.locations,{});
      rounds.push({round,page,scan,first,retry,receipt,records:stats.records});
    }
    const stopped=await command(child,'stop');
    const {page,scan,first,retry,receipt}=rounds[0];
    const result={count,run,...(roundCount===1?{page,scan,first,retry,receipt}:{rounds}),records:stats.records,flagged:stats.flagged,locations:stats.locations,persistedRecords:stopped.persistedRecords,sheetsBlocked:stats.sync.busy&&stats.sync.pending,rssMiB:Math.round(stats.rssMiB),sqlite:ready.sqlite};
    console.log(JSON.stringify(result));
    assert.equal(stopped.persistedRecords,count*roundCount);assert.equal(result.sheetsBlocked,true);
    return result;
  }finally{
    agent.destroy();
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
    rmSync(dir,{recursive:true,force:true});
  }
}

async function main(){
  const roundCount=Number(process.env.BP_BENCH_ROUNDS||1),counts=(process.env.BP_BENCH_COUNTS||'100,300,700').split(',').map(Number);
  assert.ok(Number.isInteger(roundCount)&&roundCount>=1);
  for(const count of counts)assert.ok(Number.isInteger(count)&&count>0&&count*roundCount*4<=6000,'Keep the test within the real 6,000-request shared-IP per-minute limit');
  const report={measuredAt:new Date().toISOString(),platform:process.platform,node:process.version,cpu:os.cpus()[0]?.model,availableParallelism:os.availableParallelism(),totalMemoryGiB:Math.round(os.totalmem()/1024**3),roundsPerDay:roundCount,locationChecks:false,method:'Separate server/load processes, loopback HTTP, real clock, temporary disk SQLite WAL with FULL synchronous; concurrent compressed page loads, rotating QR admissions followed by submissions, idempotent retries and private receipt refreshes in each round; same students across rounds in one date; actual shared loopback socket IP; all peers flagged; Sheets writer held pending. Each simulated browser has its own signed cookie. One keep-alive pool retains up to the full concurrent connection count across bursts to avoid exhausting source ports on the load generator; no throttling or retry-on-error. Does not measure classroom Wi-Fi or real Sheets API.',submission:'LAN rotating QR',results:[]};
  for(const count of counts)for(let run=1;run<=3;run++)report.results.push(await measure(count,run,roundCount));
  if(process.argv[2])writeFileSync(path.resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');
  console.log('All bursts and duplicate retries passed; records persisted after reopening SQLite.');
}
(process.argv[2]==='--server'?serverProcess():main()).catch(error=>{console.error(error);process.exitCode=1;});
