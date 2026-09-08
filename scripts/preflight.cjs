// Validate local setup without printing credentials or changing remote resources.
const fs=require('node:fs');
const path=require('node:path');
const {loadConfig}=require('../web/config.cjs');
try {
  const config=loadConfig();
  const file=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!file||!path.isAbsolute(file))throw Error('GOOGLE_APPLICATION_CREDENTIALS cần đường dẫn tuyệt đối tới JSON service account trên laptop.');
  const key=JSON.parse(fs.readFileSync(file,'utf8'));
  if(key.type!=='service_account'||!key.client_email||!key.private_key)throw Error('Credentials chưa phải JSON service account đầy đủ.');
  console.log('Cấu hình bắt buộc và file credentials: đã có.');
  console.log('URL sinh viên: '+config.origin+'/check-in');
  console.log('Cần kiểm tra trên mạng trường: HTTPS/DNS, Google login, quyền ghi Sheet và CIDR trước khi thu điểm danh.');
} catch(error) {
  console.error(error.code==='ENOENT'?'Không đọc được file credentials. Kiểm tra đường dẫn và quyền truy cập.':error instanceof SyntaxError?'File cấu hình JSON không hợp lệ.':error.message);
  process.exitCode=1;
}
