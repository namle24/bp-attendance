const express=require('express');
const path=require('node:path');
const {random,contains,equal,fail,today}=require('./security.cjs');
const publicDirectory=path.join(__dirname,'lan-public');
function common(config,admin){
  const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    const origins=admin?config.adminOrigins:[config.origin];
    if(!origins.some(origin=>new URL(origin).host===req.headers.host))return res.status(403).json({code:'HOST_DENIED',message:'Mở đúng địa chỉ do TA cung cấp.'});
    const address=req.socket.remoteAddress;
    if(admin?!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address):!contains(address,config.campus))return res.status(403).json({code:'NETWORK_DENIED',message:'Kết nối Wi-Fi của lớp rồi mở lại link điểm danh.'});
    if(!['GET','HEAD'].includes(req.method)&&(!origins.includes(req.headers.origin)||!req.is('application/json')))return res.status(403).json({code:'ORIGIN_DENIED',message:'Tải lại trang điểm danh rồi thử lại.'});
    next();
  });
  // A generous shared-IP budget allows 700 people behind NAT; never infer identity from it.
  const buckets=new Map();let swept=0;
  app.use('/api',(req,res,next)=>{
    const now=Date.now();if(now-swept>60000){for(const [key,b] of buckets)if(now-b.start>=60000)buckets.delete(key);swept=now;}
    const key=req.socket.remoteAddress;let bucket=buckets.get(key);
    if(!bucket){if(buckets.size>=10000)return res.status(503).json({message:'Máy đang bận, thử lại sau ít giây.'});bucket={start:now,count:0};buckets.set(key,bucket);}
    if(now-bucket.start>=60000){bucket.start=now;bucket.count=0;}
    if(++bucket.count>(admin?1200:6000))return res.status(429).set('Retry-After','60').json({message:'Có nhiều lượt truy cập. Vui lòng chờ một phút rồi gửi lại.'});
    next();
  });
  app.use(express.json({limit:admin?'512kb':'3kb'}));
  app.use((req,res,next)=>{if(req.method==='POST'&&(!req.body||Array.isArray(req.body)||typeof req.body!=='object'))fail(400,'BODY_INVALID','Dữ liệu gửi không hợp lệ.');next();});
  app.get('/readyz',(req,res)=>res.json({ok:true}));
  return app;
}
function finish(app,page){
  app.use('/assets',express.static(path.join(__dirname,'public/assets'),{dotfiles:'deny'}));
  app.get('/qr.js',(req,res)=>res.sendFile(path.join(__dirname,'public/qr.js')));
  app.use(express.static(publicDirectory,{index:false,dotfiles:'deny'}));
  app.get(['/', '/check-in'],(req,res)=>res.sendFile(path.join(publicDirectory,page)));
  app.use((req,res)=>res.status(404).json({message:'Không tìm thấy trang.'}));
  app.use((error,req,res,next)=>{
    const status=error.status||500;
    res.status(status).json({code:error.code||'REQUEST_FAILED',message:status>=500?'Máy host chưa xử lý được. Giữ trang này và gửi lại; nếu lỗi tiếp diễn, báo TA.':error.type==='entity.too.large'?'Dữ liệu quá lớn.':error instanceof SyntaxError?'Dữ liệu JSON không hợp lệ.':error.message});
  });
  return app;
}
function createStudentApp(config,store,options={}){
  const now=options.clock||Date.now,app=common(config,false);
  app.get('/api/session',(req,res)=>{
    const session=store.activeSession(now());res.json({session:session?{id:session.id,date:session.date,endsAt:session.ends_at}:null,serverTime:now()});
  });
  app.post('/api/check-in',(req,res)=>res.json({receipt:store.submit(req.body,req.socket.remoteAddress,now())}));
  return finish(app,'student.html');
}
function createAdminApp(config,store,worker,options={}){
  const now=options.clock||Date.now,app=common(config,true),csrf=random(),actor='TA tại máy host';
  app.use('/api',(req,res,next)=>{if(req.method==='POST'&&!equal(req.headers['x-csrf-token'],csrf))fail(403,'CSRF_INVALID','Tải lại trang quản lý rồi thử lại.');next();});
  app.get('/api/dashboard',(req,res)=>res.json({csrf,today:today(now()),sessions:store.sessions(),sync:worker.status(),url:config.origin,serverTime:now(),network:config.network,cidrs:config.campusCidrs}));
  app.post('/api/sessions',(req,res)=>res.json({session:store.open(today(now()),Number(req.body.minutes),actor,now())}));
  app.post('/api/sessions/:id/close',(req,res)=>res.json({session:store.closeSession(req.params.id,actor,now())}));
  app.get('/api/entries',(req,res)=>res.json({entries:store.entries(typeof req.query.session==='string'?req.query.session:undefined)}));
  app.get('/api/history',(req,res)=>res.json({entries:store.history(req.query.date)}));
  app.get('/api/issues',(req,res)=>res.json(store.issues(req.query.date,req.query.status)));
  app.post('/api/entries/:id/review',(req,res)=>{store.reviewEntry(Number(req.params.id),req.body.review,req.body.note,req.body.peers,actor,now());res.json({ok:true});});
  app.post('/api/sync',(req,res)=>{void worker.sync(true);res.json(worker.status());});
  app.post('/api/roster',(req,res)=>res.json({count:store.importRoster(req.body.csv,actor)}));
  app.post('/api/online',(req,res)=>res.json({count:store.importOnline(req.body.date,req.body.list,req.body.evidence,actor,now())}));
  for(const [route,kind] of [['export','summary'],['detail','detail'],['issues','issues']])app.get('/api/'+route+'.csv',(req,res)=>{
    const report=store.report(kind,req.query.date,req.query.status);res.type('text/csv').attachment(report.filename).send(report.csv);
  });
  app.get('/api/audit',(req,res)=>res.json({events:store.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all()}));
  return finish(app,'admin.html');
}
module.exports={createStudentApp,createAdminApp};
