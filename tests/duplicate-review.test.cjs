const test=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parse}=require('csv-parse/sync');
const {LanStore}=require('../web/lan-store.cjs'),{today}=require('../web/security.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs'),{client}=require('./helpers/lan-http-client.cjs');
const body=(round,grant,id='001',name='Synthetic Student')=>({sessionId:round.id,studentId:id,name,requestId:randomBytes(16).toString('hex'),scanTicket:grant.scanTicket});
const scan=async(f,c)=>(await c.request('/api/scan',{code:f.store.currentQr().code})).body;

test('valid duplicate attempts retain the first row, lock each browser, preserve retry semantics and private receipts',async()=>{
  const f=await startFixture();try{
    const r=f.store.open(today(),8,'TA'),one=client(f.origin),two=client(f.origin),outsider=client(f.origin);
    const first=body(r,await scan(f,one),'001','First private name');
    assert.equal((await one.request('/api/check-in',first)).status,200);
    assert.equal((await one.request('/api/check-in',first)).body.receipt.duplicateReview,false);
    assert.equal((await one.request('/api/check-in',body(r,await scan(f,one)))).body.code,'DEVICE_RECORDED');
    const second=body(r,await scan(f,two),'001','Second submitted name');
    const results=await Promise.all([two.request('/api/check-in',second),two.request('/api/check-in',second)]);
    for(const result of results){assert.equal(result.status,409);assert.equal(result.body.code,'DUPLICATE_REVIEW');assert.equal(result.body.receipt.duplicateReview,true);assert.equal(result.body.receipt.name,second.name);assert.doesNotMatch(JSON.stringify(result.body),/First private|127\.0\.0\.1|request_hash/);}
    const row=f.store.entries()[0];assert.equal(f.store.entries().length,1);assert.equal(row.name,first.name);assert.equal(row.duplicate_attempts,1);assert.equal(row.status,'PENDING');assert.equal(row.peers,1);
    assert.equal((await one.request('/api/receipt?round='+r.id)).body.receipt.duplicateReview,true);
    assert.equal((await outsider.request('/api/receipt?round='+r.id)).body.receipt,null);
    assert.equal((await two.request('/api/check-in',{...second,name:'changed'})).body.code,'REQUEST_CHANGED');
    assert.equal((await outsider.request('/api/check-in',second)).body.code,'DEVICE_CHANGED');
    assert.equal((await two.request('/api/check-in',body(r,await scan(f,two),'002'))).body.code,'DEVICE_RECORDED');
    f.store.closeSession(r.id,'TA');
    assert.equal((await two.request('/api/check-in',second)).body.code,'DUPLICATE_REVIEW');
    assert.equal((await one.request('/api/session')).body.receipt.duplicateReview,true);
    assert.equal((await two.request('/api/session')).body.receipt.duplicateAttempt,true);
    assert.equal(f.store.entries()[0].duplicate_attempts,1);
    f.store.reopen(r.id,8,'TA');assert.equal((await scan(f,two)).receipt.duplicateReview,true);
    f.store.closeSession(r.id,'TA');const next=f.store.open(today(),8,'TA');
    assert.equal((await two.request('/api/check-in',body(next,await scan(f,two)))).status,200);
    assert.equal(f.store.entries(next.id)[0].duplicate_attempts,0);
  }finally{await f.close();}
});

