const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const os=require('node:os');
const {parseEnv}=require('node:util');
const {X509Certificate,createPrivateKey,createPublicKey}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {loadConfig}=require('../web/config.cjs');
const root=path.resolve(__dirname,'..');
function readEnv(file){try{return parseEnv(fs.readFileSync(file,'utf8'));}catch{return {};}}
function inspect(rootDirectory=root,campus=false){
  const checks=[],record=(name,ok,detail)=>checks.push({name,ok,detail});
  const env=readEnv(path.join(rootDirectory,'.env')),proxy=readEnv(path.join(rootDirectory,'data/caddy.env'));
  record('Node.js',Number(process.versions.node.split('.')[0])>=24,'Cần Node.js 24 trở lên.');
  record('Caddy',fs.existsSync(path.join(rootDirectory,'data/bin/caddy')),'Cài bằng npm run caddy:install.');
  const required=['PUBLIC_ORIGIN','GOOGLE_CLIENT_ID','GOOGLE_HOSTED_DOMAINS','ADMIN_EMAILS','QR_SECRET','CAMPUS_CIDRS','GOOGLE_SHEET_ID'];
  for(const key of required)record(key,!!env[key],key==='CAMPUS_CIDRS'?'Chờ dải mạng sinh viên được IT xác nhận.':'Điền trong .env.');
  let validConfig=false;
  if(required.every(key=>env[key]))try{loadConfig(env);validConfig=true;record('Kiểm tra cấu hình app',true,'');}catch(error){record('Kiểm tra cấu hình app',false,error.message);}
  let credentials=false;
  try{
    if(!path.isAbsolute(env.GOOGLE_APPLICATION_CREDENTIALS||''))throw Error();
    const key=JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
    if(key.type!=='service_account'||!key.client_email)throw Error();createPrivateKey(key.private_key);credentials=true;
  }catch{}
  record('File Google service account',credentials,'Cần JSON service account có private key hợp lệ tại GOOGLE_APPLICATION_CREDENTIALS.');
  const port=Number(proxy.ATTENDANCE_PORT),hostname=proxy.ATTENDANCE_HOST;
  const validHost=!!hostname&&!net.isIP(hostname)&&/^[a-zA-Z0-9.-]+$/.test(hostname)&&hostname.includes('.');
  record('Hostname HTTPS',validHost,'Điền ATTENDANCE_HOST trong data/caddy.env bằng tên miền được cấp.');
  record('Cổng HTTPS',Number.isInteger(port)&&port>=1024&&port<=65535,'Dịch vụ user dùng cổng 8443 (không cần sudo).');
  record('IP Wi-Fi laptop',net.isIP(proxy.LAPTOP_LAN_IP||'')===4,'Điền LAPTOP_LAN_IP khi tới trường; không dùng IP Docker/VPN/localhost.');
  if(env.PUBLIC_ORIGIN&&validHost)record('URL app khớp Caddy',env.PUBLIC_ORIGIN===`https://${hostname}:${port}`,'PUBLIC_ORIGIN phải gồm đúng hostname và cổng của Caddy.');
  let certReady=false;
  try{
    const pem=fs.readFileSync(proxy.ATTENDANCE_CERT_FILE),cert=new X509Certificate(pem),key=createPrivateKey(fs.readFileSync(proxy.ATTENDANCE_KEY_FILE));
    certReady=validHost&&!!cert.checkHost(hostname)&&Date.parse(cert.validFrom)<=Date.now()&&Date.parse(cert.validTo)>Date.now()+86400000&&cert.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(key).export({type:'spki',format:'der'}));
    if(certReady)execFileSync('openssl',['verify','-CApath','/etc/ssl/certs','-untrusted',proxy.ATTENDANCE_CERT_FILE,proxy.ATTENDANCE_CERT_FILE],{stdio:'pipe',timeout:5000});
  }catch{certReady=false;}
  record('Chứng chỉ HTTPS và private key',certReady,'Cần fullchain khớp hostname, còn hạn hơn 24 giờ, đúng key và được máy tin cậy; vẫn phải thử trên điện thoại.');
  if(campus){
    const addresses=Object.values(os.networkInterfaces()).flat().filter(Boolean);
    record('IP đã có trên laptop',addresses.some(a=>!a.internal&&a.address===proxy.LAPTOP_LAN_IP),'Kiểm tra Wi-Fi và LAPTOP_LAN_IP.');
  }
  if(validConfig&&credentials&&certReady&&checks.every(c=>c.ok)){
    try{execFileSync(path.join(rootDirectory,'data/bin/caddy'),['validate','--config',path.join(rootDirectory,'deploy/Caddyfile.lan'),'--adapter','caddyfile'],{env:{...process.env,...proxy,XDG_DATA_HOME:path.join(rootDirectory,'data/caddy'),XDG_CONFIG_HOME:path.join(rootDirectory,'data/caddy')},stdio:'pipe',timeout:10000});record('Caddy validate',true,'');}
    catch{record('Caddy validate',false,'Kiểm tra Caddyfile và quyền đọc chứng chỉ.');}
  }
  return {checkedAt:new Date().toISOString(),ready:checks.every(c=>c.ok),checks};
}
if(require.main===module){
  const report=inspect(root,process.argv.includes('--campus'));
  if(!process.argv.includes('--quiet')){
    for(const c of report.checks)console.log((c.ok?'[OK] ':'[THIẾU] ')+c.name+(c.ok?'':' — '+c.detail));
    console.log(report.ready?'Cấu hình tại máy đạt. Cần thử truy cập, đăng nhập và ghi Sheet từ thiết bị sinh viên.':'Chưa đủ cấu hình để phục vụ điểm danh; các mục [THIẾU] ở trên cần hoàn tất.');
  }
  if(process.argv.includes('--report')){
    const dir=path.join(root,'data/reports');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.writeFileSync(path.join(dir,'host-check.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  if(!report.ready)process.exitCode=1;
}
module.exports={inspect,readEnv};
