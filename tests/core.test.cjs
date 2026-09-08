const test = require('node:test');
const assert = require('node:assert/strict');
const BP = require('../apps-script/Core.gs');
const list = () => BP.roster([['001','An','an@school.example'],['002','Bình','binh@school.example']]);
const session = (date='2026-09-09') => ({id:date+'|OFFLINE',date,state:'OPEN',code:'ABC123',openedAt:date+'T06:00:00.000Z',closesAt:date+'T06:08:00.000Z'});
const response = extra => ({studentId:'001',email:'an@school.example',timestamp:'2026-09-09T06:02:00.000Z',code:'ABC123',...extra});

test('matches verified email to exact roster ID, including leading zeroes', () => {
  assert.equal(BP.assess(response({email:' AN@school.example ',code:' abc123 '}),session(),list(),new Set()),'ACCEPTED');
  assert.equal(BP.assess(response({studentId:'002'}),session(),list(),new Set()),'EMAIL_MISMATCH');
  assert.equal(BP.assess(response({email:'an@gmail.com'}),session(),list(),new Set()),'EMAIL_MISMATCH');
  assert.equal(BP.assess(response({studentId:'999'}),session(),list(),new Set()),'UNKNOWN_STUDENT');
});
test('rejects before opening, after expiry, wrong code and drafts', () => {
  for (const timestamp of ['2026-09-09T05:59:59Z','2026-09-09T06:08:00.001Z','bad'])
    assert.equal(BP.assess(response({timestamp}),session(),list(),new Set()),'OUTSIDE_WINDOW');
  assert.equal(BP.assess(response({code:'OLD'}),session(),list(),new Set()),'WRONG_CODE');
  assert.equal(BP.assess(response(),{...session(),state:'DRAFT'},list(),new Set()),'OUTSIDE_WINDOW');
  assert.equal(BP.assess(response({timestamp:session().closesAt}),session(),list(),new Set()),'ACCEPTED');
});
test('deduplicates valid submissions, lets invalid-first student retry, resets next week', () => {
  const seen = new Set();
  assert.equal(BP.assess(response({email:'wrong@school.example'}),session(),list(),seen),'EMAIL_MISMATCH');
  assert.equal(BP.assess(response(),session(),list(),seen),'ACCEPTED');
  assert.equal(BP.assess(response(),session(),list(),seen),'DUPLICATE');
  assert.equal(BP.assess(response({timestamp:'2026-09-16T06:02:00Z'}),session('2026-09-16'),list(),seen),'ACCEPTED');
});
test('fails on ambiguous rosters and impossible dates', () => {
  assert.throws(()=>BP.roster([['001','A','a@b.test'],['001','B','b@b.test']]),/trùng/);
  assert.throws(()=>BP.roster([['001','A','a@b.test'],['002','B','A@b.test']]),/trùng/);
  assert.throws(()=>BP.roster([['001','','a@b.test']]),/hợp lệ/);
  assert.throws(()=>BP.date('2026-02-30'),/Ngày/);
  assert.throws(()=>BP.date('09/09/2026'),/Ngày/);
});
test('weekly matrix joins by MSSV after roster reorder; same date shares one column', () => {
  const roster=BP.roster([['002','Bình','binh@school.example'],['001','An','an@school.example']]);
  const logs=[{date:'2026-09-09',studentId:'001',mode:'OFFLINE',result:'ACCEPTED'},
    {date:'2026-09-09',studentId:'001',mode:'ONLINE',result:'ACCEPTED'},
    {date:'2026-09-16',studentId:'002',mode:'OFFLINE',result:'ACCEPTED'}];
  const m=BP.matrix(roster,[session('2026-09-16'),session(),{...session(),id:'online'}],logs,[]);
  assert.deepEqual(m[0],['MSSV','Họ tên','Email trường','2026-09-09','2026-09-16']);
  assert.deepEqual(m[1].slice(3),['','OFF']); assert.deepEqual(m[2].slice(3),['BOTH','']);
});
test('corrections survive rebuild; last correction wins and requires reason', () => {
  const c={date:'2026-09-09',studentId:'001',mark:'EXCUSED',reason:'TA reviewed'};
  assert.equal(BP.matrix(list(),[session()],[],[c])[1][3],'EXCUSED');
  assert.equal(BP.matrix(list(),[session()],[],[c,{...c,mark:'OFF'}])[1][3],'OFF');
  assert.throws(()=>BP.matrix(list(),[session()],[],[{...c,reason:''}]),/lý do/);
  assert.throws(()=>BP.matrix(list(),[session()],[],[{...c,studentId:'999'}]),/ngoài lớp/);
});
test('online parser accepts explicit IDs and convention, rejects guesses', () => {
  assert.deepEqual(BP.parseOnline('001 - An\n002\n001\nSomeone (001)',list()),
    {accepted:['001','002'],invalid:[{line:4,value:'Someone (001)'}]});
});
test('untrusted sheet text cannot become formula', () => {
  for (const s of ['=IMPORTXML("https://bad.invalid")',' +1','\t=1','@name','-1']) assert.equal(BP.safeCell(s),"'"+s);
  assert.equal(BP.safeCell('001'),'001');
});
test('700 students x two weeks plus retries produce independent date columns', () => {
  const roster=BP.roster(Array.from({length:700},(_,i)=>['S'+String(i).padStart(4,'0'),'Student '+i,'s'+i+'@school.example']));
  const logs=[],seen=new Set();
  for(const d of ['2026-09-09','2026-09-16']) {
    const s=session(d);
    for(const student of roster.students) {
      const r={studentId:student.id,email:student.email,code:s.code,timestamp:d+'T06:01:00Z'};
      for(let repeat=0;repeat<2;repeat++) logs.push({...r,date:d,mode:'OFFLINE',result:BP.assess(r,s,roster,seen)});
    }
  }
  assert.equal(logs.filter(l=>l.result==='ACCEPTED').length,1400);
  const m=BP.matrix(roster,[session(),session('2026-09-16')],logs,[]);
  assert.equal(m.length,701); assert.equal(m[0].length,5);
  for(const row of m.slice(1)) assert.deepEqual(row.slice(3),['OFF','OFF']);
});
