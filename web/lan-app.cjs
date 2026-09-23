const express=require('express');
const path=require('node:path');
const {random,contains,equal,fail,today}=require('./security.cjs');
const publicDirectory=path.join(__dirname,'lan-public');
const devices=require('./device.cjs');
const simple=require('./simple-page.cjs');
const {page}=require('./student-page.cjs');
const {filterEntries}=require('./attendance-filters.cjs');
function common(config,admin,diagnostics){
  const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
  if(diagnostics&&!admin)app.use(diagnostics.middleware);
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    const origins=admin?config.adminOrigins:[config.origin];
    if(!origins.some(origin=>new URL(origin).host===req.headers.host))return res.status(403).json({code:'HOST_DENIED',message:'Mở đúng địa chỉ do TA cung cấp.'});
    const address=req.socket.remoteAddress;
    if(admin?!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address):!contains(address,config.campus))return res.status(403).json({code:'NETWORK_DENIED',message:'Kết nối Wi-Fi của lớp rồi mở lại link điểm danh.'});
    const simpleForm=!admin&&req.path==='/simple'&&req.method==='POST'&&req.is('application/x-www-form-urlencoded');
    if(!['GET','HEAD'].includes(req.method)&&(!(simpleForm&&(!req.headers.origin||req.headers.origin==='null'))&&!origins.includes(req.headers.origin)||!(req.is('application/json')||simpleForm)))return res.status(403).json({code:'ORIGIN_DENIED',message:'Tải lại trang điểm danh rồi thử lại.'});
    next();
  });
  // A generous shared-IP budget allows 700 people behind NAT; never infer identity from it.
  const buckets=new Map();let swept=0;
  app.use(['/api','/simple'],(req,res,next)=>{
    const now=Date.now();if(now-swept>60000){for(const [key,b] of buckets)if(now-b.start>=60000)buckets.delete(key);swept=now;}
    const key=req.socket.remoteAddress;let bucket=buckets.get(key);
    if(!bucket){if(buckets.size>=10000)return res.status(503).json({message:'Máy đang bận, thử lại sau ít giây.'});bucket={start:now,count:0};buckets.set(key,bucket);}
    if(now-bucket.start>=60000){bucket.start=now;bucket.count=0;}
    if(++bucket.count>(admin?1200:6000))return res.status(429).set('Retry-After','60').json({message:'Có nhiều lượt truy cập. Vui lòng chờ một phút rồi gửi lại.'});
    next();
  });
  app.use(express.json({limit:admin?'512kb':'3kb'}));
  if(!admin)app.use('/simple',express.urlencoded({extended:false,limit:'3kb',parameterLimit:10}));
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
    res.status(status).json({code:error.code||'REQUEST_FAILED',message:status>=500?'Máy host chưa xử lý được. Giữ trang này và gửi lại; nếu lỗi tiếp diễn, báo TA.':error.type==='entity.too.large'?'Dữ liệu quá lớn.':error instanceof SyntaxError?'Dữ liệu JSON không hợp lệ.':error.message,...(error.code==='DUPLICATE_REVIEW'&&error.receipt?{receipt:error.receipt}:{})});
  });
  return app;
}
function createStudentApp(config,store,options={}){
  const now=options.clock||Date.now,app=common(config,false,options.connections);
  app.use((req,res,next)=>{devices.attach(req,res,store.meta('lanQrSecret'));next();});
  const studentPage=page('student.html',['client.js','student.js']),historyPage=page('history.html',['client.js','history.js']);
  app.get(['/','/check-in','/student.html'],studentPage);
  app.get(['/history','/history.html'],historyPage);
  app.use('/simple',(req,res,next)=>{res.set('Content-Security-Policy',simple.csp);next();});
  app.get('/simple',(req,res)=>res.type('html').send(simple.render({store,device:req.device||req.newDevice,now:now(),round:typeof req.query.round==='string'?req.query.round:undefined})));
  app.post('/simple',(req,res)=>{
    try{
      simple.verify(req.body.formToken,req.device,store.meta('lanQrSecret'),now());
      if(req.body.action==='supplement-email'){
        const receipt=store.supplementEmail(req.body.sessionId,req.device,req.body.email,now());
        return res.type('html').send(simple.render({store,device:req.device,now:now(),receipt,message:'Đã lưu email. Mang thẻ sinh viên xuống bàn TA để hoàn tất đối chiếu.'}));
      }
      const body={sessionId:req.body.sessionId,studentId:req.body.studentId,name:req.body.name,requestId:req.body.requestId};
      if(!store.deviceReceipt(body.sessionId,req.device)){const grant=store.scan({code:req.body.code},req.socket.remoteAddress,now(),req.device);body.sessionId=grant.sessionId;body.scanTicket=grant.scanTicket;}
      const receipt=store.checkIn(body,req.socket.remoteAddress,now(),req.device);
      res.type('html').send(simple.render({store,device:req.device,now:now(),receipt}));
    }catch(error){res.status(error.status||500).type('html').send(simple.render({store,device:req.device||req.newDevice,now:now(),input:req.body,receipt:error.receipt||store.deviceReceipt(req.body.sessionId,req.device),message:error.status?error.message:'Máy đang bận. Giữ nguyên trang và gửi lại.'}));}
  });
  app.post('/api/student-history',(req,res)=>{
    if(!options.lookup)fail(503,'LOOKUP_NOT_CONFIGURED','TA chưa cấu hình Google Sheet kết quả. Vui lòng báo TA.');
    res.json(options.lookup.search(req.body.studentId));
  });
  app.get('/api/session',(req,res)=>{
    const session=store.activeSession(now());res.json({session:session?{id:session.id,date:session.date,endsAt:session.ends_at,number:session.number,label:session.label,generation:session.generation,location:{enabled:false}}:null,receipt:session?store.deviceReceipt(session.id,req.device):store.recentDeviceReceipt(req.device,today(now())),serverTime:now()});
  });
  app.get('/api/receipt',(req,res)=>{
    if(typeof req.query.round!=='string'||req.query.round.length>64)fail(400,'ROUND_INVALID','Đợt không hợp lệ.');
    res.json({receipt:store.deviceReceipt(req.query.round,req.device)});
  });
  app.post('/api/review-email',(req,res)=>res.json({receipt:store.supplementEmail(req.body.sessionId,req.device,req.body.email,now())}));
  app.post('/api/scan',(req,res)=>{const device=req.device||req.newDevice,grant=store.scan(req.body,req.socket.remoteAddress,now(),device);res.json({...grant,requestId:require('node:crypto').randomBytes(16).toString('hex'),receipt:store.deviceReceipt(grant.sessionId,device)});});
  app.post('/api/check-in',(req,res)=>{
    if(!req.device)fail(403,'COOKIES_REQUIRED','Trình duyệt chưa giữ được lượt quét. Mở link trực tiếp bằng Safari hoặc Chrome, cho phép cookie rồi quét lại QR.');
    res.json({receipt:store.checkIn(req.body,req.socket.remoteAddress,now(),req.device)});
  });
  return finish(app,'student.html');
}
function createAdminApp(config,store,worker,options={}){
  const now=options.clock||Date.now,app=common(config,true),csrf=random(),actor='TA tại máy host';
  app.use('/api',(req,res,next)=>{if(req.method==='POST'&&!equal(req.headers['x-csrf-token'],csrf))fail(403,'CSRF_INVALID','Tải lại trang quản lý rồi thử lại.');next();});
  app.get('/api/dashboard',(req,res)=>res.json({csrf,today:today(now()),sessions:store.sessions(),sync:worker.status(),url:config.origin,serverTime:now(),network:config.network,cidrs:config.campusCidrs}));
  app.get('/api/connections',(req,res)=>res.json(options.connections?options.connections.snapshot():{since:now(),rows:[]}));
  // The same 40-bit HMAC-derived room code keeps the projected QR easy to scan.
  // It has exactly the same expiry and admission checks as manual code entry.
  app.get('/api/qr',(req,res)=>{const qr=store.currentQr(now());res.json({qr:qr?{...qr,url:config.origin+'/#code='+qr.code}:null});});
  app.get('/api/projector',(req,res)=>{
    const at=now(),active=store.activeSession(at),sessions=store.sessions(),session=sessions.find(s=>s.id===active?.id)||sessions.find(s=>s.mode==='OFFLINE'&&s.date===today(at)),qr=store.currentQr(at);
    res.json({serverTime:at,url:config.origin,
      session:session?{id:session.id,date:session.date,endsAt:session.ends_at,open:!session.closed_at&&session.ends_at>at,count:session.count,number:session.number,label:session.label}:null,
      qr:qr?{code:qr.code,expiresAt:qr.expiresAt,url:config.origin+'/#code='+qr.code}:null});
  });
  app.use('/projector',express.static(path.join(__dirname,'projector'),{dotfiles:'deny'}));
  app.post('/api/sessions',(req,res)=>res.json({session:store.open(today(now()),Number(req.body.minutes),actor,now(),req.body.label??'')}));
  app.post('/api/sessions/:id/reopen',(req,res)=>res.json({session:store.reopen(req.params.id,Number(req.body.minutes),actor,now())}));
  app.post('/api/sessions/:id/close',(req,res)=>res.json({session:store.closeSession(req.params.id,actor,now())}));
  app.get('/api/entries',(req,res)=>{const rows=store.entries(typeof req.query.session==='string'?req.query.session:undefined);res.json({entries:filterEntries(rows,req.query),total:rows.length,pending:rows.filter(r=>r.status==='PENDING').length});});
  app.get('/api/history',(req,res)=>{const rows=store.history(req.query.date);res.json({entries:filterEntries(rows,req.query),total:rows.length});});
  app.get('/api/issues',(req,res)=>res.json(store.issues(req.query.date,req.query.status,req.query)));
  app.post('/api/entries/:id/review',(req,res)=>{store.reviewEntry(Number(req.params.id),req.body.review,req.body.note,req.body.peers,actor,now(),req.body.duplicateAttempts,req.body.cardChecked);res.json({ok:true});});
  app.post('/api/sync',(req,res)=>{void worker.sync(true);res.json(worker.status());});
  app.get('/api/lookup-source',(req,res)=>res.json({source:options.lookup?.source()||null,...(options.lookup?.status()||{configured:false,updatedAt:null,refreshing:false,stale:false,error:''})}));
  app.post('/api/lookup-source',(req,res)=>{
    if(!options.lookup)fail(503,'LOOKUP_UNAVAILABLE','Khởi động lại app để bật cấu hình tra cứu.');
    const source=options.lookup.configure(req.body,actor);void options.lookup.sync();res.json({source,...options.lookup.status()});
  });
  app.post('/api/lookup-refresh',(req,res)=>{
    if(!options.lookup)fail(503,'LOOKUP_UNAVAILABLE','Khởi động lại app để bật cấu hình tra cứu.');
    void options.lookup.sync();res.json(options.lookup.status());
  });
  app.post('/api/roster',(req,res)=>res.json({count:store.importRoster(req.body.csv,actor)}));
  app.post('/api/online',(req,res)=>res.json({count:store.importOnline(req.body.date,req.body.list,req.body.evidence,actor,now())}));
  for(const [route,kind] of [['export','summary'],['detail','detail'],['issues','issues']])app.get('/api/'+route+'.csv',(req,res)=>{
    const report=store.report(kind,req.query.date,req.query.status,req.query);res.type('text/csv').attachment(report.filename).send(report.csv);
  });
  app.get('/api/audit',(req,res)=>res.json({events:store.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all()}));
  return finish(app,'admin.html');
}
module.exports={createStudentApp,createAdminApp};
