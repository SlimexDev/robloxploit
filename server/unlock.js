import { randomBytes } from 'node:crypto';
import { taskTypes, youtubeVideoId } from './configuration.js';

const watchDuration = 40_000;

export function taskList(settings) {
  const tasks = settings.tasks?.length ? settings.tasks.map(task => ({ ...taskTypes[task.type], ...task })) : [
    { type: 'subscribe', label: 'Subscribe to channel', hint: 'Visit our channel and subscribe to support us.', url: settings.channel_url, icon: 'user' },
    { type: 'watch', label: 'Watch video', hint: 'Watch the embedded video for 40 seconds.', url: settings.video_url, icon: 'play' },
  ];
  if (!settings.tasks?.length) {
    if (settings.combined) tasks.push({ type: 'like_comment', label: 'Like & comment', hint: 'Like the video and leave a comment.', url: settings.video_url, icon: 'heart' });
    else tasks.push(
      { type: 'like', label: 'Like video', hint: 'Give the video a like to show your support.', url: settings.video_url, icon: 'heart' },
      { type: 'comment', label: 'Comment on video', hint: 'Share your thoughts below the video.', url: settings.video_url, icon: 'message' },
    );
  }
  return tasks.map(task => task.type === 'watch' ? { ...task, videoId: youtubeVideoId(task.url) } : task);
}

export function createAttempt(scriptId, settings, now = Date.now()) {
  const tasks = taskList(settings), wait = settings.wait_seconds * 1000;
  return { token: randomBytes(24).toString('hex'), scriptId, tasks, wait, next: 0, startedAt: null, expiresAt: now + Math.max(30 * 60_000, tasks.length * wait + 5 * 60_000), done: false };
}

function validate(attempt, index, now) {
  if (!attempt || now >= attempt.expiresAt) throw new Error('This unlock session has expired. Please reload the page.');
  if (!Number.isInteger(index) || index !== attempt.next || attempt.done) throw new Error('Please complete the tasks in order.');
}

export function startStep(attempt, index, now = Date.now()) {
  validate(attempt, index, now);
  if (attempt.tasks[index].type === 'watch' && !attempt.tasks[index].videoId) throw new Error('This video link cannot be embedded. Please ask the admin to update it.');
  attempt.startedAt ??= now;
  return { url: attempt.tasks[index].url, remainingMs: attempt.tasks[index].type === 'watch' ? Math.max(0, watchDuration - (attempt.watchedMs || 0)) : Math.max(0, attempt.startedAt + attempt.wait - now) };
}

export function recordPlayback(attempt, index, playing, now = Date.now()) {
  validate(attempt, index, now);
  if (attempt.tasks[index].type !== 'watch' || attempt.startedAt === null || typeof playing !== 'boolean') throw new Error('Invalid video playback update.');
  const elapsed = now - (attempt.lastPlaybackAt ?? now);
  // Missed heartbeats must not earn watch time while the player is offline or closed.
  if (attempt.playing && elapsed >= 0 && elapsed <= 2500) attempt.watchedMs = Math.min(watchDuration, (attempt.watchedMs || 0) + elapsed);
  attempt.lastPlaybackAt = now;
  attempt.playing = playing;
  return { remainingMs: Math.max(0, watchDuration - (attempt.watchedMs || 0)) };
}

export function completeStep(attempt, index, now = Date.now()) {
  validate(attempt, index, now);
  if (attempt.startedAt === null) throw new Error('You have not started this task.');
  if (attempt.tasks[index].type === 'watch') {
    if ((attempt.watchedMs || 0) < watchDuration) throw new Error('Watch the video for 40 seconds before continuing.');
  } else if (now < attempt.startedAt + attempt.wait) throw new Error('Please wait for the task timer to finish.');
  attempt.next += 1;
  attempt.startedAt = null;
  attempt.watchedMs = 0;
  attempt.lastPlaybackAt = null;
  attempt.playing = false;
  attempt.done = attempt.next === attempt.tasks.length;
  return attempt.done;
}
