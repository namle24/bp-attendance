const express=require('express');
const path=require('node:path');
const {AttendanceGoogleClient}=require('./google.cjs');
const {fail,equal,contains,today,issueQr,verifyQr,validateIdentity}=require('./security.cjs');

function cookie(req,name){
  const entry=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return entry?entry.slice(name.length+1):'';
}
function createApp(config,store,worker,options={}){
  const app=express(),clock=options.clock||Date.now;
  const google=new AttendanceGoogleClient(config.clientId);
  const verify=options.verifyGoogle|| (async token=>(await google.verifyIdToken({idToken:token,audience:config.clientId})).getPayload());
  const cookieOptions={httpOnly:true,secure:true,sameSite:'lax',path:'/'};
  const authName='__Host-bp_auth',challengeName='__Host-bp_login';
  app.disable('x-powered-by');
  app.set('trust proxy',address=>contains(address,config.proxies));
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
      'Content-Security-Policy':"default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});
    res.set('Strict-Transport-Security','max-age=31536000');
    next();
  });
  // Health contains no account/session data; every user-facing route is network gated.
  app.get('/healthz',(req,res)=>res.json({ok:true}));
  app.get('/readyz',(req,res)=>{
    try{store.db.prepare('SELECT value FROM meta WHERE key=?').get('revision');res.json({ok:true});}
    catch{res.status(503).json({ok:false});}
  });
  app.use((req,res,next)=>{
    if(!contains(req.ip,config.campus)){
      if(req.method==='GET'&&!req.path.startsWith('/api/')&&req.accepts('html'))return res.status(403).sendFile(path.join(__dirname,'public/network.html'));
      return res.status(403).json({code:'NETWORK_DENIED',error:'Chỉ điểm danh khi kết nối mạng USTH được cho phép. Kiểm tra Wi-Fi và tắt 4G/VPN rồi thử lại.'});
    }
    next();
  });
  // Shared campus NAT must accommodate the whole class, not a single-person IP quota.
  const buckets=new Map();let lastSweep=0;
  app.use('/api',(req,res,next)=>{
    const now=clock();
    if(now-lastSweep>=5000){for(const [key,b] of buckets)if(now-b.start>=60000)buckets.delete(key);lastSweep=now;}
    // Only a valid server session earns its own quota; arbitrary cookies share the NAT quota.
    req.auth=store.getAuth(cookie(req,authName),now);
    const key=req.auth?'auth:'+req.auth.hash:'ip:'+req.ip;
    let b=buckets.get(key);
    const denied=()=>{res.set('Retry-After','60');return res.status(429).json({code:'RATE_LIMIT',error:'Quá nhiều yêu cầu. Vui lòng chờ một phút.'});};
    if(!b&&buckets.size>=10000)return denied();
    if(!b||now-b.start>=60000)b={start:now,count:0};
    b.count++;buckets.set(key,b);
    if(b.count>(req.auth?240:5000))return denied();
    next();
  });
  app.use(express.json({limit:'512kb',strict:true}));
  app.use('/api',(req,res,next)=>{
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
      if(req.headers.origin!==config.origin)fail(403,'ORIGIN_DENIED','Yêu cầu không xuất phát từ trang điểm danh.');
      if(!req.is('application/json'))fail(415,'JSON_REQUIRED','Yêu cầu phải là JSON.');
      if(!req.body||Array.isArray(req.body))fail(400,'BODY_INVALID','Nội dung yêu cầu không hợp lệ.');
    }
    next();
  });
  function current(req){
    const auth=req.auth;if(!auth||auth.expires<=clock())fail(401,'LOGIN_REQUIRED','Vui lòng đăng nhập Google USTH.');
    const admin=config.admins.includes(auth.email);
    const student=admin?null:store.studentIdentity(auth.sub,auth.email);
    if(!admin&&!student)fail(403,'NOT_ENROLLED','Tài khoản không còn trong danh sách lớp.');
    return {...auth,admin,student};
  }
  function authenticated(req,res,next){req.user=current(req);if(req.method==='POST'&&!equal(req.headers['x-csrf-token'],req.user.csrf))fail(403,'CSRF_DENIED','Phiên làm việc không hợp lệ. Tải lại trang.');next();}
  function admin(req,res,next){if(!req.user.admin)fail(403,'ADMIN_REQUIRED','Chỉ giảng viên/trợ giảng được thao tác.');next();}
  function text(value,max=10000){if(typeof value!=='string'||value.length>max)fail(400,'INPUT_INVALID','Dữ liệu nhập không hợp lệ hoặc quá dài.');return value;}
  function challenge(req){
    const c=store.getChallenge(cookie(req,challengeName),clock());
    if(!c||!equal(c.csrf,req.headers['x-csrf-token']))fail(403,'LOGIN_CHALLENGE','Phiên đăng nhập hết hạn. Tải lại trang và thử lại.');
    return c;
  }
  function finishLogin(req,res,c,identity){
    if(!config.admins.includes(identity.email))store.bindStudent(identity);
    const session=store.authenticate(c.hash,identity,clock());
    res.cookie(authName,session.token,{...cookieOptions,maxAge:8*3600000});res.clearCookie(challengeName,cookieOptions);
    res.json({ok:true});
  }
  app.get('/api/bootstrap',(req,res)=>{
    let user;try{user=current(req);}catch(e){if(![401,403].includes(e.status))throw e;}
    if(user)return res.json({today:today(clock()),user:{email:user.email,admin:user.admin,studentId:user.student?.id,name:user.student?.name},csrf:user.csrf,serverTime:clock()});
    const c=store.challenge(clock());res.cookie(challengeName,c.token,{...cookieOptions,maxAge:5*60000});
    res.json({clientId:config.clientId,nonce:c.nonce,csrf:c.csrf,serverTime:clock()});
  });
  app.post('/api/auth/google',async(req,res)=>{
    const c=challenge(req);let payload;
    try{payload=await verify(text(req.body.credential,10000));}catch{fail(401,'GOOGLE_LOGIN_FAILED','Không xác thực được Google. Hãy đăng nhập lại.');}
    const identity=validateIdentity(payload,config,c.nonce,clock());finishLogin(req,res,c,identity);
  });
  app.use('/api',authenticated);
  app.post('/api/logout',(req,res)=>{store.logout(cookie(req,authName));res.clearCookie(authName,cookieOptions);res.json({ok:true});});
  app.post('/api/check-in',(req,res)=>{
    if(!req.user.student)fail(403,'STUDENT_REQUIRED','Chỉ tài khoản sinh viên trong lớp được điểm danh.');
    let sid,method='QR';const now=clock();
    if(req.body.code!==undefined){
      if(req.body.token!==undefined)fail(400,'INPUT_INVALID','Chỉ dùng QR hoặc mã trên màn chiếu.');
      store.attemptCode(req.user.sub,now);
      const code=text(req.body.code,20).replace(/[\s-]/g,'').toUpperCase();
      if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))fail(400,'CODE_INVALID','Nhập đúng 8 ký tự của mã đang chiếu.');
      const session=store.activeSession(now);if(!session)fail(409,'SESSION_CLOSED','Chưa có phiên đang mở. Liên hệ trợ giảng.');
      if(!equal(code,issueQr(session,config.secret,now).code))fail(400,'CODE_INVALID','Mã không đúng hoặc đã hết hạn. Nhập mã mới đang chiếu.');
      sid=session.id;method='CODE';
    }else sid=verifyQr(req.body.token,config.secret,now).sid;
    const receipt=store.checkIn(sid,req.user,req.ip,clock(),method);res.json({receipt,sync:worker.status()});
  });
  app.get('/api/me/attendance',(req,res)=>{
    if(!req.user.student)return res.json({records:[]});
    const records=store.db.prepare('SELECT s.date,s.mode,a.at FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE a.student_id=? ORDER BY s.date DESC').all(req.user.student.id);
    res.json({records});
  });
  app.use('/api/admin',admin);
  app.get('/api/admin/dashboard',(req,res)=>res.json({sessions:store.sessions(),students:store.roster(true).length,sync:worker.status(),serverTime:clock(),today:today(clock()),networkCidrs:config.campusCidrs}));
  app.post('/api/admin/roster',(req,res)=>res.json({count:store.importRoster(text(req.body.csv,500000),req.user.email)}));
  app.post('/api/admin/sessions',(req,res)=>res.json({session:store.open(text(req.body.date,10),req.body.minutes,req.user.email,clock())}));
  app.post('/api/admin/sessions/:id/close',(req,res)=>res.json({session:store.closeSession(req.params.id,req.user.email,clock())}));
  app.get('/api/admin/sessions/:id/qr',(req,res)=>{
    const s=store.session(req.params.id);if(!s)fail(404,'SESSION_UNKNOWN','Không có phiên này.');
    const qr=issueQr(s,config.secret,clock());res.json({...qr,url:config.origin+'/check-in#'+qr.token});
  });
  app.post('/api/admin/online',(req,res)=>res.json({count:store.importOnline(text(req.body.date,10),text(req.body.list,200000),text(req.body.evidence,2000),req.user.email,clock())}));
  app.post('/api/admin/corrections',(req,res)=>{store.correction(text(req.body.date,10),text(req.body.studentId,40),text(req.body.mark,10),text(req.body.reason,2000),req.user.email);res.json({ok:true});});
  app.post('/api/admin/sync',async(req,res)=>res.json({sync:await worker.sync(true)}));
  app.get('/api/admin/export.csv',(req,res)=>res.type('text/csv').attachment('bp-attendance.csv').send(store.csv()));
  app.get('/api/admin/audit',(req,res)=>res.json({events:store.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all(),corrections:store.db.prepare('SELECT * FROM corrections ORDER BY id DESC LIMIT 100').all()}));
  app.use('/api',(req,res)=>res.status(404).json({error:'Không có API này.'}));
  app.use(express.static(path.join(__dirname,'public'),{index:false}));
  for(const route of ['/','/check-in','/admin'])app.get(route,(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
  app.use((err,req,res,next)=>{
    if(res.headersSent)return next(err);
    const status=err.status||500;
    if(status===429)res.set('Retry-After','60');
    // Do not echo JWTs, database statements, OAuth payloads or credentials into logs/responses.
    res.status(status).json({code:err.code||'SERVER_ERROR',error:status>=500?'Server chưa xử lý được yêu cầu. Vui lòng thử lại; dữ liệu đã lưu không bị xóa.':err.message});
  });
  return app;
}
module.exports={createApp};
