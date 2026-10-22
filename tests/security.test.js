import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, parseSettings, parseScript } from '../server/security.js';
import { saveImage, removeImage } from '../server/images.js';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

test('password hashes are salted and verified', async () => {
  const first = await hashPassword('a long password');
  assert.notEqual(first, await hashPassword('a long password'));
  assert.equal(await verifyPassword('a long password', first), true);
  assert.equal(await verifyPassword('wrong', first), false);
});
test('task URL validation rejects foreign domains, credentials and invalid timers', () => {
  const valid = { channel_url: 'https://www.youtube.com/@test', video_url: 'https://youtu.be/test', mode: 'combined', wait_seconds: '7' };
  assert.equal(parseSettings(valid).wait_seconds, 7);
  for (const channel_url of ['javascript:alert(1)', 'https://youtube.com.evil.test/', 'http://youtube.com/', 'https://user@youtube.com/', 'https://youtube.com:444/']) {
    assert.throws(() => parseSettings({ ...valid, channel_url }));
  }
  for (const wait_seconds of ['0', '121', '7.1', 'NaN']) assert.throws(() => parseSettings({ ...valid, wait_seconds }));
});
test('script validation requires every field and limits code size', () => {
  const valid = { title: 'Example', game: 'Roblox', description: 'Description', code: 'print(1)', published: '1' };
  assert.equal(parseScript(valid).published, 1);
  assert.throws(() => parseScript({ ...valid, code: '' }));
  assert.throws(() => parseScript({ ...valid, code: 'a'.repeat(300001) }));
});
test('uploads verify contents, convert to WebP and resize', async () => {
  await assert.rejects(saveImage({ buffer: Buffer.from('<script>not an image</script>') }));
  const buffer = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#392255' } }).png().toBuffer();
  const image = await saveImage({ buffer });
  try {
    const converted = await readFile(`.${image}`);
    const meta = await sharp(converted).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.width, 1280);
    assert.ok(converted.length < buffer.length);
  } finally { await removeImage(image); }
});

test('script link mode validates URLs and excludes inactive content', () => {
 const base = {title:'Link',game:'Game',description:'Description',content_type:'link',script_url:'https://example.com/script',code:'unused'};
 assert.equal(parseScript(base).script_url, base.script_url);
 assert.equal(parseScript(base).code, '');
 for (const script_url of ['javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.com', 'invalid']) assert.throws(() => parseScript({...base,script_url}));
 assert.throws(() => parseScript({...base,content_type:'invalid'}));
 assert.equal(parseScript({...base,content_type:'code'}).script_url, null);
});

test('post task overrides validate custom tasks and support returning to shared tasks', () => {
 const post = { title: 'Post', game: 'Game', description: 'Description', code: 'print(1)' };
 const tasks = [{type:'custom', label:'Visit this post sponsor', url:'https://example.com/'}];
 assert.deepEqual(JSON.parse(parseScript({...post, tasks_mode:'custom', tasks_json:JSON.stringify(tasks)}).tasks_json), tasks);
 assert.equal(parseScript({...post, tasks_mode:'global', tasks_json:'invalid'}).tasks_json, null);
 assert.throws(()=>parseScript({...post, tasks_mode:'custom', tasks_json:'[]'}));
});
