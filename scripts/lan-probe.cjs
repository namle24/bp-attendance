// A short-lived connectivity page; no attendance, Google login, files or database.
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {isIP}=require('node:net');
const {ranges,contains}=require('../web/security.cjs');
const args=process.argv.slice(2),options={host:'127.0.0.1',port:4188,seconds:300};
try{
  for(let i=0;i<args.length;i+=2){
    const name=args[i]?.slice(2),value=args[i+1];
    if(!['host','port','seconds'].includes(name)||value===undefined)throw Error('Dùng --host IP_LAN --port 4188 --seconds 300.');
    options[name]=name==='host'?value:Number(value);
  }
  if(isIP(options.host)!==4||!contains(options.host,ranges(['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','127.0.0.1/32'])))throw Error('Probe chỉ bind một IPv4 nội bộ cụ thể hoặc 127.0.0.1.');
  if(!Number.isInteger(options.port)||options.port<0||options.port>65535||!Number.isInteger(options.seconds)||options.seconds<5||options.seconds>600)throw Error('Port 0–65535, thời gian 5–600 giây.');
  const route='/probe/'+randomBytes(8).toString('hex');
  const server=http.createServer((req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'||req.url!==route){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
    res.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BP kiểm tra mạng</title><h1>Đã kết nối được tới laptop</h1><p>Đây chỉ là trang thử kết nối mạng. Chưa đăng nhập hoặc ghi nhận điểm danh.</p></html>');
  });
  server.headersTimeout=5000;server.requestTimeout=5000;server.setTimeout(5000,s=>s.destroy());
  const timer=setTimeout(()=>stop(),options.seconds*1000);
  function stop(){clearTimeout(timer);server.close();server.closeAllConnections();}
  server.on('error',error=>{clearTimeout(timer);console.error('Không mở được probe: '+error.code);process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,stop);
  server.listen(options.port,options.host,()=>console.log(JSON.stringify({url:'http://'+options.host+':'+server.address().port+route,expiresInSeconds:options.seconds,purpose:'Kiểm tra kết nối; không điểm danh'})));
}catch(error){console.error(error.message);process.exitCode=1;}
