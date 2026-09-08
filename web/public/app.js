'use strict';
const $=id=>document.getElementById(id);
let bootstrap,csrf='',current,todaySession,rosterCount=0,qrInfo,serverOffset=0,busy=false,renderedToken='',dashboardPending=false,qrPending=false;
let token=sessionStorage.getItem('bp-qr')||'';
function readFragment(){if(location.hash.length>1){token=location.hash.slice(1);sessionStorage.setItem('bp-qr',token);history.replaceState(null,'',location.pathname);}}
readFragment();window.addEventListener('hashchange',()=>{readFragment();studentTick();});
function notice(message,error=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').classList.toggle('error',error);}
async function api(url,data){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{signal:controller.signal,credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
    let result;try{result=await response.json();}catch{throw Error('Không đọc được phản hồi. Kiểm tra kết nối mạng.');}
    if(!response.ok){const e=Error(result.error||'Yêu cầu thất bại.');e.code=result.code;throw e;}return result;
  }catch(e){
    if(controller.signal.aborted||e instanceof TypeError){const error=Error('Kết nối chậm hoặc bị gián đoạn. Kiểm tra mạng rồi thử lại.');error.code='NETWORK_UNCERTAIN';throw error;}
    throw e;
  }finally{clearTimeout(timer);}
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);notice('Đang xử lý…');try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);controls();studentTick();}}
function time(value){return new Date(value).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});}
function live(){return current&&!current.closed_at&&current.ends_at>Date.now()+serverOffset;}
function controls(){if(busy)return;
  const ended=todaySession&&(todaySession.closed_at||todaySession.ends_at<=Date.now()+serverOffset);
  $('open').disabled=!rosterCount||!!ended;
  $('open').textContent=ended?'Đã kết thúc điểm danh':todaySession?'Mở màn chiếu QR':'Mở QR điểm danh';
  $('open-help').textContent=!rosterCount?'Nhập danh sách lớp bên dưới trước buổi học.':ended?'Phiên hôm nay đã đóng. Liên hệ giảng viên nếu cần điều chỉnh.':todaySession?'Phiên đang mở. Chiếu QR để sinh viên điểm danh.':'Bấm mở khi lớp đã sẵn sàng. Phiên mặc định kéo dài 8 phút.';
$('close').disabled=!live();$('project').disabled=!current;$('copy-qr').disabled=!qrInfo||!live()||qrInfo.expiresAt<=Date.now()+serverOffset;}
async function start(){
  bootstrap=await api('/api/bootstrap');csrf=bootstrap.csrf;serverOffset=bootstrap.serverTime-Date.now();
  $('login').hidden=!!bootstrap.user;$('logout').hidden=!bootstrap.user;
  if(!bootstrap.user){
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      script.onload=()=>{google.accounts.id.initialize({client_id:bootstrap.clientId,nonce:bootstrap.nonce,callback:r=>action(async()=>{await api('/api/auth/google',{credential:r.credential});location.reload();})});google.accounts.id.renderButton($('google-button'),{type:'standard',size:'large',text:'signin_with',theme:'outline'});};
      script.onerror=()=>notice('Không tải được đăng nhập Google. Kiểm tra mạng và tải lại trang.',true);document.head.append(script);
    return;
  }
  if(bootstrap.user.admin){$('admin').hidden=false;await dashboard();setInterval(()=>{if(!busy)dashboard().catch(e=>{qrInfo=null;renderQr();notice(e.message,true);});},10000);setInterval(()=>{if(!busy&&live())refreshQr().catch(e=>{qrInfo=null;renderQr();notice(e.message,true);});},2000);}
  else{$('student').hidden=false;$('student-name').textContent=bootstrap.user.name;$('student-account').textContent=bootstrap.user.studentId+' · '+bootstrap.user.email;studentTick();await myAttendance();}
}
async function dashboard(){
  if(dashboardPending)return;dashboardPending=true;
  try{
  const data=await api('/api/admin/dashboard');serverOffset=data.serverTime-Date.now();const previous=$('session').value;
  bootstrap.today=data.today;rosterCount=data.students;$('roster-count').textContent=data.students+' sinh viên';$('today-title').textContent='Ngày '+data.today.split('-').reverse().join('/');
  $('sync-state').textContent=data.sync.error?'Sheets đang lỗi; bản ghi đã lưu, sẽ thử lại':data.sync.pending?'Đã lưu · đang chờ đồng bộ Sheets':data.sync.lastSync?'Đã đồng bộ Sheets lúc '+time(data.sync.lastSync):'Chưa có dữ liệu đồng bộ';
  if(data.sync.error)notice(data.sync.error,true);
  $('session').replaceChildren();const sessions=data.sessions.filter(s=>s.mode==='OFFLINE');
  todaySession=sessions.find(s=>s.date===data.today);
  if(!sessions.length)$('session').add(new Option('Chưa có phiên',''));
  for(const s of sessions)$('session').add(new Option(s.date+' · '+(s.closed_at||s.ends_at<=Date.now()+serverOffset?'Đã đóng':'Đang mở'),s.id));
  if(sessions.some(s=>s.id===previous))$('session').value=previous;
  current=sessions.find(s=>s.id===$('session').value);
  for(const id of ['online-date','correction-date'])if(!$(id).value)$(id).value=data.today;
  $('count').textContent=current?current.count+' sinh viên đã ghi nhận':'';
  $('session-title').textContent=current?'Basic Programming · '+current.date:'Quét QR tại phòng học';
  if(live())await refreshQr();else{qrInfo=null;renderQr();}controls();
  }finally{dashboardPending=false;}
}
async function refreshQr(){
  if(!live()||qrPending)return;qrPending=true;
  try{
  const sid=current.id;const data=await api('/api/admin/sessions/'+encodeURIComponent(sid)+'/qr');
  if(current?.id!==sid)return;qrInfo=data;serverOffset=data.serverTime-Date.now();renderQr();
  }finally{qrPending=false;}
}
function renderQr(){
  const now=Date.now()+serverOffset,valid=live()&&qrInfo&&qrInfo.expiresAt>now;
  $('session-state').textContent=live()?'ĐANG MỞ ĐIỂM DANH':'CHƯA MỞ / ĐÃ ĐÓNG';
  $('session-end').textContent=live()?'Phiên đóng lúc '+time(current.ends_at):'Liên hệ trợ giảng nếu cần hỗ trợ.';
  $('projector-code').hidden=!valid;$('display-code').textContent=valid?qrInfo.code.slice(0,4)+' '+qrInfo.code.slice(4):'';$('student-url').textContent=location.origin+'/check-in';
  if(valid){if(renderedToken!==qrInfo.token){const qr=qrcode(0,'M');qr.addData(qrInfo.url);qr.make();$('qr').innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});renderedToken=qrInfo.token;}$('qr-expiry').textContent='QR đổi sau '+Math.ceil((qrInfo.expiresAt-now)/1000)+' giây';}
  else{$('qr').textContent=live()?'Đang lấy QR mới…':'Phiên điểm danh chưa mở hoặc đã kết thúc.';$('qr-expiry').textContent='';renderedToken='';}
  controls();
}
function tokenExpiry(){try{return JSON.parse(atob(token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))).exp;}catch{return 0;}}
function studentTick(){
  if(!bootstrap?.user||bootstrap.user.admin)return;
  const remaining=tokenExpiry()-(Date.now()+serverOffset);
  const completed=!token&&!$('receipt').hidden;
  $('check-in').hidden=completed||!token;$('code-form').hidden=completed||(!!token&&remaining>0);$('submit-code').disabled=busy;
  $('check-in').disabled=busy||!token||remaining<=0;
  $('student-instruction').textContent=completed?'Điểm danh đã lưu. Bạn có thể đóng trang.':!token?'Quét QR bằng điện thoại hoặc nhập mã đang chiếu để điểm danh.':remaining>0?'Đã nhận QR. Bấm xác nhận trước khi mã hết hạn.':'QR đã hết hạn. Hãy quét lại mã mới đang chiếu; bạn vẫn đang đăng nhập.';
  $('student-expiry').textContent=token&&remaining>0?'Mã còn khoảng '+Math.ceil(remaining/1000)+' giây':'';
}
async function myAttendance(){const data=await api('/api/me/attendance');$('my-attendance').replaceChildren();for(const r of data.records){const div=document.createElement('div');div.textContent=r.date+' · '+r.mode+' · '+time(r.at);$('my-attendance').append(div);}if(!data.records.length)$('my-attendance').textContent='Chưa có lượt ghi nhận.';return data.records;}
function showReceipt(receipt){token='';sessionStorage.removeItem('bp-qr');$('receipt').hidden=false;$('receipt').textContent=(receipt.duplicate?'Bạn đã được ghi nhận trước đó':'Đã ghi nhận điểm danh')+' · '+receipt.studentId+' · '+receipt.date+' lúc '+time(receipt.at)+'.';notice('');}
$('logout').addEventListener('click',()=>action(async()=>{await api('/api/logout',{});location.reload();}));
async function submitAttendance(payload){
  let data;
  try{data=await api('/api/check-in',payload);}
  catch(error){
    // A lost HTTP response does not mean the write failed. Read the student's own record.
    try{const records=await myAttendance();const record=records.find(r=>r.date===bootstrap.today&&r.mode==='OFFLINE');if(record){showReceipt({...record,studentId:bootstrap.user.studentId,duplicate:true});return;}}catch{}
    if(error.code==='NETWORK_UNCERTAIN')error.message='Chưa xác nhận được kết quả do mất kết nối. Khi mạng ổn định, tải lại trang xem lịch sử hoặc quét mã mới và gửi lại; lượt đã lưu sẽ không bị nhân đôi.';
    throw error;
  }
  showReceipt(data.receipt);await myAttendance().catch(()=>{});
}
$('check-in').addEventListener('click',()=>action(()=>submitAttendance({token})));
$('code-form').addEventListener('submit',event=>{event.preventDefault();action(()=>submitAttendance({code:$('attendance-code').value}));});
$('session').addEventListener('change',()=>{qrInfo=null;action(async()=>{await dashboard();notice('');});});
function project(){document.body.classList.add('projection');$('exit-project').hidden=false;window.scrollTo(0,0);}
$('open').addEventListener('click',()=>action(async()=>{
  await dashboard();
  if(!todaySession){const data=await api('/api/admin/sessions',{date:bootstrap.today,minutes:Number($('duration').value)});todaySession=data.session;}
  $('session').value=todaySession.id;await dashboard();
  if(live()){project();notice('');}else notice('Phiên điểm danh hôm nay đã kết thúc.',true);
}));
$('close').addEventListener('click',()=>action(async()=>{await api('/api/admin/sessions/'+current.id+'/close',{});qrInfo=null;await dashboard();notice('Đã đóng phiên.');}));
$('project').addEventListener('click',project);
$('exit-project').addEventListener('click',()=>{document.body.classList.remove('projection');$('exit-project').hidden=true;});
$('copy-qr').addEventListener('click',()=>action(async()=>{await navigator.clipboard.writeText(qrInfo.url);notice('Đã sao chép QR hiện tại; link sẽ hết hạn cùng mã.');}));
$('sync').addEventListener('click',()=>action(async()=>{const r=await api('/api/admin/sync',{});await dashboard();notice(r.sync.error||(r.sync.pending?'Đã lưu, còn thay đổi chờ đồng bộ.':'Đã đồng bộ Sheets.'),!!r.sync.error);}));
$('roster-file').addEventListener('change',async()=>{if($('roster-file').files[0])$('roster-csv').value=await $('roster-file').files[0].text();});
$('import-roster').addEventListener('click',()=>action(async()=>{const r=await api('/api/admin/roster',{csv:$('roster-csv').value});await dashboard();notice('Đã nhập '+r.count+' sinh viên.');}));
$('import-online').addEventListener('click',()=>action(async()=>{const r=await api('/api/admin/online',{date:$('online-date').value,list:$('online-list').value,evidence:$('online-evidence').value});await dashboard();notice('Đã thêm '+r.count+' sinh viên online.');}));
$('correct').addEventListener('click',()=>action(async()=>{await api('/api/admin/corrections',{date:$('correction-date').value,studentId:$('correction-id').value,mark:$('correction-mark').value,reason:$('correction-reason').value});notice('Đã lưu điều chỉnh kèm lý do.');}));
$('load-audit').addEventListener('click',()=>action(async()=>{$('audit').textContent=JSON.stringify(await api('/api/admin/audit'),null,2);notice('');}));
setInterval(()=>{renderQr();studentTick();},250);
start().catch(e=>notice(e.message,true));
