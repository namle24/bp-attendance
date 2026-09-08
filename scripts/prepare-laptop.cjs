// Write a reviewable user service in the repo. Does not install/start it or change power settings.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function quoted(value){return '"'+value.replace(/%/g,'%%').replace(/\$/g,'$$').replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
if(process.platform!=='linux')throw Error('Mẫu này dành cho Linux/systemd. Xem docs/LAPTOP-LAN.vi.md.');
const dir=path.join(root,'data/systemd');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const filename=path.join(dir,'bp-attendance-laptop.service');
const unit=`[Unit]
Description=BP attendance on classroom laptop
StartLimitIntervalSec=120
StartLimitBurst=10

[Service]
Type=simple
WorkingDirectory=${root.replace(/%/g,'%%')}
EnvironmentFile=${path.join(root,'.env').replace(/%/g,'%%')}
ExecStart=/usr/bin/systemd-inhibit --what=sleep:idle:handle-lid-switch --mode=block --who=BP-Attendance --why=Serving-attendance ${quoted(process.execPath)} ${quoted(path.join(root,'web/server.cjs'))}
Restart=on-failure
RestartSec=3
TimeoutStopSec=45
UMask=0077
LimitNOFILE=65536
NoNewPrivileges=true

[Install]
WantedBy=default.target
`;
fs.writeFileSync(filename,unit,{mode:0o600});
console.log(filename);
console.log('Đã tạo mẫu với đường dẫn Node hiện tại. Chưa cài/chạy service, chưa đổi cài đặt nguồn hoặc mở cổng mạng.');
