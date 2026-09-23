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
function state(row){
  if(row.review==='REJECTED')return 'REJECTED';
  if(row.location_status&&!['OFF','INSIDE'].includes(row.location_status)&&row.review!=='CONFIRMED')return 'PENDING';
  if(row.peers>1&&(row.review!=='CONFIRMED'||row.reviewed_peers<row.peers))return 'PENDING';
  return row.review==='CONFIRMED'?'CONFIRMED':'RECORDED';
}
const labels={RECORDED:'Đã ghi nhận',PENDING:'Cần TA xác nhận',CONFIRMED:'TA đã xác nhận',REJECTED:'TA không xác nhận'};
function issueReason(row){
  if(row.status==='REJECTED')return row.review_note;
  if(row.status==='PENDING')return [row.peers>1?'Trùng IP giữa '+row.peers+' MSSV trong cùng đợt điểm danh.'+(row.review==='CONFIRMED'?' Có thêm MSSV sau lần đối chiếu trước.':''):'',row.review==='CONFIRMED'?'':row.location_reason||''].filter(Boolean).join(' ');
  return '';
}
function detailTable(entries){
  const time=at=>at?new Date(at+7*3600000).toISOString().replace('T',' ').slice(0,19):'';
  return [['Ngày','MSSV','Họ tên đã nhập','Vị trí ngồi','IP kết nối','Số MSSV cùng IP','Trạng thái','Ghi chú TA','Người xác nhận','Giờ gửi (VN)','Giờ xác nhận (VN)','Đợt','Tên đợt','Mã đợt','Kiểm tra vị trí','Khoảng cách (m)','Sai số thiết bị (m)','Bán kính (m)','Lý do vị trí'],
    ...entries.map(row=>[row.date,row.student_id,row.name,row.seat,row.ip,row.peers,row.statusLabel,row.review_note,row.reviewed_by,time(row.at),time(row.reviewed_at),row.round_number,row.round_label,row.round_id,location.label(row.location_status),row.location_distance??'',row.location_accuracy??'',row.location_radius??'',row.location_reason||''])];
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
  deviceReceipt(sid,device){
    if(!device)return null;
    const row=this.db.prepare('SELECT a.* FROM lan_device_uses d JOIN lan_attendance a ON a.id=d.attendance_id WHERE d.round_id=? AND d.device=?').get(sid,device);
    return row?this.receipt(row,true):null;
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
    const rows=this.db.prepare(`WITH peers AS (SELECT round_id,ip,COUNT(*) AS peers FROM lan_attendance GROUP BY round_id,ip)
      SELECT a.*,s.date,r.number AS round_number,r.label AS round_label,p.peers,l.status AS location_status,l.distance AS location_distance,l.accuracy AS location_accuracy,l.radius AS location_radius,l.reason AS location_reason FROM lan_attendance a JOIN sessions s ON s.id=a.session_id
      JOIN lan_rounds r ON r.id=a.round_id JOIN peers p ON p.round_id=a.round_id AND p.ip=a.ip LEFT JOIN lan_attendance_locations l ON l.attendance_id=a.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.id`).all(...params);
    return rows.map(({request_hash,...r})=>{const entry={...r,status:state(r),statusLabel:labels[state(r)],location_label:location.label(r.location_status)};return {...entry,reason:issueReason(entry)};});
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
    const position=this.db.prepare('SELECT status,distance,accuracy,radius,reason FROM lan_attendance_locations WHERE attendance_id=?').get(row.id);
    return {studentId:row.student_id,name:row.name,seat:row.seat,date:round.date,sessionId:round.id,roundNumber:round.number,roundLabel:round.label,at:row.at,duplicate,status:state({...row,peers,location_status:position?.status}),...(position?{location:position}:{})};
  }
  // Trusted local imports/tests may call submit directly. Public HTTP must use
  // checkIn, which verifies a current scan inside the same write transaction.
  submit(body,address,now=Date.now(),authorize,device=''){
    const sid=clean(body.sessionId,64,'Phiên'),studentId=clean(body.studentId,40,'MSSV').toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(studentId))fail(400,'ID_INVALID','MSSV chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    const name=clean(body.name,120,'Họ tên'),seat=body.seat===undefined||body.seat===''?'':clean(body.seat,32,'Vị trí ngồi cũ');
    if(typeof body.requestId!=='string'||!/^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(body.requestId))fail(400,'REQUEST_INVALID','Tải lại trang và gửi lại điểm danh.');
    const requestHash=hash(body.requestId),ip=canonicalIP(address);
    return this.tx(()=>{
      if(device){
        const used=this.db.prepare('SELECT a.request_hash FROM lan_device_uses d JOIN lan_attendance a ON a.id=d.attendance_id WHERE d.round_id=? AND d.device=?').get(sid,device);
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
      if(grant&&this.db.prepare('SELECT 1 FROM lan_scan_uses WHERE grant_id=?').get(grant))fail(409,'SCAN_USED','Lượt quét này đã dùng cho một MSSV. Nhờ TA kiểm tra.');
      if(this.db.prepare('SELECT 1 FROM lan_attendance WHERE round_id=? AND student_id=?').get(sid,studentId)||(session.number===1&&this.db.prepare('SELECT 1 FROM attendance WHERE session_id=? AND student_id=?').get(session.lesson_id,studentId)))fail(409,'ALREADY_RECORDED','MSSV này đã được ghi nhận trong đợt này. Nhờ TA kiểm tra nếu bạn chưa gửi.');
      this.db.prepare('INSERT INTO lan_attendance(session_id,round_id,student_id,name,seat,ip,at,request_hash) VALUES (?,?,?,?,?,?,?,?)').run(session.lesson_id,sid,studentId,name,seat,ip,now,requestHash);
      if(device)this.db.prepare('INSERT INTO lan_device_uses(round_id,device,attendance_id) SELECT round_id,?,id FROM lan_attendance WHERE request_hash=?').run(device,requestHash);
      if(grant)this.db.prepare('INSERT INTO lan_scan_uses(grant_id,attendance_id) SELECT ?,id FROM lan_attendance WHERE request_hash=?').run(grant,requestHash);
      this.dirty();
      return this.receipt(this.db.prepare('SELECT * FROM lan_attendance WHERE request_hash=?').get(requestHash),false);
    });
  }
  reviewEntry(id,review,note,expectedPeers,actor,now=Date.now()){
    if(!['CONFIRMED','REJECTED'].includes(review))fail(400,'REVIEW_INVALID','Chọn xác nhận hoặc không xác nhận.');
    note=clean(note,500,'Ghi chú đối chiếu');
    return this.tx(()=>{
      const row=this.db.prepare('SELECT * FROM lan_attendance WHERE id=?').get(id);
      if(!row)fail(404,'ENTRY_UNKNOWN','Không có bản ghi này.');
      const peers=this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE round_id=? AND ip=?').get(row.round_id,row.ip).n;
      if(expectedPeers!==peers)fail(409,'GROUP_CHANGED','Nhóm IP vừa có thêm sinh viên. Tải lại danh sách rồi đối chiếu lại.');
      this.db.prepare('UPDATE lan_attendance SET review=?,reviewed_peers=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(review,peers,note,actor,now,id);
      this.audit(actor,'LAN_REVIEW',{id,studentId:row.student_id,sessionId:row.round_id,lessonId:row.session_id,ip:row.ip,review,note,peers});this.dirty();
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
      const pending=rows.filter(r=>r.status==='PENDING').length,rejected=rows.filter(r=>r.status==='REJECTED').length;
      if(rounds.length>1){
        // Report observations, not an automatic whole-day presence/absence rule.
        student.days.set(date,[online?'ON':'',`Đã gửi ${sent.size}/${rounds.length} đợt`,pending?`${pending} cần xác nhận`:'',rejected?`${rejected} không xác nhận`:''].filter(Boolean).join(' · '));
      }else if(rows.length){
        student.days.set(date,pending?(online?'ON · OFF cần xác nhận':'OFF cần xác nhận'):rejected===rows.length&&!legacy?(online?'ON':'OFF không được xác nhận'):(online?'BOTH':'OFF'));
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
