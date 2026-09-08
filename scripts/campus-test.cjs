// Discover the current Wi-Fi IPv4 and run a five-minute connectivity probe.
// This does not edit CAMPUS_CIDRS or open an attendance session.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const requested=process.argv[2];
const candidates=Object.entries(os.networkInterfaces()).flatMap(([name,addresses])=>
  addresses.filter(a=>a.family==='IPv4'&&!a.internal).map(a=>({name,address:a.address,wifi:fs.existsSync('/sys/class/net/'+name+'/wireless')})));
const wifi=candidates.filter(c=>c.wifi),selected=requested?candidates.find(c=>c.address===requested):(wifi.length===1?wifi[0]:null);
if(!selected){
  console.error('Chưa chọn được một IP Wi-Fi. Kết nối Wi-Fi hoặc chạy npm run campus:test -- IP_WIFI_CUA_LAPTOP.');
  for(const c of candidates)console.log(c.name+': '+c.address+(c.wifi?' (Wi-Fi)':''));
  process.exitCode=1;
}else{
  console.log('Card mạng: '+selected.name+' · IP hiện tại: '+selected.address);
  console.log('Mở URL/QR được tạo trên điện thoại cùng USTH_CONNECT. Dừng bằng Ctrl+C, tự đóng sau 5 phút.');
  console.log('Lệnh chỉ thử đường mạng; không tự coi IP này là cấu hình mạng USTH.');
  const child=spawn(process.execPath,[path.join(root,'scripts/lan-probe.cjs'),'--host',selected.address,'--port','4188','--seconds','300'],{cwd:root,stdio:['ignore','pipe','inherit']});
  let pending='';child.stdout.on('data',chunk=>{
    pending+=chunk;
    let newline;
    while((newline=pending.indexOf('\n'))>=0){
      const line=pending.slice(0,newline);pending=pending.slice(newline+1);console.log(line);
      try{
        const info=JSON.parse(line);if(!info.url)continue;
        const qr=require('../web/public/qr.js')(0,'M');qr.addData(info.url);qr.make();
        const svg=qr.createSvgTag({cellSize:8,margin:32,scalable:true});
        const reportDir=path.join(root,'data/reports');fs.mkdirSync(reportDir,{recursive:true,mode:0o700});
        const file=path.join(reportDir,'wifi-test.html');
        fs.writeFileSync(file,'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BP kiểm tra Wi-Fi</title><style>body{font:18px system-ui;text-align:center;margin:40px;color:#293896}svg{width:min(75vw,450px);display:block;margin:20px auto}a{overflow-wrap:anywhere}</style><h1>Kiểm tra kết nối tới laptop</h1>'+svg+'<a href="'+info.url+'">'+info.url+'</a><p>Điện thoại kết nối cùng USTH_CONNECT rồi quét QR.</p><p>Chỉ kiểm tra mạng, chưa ghi nhận điểm danh. URL tự đóng sau 5 phút.</p></html>',{mode:0o600});
        console.log('Mở file này trên laptop để điện thoại quét QR: '+file);
        if(!process.env.BP_NO_OPEN)spawn('xdg-open',[file],{stdio:'ignore'}).on('error',()=>{});
      }catch(error){console.error('Không tạo được trang QR kiểm tra: '+error.message);}
    }
  });
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code||0;});
  for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
}
