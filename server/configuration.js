export const taskTypes = {
  subscribe: { label: 'Subscribe to channel', hint: 'Visit the channel and subscribe.', icon: 'user' },
  watch: { label: 'Watch video', hint: 'Open the video and watch the content.', icon: 'play' },
  like: { label: 'Like video', hint: 'Give the video a like.', icon: 'heart' },
  comment: { label: 'Comment on video', hint: 'Leave a comment below the video.', icon: 'message' },
  like_comment: { label: 'Like & comment', hint: 'Like the video and leave a comment.', icon: 'heart' },
  custom: { label: 'Open link', hint: 'Visit the link to complete this task.', icon: 'external' },
};

export function parseTasks(value) {
  let tasks;
  try { tasks = JSON.parse(value); } catch { throw new Error('Invalid task list.'); }
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 20) throw new Error('Add between 1 and 20 tasks.');
  return tasks.map(task => {
    if (!task || !Object.hasOwn(taskTypes, task.type)) throw new Error('Choose a valid task type.');
    let url;
    try { url = new URL(task.url); } catch { throw new Error('Every task needs a valid HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2000) throw new Error('Use HTTPS task URLs without login credentials or custom ports.');
    if (task.type !== 'custom' && !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('YouTube tasks need a YouTube URL. Choose Open link for other websites.');
    if (typeof task.label !== 'string' || task.label.length > 100) throw new Error('Task labels must be 100 characters or fewer.');
    return { type: task.type, label: task.label.trim() || taskTypes[task.type].label, url: url.href };
  });
}

export function parseAds(body) {
  const ads = {};
  for (const slot of ['banner', 'popup']) {
    const html = body[`${slot}_html`] ?? '';
    if (typeof html !== 'string' || html.length > 50000) throw new Error('Ad code must be 50,000 characters or fewer per placement.');
    const enabled = body[`${slot}_enabled`] === '1';
    if (enabled && !html.trim()) throw new Error('Add ad code before enabling a placement.');
    ads[slot] = { enabled, html: html.trim() };
  }
  return ads;
}
