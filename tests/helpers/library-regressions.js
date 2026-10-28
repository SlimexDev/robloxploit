import assert from 'node:assert/strict';
import sharp from 'sharp';

// Run the same SQL and HTTP assertions against each disposable database dialect.
export async function libraryRegressions(t, { query, request, form, csrf }) {
  const game = 'RegressionFixtures';
  const titles = ['RegressionFixture%marker', 'RegressionFixture_marker', 'RegressionFixture!marker', 'RegressionFixture\\marker',
    ...Array.from({ length: 27 }, (_, i) => `RegressionFixture${i}`), 'RegressionFixtureHidden'];
  try {
    for (const [index, title] of titles.entries()) await query(
      'INSERT INTO scripts (title,game,description,code,image,published) VALUES (?,?,?,?,?,?)',
      [title, game, 'Regression fixture', 'print(1)', '/assets/cover-placeholder.svg', index === 31 ? 0 : 1],
    );
    await t.test('admin status selector includes Published and filters both statuses', async () => {
      const published = await (await request('/robloxploit-slimexdev?q=RegressionFixture&status=published')).text();
      assert.match(published, /<option value="published" selected>Published<\/option>/);
      assert.doesNotMatch(published, /RegressionFixtureHidden/);
      const hidden = await (await request('/robloxploit-slimexdev?q=RegressionFixture&status=hidden')).text();
      assert.equal((hidden.match(/class="table-post"/g) || []).length, 1);
      assert.match(hidden, /RegressionFixtureHidden/);
    });
    for (const symbol of ['%', '_', '!', '\\']) await t.test(`literal search for ${symbol} in both libraries`, async () => {
      const search = encodeURIComponent('RegressionFixture' + symbol);
      for (const [path, card] of [['/', 'script-card'], ['/robloxploit-slimexdev', 'table-post']]) {
        const response = await request(`${path}?q=${search}`);
        assert.equal(response.status, 200);
        assert.equal(((await response.text()).match(new RegExp(`class="${card}"`, 'g')) || []).length, 1);
      }
    });
    await t.test('home and admin clamp oversized pages to the final matching page', async () => {
      const home = await (await request(`/?game=${game}&page=999`)).text();
      assert.match(home, /Page 3 \/ 3/);
      assert.equal((home.match(/class="script-card"/g) || []).length, 7);
      const admin = await (await request('/robloxploit-slimexdev?q=RegressionFixture&page=999')).text();
      assert.match(admin, /Page 2</);
      assert.equal((admin.match(/class="table-post"/g) || []).length, 2);
      for (const path of ['/', '/robloxploit-slimexdev']) {
        const empty = await (await request(`${path}?q=NoSuchRegressionFixture&page=999`)).text();
        assert.doesNotMatch(empty, /Page 999/);
      }
    });
    await t.test('multipart accepts valid Unicode code and separates field limits from image errors', async () => {
      const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'purple' } }).png().toBuffer();
      const upload = code => {
        const body = new FormData();
        for (const [key, value] of Object.entries({ title: 'Unicode regression', game, description: 'Description', code })) body.set(key, value);
        body.set('image', new Blob([image], { type: 'image/png' }), 'cover.png');
        return request(`/robloxploit-slimexdev/scripts?_csrf=${csrf}`, { method: 'POST', body });
      };
      const code = 'a'.repeat(100000) + 'ệ'.repeat(150000);
      assert.equal(code.length, 250000);
      assert.ok(Buffer.byteLength(code) > 400000);
      const created = await upload(code);
      assert.equal(created.status, 303);
      const [row] = await query('SELECT id,code FROM scripts WHERE title=?', ['Unicode regression']);
      assert.equal(row.code, code);
      await request(`/robloxploit-slimexdev/scripts/${row.id}/delete`, form({}));
      const invalid = await upload('a'.repeat(300001));
      assert.equal(invalid.status, 422);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /code field is invalid or too long/);
      assert.match(invalidHtml, /<title>Add script/);
      const oversized = await upload('ệ'.repeat(500000));
      assert.equal(oversized.status, 422);
      assert.match(await oversized.text(), /code.*too large/i);
    });
    await t.test('admin validation errors retain their page titles', async () => {
      const login = await request('/robloxploit-slimexdev/login', form({ username: 'nonexistent-regression-admin', password: 'wrong' }));
      assert.equal(login.status, 401);
      assert.match(await login.text(), /<title>Admin login/);
      const ads = await request('/robloxploit-slimexdev/ads', form({ banner_enabled: '1' }));
      assert.equal(ads.status, 422);
      assert.match(await ads.text(), /<title>Advertisements/);
    });
  } finally {
    await query('DELETE FROM scripts WHERE game=?', [game]);
  }
}
