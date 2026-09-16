'use strict';
const $=id=>document.getElementById(id);
let state,requestedAt=0,busy=false,loadedURL='',unavailable=false;
function draw(){
  const at=state?state.serverTime+performance.now()-requestedAt:0;
  const session=state?.session,open=session?.open&&session.endsAt>at;
  const qr=state?.qr,valid=!unavailable&&open&&qr&&qr.expiresAt>at;
  $('session-state').textContent=unavailable?'MẤT KẾT NỐI':!state?'ĐANG KẾT NỐI':open?'ĐANG NHẬN ĐIỂM DANH':session?'ĐỢT ĐÃ ĐÓNG':'CHƯA MỞ ĐỢT';
  $('session-date').textContent=session?session.date.split('-').reverse().join('/')+' · Đợt '+session.number+(session.label?' · '+session.label:'') : '';
  $('student-url').textContent=state?.url||'';
  $('count').textContent=session?session.count+' sinh viên đã gửi':'';
  $('session-end').textContent=open?'Còn '+Math.ceil((session.endsAt-at)/60000)+' phút · đóng lúc '+new Date(session.endsAt).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}):'';
  $('qr-placeholder').hidden=!!valid;
  if(!valid){
    $('qr').replaceChildren();loadedURL='';$('attendance-code').textContent='';$('qr-countdown').textContent='';
    $('qr-placeholder').textContent=unavailable?'Chưa kết nối được máy host. Đang thử lại…':!state?'Đang kết nối máy host…':open?'Đang đổi QR…':session?'Đã kết thúc điểm danh.':'Chờ TA mở phiên điểm danh.';
    return;
  }
  if(loadedURL!==qr.url){const code=qrcode(0,'M');code.addData(qr.url);code.make();$('qr').innerHTML=code.createSvgTag({cellSize:8,margin:32,scalable:true});loadedURL=qr.url;}
  $('attendance-code').textContent=qr.code.slice(0,4)+' '+qr.code.slice(4);
  $('qr-countdown').textContent='QR và mã đổi sau '+Math.ceil((qr.expiresAt-at)/1000)+' giây';
}
async function refresh(){
  if(busy)return;busy=true;
  const started=performance.now();
  try{
    const response=await fetch('/api/projector',{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Error('PROJECTOR_UNAVAILABLE');
    state=await response.json();requestedAt=started;unavailable=false;
  }catch{unavailable=true;}
  finally{busy=false;draw();}
}
function fullscreenState(){
  $('fullscreen').textContent=document.fullscreenElement?'Thoát toàn màn hình':'Toàn màn hình';
  $('fullscreen-hint').textContent=document.fullscreenElement?'Nhấn Esc để thoát toàn màn hình.':'Có thể kéo tab này sang màn hình máy chiếu.';
}
$('fullscreen').addEventListener('click',async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    else throw Error('FULLSCREEN_UNAVAILABLE');
  }catch{$('fullscreen-hint').textContent='Chọn toàn màn hình trong menu trình duyệt (F11 trên Windows/Linux).';}
});
document.addEventListener('fullscreenchange',fullscreenState);
document.addEventListener('visibilitychange',()=>{draw();if(!document.hidden)void refresh();});
draw();void refresh();setInterval(()=>void refresh(),1000);setInterval(draw,250);
