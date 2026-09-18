// Location is supporting evidence, not proof of identity. The server computes
// distance and uncertainty; client-supplied verdicts/distances are never trusted.
const {fail}=require('./security.cjs');
const HELPER_URL='https://namle24.github.io/bp-attendance/location/';
const labels={OFF:'Không kiểm tra',INSIDE:'Trong phạm vi',OUTSIDE:'Ngoài phạm vi',UNCERTAIN:'Chưa đủ độ chính xác',MISSING:'Chưa gửi vị trí',DENIED:'Quyền vị trí bị chặn',UNAVAILABLE:'Không lấy được vị trí',TIMEOUT:'Lấy vị trí quá thời gian',UNSUPPORTED:'Không hỗ trợ vị trí',INVALID:'Vị trí không hợp lệ',STALE:'Vị trí đã quá hạn'};
const label=status=>labels[status]||labels.OFF;
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
function policy(input){
  if(!input||typeof input.enabled!=='boolean')fail(400,'LOCATION_CONFIG_INVALID','Chọn bật hoặc tắt kiểm tra vị trí.');
  if(!input.enabled)return {enabled:false};
  const {latitude,longitude,accuracy,radius}=input;
  if(!finite(latitude,-90,90)||!finite(longitude,-180,180)||!finite(radius,20,2000)||!finite(accuracy,0,radius/2))
    fail(400,'LOCATION_CONFIG_INVALID','Nhập tọa độ hợp lệ, bán kính 20–2.000 m và sai số tâm không quá nửa bán kính.');
  return {enabled:true,latitude,longitude,accuracy,radius};
}
function distance(a,b){
  const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
const reasons={MISSING:'Chưa cung cấp vị trí.',DENIED:'Trình duyệt hoặc thiết bị đang chặn quyền vị trí; chưa xác định được nguyên nhân.',UNAVAILABLE:'Thiết bị không lấy được vị trí.',TIMEOUT:'Lấy vị trí quá thời gian.',UNSUPPORTED:'Trình duyệt không hỗ trợ lấy vị trí.',INVALID:'Dữ liệu vị trí không hợp lệ.',STALE:'Vị trí đã quá 60 giây; cần đối chiếu lại.',UNCERTAIN:'Sai số vị trí chưa đủ để xác định trong hay ngoài phạm vi.',OUTSIDE:'Vị trí báo cáo ở ngoài phạm vi lớp.'};
function evaluate(config,sample){
  if(!config?.enabled)return {status:'OFF',distance:null,accuracy:null,radius:null,reason:''};
  const result={status:'MISSING',distance:null,accuracy:null,radius:config.radius};
  if(sample&&typeof sample==='object'&&!Array.isArray(sample)){
    if(['DENIED','UNAVAILABLE','TIMEOUT','UNSUPPORTED'].includes(sample.status))result.status=sample.status;
    else if(sample.status==='OK'&&finite(sample.latitude,-90,90)&&finite(sample.longitude,-180,180)&&finite(sample.accuracy,0,100000)&&finite(sample.ageMs,0,3600000)){
      const meters=distance(config,sample),uncertainty=config.accuracy+sample.accuracy;
      result.distance=Math.round(meters);result.accuracy=Math.ceil(sample.accuracy);
      result.status=sample.ageMs>60000?'STALE':uncertainty>config.radius?'UNCERTAIN':meters+uncertainty<=config.radius?'INSIDE':meters-uncertainty>config.radius?'OUTSIDE':'UNCERTAIN';
    }else result.status='INVALID';
  }
  result.reason=reasons[result.status]||'';return result;
}
function publicPolicy(config,helperUrl=HELPER_URL){return config?.enabled?{enabled:true,radius:config.radius,helperUrl}:{enabled:false};}
module.exports={policy,distance,evaluate,publicPolicy,label,HELPER_URL};
