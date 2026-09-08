const fs=require('node:fs');
const path=require('node:path');
const {parseEnv}=require('node:util');
const {createPrivateKey}=require('node:crypto');
const {loadLanConfig}=require('../web/lan-config.cjs');
const root=path.resolve(__dirname,'..');
function readEnv(file){try{return parseEnv(fs.readFileSync(file,'utf8'));}catch{return {};}}
function inspect(rootDirectory=root,campus=false){
  const env=readEnv(path.join(rootDirectory,'.env')),checks=[],warnings=[];
  checks.push({name:'Node.js',ok:Number(process.versions.node.split('.')[0])>=24,detail:'Cần Node.js 24 trở lên.'});
  let config;
  try{config=loadLanConfig(env);checks.push({name:'Mạng LAN',ok:true,detail:config.network+' · '+config.origin+' · '+config.campusCidrs.join(', ')});}
  catch(error){checks.push({name:'Mạng LAN',ok:false,detail:error.message});}
  if(!env.GOOGLE_SHEET_ID)warnings.push('Sheet chưa cấu hình. App vẫn lưu điểm danh trên laptop và xuất CSV.');
  else try{const key=JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));if(key.type!=='service_account'||!key.client_email)throw Error();createPrivateKey(key.private_key);}
    catch{warnings.push('Chưa có service account hợp lệ. Điểm danh vẫn lưu tại máy; đồng bộ Sheet sẽ báo lỗi cho tới khi cấu hình đúng.');}
  warnings.push('Chọn Wi-Fi USTH_CONNECT khi tới trường. Chưa xác minh được SSID, client isolation hoặc IP sinh viên từ kiểm tra tại laptop.');
  return {checkedAt:new Date().toISOString(),ready:checks.every(c=>c.ok),checks,warnings};
}
if(require.main===module){
  const report=inspect();
  if(!process.argv.includes('--quiet')){for(const c of report.checks)console.log((c.ok?'[OK] ':'[THIẾU] ')+c.name+' — '+c.detail);for(const warning of report.warnings)console.log(warning);}
  if(process.argv.includes('--report')){const dir=path.join(root,'data/reports');fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(path.join(dir,'host-check.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});}
  if(!report.ready)process.exitCode=1;
}
module.exports={inspect,readEnv};
