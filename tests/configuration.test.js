import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTasks, parseAds, adMarkup } from '../server/configuration.js';
import { parseSettings } from '../server/security.js';
import { taskList, createAttempt, startStep, completeStep } from '../server/unlock.js';

test('repeated task types and custom links retain order and gate script access', () => {
  const tasks = [
    { type: 'subscribe', label: 'First channel', url: 'https://youtube.com/@one' },
    { type: 'subscribe', label: 'Second channel', url: 'https://youtube.com/@two' },
    { type: 'custom', label: 'Visit our site', url: 'https://example.com/' },
  ];
  const settings = parseSettings({ tasks_json: JSON.stringify(tasks), wait_seconds: '7' });
  assert.deepEqual(taskList(settings).map(task => task.url), tasks.map(task => task.url));
  const attempt = createAttempt(1, settings, 1000);
  assert.throws(() => startStep(attempt, 1, 1000), /in order/);
  tasks.forEach((task, index) => {
    const time = 1000 + index * 7000;
    assert.equal(startStep(attempt, index, time).url, task.url);
    assert.throws(() => completeStep(attempt, index, time + 6999), /wait/);
    assert.equal(completeStep(attempt, index, time + 7000), index === 2);
  });
});

test('task validation rejects unsafe destinations, invalid types and empty lists', () => {
  const task = { type: 'subscribe', label: 'Channel', url: 'https://youtube.com/@one' };
  for (const value of ['invalid', '{}', '[]', JSON.stringify(Array(21).fill(task))]) assert.throws(() => parseTasks(value));
  for (const url of ['javascript:alert(1)', 'https://youtube.com.evil.test/', 'https://user@youtube.com/', 'http://youtube.com/']) assert.throws(() => parseTasks(JSON.stringify([{ ...task, url }])));
  assert.throws(() => parseTasks(JSON.stringify([{ ...task, type: '__proto__' }])));
  assert.equal(parseTasks(JSON.stringify([{ ...task, type: 'custom', url: 'https://example.com/' }])).length, 1);
  const longAttempt = createAttempt(1, { tasks: Array(20).fill(task), wait_seconds: 120 }, 0);
  assert.ok(longAttempt.expiresAt > 20 * 120000);
});

test('ads are disabled by default and enabled placements require bounded content', () => {
  assert.deepEqual(parseAds({}).banner, { enabled: false, html: '' });
  assert.throws(() => parseAds({ banner_enabled: '1' }));
  assert.throws(() => parseAds({ banner_html: 'x'.repeat(50001) }));
  assert.equal(parseAds({ popup_enabled: '1', popup_html: '<p>Ad</p>' }).popup.enabled, true);
});

test('ad types validate destinations and escape generated markup', () => {
  const body = { banner_type: 'image', banner_enabled: '1', banner_image: 'https://example.com/ad.webp', banner_url: 'https://example.com/', banner_label: '<Sponsor>' };
  const ad = parseAds(body).banner;
  assert.match(adMarkup(ad), /&lt;Sponsor&gt;/);
  assert.match(adMarkup(ad), /rel="noopener sponsored noreferrer"/);
  assert.throws(() => parseAds({ ...body, banner_url: 'javascript:alert(1)' }));
  assert.throws(() => parseAds({ ...body, banner_image: '' }));
  assert.throws(() => parseAds({ ...body, banner_type: 'unknown' }));
  assert.equal(parseAds({ ...body, banner_enabled: '' }).banner.image, body.banner_image);
  assert.match(adMarkup(parseAds({ ...body, banner_type: 'link' }).banner), /&lt;Sponsor&gt;<\/a>/);
});

test('all placements save independently and validate enabled side ads', () => {
  const ads = parseAds({
    banner_type: 'embed', banner_html: '<p>top</p>', banner_enabled: '1',
    bottom_type: 'link', bottom_url: 'https://example.com/bottom', bottom_enabled: '1',
    left_type: 'image', left_url: 'https://example.com/left', left_image: 'https://example.com/left.webp', left_enabled: '1',
    right_type: 'embed', right_html: '<p>right</p>', right_enabled: '1'
  });
  assert.deepEqual(Object.keys(ads), ['banner', 'bottom', 'left', 'right', 'popup']);
  assert.equal(ads.left.type, 'image');
  assert.equal(ads.bottom.url, 'https://example.com/bottom');
  assert.equal(ads.right.enabled, true);
  assert.throws(() => parseAds({ left_enabled: '1', left_type: 'image', left_url: 'https://example.com/' }), /left/);
});
