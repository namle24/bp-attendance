const {DatabaseSync}=require('node:sqlite');
const {mkdirSync}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {parse}=require('csv-parse/sync');
const BP=require('./core.cjs');
const {fail,random,hash,today}=require('./security.cjs');

class Store {
  constructor(filename) {
    if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('revision','0'),('synced','0');
      CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, sub TEXT UNIQUE, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,date TEXT NOT NULL,mode TEXT NOT NULL,opened_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,closed_at INTEGER,actor TEXT NOT NULL,UNIQUE(date,mode));
      CREATE TABLE IF NOT EXISTS attendance (session_id TEXT REFERENCES sessions(id),student_id TEXT REFERENCES students(id),sub TEXT,at INTEGER NOT NULL,ip TEXT NOT NULL,actor TEXT NOT NULL,note TEXT NOT NULL,PRIMARY KEY(session_id,student_id));
      CREATE TABLE IF NOT EXISTS auth (hash TEXT PRIMARY KEY,sub TEXT NOT NULL,email TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges (hash TEXT PRIMARY KEY,nonce TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS code_limits (sub TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY,at INTEGER NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS corrections (id INTEGER PRIMARY KEY,date TEXT NOT NULL,student_id TEXT REFERENCES students(id),mark TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,at INTEGER NOT NULL);`);
  }
  tx(fn) {this.db.exec('BEGIN IMMEDIATE');try {const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  meta(key) {return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value||'';}
  setMeta(key,value) {this.db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
  dirty() {this.setMeta('revision',Number(this.meta('revision'))+1);}
  audit(actor,event,detail) {this.db.prepare('INSERT INTO audit(at,actor,event,detail) VALUES (?,?,?,?)').run(Date.now(),actor,event,JSON.stringify(detail));}
  roster(active=false) {return this.db.prepare('SELECT * FROM students'+(active?' WHERE active=1':'')+' ORDER BY id').all();}
  studentIdentity(sub,email) {return this.db.prepare('SELECT * FROM students WHERE sub=? AND email=? AND active=1').get(sub,email);}
  importRoster(csv,actor) {
    let rows; try {rows=parse(csv,{bom:true,skip_empty_lines:true,trim:true,max_record_size:5000});}catch {fail(400,'CSV_INVALID','CSV không hợp lệ.');}
    if(JSON.stringify(rows.shift())!==JSON.stringify(['MSSV','Họ tên','Email trường']))fail(400,'CSV_HEADERS','CSV cần tiêu đề MSSV,Họ tên,Email trường.');
    let students;try {students=BP.roster(rows).students;}catch(e){fail(400,'ROSTER_INVALID',e.message);}
    if(students.length>5000)fail(400,'ROSTER_LIMIT','Tối đa 5.000 sinh viên cho một lớp.');
    return this.tx(()=>{
      for(const s of students){
        const old=this.db.prepare('SELECT * FROM students WHERE id=?').get(s.id);
        if(old?.sub && old.email!==s.email)fail(409,'IDENTITY_BOUND','MSSV '+s.id+' đã liên kết Google. Cần xác minh thay đổi email trước khi sửa.');
        const emailOwner=this.db.prepare('SELECT id FROM students WHERE email=?').get(s.email);
        if(emailOwner && emailOwner.id!==s.id)fail(409,'EMAIL_CONFLICT','Email đang thuộc MSSV '+emailOwner.id+'.');
      }
      this.db.exec('UPDATE students SET active=0');
      const write=this.db.prepare('INSERT INTO students(id,name,email) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,active=1');
      for(const s of students)write.run(s.id,s.name,s.email);
      this.dirty();this.audit(actor,'ROSTER_IMPORT',{count:students.length});return students.length;
    });
  }
  bindStudent(identity) {
    const student=this.db.prepare('SELECT * FROM students WHERE email=? AND active=1').get(identity.email);
    if(!student)fail(403,'NOT_ENROLLED','Tài khoản chưa có trong danh sách lớp. Liên hệ trợ giảng.');
    if(student.sub && student.sub!==identity.sub)fail(403,'IDENTITY_CHANGED','Tài khoản không khớp liên kết đã lưu. Liên hệ trợ giảng.');
    const other=this.db.prepare('SELECT id FROM students WHERE sub=?').get(identity.sub);
    if(other && other.id!==student.id)fail(403,'IDENTITY_CONFLICT','Tài khoản đã được liên kết với một MSSV khác.');
    this.db.prepare('UPDATE students SET sub=? WHERE id=?').run(identity.sub,student.id);
    return student;
  }
  challenge(now=Date.now()) {
    const token=random(),nonce=random(),csrf=random();
    this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(now);
    this.db.prepare('DELETE FROM auth WHERE expires<=?').run(now);
    this.db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(hash(token),nonce,csrf,now+5*60000);
    return {token,nonce,csrf};
  }
  getChallenge(token,now=Date.now()) {return token?this.db.prepare('SELECT * FROM challenges WHERE hash=? AND expires>?').get(hash(token),now):null;}
  authenticate(challengeHash,identity,now=Date.now()) {
    return this.tx(()=>{
      // Atomic consume after Google's asynchronous verification prevents nonce replay races.
      if(!this.db.prepare('DELETE FROM challenges WHERE hash=? AND expires>?').run(challengeHash,now).changes)fail(401,'LOGIN_EXPIRED','Phiên đăng nhập đã dùng hoặc hết hạn. Tải lại trang.');
      const token=random(),csrf=random();
      this.db.prepare('INSERT INTO auth VALUES (?,?,?,?,?)').run(hash(token),identity.sub,identity.email,csrf,now+8*3600000);
      return {token,csrf};
    });
  }
  getAuth(token,now=Date.now()) {return token?this.db.prepare('SELECT * FROM auth WHERE hash=? AND expires>?').get(hash(token),now):null;}
  logout(token) {if(token)this.db.prepare('DELETE FROM auth WHERE hash=?').run(hash(token));}
  sessions() {return this.db.prepare('SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id) AS count FROM sessions s ORDER BY date DESC,opened_at DESC').all();}
  session(id) {return this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);}
  activeSession(now=Date.now()) {return this.db.prepare("SELECT * FROM sessions WHERE date=? AND mode='OFFLINE' AND closed_at IS NULL AND opened_at<=? AND ends_at>?").get(today(now),now,now);}
  attemptCode(sub,now=Date.now()) {
    const result=this.db.prepare('INSERT INTO code_limits VALUES (?,?,1) ON CONFLICT(sub) DO UPDATE SET started=CASE WHEN started<=? THEN excluded.started ELSE started END,count=CASE WHEN started<=? THEN 1 ELSE count+1 END RETURNING count').get(sub,now,now-60000,now-60000);
    if(result.count>10)fail(429,'CODE_RATE_LIMIT','Đã nhập mã quá nhiều lần. Vui lòng chờ một phút hoặc quét QR bằng điện thoại.');
  }
  open(date,minutes,actor,now=Date.now(),requireRoster=true) {
    try{BP.date(date);}catch(e){fail(400,'DATE_INVALID',e.message);}
    if(date!==today(now))fail(400,'DATE_NOT_TODAY','Chỉ mở phiên cho ngày hôm nay, theo giờ Việt Nam.');
    if(!Number.isInteger(minutes)||minutes<2||minutes>30)fail(400,'DURATION_INVALID','Thời gian mở từ 2 đến 30 phút.');
    if(requireRoster&&!this.roster(true).length)fail(409,'ROSTER_EMPTY','Nhập danh sách lớp trước khi mở phiên.');
    return this.tx(()=>{
      if(this.db.prepare('SELECT id FROM sessions WHERE date=? AND mode=?').get(date,'OFFLINE'))fail(409,'SESSION_EXISTS','Ngày này đã có phiên offline; không mở lại mốc đã đóng.');
      const id=randomUUID();this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run(id,date,'OFFLINE',now,now+minutes*60000,null,actor);
      this.dirty();this.audit(actor,'SESSION_OPEN',{id,date,minutes});return this.session(id);
    });
  }
  closeSession(id,actor,now=Date.now()) {
    return this.tx(()=>{
      const s=this.session(id);if(!s||s.mode!=='OFFLINE')fail(404,'SESSION_UNKNOWN','Không có phiên offline này.');
      if(!s.closed_at){this.db.prepare('UPDATE sessions SET closed_at=? WHERE id=?').run(Math.min(now,s.ends_at),id);this.audit(actor,'SESSION_CLOSE',{id});}
      return this.session(id);
    });
  }
  checkIn(sid,identity,ip,now=Date.now(),method='QR') {
    return this.tx(()=>{
      const s=this.session(sid);
      if(!s||s.mode!=='OFFLINE'||s.closed_at||now<s.opened_at||now>=s.ends_at)fail(409,'SESSION_CLOSED','Phiên đã đóng hoặc hết giờ.');
      const student=this.db.prepare('SELECT * FROM students WHERE sub=? AND email=? AND active=1').get(identity.sub,identity.email);
      if(!student)fail(403,'NOT_ENROLLED','Không tìm thấy MSSV hợp lệ cho tài khoản này.');
      const inserted=this.db.prepare('INSERT OR IGNORE INTO attendance VALUES (?,?,?,?,?,?,?)').run(sid,student.id,identity.sub,now,ip,identity.email,'GOOGLE_CAMPUS_'+method);
      if(inserted.changes)this.dirty();
      const record=this.db.prepare('SELECT at FROM attendance WHERE session_id=? AND student_id=?').get(sid,student.id);
      return {studentId:student.id,name:student.name,date:s.date,at:record.at,duplicate:!inserted.changes};
    });
  }
  importOnline(date,text,evidence,actor,now=Date.now()) {
    try {BP.date(date);}catch(e){fail(400,'DATE_INVALID',e.message);}
    if(date>today(now)||!evidence?.trim())fail(400,'ONLINE_INVALID','Cần ngày đã học và nguồn đối chiếu.');
    const list=BP.roster(this.roster(true).map(s=>[s.id,s.name,s.email]));
    const result=BP.parseOnline(text,list);
    if(result.invalid.length||!result.accepted.length)fail(400,'ONLINE_INVALID','Danh sách trống hoặc có MSSV không khớp: '+result.invalid.map(x=>x.line).join(', '));
    return this.tx(()=>{
      let s=this.db.prepare('SELECT * FROM sessions WHERE date=? AND mode=?').get(date,'ONLINE');
      if(!s){const id=randomUUID();this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run(id,date,'ONLINE',now,now,now,actor);s=this.session(id);}
      let count=0;
      for(const id of result.accepted)count+=Number(this.db.prepare('INSERT OR IGNORE INTO attendance VALUES (?,?,?,?,?,?,?)').run(s.id,id,null,now,'',actor,evidence.trim()).changes);
      this.dirty();this.audit(actor,'ONLINE_IMPORT',{date,count,evidence});return count;
    });
  }
  correction(date,id,mark,reason,actor) {
    try {BP.date(date);}catch(e){fail(400,'DATE_INVALID',e.message);}
    id=BP.id(id);
    if(!this.db.prepare('SELECT id FROM students WHERE id=?').get(id)||!this.db.prepare('SELECT id FROM sessions WHERE date=?').get(date)||
        !['OFF','ON','BOTH','V','EXCUSED'].includes(mark)||!reason?.trim())fail(400,'CORRECTION_INVALID','Kiểm tra ngày, MSSV, kết quả và lý do điều chỉnh.');
    this.tx(()=>{this.db.prepare('INSERT INTO corrections(date,student_id,mark,reason,actor,at) VALUES (?,?,?,?,?,?)').run(date,id,mark,reason.trim(),actor,Date.now());this.dirty();});
  }
  matrix() {
    const students=this.roster();if(!students.length)return [['MSSV','Họ tên','Email trường']];
    const list=BP.roster(students.map(s=>[s.id,s.name,s.email]));
    const logs=this.db.prepare('SELECT s.date,s.mode,a.student_id AS studentId FROM attendance a JOIN sessions s ON a.session_id=s.id').all().map(r=>({...r,result:'ACCEPTED'}));
    const corrections=this.db.prepare('SELECT date,student_id AS studentId,mark,reason FROM corrections ORDER BY id').all();
    return BP.matrix(list,this.sessions().map(s=>({...s,state:'OPEN'})),logs,corrections);
  }
  csv() {return '\uFEFF'+this.matrix().map(row=>row.map(value=>'"'+BP.safeCell(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
  close() {this.db.close();}
}
module.exports={Store};
