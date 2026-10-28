import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server/app.js';
import { db } from '../server/db.js';

test('malformed and oversized bodies retain client error status and response format', async t => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    for (const [path, type, body, status, format] of [
      ['/api/unlock/1/start', 'application/json', 'null', 400, 'application/json'],
      ['/robloxploit-slimexdev/login', 'application/json', 'null', 400, 'text/html'],
      ['/', 'application/x-www-form-urlencoded', 'code=' + 'a'.repeat(500000), 413, 'text/html'],
    ]) await t.test(`${status} ${path}`, async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: 'POST', headers: { 'Content-Type': type }, body,
      });
      assert.equal(response.status, status);
      assert.ok(response.headers.get('content-type').startsWith(format));
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.end();
  }
});
