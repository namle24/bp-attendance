const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {parseEnv}=require('node:util');
const {chooseNetwork,networkAdapters,loadLanConfig}=require('../web/lan-config.cjs');
const {portableHost}=require('../scripts/portable-host.cjs');
const {prepareService}=require('../scripts/prepare-laptop.cjs');
const {prepare,envPath}=require('../scripts/laptop-setup.cjs');
const ipv4=(address,extra={})=>({family:'IPv4',internal:false,address,cidr:address+'/24',...extra});

test('Windows selects one Wi-Fi/WLAN IPv4 without Linux sysfs and never falls back to VPN/Ethernet',()=>{
  for(const name of ['Wi-Fi','Wi-Fi 2','WLAN','Wi‑Fi']){
    const interfaces={[name]:[ipv4('192.168.2.20')],Ethernet:[ipv4('10.0.0.2')],VPN:[ipv4('10.8.0.2')]};
    assert.equal(chooseNetwork({},interfaces,'win32').name,name);
  }
  assert.throws(()=>chooseNetwork({},{VPN:[ipv4('10.8.0.2')],Ethernet:[ipv4('10.0.0.2')]},'win32'),/network:list/);
  assert.throws(()=>chooseNetwork({},{'Wi-Fi':[ipv4('192.168.2.20')],'Wi-Fi 2':[ipv4('192.168.3.20')]},'win32'),/LAN_INTERFACE/);
  const custom={'Mạng trường':[ipv4('192.168.2.20')]};assert.equal(chooseNetwork({LAN_INTERFACE:'Mạng trường'},custom,'win32').address,'192.168.2.20');
  assert.equal(networkAdapters({'Wi-Fi':[ipv4('192.168.2.20'),{family:'IPv6',address:'::1',internal:true}]},'win32').length,1);
  for(const address of ['127.0.0.1','169.254.2.1','203.0.113.5'])assert.throws(()=>chooseNetwork({},{'Wi-Fi':[ipv4(address)]},'win32'),/IPv4 LAN riêng/);
});
test('setup serializes Windows paths containing spaces and backslash-n without corrupting dotenv values',()=>{
  const windowsPath=String.raw`C:\Users\nam le\bp-attendance\data\secrets\google-service-account.json`;
  const encoded=envPath(windowsPath,'win32');assert.equal(parseEnv('FILE='+JSON.stringify(encoded)).FILE,'C:/Users/nam le/bp-attendance/data/secrets/google-service-account.json');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp setup spaces '));
  try{
    fs.copyFileSync(path.resolve(__dirname,'../.env.example'),path.join(directory,'.env.example'));
    const result=prepare(directory),env=parseEnv(fs.readFileSync(result.envFile,'utf8'));
    assert.equal(path.normalize(env.GOOGLE_APPLICATION_CREDENTIALS),path.join(directory,'data/secrets/google-service-account.json'));
    const before=fs.readFileSync(result.envFile,'utf8');prepare(directory);assert.equal(fs.readFileSync(result.envFile,'utf8'),before);
    assert.ok(fs.existsSync(result.database));
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('Windows setup/install skip Linux services; start loads env before starting the production server',async()=>{
  const messages=[],log=message=>messages.push(message),calls=[];
  prepareService('win32',log);assert.ok(messages.some(s=>s.includes('host:start')));
  await portableHost('install',{log,prepare:()=>calls.push('prepare')});assert.deepEqual(calls,['prepare']);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp-portable-'));fs.writeFileSync(path.join(directory,'.env'),'PORT=4180\n');
  try{
    await portableHost('start',{root:directory,log,loadEnvFile:file=>{assert.equal(file,path.join(directory,'.env'));calls.push('env');},runServer:async()=>calls.push('server')});
    assert.deepEqual(calls,['prepare','env','server']);
    await portableHost('stop',{log});assert.ok(messages.some(s=>s.includes('Ctrl+C')));assert.ok(messages.some(s=>s.includes('không dừng tiến trình')));
    await assert.rejects(()=>portableHost('invalid',{log}),/Dùng install/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('portable status verifies both student and TA ports and reports unreachable app',async()=>{
  const config={origin:'http://192.168.2.20:4180',adminOrigins:['http://127.0.0.1:4181']},urls=[];
  const options={log:()=>{},loadEnvFile:()=>{},loadConfig:()=>config,fetch:async url=>{urls.push(url);return {ok:true};}};
  await portableHost('status',options);assert.deepEqual(urls.sort(),[config.origin+'/readyz',config.adminOrigins[0]+'/readyz'].sort());
  await assert.rejects(()=>portableHost('status',{...options,fetch:async()=>{throw Error('offline');}}),/chưa trả lời đủ hai cổng/);
});
test('portable foreground start really serves the app with dotenv config from a path containing spaces',async t=>{
  const name=Object.keys(os.networkInterfaces()).find(name=>{try{loadLanConfig({LAN_INTERFACE:name});return true;}catch{return false;}});
  if(!name)return t.skip('No private IPv4 adapter on this runner');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp Windows startup '));let child;
  async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value;}
  const env={PORT:String(await port()),ADMIN_PORT:String(await port()),LAN_INTERFACE:name,BP_DATABASE:envPath(path.join(directory,'attendance.sqlite')),GOOGLE_SHEET_ID:''};
  const config=loadLanConfig(env);env.CAMPUS_CIDRS=config.host+'/32';
  fs.writeFileSync(path.join(directory,'.env'),Object.entries(env).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n'));
  try{
    child=spawn(process.execPath,['-e',"require('./scripts/portable-host.cjs').portableHost('start',{root:process.argv[1]}).catch(e=>{console.error(e);process.exitCode=1})",directory],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot||'',WINDIR:process.env.WINDIR||''},stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',chunk=>errors+=chunk);child.stdout.resume();
    let started=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error('Foreground startup failed: '+errors);
      try{const response=await fetch(config.adminOrigins[0]+'/api/dashboard',{signal:AbortSignal.timeout(300)});if(response.ok){const body=await response.json();assert.equal(body.url,config.origin);assert.equal(body.sessions.length,0);started=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,50));
    }
    assert.ok(started,errors);assert.equal((await fetch(config.origin+'/api/session')).status,200);assert.ok(fs.existsSync(path.join(directory,'attendance.sqlite')));
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
