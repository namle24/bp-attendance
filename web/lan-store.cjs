const {Store}=require('./store.cjs');
const {fail,hash,today,random,issueQr}=require('./security.cjs');
const {scan,verifyScan}=require('./lan-qr.cjs');
const ipaddr=require('ipaddr.js');
const BP=require('./core.cjs');

function clean(value,max,label){
  if(typeof value!=='string'||/[\p{Cc}\p{Cf}]/u.test(value))fail(400,'INPUT_INVALID',label+' không hợp lệ.');
  const result=value.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!result||result.length>max)fail(400,'INPUT_INVALID',label+' cần từ 1 đến '+max+' ký tự.');
  return result;
}
function canonicalIP(value){try{return ipaddr.process(value).toString();}catch{fail(400,'IP_INVALID','Không xác định được IP kết nối.');}}
function state(row){
  if(row.review==='REJECTED')return 'REJECTED';
  if(row.peers>1&&(row.review!=='CONFIRMED'||row.reviewed_peers<row.peers))return 'PENDING';
  return row.review==='CONFIRMED'?'CONFIRMED':'RECORDED';
}
const labels={RECORDED:'Đã ghi nhận',PENDING:'Cần TA xác nhận',CONFIRMED:'TA đã xác nhận',REJECTED:'TA không xác nhận'};
function issueReason(row){
  if(row.status==='REJECTED')return row.review_note;
  if(row.status==='PENDING')return 'Trùng IP giữa '+row.peers+' MSSV trong buổi học.'+(row.review==='CONFIRMED'?' Có thêm MSSV sau lần đối chiếu trước.':'');
  return '';
}
function detailTable(entries){
  const time=at=>at?new Date(at+7*3600000).toISOString().replace('T',' ').slice(0,19):'';
  return [['Ngày','MSSV','Họ tên đã nhập','Vị trí ngồi','IP kết nối','Số MSSV cùng IP','Trạng thái','Ghi chú TA','Người xác nhận','Giờ gửi (VN)','Giờ xác nhận (VN)'],
    ...entries.map(row=>[row.date,row.student_id,row.name,row.seat,row.ip,row.peers,row.statusLabel,row.review_note,row.reviewed_by,time(row.at),time(row.reviewed_at)])];
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
  }
  open(date,minutes,actor,now=Date.now()){return super.open(date,minutes,actor,now,false);}
  currentQr(now=Date.now()){
    const session=this.activeSession(now);
    return session?issueQr(session,this.meta('lanQrSecret'),now):null;
  }
  scan(input,address,now=Date.now()){return scan(input,this.activeSession(now),this.meta('lanQrSecret'),address,now);}
  checkIn(body,address,now=Date.now()){
    return this.submit(body,address,now,()=>verifyScan(body.scanTicket,this.meta('lanQrSecret'),address,body.sessionId,now));
  }
  sessions(){return super.sessions().map(s=>({...s,count:s.count+this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE session_id=?').get(s.id).n}));}
  entries(sid,date){
    const where=[],params=[];
    if(sid){where.push('a.session_id=?');params.push(sid);}
    if(date){where.push('s.date=?');params.push(date);}
    const rows=this.db.prepare(`WITH peers AS (SELECT session_id,ip,COUNT(*) AS peers FROM lan_attendance GROUP BY session_id,ip)
      SELECT a.*,s.date,p.peers FROM lan_attendance a JOIN sessions s ON s.id=a.session_id
      JOIN peers p ON p.session_id=a.session_id AND p.ip=a.ip ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.id`).all(...params);
    return rows.map(({request_hash,...r})=>({...r,status:state(r),statusLabel:labels[state(r)]}));
  }
  reportDate(value){
    if(value===undefined||value==='')return '';
    if(typeof value!=='string')fail(400,'DATE_INVALID','Chọn một ngày học hoặc tất cả các ngày.');
    let date;try{date=BP.date(value);}catch(error){fail(400,'DATE_INVALID',error.message);}
    if(!this.db.prepare('SELECT 1 FROM sessions WHERE date=?').get(date))fail(404,'DATE_UNKNOWN','Chưa có buổi học trong ngày này.');
    return date;
  }
  history(date){return this.entries(undefined,this.reportDate(date));}
  issues(date,status='ALL'){
    if(!['ALL','PENDING','REJECTED'].includes(status))fail(400,'STATUS_INVALID','Chọn chờ đối chiếu, không hợp lệ hoặc cả hai trạng thái.');
    const rows=this.history(date).filter(row=>['PENDING','REJECTED'].includes(row.status));
    return {counts:{pending:rows.filter(r=>r.status==='PENDING').length,rejected:rows.filter(r=>r.status==='REJECTED').length},
      entries:rows.filter(row=>status==='ALL'||row.status===status).map(row=>({...row,reason:issueReason(row)}))};
  }
  report(kind,date,status='ALL'){
    date=this.reportDate(date);let rows;
    if(kind==='summary'){
      rows=this.matrix();
      if(date){
        const col=rows[0].indexOf(date);
        // A daily report contains only results belonging to that date. Students
        // recorded only on other days must not leak into this day's export.
        rows=[rows[0],...rows.slice(1).filter(row=>row[col]!=='')].map(row=>[...row.slice(0,3),row[col]]);
      }
    }else if(kind==='detail')rows=detailTable(this.entries(undefined,date));
    else if(kind==='issues'){
      const entries=this.issues(date,status).entries;rows=detailTable(entries);
      rows[0].push('Lý do cần xử lý');entries.forEach((row,i)=>rows[i+1].push(row.reason));
    }else fail(400,'REPORT_INVALID','Loại báo cáo không hợp lệ.');
    const prefix={summary:'BP_Attendance',detail:'BP_Offline_Check',issues:'BP_Review'}[kind];
    return {csv:toCSV(rows),filename:prefix+'_'+(date||'all')+(kind==='issues'?'_'+status.toLowerCase():'')+'.csv'};
  }
  receipt(row,duplicate){
    const peers=this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE session_id=? AND ip=?').get(row.session_id,row.ip).n;
    return {studentId:row.student_id,name:row.name,seat:row.seat,date:this.session(row.session_id).date,at:row.at,duplicate,status:state({...row,peers})};
  }
  // Trusted local imports/tests may call submit directly. Public HTTP must use
  // checkIn, which verifies a current scan inside the same write transaction.
  submit(body,address,now=Date.now(),authorize){
    const sid=clean(body.sessionId,64,'Phiên'),studentId=clean(body.studentId,40,'MSSV').toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(studentId))fail(400,'ID_INVALID','MSSV chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    const name=clean(body.name,120,'Họ tên'),seat=clean(body.seat,32,'Vị trí ngồi');
    if(typeof body.requestId!=='string'||!/^([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(body.requestId))fail(400,'REQUEST_INVALID','Tải lại trang và gửi lại điểm danh.');
    const requestHash=hash(body.requestId),ip=canonicalIP(address);
    return this.tx(()=>{
      const previous=this.db.prepare('SELECT * FROM lan_attendance WHERE request_hash=?').get(requestHash);
      if(previous){
        if(previous.session_id!==sid||previous.student_id!==studentId||previous.name!==name||previous.seat!==seat)fail(409,'REQUEST_CHANGED','Lượt gửi trước đã ghi nhận. Liên hệ TA nếu cần sửa thông tin.');
        return this.receipt(previous,true);
      }
      const session=this.session(sid);
      if(!session||session.mode!=='OFFLINE'||session.date!==today(now)||session.closed_at||now<session.opened_at||now>=session.ends_at)fail(409,'SESSION_CLOSED','Chưa mở điểm danh hoặc phiên đã hết giờ. Liên hệ TA.');
      const grant=authorize?.();
      if(grant&&this.db.prepare('SELECT 1 FROM lan_scan_uses WHERE grant_id=?').get(grant))fail(409,'SCAN_USED','Lượt quét này đã dùng cho một MSSV. Nhờ TA kiểm tra.');
      if(this.db.prepare('SELECT 1 FROM lan_attendance WHERE session_id=? AND student_id=?').get(sid,studentId)||this.db.prepare('SELECT 1 FROM attendance WHERE session_id=? AND student_id=?').get(sid,studentId))fail(409,'ALREADY_RECORDED','MSSV này đã được ghi nhận trong buổi học. Nhờ TA kiểm tra nếu bạn chưa gửi.');
      this.db.prepare('INSERT INTO lan_attendance(session_id,student_id,name,seat,ip,at,request_hash) VALUES (?,?,?,?,?,?,?)').run(sid,studentId,name,seat,ip,now,requestHash);
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
      const peers=this.db.prepare('SELECT COUNT(*) AS n FROM lan_attendance WHERE session_id=? AND ip=?').get(row.session_id,row.ip).n;
      if(expectedPeers!==peers)fail(409,'GROUP_CHANGED','Nhóm IP vừa có thêm sinh viên. Tải lại danh sách rồi đối chiếu lại.');
      this.db.prepare('UPDATE lan_attendance SET review=?,reviewed_peers=?,review_note=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(review,peers,note,actor,now,id);
      this.audit(actor,'LAN_REVIEW',{id,studentId:row.student_id,sessionId:row.session_id,ip:row.ip,review,note,peers});this.dirty();
    });
  }
  snapshot(){
    const old=super.matrix(),entries=this.entries(),dates=[...new Set(this.sessions().map(s=>s.date))].sort();
    const students=new Map(old.slice(1).map(r=>[r[0],{id:r[0],name:r[1],email:r[2],days:new Map(old[0].slice(3).map((d,i)=>[d,r[i+3]]))}]));
    for(const row of entries){
      if(!students.has(row.student_id))students.set(row.student_id,{id:row.student_id,name:row.name,email:'',days:new Map()});
      const student=students.get(row.student_id),prior=student.days.get(row.date),online=prior==='ON'||prior==='BOTH';
      student.days.set(row.date,row.status==='PENDING'?(online?'ON · OFF cần xác nhận':'OFF cần xác nhận'):row.status==='REJECTED'?(online?'ON':'OFF không được xác nhận'):(online?'BOTH':'OFF'));
    }
    // Explicit attendance corrections still take precedence; review flags remain visible.
    for(const row of this.db.prepare('SELECT * FROM corrections ORDER BY id').all())students.get(row.student_id)?.days.set(row.date,row.mark);
    const ordered=[...students.values()].sort((a,b)=>a.id.localeCompare(b.id,'en'));
    const values=[['MSSV','Họ tên','Email trường',...dates],...ordered.map(s=>[s.id,s.name,s.email,...dates.map(d=>s.days.get(d)||'')])];
    const positions=new Map(ordered.map((s,i)=>[s.id,i+1]));
    const detail=detailTable(entries);
    const red=[],detailRed=[];
    entries.forEach((row,i)=>{if(row.status==='PENDING'){red.push({row:positions.get(row.student_id),col:3+dates.indexOf(row.date)});detailRed.push(i+1);}});
    return {values,detail,red,detailRed};
  }
  matrix(){return this.snapshot().values;}
  csv(date){return this.report('summary',date).csv;}
  detailCSV(date){return this.report('detail',date).csv;}
}
module.exports={LanStore,canonicalIP,state};
