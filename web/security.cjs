const crypto = require('node:crypto');
const ipaddr = require('ipaddr.js');

class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
function fail(status, code, message) { throw new AppError(status,code,message); }
function random() { return crypto.randomBytes(32).toString('base64url'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function equal(a,b) {
  if(typeof a!=='string'||typeof b!=='string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function ranges(values) {
  return values.map(value=>{
    if(!value.includes('/')) throw Error('IP phải ở dạng CIDR: '+value);
    const range=ipaddr.parseCIDR(value);
    if(range[1]===0) throw Error('Không cho phép dải /0 bao gồm toàn Internet.');
    if(range[0].kind()==='ipv6' && range[0].isIPv4MappedAddress()) throw Error('Dùng CIDR IPv4 chuẩn thay cho IPv4-mapped IPv6.');
    return range;
  });
}
function contains(address, allowed) {
  try {
    const parsed=ipaddr.process(address);
    return allowed.some(range=>parsed.kind()===range[0].kind() && parsed.match(range));
  } catch { return false; }
}
function today(now=Date.now()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function issueQr(session,secret,now=Date.now()) {
  if(session.mode!=='OFFLINE'||session.closed_at||now<session.opened_at||now>=session.ends_at) fail(409,'SESSION_CLOSED','Phiên điểm danh đã đóng hoặc hết giờ.');
  const start=session.opened_at+Math.floor((now-session.opened_at)/30000)*30000;
  const payload={v:1,sid:session.id,iat:start,exp:Math.min(start+30000,session.ends_at)};
  const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
  const token=encoded+'.'+sig;
  const bytes=crypto.createHmac('sha256',secret).update('attendance-code:'+token).digest();
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value=BigInt('0x'+bytes.subarray(0,5).toString('hex')),code='';
  for(let i=0;i<8;i++){code=alphabet[Number(value&31n)]+code;value>>=5n;}
  return {token,code,expiresAt:payload.exp,serverTime:now};
}
function verifyQr(token,secret,now=Date.now()) {
  if(typeof token!=='string'||token.length>1000) fail(400,'QR_INVALID','QR không hợp lệ.');
  const parts=token.split('.');
  if(parts.length!==2||!equal(parts[1],crypto.createHmac('sha256',secret).update(parts[0]).digest('base64url'))) fail(400,'QR_INVALID','QR không hợp lệ.');
  let p; try {p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));} catch {fail(400,'QR_INVALID','QR không hợp lệ.');}
  if(p.v!==1||typeof p.sid!=='string'||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||p.exp-p.iat>30000||p.exp<=p.iat||p.iat>now) fail(400,'QR_INVALID','QR không hợp lệ.');
  if(now>=p.exp) fail(410,'QR_EXPIRED','QR đã hết hạn. Hãy quét mã mới đang chiếu trong phòng.');
  return p;
}
function validateIdentity(p,config,nonce,now=Date.now()) {
  // Signature, issuer and audience are also checked by google-auth-library before this function.
  if(!p||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.aud!==config.clientId||
      !Number.isFinite(p.exp)||p.exp*1000<=now||typeof p.sub!=='string'||!p.sub||
      p.email_verified!==true||!config.domains.includes(p.hd)||!equal(p.nonce,nonce)||typeof p.email!=='string') {
    fail(401,'GOOGLE_IDENTITY_INVALID','Đăng nhập bằng tài khoản Google USTH được phép.');
  }
  return {sub:p.sub,email:p.email.trim().toLowerCase(),name:String(p.name||p.email)};
}
module.exports={AppError,fail,random,hash,equal,ranges,contains,today,issueQr,verifyQr,validateIdentity};
