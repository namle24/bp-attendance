'use strict';
const $=id=>document.getElementById(id);
let dashboard,selected='',entries=[],reviewing,busy=false,refreshQueued=false,loadedURL='',screen='attendance';
let currentQr,qrBusy=false,qrAt=0;
let projectorWindow;
function drawQr(){
  const remaining=currentQr?currentQr.expiresAt-currentQr.serverTime-(performance.now()-qrAt):0;
  if(remaining<=0){$('qr').replaceChildren();$('attendance-code').textContent='';$('qr-countdown').textContent=currentQr?'Đang đổi QR…':'';loadedURL='';return;}
  if(loadedURL!==currentQr.url){const qr=qrcode(0,'M');qr.addData(currentQr.url);qr.make();$('qr').innerHTML=qr.createSvgTag({cellSize:8,margin:32,scalable:true});loadedURL=currentQr.url;}
  $('attendance-code').textContent=currentQr.code.slice(0,4)+' '+currentQr.code.slice(4);
  $('qr-countdown').textContent='QR và mã đổi sau '+Math.ceil(remaining/1000)+' giây';
}
async function refreshQr(){
  if(qrBusy||!dashboard)return;qrBusy=true;
  try{
    const shown=dashboard.sessions.find(s=>s.id===selected);
    if(!active(shown)){currentQr=null;drawQr();return;}
    const result=await api('/api/qr');currentQr=result.qr;qrAt=performance.now();drawQr();
  }catch{if(!currentQr)$('qr-countdown').textContent='Chưa lấy được QR. Kiểm tra máy host.';}
  finally{qrBusy=false;}
}
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'notice error':'notice';}
function api(url,data){return BPClient.request(url,data,{timeout:20000,headers:{'X-CSRF-Token':dashboard?.csrf||''}});}
function active(s){return s&&s.mode==='OFFLINE'&&!s.closed_at&&s.ends_at>dashboard.serverTime;}
function roundTitle(s){return 'Đợt '+s.number+(s.label?' · '+s.label:'');}
function showScreen(){
  const next=location.hash.slice(1);screen=['attendance','history','issues'].includes(next)?next:'attendance';
  for(const panel of document.querySelectorAll('[data-screen]'))panel.hidden=panel.dataset.screen!==screen;
  for(const link of document.querySelectorAll('.screen-nav a')){if(link.hash==='#'+screen)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
}
function project(){
  if(projectorWindow&&!projectorWindow.closed){projectorWindow.focus();return true;}
  projectorWindow=window.open('/projector/','bp-attendance-projector');
  if(projectorWindow){projectorWindow.focus();return true;}
  notice('Trình duyệt đang chặn tab mới.');
  const link=document.createElement('a');link.href='/projector/';link.target='_blank';link.rel='noopener';link.textContent='Mở tab chiếu QR';$('notice').append(' ',link);
  return false;
}
function openReview(entry){
  reviewing=entry;$('review-title').textContent=entry.student_id+' · '+entry.name;
  $('review-detail').textContent=entry.date+' · Đợt '+entry.round_number+(entry.round_label?' · '+entry.round_label:'')+' · Ghế: '+entry.seat+' · IP: '+entry.ip+' · '+entry.peers+' MSSV';
  $('review-note').value=entry.review_note;$('review-result').value=entry.status==='REJECTED'?'REJECTED':'CONFIRMED';$('review-error').textContent='';$('review-dialog').showModal();
}
function renderTable(id,rows,dated=false){
  const table=$(id);table.replaceChildren();
  for(const entry of rows){
    const tr=document.createElement('tr');tr.dataset.entryId=entry.id;
    if(entry.status==='PENDING')tr.className='flagged';else if(entry.status==='REJECTED')tr.className='rejected';
    const values=[entry.student_id+'\n'+entry.name,entry.seat,entry.ip+'\n'+entry.peers+' MSSV',entry.statusLabel];
    if(dated){values.unshift(entry.date+'\nĐợt '+entry.round_number+(entry.round_label?' · '+entry.round_label:''));values.push(entry.reason?(entry.reason+(entry.review_note&&entry.review_note!==entry.reason?'\nGhi chú trước: '+entry.review_note:'')):(entry.review_note||'—'));}
    for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.className='secondary';button.textContent='Đối chiếu';button.addEventListener('click',()=>openReview(entry));td.append(button);tr.append(td);table.append(tr);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=dated?7:5;td.textContent='Không có bản ghi phù hợp.';tr.append(td);table.append(tr);}
}
function renderEntries(){
  $('review-summary').textContent=`${entries.length} lượt gửi · ${entries.filter(e=>e.status==='PENDING').length} cần TA xác nhận`;
  renderTable('entries',entries.filter(e=>!$('only-pending').checked||e.status==='PENDING'));
}
function fillDates(id){
  const select=$(id),dates=[...new Set(dashboard.sessions.map(s=>s.date))].sort().reverse(),key=dates.join(',');
  if(select.dataset.dates===key)return;
  const previous=select.value;select.replaceChildren(...['',...dates].map(date=>{const option=document.createElement('option');option.value=date;option.textContent=date||'Tất cả các ngày';return option;}));
  select.value=dates.includes(previous)?previous:'';select.dataset.dates=key;
}
function downloadLink(id,url){
  const link=$(id);if(url){link.href=url;link.removeAttribute('aria-disabled');}else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');}
}
function markLoading(){
  if(screen==='history'){for(const id of ['history-summary-export','history-detail-export'])downloadLink(id);$('history-summary').textContent='Đang tải dữ liệu…';}
  if(screen==='issues'){downloadLink('issues-export');$('issues-summary').textContent='Đang tải danh sách…';}
}
async function refreshReports(){
  fillDates('history-date');fillDates('issues-date');
  if(screen==='history'){
    const date=$('history-date').value,query=new URLSearchParams({date}).toString(),data=await api('/api/history?'+query);
    if(screen!=='history'||date!==$('history-date').value)return;
    renderTable('history-entries',data.entries,true);
    $('history-summary').textContent=(date||'Tất cả các ngày')+' · '+data.entries.length+' lượt gửi offline · '+new Set(data.entries.map(e=>e.student_id)).size+' MSSV';
    downloadLink('history-summary-export','/api/export.csv?'+query);downloadLink('history-detail-export','/api/detail.csv?'+query);
    const lookup=await api('/api/lookup-source');
    if(!$('lookup-sheet').dataset.loaded){$('lookup-sheet').value=lookup.source?'https://docs.google.com/spreadsheets/d/'+lookup.source.spreadsheetId+'/edit'+(lookup.source.gid!==undefined?'#gid='+lookup.source.gid:''):'';$('lookup-tab').value=lookup.source?.tab||'';$('lookup-sheet').dataset.loaded='1';}
    $('lookup-link').href=dashboard.url+'/history';
    $('lookup-status').textContent=!lookup.configured?'Chưa chọn Google Sheet kết quả.':lookup.error?lookup.error:lookup.refreshing?'Đang đọc Google Sheet…':lookup.updatedAt?'Đã đọc Sheet lúc '+BPClient.time(lookup.updatedAt)+(lookup.stale?' · Chưa lấy được bản mới.':''):'Đang chờ lần đọc Sheet đầu tiên.';
    $('lookup-status').className=lookup.error||lookup.stale?'notice error':'muted';$('lookup-refresh').disabled=!lookup.configured||lookup.refreshing;
  }else if(screen==='issues'){
    const date=$('issues-date').value,status=$('issues-status').value,query=new URLSearchParams({date,status}).toString(),data=await api('/api/issues?'+query);
    if(screen!=='issues'||date!==$('issues-date').value||status!==$('issues-status').value)return;
    renderTable('issues-entries',data.entries,true);
    $('issues-pending').textContent=data.counts.pending+' chờ đối chiếu';$('issues-rejected').textContent=data.counts.rejected+' không hợp lệ';
    $('issues-summary').textContent=(date||'Tất cả các ngày')+' · '+data.entries.length+' bản ghi đang hiển thị · '+new Set(data.entries.map(e=>e.student_id)).size+' MSSV';
    downloadLink('issues-export','/api/issues.csv?'+query);
  }
}
async function refresh(){
  dashboard=await api('/api/dashboard');$('today').textContent=dashboard.today;$('online-date').value||=dashboard.today;
  const offline=dashboard.sessions.filter(s=>s.mode==='OFFLINE'),live=offline.find(active);if(!selected)selected=live?.id||offline[0]?.id||'';
  $('session').replaceChildren(...offline.map(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=s.date+' · '+roundTitle(s)+(active(s)?' · đang mở':'');return option;}));$('session').value=selected;
  const current=offline.find(s=>s.date===dashboard.today),shown=offline.find(s=>s.id===selected);
  $('open').disabled=!!live;$('open').textContent=current?'Mở đợt mới':'Mở QR điểm danh';$('close').disabled=!active(shown);$('project').hidden=!live;
  $('reopen').disabled=!!live||!shown||shown.date!==dashboard.today;$('reopen').hidden=!shown||shown.date!==dashboard.today;
  $('round-help').textContent=live?'Đóng đợt đang nhận trước khi mở đợt mới hoặc mở lại.':current?'Đợt mới: mọi sinh viên điểm danh lại. Mở lại: giữ danh sách của đợt đang xem.':'Mỗi ngày là một buổi học; có thể mở nhiều đợt điểm danh trong buổi.';
  $('round-title').textContent=shown?roundTitle(shown):'';
  $('session-state').textContent=active(shown)?'ĐANG NHẬN ĐIỂM DANH':shown?'ĐỢT ĐÃ ĐÓNG':'CHƯA MỞ ĐỢT';
  $('session-end').textContent=active(shown)?'Đóng lúc '+new Date(shown.ends_at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'';
  $('count').textContent=(shown?.count||0)+' sinh viên';$('student-url').textContent=dashboard.url;
  await refreshQr();
  const sync=dashboard.sync;$('sync').disabled=!sync.enabled||sync.busy;
  $('sync-state').textContent=!sync.enabled?'Lưu trên laptop · Sheet chưa cấu hình':sync.error?'Sheet chưa đồng bộ được · dữ liệu đã lưu trên laptop':sync.pending?'Đang chờ đồng bộ Sheet':'Sheet đã đồng bộ';
  $('network').textContent=dashboard.network+' · '+dashboard.cidrs.join(', ');
  if(screen==='attendance'){entries=selected?(await api('/api/entries?session='+encodeURIComponent(selected))).entries:[];renderEntries();}
  await refreshReports();
}
async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(error){notice(error.message,true);}finally{busy=false;if(refreshQueued){refreshQueued=false;requestRefresh();}}}
function requestRefresh(){markLoading();if(busy){refreshQueued=true;return;}void action(async()=>{});}
$('open').addEventListener('click',()=>{
  if(busy)return;
  // Open during the click gesture, before any await, so browsers allow the tab.
  const opened=project();
  void action(async()=>{const result=await api('/api/sessions',{minutes:Number($('minutes').value),label:$('round-label').value.trim()});selected=result.session.id;$('round-label').value='';if(opened)notice('Đã mở '+roundTitle(result.session)+'. Sinh viên quét QR mới để điểm danh.');});
});
$('reopen').addEventListener('click',()=>{
  if(busy)return;const id=selected,opened=project();
  void action(async()=>{const result=await api('/api/sessions/'+id+'/reopen',{minutes:Number($('minutes').value)});selected=result.session.id;if(opened)notice('Đã mở lại '+roundTitle(result.session)+'. Giữ nguyên các lượt đã điểm danh; dùng QR mới cho lượt bổ sung.');});
});
$('close').addEventListener('click',()=>action(async()=>{await api('/api/sessions/'+selected+'/close',{});notice('Đã đóng đợt điểm danh.');}));
$('project').addEventListener('click',project);
$('session').addEventListener('change',()=>{selected=$('session').value;requestRefresh();});$('only-pending').addEventListener('change',renderEntries);
for(const id of ['history-date','issues-date','issues-status'])$(id).addEventListener('change',requestRefresh);
window.addEventListener('hashchange',()=>{showScreen();requestRefresh();});
$('sync').addEventListener('click',()=>action(async()=>{await api('/api/sync',{});notice('Đã yêu cầu đồng bộ Sheet.');}));
$('lookup-save').addEventListener('click',()=>action(async()=>{await api('/api/lookup-source',{spreadsheetId:$('lookup-sheet').value,tab:$('lookup-tab').value});notice('Đã lưu nguồn tra cứu. Đang lấy kết quả từ Google Sheet.');}));
$('lookup-refresh').addEventListener('click',()=>action(async()=>{await api('/api/lookup-refresh',{});notice('Đã yêu cầu lấy bản kết quả mới từ Google Sheet.');}));
$('cancel-review').addEventListener('click',()=>$('review-dialog').close());
$('review-form').addEventListener('submit',async event=>{event.preventDefault();$('save-review').disabled=true;try{await api('/api/entries/'+reviewing.id+'/review',{review:$('review-result').value,note:$('review-note').value,peers:reviewing.peers});$('review-dialog').close();await refresh();notice('Đã lưu kết quả đối chiếu của TA.');}catch(error){$('review-error').textContent=error.message;}finally{$('save-review').disabled=false;}});
$('import-roster').addEventListener('click',()=>action(async()=>{const file=$('roster').files[0];if(!file)throw Error('Chọn file CSV danh sách lớp.');const result=await api('/api/roster',{csv:await file.text()});notice('Đã nhập '+result.count+' sinh viên.');}));
$('import-online').addEventListener('click',()=>action(async()=>{const result=await api('/api/online',{date:$('online-date').value,list:$('online-list').value,evidence:$('online-evidence').value});notice('Đã bổ sung '+result.count+' kết quả online.');}));
showScreen();requestRefresh();setInterval(()=>{if(!busy&&!$('review-dialog').open)requestRefresh();},10000);
setInterval(()=>{drawQr();void refreshQr();},1000);
