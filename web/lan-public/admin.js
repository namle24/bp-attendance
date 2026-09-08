'use strict';
const $=id=>document.getElementById(id);let dashboard,selected='',entries=[],reviewing,busy=false,loadedURL='';
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'notice error':'notice';}
async function api(url,data){const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000),...(data?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':dashboard?.csrf||''},body:JSON.stringify(data)}:{})});const body=await response.json();if(!response.ok)throw Error(body.message||'Không xử lý được yêu cầu.');return body;}
function active(s){return s&&s.mode==='OFFLINE'&&!s.closed_at&&s.ends_at>dashboard.serverTime;}
function project(){document.body.classList.add('projecting');$('exit-project').hidden=false;window.scrollTo(0,0);}
function renderEntries(){
  $('entries').replaceChildren();const pending=entries.filter(e=>e.status==='PENDING').length;
  $('review-summary').textContent=`${entries.length} lượt gửi · ${pending} cần TA xác nhận`;
  for(const entry of entries.filter(e=>!$('only-pending').checked||e.status==='PENDING')){
    const tr=document.createElement('tr');if(entry.status==='PENDING')tr.className='flagged';
    for(const value of [entry.student_id+'\n'+entry.name,entry.seat,entry.ip+'\n'+entry.peers+' MSSV',entry.statusLabel]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.className='secondary';button.textContent='Đối chiếu';button.addEventListener('click',()=>{
      reviewing=entry;$('review-title').textContent=entry.student_id+' · '+entry.name;$('review-detail').textContent='Ghế: '+entry.seat+' · IP: '+entry.ip+' · '+entry.peers+' MSSV';$('review-note').value=entry.review_note;$('review-result').value=entry.status==='REJECTED'?'REJECTED':'CONFIRMED';$('review-error').textContent='';$('review-dialog').showModal();
    });td.append(button);tr.append(td);$('entries').append(tr);
  }
  if(!entries.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Chưa có lượt gửi trong phiên này.';tr.append(td);$('entries').append(tr);}
}
async function refresh(){
  dashboard=await api('/api/dashboard');$('today').textContent=dashboard.today;$('online-date').value||=dashboard.today;
  const offline=dashboard.sessions.filter(s=>s.mode==='OFFLINE');if(!selected)selected=offline[0]?.id||'';
  $('session').replaceChildren(...offline.map(s=>{const option=document.createElement('option');option.value=s.id;option.textContent=s.date;return option;}));$('session').value=selected;
  const current=offline.find(s=>s.date===dashboard.today),shown=offline.find(s=>s.id===selected);
  $('open').disabled=!!current;$('open').textContent=current?'Hôm nay đã mở phiên':'Mở QR điểm danh';$('close').disabled=!active(shown);$('project').hidden=!active(shown);
  $('session-state').textContent=active(shown)?'ĐANG NHẬN ĐIỂM DANH':shown?'PHIÊN ĐÃ ĐÓNG':'CHƯA MỞ PHIÊN';
  $('session-end').textContent=active(shown)?'Đóng lúc '+new Date(shown.ends_at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'';
  $('count').textContent=(shown?.count||0)+' sinh viên';$('student-url').textContent=dashboard.url;
  if(active(shown)){if(loadedURL!==dashboard.url){const qr=qrcode(0,'M');qr.addData(dashboard.url);qr.make();$('qr').innerHTML=qr.createSvgTag({cellSize:8,margin:32,scalable:true});loadedURL=dashboard.url;}}else{$('qr').replaceChildren();loadedURL='';}
  const sync=dashboard.sync;$('sync').disabled=!sync.enabled||sync.busy;
  $('sync-state').textContent=!sync.enabled?'Lưu trên laptop · Sheet chưa cấu hình':sync.error?'Sheet chưa đồng bộ được · dữ liệu đã lưu trên laptop':sync.pending?'Đang chờ đồng bộ Sheet':'Sheet đã đồng bộ';
  $('network').textContent=dashboard.network+' · '+dashboard.cidrs.join(', ');
  entries=selected?(await api('/api/entries?session='+encodeURIComponent(selected))).entries:[];renderEntries();
}
async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(error){notice(error.message,true);}finally{busy=false;}}
$('open').addEventListener('click',()=>action(async()=>{const result=await api('/api/sessions',{minutes:Number($('minutes').value)});selected=result.session.id;await refresh();notice('Đã mở điểm danh.');project();}));
$('close').addEventListener('click',()=>action(async()=>{await api('/api/sessions/'+selected+'/close',{});notice('Đã đóng phiên điểm danh.');}));
$('project').addEventListener('click',project);$('exit-project').addEventListener('click',()=>{document.body.classList.remove('projecting');$('exit-project').hidden=true;});
$('session').addEventListener('change',()=>action(async()=>{selected=$('session').value;}));$('only-pending').addEventListener('change',renderEntries);
$('sync').addEventListener('click',()=>action(async()=>{await api('/api/sync',{});notice('Đã yêu cầu đồng bộ Sheet.');}));
$('cancel-review').addEventListener('click',()=>$('review-dialog').close());
$('review-form').addEventListener('submit',async event=>{event.preventDefault();$('save-review').disabled=true;try{await api('/api/entries/'+reviewing.id+'/review',{review:$('review-result').value,note:$('review-note').value,peers:reviewing.peers});$('review-dialog').close();await refresh();notice('Đã lưu kết quả đối chiếu của TA.');}catch(error){$('review-error').textContent=error.message;}finally{$('save-review').disabled=false;}});
$('import-roster').addEventListener('click',()=>action(async()=>{const file=$('roster').files[0];if(!file)throw Error('Chọn file CSV danh sách lớp.');const result=await api('/api/roster',{csv:await file.text()});notice('Đã nhập '+result.count+' sinh viên.');}));
$('import-online').addEventListener('click',()=>action(async()=>{const result=await api('/api/online',{date:$('online-date').value,list:$('online-list').value,evidence:$('online-evidence').value});notice('Đã bổ sung '+result.count+' kết quả online.');}));
void action(async()=>{});setInterval(()=>{if(!busy&&!$('review-dialog').open)void action(async()=>{});},10000);
