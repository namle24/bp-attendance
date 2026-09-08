const path=require('node:path');
const {random,ranges,contains}=require('./security.cjs');
const csv=value=>(value||'').split(',').map(v=>v.trim()).filter(Boolean);
function loadConfig(env=process.env) {
  const demo=env.BP_MODE==='demo';
  if(env.BP_MODE && !['demo','live'].includes(env.BP_MODE)) throw Error('BP_MODE phải là live hoặc demo.');
  const config={demo,port:Number(env.PORT||4180),host:env.BIND_HOST||'127.0.0.1',
    origin:env.PUBLIC_ORIGIN||(demo?'http://127.0.0.1:4180':''),
    clientId:env.GOOGLE_CLIENT_ID||'',domains:csv(env.GOOGLE_HOSTED_DOMAINS),admins:csv(env.ADMIN_EMAILS).map(v=>v.toLowerCase()),
    secret:env.QR_SECRET||(demo?random():''),campusCidrs:csv(env.CAMPUS_CIDRS),proxyCidrs:csv(env.TRUSTED_PROXY_CIDRS),
    database:path.resolve(env.BP_DATABASE||(demo?'data/web-demo.sqlite':'data/web-live.sqlite')),
    spreadsheetId:env.GOOGLE_SHEET_ID||'',sheetTitle:'BP_Web_Attendance'};
  if(demo) {
    if(config.host!=='127.0.0.1'||config.origin!=='http://127.0.0.1:'+config.port) throw Error('Demo chỉ được chạy trên localhost, đúng PORT/PUBLIC_ORIGIN.');
    if(config.spreadsheetId || config.clientId || config.campusCidrs.length || config.proxyCidrs.length) throw Error('Demo không được dùng cấu hình Google/mạng thật.');
    config.campusCidrs=['127.0.0.1/32','::1/128']; config.domains=['school.example']; config.admins=['ta@school.example'];
  } else {
    const missing=[];
    for(const [key,value] of Object.entries({PUBLIC_ORIGIN:config.origin,GOOGLE_CLIENT_ID:config.clientId,GOOGLE_HOSTED_DOMAINS:config.domains.length,ADMIN_EMAILS:config.admins.length,QR_SECRET:config.secret, CAMPUS_CIDRS:config.campusCidrs.length,GOOGLE_SHEET_ID:config.spreadsheetId})) if(!value)missing.push(key);
    if(missing.length)throw Error('Chưa cấu hình chạy thật: '+missing.join(', ')+'. Xem docs/WEB-SETUP.vi.md.');
    const origin=new URL(config.origin);
    if(origin.protocol!=='https:'||origin.origin!==config.origin)throw Error('PUBLIC_ORIGIN phải là HTTPS origin, không có đường dẫn/dấu / cuối.');
    if(config.secret.length<32)throw Error('QR_SECRET cần ít nhất 32 ký tự ngẫu nhiên.');
    if(!config.clientId.endsWith('.apps.googleusercontent.com'))throw Error('GOOGLE_CLIENT_ID không hợp lệ.');
  }
  if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw Error('PORT không hợp lệ.');
  config.campus=ranges(config.campusCidrs); config.proxies=ranges(config.proxyCidrs);
  if(!demo&&(contains('127.0.0.1',config.campus)||contains('::1',config.campus)))throw Error('CAMPUS_CIDRS không được chứa localhost/proxy loopback. Nhập mạng sinh viên do IT xác nhận.');
  return config;
}
module.exports={loadConfig};
