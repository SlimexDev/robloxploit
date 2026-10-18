import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttempt, startStep, completeStep, taskList } from '../server/unlock.js';

const settings = { channel_url: 'https://www.youtube.com/@demo', video_url: 'https://www.youtube.com/watch?v=demo', combined: true, wait_seconds: 7 };
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
  completeStep(attempt, 1, 15000);
  startStep(attempt, 2, 15000);
  completeStep(attempt, 2, 22000);
  assert.equal(attempt.done, true);
});
test('new visit is locked and attempts expire', () => {
  const attempt = createAttempt(1, settings, 1000);
  assert.equal(attempt.done, false);
  assert.throws(() => startStep(attempt, 0, 1000 + 31 * 60_000), /expired/);
});
