import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { hashPassword } from '../../server/security.js';

test('standalone code pages: admin CRUD, public exports, ads and access controls', async () => {
  const name = `robloxploit_code_test_${Date.now()}`;
  const root = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: await readFile('.runtime/mysql-root-password.txt', 'utf8') });
  await root.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
  await root.query(`GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX ON \`${name}\`.* TO 'robloxploit'@'127.0.0.1'`);
  process.env.DB_NAME = name;
  delete process.env.DATABASE_URL;
  const { app } = await import('../../server/app.js');
  const { db, query } = await import('../../server/db.js');
  let server;
  try {
    for (const sql of (await readFile('schema.sql', 'utf8')).split(';').map(s => s.trim()).filter(Boolean)) await query(sql);
    await query('INSERT INTO admins (username,password_hash) VALUES (?,?)', ['tester', await hashPassword('test-code-page-password')]);
    await query("INSERT INTO settings (id,channel_url,video_url,combined,wait_seconds) VALUES (1,'','',1,7)");
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let cookie = '', csrf;
    const request = async (url, options = {}) => {
      const response = await fetch(origin + url, { ...options, redirect: 'manual', headers: { Cookie: cookie, ...options.headers } });
      if (response.headers.getSetCookie()[0]) cookie = response.headers.getSetCookie()[0].split(';')[0];
      return response;
    };
    const form = data => ({ method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...data }) });
    assert.equal((await request('/robloxploit-slimexdev/code')).status, 303);
    csrf = (await (await request('/robloxploit-slimexdev/login')).text()).match(/name="csrf-token" content="([^"]+)"/)[1];
    assert.equal((await request('/robloxploit-slimexdev/login', form({ username: 'tester', password: 'test-code-page-password' }))).status, 303);
    const list = await (await request('/robloxploit-slimexdev/code')).text();
    csrf = list.match(/name="csrf-token" content="([^"]+)"/)[1];
    assert.equal((await request('/robloxploit-slimexdev/code/new')).status, 200);
    const code = '  print("hello")\r\n-- </code><script>CODE_MARKER</script>\n';
    assert.equal((await request('/robloxploit-slimexdev/code', form({ _csrf: 'wrong', title: 'Test', code }))).status, 403);
    assert.equal((await request('/robloxploit-slimexdev/code', form({ title: '', code }))).status, 422);
    assert.equal((await request('/robloxploit-slimexdev/code', form({ title: 'Test page', code }))).status, 303);
    const [row] = await query('SELECT * FROM code_pages');
    const url = `/code/${row.id}`;
    for (const suffix of ['', '/raw', '/download']) assert.equal((await request(url + suffix)).status, 404);
    assert.equal((await request(`/robloxploit-slimexdev/code/${row.id}/visibility`, form({}))).status, 303);
    const html = await (await request(url)).text();
    assert.match(html, /&lt;script&gt;CODE_MARKER/);
    assert.doesNotMatch(html, /<script>CODE_MARKER/);
    assert.doesNotMatch(html, /id="unlock-dialog"/);
    for (const suffix of ['/raw', '/download']) {
      const response = await request(url + suffix);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/plain/);
      assert.equal(await response.text(), code);
      if (suffix === '/download') assert.match(response.headers.get('content-disposition'), /attachment.*\.lua/);
    }
    await query('UPDATE settings SET ads_json=? WHERE id=1', [JSON.stringify({ banner: { enabled: true, html: '<p>AD</p>' }, popup: { enabled: true, html: '<p>POPUP</p>' } })]);
    const withAds = await (await request(url)).text();
    assert.match(withAds, /src="\/ads\/content\/banner"/);
    assert.match(withAds, /id="ad-popup"/);
    assert.equal((await request('/ads/content/banner')).status, 200);
    assert.equal((await request(`/robloxploit-slimexdev/code/${row.id}/edit`)).status, 200);
    assert.equal((await request(`/robloxploit-slimexdev/code/${row.id}/edit`, form({ title: 'Updated', code: 'print(2)', published: '1' }))).status, 303);
    assert.equal(await (await request(url + '/raw')).text(), 'print(2)');
    assert.equal((await request(`/robloxploit-slimexdev/code/${row.id}/delete`, form({}))).status, 303);
    assert.equal((await request(url + '/raw')).status, 404);
    const largeCode = '-- ' + '字'.repeat(50000);
    const upload = new FormData();
    for (const [key, value] of Object.entries({ _csrf: csrf, title: 'Large Unicode script', code: largeCode, published: '1' })) upload.set(key, value);
    assert.equal((await request('/robloxploit-slimexdev/code', { method: 'POST', body: upload })).status, 303);
    const [large] = await query('SELECT id FROM code_pages');
    assert.equal(await (await request(`/code/${large.id}/raw`)).text(), largeCode);
    assert.equal((await request(`/robloxploit-slimexdev/code/${large.id}/delete`, form({}))).status, 303);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end();
    assert.match(name, /^robloxploit_code_test_\d+$/);
    await root.query(`DROP DATABASE \`${name}\``);
    await root.query(`REVOKE ALL PRIVILEGES ON \`${name}\`.* FROM 'robloxploit'@'127.0.0.1'`);
    await root.end();
  }
});
