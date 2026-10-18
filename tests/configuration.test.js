import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTasks, parseAds } from '../server/configuration.js';
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
