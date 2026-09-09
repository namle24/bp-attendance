const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const spec=value=>value.replace(/%/g,'%%');
function quoted(value){return '"'+spec(value).replace(/\$/g,'$$').replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
function prepareService(platform=process.platform,log=console.log){
if(platform!=='linux'){
  log('Cấu hình laptop đã sẵn sàng. Windows/macOS chạy trực tiếp: npm run host:start.');
  log('Giữ terminal mở; Ctrl+C để dừng. Không cần cài systemd.');
  return;
}
const dir=path.join(root,'data/systemd');fs.mkdirSync(dir,{recursive:true,mode:0o700});
fs.writeFileSync(path.join(dir,'bp-attendance-laptop.service'),`[Unit]
Description=BP attendance LAN and local TA console
PartOf=bp-attendance.target
StartLimitIntervalSec=120
StartLimitBurst=10

[Service]
Type=simple
WorkingDirectory=${spec(root)}
EnvironmentFile=${spec(path.join(root,'.env'))}
ExecCondition=${quoted(process.execPath)} ${quoted(path.join(root,'scripts/host-check.cjs'))} --quiet
ExecStart=/usr/bin/systemd-inhibit --what=sleep:idle:handle-lid-switch --mode=block --who=BP-Attendance --why=Serving-attendance ${quoted(process.execPath)} ${quoted(path.join(root,'web/server.cjs'))}
Restart=on-failure
RestartSec=3
TimeoutStopSec=45
UMask=0077
LimitNOFILE=65536
NoNewPrivileges=true
`,{mode:0o600});
fs.writeFileSync(path.join(dir,'bp-attendance.target'),`[Unit]
Description=BP attendance on classroom Wi-Fi
Wants=bp-attendance-laptop.service
After=bp-attendance-laptop.service
`,{mode:0o600});
console.log('Đã tạo service Linux tùy chọn. Dùng npm start để chạy ngay; service nâng cao: npm run service:install.');
}
if(require.main===module)prepareService();
module.exports={prepareService};
