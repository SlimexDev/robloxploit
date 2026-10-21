import { readFile } from 'node:fs/promises';
import { db, postgres } from '../server/db.js';
import { hashPassword } from '../server/security.js';
import { storageEnabled, storageRequest, bucket } from '../server/storage.js';

try {
  if (!postgres || !storageEnabled) throw new Error('Set DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.production.local.');
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || username.length > 80 || !password || password.length < 12 || password.length > 256) throw new Error('Set ADMIN_USERNAME and a strong ADMIN_PASSWORD (12–256 characters).');
  await db.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  // Application tables are server-only; browser API keys must never reveal locked content.
  await db.query('REVOKE ALL ON admins, scripts, settings, app_sessions, app_rate_limits, code_pages FROM anon, authenticated');
  await db.query('INSERT INTO admins (username,password_hash) VALUES ($1,$2) ON CONFLICT (username) DO NOTHING', [username, await hashPassword(password)]);
  let exists = true;
  try { await storageRequest(`bucket/${bucket}`); } catch (error) { if (error.status === 404 || error.status === 400) exists = false; else throw error; }
  const config = { public: true, file_size_limit: 4 * 1024 * 1024, allowed_mime_types: ['image/webp'] };
  await storageRequest(exists ? `bucket/${bucket}` : 'bucket', { method: exists ? 'PUT' : 'POST', body: JSON.stringify(exists ? config : { id: bucket, name: bucket, ...config }) });
  console.log('Supabase tables, private application access, admin and public cover bucket are ready. Existing admin passwords were not changed.');
} catch (error) { console.error('Cloud setup failed:', error.message); process.exitCode = 1; }
finally { await db.end(); }
