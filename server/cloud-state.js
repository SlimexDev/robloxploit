import { createHash, randomBytes } from 'node:crypto';
import { db, requestDatabase } from './db.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const options = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600_000, path: '/' };

export function databaseSessions(pool = db) {
  let lastCleanup = 0;
  return async (req, res, next) => {
    const client = await pool.connect();
    let released = false;
    const release = () => { if (!released) { released = true; client.release(); } };
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
      let token = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('rx_session='))?.slice(11);
      if (!/^[a-f0-9]{64}$/.test(token || '')) token = randomBytes(32).toString('hex');
      let id = digest(token);
      // Serialize each visitor's requests across instances so parallel task clicks cannot overwrite progress.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [id]);
      const { rows } = await client.query('SELECT data FROM app_sessions WHERE id=$1 AND expires_at > NOW()', [id]);
      let session = rows[0]?.data;
      if (!session) {
        token = randomBytes(32).toString('hex');
        id = digest(token);
        session = { csrf: randomBytes(32).toString('hex'), expiresAt: Date.now() + options.maxAge, attempts: [] };
        res.cookie('rx_session', token, options);
      }
      session.attempts = new Map(session.attempts);
      for (const [key, attempt] of session.attempts) if (attempt.expiresAt <= Date.now()) session.attempts.delete(key);
      req.session = session;
      const committed = [], rolledBack = [];
      req.afterCommit = action => committed.push(action);
      req.afterRollback = action => rolledBack.push(action);
      let removedId;
      let destroyed = false;
      req.rotateSession = () => {
        removedId = id;
        token = randomBytes(32).toString('hex');
        id = digest(token);
        session.csrf = randomBytes(32).toString('hex');
        res.cookie('rx_session', token, options);
      };
      req.destroySession = () => { destroyed = true; res.clearCookie('rx_session', { path: '/' }); };
      res.locals.csrf = session.csrf;
      res.locals.isAdmin = Boolean(session.admin);
      const end = res.end.bind(res);
      let ending = false;
      res.end = (...args) => {
        if (ending) return res;
        ending = true;
        (async () => {
          try {
            if (res.statusCode >= 500) {
              await client.query('ROLLBACK');
              await Promise.allSettled(rolledBack.map(action => action()));
            }
            else {
              if (removedId || destroyed) await client.query('DELETE FROM app_sessions WHERE id=$1', [removedId || id]);
              if (!destroyed) await client.query('INSERT INTO app_sessions (id,data,expires_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, expires_at=EXCLUDED.expires_at', [id, JSON.stringify({ ...session, attempts: [...session.attempts] }), new Date(session.expiresAt)]);
              if (Date.now() - lastCleanup > 60000) {
                await client.query('DELETE FROM app_sessions WHERE id IN (SELECT id FROM app_sessions WHERE expires_at <= NOW() LIMIT 500)');
                await client.query('DELETE FROM app_rate_limits WHERE key IN (SELECT key FROM app_rate_limits WHERE reset_at <= NOW() LIMIT 500)');
                lastCleanup = Date.now();
              }
              await client.query('COMMIT');
              await Promise.allSettled(committed.map(action => action()));
            }
            release();
            end(...args);
          } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            await Promise.allSettled(rolledBack.map(action => action()));
            release();
            console.error('Session save failed:', error.code || error.name);
            if (!res.headersSent) {
              res.statusCode = 503;
              res.removeHeader('Content-Length');
              res.removeHeader('Location');
              res.removeHeader('Set-Cookie');
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              end('Unable to save your session. Please reload and try again.');
            } else res.destroy();
          }
        })();
        return res;
      };
      res.once('close', () => {
        if (!ending && !released) {
          ending = true;
          client.query('ROLLBACK').catch(() => {}).then(() => Promise.allSettled(rolledBack.map(action => action()))).finally(release);
        }
      });
      requestDatabase.run({ query: (...args) => {
        if (released) throw new Error('Request database transaction has ended.');
        return client.query(...args);
      } }, next);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      release();
      next(error);
    }
  };
}

export class DatabaseRateStore {
  constructor(prefix, pool = db) { this.prefix = prefix; this.pool = pool; this.localKeys = false; }
  init(options) { this.windowMs = options.windowMs; }
  async increment(key) {
    const result = await (requestDatabase.getStore() || this.pool).query(`INSERT INTO app_rate_limits (key,hits,reset_at) VALUES ($1,1,NOW()+($2 * INTERVAL '1 millisecond'))
      ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN app_rate_limits.reset_at<=NOW() THEN 1 ELSE app_rate_limits.hits+1 END,
      reset_at=CASE WHEN app_rate_limits.reset_at<=NOW() THEN EXCLUDED.reset_at ELSE app_rate_limits.reset_at END RETURNING hits,reset_at`, [this.prefix + digest(key), this.windowMs]);
    return { totalHits: result.rows[0].hits, resetTime: new Date(result.rows[0].reset_at) };
  }
  async decrement(key) { await this.pool.query('UPDATE app_rate_limits SET hits=GREATEST(0,hits-1) WHERE key=$1', [this.prefix + digest(key)]); }
  async resetKey(key) { await this.pool.query('DELETE FROM app_rate_limits WHERE key=$1', [this.prefix + digest(key)]); }
}
