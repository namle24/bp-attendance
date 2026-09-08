// Prepare only missing local configuration; keep existing secrets and attendance.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {parseEnv}=require('node:util');
const {Store}=require('../web/store.cjs');
const root=path.resolve(__dirname,'..');
function prepare(rootDirectory=root){
  for(const dir of ['data','data/bin','data/secrets','data/certs','data/caddy','data/systemd','data/backups','data/reports'])fs.mkdirSync(path.join(rootDirectory,dir),{recursive:true,mode:0o700});
  const envFile=path.join(rootDirectory,'.env');
  let source=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):fs.readFileSync(path.join(rootDirectory,'.env.example'),'utf8');
  const existing=parseEnv(source),defaults={QR_SECRET:randomBytes(32).toString('hex'),GOOGLE_APPLICATION_CREDENTIALS:path.join(rootDirectory,'data/secrets/google-service-account.json'),BP_DATABASE:path.join(rootDirectory,'data/web-live.sqlite')};
  for(const [key,value] of Object.entries(defaults))if(!existing[key]){
    const line=key+'='+JSON.stringify(value);
    source=new RegExp('^'+key+'=.*$','m').test(source)?source.replace(new RegExp('^'+key+'=.*$','m'),()=>line):source+'\n'+line+'\n';
  }
  fs.writeFileSync(envFile,source,{mode:0o600});fs.chmodSync(envFile,0o600);
  const proxyFile=path.join(rootDirectory,'data/caddy.env');
  if(!fs.existsSync(proxyFile))fs.writeFileSync(proxyFile,[
    '# Điền hostname được cấp và IP Wi-Fi của laptop tại trường.',
    'ATTENDANCE_HOST=','ATTENDANCE_PORT=8443','LAPTOP_LAN_IP=',
    'ATTENDANCE_CERT_FILE='+JSON.stringify(path.join(rootDirectory,'data/certs/fullchain.pem')),
    'ATTENDANCE_KEY_FILE='+JSON.stringify(path.join(rootDirectory,'data/certs/privkey.pem')),''
  ].join('\n'),{flag:'wx',mode:0o600});
  const configured=parseEnv(source),database=path.resolve(rootDirectory,configured.BP_DATABASE);
  const store=new Store(database);store.close();
  return {envFile,proxyFile,database};
}
if(require.main===module){
  try{prepare();console.log('Đã chuẩn bị .env riêng, QR secret, thư mục credentials/chứng chỉ và SQLite. Giữ nguyên cấu hình/dữ liệu đã có.');}
  catch(error){console.error('Không chuẩn bị được laptop: '+error.message);process.exitCode=1;}
}
module.exports={prepare};
