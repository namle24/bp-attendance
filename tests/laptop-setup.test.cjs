const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {parseEnv}=require('node:util');
const {prepare}=require('../scripts/laptop-setup.cjs');
const {inspect}=require('../scripts/host-check.cjs');
const {Store}=require('../web/store.cjs');
test('laptop preparation keeps existing secrets, config and database when run again',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bp-prepare-'));
  try{
    fs.copyFileSync(path.resolve(__dirname,'../.env.example'),path.join(dir,'.env.example'));
    const first=prepare(dir),a=parseEnv(fs.readFileSync(first.envFile,'utf8'));
    assert.match(a.QR_SECRET,/^[0-9a-f]{64}$/);
    assert.equal(a.LAN_INTERFACE,'');assert.equal(a.CAMPUS_CIDRS,'');assert.equal(a.ADMIN_PORT,'4181');
    assert.equal(fs.statSync(first.envFile).mode&0o777,0o600);
    const store=new Store(first.database);store.setMeta('sentinel','keep-attendance');store.close();
    fs.appendFileSync(first.envFile,'\nADMIN_EMAILS=ta@school.example\n');
    const beforeProxy=fs.readFileSync(first.proxyFile,'utf8');
    const next=prepare(dir),b=parseEnv(fs.readFileSync(next.envFile,'utf8'));
    assert.equal(a.QR_SECRET,b.QR_SECRET);assert.equal(b.ADMIN_EMAILS,'ta@school.example');
    assert.equal(fs.readFileSync(next.proxyFile,'utf8'),beforeProxy);
    const reopened=new Store(next.database);assert.equal(reopened.meta('sentinel'),'keep-attendance');reopened.close();
    const report=inspect(dir);assert.ok(report.checks.find(c=>c.name==='Node.js').ok);
    assert.ok(report.warnings.some(w=>w.includes('Sheet chưa cấu hình')));
    assert.equal(JSON.stringify(report).includes(a.QR_SECRET),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
