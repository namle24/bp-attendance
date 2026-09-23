// Server-rendered fallback: no JavaScript, external assets, GPS or browser storage API.
const {createHmac,randomBytes,createHash}=require('node:crypto');
const {equal,fail}=require('./security.cjs');
const css='body{margin:0;background:#f8f7f3;color:#253057;font:16px/1.6 system-ui,sans-serif}main{max-width:480px;margin:auto;padding:24px}h1{font-size:22px}h2{font-size:20px}label{display:block;margin:16px 0}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border:1px solid #bfc6dd;border-radius:10px}input{display:block;margin-top:6px;background:#fff}button{background:#293896;color:#fff}a{color:#293896}p[role=alert]{padding:12px;background:#fff0f1;color:#9b3549}';
const csp="default-src 'none'; style-src 'sha256-"+createHash('sha256').update(css).digest('base64')+"'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function token(device,secret,at){const expiry=at+30*60000;return expiry+'.'+createHmac('sha256',secret).update('simple:'+device+':'+expiry).digest('base64url');}
function verify(value,device,secret,at){
  const [expiry,sig,...extra]=String(value||'').split('.');
  if(!device||extra.length||!/^\d{13}$/.test(expiry)||Number(expiry)<at||Number(expiry)>at+30*60000||!equal(sig,createHmac('sha256',secret).update('simple:'+device+':'+expiry).digest('base64url')))fail(403,'FORM_EXPIRED','Mở lại biểu mẫu tối giản rồi nhập mã đang chiếu.');
}
function render({store,device,now,input={},message='',receipt=null,round}){
  const session=store.activeSession(now),hidden=(name,value)=>'<input type="hidden" name="'+name+'" value="'+escape(value)+'">';
  const row=receipt||(round?store.deviceReceipt(round,device):null)||(session?store.deviceReceipt(session.id,device):store.recentDeviceReceipt(device,require('./security.cjs').today(now)));
  let content;
  if(row){
    const title=row.duplicateReview?'Thiếu đối chiếu — trùng MSSV':row.status==='PENDING'?'Đã lưu, chờ TA đối chiếu':row.status==='REJECTED'?'TA không xác nhận điểm danh':row.duplicateAttempt?'TA đã đối chiếu MSSV này':'Đã ghi nhận điểm danh';
    content='<h2>'+title+'</h2><p>MSSV: <strong>'+escape(row.studentId)+'</strong><br>Họ tên: '+escape(row.name)+'<br>Ngày: '+escape(row.date)+' · Đợt '+row.roundNumber+'</p>';
    if(row.duplicateReview){
      content+='<p role="alert"><strong>MSSV đã được gửi từ trình duyệt khác.</strong> Lượt đầu được giữ lại; lượt trùng không tính thêm. Bổ sung email trường và mang thẻ sinh viên xuống bàn TA. <strong>Nếu chưa được TA xác nhận, đợt này tính là thiếu đối chiếu.</strong> Chỉ nhập email chưa hoàn tất xác nhận.</p>';
      content+=row.schoolEmail?'<p>Đã lưu email: <strong>'+escape(row.schoolEmail)+'</strong>. Mang thẻ sinh viên xuống bàn TA để hoàn tất đối chiếu.</p>':'<form action="/simple" method="post">'+hidden('action','supplement-email')+hidden('sessionId',row.sessionId)+hidden('formToken',token(device,store.meta('lanQrSecret'),now))+'<label>Email trường USTH<input type="email" name="email" required maxlength="254" autocomplete="email" autocapitalize="none" value="'+escape(input.email||'')+'"></label><button>Lưu email để TA đối chiếu</button></form>';
    }
    content+='<p>Trình duyệt này đã gửi trong đợt này. Nhờ TA nếu cần sửa thông tin.</p><p><a href="/simple?round='+encodeURIComponent(row.sessionId)+'">Cập nhật kết quả đối chiếu</a></p>';
  }else if(!session)content='<p>Chưa mở điểm danh hoặc đã hết giờ. Chờ TA mở đợt rồi tải lại trang.</p>';
  else content='<form action="/simple" method="post">'+hidden('formToken',token(device,store.meta('lanQrSecret'),now))+hidden('requestId',/^[a-f0-9]{32}$/.test(input.requestId)?input.requestId:randomBytes(16).toString('hex'))+hidden('sessionId',session.id)+'<p>'+escape(session.date)+' · Đợt '+session.number+'</p><label>Mã đang chiếu<input name="code" required maxlength="12" autocomplete="off" value="'+escape(input.code||'')+'"></label><label>Mã số sinh viên<input name="studentId" required maxlength="40" autocomplete="off" value="'+escape(input.studentId||'')+'"></label><label>Họ và tên<input name="name" required maxlength="120" autocomplete="name" value="'+escape(input.name||'')+'"></label><button>Gửi điểm danh</button></form><p>Mã đổi mỗi 30 giây. Nếu mã đã đổi khi điền xong, nhập mã mới trước khi gửi.</p>';
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Điểm danh tối giản · USTH</title><style>'+css+'</style></head><body><main><h1>USTH · Basic Programming</h1><p>Điểm danh tối giản</p>'+(message?'<p role="alert">'+escape(message)+'</p>':'')+content+'<p><a href="/simple">Kiểm tra đợt / tải lại</a> · <a href="/">Giao diện đầy đủ</a></p><p>Chỉ nhập MSSV và họ tên của bạn. Mỗi MSSV gửi một lần mỗi đợt. IP và email bổ sung (nếu trùng MSSV) được lưu để TA đối chiếu.</p></main></body></html>';
}
module.exports={render,verify,csp};
