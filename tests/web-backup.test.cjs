const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const {Store}=require('../web/store.cjs');
const {today}=require('../web/security.cjs');

test('online backup preserves committed WAL attendance and owner metadata while source remains open',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'bp-backup-'));
  const filename=path.join(dir,'live.sqlite'),store=new Store(filename);
  try{
    store.db.exec('PRAGMA wal_autocheckpoint=0');
    store.importRoster('MSSV,Họ tên,Email trường\n001,An,a@school.example','ta');
    store.setMeta('sheetOwner','original-owner');
    store.bindStudent({email:'a@school.example',sub:'a'});
    const session=store.open(today(Date.now()),5,'ta');
    store.checkIn(session.id,{email:'a@school.example',sub:'a'},'203.0.113.1');
    const output=execFileSync('python3',[path.resolve(__dirname,'../scripts/backup-db.py'),filename,path.join(dir,'backups')],{encoding:'utf8'}).trim();
    const copy=new Store(output);
    try{assert.equal(copy.sessions()[0].count,1);assert.equal(copy.meta('sheetOwner'),'original-owner');}
    finally{copy.close();}
    assert.equal(store.sessions()[0].count,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
