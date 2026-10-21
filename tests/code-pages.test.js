import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { parseCodePage } from '../server/code-pages.js';

test('code pages validate inputs and preserve the original code', () => {
  const code = '  print("hello")\r\n';
  assert.deepEqual(parseCodePage({ title: ' Script ', code, published: '1' }), { title: 'Script', code, published: 1 });
  for (const body of [{ title: '', code }, { title: 'x'.repeat(161), code }, { title: 'Script', code: '  ' }, { title: 'Script', code: 'x'.repeat(300001) }, { title: {}, code }]) assert.throws(() => parseCodePage(body));
  assert.equal(parseCodePage({ title: 'Hidden', code }).published, 0);
});

test('public code is escaped rather than executed and has separate raw/download links', async () => {
  const html = await ejs.renderFile('views/code-page.ejs', { title: 'Code', csrf: '', path: '/code/1', ads: {}, date: () => 'Today', page: { id: 1, title: '<script>TITLE</script>', code: '</code><script>ATTACK</script>', updated_at: new Date() }, lines: 1, bytes: 35 });
  assert.match(html, /&lt;script&gt;TITLE/);
  assert.match(html, /&lt;\/code&gt;&lt;script&gt;ATTACK/);
  assert.doesNotMatch(html, /<script>ATTACK/);
  assert.match(html, /href="\/code\/1\/raw"/);
  assert.match(html, /href="\/code\/1\/download"/);
});
