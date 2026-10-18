import mysql from 'mysql2/promise';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

export const postgres = Boolean(process.env.DATABASE_URL);
if (process.env.VERCEL && !postgres) throw new Error('DATABASE_URL is required on Vercel.');
export const requestDatabase = new AsyncLocalStorage();
export function connectionOptions() {
  return { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'robloxploit', charset: 'utf8mb4', dateStrings: true };
}
let databaseUrl = process.env.DATABASE_URL;
if (postgres) {
  const url = new URL(databaseUrl);
  // Keep certificate verification under application control, even if a copied URI includes sslmode.
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) url.searchParams.delete(key);
  databaseUrl = url.href;
  if (process.env.VERCEL && process.env.DATABASE_SSL === 'disable') throw new Error('TLS is required on Vercel.');
}
export const db = postgres
  ? new pg.Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true, ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replaceAll('\\n', '\n') } : {}) } })
  : mysql.createPool({ ...connectionOptions(), connectionLimit: 5 });
if (postgres) db.on('error', error => console.error('Database pool error:', error.code));

// Queries are internal SQL with bound values; SQL literals never contain question marks.
export function postgresSql(sql) {
  let index = 0;
  return sql.replaceAll(' LIKE ', ' ILIKE ').replace(/\?/g, () => `$${++index}`);
}
export async function query(sql, params = []) {
  if (postgres) {
    const result = await (requestDatabase.getStore() || db).query(postgresSql(sql), params);
    return result.rows;
  }
  const [rows] = await db.execute(sql, params);
  return rows;
}
export const publicColumns = 'id, title, game, description, image, created_at, updated_at';
export async function getSettings() {
  const [settings] = await query('SELECT * FROM settings WHERE id = 1');
  if (!settings) throw new Error('Run database setup first.');
  return { ...settings, combined: Boolean(settings.combined), tasks: settings.tasks_json ? JSON.parse(settings.tasks_json) : null, ads: settings.ads_json ? JSON.parse(settings.ads_json) : {} };
}
