// Pinned official release, installed locally without changing system packages.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version='2.11.4';
const sha256='527fbf917c39189a1e3b31d34fa955601680b2d5c8055d2a87b8b9588dec7bb9';
const source=`https://github.com/caddyserver/caddy/releases/download/v${version}/caddy_${version}_linux_amd64.tar.gz`;
(async()=>{
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('Bộ cài này dành cho Linux x64. Cài Caddy theo hệ điều hành của bạn.');
  const dir=path.join(root,'data/bin');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const binary=path.join(dir,'caddy'),metadata=path.join(dir,'caddy-install.json');
  if(fs.existsSync(binary)&&fs.existsSync(metadata)){
    const installed=JSON.parse(fs.readFileSync(metadata,'utf8'));
    if(installed.version==='v'+version&&installed.archiveSha256===sha256&&installed.binarySha256===createHash('sha256').update(fs.readFileSync(binary)).digest('hex')){console.log('Caddy '+version+' đã có, checksum khớp.');return;}
    throw Error('Caddy hiện có khác bản đã ghi nhận; kiểm tra trước khi thay thế.');
  }
  if(fs.existsSync(binary))throw Error('Đã có binary Caddy chưa có metadata; giữ nguyên, cần kiểm tra trước khi thay.');
  const response=await fetch(source,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Không tải được Caddy: HTTP '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Checksum Caddy không khớp. Không cài đặt.');
  const archive=path.join(dir,'caddy-download.tar.gz');
  try{
    fs.writeFileSync(archive,bytes,{mode:0o600});
    const executable=execFileSync('tar',['-xOzf',archive,'caddy'],{maxBuffer:100*1024*1024});
    fs.writeFileSync(binary,executable,{flag:'wx',mode:0o700});
    fs.writeFileSync(metadata,JSON.stringify({version:'v'+version,source,archiveSha256:sha256,binarySha256:createHash('sha256').update(executable).digest('hex')},null,2)+'\n',{mode:0o600});
    console.log('Đã cài Caddy '+version+' và xác minh SHA-256.');
  }finally{fs.rmSync(archive,{force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
