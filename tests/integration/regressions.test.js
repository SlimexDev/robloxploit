import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { hashPassword } from '../../server/security.js';
import { libraryRegressions } from '../helpers/library-regressions.js';

test('MySQL HTTP regressions', async t => {
  const name = `robloxploit_regression_test_${Date.now()}`;
  const root = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: await readFile('.runtime/mysql-root-password.txt', 'utf8') });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON \`${name}\`.* TO 'robloxploit'@'127.0.0.1'`);
  process.env.DB_NAME = name;
  const { app } = await import('../../server/app.js');
  const { db, query } = await import('../../server/db.js');
  let server;
  try {
    for (const sql of (await readFile('schema.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await query(sql);
    await query('INSERT INTO admins (username,password_hash) VALUES (?,?)', ['regression', await hashPassword('regression-test-password')]);
    await query("INSERT INTO settings (id,channel_url,video_url,combined,wait_seconds) VALUES (1,'','',1,1)");
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (path, options = {}) => {
      const response = await fetch(origin + path, { ...options, redirect: 'manual', headers: { Cookie: cookie, ...options.headers } });
      if (response.headers.getSetCookie()[0]) cookie = response.headers.getSetCookie()[0].split(';')[0];
      return response;
    };
    let csrf = (await (await request('/robloxploit-slimexdev/login')).text()).match(/name="csrf-token" content="([^"]+)"/)[1];
    const form = data => ({ method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...data }) });
    assert.equal((await request('/robloxploit-slimexdev/login', form({ username: 'regression', password: 'regression-test-password' }))).status, 303);
    csrf = (await (await request('/robloxploit-slimexdev')).text()).match(/name="csrf-token" content="([^"]+)"/)[1];
    await libraryRegressions(t, { query, request, form, csrf });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end();
    assert.match(name, /^robloxploit_regression_test_\d+$/);
    await root.query(`REVOKE ALL PRIVILEGES ON \`${name}\`.* FROM 'robloxploit'@'127.0.0.1'`);
    await root.query(`DROP DATABASE \`${name}\``);
    await root.end();
  }
});
