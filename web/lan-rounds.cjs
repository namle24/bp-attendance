const path=require('node:path');

// Keep one parent lesson per date. Existing offline sessions become round 1.
// Rebuilding the unique constraint and its dependent scan table is transactional.
function migrateRounds(store,filename){
  const db=store.db;
  if(db.prepare('PRAGMA table_info(lan_attendance)').all().some(c=>c.name==='round_id'))return;
  if(filename!==':memory:'&&db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n){
    const backup=path.resolve(filename)+'.before-rounds-'+Date.now()+'.sqlite';
    db.prepare('VACUUM INTO ?').run(backup);
  }
  store.tx(()=>{
    db.exec(`CREATE TABLE lan_rounds (
      id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),number INTEGER NOT NULL,label TEXT NOT NULL DEFAULT '',
      opened_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,closed_at INTEGER,actor TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,
      UNIQUE(session_id,number));
      INSERT INTO lan_rounds(id,session_id,number,opened_at,ends_at,closed_at,actor)
        SELECT id,id,1,opened_at,ends_at,closed_at,actor FROM sessions WHERE mode='OFFLINE';
      CREATE TABLE lan_attendance_next (
        id INTEGER PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),round_id TEXT NOT NULL REFERENCES lan_rounds(id),
        student_id TEXT NOT NULL,name TEXT NOT NULL,seat TEXT NOT NULL,ip TEXT NOT NULL,at INTEGER NOT NULL,request_hash TEXT NOT NULL UNIQUE,
        review TEXT NOT NULL DEFAULT '',reviewed_peers INTEGER NOT NULL DEFAULT 0,review_note TEXT NOT NULL DEFAULT '',reviewed_by TEXT NOT NULL DEFAULT '',reviewed_at INTEGER,
        UNIQUE(round_id,student_id));
      INSERT INTO lan_attendance_next SELECT id,session_id,session_id,student_id,name,seat,ip,at,request_hash,review,reviewed_peers,review_note,reviewed_by,reviewed_at FROM lan_attendance;
      CREATE TEMP TABLE saved_scan_uses AS SELECT * FROM lan_scan_uses;
      DROP TABLE lan_scan_uses;
      DROP TABLE lan_attendance;
      ALTER TABLE lan_attendance_next RENAME TO lan_attendance;
      CREATE INDEX lan_session_ip ON lan_attendance(round_id,ip);
      CREATE TABLE lan_scan_uses (grant_id TEXT PRIMARY KEY,attendance_id INTEGER NOT NULL UNIQUE REFERENCES lan_attendance(id));
      INSERT INTO lan_scan_uses SELECT * FROM saved_scan_uses;
      DROP TABLE saved_scan_uses;`);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Không thể chuyển dữ liệu điểm danh sang các đợt; dữ liệu cũ được giữ nguyên.');
    store.setMeta('lanSchema','2');store.dirty();
  });
}
module.exports={migrateRounds};
