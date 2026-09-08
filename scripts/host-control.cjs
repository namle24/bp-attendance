const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {inspect}=require('./host-check.cjs');
const root=path.resolve(__dirname,'..');
const units=['bp-attendance-laptop.service','bp-attendance-caddy.service'];
function systemctl(args,quiet=false){return spawnSync('systemctl',['--user',...args],{cwd:root,stdio:quiet?'pipe':'inherit',encoding:'utf8',timeout:50000});}
const operation=process.argv[2];
if(operation==='install'){
  const result=systemctl(['link',...units.concat('bp-attendance.target').map(name=>path.join(root,'data/systemd',name))]);
  if(result.status!==0)process.exitCode=1;
  else{const reload=systemctl(['daemon-reload']);process.exitCode=reload.status??1;if(reload.status===0)console.log('Đã liên kết dịch vụ; chưa bật app, chưa đặt tự chạy khi đăng nhập.');}
}else if(operation==='start'){
  const result=inspect(root,true);
  if(!result.ready){for(const c of result.checks.filter(c=>!c.ok))console.error(c.name+': '+c.detail);process.exitCode=1;}
  else{
    systemctl(['start',...units,'bp-attendance.target']);
    const active=units.every(unit=>systemctl(['is-active','--quiet',unit],true).status===0);
    console.log(active?'App và HTTPS đang chạy. Thử URL trên điện thoại.':'Dịch vụ chưa chạy đủ. Xem npm run host:status và nhật ký.');
    if(!active)process.exitCode=1;
  }
}else if(operation==='stop')process.exitCode=systemctl(['stop','bp-attendance.target',...units]).status??1;
else if(operation==='status')process.exitCode=systemctl(['status','bp-attendance.target',...units,'--no-pager','--lines=5']).status??1;
else{console.error('Dùng install, start, stop hoặc status.');process.exitCode=1;}
