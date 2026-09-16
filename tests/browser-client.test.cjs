const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(require.resolve('../web/lan-public/client.js'),'utf8');
function client(){
  const sent=[];
  class XHR{constructor(){this.headers={};sent.push(this);}open(method,url,async){Object.assign(this,{method,url,async});}setRequestHeader(k,v){this.headers[k]=v;}send(body){this.body=body;}}
  const window={crypto:webcrypto,location:{hash:'#code=ABCD%20EFGH'}};
  vm.runInNewContext(source,{window,XMLHttpRequest:XHR,Promise,Uint8Array,Date,Error});return {client:window.BPClient,sent};
}
test('browser transport works without fetch/AbortSignal and sends the exact retry body',async()=>{
  const f=client(),payload={requestId:f.client.randomId(),studentId:'001'};assert.match(payload.requestId,/^[a-f0-9]{32}$/);
  const first=f.client.request('/api/check-in',payload),xhr=f.sent[0];assert.equal(xhr.timeout,45000);assert.equal(xhr.method,'POST');assert.equal(xhr.headers['Content-Type'],'application/json');
  xhr.onerror();await assert.rejects(first,/kết nối/);
  const retry=f.client.request('/api/check-in',payload),second=f.sent[1];assert.equal(second.body,xhr.body);second.status=200;second.responseText='{"receipt":{"duplicate":true}}';second.onload();assert.equal((await retry).receipt.duplicate,true);
  assert.equal(f.client.fragment('code'),'ABCD EFGH');
});
test('browser timeout and HTML login response remain retryable; API error codes are preserved',async()=>{
  const f=client();let p=f.client.request('/api/session'),xhr=f.sent.at(-1);assert.equal(xhr.timeout,20000);xhr.ontimeout();await assert.rejects(p,/chưa trả lời kịp/);
  p=f.client.request('/api/session');xhr=f.sent.at(-1);xhr.status=200;xhr.responseText='<html>Wi-Fi login</html>';xhr.onload();await assert.rejects(p,/đăng nhập Wi-Fi/);
  p=f.client.request('/api/scan',{code:'EXPIRED'});xhr=f.sent.at(-1);xhr.status=410;xhr.responseText='{"code":"QR_EXPIRED","message":"Quét mã mới"}';xhr.onload();await assert.rejects(p,e=>e.code==='QR_EXPIRED'&&e.status===410);
});