test('TA confirmation requires school email and an explicit card check; new evidence reopens review, exports match filters',async()=>{
  const f=await startFixture();try{
    const r=f.store.open(today(),8,'TA'),one=client(f.origin),two=client(f.origin),third=client(f.origin),outsider=client(f.origin);
    await one.request('/api/check-in',body(r,await scan(f,one)));await two.request('/api/check-in',body(r,await scan(f,two)));
    const row=f.store.entries()[0],admin=client(f.adminOrigin),csrf=(await admin.request('/api/dashboard')).body.csrf;
    const review=(extra={})=>admin.request('/api/entries/'+row.id+'/review',{review:'CONFIRMED',note:'Đã đối chiếu thẻ và email',peers:1,duplicateAttempts:1,...extra},{'X-CSRF-Token':csrf});
    assert.equal((await review()).body.code,'EMAIL_REQUIRED');
    await outsider.request('/api/session');
    assert.equal((await outsider.request('/api/review-email',{sessionId:r.id,email:'outsider@usth.edu.vn'})).status,403);
    for(const email of ['', 'a@gmail.com','a@evilusth.edu.vn','a@usth.edu.vn.evil.test','a@usth.edu.vn\r\n'])assert.equal((await two.request('/api/review-email',{sessionId:r.id,email})).status,400);
    assert.equal((await two.request('/api/review-email',{sessionId:r.id,email:'student@usth.edu.vn'},{Origin:'http://evil.example'})).status,403);
    assert.equal((await two.request('/api/review-email',{sessionId:r.id,email:'Student@ST.USTH.EDU.VN'})).body.receipt.schoolEmail,'student@st.usth.edu.vn');
    assert.equal((await two.request('/api/review-email',{sessionId:r.id,email:'student@st.usth.edu.vn'})).status,200,'email retry is idempotent');
    assert.equal((await two.request('/api/review-email',{sessionId:r.id,email:'changed@usth.edu.vn'})).body.code,'EMAIL_SAVED');
    assert.equal((await one.request('/api/receipt?round='+r.id)).body.receipt.schoolEmail,'','Do not disclose other browser email');
    assert.equal((await review()).body.code,'CARD_REQUIRED');
    assert.equal((await review({cardChecked:true,duplicateAttempts:0})).body.code,'GROUP_CHANGED');
    const before=f.store.snapshot();assert.equal(before.values[1][3],'OFF thiếu đối chiếu (trùng MSSV)');assert.deepEqual(before.red,[{row:1,col:3}]);assert.equal(before.detailRed.length,1);
    const queried=(await admin.request('/api/issues?duplicate=MSSV')).body.entries;assert.equal(queried.length,1);assert.equal(queried[0].duplicate_emails[0].email,'student@st.usth.edu.vn');
    const csv=parse(await fetch(f.adminOrigin+'/api/issues.csv?duplicate=MSSV').then(r=>r.text()),{bom:true});assert.equal(csv[1][19],'1');assert.match(csv[1][21],/student@st.usth.edu.vn/);
    assert.equal((await admin.request('/api/issues?duplicate=WRONG')).status,400);
    assert.equal((await review({cardChecked:true})).status,200);assert.equal(f.store.entries()[0].status,'CONFIRMED');assert.equal(f.store.snapshot().red.length,0);
    assert.equal((await two.request('/api/receipt?round='+r.id)).body.receipt.duplicateReview,false);
    await third.request('/api/check-in',body(r,await scan(f,third)));
    assert.equal(f.store.entries()[0].duplicate_attempts,2);assert.equal(f.store.entries()[0].status,'PENDING');assert.equal((await review({cardChecked:true})).body.code,'GROUP_CHANGED');
    assert.equal((await review({review:'REJECTED',duplicateAttempts:2})).status,200);assert.equal(f.store.entries()[0].status,'REJECTED');
    assert.equal((await one.request('/api/receipt?round='+r.id)).body.receipt.duplicateReview,false);
    assert.equal((await one.request('/api/review-email',{sessionId:r.id,email:'a@usth.edu.vn'})).body.code,'REVIEW_CLOSED');
  }finally{await f.close();}
});

