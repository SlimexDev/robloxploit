import { readFile } from 'node:fs/promises';
import { db, query, postgres } from '../server/db.js';
import { hashPassword } from '../server/security.js';

try {
  if (postgres) throw new Error('Use npm run setup:cloud for Supabase.');
  const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await query(statement);
  if (!(await query("SHOW COLUMNS FROM scripts LIKE 'tasks_json'")).length) await query('ALTER TABLE scripts ADD COLUMN tasks_json TEXT NULL');
  const columns = await query("SHOW COLUMNS FROM scripts LIKE 'script_url'");
  if (!columns.length) await query('ALTER TABLE scripts ADD COLUMN script_url VARCHAR(2000) NULL AFTER code');
  for (const [column, type] of [['tasks_json', 'TEXT'], ['ads_json', 'MEDIUMTEXT']]) {
    if (!(await query(`SHOW COLUMNS FROM settings LIKE '${column}'`)).length) await query(`ALTER TABLE settings ADD COLUMN ${column} ${type} NULL`);
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const existing = await query('SELECT id FROM admins WHERE username = ?', [username]);
  if (!existing.length) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
    await query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, await hashPassword(password)]);
  }
  await query("INSERT IGNORE INTO settings (id, channel_url, video_url, combined, wait_seconds) VALUES (1, '', '', 1, 7)");
  console.log('Database ready. Admin account created if it did not already exist.');
} finally { await db.end(); }
