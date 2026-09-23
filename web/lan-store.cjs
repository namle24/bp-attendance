const {Store}=require('./store.cjs');
const {fail,hash,today,random,issueQr}=require('./security.cjs');
const {scan,verifyScan}=require('./lan-qr.cjs');
const ipaddr=require('ipaddr.js');
const BP=require('./core.cjs');
const {randomUUID}=require('node:crypto');
const location=require('./location.cjs');
const {filterEntries}=require('./attendance-filters.cjs');

function clean(value,max,label){
  if(typeof value!=='string'||/[\p{Cc}\p{Cf}]/u.test(value))fail(400,'INPUT_INVALID',label+' không hợp lệ.');
  const result=value.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!result||result.length>max)fail(400,'INPUT_INVALID',label+' cần từ 1 đến '+max+' ký tự.');
  return result;
}
function canonicalIP(value){try{return ipaddr.process(value).toString();}catch{fail(400,'IP_INVALID','Không xác định được IP kết nối.');}}
function duplicateReview(row){return row.review!=='REJECTED'&&(row.duplicate_attempts||0)>(row.reviewed_duplicates||0);}
function state(row){
  if(row.review==='REJECTED')return 'REJECTED';
  if(duplicateReview(row))return 'PENDING';
  if(row.location_status&&!['OFF','INSIDE'].includes(row.location_status)&&row.review!=='CONFIRMED')return 'PENDING';
  if(row.peers>1&&(row.review!=='CONFIRMED'||row.reviewed_peers<row.peers))return 'PENDING';
  return row.review==='CONFIRMED'?'CONFIRMED':'RECORDED';
}
const labels={RECORDED:'Đã ghi nhận',PENDING:'Cần TA xác nhận',CONFIRMED:'TA đã xác nhận',REJECTED:'TA không xác nhận'};
function issueReason(row){
  if(duplicateReview(row))return 'Trùng MSSV: có '+row.duplicate_attempts+' lượt gửi thêm từ trình duyệt khác. Sinh viên phải bổ sung email trường và mang thẻ sinh viên xuống bàn TA. Chưa đối chiếu thì tính là thiếu xác nhận.';
  if(row.status==='REJECTED')return row.review_note;
  if(row.status==='PENDING')return [row.peers>1?'Trùng IP giữa '+row.peers+' MSSV trong cùng đợt điểm danh.'+(row.review==='CONFIRMED'?' Có thêm MSSV sau lần đối chiếu trước.':''):'',row.review==='CONFIRMED'?'':row.location_reason||''].filter(Boolean).join(' ');
  return '';
}
function detailTable(entries){
  const time=at=>at?new Date(at+7*3600000).toISOString().replace('T',' ').slice(0,19):'';
  return [['Ngày','MSSV','Họ tên đã nhập','Vị trí ngồi','IP kết nối','Số MSSV cùng IP','Trạng thái','Ghi chú TA','Người xác nhận','Giờ gửi (VN)','Giờ xác nhận (VN)','Đợt','Tên đợt','Mã đợt','Kiểm tra vị trí','Khoảng cách (m)','Sai số thiết bị (m)','Bán kính (m)','Lý do vị trí','Số lượt trùng MSSV','Bằng chứng trùng MSSV','Email bổ sung (tự khai)'],
    ...entries.map(row=>[row.date,row.student_id,row.name,row.seat,row.ip,row.peers,row.statusLabel,row.review_note,row.reviewed_by,time(row.at),time(row.reviewed_at),row.round_number,row.round_label,row.round_id,location.label(row.location_status),row.location_distance??'',row.location_accuracy??'',row.location_radius??'',row.location_reason||'',row.duplicate_attempts||0,(row.duplicate_evidence||[]).map(e=>time(e.at)+' · IP '+e.ip).join('; '),(row.duplicate_emails||[]).map(e=>e.email+' · '+(e.original?'Lượt đầu':'Lượt trùng')+' · '+time(e.at)).join('; ')])];
}
function toCSV(rows){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+BP.safeCell(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
class LanStore extends Store {
  constructor(filename){
    super(filename);
    // Additive migration: historical Google attendance and roster are preserved.
    this.db.exec(`CREATE TABLE IF NOT EXISTS lan_attendance (
      id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
      student_id TEXT NOT NULL, name TEXT NOT NULL, seat TEXT NOT NULL,
      ip TEXT NOT NULL, at INTEGER NOT NULL, request_hash TEXT NOT NULL UNIQUE,
      review TEXT NOT NULL DEFAULT '', reviewed_peers INTEGER NOT NULL DEFAULT 0,
      review_note TEXT NOT NULL DEFAULT '', reviewed_by TEXT NOT NULL DEFAULT '', reviewed_at INTEGER,
      UNIQUE(session_id,student_id));
      CREATE INDEX IF NOT EXISTS lan_session_ip ON lan_attendance(session_id,ip);
      CREATE TABLE IF NOT EXISTS lan_scan_uses (grant_id TEXT PRIMARY KEY,attendance_id INTEGER NOT NULL UNIQUE REFERENCES lan_attendance(id));`);
    if(!this.meta('lanSchema')){this.setMeta('lanSchema','1');this.dirty();}
    if(!this.meta('lanQrSecret'))this.setMeta('lanQrSecret',random());
    try{require('./lan-rounds.cjs').migrateRounds(this,filename);}catch(error){this.close();throw error;}
    this.db.exec(`CREATE TABLE IF NOT EXISTS lan_device_uses (round_id TEXT NOT NULL REFERENCES lan_rounds(id),device TEXT NOT NULL,attendance_id INTEGER NOT NULL UNIQUE REFERENCES lan_attendance(id),PRIMARY KEY(round_id,device));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS lan_duplicate_attempts (id INTEGER PRIMARY KEY,attendance_id INTEGER NOT NULL REFERENCES lan_attendance(id),round_id TEXT NOT NULL REFERENCES lan_rounds(id),device TEXT NOT NULL,ip TEXT NOT NULL,at INTEGER NOT NULL,name TEXT NOT NULL,payload_hash TEXT NOT NULL,request_hash TEXT NOT NULL UNIQUE,grant_id TEXT NOT NULL UNIQUE,UNIQUE(round_id,device));
      CREATE INDEX IF NOT EXISTS lan_duplicate_attendance ON lan_duplicate_attempts(attendance_id);
      CREATE TABLE IF NOT EXISTS lan_duplicate_contacts (attendance_id INTEGER NOT NULL REFERENCES lan_attendance(id),device TEXT NOT NULL,email TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(attendance_id,device));
      CREATE TABLE IF NOT EXISTS lan_duplicate_reviews (attendance_id INTEGER PRIMARY KEY REFERENCES lan_attendance(id),reviewed_count INTEGER NOT NULL);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS lan_round_locations (round_id TEXT PRIMARY KEY REFERENCES lan_rounds(id),policy TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lan_attendance_locations (attendance_id INTEGER PRIMARY KEY REFERENCES lan_attendance(id),status TEXT NOT NULL,distance REAL,accuracy REAL,radius REAL,reason TEXT NOT NULL);`);
  }
  roundLocation(id){const row=this.db.prepare('SELECT policy FROM lan_round_locations WHERE round_id=?').get(id);return row?JSON.parse(row.policy):{enabled:false};}
  validateWindow(date,minutes,now){
    try{BP.date(date);}catch(e){fail(400,'DATE_INVALID',e.message);}
    if(date!==today(now))fail(400,'DATE_NOT_TODAY','Chỉ mở đợt cho ngày hôm nay, theo giờ Việt Nam.');
    if(!Number.isInteger(minutes)||minutes<2||minutes>30)fail(400,'DURATION_INVALID','Thời gian mở từ 2 đến 30 phút.');
  }
  open(date,minutes,actor,now=Date.now(),label=''){
    this.validateWindow(date,minutes,now);label=label===''?'':clean(label,60,'Tên đợt');
    return this.tx(()=>{
      if(this.activeSession(now))fail(409,'ROUND_ACTIVE','Đóng đợt đang nhận điểm danh trước khi mở đợt khác.');
      const position={enabled:false}; // Location collection is retired; retain historical evidence only.
      let lesson=this.db.prepare("SELECT * FROM sessions WHERE date=? AND mode='OFFLINE'").get(date);
      if(!lesson){const id=randomUUID();this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run(id,date,'OFFLINE',now,now+minutes*60000,null,actor);lesson=super.session(id);}
      const number=this.db.prepare('SELECT COALESCE(MAX(number),0)+1 AS n FROM lan_rounds WHERE session_id=?').get(lesson.id).n;
      const id=number===1?lesson.id:randomUUID();
      this.db.prepare('INSERT INTO lan_rounds VALUES (?,?,?,?,?,?,?,?,?)').run(id,lesson.id,number,label,now,now+minutes*60000,null,actor,1);
      this.db.prepare('INSERT INTO lan_round_locations VALUES (?,?)').run(id,JSON.stringify(position));
      this.dirty();this.audit(actor,'ROUND_OPEN',{id,lessonId:lesson.id,date,number,label,minutes});return this.session(id);
    });
  }
  reopen(id,minutes,actor,now=Date.now()){
    return this.tx(()=>{
      const round=this.session(id);if(!round||round.mode!=='OFFLINE'||!round.number)fail(404,'SESSION_UNKNOWN','Không có đợt điểm danh này.');
      this.validateWindow(round.date,minutes,now);
      if(this.activeSession(now))fail(409,'ROUND_ACTIVE','Đóng đợt đang nhận điểm danh trước khi mở lại đợt khác.');
      this.db.prepare('UPDATE lan_rounds SET opened_at=?,ends_at=?,closed_at=NULL,actor=?,generation=generation+1 WHERE id=?').run(now,now+minutes*60000,actor,id);
      this.dirty();this.audit(actor,'ROUND_REOPEN',{id,date:round.date,number:round.number,minutes,previousOpenedAt:round.opened_at,previousEndsAt:round.ends_at,previousClosedAt:round.closed_at,generation:round.generation+1});return this.session(id);
    });
  }
  roundQuery(){return "SELECT r.*,r.session_id AS lesson_id,s.date,s.mode FROM lan_rounds r JOIN sessions s ON s.id=r.session_id";}
  session(id){return this.db.prepare(this.roundQuery()+' WHERE r.id=?').get(id)||super.session(id);}
  activeSession(now=Date.now()){return this.db.prepare(this.roundQuery()+" WHERE s.date=? AND r.closed_at IS NULL AND r.opened_at<=? AND r.ends_at>? ORDER BY r.opened_at DESC LIMIT 1").get(today(now),now,now);}
  closeSession(id,actor,now=Date.now()){
    return this.tx(()=>{
      const round=this.session(id);if(!round||round.mode!=='OFFLINE'||!round.number)fail(404,'SESSION_UNKNOWN','Không có đợt điểm danh này.');
      if(round.closed_at===null){this.db.prepare('UPDATE lan_rounds SET closed_at=? WHERE id=?').run(Math.min(now,round.ends_at),id);this.dirty();this.audit(actor,'ROUND_CLOSE',{id,date:round.date,number:round.number});}
      return this.session(id);
    });
  }
  currentQr(now=Date.now()){
    const session=this.activeSession(now);
    return session?issueQr(session,this.meta('lanQrSecret'),now):null;
  }
  scan(input,address,now=Date.now(),device=''){
    const session=this.activeSession(now),result=scan(input,session,this.meta('lanQrSecret'),address,now,device);
    return {...result,session:{id:session.id,date:session.date,endsAt:session.ends_at,number:session.number,label:session.label,generation:session.generation,location:{enabled:false}}};
  }
  duplicateCounts(id){
    return this.db.prepare('SELECT COUNT(*) AS duplicate_attempts,COALESCE((SELECT reviewed_count FROM lan_duplicate_reviews WHERE attendance_id=?),0) AS reviewed_duplicates FROM lan_duplicate_attempts WHERE attendance_id=?').get(id,id);
  }
  recentDeviceReceipt(device,date){
    if(!device)return null;
    const row=this.db.prepare(`SELECT r.id FROM lan_rounds r JOIN sessions s ON s.id=r.session_id
      WHERE s.date=? AND (EXISTS(SELECT 1 FROM lan_device_uses d WHERE d.round_id=r.id AND d.device=?) OR EXISTS(SELECT 1 FROM lan_duplicate_attempts d WHERE d.round_id=r.id AND d.device=?)) ORDER BY r.number DESC LIMIT 1`).get(date,device,device);
    return row?this.deviceReceipt(row.id,device):null;
  }
  deviceRecord(sid,device){
    if(!device||typeof sid!=='string'||sid.length>64)return null;
    return this.db.prepare(`SELECT a.*,0 AS duplicate_attempt FROM lan_device_uses d JOIN lan_attendance a ON a.id=d.attendance_id WHERE d.round_id=? AND d.device=?
      UNION ALL SELECT a.*,1 AS duplicate_attempt FROM lan_duplicate_attempts d JOIN lan_attendance a ON a.id=d.attendance_id WHERE d.round_id=? AND d.device=?`).get(sid,device,sid,device);
  }
  deviceReceipt(sid,device){
    const row=this.deviceRecord(sid,device);if(!row)return null;
    const result=this.receipt(row,true);
    if(row.duplicate_attempt){
      const attempt=this.db.prepare('SELECT name,at FROM lan_duplicate_attempts WHERE round_id=? AND device=?').get(sid,device);
      // Never disclose the first browser's submitted name or timestamp to another browser.
      result.name=attempt.name;result.at=attempt.at;result.duplicateAttempt=true;
      delete result.seat;delete result.location;
    }
    result.schoolEmail=this.db.prepare('SELECT email FROM lan_duplicate_contacts WHERE attendance_id=? AND device=?').get(row.id,device)?.email||'';
    return result;
  }
  supplementEmail(sid,device,email,now=Date.now()){
    if(typeof sid!=='string'||sid.length>64)fail(400,'ROUND_INVALID','Đợt không hợp lệ.');
    email=clean(email,254,'Email trường').toLowerCase();
    // This is a self-declared contact, not proof of email ownership or identity.
    if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*usth\.edu\.vn$/.test(email))fail(400,'EMAIL_INVALID','Nhập đầy đủ email do USTH cấp, có đuôi @usth.edu.vn hoặc tên miền con của trường.');
    return this.tx(()=>{
      const row=this.deviceRecord(sid,device);
      if(!row)fail(403,'RECEIPT_REQUIRED','Mở lại bằng trình duyệt đã gửi điểm danh.');
      const saved=this.db.prepare('SELECT email FROM lan_duplicate_contacts WHERE attendance_id=? AND device=?').get(row.id,device);
      if(saved){if(saved.email!==email)fail(409,'EMAIL_SAVED','Email đã được lưu. Nhờ TA đối chiếu nếu nhập nhầm.');return this.deviceReceipt(sid,device);}
      if(!duplicateReview({...row,...this.duplicateCounts(row.id)}))fail(409,'REVIEW_CLOSED','Trường hợp này không còn chờ đối chiếu trùng MSSV.');
      this.db.prepare('INSERT INTO lan_duplicate_contacts VALUES (?,?,?,?)').run(row.id,device,email,now);
      this.audit('Sinh viên','DUPLICATE_EMAIL',{id:row.id,roundId:sid,duplicate:!!row.duplicate_attempt});this.dirty();
      return this.deviceReceipt(sid,device);
    });
  }
  checkIn(body,address,now=Date.now(),device=''){
    return this.submit(body,address,now,session=>verifyScan(body.scanTicket,this.meta('lanQrSecret'),address,session.id,now,session.generation,device),device);
  }
  sessions(){
    const rounds=this.db.prepare(this.roundQuery()+' ORDER BY s.date DESC,r.number DESC').all().map(r=>({...r,count:this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE round_id=?').get(r.id).n+(r.number===1?this.db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE session_id=?').get(r.lesson_id).n:0)}));
    return [...rounds,...super.sessions().filter(s=>s.mode==='ONLINE')];
  }
  entries(sid,date){
    const where=[],params=[];
    if(sid){where.push('a.round_id=?');params.push(sid);}
    if(date){where.push('s.date=?');params.push(date);}
    const rows=this.db.prepare(`WITH peers AS (SELECT round_id,ip,COUNT(*) AS peers FROM lan_attendance GROUP BY round_id,ip),duplicates AS (SELECT attendance_id,COUNT(*) AS n FROM lan_duplicate_attempts GROUP BY attendance_id)
      SELECT a.*,s.date,r.number AS round_number,r.label AS round_label,p.peers,COALESCE(d.n,0) AS duplicate_attempts,COALESCE(v.reviewed_count,0) AS reviewed_duplicates,l.status AS location_status,l.distance AS location_distance,l.accuracy AS location_accuracy,l.radius AS location_radius,l.reason AS location_reason FROM lan_attendance a JOIN sessions s ON s.id=a.session_id
      JOIN lan_rounds r ON r.id=a.round_id JOIN peers p ON p.round_id=a.round_id AND p.ip=a.ip LEFT JOIN lan_attendance_locations l ON l.attendance_id=a.id LEFT JOIN duplicates d ON d.attendance_id=a.id LEFT JOIN lan_duplicate_reviews v ON v.attendance_id=a.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.id`).all(...params);
    return rows.map(({request_hash,...r})=>{const entry={...r,status:state(r),statusLabel:duplicateReview(r)?'Thiếu đối chiếu — trùng MSSV':labels[state(r)],duplicateReview:duplicateReview(r),duplicate_evidence:r.duplicate_attempts?this.db.prepare('SELECT ip,at,name FROM lan_duplicate_attempts WHERE attendance_id=? ORDER BY id').all(r.id):[],duplicate_emails:r.duplicate_attempts?this.db.prepare('SELECT c.email,c.at,CASE WHEN d.device IS NOT NULL THEN 1 ELSE 0 END AS original FROM lan_duplicate_contacts c LEFT JOIN lan_device_uses d ON d.attendance_id=c.attendance_id AND d.device=c.device WHERE c.attendance_id=? ORDER BY c.at').all(r.id):[],location_label:location.label(r.location_status)};return {...entry,reason:issueReason(entry)};});
  }
  reportDate(value){
    if(value===undefined||value==='')return '';
    if(typeof value!=='string')fail(400,'DATE_INVALID','Chọn một ngày học hoặc tất cả các ngày.');
    let date;try{date=BP.date(value);}catch(error){fail(400,'DATE_INVALID',error.message);}
    if(!this.db.prepare('SELECT 1 FROM sessions WHERE date=?').get(date))fail(404,'DATE_UNKNOWN','Chưa có buổi học trong ngày này.');
    return date;
  }
  history(date,filters={}){return filterEntries(this.entries(undefined,this.reportDate(date)),filters);}
  issues(date,status='ALL',filters={}){
    if(!['ALL','PENDING','REJECTED'].includes(status))fail(400,'STATUS_INVALID','Chọn chờ đối chiếu, không hợp lệ hoặc cả hai trạng thái.');
    const rows=this.history(date,{...filters,status:'ALL'}).filter(row=>['PENDING','REJECTED'].includes(row.status));
    return {counts:{pending:rows.filter(r=>r.status==='PENDING').length,rejected:rows.filter(r=>r.status==='REJECTED').length},
      entries:rows.filter(row=>status==='ALL'||row.status===status).map(row=>({...row,reason:issueReason(row)}))};
  }
  report(kind,date,status='ALL',filters={}){
    date=this.reportDate(date);let rows;
    if(kind==='summary'){
      rows=this.matrix();
      if(date){
        const col=rows[0].indexOf(date);
        // A daily report contains only results belonging to that date. Students
        // recorded only on other days must not leak into this day's export.
        rows=[rows[0],...rows.slice(1).filter(row=>row[col]!=='')].map(row=>[...row.slice(0,3),row[col]]);
      }
    }else if(kind==='detail')rows=detailTable(this.history(date,filters));
    else if(kind==='issues'){
      const entries=this.issues(date,status,filters).entries;rows=detailTable(entries);
      rows[0].push('Lý do cần xử lý');entries.forEach((row,i)=>rows[i+1].push(row.reason));
    }else fail(400,'REPORT_INVALID','Loại báo cáo không hợp lệ.');
    const prefix={summary:'BP_Attendance',detail:'BP_Offline_Check',issues:'BP_Review'}[kind];
    return {csv:toCSV(rows),filename:prefix+'_'+(date||'all')+(kind==='issues'?'_'+status.toLowerCase():'')+'.csv'};
  }
  receipt(row,duplicate){
    const peers=this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE round_id=? AND ip=?').get(row.round_id,row.ip).n;
    const round=this.session(row.round_id);
    const position=this.db.prepare('SELECT status,distance,accuracy,radius,reason FROM lan_attendance_locations WHERE attendance_id=?').get(row.id),duplicates=this.duplicateCounts(row.id);
    return {studentId:row.student_id,name:row.name,seat:row.seat,date:round.date,sessionId:round.id,roundNumber:round.number,roundLabel:round.label,at:row.at,duplicate,duplicateCount:duplicates.duplicate_attempts,schoolEmail:this.db.prepare('SELECT c.email FROM lan_duplicate_contacts c JOIN lan_device_uses d ON d.attendance_id=c.attendance_id AND d.device=c.device WHERE c.attendance_id=?').get(row.id)?.email||'',duplicateReview:duplicateReview({...row,...duplicates}),status:state({...row,...duplicates,peers,location_status:position?.status}),...(position?{location:position}:{})};
  }
  // Trusted local imports/tests may call submit directly. Public HTTP must use
  // checkIn, which verifies a current scan inside the same write transaction.
  submit(body,address,now=Date.now(),authorize,device=''){
    const sid=clean(body.sessionId,64,'Phiên'),studentId=clean(body.studentId,40,'MSSV').toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(studentId))fail(400,'ID_INVALID','MSSV chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    const name=clean(body.name,120,'Họ tên'),seat=body.seat===undefined||body.seat===''?'':clean(body.seat,32,'Vị trí ngồi cũ');
    if(typeof body.requestId!=='string'||!/^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(body.requestId))fail(400,'REQUEST_INVALID','Tải lại trang và gửi lại điểm danh.');
    const requestHash=hash(body.requestId),ip=canonicalIP(address),payloadHash=hash(JSON.stringify([sid,studentId,name,seat]));
    const result=this.tx(()=>{
      const retried=this.db.prepare('SELECT * FROM lan_duplicate_attempts WHERE request_hash=?').get(requestHash);
      if(retried){
        if(retried.payload_hash!==payloadHash)fail(409,'REQUEST_CHANGED','Lượt gửi trùng đã được lưu. Liên hệ TA nếu cần sửa.');
        if(retried.device!==device)fail(403,'DEVICE_CHANGED','Giữ nguyên trình duyệt đã gửi.');
        return {duplicateViolation:true,receipt:this.deviceReceipt(sid,device)};
      }
      if(device){
        const used=this.db.prepare('SELECT a.request_hash FROM lan_device_uses d JOIN lan_attendance a ON a.id=d.attendance_id WHERE d.round_id=? AND d.device=? UNION ALL SELECT request_hash FROM lan_duplicate_attempts WHERE round_id=? AND device=?').get(sid,device,sid,device);
        if(used&&used.request_hash!==requestHash)fail(409,'DEVICE_RECORDED','Trình duyệt này đã điểm danh trong đợt này. Không thể đổi MSSV để gửi thêm. Liên hệ TA nếu nhập nhầm.');
      }
      const previous=this.db.prepare('SELECT * FROM lan_attendance WHERE request_hash=?').get(requestHash);
      if(previous){
        if(previous.round_id!==sid||previous.student_id!==studentId||previous.name!==name||previous.seat!==seat)fail(409,'REQUEST_CHANGED','Lượt gửi trước đã ghi nhận. Liên hệ TA nếu cần sửa thông tin.');
        const owner=this.db.prepare('SELECT device FROM lan_device_uses WHERE attendance_id=?').get(previous.id);
        if(owner&&owner.device!==device)fail(403,'DEVICE_CHANGED','Mở lại bằng trình duyệt đã gửi để kiểm tra biên nhận.');
        return this.receipt(previous,true);
      }
      const session=this.session(sid);
      if(!session||session.mode!=='OFFLINE'||session.date!==today(now)||session.closed_at||now<session.opened_at||now>=session.ends_at)fail(409,'SESSION_CLOSED','Chưa mở điểm danh hoặc phiên đã hết giờ. Liên hệ TA.');
      const grant=authorize?.(session);
      if(grant&&this.db.prepare('SELECT 1 FROM lan_scan_uses WHERE grant_id=? UNION ALL SELECT 1 FROM lan_duplicate_attempts WHERE grant_id=?').get(grant,grant))fail(409,'SCAN_USED','Lượt quét này đã dùng cho một MSSV. Nhờ TA kiểm tra.');
      const existing=this.db.prepare('SELECT a.*,d.device FROM lan_attendance a LEFT JOIN lan_device_uses d ON d.attendance_id=a.id WHERE a.round_id=? AND a.student_id=?').get(sid,studentId);
      if(existing&&device&&grant&&existing.device&&existing.device!==device){
        this.db.prepare('INSERT INTO lan_duplicate_attempts(attendance_id,round_id,device,ip,at,name,payload_hash,request_hash,grant_id) VALUES (?,?,?,?,?,?,?,?,?)').run(existing.id,sid,device,ip,now,name,payloadHash,requestHash,grant);
        this.audit('Hệ thống','DUPLICATE_STUDENT_REVIEW',{id:existing.id,studentId,roundId:sid,firstIP:existing.ip,duplicateIP:ip,at:now});this.dirty();
        // Commit the evidence before returning an HTTP error: throwing here rolls it back.
        return {duplicateViolation:true,receipt:this.deviceReceipt(sid,device)};
      }
      if(existing||(session.number===1&&this.db.prepare('SELECT 1 FROM attendance WHERE session_id=? AND student_id=?').get(session.lesson_id,studentId)))fail(409,'ALREADY_RECORDED','MSSV này đã được ghi nhận trong đợt này. Nhờ TA kiểm tra nếu bạn chưa gửi.');
      this.db.prepare('INSERT INTO lan_attendance(session_id,round_id,student_id,name,seat,ip,at,request_hash) VALUES (?,?,?,?,?,?,?,?)').run(session.lesson_id,sid,studentId,name,seat,ip,now,requestHash);
      if(device)this.db.prepare('INSERT INTO lan_device_uses(round_id,device,attendance_id) SELECT round_id,?,id FROM lan_attendance WHERE request_hash=?').run(device,requestHash);
      if(grant)this.db.prepare('INSERT INTO lan_scan_uses(grant_id,attendance_id) SELECT ?,id FROM lan_attendance WHERE request_hash=?').run(grant,requestHash);
      this.dirty();
      return this.receipt(this.db.prepare('SELECT * FROM lan_attendance WHERE request_hash=?').get(requestHash),false);
    });
    if(result.duplicateViolation){
      const error=new Error('MSSV đã có lượt gửi từ trình duyệt khác. Bổ sung email trường và mang thẻ sinh viên xuống bàn TA; chưa đối chiếu thì tính là thiếu xác nhận.');
      error.status=409;error.code='DUPLICATE_REVIEW';error.receipt=result.receipt;throw error;
    }
    return result;
  }
  reviewEntry(id,review,note,expectedPeers,actor,now=Date.now(),expectedDuplicates,cardChecked=false){
    if(!['CONFIRMED','REJECTED'].includes(review))fail(400,'REVIEW_INVALID','Chọn xác nhận hoặc không xác nhận.');
    note=clean(note,500,'Ghi chú đối chiếu');
    return this.tx(()=>{
      const row=this.db.prepare('SELECT * FROM lan_attendance WHERE id=?').get(id);
      if(!row)fail(404,'ENTRY_UNKNOWN','Không có bản ghi này.');
      const peers=this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE round_id=? AND ip=?').get(row.round_id,row.ip).n;
      const duplicates=this.duplicateCounts(id).duplicate_attempts;
      if(duplicates>0&&expectedDuplicates!==duplicates)fail(409,'GROUP_CHANGED','Có lượt trùng MSSV cần đối chiếu. Tải lại danh sách trước khi xác nhận.');
      if(duplicates>0&&review==='CONFIRMED'){
        if(!this.db.prepare('SELECT 1 FROM lan_duplicate_contacts WHERE attendance_id=?').get(id))fail(409,'EMAIL_REQUIRED','Yêu cầu sinh viên bổ sung email trường trên trang điểm danh trước khi xác nhận.');
        if(cardChecked!==true)fail(400,'CARD_REQUIRED','Xác nhận đã đối chiếu thẻ sinh viên và email trường tại bàn TA.');
      }
      if(expectedPeers!==peers)fail(409,'GROUP_CHANGED','Nhóm IP vừa có thêm sinh viên. Tải lại danh sách rồi đối chiếu lại.');
      this.db.prepare('UPDATE lan_attendance SET review=?,reviewed_peers=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(review,peers,note,actor,now,id);
      this.db.prepare('INSERT INTO lan_duplicate_reviews VALUES (?,?) ON CONFLICT(attendance_id) DO UPDATE SET reviewed_count=excluded.reviewed_count').run(id,duplicates);
      this.audit(actor,'LAN_REVIEW',{duplicates,cardChecked:duplicates>0&&cardChecked===true,id,studentId:row.student_id,sessionId:row.round_id,lessonId:row.session_id,ip:row.ip,review,note,peers});this.dirty();
    });
  }
  snapshot(){
    const old=super.matrix(),entries=this.entries(),sessions=this.sessions(),dates=[...new Set(sessions.map(s=>s.date))].sort();
    const students=new Map(old.slice(1).map(r=>[r[0],{id:r[0],name:r[1],email:r[2],days:new Map(old[0].slice(3).map((d,i)=>[d,r[i+3]]))}]));
    const groups=new Map(),roundsByDate=new Map();
    for(const s of sessions)if(s.mode==='OFFLINE'){if(!roundsByDate.has(s.date))roundsByDate.set(s.date,[]);roundsByDate.get(s.date).push(s);}
    for(const row of entries){
      if(!students.has(row.student_id))students.set(row.student_id,{id:row.student_id,name:row.name,email:'',days:new Map()});
      const key=row.student_id+'\n'+row.date;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
    }
    for(const student of students.values())for(const [date,rounds] of roundsByDate){
      const rows=groups.get(student.id+'\n'+date)||[],prior=student.days.get(date),online=prior==='ON'||prior==='BOTH';
      const legacy=prior==='OFF'||prior==='BOTH',sent=new Set(rows.map(r=>r.round_id));
      if(legacy)sent.add(rounds.find(r=>r.number===1).id);
      if(!sent.size)continue;
      const duplicatePending=rows.filter(duplicateReview).length,pending=rows.filter(r=>r.status==='PENDING'&&!duplicateReview(r)).length,rejected=rows.filter(r=>r.status==='REJECTED').length;
      if(rounds.length>1){
        // Report observations, not an automatic whole-day presence/absence rule.
        student.days.set(date,[online?'ON':'',`Đã gửi ${sent.size}/${rounds.length} đợt`,pending?`${pending} cần xác nhận`:'',duplicatePending?`${duplicatePending} thiếu đối chiếu MSSV`:'',rejected?`${rejected} không xác nhận`:''].filter(Boolean).join(' · '));
      }else if(rows.length){
        student.days.set(date,duplicatePending?(online?'ON · OFF thiếu đối chiếu (trùng MSSV)':'OFF thiếu đối chiếu (trùng MSSV)'):pending?(online?'ON · OFF cần xác nhận':'OFF cần xác nhận'):rejected===rows.length&&!legacy?(online?'ON':'OFF không được xác nhận'):(online?'BOTH':'OFF'));
      }
    }
    // Explicit attendance corrections still take precedence; review flags remain visible.
    for(const row of this.db.prepare('SELECT * FROM corrections ORDER BY id').all())students.get(row.student_id)?.days.set(row.date,row.mark);
    const ordered=[...students.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
    const values=[['MSSV','Họ tên','Email trường',...dates],...ordered.map(s=>[s.id,s.name,s.email,...dates.map(d=>s.days.get(d)||'')])];
    const positions=new Map(ordered.map((s,i)=>[s.id,i+1]));
    const detail=detailTable(entries);
    const red=[],detailRed=[];
    const redCells=new Set();entries.forEach((row,i)=>{if(row.status==='PENDING'){
      const cell={row:positions.get(row.student_id),col:3+dates.indexOf(row.date)},key=cell.row+':'+cell.col;
      if(!redCells.has(key)){red.push(cell);redCells.add(key);}detailRed.push(i+1);
    }});
    return {values,detail,red,detailRed};
  }
  matrix(){return this.snapshot().values;}
  csv(date){return this.report('summary',date).csv;}
  detailCSV(date){return this.report('detail',date).csv;}
}
module.exports={LanStore,canonicalIP,state};
