// Generate reviewable user services. Installation and startup are separate commands.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const spec=value=>value.replace(/%/g,'%%');
function quoted(value){return '"'+spec(value).replace(/\$/g,'$$').replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
if(process.platform!=='linux')throw Error('Mẫu này dành cho Linux/systemd.');
const dir=path.join(root,'data/systemd');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const gate=`ExecCondition=${quoted(process.execPath)} ${quoted(path.join(root,'scripts/host-check.cjs'))} --quiet --campus`;
const common=`WorkingDirectory=${spec(root)}
${gate}
Restart=on-failure
RestartSec=3
TimeoutStopSec=45
UMask=0077
LimitNOFILE=65536
NoNewPrivileges=true`;
const units={
'bp-attendance-laptop.service':`[Unit]
Description=BP attendance application on classroom laptop
PartOf=bp-attendance.target
StartLimitIntervalSec=120
StartLimitBurst=10

[Service]
Type=simple
EnvironmentFile=${spec(path.join(root,'.env'))}
${common}
ExecStart=/usr/bin/systemd-inhibit --what=sleep:idle:handle-lid-switch --mode=block --who=BP-Attendance --why=Serving-attendance ${quoted(process.execPath)} ${quoted(path.join(root,'web/server.cjs'))}
`,
'bp-attendance-caddy.service':`[Unit]
Description=BP attendance HTTPS on classroom laptop
PartOf=bp-attendance.target
After=bp-attendance-laptop.service
StartLimitIntervalSec=120
StartLimitBurst=10

[Service]
Type=simple
EnvironmentFile=${spec(path.join(root,'data/caddy.env'))}
Environment=${quoted('XDG_DATA_HOME='+path.join(root,'data/caddy'))}
Environment=${quoted('XDG_CONFIG_HOME='+path.join(root,'data/caddy'))}
${common}
ExecStart=${quoted(path.join(root,'data/bin/caddy'))} run --config ${quoted(path.join(root,'deploy/Caddyfile.lan'))} --adapter caddyfile
`,
'bp-attendance.target':`[Unit]
Description=BP attendance application and HTTPS
Wants=bp-attendance-laptop.service bp-attendance-caddy.service
After=bp-attendance-laptop.service bp-attendance-caddy.service
`
};
for(const [name,unit] of Object.entries(units))fs.writeFileSync(path.join(dir,name),unit,{mode:0o600});
console.log('Đã tạo service app + HTTPS và target chung trong data/systemd.');
console.log('Cài: npm run host:install · Bật khi đủ cấu hình: npm run host:start');
