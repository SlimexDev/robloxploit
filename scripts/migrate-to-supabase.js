import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { db, postgres, connectionOptions } from '../server/db.js';
import { storageEnabled, uploadWebp } from '../server/storage.js';
import { removeImage } from '../server/images.js';

let source;
let target;
const uploaded = [];
try {
  if (!postgres || !storageEnabled) throw new Error('Load both .env (source MySQL) and .env.production.local (target Supabase).');
  source = await mysql.createConnection(connectionOptions());
  const [scripts] = await source.execute('SELECT * FROM scripts ORDER BY id');
  const [settings] = await source.execute('SELECT * FROM settings WHERE id=1');
  // Upload first, then commit all database rows together; source data is never changed.
  if (Number((await db.query('SELECT COUNT(*) AS count FROM scripts')).rows[0].count)) throw new Error('Target library must be empty. Migration stopped without overwriting posts.');
  for (const row of scripts) {
    if (!/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(row.image)) throw new Error(`Post ${row.id} has an unsupported source image path.`);
    row.image = await uploadWebp(`${randomUUID()}.webp`, await readFile(`.${row.image}`));
    uploaded.push(row.image);
  }
  target = await db.connect();
  await target.query('BEGIN');
  await target.query('LOCK TABLE scripts IN EXCLUSIVE MODE');
  if (Number((await target.query('SELECT COUNT(*) AS count FROM scripts')).rows[0].count)) throw new Error('Target library changed during migration. Retry with an empty target.');
  for (const row of scripts) await target.query('INSERT INTO scripts (id,title,game,description,code,script_url,image,published,created_at,updated_at,tasks_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [row.id,row.title,row.game,row.description,row.code,row.script_url,row.image,row.published,row.created_at,row.updated_at,row.tasks_json || null]);
  await target.query("SELECT setval(pg_get_serial_sequence('scripts','id'), COALESCE(MAX(id),1), COUNT(*)>0) FROM scripts");
  if (settings[0]) { const s=settings[0]; await target.query('UPDATE settings SET channel_url=$1,video_url=$2,combined=$3,wait_seconds=$4 WHERE id=1',[s.channel_url,s.video_url,s.combined,s.wait_seconds]); if (s.tasks_json) await target.query('UPDATE settings SET tasks_json=$1 WHERE id=1', [s.tasks_json]); if (s.ads_json) await target.query('UPDATE settings SET ads_json=$1 WHERE id=1', [s.ads_json]); }
  await target.query('COMMIT');
  console.log(`Migrated ${scripts.length} posts and task settings. Local MySQL and files are unchanged. The cloud admin created by setup:cloud is retained.`);
} catch (error) {
  if (target) await target.query('ROLLBACK').catch(() => {});
  for (const image of uploaded) await removeImage(image);
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally { target?.release(); await source?.end(); await db.end(); }
