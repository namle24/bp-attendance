const express=require('express'),path=require('node:path');
const ipaddr=require('ipaddr.js');
const {networkAdapters}=require('../web/lan-config.cjs');
const {random,equal}=require('../web/security.cjs');
async function networkPicker(options={}){
  const list=options.list||networkAdapters,csrf=random(),app=express();let origin,chosen=false,target='',error='';
  const candidates=()=>list().filter(n=>!n.virtual&&ipaddr.parse(n.address).range()==='private');
  let resolveSelection;const selection=new Promise(resolve=>{resolveSelection=resolve;});
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    if(req.headers.host!==new URL(origin).host||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return res.sendStatus(403);
    if(req.method==='POST'&&(req.headers.origin!==origin||!req.is('application/json')||!equal(req.headers['x-csrf-token'],csrf)))return res.sendStatus(403);
    next();
  });
  app.use(express.json({limit:'2kb'}));
  app.get('/api/networks',(req,res)=>res.json({csrf,networks:candidates().map(n=>({name:n.name,address:n.address,wifi:n.wifi})),target,error}));
  app.post('/api/select',(req,res)=>{
    if(chosen)return res.status(409).json({message:'Đang bật app, vui lòng chờ.'});
    const network=candidates().find(n=>n.name===req.body?.name&&n.address===req.body?.address);
    if(!network)return res.status(409).json({message:'Mạng vừa thay đổi. Chọn lại mạng đang kết nối.'});
    chosen=true;res.json({ok:true});resolveSelection(network);
  });
  app.get('/',(req,res)=>res.sendFile(path.resolve(__dirname,'../web/lan-public/launcher.html')));
  app.get('/launcher.js',(req,res)=>res.sendFile(path.resolve(__dirname,'../web/lan-public/launcher.js')));
  app.get('/style.css',(req,res)=>res.sendFile(path.resolve(__dirname,'../web/lan-public/style.css')));
  app.get('/assets/usth-logo.png',(req,res)=>res.sendFile(path.resolve(__dirname,'../web/public/assets/usth-logo.png')));
  const server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  origin='http://127.0.0.1:'+server.address().port;
  const close=()=>new Promise(resolve=>server.close(resolve));
  return {origin,selection,close,finish(url){target=url;const timer=setTimeout(()=>void close(),15000);timer.unref();},fail(message){error=message;}};
}
module.exports={networkPicker};
