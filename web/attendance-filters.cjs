const {fail}=require('./security.cjs');
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
function filterEntries(rows,input={}){
  function value(key,allowed,fallback='ALL'){
    const result=input[key]===undefined?fallback:input[key];
    if(typeof result!=='string'||!allowed.includes(result))fail(400,'FILTER_INVALID','Bộ lọc '+key+' không hợp lệ.');
    return result;
  }
  const status=value('status',['ALL','RECORDED','PENDING','CONFIRMED','REJECTED']);
  const duplicate=value('duplicate',['ALL','MSSV']);
  const ip=value('ip',['ALL','DUPLICATE','UNIQUE']);
  const location=value('location',['ALL','OFF','INSIDE','OUTSIDE','UNVERIFIED']);
  const q=input.q===undefined?'':input.q,round=input.round===undefined?'':input.round;
  if(typeof q!=='string'||q.length>120||/[\p{Cc}\p{Cf}]/u.test(q)||typeof round!=='string'||round.length>64||round&&!/^[A-Za-z0-9-]+$/.test(round))fail(400,'FILTER_INVALID','Từ khóa hoặc đợt lọc không hợp lệ.');
  const words=fold(q).trim().split(/\s+/).filter(Boolean);
  // Peer counts and review state come from the full round, before filtering.
  return rows.filter(row=>{
    const position=row.location_status||'OFF';
    return (status==='ALL'||row.status===status)&&(duplicate==='ALL'||row.duplicate_attempts>0)&&(!round||row.round_id===round)&&
      (ip==='ALL'||(ip==='DUPLICATE'?row.peers>1:row.peers===1))&&
      (location==='ALL'||location==='UNVERIFIED'&&!['OFF','INSIDE','OUTSIDE'].includes(position)||location===position)&&
      (!words.length||words.every(word=>fold([row.student_id,row.name,row.seat,row.ip].join(' ')).includes(word)));
  });
}
module.exports={filterEntries};
