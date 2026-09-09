const test=require('node:test'),assert=require('node:assert/strict');
const {wifiNames,parseHardwarePorts}=require('../web/network-discovery.cjs');
const {chooseNetwork}=require('../web/lan-config.cjs');
const {networkPicker}=require('../scripts/network-picker.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
test('macOS discovers the hardware Wi-Fi device without assuming en0, and Windows handles renamed Wi-Fi',()=>{
  const output='Hardware Port: Ethernet\nDevice: en0\nEthernet Address: 00:11\n\nHardware Port: Wi-Fi\nDevice: en1\nEthernet Address: 22:33\n';
  assert.deepEqual(parseHardwarePorts(output),['en1']);
  assert.deepEqual(wifiNames('darwin',(file,args)=>{assert.equal(file,'/usr/sbin/networksetup');assert.deepEqual(args,['-listallhardwareports']);return output;}),['en1']);
  const interfaces={en0:[{family:'IPv4',internal:false,address:'10.1.1.2',cidr:'10.1.1.2/24'}],en1:[{family:'IPv4',internal:false,address:'192.168.1.3',cidr:'192.168.1.3/24'}]};
  assert.equal(chooseNetwork({},interfaces,'darwin',['en1']).name,'en1');
  assert.deepEqual(wifiNames('win32',()=>JSON.stringify('Mạng trường')),['Mạng trường']);
  assert.equal(chooseNetwork({}, {'Mạng trường':interfaces.en1},'win32',['Mạng trường']).name,'Mạng trường');
  assert.deepEqual(wifiNames('darwin',()=>{throw Error('restricted');}),[]);
});
test('network picker uses localhost, rejects cross-origin/CSRF/forged addresses and picks a current private adapter',async()=>{
  const network={name:'Wi-Fi',address:'192.168.1.3',cidr:'192.168.1.3/24',wifi:true};
  const picker=await networkPicker({list:()=>[network,{name:'VPN',address:'10.8.0.2',virtual:true},{name:'Public',address:'203.0.113.3'}]});
  try{
    const response=await fetch(picker.origin+'/api/networks'),data=await response.json();assert.equal(data.networks.length,1);
    async function post(body,headers={}){return fetch(picker.origin+'/api/select',{method:'POST',headers:{Origin:picker.origin,'Content-Type':'application/json','X-CSRF-Token':data.csrf,...headers},body:JSON.stringify(body)});}
    assert.equal((await post(network,{Origin:'https://evil.example'})).status,403);
    assert.equal((await post(network,{'X-CSRF-Token':'wrong'})).status,403);
    assert.equal((await post({...network,address:'203.0.113.3'})).status,409);
    assert.equal((await post(network)).status,200);assert.equal((await picker.selection).address,network.address);
    assert.equal((await post(network)).status,409);
  }finally{await picker.close();}
});
test('fresh launcher creates configuration and lets the TA choose a network without editing env',async t=>{
  const {networkAdapters}=require('../web/lan-config.cjs'),ipaddr=require('ipaddr.js');
  const available=networkAdapters().find(n=>!n.virtual&&ipaddr.parse(n.address).range()==='private');
  if(!available)return t.skip('Runner has no private physical LAN address');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bp fresh launch '));let child;
  async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
  fs.copyFileSync(path.resolve(__dirname,'../.env.example'),path.join(directory,'.env.example'));
  const adminPort=await port(),studentPort=await port();
  try{
    const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot||'',WINDIR:process.env.WINDIR||'',BP_NO_BROWSER:'1',LAN_INTERFACE:'previous-unplugged-adapter',PORT:String(studentPort),ADMIN_PORT:String(adminPort)};
    child=spawn(process.execPath,['-e',"require('./scripts/portable-host.cjs').portableHost('start',{root:process.argv[1]}).catch(e=>{console.error(e);process.exitCode=1})",directory],{cwd:path.resolve(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
    let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
    let origin;
    for(let i=0;i<300;i++){
      if(child.exitCode!==null)throw Error(errors);
      const match=/Chọn mạng của lớp: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);if(match){origin=match[1];break;}
      await new Promise(r=>setTimeout(r,50));
    }
    assert.ok(origin,errors);assert.ok(fs.existsSync(path.join(directory,'.env')));
    const profile=await (await fetch(origin+'/api/networks')).json();
    const network=profile.networks.find(n=>n.address===available.address);assert.ok(network);
    assert.equal((await fetch(origin+'/api/select',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':profile.csrf},body:JSON.stringify(network)})).status,200);
    let ready=false;
    for(let i=0;i<100;i++){
      try{const r=await fetch('http://127.0.0.1:'+adminPort+'/api/dashboard');if(r.ok){const data=await r.json();assert.equal(data.sessions.length,0);assert.equal(data.url,'http://'+network.address+':'+studentPort);ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(ready,errors);assert.ok(fs.existsSync(path.join(directory,'data/web-live.sqlite')));
    const data=await (await fetch(origin+'/api/networks')).json();assert.equal(data.target,'http://127.0.0.1:'+adminPort+'/');
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
