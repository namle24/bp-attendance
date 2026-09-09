const {execFileSync}=require('node:child_process');
let cached;
function parseHardwarePorts(source){
  const names=[];let wifi=false;
  for(const line of source.split(/\r?\n/)){
    if(line.startsWith('Hardware Port:'))wifi=/Wi-Fi|AirPort/i.test(line);
    const device=/^Device:\s*(\S+)/.exec(line);if(wifi&&device)names.push(device[1]);
  }
  return names;
}
function wifiNames(platform=process.platform,run=execFileSync){
  if(platform==='linux')return [];
  if(run===execFileSync&&cached?.platform===platform&&Date.now()-cached.at<30000)return cached.names;
  let names=[];
  const options={encoding:'utf8',timeout:6000,windowsHide:true,stdio:['ignore','pipe','ignore']};
  try{
    if(platform==='darwin')names=parseHardwarePorts(run('/usr/sbin/networksetup',['-listallhardwareports'],options));
    if(platform==='win32'){
      // Native media type also recognizes renamed/localized Wi-Fi adapters.
      const source=run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.NdisPhysicalMedium -in 1,9 } | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress"],options).trim();
      const value=source?JSON.parse(source):[];names=Array.isArray(value)?value:[value];
    }
  }catch{/* The local network picker remains available if discovery is blocked. */}
  names=names.filter(name=>typeof name==='string');
  if(run===execFileSync)cached={platform,at:Date.now(),names};
  return names;
}
module.exports={wifiNames,parseHardwarePorts};