test('invalid or revoked admission never flags a student; different IP evidence and review survive restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-duplicate-')),filename=path.join(dir,'test.sqlite');let s=new LanStore(filename);
  const now=Date.parse('2026-09-23T06:00:00Z'),firstIP='10.1.1.1',secondIP='10.1.1.2',one='a'.repeat(64),two='b'.repeat(64);
  try{
    const r=s.open(today(now),8,'TA',now),grant=(ip,device)=>s.scan({code:s.currentQr(now).code},ip,now,device);
    s.checkIn(body(r,grant(firstIP,one)),firstIP,now,one);
    const second=body(r,grant(secondIP,two));
    for(const [input,ip,at,device] of [[{...second,scanTicket:''},secondIP,now,two],[second,firstIP,now,two],[second,secondIP,now,one],[second,secondIP,now+181000,two]]){
      assert.throws(()=>s.checkIn(input,ip,at,device));assert.equal(s.entries()[0].status,'RECORDED');assert.equal(s.entries()[0].duplicate_attempts,0);
    }
    s.closeSession(r.id,'TA',now);s.reopen(r.id,8,'TA',now);assert.throws(()=>s.checkIn(second,secondIP,now,two),e=>e.code==='SCAN_INVALID');
    const valid=body(r,grant(secondIP,two));assert.throws(()=>s.checkIn(valid,secondIP,now,two),e=>e.code==='DUPLICATE_REVIEW');
    s.close();s=new LanStore(filename);assert.equal(s.entries()[0].duplicate_evidence[0].ip,secondIP);assert.equal(s.deviceReceipt(r.id,one).duplicateReview,true);
    s.supplementEmail(r.id,one,'a@usth.edu.vn',now);const entry=s.entries()[0];s.reviewEntry(entry.id,'CONFIRMED','Thẻ và email khớp',1,'TA',now,1,true);
    s.close();s=new LanStore(filename);assert.equal(s.entries()[0].status,'CONFIRMED');assert.equal(s.deviceReceipt(r.id,one).schoolEmail,'a@usth.edu.vn');
    assert.throws(()=>s.checkIn(valid,secondIP,now,two),e=>e.code==='DUPLICATE_REVIEW'&&e.receipt.duplicateReview===false);
    assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('no-JS duplicate form accepts supplemental email after the round closes with cookie and CSRF protection',async()=>{
  const f=await startFixture();try{
    const r=f.store.open(today(),8,'TA'),one=client(f.origin);await one.request('/api/check-in',body(r,await scan(f,one)));
    const page=await fetch(f.origin+'/simple'),cookie=page.headers.get('set-cookie').split(';')[0];
    const fields=html=>Object.fromEntries([...html.matchAll(/name="(formToken|requestId|sessionId|action)" value="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    const post=input=>fetch(f.origin+'/simple',{method:'POST',headers:{Cookie:cookie,Origin:'null','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(input)});
    const result=await post({...fields(await page.text()),code:f.store.currentQr().code,studentId:'001',name:'Own submitted name'});assert.equal(result.status,409);
    const html=await result.text();assert.match(html,/name="email" required/);assert.match(html,/mang thẻ sinh viên xuống bàn TA/);const emailForm=fields(html);
    f.store.closeSession(r.id,'TA');
    assert.equal((await post({...emailForm,email:'a@usth.edu.vn',formToken:'bad'})).status,403);
    const saved=await post({...emailForm,email:'a@usth.edu.vn'});assert.equal(saved.status,200);assert.match(await saved.text(),/Đã lưu email/);
    assert.equal(f.store.entries().length,1);assert.equal(f.store.entries()[0].status,'PENDING');
    assert.match(await fetch(f.origin+'/simple',{headers:{Cookie:cookie}}).then(r=>r.text()),/Thiếu đối chiếu/);
  }finally{await f.close();}
});


test('simultaneous browsers for one MSSV produce one row and one review case, not two attendances',async()=>{
  const f=await startFixture();try{
    const r=f.store.open(today(),8,'TA'),one=client(f.origin),two=client(f.origin);
    const a=body(r,await scan(f,one)),b=body(r,await scan(f,two));
    const replies=await Promise.all([one.request('/api/check-in',a),two.request('/api/check-in',b)]);
    assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal(f.store.entries().length,1);assert.equal(f.store.entries()[0].duplicate_attempts,1);
    f.store.importRoster('MSSV,Họ tên,Email trường\n001,Synthetic Student,student@usth.edu.vn','TA');
    f.store.importOnline(today(),'001','Google Form','TA');
    assert.equal(f.store.matrix()[1][3],'ON · OFF thiếu đối chiếu (trùng MSSV)');
    f.store.closeSession(r.id,'TA');const next=f.store.open(today(),8,'TA');await one.request('/api/check-in',body(next,await scan(f,one)));
    assert.equal(f.store.matrix()[1][3],'ON · Đã gửi 2/2 đợt · 1 thiếu đối chiếu MSSV');
    assert.equal(f.store.entries(next.id)[0].status,'RECORDED');assert.equal(f.store.entries(r.id)[0].status,'PENDING');
  }finally{await f.close();}
});
