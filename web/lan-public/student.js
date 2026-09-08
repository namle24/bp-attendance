'use strict';
const $=id=>document.getElementById(id);let session,pending,busy=false;
const notice=(message,error=false)=>{$('notice').textContent=message;$('notice').className=error?'notice error':'notice';};
function loadPending(){try{return JSON.parse(sessionStorage.getItem('bp-lan-pending')||'null');}catch{return null;}}
function lockFields(){for(const id of ['student-id','full-name','seat'])$(id).readOnly=!!pending;}
function savePending(){lockFields();try{sessionStorage.setItem('bp-lan-pending',JSON.stringify(pending));}catch{}}
function randomId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
async function request(url,data){
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000),...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
  const body=await response.json();if(!response.ok){const error=Error(body.message||'Không gửi được điểm danh.');error.code=body.code;throw error;}return body;
}
function receipt(row){
  $('receipt-fields').replaceChildren();
  for(const [key,value] of [['MSSV',row.studentId],['Họ tên',row.name],['Vị trí ngồi',row.seat],['Thời gian',new Date(row.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})]]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;$('receipt-fields').append(dt,dd);
  }
  $('attendance-form').hidden=true;$('receipt').hidden=false;$('reload').hidden=true;
  notice(row.duplicate?'Lượt gửi này đã được lưu trước đó.':row.status==='PENDING'?'Đã lưu. TA sẽ đối chiếu thông tin tại ghế ngồi.':'Điểm danh đã được lưu.');
}
async function boot(){
  $('reload').disabled=true;
  try{
    const data=await request('/api/session');session=data.session;pending=loadPending();
    if(pending&&(!session||pending.sessionId===session.id)){
      // Retain the exact body and request key after an uncertain response, even
      // after the window closes. The server can safely recover only this receipt.
      $('student-id').value=pending.studentId;$('full-name').value=pending.name;$('seat').value=pending.seat;lockFields();
      $('attendance-form').hidden=false;notice('Bạn đã gửi thông tin trên trang này. Bấm gửi lại để kiểm tra kết quả đã lưu.');
      if(pending.receipt)receipt(pending.receipt);
    }else if(session){pending=null;savePending();$('attendance-form').hidden=false;notice('Đang mở điểm danh đến '+new Date(session.endsAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'})+'.');}
    else{$('attendance-form').hidden=true;notice('Chưa mở điểm danh hoặc đã hết giờ. Chờ hướng dẫn của TA.');}
    $('date').textContent=session?session.date:'';
  }catch{notice('Chưa kết nối được máy host. Kiểm tra Wi-Fi và thử lại.',true);}
  finally{$('reload').disabled=false;}
}
$('attendance-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;$('submit').disabled=true;
  try{
    if(!pending){if(!session)throw Error('Chưa mở điểm danh.');pending={sessionId:session.id,studentId:$('student-id').value.trim().toUpperCase(),name:$('full-name').value.trim().replace(/\s+/g,' '),seat:$('seat').value.trim().replace(/\s+/g,' '),requestId:randomId()};}
    savePending();notice('Đang gửi điểm danh…');
    const {receipt:row}=await request('/api/check-in',pending);pending.receipt=row;savePending();receipt(row);
  }catch(error){
    if(['INPUT_INVALID','ID_INVALID','REQUEST_INVALID','ALREADY_RECORDED'].includes(error.code)){pending=null;savePending();notice(error.message,true);}
    else if(error.code)notice(error.message,true);
    else notice('Chưa xác nhận được kết quả. Giữ trang này và bấm gửi lại; hệ thống sẽ kiểm tra lượt gửi trước.',true);
  }finally{busy=false;$('submit').disabled=false;}
});
$('reload').addEventListener('click',boot);boot();
