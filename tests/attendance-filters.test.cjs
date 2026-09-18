const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {parse}=require('csv-parse/sync');
const {today}=require('../web/security.cjs');
const {startFixture}=require('./helpers/lan-browser-fixture.cjs');
test('TA filters and CSV agree without changing round-wide IP evidence, decisions or historical data',async()=>{
  const f=await startFixture(),now=Date.now(),date=today(now);
  try{
    const send=(round,id,name,ip,location)=>f.store.submit({sessionId:round.id,studentId:id,name,seat:'B-'+id,requestId:randomUUID(),location},ip,now);
    const first=f.store.open(date,8,'TA',now);
    send(first,'001','Nguyễn An','192.168.2.1');send(first,'002','Lê Bình','192.168.2.1');f.store.closeSession(first.id,'TA',now);
    f.store.configureLocation({enabled:true,latitude:21,longitude:105,accuracy:5,radius:100},'TA',now);
    const second=f.store.open(date,8,'TA',now),near={status:'OK',latitude:21,longitude:105,accuracy:8,ageMs:0};
    send(second,'003','Đặng Minh','192.168.2.1',near);send(second,'004','Ngọc Anh','192.168.2.1',{...near,latitude:21.01});
    send(second,'005','Sơn Đỗ','192.168.2.2',{status:'DENIED'});send(second,'006','Bình An','192.168.2.3',near);
    const rows=f.store.entries();f.store.reviewEntry(rows[2].id,'CONFIRMED','Đã kiểm tra tại ghế',2,'TA');f.store.reviewEntry(rows[4].id,'REJECTED','Không có mặt khi đối chiếu',1,'TA');
    const before=f.store.snapshot(),revision=f.store.meta('revision');
    for(const [query,ids] of [
      ['q=dang%20minh&ip=DUPLICATE&status=CONFIRMED',['003']],
      ['location=OFF',['001','002']],['location=INSIDE&ip=UNIQUE',['006']],
      ['location=OUTSIDE',['004']],['location=UNVERIFIED',['005']],
      ['round='+first.id+'&q=192.168.2.1',['001','002']],['q=B-004',['004']],['q=no-match',[]]
    ]){
      const r=await fetch(f.adminOrigin+'/api/history?'+query);assert.equal(r.status,200);const data=await r.json();assert.equal(data.total,6);assert.deepEqual(data.entries.map(e=>e.student_id),ids);
      const csv=await fetch(f.adminOrigin+'/api/detail.csv?'+query).then(r=>r.text());assert.deepEqual(parse(csv,{bom:true}).slice(1).map(r=>r[1]),ids);
      if(ids.length===1&&ids[0]==='003'){assert.equal(data.entries[0].peers,2);assert.equal(data.entries[0].status,'CONFIRMED');}
    }
    const cases=await fetch(f.adminOrigin+'/api/issues?location=UNVERIFIED&status=REJECTED').then(r=>r.json());
    assert.deepEqual(cases.entries.map(r=>r.student_id),['005']);assert.deepEqual(cases.counts,{pending:0,rejected:1});
    const exported=await fetch(f.adminOrigin+'/api/issues.csv?location=UNVERIFIED&status=REJECTED').then(r=>r.text());assert.deepEqual(parse(exported,{bom:true}).slice(1).map(r=>r[1]),['005']);
    const visible=await fetch(f.adminOrigin+'/api/entries?session='+second.id+'&ip=DUPLICATE&q=003').then(r=>r.json());assert.equal(visible.entries[0].peers,2);assert.equal(visible.total,4);
    for(const query of ['q=a&q=b','ip=anything','location=anything','status=anything','round=bad/id','q='+encodeURIComponent('\n')]){
      assert.equal((await fetch(f.adminOrigin+'/api/history?'+query)).status,400);
      assert.equal((await fetch(f.adminOrigin+'/api/detail.csv?'+query)).status,400);
    }
    assert.equal((await fetch(f.origin+'/api/history?q=003')).status,404);
    assert.deepEqual(f.store.snapshot(),before);assert.equal(f.store.meta('revision'),revision);
  }finally{await f.close();}
});
