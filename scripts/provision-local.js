import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';

try { await access('.env'); throw new Error('.env already exists. Refusing to overwrite.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const password = randomBytes(24).toString('hex');
const adminPassword = randomBytes(15).toString('base64url');
const rootPassword = randomBytes(32).toString('hex');
const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root' });
try {
  await connection.query('CREATE DATABASE IF NOT EXISTS robloxploit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await connection.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', ['robloxploit', '127.0.0.1', password]);
  await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON robloxploit.* TO 'robloxploit'@'127.0.0.1'");
  await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [rootPassword]);
  await writeFile('.env', `HOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nNODE_ENV=development\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_NAME=robloxploit\nDB_USER=robloxploit\nDB_PASSWORD=${password}\nADMIN_USERNAME=admin\nADMIN_PASSWORD=${adminPassword}\n`, { flag: 'wx' });
  await writeFile('.runtime/mysql-root-password.txt', rootPassword, { flag: 'wx' });
  await writeFile('.runtime/ADMIN-LOGIN.txt', `RobloXploit local\nURL: http://localhost:3000/robloxploit-slimexdev\nUsername: admin\nPassword: ${adminPassword}\n`, { flag: 'wx' });
  console.log('Local database provisioned. Credentials saved locally; no credentials printed.');
} finally { await connection.end(); }
