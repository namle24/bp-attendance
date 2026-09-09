// The same foreground launcher for Windows, macOS and Linux.
const fs=require('node:fs');
const path=require('node:path');
const {prepare}=require('./laptop-setup.cjs');
const {loadLanConfig}=require('../web/lan-config.cjs');
const root=path.resolve(__dirname,'..');
async function portableHost(operation,options={}){
  const directory=options.root||root,log=options.log||console.log;
  if(operation==='install'){
    (options.prepare||prepare)(directory);
    log('Đã chuẩn bị dữ liệu. Bật app: npm start. Giữ cửa sổ mở; Ctrl+C để dừng.');
    return;
  }
  if(operation==='stop'){
    log('App chạy trong cửa sổ host:start hoặc npm start. Quay lại cửa sổ đó và bấm Ctrl+C để dừng.');
    log('Lệnh host:stop không dừng tiến trình ở cửa sổ khác. Nếu dùng service Linux cũ: npm run service:stop.');
    return;
  }
  if(!['start','status'].includes(operation))throw Error('Dùng install, start, stop hoặc status.');
  if(operation==='start')(options.prepare||prepare)(directory);
  const envFile=path.join(directory,'.env');
  if(fs.existsSync(envFile))(options.loadEnvFile||process.loadEnvFile)(envFile);
  if(operation==='start'){
    log('Đang bật điểm danh. Giữ cửa sổ này mở, cắm sạc và giữ máy thức. Ctrl+C để dừng.');
    const open=options.openBrowser||require('./open-browser.cjs').openBrowser;
    const env={...process.env,BP_DATABASE:path.resolve(directory,process.env.BP_DATABASE||'data/web-live.sqlite')};
    let config,picker;
    try{config=(options.loadConfig||loadLanConfig)(env);}
    catch(error){
      if(error.code!=='NETWORK_CHOICE_REQUIRED')throw error;
      picker=await (options.networkPicker||require('./network-picker.cjs').networkPicker)();
      log('Chọn mạng của lớp: '+picker.origin+'/');
      if(process.env.BP_NO_BROWSER!=='1')open(picker.origin+'/');
      const network=await picker.selection;
      try{config=loadLanConfig(env,undefined,network);}catch(error){await picker.close();throw error;}
    }
    try{
      await (options.runServer||require('../web/server.cjs').main)({config});
      const url=config.adminOrigins[0]+'/';
      if(picker){picker.finish(url);process.once('SIGINT',()=>void picker.close());process.once('SIGTERM',()=>void picker.close());}
      else if(process.env.BP_NO_BROWSER!=='1')open(url);
    }catch(error){
      if(picker)await picker.close();
      if(error.code==='EADDRINUSE')throw Error('Cổng đang được sử dụng. Dừng cửa sổ app cũ bằng Ctrl+C; nếu dùng service Linux cũ, chạy npm run service:stop.');
      throw error;
    }
    return;
  }
  let config;
  try{config=(options.loadConfig||loadLanConfig)();}
  catch(error){
    if(error.code!=='NETWORK_CHOICE_REQUIRED')throw error;
    const admin='http://127.0.0.1:'+Number(process.env.ADMIN_PORT||4181);
    try{const response=await fetch(admin+'/api/dashboard',{signal:AbortSignal.timeout(1500)});if(!response.ok)throw Error();const data=await response.json();config={adminOrigins:[admin],origin:data.url};}
    catch{throw Error('App chưa trả lời. Chạy npm start để mở bảng TA.');}
  }
  const results=await Promise.all([['TA',config.adminOrigins[0]],['Sinh viên',config.origin]].map(async([name,origin])=>{
    try{const response=await (options.fetch||fetch)(origin+'/readyz',{signal:AbortSignal.timeout(1500)});return {name,origin,ok:response.ok};}
    catch{return {name,origin,ok:false};}
  }));
  for(const result of results)log(result.name+': '+result.origin+' — '+(result.ok?'đang trả lời':'chưa trả lời'));
  if(results.some(result=>!result.ok))throw Error('App chưa trả lời đủ hai cổng. Xem cửa sổ chạy app hoặc chạy npm run host:start.');
}
module.exports={portableHost};
