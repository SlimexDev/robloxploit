import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server/app.js';
import { db } from '../server/db.js';

test('YouTube resources receive a referrer-compatible document policy', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/assets/unlock.js`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.end();
  }
});
