const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {fork}=require('node:child_process');

test('700 reused connections survive a slow host batch longer than the old idle timeout', {timeout:40000}, async()=>{
  const child=fork(path.join(__dirname,'helpers/listener-load-server.cjs'),[],{stdio:['ignore','ignore','inherit','ipc']});
  const agent=new http.Agent({keepAlive:true,maxSockets:700,maxFreeSockets:700});
  function receive(){return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(Error('Slow-host fixture timed out')),25000);
    function finish(error,value){clearTimeout(timer);child.off('message',message);child.off('exit',exit);child.off('error',failed);error?reject(error):resolve(value);}
    const message=value=>finish(null,value),exit=code=>finish(Error('Fixture exited: '+code)),failed=e=>finish(e);
    child.once('message',message);child.once('exit',exit);child.once('error',failed);
  });}
  try{
    const {port}=await receive();
    function burst(route){return Promise.all(Array.from({length:700},()=>new Promise(resolve=>{
      const req=http.get({hostname:'127.0.0.1',port,path:route,agent},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));res.on('error',e=>resolve(e.code));});
      req.setTimeout(20000,()=>req.destroy(Error('CLIENT_TIMEOUT')));req.on('error',e=>resolve(e.code||e.message));
    })));}
    assert.deepEqual(new Set(await burst('/warm')),new Set([200]));
    const start=Date.now(),results=await burst('/submit');
    assert.ok(Date.now()-start>6000,'Exercise a batch exceeding the previous 5 s + buffer deadline');
    assert.equal(results.filter(x=>x!==200).length,0,JSON.stringify(results.filter(x=>x!==200)));
    const stats=receive();child.send('stats');assert.equal((await stats).completed,700);
  }finally{
    agent.destroy();
    if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
  }
});
