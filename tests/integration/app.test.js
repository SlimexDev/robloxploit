import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { hashPassword } from '../../server/security.js';

test('MySQL end-to-end library, admin and unlock workflow', async t => {
  const databaseName = `robloxploit_test_${Date.now()}`;
  const root = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: await readFile('.runtime/mysql-root-password.txt', 'utf8') });
  await root.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON \`${databaseName}\`.* TO 'robloxploit'@'127.0.0.1'`);
  process.env.DB_NAME = databaseName;
  const { app } = await import('../../server/app.js');
  const { query, db } = await import('../../server/db.js');
  const schema = await readFile('schema.sql', 'utf8');
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await query(statement);
  await query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['testadmin', await hashPassword('integration-password')]);
  await query("INSERT INTO settings (id, channel_url, video_url, combined, wait_seconds) VALUES (1, 'https://www.youtube.com/@test', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 1, 1)");
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  let csrf;
  const request = async (url, options = {}) => {
    const response = await fetch(`${origin}${url}`, { ...options, redirect: 'manual', headers: { Cookie: cookie, ...options.headers } });
    const nextCookie = response.headers.getSetCookie()[0];
    if (nextCookie) cookie = nextCookie.split(';')[0];
    return response;
  };
  const form = data => ({ method: 'POST', body: new URLSearchParams({ _csrf: csrf, ...data }) });
  const api = (token, action, index, extra = {}) => request(`/api/unlock/${token}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ index, ...extra }) });
  const waitForTask = async (token, index) => {
    if (index !== 1) { await new Promise(resolve => setTimeout(resolve, 1020)); return; }
    let remaining = (await (await api(token, 'playback', index, { playing: true })).json()).remainingMs;
    for (let heartbeat = 0; remaining > 0 && heartbeat < 50; heartbeat++) {
      await new Promise(resolve => setTimeout(resolve, 1020));
      const response = await api(token, 'playback', index, { playing: true });
      assert.equal(response.status, 200);
      remaining = (await response.json()).remainingMs;
    }
    assert.equal(remaining, 0, 'Playback heartbeats must finish the watch task');
  };
  let id;
  let imagePath;
  try {
    await t.test('admin access and CSRF enforced; login rotates session', async () => {
      assert.equal((await request('/admin')).status, 404);
      assert.equal((await request('/robloxploit-slimexdev')).status, 303);
      const login = await (await request('/robloxploit-slimexdev/login')).text();
      csrf = login.match(/name="csrf-token" content="([^"]+)"/)[1];
      assert.equal((await request('/robloxploit-slimexdev/login', form({ username: 'testadmin', password: 'wrong' }))).status, 401);
      assert.equal((await request('/robloxploit-slimexdev/login', form({ _csrf: 'á'.repeat(64), username: 'testadmin', password: 'integration-password' }))).status, 403);
      const before = cookie;
      assert.equal((await request('/robloxploit-slimexdev/login', form({ username: 'testadmin', password: 'integration-password' }))).status, 303);
      assert.notEqual(cookie, before);
      const admin = await (await request('/robloxploit-slimexdev')).text();
      csrf = admin.match(/name="csrf-token" content="([^"]+)"/)[1];
      assert.match(admin, /Manage posts/);
    });
    await t.test('upload creates a hidden post with WebP; public routes hide it', async () => {
      const data = new FormData();
      data.set('title', '<script>alert(1)</script> QA Blox');
      data.set('game', 'QA Game'); data.set('description', 'Integration description'); data.set('code', 'SECRET_LUA_MARKER_771');
      data.set('image', new Blob([await sharp({ create: { width: 1600, height: 900, channels: 3, background: 'purple' } }).png().toBuffer()], { type: 'image/png' }), 'cover.png');
      const response = await request(`/robloxploit-slimexdev/scripts?_csrf=${csrf}`, { method: 'POST', body: data });
      assert.equal(response.status, 303);
      const [row] = await query('SELECT * FROM scripts');
      id = row.id; imagePath = row.image;
      assert.match(row.image, /\.webp$/);
      assert.equal((await sharp(await readFile(`.${row.image}`)).metadata()).width, 1280);
      assert.equal((await request(`/script/${id}`)).status, 404);
      assert.doesNotMatch(await (await request('/')).text(), /QA Blox/);
    });
    await t.test('visibility, search, escaping and protected code work', async () => {
      await request(`/robloxploit-slimexdev/scripts/${id}/visibility`, form({}));
      const home = await (await request('/?q=QA%20Blox&game=QA%20Game')).text();
      assert.match(home, /QA Blox/); assert.match(home, /&lt;script&gt;/);
      assert.doesNotMatch(home, /<script>alert/);
      assert.doesNotMatch(home, /SECRET_LUA_MARKER_771/);
      const detail = await (await request(`/script/${id}`)).text();
      assert.doesNotMatch(detail, /SECRET_LUA_MARKER_771/);
      const token = detail.match(/data-token="([^"]+)"/)[1];
      assert.equal((await api(token, 'code')).status, 403);
      assert.equal((await api(token, 'start', 1)).status, 400);
      await api(token, 'start', 0);
      assert.equal((await api(token, 'complete', 0)).status, 400);
      for (let index = 0; index < 3; index++) {
        if (index) await api(token, 'start', index);
        await waitForTask(token, index);
        assert.equal((await api(token, 'complete', index)).status, 200);
      }
      assert.equal((await (await api(token, 'code')).json()).code, 'SECRET_LUA_MARKER_771');
      const newDetail = await (await request(`/script/${id}`)).text();
      const newToken = newDetail.match(/data-token="([^"]+)"/)[1];
      assert.notEqual(token, newToken);
      assert.equal((await api(token, 'code')).status, 410);
      assert.equal((await api(newToken, 'code')).status, 403);
    });
    await t.test('link is private until unlock and survives admin editing', async () => {
      const url = 'https://example.com/PRIVATE_SCRIPT_LINK';
      const body = new FormData();
      for (const [key,value] of Object.entries({title:'Link post',game:'QA Game',description:'Link description',content_type:'link',script_url:url,published:'1'})) body.set(key,value);
      assert.equal((await request(`/robloxploit-slimexdev/scripts/${id}/edit?_csrf=${csrf}`, {method:'POST',body})).status,303);
      const detail = await (await request(`/script/${id}`)).text();
      assert.doesNotMatch(detail, /PRIVATE_SCRIPT_LINK/);
      const token = detail.match(/data-token="([^"]+)"/)[1];
      assert.equal((await api(token,'code')).status,403);
      for (let index=0;index<3;index++) {
        await api(token,'start',index);
        await waitForTask(token, index);
        assert.equal((await api(token,'complete',index)).status,200);
      }
      assert.deepEqual(await (await api(token,'code')).json(),{url});
      assert.match(await (await request(`/robloxploit-slimexdev/scripts/${id}/edit`)).text(), /PRIVATE_SCRIPT_LINK/);
    });
    await t.test('per-post tasks persist and override shared tasks until reset', async () => {
      const tasks = [{type:'custom',label:'Post-specific destination',url:'https://example.com/post-only'}];
      const previousDefaults = (await query('SELECT tasks_json FROM settings WHERE id=1'))[0].tasks_json;
      const save = async (mode, defaults = false) => {
        const body = new FormData();
        for (const [key,value] of Object.entries({title:'Updated title',game:'QA Game',description:'Updated description',code:'UPDATED_SECRET',published:'1',tasks_mode:mode,tasks_json:JSON.stringify(tasks)})) body.set(key,value);
        if (defaults) body.set('save_task_defaults','1');
        return request(`/robloxploit-slimexdev/scripts/${id}/edit?_csrf=${csrf}`,{method:'POST',body});
      };
      assert.equal((await save('custom')).status,303);
      const detail = await(await request(`/script/${id}`)).text();
      assert.match(detail,/Post-specific destination/);
      assert.equal((detail.match(/data-task=/g)||[]).length,1);
      assert.match(await(await request(`/robloxploit-slimexdev/scripts/${id}/edit`)).text(),/Post-specific destination/);
      assert.equal((await save('custom', true)).status,303);
      assert.deepEqual(JSON.parse((await query('SELECT tasks_json FROM settings WHERE id=1'))[0].tasks_json),tasks);
      assert.match(await(await request('/robloxploit-slimexdev/new')).text(),/Post-specific destination/);
      assert.equal((await save('global')).status,303);
      assert.equal((await query('SELECT tasks_json FROM scripts WHERE id=?',[id]))[0].tasks_json,null);
      await query('UPDATE settings SET tasks_json=? WHERE id=1',[previousDefaults]);
    });
    await t.test('edit retains image; settings split tasks and validate URLs', async () => {
      const body = new FormData();
      for (const [key, value] of Object.entries({ title: 'Updated title', game: 'QA Game', description: 'Updated description', code: 'UPDATED_SECRET', published: '1' })) body.set(key, value);
      assert.equal((await request(`/robloxploit-slimexdev/scripts/${id}/edit?_csrf=${csrf}`, { method: 'POST', body })).status, 303);
      const [row] = await query('SELECT * FROM scripts WHERE id=?', [id]);
      assert.equal(row.code, 'UPDATED_SECRET'); assert.equal(row.image, imagePath);
      assert.equal((await request('/robloxploit-slimexdev/settings', form({ channel_url: 'https://evil.test', video_url: 'https://youtu.be/test', mode: 'split', wait_seconds: '7' }))).status, 422);
      assert.equal((await request('/robloxploit-slimexdev/settings', form({ channel_url: 'https://www.youtube.com/@test', video_url: 'https://youtu.be/test', mode: 'split', wait_seconds: '7' }))).status, 303);
      const detail = await (await request(`/script/${id}`)).text();
      assert.equal((detail.match(/data-task=/g) || []).length, 4);
      assert.equal((await query('SELECT wait_seconds FROM settings WHERE id=1'))[0].wait_seconds, 7);
      const token = detail.match(/data-token="([^"]+)"/)[1];
      await request(`/robloxploit-slimexdev/scripts/${id}/visibility`, form({}));
      assert.equal((await api(token, 'start', 0)).status, 404);
    });
    await request(`/robloxploit-slimexdev/scripts/${id}/visibility`, form({}));
    await t.test('custom tasks and sandboxed ads are configurable only by admin', async () => {
      const tasks = [{type:'subscribe',label:'Channel One',url:'https://youtube.com/@one'}, {type:'subscribe',label:'Channel Two',url:'https://youtube.com/@two'}, {type:'custom',label:'Our website',url:'https://example.com/'}];
      assert.equal((await request('/robloxploit-slimexdev/settings')).status, 200);
      assert.equal((await request('/robloxploit-slimexdev/settings', form({ tasks_json:JSON.stringify(tasks), wait_seconds:'1' }))).status,303);
      const detail = await (await request(`/script/${id}`)).text();
      assert.match(detail,/Channel One/); assert.match(detail,/Channel Two/);
      assert.equal((detail.match(/data-task=/g)||[]).length,3);
      assert.equal((await request('/robloxploit-slimexdev/ads')).status,200);
      const adCode='<script>console.log("AD_ONLY_IN_FRAME")</script>';
      assert.equal((await request('/robloxploit-slimexdev/ads',form({_csrf:'invalid',banner_html:adCode,banner_enabled:'1'}))).status,403);
      assert.equal((await request('/robloxploit-slimexdev/ads',form({banner_html:adCode,banner_enabled:'1',popup_html:'<p>POPUP_AD</p>',popup_enabled:'1'}))).status,303);
      const home=await(await request('/')).text();
      assert.match(home,/src="\/ads\/content\/banner"/); assert.match(home,/id="ad-popup"/); assert.doesNotMatch(home,/AD_ONLY_IN_FRAME/);
      assert.doesNotMatch(await(await request('/robloxploit-slimexdev/ads')).text(),/id="ad-popup"/);
      const ad=await fetch(origin+'/ads/content/banner'); assert.equal(ad.status,200);
      assert.match(ad.headers.get('content-security-policy'),/sandbox allow-scripts allow-popups/);
      assert.doesNotMatch(ad.headers.get('content-security-policy'),/allow-same-origin/);
      assert.match(await ad.text(),/AD_ONLY_IN_FRAME/);
      assert.equal((await request('/ads/content/unknown')).status,404);
      assert.equal((await request('/robloxploit-slimexdev/ads',form({}))).status,303);
      assert.equal((await request('/ads/content/banner')).status,404);
      assert.doesNotMatch(await(await request('/')).text(),/id="ad-popup"|src="\/ads\/content\/banner"/);
    });
    await t.test('delete removes database record and owned image', async () => {
      assert.equal((await request(`/robloxploit-slimexdev/scripts/${id}/delete`, form({}))).status, 303);
      assert.equal((await query('SELECT * FROM scripts WHERE id=?', [id])).length, 0);
      await assert.rejects(readFile(`.${imagePath}`), { code: 'ENOENT' });
      await request('/robloxploit-slimexdev/logout', form({}));
      assert.equal((await request('/robloxploit-slimexdev/settings')).status, 303);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.end();
    if (!/^robloxploit_test_\d+$/.test(databaseName)) throw new Error('Unsafe cleanup target');
    await root.query(`REVOKE ALL PRIVILEGES ON \`${databaseName}\`.* FROM 'robloxploit'@'127.0.0.1'`);
    await root.query(`DROP DATABASE \`${databaseName}\``);
    await root.end();
  }
});
