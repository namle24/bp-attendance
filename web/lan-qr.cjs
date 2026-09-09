const crypto=require('node:crypto');
const ipaddr=require('ipaddr.js');
const {issueQr,verifyQr,equal,fail,hash,random}=require('./security.cjs');
const FILL_MS=180000;
const signature=(data,secret)=>crypto.createHmac('sha256',secret).update('lan-scan-v1:'+data).digest('base64url');
const ipHash=address=>hash(ipaddr.process(address).toString());
function scan(input,session,secret,address,now){
  if(!session)fail(409,'SESSION_CLOSED','Chưa mở điểm danh hoặc phiên đã hết giờ.');
  const current=issueQr(session,secret,now);
  if(input.token){
    const qr=verifyQr(input.token,secret,now);
    if(qr.sid!==session.id)fail(400,'QR_INVALID','QR không thuộc buổi học đang mở.');
  }else{
    const code=typeof input.code==='string'?input.code.toUpperCase().replace(/[\s-]/g,''):'';
    if(!equal(code,current.code))fail(410,'QR_EXPIRED','Mã không đúng hoặc đã đổi. Nhập mã đang chiếu hoặc quét QR mới.');
  }
  const expiresAt=Math.min(now+FILL_MS,session.ends_at);
  const payload={v:1,sid:session.id,ip:ipHash(address),id:random(),iat:now,exp:expiresAt};
  const data=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {scanTicket:data+'.'+signature(data,secret),sessionId:session.id,expiresAt,serverTime:now};
}
function verifyScan(ticket,secret,address,sid,now){
  if(typeof ticket!=='string'||ticket.length>1200)fail(403,'SCAN_REQUIRED','Quét QR hoặc nhập mã đang chiếu trước khi gửi.');
  const [data,sig,...extra]=ticket.split('.');
  if(extra.length||!equal(sig,signature(data,secret)))fail(403,'SCAN_INVALID','Quyền gửi không hợp lệ. Quét lại QR đang chiếu.');
  let p;try{p=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));}catch{fail(403,'SCAN_INVALID','Quét lại QR đang chiếu.');}
  if(p.v!==1||p.sid!==sid||typeof p.id!=='string'||p.id.length!==43||!equal(p.ip,ipHash(address))||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.iat>now||p.exp<=p.iat||p.exp-p.iat>FILL_MS)fail(403,'SCAN_INVALID','Quyền gửi không thuộc kết nối này. Giữ đúng Wi-Fi và quét lại QR.');
  if(now>=p.exp)fail(410,'SCAN_EXPIRED','Đã hết thời gian nhập thông tin. Quét lại QR hoặc nhập mã mới để tiếp tục.');
  return p.id;
}
module.exports={scan,verifyScan,FILL_MS};
