import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeLua } from '../public/lua-highlight.js';

test('Lua highlighting preserves code and separates comments, strings, keywords and calls', () => {
  const source = '-- comment\r\nlocal x = "<script>alert(1)</script>"\n--[=[ local print("not code") ]=]\nlocal y = [==[true -- text]==]\nif true then print(0xff, 1.2e3, x) end';
  const tokens = tokenizeLua(source);
  assert.equal(tokens.map(token => token.text).join(''), source);
  assert.equal(tokens.find(token => token.text.startsWith('--[=[')).type, 'comment');
  assert.equal(tokens.find(token => token.text.startsWith('[==[')).type, 'string');
  assert.equal(tokens.find(token => token.text.includes('<script>')).type, 'string');
  for (const [text, type] of [['local', 'keyword'], ['true', 'literal'], ['print', 'builtin'], ['0xff', 'number'], ['1.2e3', 'number']]) assert.ok(tokens.some(token => token.text === text && token.type === type));
  assert.equal(tokenizeLua('--[==[ unfinished\nlocal x = 1')[0].type, 'comment');
  assert.equal(tokenizeLua('"escaped \\" quote"')[0].type, 'string');
  assert.equal(tokenizeLua('run()')[0].type, 'function');
  assert.deepEqual(tokenizeLua(''), []);
});
