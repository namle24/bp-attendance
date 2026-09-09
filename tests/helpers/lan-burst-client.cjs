// Keep the load generator off the server's event loop, as real student devices
// are. No throttling, retry-on-error or dropped failures: launch all 700 at once.
const {parentPort,workerData}=require('node:worker_threads');
const assert=require('node:assert/strict');
async function main(){
  const {origin,bodies}=workerData;
  for(const duplicate of [false,true]){
    const results=await Promise.allSettled(bodies.map(async body=>{
      const response=await fetch(origin+'/api/check-in',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.receipt.duplicate,duplicate);
    }));
    const failures=results.filter(result=>result.status==='rejected');
    assert.equal(failures.length,0,`${failures.length}/${bodies.length} failed: ${failures[0]?.reason?.cause?.code||failures[0]?.reason||''}`);
  }
  parentPort.postMessage('complete');
}
void main();
