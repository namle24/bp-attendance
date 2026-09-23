const http=require('node:http'),{listen}=require('../../web/listener.cjs');
const {performance}=require('node:perf_hooks');
let completed=0,started;
const timer=new Int32Array(new SharedArrayBuffer(4));
const app={listen(options,ready){return http.createServer((req,res)=>{
  if(req.url==='/submit'){
    // A slow host blocks its loop on synchronous disk work during a class burst.
    // Model that scheduling pressure without touching real attendance data.
    // Use a cumulative 7.7 s work budget. CI scheduler delays can cause
    // an individual 11 ms wait to oversleep; adding 700 such delays would
    // turn this into a different test that exceeds the client deadline.
    started??=performance.now();completed++;
    const remaining=started+completed*11-performance.now();
    if(remaining>0)Atomics.wait(timer,0,0,remaining);
  }
  res.end('ok');
}).listen(options,ready);}};
const server=listen(app,0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{
  if(message==='stats')process.send({completed});
  if(message==='stop')server.close(()=>process.disconnect());
});
