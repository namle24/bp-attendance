const http=require('node:http'),{listen}=require('../../web/listener.cjs');
let completed=0;
const timer=new Int32Array(new SharedArrayBuffer(4));
const app={listen(options,ready){return http.createServer((req,res)=>{
  if(req.url==='/submit'){
    // A slow host blocks its loop on synchronous disk work during a class burst.
    // Model that scheduling pressure without touching real attendance data.
    Atomics.wait(timer,0,0,11);completed++;
  }
  res.end('ok');
}).listen(options,ready);}};
const server=listen(app,0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{
  if(message==='stats')process.send({completed});
  if(message==='stop')server.close(()=>process.disconnect());
});
