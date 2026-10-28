import { Router } from 'express';
import multer from 'multer';
import { query, getSettings } from './db.js';
import { csrfGuard } from './security.js';

export function parseCodePage(body) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 160) throw new Error('Enter a title up to 160 characters.');
  if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > 300000) throw new Error('Enter script code up to 300,000 characters.');
  return { title: body.title.trim(), code: body.code, published: body.published === '1' ? 1 : 0 };
}

export const codePages = Router();
export const adminCodePages = Router();
const codeFields = multer({ limits: { files: 0, fields: 4, fieldSize: 1200000 } }).none();
function numericId(req, res, next) {
  if (!/^\d{1,10}$/.test(req.params.id)) return res.status(404).render('error', { message: 'Script code page not found.' });
  next();
}

codePages.get(['/:id', '/:id/:format'], numericId, async (req, res) => {
  if (req.params.format && !['raw', 'download'].includes(req.params.format)) return res.sendStatus(404);
  const [page] = await query('SELECT id,title,code,updated_at FROM code_pages WHERE id=? AND published=1', [req.params.id]);
  if (!page) return res.status(404).render('error', { message: 'This script code page does not exist or is hidden.' });
  if (req.params.format) {
    if (req.params.format === 'download') res.attachment(`script-${page.id}.lua`);
    return res.type('text/plain').send(page.code);
  }
  res.locals.ads = (await getSettings()).ads;
  res.render('code-page', { title: `${page.title} — RobloXploit`, page, lines: page.code.split(/\r\n|\r|\n/).length, bytes: Buffer.byteLength(page.code, 'utf8') });
});

adminCodePages.get('/', async (req, res) => {
  const page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const pages = await query(`SELECT id,title,published,updated_at FROM code_pages ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`);
  const [count] = await query('SELECT COUNT(*) AS total FROM code_pages');
  res.render('admin-code-list', { title: 'Script code pages — RobloXploit', pages, page, total: count.total, notice: req.query.saved ? 'Changes saved.' : null });
});
adminCodePages.get('/new', (req, res) => res.render('admin-code-edit', { title: 'New script code page — RobloXploit', page: { title: '', code: '', published: 0 }, editing: false }));
adminCodePages.get('/:id/edit', numericId, async (req, res) => {
  const [page] = await query('SELECT * FROM code_pages WHERE id=?', [req.params.id]);
  if (!page) return res.status(404).render('error', { message: 'Script code page not found.' });
  res.render('admin-code-edit', { title: 'Edit script code page — RobloXploit', page, editing: true });
});

async function save(req, res) {
  const editing = Boolean(req.params.id);
  if (editing && !(await query('SELECT id FROM code_pages WHERE id=?', [req.params.id])).length) return res.status(404).render('error', { message: 'Script code page not found.' });
  let value;
  try { value = parseCodePage(req.body); }
  catch (error) { return res.status(422).render('admin-code-edit', { title: `${editing ? 'Edit' : 'New'} script code page — RobloXploit`, page: { id: req.params.id, title: typeof req.body.title === 'string' ? req.body.title : '', code: typeof req.body.code === 'string' ? req.body.code : '', published: req.body.published === '1' }, editing, error: error.message }); }
  if (editing) await query('UPDATE code_pages SET title=?,code=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [value.title, value.code, value.published, req.params.id]);
  else await query('INSERT INTO code_pages (title,code,published) VALUES (?,?,?)', [value.title, value.code, value.published]);
  res.redirect(303, '/robloxploit-slimexdev/code?saved=1');
}
adminCodePages.post('/', codeFields, csrfGuard, save);
adminCodePages.post('/:id/edit', numericId, codeFields, csrfGuard, save);
adminCodePages.post('/:id/visibility', numericId, csrfGuard, async (req, res) => {
  await query('UPDATE code_pages SET published=1-published,updated_at=CURRENT_TIMESTAMP WHERE id=?', [req.params.id]);
  res.redirect(303, '/robloxploit-slimexdev/code?saved=1');
});
adminCodePages.post('/:id/delete', numericId, csrfGuard, async (req, res) => {
  await query('DELETE FROM code_pages WHERE id=?', [req.params.id]);
  res.redirect(303, '/robloxploit-slimexdev/code?saved=1');
});
adminCodePages.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(422).render('error', { message: 'Submit a title and script code up to 300,000 characters. File uploads are not supported on code pages.' });
  if (!['42P01', 'ER_NO_SUCH_TABLE'].includes(error.code)) return next(error);
  res.status(503).render('error', { message: 'Script code pages need a database upgrade. Run npm run setup:cloud for Supabase, or npm run setup for local MySQL.' });
});
