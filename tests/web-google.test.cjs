const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {AttendanceGoogleClient}=require('../web/google.cjs');

test('700 cold-cache JWT verifications share keys, enforce signatures and recover after key fetch failure',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const cert=publicKey.export({type:'spki',format:'pem'});
  let calls=0,unavailable=false;
  const client=new AttendanceGoogleClient('attendance-test',{adapter:async options=>{
    calls++;assert.equal(options.retry,false);assert.equal(options.timeout,8000);
    await new Promise(resolve=>setImmediate(resolve));
    if(unavailable)throw Error('Simulated key service outage');
    return {data:{test:cert},headers:new Headers({'cache-control':'max-age=3600'}),status:200,statusText:'OK',config:options};
  }});
  function jwt(delta={}){
    const now=Math.floor(Date.now()/1000);
    const body=[{alg:'RS256',kid:'test'},{iss:'https://accounts.google.com',aud:'attendance-test',sub:'student',iat:now,exp:now+3600,...delta}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  }
  const token=jwt(),verify=idToken=>client.verifyIdToken({idToken,audience:'attendance-test'});
  const results=await Promise.all(Array.from({length:700},()=>verify(token)));
  assert.equal(results.length,700);assert.equal(calls,1);
  await verify(token);assert.equal(calls,1);
  await assert.rejects(()=>verify(jwt({aud:'other-app'})));
  await assert.rejects(()=>verify(token.slice(0,-10)+'abcdefghij'));
  client.certificateExpiry=new Date(0);unavailable=true;
  const rejected=await Promise.allSettled(Array.from({length:50},()=>verify(token)));
  assert.ok(rejected.every(r=>r.status==='rejected'));assert.equal(calls,2);
  unavailable=false;await verify(token);assert.equal(calls,3);
});
