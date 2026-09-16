// Read-only Google Sheets snapshots for exact-MSSV student lookup.
// The public result contains dates and result cells, never roster names/emails/IPs.
const {GoogleAuth}=require('google-auth-library');
const fs=require('node:fs');
const {parse}=require('csv-parse/sync');
const {fail}=require('./security.cjs');
const BP=require('./core.cjs');

function studentId(value){
  if(typeof value!=='string')fail(400,'ID_INVALID','Nhập đầy đủ MSSV cần tra cứu.');
  const id=value.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(id))fail(400,'ID_INVALID','MSSV chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  return id;
}
function dateCell(value){
  const text=String(value??'').trim();
  const match=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text);
  const date=match?match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'):text;
  try{return BP.date(date);}catch{return null;}
}
function header(value){return String(value??'').normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');}
function parseResults(values){
  if(!Array.isArray(values)||!Array.isArray(values[0]))throw Error('Sheet chưa có tiêu đề. Cần cột MSSV và các cột ngày học.');
  if(values.length>5001||values.some(row=>!Array.isArray(row)||row.length>400))throw Error('Sheet vượt giới hạn 5.000 dòng dữ liệu hoặc 400 cột.');
  const headings=values[0],normalized=headings.map(header);
  const idColumns=normalized.map((name,index)=>['mssv','masosinhvien','masinhvien','studentid'].includes(name)?index:-1).filter(i=>i>=0);
  if(idColumns.length!==1)throw Error('Sheet cần đúng một cột MSSV.');
  const idColumn=idColumns[0],dateColumn=normalized.findIndex(name=>['ngay','ngayhoc','date'].includes(name));
  const resultColumn=normalized.findIndex(name=>['ketqua','ketquadiemdanh','result'].includes(name));
  const long=dateColumn>=0&&resultColumn>=0;
  const dates=headings.map((cell,index)=>({index,date:dateCell(cell)})).filter(cell=>cell.date);
  if(!long&&!dates.length)throw Error('Cần các cột ngày YYYY-MM-DD hoặc DD/MM/YYYY; hoặc ba cột MSSV,Ngày,Kết quả.');
  if(new Set(dates.map(cell=>cell.date)).size!==dates.length)throw Error('Có hai cột cùng ngày học. Giữ một cột kết quả cho mỗi ngày.');
  const students=new Map(),seen=new Set();
  for(let i=1;i<values.length;i++){
    const row=values[i];if(row.every(cell=>String(cell??'').trim()===''))continue;
    let id;try{id=studentId(String(row[idColumn]??''));}catch{throw Error('MSSV không hợp lệ tại dòng '+(i+1)+'.');}
    if(!long&&students.has(id))throw Error('MSSV lặp lại tại dòng '+(i+1)+'.');
    if(!students.has(id))students.set(id,[]);
    const cells=long?[{date:dateCell(row[dateColumn]),index:resultColumn}]:dates;
    for(const cell of cells){
      if(!cell.date)throw Error('Ngày không hợp lệ tại dòng '+(i+1)+'. Dùng YYYY-MM-DD hoặc DD/MM/YYYY.');
      const key=id+'\n'+cell.date;if(seen.has(key))throw Error('MSSV và ngày bị lặp tại dòng '+(i+1)+'.');seen.add(key);
      const result=String(row[cell.index]??'').trim();
      if(result.length>200||/[\p{Cc}\p{Cf}]/u.test(result))throw Error('Ô kết quả không hợp lệ tại dòng '+(i+1)+'. Tối đa 200 ký tự, một dòng.');
      students.get(id).push({date:cell.date,result});
    }
  }
  return [...students].map(([id,days])=>({id,days:days.sort((a,b)=>b.date.localeCompare(a.date))}));
}
function sourceInput(input){
  let id=typeof input.spreadsheetId==='string'?input.spreadsheetId.trim():'';
  let gid=input.gid;
  if(/^https?:/i.test(id)){
    let url;try{url=new URL(id);}catch{fail(400,'LOOKUP_SOURCE_INVALID','Nhập link Google Sheet hợp lệ.');}
    if(url.origin!=='https://docs.google.com')fail(400,'LOOKUP_SOURCE_INVALID','Dùng link https://docs.google.com/spreadsheets/d/…');
    const match=/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname);id=match?match[1]:'';
    gid=url.searchParams.get('gid')??new URLSearchParams(url.hash.slice(1)).get('gid')??undefined;
  }
  const tab=typeof input.tab==='string'?input.tab.trim():'';
  if(!/^[A-Za-z0-9_-]{15,120}$/.test(id)||!tab||tab.length>100||/[\p{Cc}\p{Cf}]/u.test(tab))fail(400,'LOOKUP_SOURCE_INVALID','Nhập link/ID Google Sheet và đúng tên tab kết quả.');
  if(gid!==undefined&&!/^\d{1,10}$/.test(String(gid)))fail(400,'LOOKUP_SOURCE_INVALID','Mã tab gid trong link Google Sheet không hợp lệ.');
  return {spreadsheetId:id,tab,...(gid!==undefined?{gid:String(gid)}:{})};
}
class StudentLookup {
  constructor(store,options={}){
    this.store=store;this.clock=options.clock||Date.now;this.writerConfig=options.writerConfig||{};this.fetch=options.fetch||fetch;
    this.fetchValues=options.fetchValues||this.readSheet.bind(this);this.busy=null;this.again=false;this.error='';
    store.db.exec('CREATE TABLE IF NOT EXISTS student_lookup (student_id TEXT PRIMARY KEY,days TEXT NOT NULL)');
  }
  source(){try{return JSON.parse(this.store.meta('studentLookupSource'))||null;}catch{return null;}}
  status(){
    const updatedAt=Number(this.store.meta('studentLookupUpdatedAt'))||null;
    return {configured:!!this.source(),updatedAt,refreshing:!!this.busy,stale:!!this.error||!!updatedAt&&this.clock()-updatedAt>120000,error:this.error};
  }
  configure(input,actor){
    const source=sourceInput(input);
    if(source.spreadsheetId===this.writerConfig.spreadsheetId&&[this.writerConfig.sheetTitle,'BP_Offline_Check'].includes(source.tab))fail(400,'LOOKUP_WRITER_CONFLICT','Tab này đang được app tự ghi. Chọn tab kết quả riêng do TA sửa để tránh bị ghi đè.');
    if(JSON.stringify(source)!==JSON.stringify(this.source())){
      this.store.tx(()=>{
        this.store.setMeta('studentLookupSource',JSON.stringify(source));
        this.store.setMeta('studentLookupUpdatedAt','');this.store.db.exec('DELETE FROM student_lookup');
        this.store.audit(actor,'STUDENT_LOOKUP_SOURCE',source);
      });
      this.error='';if(this.busy)this.again=true;
    }
    return source;
  }
  async readSheet(source){
    // CSV export preserves mixed numeric/alphanumeric IDs. The visualization query
    // endpoint infers column types and can silently blank minority-type MSSVs.
    try{
      if(source.gid===undefined)throw Error('Dán link của tab kết quả, bao gồm #gid=…');
      const url=new URL('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(source.spreadsheetId)+'/export');
      url.search=new URLSearchParams({format:'csv',gid:source.gid,range:'A1:OK5002'});
      const response=await this.fetch(url,{signal:AbortSignal.timeout(15000),cache:'no-store'});
      if(!response.ok||!/^text\/csv\b/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Sheet chưa cho phép đọc qua liên kết.');}
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Sheet vượt giới hạn dung lượng.');chunks.push(chunk);}
      return parse(Buffer.concat(chunks).toString('utf8'),{bom:true,skip_empty_lines:true,relax_column_count:true,max_record_size:1024*1024});
    }catch(error){
      if(!process.env.GOOGLE_APPLICATION_CREDENTIALS||!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS))throw error;
    }
    this.auth||=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
    const client=await this.auth.getClient();
    // Fixed Google API host and quoted tab: source input cannot select an arbitrary URL/range.
    const range="'"+source.tab.replace(/'/g,"''")+"'!A1:OK5002";
    const response=await client.request({url:'https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(source.spreadsheetId)+'/values/'+encodeURIComponent(range),
      params:{valueRenderOption:'FORMATTED_VALUE'},timeout:15000,maxContentLength:8*1024*1024});
    return response.data.values||[];
  }
  sync(){
    if(this.busy)return this.busy;
    const source=this.source();if(!source)return Promise.resolve(this.status());
    const signature=JSON.stringify(source);
    this.busy=Promise.resolve().then(async()=>{
      let values;
      try{values=await this.fetchValues(source);}catch{throw Error('Chưa đọc được Google Sheet. Dán link đúng tab (có gid), kiểm tra mạng và quyền xem qua liên kết hoặc tài khoản dịch vụ.');}
      const rows=parseResults(values);
      if(signature!==JSON.stringify(this.source()))return;
      this.store.tx(()=>{
        this.store.db.exec('DELETE FROM student_lookup');
        const put=this.store.db.prepare('INSERT INTO student_lookup VALUES (?,?)');
        for(const row of rows)put.run(row.id,JSON.stringify(row.days));
        this.store.setMeta('studentLookupUpdatedAt',this.clock());
      });this.error='';
    }).catch(error=>{if(signature===JSON.stringify(this.source()))this.error=error.message;}).finally(()=>{
      this.busy=null;if(this.again){this.again=false;void this.sync();}
    });
    return this.busy;
  }
  search(value){
    const id=studentId(value),status=this.status();
    if(!status.configured)fail(503,'LOOKUP_NOT_CONFIGURED','TA chưa cấu hình Google Sheet kết quả. Vui lòng báo TA.');
    if(!status.updatedAt)fail(503,'LOOKUP_NOT_READY','Chưa tải được kết quả từ Google Sheet. Vui lòng thử lại sau hoặc báo TA.');
    const row=this.store.db.prepare('SELECT days FROM student_lookup WHERE student_id=?').get(id);
    return {studentId:id,found:!!row,days:row?JSON.parse(row.days):[],updatedAt:status.updatedAt,stale:status.stale,refreshing:status.refreshing};
  }
}
module.exports={StudentLookup,parseResults,sourceInput,studentId};
