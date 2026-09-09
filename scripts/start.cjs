// Bootstrap uses only Node built-ins; a fresh checkout can run without npm ci.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function ensureDependencies(){
  const pkg=require('../package.json');
  const missing=Object.entries(pkg.dependencies).some(([name,version])=>{
    try{return JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version!==version;}catch{return true;}
  });
  if(!missing)return;
  console.log('Đang cài các thư viện cần thiết lần đầu. Cần kết nối Internet ở bước này…');
  const result=spawnSync(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/s','/c','npm ci --no-audit --no-fund']:['ci','--no-audit','--no-fund'],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.status!==0)throw Error('Chưa cài được thư viện. Kiểm tra Internet rồi chạy npm start lại.');
}
async function start(){
  if(Number(process.versions.node.split('.')[0])<24)throw Error('Cài Node.js 24 trở lên từ https://nodejs.org rồi mở app lại.');
  process.chdir(root);ensureDependencies();
  await require('./portable-host.cjs').portableHost('start');
}
if(require.main===module)start().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={start,ensureDependencies};
