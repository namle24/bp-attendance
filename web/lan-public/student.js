'use strict';
const $=id=>document.getElementById(id);let session,pending,busy=false,scanGrant,scanAt=0;
let positionSample=null,positionAt=0,positionRound='',cancelPosition;
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').className=error?'notice error':'notice';};
function loadPending(sid){try{
  const current=JSON.parse(sessionStorage.getItem('bp-lan-pending')||'null');
  if(current)sessionStorage.setItem('bp-lan-pending:'+current.sessionId,JSON.stringify(current));
  return !sid||(current&&current.sessionId===sid)?current:JSON.parse(sessionStorage.getItem('bp-lan-pending:'+sid)||'null');
}catch{return null;}}
function loadGrant(){try{return JSON.parse(sessionStorage.getItem('bp-lan-scan')||'null');}catch{return null;}}
function saveGrant(){try{sessionStorage.setItem('bp-lan-scan',JSON.stringify(scanGrant));}catch{}}
function remaining(){return scanGrant?scanGrant.expiresAt-scanGrant.serverTime-(performance.now()-scanAt):0;}
function scanClock(){
  if(pending&&pending.receipt){$('scan-time').textContent='';return;}
  const left=remaining();$('scan-time').textContent=left>0?'Thời gian nhập còn '+Math.ceil(left/1000)+' giây. Giữ nguyên Wi-Fi.':'';
  if(left<=0&&session)$('scan-form').hidden=false;
}
async function admit(input){
  scanGrant=await request('/api/scan',input);scanAt=performance.now();saveGrant();
  const previous=pending||loadPending();session=scanGrant.session;
  pending=previous&&previous.sessionId===session.id?previous:loadPending(session.id);
  if(!pending&&previous){$('student-id').value=previous.studentId;$('full-name').value=previous.name;$('seat').value=previous.seat;}
  lockFields();$('receipt').hidden=true;$('reload').hidden=false;showRound();
  if(pending&&pending.sessionId===scanGrant.sessionId){pending.scanTicket=scanGrant.scanTicket;savePending();}
  if(pending&&pending.receipt){receipt(pending.receipt);return;}
  $('scan-form').hidden=true;$('attendance-form').hidden=false;
  notice('Đã xác nhận mã trong phòng. Nhập MSSV, họ tên và vị trí ngồi rồi gửi.');scanClock();
}
function lockFields(){for(const id of ['student-id','full-name','seat'])$(id).readOnly=!!pending;$('location-button').disabled=!!pending;}
function savePending(){lockFields();try{sessionStorage.setItem('bp-lan-pending',JSON.stringify(pending));if(pending)sessionStorage.setItem('bp-lan-pending:'+pending.sessionId,JSON.stringify(pending));}catch{}}
function showRound(){
  $('date').textContent=session?session.date+' · Đợt '+session.number+(session.label?' · '+session.label:''):'';
  const key=session?session.id+':'+session.generation:'';
  if(key!==positionRound){if(cancelPosition)cancelPosition();cancelPosition=null;positionSample=null;positionRound=key;$('location-status').textContent='Chưa lấy vị trí. Nếu gửi ngay, lượt gửi sẽ cần TA kiểm tra.';}
  const enabled=session&&session.location&&session.location.enabled;
  $('location-section').hidden=!enabled;
  if(enabled)$('location-info').textContent='Bán kính lớp: '+session.location.radius+' m. Bấm Lấy vị trí, cho phép trong tab mới rồi quay lại đây để gửi.';
}
function randomId(){return BPClient.randomId();}
function request(url,data){return BPClient.request(url,data);}
function receipt(row){
  $('receipt-title').textContent=row.status==='PENDING'?'Đã lưu, chờ TA đối chiếu':row.status==='REJECTED'?'TA không xác nhận điểm danh':'Đã ghi nhận điểm danh';
  $('receipt-fields').textContent='';
  for(const [key,value] of [['Đợt','Đợt '+(row.roundNumber||1)+(row.roundLabel?' · '+row.roundLabel:'')],['MSSV',row.studentId],['Họ tên',row.name],['Vị trí ngồi',row.seat],['Thời gian',BPClient.time(row.at)]]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;$('receipt-fields').appendChild(dt);$('receipt-fields').appendChild(dd);
  }
  if(row.location){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent='Đối chiếu vị trí';dd.textContent=row.location.status==='INSIDE'?'Trong phạm vi theo vị trí thiết bị cung cấp.':row.location.reason+' Cần TA xác minh.';$('receipt-fields').appendChild(dt);$('receipt-fields').appendChild(dd);}
  $('attendance-form').hidden=true;$('scan-form').hidden=true;$('scan-time').textContent='';$('receipt').hidden=false;$('reload').hidden=false;$('reload').textContent='Kiểm tra đợt điểm danh tiếp theo';
  notice(row.status==='REJECTED'?'Lượt gửi đã được TA đối chiếu và không xác nhận. Liên hệ TA nếu cần làm rõ.':row.status==='PENDING'?'Đã lưu. TA sẽ đối chiếu thông tin tại ghế ngồi.':row.duplicate?'Lượt gửi này đã được lưu trước đó.':'Điểm danh đã được lưu.');
}
async function boot(){
  $('reload').disabled=true;
  try{
    // Admit immediately: a slow session fetch must not consume the 30-second QR window.
    const token=BPClient.fragment('qr'),code=BPClient.fragment('code');
    if(token||code){
      try{
        await admit(token?{token}:{code});
        try{history.replaceState(null,'',location.pathname);}catch{}
        $('connection-help').open=false;
      }catch(error){
        // Keep the link after transport failure so the retry button can use it again.
        if(error.code){try{history.replaceState(null,'',location.pathname);}catch{}}
        $('receipt').hidden=true;$('attendance-form').hidden=true;$('scan-form').hidden=false;
        notice(error.message||'Chưa xác nhận được QR. Quét lại mã đang chiếu.',true);$('connection-help').open=true;
      }
      return;
    }
    const data=await request('/api/session'),previous=pending||loadPending();session=data.session;
    pending=previous&&(!session||previous.sessionId===session.id)?previous:loadPending(session&&session.id);
    $('receipt').hidden=true;$('reload').hidden=false;$('reload').textContent='Kiểm tra đợt điểm danh';
    if(!pending&&previous){$('student-id').value=previous.studentId;$('full-name').value=previous.name;$('seat').value=previous.seat;}
    lockFields();
    scanGrant=loadGrant();if(scanGrant){scanGrant.serverTime=data.serverTime;scanAt=performance.now();if(!session||scanGrant.sessionId!==session.id||((scanGrant.session&&scanGrant.session.generation)||0)!==(session.generation||0))scanGrant=null;}
    if(pending&&(!session||pending.sessionId===session.id)){
      // Retain the exact body and request key after an uncertain response, even
      // after the window closes. The server can safely recover only this receipt.
      $('student-id').value=pending.studentId;$('full-name').value=pending.name;$('seat').value=pending.seat;lockFields();
      $('attendance-form').hidden=false;notice('Bạn đã gửi thông tin trên trang này. Bấm gửi lại để kiểm tra kết quả đã lưu.');
      if(pending.receipt)receipt(pending.receipt);
    }else if(session){pending=null;savePending();$('attendance-form').hidden=remaining()<=0;$('scan-form').hidden=remaining()>0;notice(remaining()>0?'Nhập thông tin và gửi trước khi hết thời gian.':'Quét QR hoặc nhập mã đang chiếu trong phòng để điểm danh.');}
    else{$('attendance-form').hidden=true;$('scan-form').hidden=true;notice('Chưa mở điểm danh hoặc đã hết giờ. Chờ hướng dẫn của TA.');}
    showRound();
    scanClock();
  }catch(error){notice(error.message||'Chưa kết nối được máy host. Kiểm tra Wi-Fi và thử lại.',true);$('connection-help').open=true;$('scan-form').hidden=false;}
  finally{$('reload').disabled=false;}
}
$('attendance-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;$('submit').disabled=true;
  try{
    if(!pending){if(!session)throw Error('Chưa mở điểm danh.');if(remaining()<=0){$('scan-form').hidden=false;throw Error('Quét QR hoặc nhập mã đang chiếu để tiếp tục.');}pending={sessionId:session.id,studentId:$('student-id').value.trim().toUpperCase(),name:$('full-name').value.trim().replace(/\s+/g,' '),seat:$('seat').value.trim().replace(/\s+/g,' '),requestId:randomId(),scanTicket:scanGrant.scanTicket};
      if(session.location&&session.location.enabled&&positionSample){pending.location=Object.assign({},positionSample);if(pending.location.status==='OK')pending.location.ageMs+=Math.max(0,performance.now()-positionAt);}
    }
    savePending();notice('Đang gửi điểm danh…');
    const {receipt:row}=await request('/api/check-in',pending);pending.receipt=row;delete pending.location;positionSample=null;savePending();receipt(row);
  }catch(error){
    if(['INPUT_INVALID','ID_INVALID','REQUEST_INVALID','ALREADY_RECORDED'].includes(error.code)){pending=null;savePending();notice(error.message,true);}
    else if(error.code){if(['SCAN_REQUIRED','SCAN_INVALID','SCAN_EXPIRED'].includes(error.code)){$('scan-form').hidden=false;scanGrant=null;saveGrant();}notice(error.message,true);}
    else notice(pending?'Chưa xác nhận được kết quả. Giữ trang này và bấm gửi lại; hệ thống sẽ kiểm tra lượt gửi trước.':error.message||'Quét QR hoặc nhập mã đang chiếu để tiếp tục.',true);
  }finally{busy=false;$('submit').disabled=false;}
});
$('reload').addEventListener('click',boot);boot();
$('location-button').addEventListener('click',()=>{
  if(!session||!session.location||!session.location.enabled||pending)return;
  if(cancelPosition)cancelPosition();const key=positionRound;
  positionSample=null;$('location-status').textContent='Cho phép vị trí trong tab mới rồi quay lại trang này.';
  cancelPosition=BPGeo.request(session.location.helperUrl,sample=>{
    if(key!==positionRound)return;positionSample=sample;positionAt=performance.now();
    $('location-status').textContent=sample.status==='OK'?'Đã lấy vị trí; sai số khoảng '+Math.ceil(sample.accuracy)+' m. Gửi trong vòng 60 giây.':BPGeo.failure(sample.status)+'. Bạn có thể thử lại hoặc gửi để TA kiểm tra tại ghế.';
  });
});
$('scan-form').addEventListener('submit',async event=>{event.preventDefault();$('scan-submit').disabled=true;try{await admit({code:$('room-code').value});}catch(error){notice(error.message||'Chưa xác nhận được mã. Kiểm tra Wi-Fi rồi thử lại.',true);}finally{$('scan-submit').disabled=false;}});
window.addEventListener('hashchange',boot);setInterval(scanClock,1000);
