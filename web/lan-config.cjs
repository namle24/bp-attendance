const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const {ranges,contains}=require('./security.cjs');
const ipaddr=require('ipaddr.js');
const {wifiNames}=require('./network-discovery.cjs');
function networkAdapters(interfaces,platform=process.platform,knownWifi){
  const wifi=new Set(knownWifi||(interfaces?[]:wifiNames(platform)));interfaces||=os.networkInterfaces();
  return Object.entries(interfaces).flatMap(([name,list])=>(list||[]).filter(a=>(a.family==='IPv4'||a.family===4)&&!a.internal&&a.cidr).map(a=>({...a,name,
    virtual:/^(?:lo|docker|br-|veth|virbr|vmnet|utun|tun|tap|tailscale|wg\d|vpn|vEthernet|VMware|VirtualBox|Bluetooth)/i.test(name),
    wifi:wifi.has(name)||(platform==='linux'?fs.existsSync('/sys/class/net/'+name+'/wireless'):platform==='win32'&&/^(?:wi[\s\u2010-\u2015-]?fi|wlan)(?:\s+\d+)?$/iu.test(name))})));
}
function chooseNetwork(env=process.env,interfaces,platform=process.platform,knownWifi){
  // An explicit/current adapter or an unambiguous conventional Wi-Fi name needs
  // no slow PowerShell/networksetup call. Query hardware only for unknown names.
  let addresses=networkAdapters(interfaces||os.networkInterfaces(),platform,knownWifi||[]);
  if(!env.LAN_INTERFACE&&!interfaces&&!addresses.some(a=>a.wifi))addresses=networkAdapters(undefined,platform,knownWifi);
  const selected=env.LAN_INTERFACE?addresses.filter(a=>a.name===env.LAN_INTERFACE):addresses.filter(a=>a.wifi);
  if(selected.length!==1){const error=Error('Chạy npm start để chọn mạng trên trình duyệt. Nâng cao: npm run network:list và LAN_INTERFACE trong .env.');error.code='NETWORK_CHOICE_REQUIRED';throw error;}
  const network=selected[0];
  if(ipaddr.parse(network.address).range()!=='private')throw Error('Chỉ phục vụ trực tiếp trên địa chỉ IPv4 LAN riêng. Liên hệ IT nếu trường cấp IP công cộng.');
  return network;
}
function loadLanConfig(env=process.env,interfaces,selected){
  const network=selected||chooseNetwork(env,interfaces),port=Number(env.PORT||4180),adminPort=Number(env.ADMIN_PORT||4181);
  if(ipaddr.parse(network.address).range()!=='private')throw Error('Chỉ phục vụ trực tiếp trên địa chỉ IPv4 LAN riêng.');
  if([port,adminPort].some(n=>!Number.isInteger(n)||n<1024||n>65535)||port===adminPort)throw Error('PORT và ADMIN_PORT phải khác nhau, từ 1024 đến 65535.');
  const campusCidrs=(env.CAMPUS_CIDRS||network.cidr).split(',').map(s=>s.trim()).filter(Boolean),campus=ranges(campusCidrs);
  if(contains('127.0.0.1',campus)||contains('::1',campus)||!contains(network.address,campus))throw Error('Dải mạng phải chứa IP Wi-Fi laptop và không chứa localhost.');
  return {host:network.address,port,adminPort,origin:`http://${network.address}:${port}`,adminOrigins:[`http://127.0.0.1:${adminPort}`,`http://localhost:${adminPort}`],
    network:network.name,campusCidrs,campus,database:path.resolve(env.BP_DATABASE||'data/web-live.sqlite'),spreadsheetId:env.GOOGLE_SHEET_ID||'',sheetTitle:'BP_Web_Attendance'};
}
module.exports={chooseNetwork,loadLanConfig,networkAdapters};
