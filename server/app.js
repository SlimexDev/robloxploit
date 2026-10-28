import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import { query, publicColumns, getSettings, postgres } from './db.js';
import { sessions, csrfGuard, adminOnly, verifyPassword, parseScript, parseSettings } from './security.js';
import { createAttempt, startStep, completeStep, recordPlayback, taskList } from './unlock.js';
import { taskTypes, parseAds, adDraft, adMarkup } from './configuration.js';
import { databaseSessions, DatabaseRateStore } from './cloud-state.js';
import { saveImage, removeImage, uploadDir } from './images.js';
import { codePages, adminCodePages } from './code-pages.js';

export const app = express();
app.disable('x-powered-by');
app.locals.analyticsEnabled = Boolean(process.env.VERCEL);
if (process.env.VERCEL || process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.resolve('views'));
app.use(helmet({ referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, contentSecurityPolicy: { directives: { 'script-src': ["'self'", 'https://www.youtube.com'], 'frame-src': ["'self'", 'https://www.youtube-nocookie.com'], 'style-src': ["'self'"], 'img-src': ["'self'", 'blob:', ...(process.env.SUPABASE_URL ? [new URL(process.env.SUPABASE_URL).origin] : [])], 'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null } } }));
app.use('/assets', express.static(path.resolve('public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', immutable: true, index: false }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.csrf = '';
  res.locals.isAdmin = false;
  res.locals.path = req.path;
  res.locals.title = 'RobloXploit — Discover Roblox Scripts';
  res.locals.error = null;
  res.locals.notice = null;
  res.locals.ads = {};
  res.locals.date = value => new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  next();
});
app.use(rateLimit({ ...(postgres ? { store: new DatabaseRateStore('global:') } : {}), windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false, message: 'Too many requests. Please try again in a minute.' }));
app.use(express.urlencoded({ extended: false, limit: '400kb' }));
app.use(express.json({ limit: '16kb' }));

app.use(postgres ? databaseSessions() : sessions());
app.use('/code', codePages);
app.use('/robloxploit-slimexdev/code', adminOnly, adminCodePages);

app.get('/ads/content/:slot', async (req, res) => {
  if (!['banner', 'bottom', 'left', 'right', 'popup'].includes(req.params.slot)) return res.sendStatus(404);
  const ad = (await getSettings()).ads[req.params.slot];
  if (!ad?.enabled || !adMarkup(ad)) return res.sendStatus(404);
  // Ad scripts run in an opaque sandbox and cannot read application cookies or the parent page.
  res.set('Content-Security-Policy', "default-src https: data: blob:; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline'; frame-src https:; connect-src https:; object-src 'none'; base-uri 'none'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox");
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Advertisement</title></head><body style="margin:0">${adMarkup(ad)}</body></html>`);
});

const numericId = (req, res, next) => /^\d{1,10}$/.test(req.params.id) ? next() : res.status(404).render('error', { message: 'This script could not be found.' });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 12, fieldSize: 1200000 }, fileFilter: (req, file, cb) => cb(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE'), true) }).single('image');
const likePattern = value => `%${value.replace(/[!%_]/g, '!$&')}%`;

app.get('/', async (req, res) => {
  res.locals.ads = (await getSettings()).ads;
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const game = typeof req.query.game === 'string' ? req.query.game.slice(0, 100) : '';
  let page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const where = ['published = 1'];
  const params = [];
  if (search) { where.push("(title LIKE ? ESCAPE '!' OR game LIKE ? ESCAPE '!')"); params.push(likePattern(search), likePattern(search)); }
  if (game) { where.push('game = ?'); params.push(game); }
  const count = await query(`SELECT COUNT(*) AS count FROM scripts WHERE ${where.join(' AND ')}`, params);
  page = Math.min(page, Math.max(1, Math.ceil(count[0].count / 12)));
  const scripts = await query(`SELECT ${publicColumns} FROM scripts WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 12 OFFSET ${(page - 1) * 12}`, params);
  const games = await query('SELECT game, COUNT(*) AS count FROM scripts WHERE published = 1 GROUP BY game ORDER BY count DESC, game');
  res.render('home', { scripts, games, search, game, page, total: count[0].count, pageUrl: number => `/?${new URLSearchParams({ q: search, game, page: number })}` });
});

app.get('/script/:id', numericId, async (req, res) => {
  const [script] = await query(`SELECT ${publicColumns}, tasks_json FROM scripts WHERE id = ? AND published = 1`, [req.params.id]);
  if (!script) return res.status(404).render('error', { message: 'This script does not exist or is hidden.' });
  const settings = await getSettings();
  if (script.tasks_json) settings.tasks = JSON.parse(script.tasks_json);
  res.locals.ads = settings.ads;
  const configured = taskList(settings).length > 0 && taskList(settings).every(task => Boolean(task.url));
  // A fresh token per document means reload/back navigation never reuses an unlocked visit.
  for (const [token, attempt] of req.session.attempts) {
    if (attempt.scriptId === script.id || attempt.expiresAt <= Date.now()) req.session.attempts.delete(token);
  }
  if (req.session.attempts.size >= 20) req.session.attempts.delete(req.session.attempts.keys().next().value);
  const attempt = createAttempt(script.id, settings);
  req.session.attempts.set(attempt.token, attempt);
  res.render('detail', { title: `${script.title} — RobloXploit`, script, attempt, configured });
});

app.post('/api/unlock/:token/:action', csrfGuard, async (req, res) => {
  const attempt = req.session.attempts.get(req.params.token);
  if (!attempt || attempt.expiresAt <= Date.now()) return res.status(410).json({ error: 'This unlock session has expired. Please reload the page.' });
  const [script] = await query('SELECT id FROM scripts WHERE id = ? AND published = 1', [attempt.scriptId]);
  if (!script) return res.status(404).json({ error: 'This script is no longer published.' });
  if (!attempt.tasks.every(t => t.url)) return res.status(409).json({ error: 'The admin has not configured task links yet.' });
  try {
    if (req.params.action === 'start') return res.json(startStep(attempt, req.body.index));
    if (req.params.action === 'playback') return res.json(recordPlayback(attempt, req.body.index, req.body.playing));
    if (req.params.action === 'complete') return res.json({ done: completeStep(attempt, req.body.index), next: attempt.next });
    if (req.params.action === 'code') {
      if (!attempt.done) return res.status(403).json({ error: 'Please complete all tasks first.' });
      const [row] = await query('SELECT code, script_url FROM scripts WHERE id = ? AND published = 1', [attempt.scriptId]);
      if (!row) return res.status(404).json({ error: 'This script is no longer published.' });
      return res.json(row.script_url ? { url: row.script_url } : { code: row.code });
    }
    return res.status(404).json({ error: 'Action not found.' });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/robloxploit-slimexdev/login', (req, res) => req.session.admin ? res.redirect('/robloxploit-slimexdev') : res.render('login', { title: 'Admin login — RobloXploit' }));
const loginLimit = rateLimit({ ...(postgres ? { store: new DatabaseRateStore('login:') } : {}), windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true, message: 'Too many sign-in attempts. Please try again in 15 minutes.' });
app.post('/robloxploit-slimexdev/login', loginLimit, csrfGuard, async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== 'string' || username.length > 80 || typeof password !== 'string' || password.length > 256) return res.status(400).render('login', { title: 'Admin login — RobloXploit', error: 'Invalid sign-in details.' });
  const [admin] = await query('SELECT id, password_hash FROM admins WHERE username = ?', [username]);
  if (!admin || !await verifyPassword(password, admin.password_hash)) return res.status(401).render('login', { title: 'Admin login — RobloXploit', error: 'Incorrect username or password.' });
  req.rotateSession();
  req.session.admin = admin.id;
  res.redirect(303, '/robloxploit-slimexdev');
});
app.post('/robloxploit-slimexdev/logout', csrfGuard, (req, res) => { req.destroySession(); res.redirect(303, '/'); });
app.use('/robloxploit-slimexdev', adminOnly);

app.get('/robloxploit-slimexdev', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
  const status = ['published', 'hidden'].includes(req.query.status) ? req.query.status : '';
  const params = [likePattern(search), likePattern(search)];
  const where = `(title LIKE ? ESCAPE '!' OR game LIKE ? ESCAPE '!')${status ? ' AND published = ?' : ''}`;
  if (status) params.push(status === 'published' ? 1 : 0);
  const [matching] = await query(`SELECT COUNT(*) AS count FROM scripts WHERE ${where}`, params);
  const page = Math.min(Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1)), Math.max(1, Math.ceil(matching.count / 30)));
  const scripts = await query(`SELECT ${publicColumns}, published FROM scripts WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`, params);
  const [counts] = await query('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END), 0) AS published, COALESCE(SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END), 0) AS hidden FROM scripts');
  res.render('admin-list', { title: 'Manage posts — RobloXploit', scripts, search, status, counts, page, total: matching.count, pageUrl: number => `/robloxploit-slimexdev?${new URLSearchParams({ q: search, status, page: number })}`, notice: req.query.saved ? 'Changes saved.' : null });
});

app.get('/robloxploit-slimexdev/new', async (req, res) => res.render('admin-edit', { title: 'Add script — RobloXploit', script: { title: '', game: '', description: '', code: '', script_url: null, published: false, image: null }, editing: false, settings: await getSettings(), taskTypes, taskList }));
app.get('/robloxploit-slimexdev/scripts/:id/edit', numericId, async (req, res) => {
  const [script] = await query('SELECT * FROM scripts WHERE id = ?', [req.params.id]);
  if (!script) return res.status(404).render('error', { message: 'Post not found.' });
  res.render('admin-edit', { title: 'Edit script — RobloXploit', script, editing: true, settings: await getSettings(), taskTypes, taskList });
});

async function writeScript(req, res) {
  const editing = Boolean(req.params.id);
  let old;
  if (editing) {
    [old] = await query('SELECT * FROM scripts WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).render('error', { message: 'Post not found.' });
  }
  let value;
  let newImage;
  try {
    value = parseScript(req.body);
    if (req.file || !editing) newImage = await saveImage(req.file);
    if (newImage && req.afterRollback) req.afterRollback(() => removeImage(newImage));
  } catch (error) {
    return res.status(422).render('admin-edit', { title: `${editing ? 'Edit' : 'Add'} script — RobloXploit`, script: { ...old, title: req.body.title || '', game: req.body.game || '', description: req.body.description || '', code: req.body.code || '', script_url: req.body.content_type === 'link' ? (req.body.script_url || '') : null, published: req.body.published === '1', tasks_json: req.body.tasks_mode === 'custom' ? req.body.tasks_json : null }, editing, settings: await getSettings(), taskTypes, taskList, error: error.message });
  }
  try {
    if (editing) await query('UPDATE scripts SET title=?, game=?, description=?, code=?, script_url=?, published=?, image=?, tasks_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [value.title, value.game, value.description, value.code, value.script_url, value.published, newImage || old.image, value.tasks_json, old.id]);
    else await query('INSERT INTO scripts (title, game, description, code, script_url, published, image, tasks_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [value.title, value.game, value.description, value.code, value.script_url, value.published, newImage, value.tasks_json]);
  } catch (error) { if (newImage) await removeImage(newImage); throw error; }
  if (newImage && old) {
    if (req.afterCommit) req.afterCommit(() => removeImage(old.image));
    else await removeImage(old.image);
  }
  res.redirect(303, '/robloxploit-slimexdev?saved=1');
}

app.post('/robloxploit-slimexdev/scripts', csrfGuard, upload, writeScript);
app.post('/robloxploit-slimexdev/scripts/:id/edit', numericId, csrfGuard, upload, writeScript);
app.post('/robloxploit-slimexdev/scripts/:id/visibility', numericId, csrfGuard, async (req, res) => {
  await query('UPDATE scripts SET published = 1 - published, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  res.redirect(303, '/robloxploit-slimexdev?saved=1');
});
app.post('/robloxploit-slimexdev/scripts/:id/delete', numericId, csrfGuard, async (req, res) => {
  const [script] = await query('SELECT image FROM scripts WHERE id = ?', [req.params.id]);
  if (script) {
    await query('DELETE FROM scripts WHERE id = ?', [req.params.id]);
    if (req.afterCommit) req.afterCommit(() => removeImage(script.image));
    else await removeImage(script.image);
  }
  res.redirect(303, '/robloxploit-slimexdev?saved=1');
});
app.get('/robloxploit-slimexdev/settings', async (req, res) => res.render('admin-settings', { title: 'Unlock tasks — RobloXploit', settings: await getSettings(), taskTypes, taskList, notice: req.query.saved ? 'Task settings saved.' : null }));
app.post('/robloxploit-slimexdev/settings', csrfGuard, async (req, res) => {
  let settings;
  try { settings = parseSettings(req.body); }
  catch (error) {
    const draft = await getSettings();
    try {
      const tasks = JSON.parse(req.body.tasks_json);
      if (Array.isArray(tasks) && tasks.length > 0 && tasks.length <= 20 && tasks.every(task => task && Object.hasOwn(taskTypes, task.type) && typeof task.label === 'string' && typeof task.url === 'string')) draft.tasks = tasks;
    } catch { /* Keep saved settings if the submitted list is malformed. */ }
    return res.status(422).render('admin-settings', { title: 'Unlock tasks — RobloXploit', settings: draft, taskTypes, taskList, error: error.message });
  }
  if (settings.tasks) await query('UPDATE settings SET tasks_json=?, wait_seconds=? WHERE id=1', [JSON.stringify(settings.tasks), settings.wait_seconds]);
  else await query('UPDATE settings SET channel_url=?, video_url=?, combined=?, wait_seconds=?, tasks_json=NULL WHERE id=1', [settings.channel_url, settings.video_url, settings.combined, settings.wait_seconds]);
  res.redirect(303, '/robloxploit-slimexdev/settings?saved=1');
});

app.get('/robloxploit-slimexdev/ads', async (req, res) => res.render('admin-ads', { title: 'Advertisements — RobloXploit', config: (await getSettings()).ads, notice: req.query.saved ? 'Ad settings saved.' : null }));
app.post('/robloxploit-slimexdev/ads', csrfGuard, async (req, res) => {
  let config;
  try { config = parseAds(req.body); }
  catch (error) { return res.status(422).render('admin-ads', { title: 'Advertisements — RobloXploit', config: adDraft(req.body), error: error.message }); }
  await query('UPDATE settings SET ads_json=? WHERE id=1', [JSON.stringify(config)]);
  res.redirect(303, '/robloxploit-slimexdev/ads?saved=1');
});

app.use((req, res) => res.status(404).render('error', { message: 'The page you are looking for does not exist.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const errorStatus = error.status ?? error.statusCode;
  const status = error instanceof multer.MulterError ? 422 : Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus < 500 ? errorStatus : 500;
  if (status === 500) console.error('Request failed:', error.code || error.name);
  let message = status === 413 ? 'Request too large.' : status < 500 ? 'Invalid request body.' : 'Something went wrong. Please try again later.';
  if (error instanceof multer.MulterError) message = error.code === 'LIMIT_FIELD_VALUE'
    ? `${error.field === 'code' ? 'Script code' : 'Form field'} is too large. Code supports up to 300,000 characters.`
    : 'Upload one JPG, PNG or WebP image up to 3 MB. Go back to try again.';
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
  res.status(status).render('error', { title: 'Request error — RobloXploit', message });
});
