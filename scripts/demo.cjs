// Local UI preview only: all RPCs are simulated. No Google credentials or network calls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const bridge = `<script>
(() => {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const state = {today,students:700,automation:'demo',lastSync:new Date().toISOString(),error:'',sessions:[]};
  function add(date) { if(state.sessions.some(s=>s.date===date)) throw Error('Ngày này đã có phiên demo.');
    state.sessions.unshift({id:date+'|OFFLINE',date,state:'DRAFT',formId:'demo',url:'https://example.invalid/bp-demo',editUrl:'https://example.invalid/bp-demo',code:'BP26A9',accepted:0,rejected:0}); }
  const copy = () => structuredClone(state);
  add(today);
  window.BP_DEMO = {
    getDashboard:copy,
    createOfflineSession(date){add(date);return copy();},
    openOfflineSession(id,minutes){const s=state.sessions.find(s=>s.id===id);s.state='OPEN';s.openedAt=new Date().toISOString();s.closesAt=new Date(Date.now()+minutes*60000).toISOString();return copy();},
    closeOfflineSession(id){state.sessions.find(s=>s.id===id).state='CLOSED';return copy();},
    syncNow(){const s=state.sessions.find(s=>s.state==='OPEN');if(s){s.accepted=Math.min(700,s.accepted+137);s.rejected=3;}state.lastSync=new Date().toISOString();return copy();},
    previewOnline(text){return {accepted:[...new Set(text.trim().split(/\\n/).filter(Boolean))],invalid:[]};},
    importOnline(){return {message:'DEMO: mô phỏng nhập danh sách online; chưa ghi dữ liệu thật.'};},
    addOverride(){return {message:'DEMO: mô phỏng điều chỉnh; chưa ghi dữ liệu thật.'};}
  };
})();
</script>`;
const page = fs.readFileSync(path.join(root, 'apps-script/Panel.html'), 'utf8')
  .replace("<?!= include_('Qr'); ?>", () => fs.readFileSync(path.join(root, 'apps-script/Qr.html'), 'utf8') + bridge);
const port = Number(process.env.BP_DEMO_PORT || 4173);
http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(page);
}).listen(port, '127.0.0.1', () => console.log('UI demo (fake data only): http://127.0.0.1:' + port));
