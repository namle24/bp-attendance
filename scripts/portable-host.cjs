// Windows/macOS run the same server in the foreground, without systemd.
const fs=require('node:fs');
const path=require('node:path');
const {prepare}=require('./laptop-setup.cjs');
const {loadLanConfig}=require('../web/lan-config.cjs');
const root=path.resolve(__dirname,'..');
async function portableHost(operation,options={}){
  const directory=options.root||root,log=options.log||console.log;
  if(operation==='install'){
    (options.prepare||prepare)(directory);
    log('Đã chuẩn bị cấu hình và database. Hệ điều hành này không dùng dịch vụ systemd.');
    log('Bật app: npm run host:start. Giữ cửa sổ terminal mở; Ctrl+C để dừng.');
    return;
  }
  if(operation==='stop'){
    log('App chạy trong cửa sổ host:start hoặc npm start. Quay lại cửa sổ đó và bấm Ctrl+C để dừng.');
    log('Lệnh host:stop không dừng tiến trình ở cửa sổ khác trên Windows/macOS.');
    return;
  }
  if(!['start','status'].includes(operation))throw Error('Dùng install, start, stop hoặc status.');
  const envFile=path.join(directory,'.env');
  if(fs.existsSync(envFile))(options.loadEnvFile||process.loadEnvFile)(envFile);
  if(operation==='start'){
    log('Đang chạy trực tiếp trong terminal. Giữ cửa sổ này mở, cắm sạc và tránh để máy sleep. Ctrl+C để dừng.');
    await (options.runServer||require('../web/server.cjs').main)();
    return;
  }
  const config=(options.loadConfig||loadLanConfig)();
  const results=await Promise.all([['TA',config.adminOrigins[0]],['Sinh viên',config.origin]].map(async([name,origin])=>{
    try{const response=await (options.fetch||fetch)(origin+'/readyz',{signal:AbortSignal.timeout(1500)});return {name,origin,ok:response.ok};}
    catch{return {name,origin,ok:false};}
  }));
  for(const result of results)log(result.name+': '+result.origin+' — '+(result.ok?'đang trả lời':'chưa trả lời'));
  if(results.some(result=>!result.ok))throw Error('App chưa trả lời đủ hai cổng. Xem cửa sổ chạy app hoặc chạy npm run host:start.');
}
module.exports={portableHost};
