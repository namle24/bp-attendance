// Real student devices do not create their requests on the server's event loop.
// Launch every request together; never retry or discard connection failures.
const {parentPort,workerData}=require('node:worker_threads');
const assert=require('node:assert/strict');
async function main(){
  const {origin,count,expected}=workerData;
  const results=await Promise.allSettled(Array.from({length:count},async()=>{
    const response=await fetch(origin+'/api/student-history',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({studentId:expected.studentId}),signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.studentId,expected.studentId);assert.deepEqual(result.days,expected.days);
  }));
  const failures=results.filter(result=>result.status==='rejected');
  const errors={};for(const failure of failures){const code=failure.reason?.cause?.code||failure.reason?.message||'UNKNOWN';errors[code]=(errors[code]||0)+1;}
  assert.equal(failures.length,0,`${failures.length}/${count} lookup requests failed: ${JSON.stringify(errors)}`);
  parentPort.postMessage({completed:results.length});
}
void main();
