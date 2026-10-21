export const taskTypes = {
  subscribe: { label: 'Subscribe to channel', hint: 'Visit the channel and subscribe.', icon: 'user' },
  watch: { label: 'Watch video', hint: 'Watch the embedded video for 40 seconds.', icon: 'play' },
  like: { label: 'Like video', hint: 'Give the video a like.', icon: 'heart' },
  comment: { label: 'Comment on video', hint: 'Leave a comment below the video.', icon: 'message' },
  like_comment: { label: 'Like & comment', hint: 'Like the video and leave a comment.', icon: 'heart' },
  custom: { label: 'Open link', hint: 'Visit the link to complete this task.', icon: 'external' },
};

export function youtubeVideoId(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1];
  }
  return /^[\w-]{11}$/.test(id || '') ? id : null;
}

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
    if (task.type === 'watch' && !youtubeVideoId(url.href)) throw new Error('Watch video tasks need a direct YouTube video link.');
    if (typeof task.label !== 'string' || task.label.length > 100) throw new Error('Task labels must be 100 characters or fewer.');
    return { type: task.type, label: task.label.trim() || taskTypes[task.type].label, url: url.href };
  });
}

export function adDraft(body) {
  return Object.fromEntries(['banner', 'bottom', 'left', 'right', 'popup'].map(slot => [slot, {
    enabled: body[`${slot}_enabled`] === '1',
    ...Object.fromEntries(['type', 'html', 'image', 'url', 'label'].map(key => [key, typeof body[`${slot}_${key}`] === 'string' ? body[`${slot}_${key}`] : '']))
  }]));
}

const escapeAd = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function adMarkup(ad) {
  if (!ad.type || ad.type === 'embed') return ad.html;
  const label = escapeAd(ad.label || 'Visit sponsor');
  const content = ad.type === 'image' ? `<img src="${escapeAd(ad.image)}" alt="${label}" style="max-width:100%;max-height:100vh;object-fit:contain">` : label;
  return `<a href="${escapeAd(ad.url)}" target="_blank" rel="noopener sponsored noreferrer" style="display:flex;align-items:center;justify-content:center;min-height:80px;color:white;background:#231b32;font:600 16px sans-serif;text-decoration:none">${content}</a>`;
}

export function parseAds(body) {
  for (const slot of ['banner', 'bottom', 'left', 'right', 'popup']) {
    for (const key of ['type', 'html', 'image', 'url', 'label']) {
      const value = body[`${slot}_${key}`];
      if (value !== undefined && typeof value !== 'string') throw new Error('Ad fields must contain text.');
    }
  }
  const ads = adDraft(body);
  for (const [slot, ad] of Object.entries(ads)) {
    const type = ad.type || 'embed';
    if (!['embed', 'image', 'link'].includes(type)) throw new Error('Choose a valid ad type.');
    if (ad.html.length > 50000 || ad.label.length > 120) throw new Error('Ad code: maximum 50,000 characters. Label: maximum 120 characters.');
    for (const key of ['url', 'image']) {
      ad[key] = ad[key].trim();
      if (ad[key]) {
        let url;
        try { url = new URL(ad[key]); } catch { throw new Error('Ad links and images need valid HTTPS URLs.'); }
        if (url.protocol !== 'https:' || url.username || url.password || ad[key].length > 2000) throw new Error('Use HTTPS ad URLs without credentials (maximum 2,000 characters).');
      }
    }
    ad.html = ad.html.trim();
    if (ad.enabled && (type === 'embed' ? !ad.html : !ad.url || (type === 'image' && !ad.image))) throw new Error(`Complete the ${slot} content before enabling it.`);
    // Preserve the existing stored format when older clients submit embed-only ads.
    if (!body[`${slot}_type`]) ads[slot] = { enabled: ad.enabled, html: ad.html };
    else ad.type = type;
  }
  return ads;
}
