import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

// shortcut: sessions are local to one process; use a shared store before running multiple instances.
export function sessions() {
  const store = new Map();
  const cleanup = setInterval(() => {
    for (const [id, session] of store) if (session.expiresAt < Date.now()) store.delete(id);
  }, 60_000);
  cleanup.unref();
  return (req, res, next) => {
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('rx_session='));
    let id = cookie?.slice(11);
    let session = store.get(id);
    if (!session || session.expiresAt < Date.now()) {
      if (store.size >= 10000) return res.status(503).send('The server is busy. Please try again.');
      id = randomBytes(32).toString('hex');
      session = { csrf: randomBytes(32).toString('hex'), expiresAt: Date.now() + 8 * 3600_000, attempts: new Map() };
      store.set(id, session);
      res.cookie('rx_session', id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600_000, path: '/' });
    }
    req.session = session;
    req.rotateSession = () => {
      store.delete(id);
      id = randomBytes(32).toString('hex');
      session.csrf = randomBytes(32).toString('hex');
      store.set(id, session);
      res.cookie('rx_session', id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600_000, path: '/' });
    };
    req.destroySession = () => { store.delete(id); res.clearCookie('rx_session', { path: '/' }); };
    res.locals.csrf = session.csrf;
    res.locals.isAdmin = Boolean(session.admin);
    next();
  };
}

export function csrfGuard(req, res, next) {
  const token = req.headers['x-csrf-token'] || req.body?._csrf || req.query._csrf;
  if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(req.session.csrf) || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) {
    return res.status(403).send('Invalid session. Please reload the page and try again.');
  }
  next();
}

export function adminOnly(req, res, next) {
  if (!req.session.admin) return res.redirect(303, '/robloxploit-slimexdev/login');
  next();
}

export function parseScript(body) {
  const result = {};
  for (const [key, max] of Object.entries({ title: 160, game: 100, description: 10000 })) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > max) throw new Error(`The ${key} field is invalid or too long.`);
    result[key] = body[key].trim();
  }
  const mode = body.content_type ?? 'code';
  if (!['code', 'link'].includes(mode)) throw new Error('Invalid script type.');
  result.script_url = null;
  result.code = '';
  if (mode === 'link') {
    let url;
    try { url = new URL(body.script_url); } catch { throw new Error('Please enter a valid script URL.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.href.length > 2000) throw new Error('Use an HTTP or HTTPS URL without login credentials.');
    result.script_url = url.href;
  } else {
    if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > 300000) throw new Error('The code field is invalid or too long.');
    result.code = body.code.trim();
  }
  result.published = body.published === '1' ? 1 : 0;
  return result;
}

export function parseSettings(body) {
  const result = {};
  for (const key of ['channel_url', 'video_url']) {
    let url;
    try { url = new URL(body[key]); } catch { throw new Error('Please enter a valid YouTube URL.'); }
    if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname) || url.username || url.password || url.port || url.href.length > 500) throw new Error('Only HTTPS YouTube URLs are accepted.');
    result[key] = url.href;
  }
  result.wait_seconds = Number(body.wait_seconds);
  if (!Number.isInteger(result.wait_seconds) || result.wait_seconds < 1 || result.wait_seconds > 120) throw new Error('Wait time must be between 1 and 120 seconds.');
  if (!['combined', 'split'].includes(body.mode)) throw new Error('Invalid task mode.');
  result.combined = body.mode === 'combined' ? 1 : 0;
  return result;
}
