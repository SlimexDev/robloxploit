import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';

test('analytics loads on deployed public pages and excludes local and admin visits', async () => {
  const locals = { title: 'Test', csrf: '', path: '/code/1', ads: {}, analyticsEnabled: true };
  const render = extra => ejs.renderFile('views/partials/head.ejs', { ...locals, ...extra });
  assert.match(await render({}), /src="\/_vercel\/insights\/script\.js"/);
  assert.doesNotMatch(await render({ analyticsEnabled: false }), /insights\/script/);
  assert.doesNotMatch(await render({ path: '/robloxploit-slimexdev/login' }), /insights\/script/);
});
