const {createHmac,randomBytes}=require('node:crypto');
const {equal,hash}=require('./security.cjs');
const NAME='bp_device';
function signature(id,secret){return createHmac('sha256',secret).update('browser-v1:'+id).digest('base64url');}
function read(req,secret){
  const values=String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(NAME+'='));
  if(values.length!==1)return '';
  const [id,sig,...extra]=values[0].slice(NAME.length+1).split('.');
  return !extra.length&&/^[a-f0-9]{64}$/.test(id)&&equal(sig,signature(id,secret))?hash(id):'';
}
function attach(req,res,secret){
  req.device=read(req,secret);
  if(req.device)return;
  const id=randomBytes(32).toString('hex');
  // HTTP LAN cannot use Secure; never expose this identifier to JavaScript.
  res.append('Set-Cookie',NAME+'='+id+'.'+signature(id,secret)+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000');
  req.newDevice=hash(id);
}
module.exports={attach,read};
