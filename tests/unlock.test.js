import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt, startStep, completeStep, recordPlayback, taskList } from '../server/unlock.js';
import { youtubeVideoId, parseTasks } from '../server/configuration.js';

const settings = { channel_url: 'https://www.youtube.com/@demo', video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE', combined: true, wait_seconds: 7 };
test('tasks can be combined or split', () => {
  assert.equal(taskList(settings).length, 3);
  assert.equal(taskList({ ...settings, combined: false }).length, 4);
});
test('server prevents skipping, early completion, replay and code before final step', () => {
  const attempt = createAttempt(1, settings, 1000);
  assert.throws(() => startStep(attempt, 1, 1000), /in order/);
  assert.throws(() => completeStep(attempt, 0, 9000), /started/);
  startStep(attempt, 0, 1000);
  assert.throws(() => completeStep(attempt, 0, 7999), /wait/);
  completeStep(attempt, 0, 8000);
  assert.equal(attempt.done, false);
  assert.throws(() => completeStep(attempt, 0, 8000), /in order/);
  startStep(attempt, 1, 8000);
  recordPlayback(attempt, 1, true, 8000);
  for (let time = 9000; time <= 48000; time += 1000) recordPlayback(attempt, 1, true, time);
  completeStep(attempt, 1, 48000);
  startStep(attempt, 2, 48000);
  completeStep(attempt, 2, 55000);
  assert.equal(attempt.done, true);
});

test('embedded videos require 40 seconds of playback; pauses and stale heartbeats earn no time', () => {
  const attempt = createAttempt(1, { ...settings, tasks: [{ type: 'watch', label: 'Watch', url: settings.video_url }] }, 0);
  assert.throws(() => recordPlayback(attempt, 0, true, 0), /Invalid/);
  assert.equal(startStep(attempt, 0, 0).remainingMs, 40000);
  assert.throws(() => recordPlayback(attempt, 0, 'true', 0), /Invalid/);
  recordPlayback(attempt, 0, true, 0);
  for (let time = 1000; time <= 10000; time += 1000) recordPlayback(attempt, 0, true, time);
  assert.equal(recordPlayback(attempt, 0, false, 10000).remainingMs, 30000);
  assert.equal(recordPlayback(attempt, 0, false, 90000).remainingMs, 30000);
  assert.throws(() => completeStep(attempt, 0, 90000), /40 seconds/);
  recordPlayback(attempt, 0, true, 90000);
  assert.equal(recordPlayback(attempt, 0, true, 100000).remainingMs, 30000);
  for (let i = 0; i < 10; i++) recordPlayback(attempt, 0, true, 100000);
  assert.equal(startStep(attempt, 0, 100000).remainingMs, 30000);
  for (let time = 101000; time < 130000; time += 1000) recordPlayback(attempt, 0, true, time);
  assert.throws(() => completeStep(attempt, 0, 129999), /40 seconds/);
  assert.equal(recordPlayback(attempt, 0, true, 130000).remainingMs, 0);
  assert.equal(completeStep(attempt, 0, 130000), true);
  assert.equal(attempt.watchedMs, 0);
});

test('only direct YouTube video URLs can become embedded watch tasks', () => {
  for (const url of ['https://youtu.be/M7lc1UVf-VE?t=3', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&feature=share', 'https://m.youtube.com/shorts/M7lc1UVf-VE', 'https://youtube.com/live/M7lc1UVf-VE', 'https://youtube.com/embed/M7lc1UVf-VE']) assert.equal(youtubeVideoId(url), 'M7lc1UVf-VE');
  for (const url of ['https://youtube.com/@channel', 'https://youtube.com/watch?v=bad', 'https://evil.test/watch?v=M7lc1UVf-VE', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'http://youtu.be/M7lc1UVf-VE', 'https://user@youtube.com/watch?v=M7lc1UVf-VE']) {
    assert.equal(youtubeVideoId(url), null);
    assert.throws(() => parseTasks(JSON.stringify([{ type: 'watch', label: 'Watch', url }])));
  }
  const attempt = createAttempt(1, { ...settings, video_url: 'https://youtube.com/@channel' }, 0);
  startStep(attempt, 0, 0);
  completeStep(attempt, 0, 7000);
  assert.throws(() => startStep(attempt, 1, 7000), /cannot be embedded/);
});
test('new visit is locked and attempts expire', () => {
  const attempt = createAttempt(1, settings, 1000);
  assert.equal(attempt.done, false);
  assert.throws(() => startStep(attempt, 0, 1000 + 31 * 60_000), /expired/);
});
