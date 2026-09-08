const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {inspect,readEnv}=require('./host-check.cjs');
const {loadLanConfig}=require('../web/lan-config.cjs');
const root=path.resolve(__dirname,'..'),units=['bp-attendance-laptop.service','bp-attendance.target'];
function systemctl(args,quiet=false){return spawnSync('systemctl',['--user',...args],{cwd:root,stdio:quiet?'pipe':'inherit',encoding:'utf8',timeout:45000});}
async function main(){
  const operation=process.argv[2];
  if(operation==='install'){
    const result=systemctl(['link',...units.map(name=>path.join(root,'data/systemd',name))]);if(result.status!==0)throw Error('Không liên kết được service.');
    if(systemctl(['daemon-reload']).status!==0)throw Error('Không tải lại được service.');
    console.log('Đã cài service. Chưa bật app hoặc tự chạy khi đăng nhập.');
  }else if(operation==='start'){
    const report=inspect();if(!report.ready)throw Error(report.checks.filter(c=>!c.ok).map(c=>c.detail).join('\n'));
    // Stop the former proxy if it was installed; LAN records use direct socket IPs.
    if(systemctl(['is-active','--quiet','bp-attendance-caddy.service'],true).status===0)systemctl(['stop','bp-attendance-caddy.service']);
    if(systemctl(['start',...units]).status!==0)throw Error('Không khởi động được. Xem npm run host:status.');
    const config=loadLanConfig(readEnv(path.join(root,'.env')));let ready=false;
    for(let i=0;i<30;i++){
      try{const results=await Promise.all([fetch(config.origin+'/readyz',{signal:AbortSignal.timeout(500)}),fetch(config.adminOrigins[0]+'/readyz',{signal:AbortSignal.timeout(500)})]);if(results.every(r=>r.ok)){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!ready)throw Error('App chưa trả lời trên cả hai cổng. Xem npm run host:status.');
    console.log('TA mở trên laptop: '+config.adminOrigins[0]);console.log('Sinh viên mở: '+config.origin);for(const warning of report.warnings)console.log(warning);
  }else if(operation==='stop'){if(systemctl(['stop',...units]).status!==0)throw Error('Không dừng được service.');}
  else if(operation==='status')process.exitCode=systemctl(['status',...units,'--no-pager','--lines=8']).status??1;
  else throw Error('Dùng install, start, stop hoặc status.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
