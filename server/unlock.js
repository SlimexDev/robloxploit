import { randomBytes } from 'node:crypto';

export function taskList(settings) {
  const tasks = [
    { label: 'Subscribe to channel', hint: 'Visit our channel and subscribe to support us.', url: settings.channel_url, icon: 'user' },
    { label: 'Watch video', hint: 'Open the video and explore the content.', url: settings.video_url, icon: 'play' },
  ];
  if (settings.combined) tasks.push({ label: 'Like & comment', hint: 'Like the video and leave a comment.', url: settings.video_url, icon: 'heart' });
  else tasks.push(
    { label: 'Like video', hint: 'Give the video a like to show your support.', url: settings.video_url, icon: 'heart' },
    { label: 'Comment on video', hint: 'Share your thoughts below the video.', url: settings.video_url, icon: 'message' },
  );
  return tasks;
}

export function createAttempt(scriptId, settings, now = Date.now()) {
  return { token: randomBytes(24).toString('hex'), scriptId, tasks: taskList(settings), wait: settings.wait_seconds * 1000, next: 0, startedAt: null, expiresAt: now + 30 * 60_000, done: false };
}

function validate(attempt, index, now) {
  if (!attempt || now >= attempt.expiresAt) throw new Error('This unlock session has expired. Please reload the page.');
  if (!Number.isInteger(index) || index !== attempt.next || attempt.done) throw new Error('Please complete the tasks in order.');
}

export function startStep(attempt, index, now = Date.now()) {
  validate(attempt, index, now);
  attempt.startedAt ??= now;
  return { url: attempt.tasks[index].url, remainingMs: Math.max(0, attempt.startedAt + attempt.wait - now) };
}

export function completeStep(attempt, index, now = Date.now()) {
  validate(attempt, index, now);
  if (attempt.startedAt === null) throw new Error('You have not started this task.');
  if (now < attempt.startedAt + attempt.wait) throw new Error('Please wait for the task timer to finish.');
  attempt.next += 1;
  attempt.startedAt = null;
  attempt.done = attempt.next === attempt.tasks.length;
  return attempt.done;
}
