const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const BP = require('../apps-script/Core.gs');

// Service doubles test orchestration and recovery, not Google's real APIs.
function harness() {
  const store = {}, props = {}, forms = {};
  const ctx = vm.createContext({ BP, console, Date, Set, Math, JSON, Number, String, Error, encodeURIComponent });
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/Code.gs'), 'utf8'), ctx);
  for (const name of Object.keys(ctx.BP_HEADERS)) store[name] = [];
  ctx.objects_ = name => store[name].map((r, i) => ({...r, _row:i+2}));
  ctx.append_ = (name, rows) => store[name].push(...rows.map(r=>({...r})));
  ctx.saveSession_ = s => { store.BP_Sessions[s._row-2] = {...s}; };
  ctx.grid_ = name => name === 'BP_Roster' ? [['001','An','an@school.example'],['002','Bình','binh@school.example']] : [];
  ctx.list_ = () => BP.roster(ctx.grid_('BP_Roster'));
  ctx.table_ = () => ({});
  ctx.property_ = (key, value) => { if(value !== undefined) props[key] = String(value); return props[key] || ''; };
  ctx.actor_ = () => 'ta@school.example';
  let locked = false;
  ctx.LockService = {getScriptLock:()=>({tryLock:()=> {if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})};
  ctx.FormApp = {openById:id=>forms[id]};
  ctx.verifyEmailMode_ = id => { if(forms[id].mode !== 'VERIFIED') throw Error('Not VERIFIED'); };
  ctx.rebuild_ = () => { ctx.matrix = BP.matrix(ctx.list_(),ctx.objects_('BP_Sessions'),ctx.objects_('BP_Log'),ctx.objects_('BP_Overrides')); };
  ctx.getDashboard = () => ({sessions:ctx.objects_('BP_Sessions'),error:props.BP_LAST_ERROR});
  ctx.today_ = () => '2026-09-09';
  const start = Date.now()-120000, end = Date.now()+120000;
  const session = {id:'2026-09-09|OFFLINE',date:'2026-09-09',state:'OPEN',formId:'form1',code:'ABC123',studentItemId:'10',codeItemId:'11',openedAt:new Date(start).toISOString(),closesAt:new Date(end).toISOString(),accepted:0,rejected:0};
  store.BP_Sessions.push(session);
  forms.form1 = {mode:'VERIFIED',canEditResponse:()=>false,setAcceptingResponses:()=>{},getResponses:()=>[],};
  function response(id, extra={}) {
    const values={studentId:'001',email:'an@school.example',code:'ABC123',time:start+1000,...extra};
    return {getId:()=>id,getTimestamp:()=>new Date(values.time),getRespondentEmail:()=>values.email,
      getItemResponses:()=>[['10',values.studentId],['11',values.code]].map(([key,val])=>({getItem:()=>({getId:()=>Number(key)}),getResponse:()=>val}))};
  }
  return {ctx,store,forms,props,response,session};
}

test('sync retries preserve durable log after report write failure and deduplicate', () => {
  const h=harness(); h.forms.form1.getResponses=()=>[h.response('r1'),h.response('r2'),h.response('r3',{studentId:'002',email:'other@example.com'})];
  const rebuild=h.ctx.rebuild_; h.ctx.rebuild_=()=>{throw Error('Sheets write failed');};
  assert.throws(()=>h.ctx.runSync_(true),/Sheets write failed/);
  assert.equal(h.store.BP_Log.length,3); assert.equal(h.store.BP_Log.filter(r=>r.result==='ACCEPTED').length,1);
  h.ctx.rebuild_=rebuild; h.ctx.runSync_(true); h.ctx.runSync_(true);
  assert.equal(h.store.BP_Log.length,3); assert.equal(h.ctx.matrix[1][3],'OFF'); assert.equal(h.ctx.matrix[2][3],'');
  assert.equal(h.store.BP_Sessions[0].accepted,1); assert.equal(h.store.BP_Sessions[0].rejected,2);
});
test('manual close stores cutoff before Forms failure; repeat close retries safely', () => {
  const h=harness(); const before=Date.now();
  h.forms.form1.setAcceptingResponses=()=>{throw Error('Google unavailable');};
  assert.throws(()=>h.ctx.closeOfflineSession(h.session.id),/Google unavailable/);
  const s=h.store.BP_Sessions[0]; assert.equal(s.state,'CLOSED'); assert.ok(Date.parse(s.closesAt)>=before);
  h.forms.form1.setAcceptingResponses=()=>{};
  h.forms.form1.getResponses=()=>[h.response('late',{time:Date.parse(s.closesAt)+1})];
  h.ctx.closeOfflineSession(h.session.id);
  assert.equal(h.store.BP_Log[0].result,'OUTSIDE_WINDOW'); assert.equal(h.store.BP_Sessions[0].closesAt,s.closesAt);
});
test('unverified collection fails closed and records an actionable error', () => {
  const h=harness(); h.forms.form1.mode='RESPONDER_INPUT'; h.forms.form1.getResponses=()=>[h.response('r1')];
  assert.throws(()=>h.ctx.runSync_(true),/Not VERIFIED/); assert.equal(h.store.BP_Log.length,0);
  assert.match(h.props.BP_LAST_ERROR,/Not VERIFIED/);
});
test('expiry uses server window even if close trigger is late', () => {
  const h=harness(); h.store.BP_Sessions[0].closesAt=new Date(Date.now()-1000).toISOString();
  h.forms.form1.getResponses=()=>[h.response('late',{time:Date.now()})];
  h.ctx.runSync_(true);
  assert.equal(h.store.BP_Sessions[0].state,'CLOSED'); assert.equal(h.store.BP_Log[0].result,'OUTSIDE_WINDOW');
});
test('online import is atomic on unknown IDs and idempotent on repeated lists', () => {
  const h=harness();
  assert.throws(()=>h.ctx.importOnline('2026-09-09','001\n999','report'),/MSSV/);
  assert.equal(h.store.BP_Log.length,0); assert.equal(h.store.BP_Sessions.length,1);
  h.ctx.importOnline('2026-09-09','001 - An\n002 - Bình','TA checked report');
  h.ctx.importOnline('2026-09-09','001\n002','TA checked report');
  assert.equal(h.store.BP_Log.length,2); assert.equal(h.ctx.matrix[1][3],'ON');
  assert.equal(h.store.BP_Log[0].email,''); assert.match(h.store.BP_Log[0].note,/TA_REVIEWED/);
});
test('manual correction survives another automatic refresh and retains reason/actor', () => {
  const h=harness(); h.forms.form1.getResponses=()=>[h.response('r1')];
  h.ctx.runSync_(true); h.ctx.addOverride('2026-09-09','001','V','Card check: not in room'); h.ctx.runSync_(true);
  assert.equal(h.ctx.matrix[1][3],'V'); assert.equal(h.store.BP_Log[0].result,'ACCEPTED');
  assert.equal(h.store.BP_Overrides[0].actor,'ta@school.example');
});
test('real row numbers are retained after a blank session row', () => {
  const ctx=vm.createContext({BP}); vm.runInContext(fs.readFileSync(require.resolve('../apps-script/Code.gs'),'utf8'),ctx);
  const headers=ctx.BP_HEADERS.BP_Sessions;
  ctx.grid_=()=>[headers.map(()=>''),headers.map(key=>key==='id'?'session2':'')];
  assert.equal(ctx.objects_('BP_Sessions')[0]._row,3);
});
test('a failed operation releases lock for the next operation', () => {
  const h=harness(); assert.throws(()=>h.ctx.locked_(()=>{throw Error('fail');}),/fail/);
  assert.equal(h.ctx.locked_(()=>42),42);
  assert.throws(()=>h.ctx.locked_(()=>h.ctx.locked_(()=>42)),/thao tác khác/);
});
