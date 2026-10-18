import { app } from './app.js';
import { db, query } from './db.js';
try {
  await query('SELECT id FROM settings WHERE id = 1');
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`RobloXploit ready: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await db.end(); process.exit(0); }));
} catch (error) {
  console.error('Cannot connect to database. Check environment variables, database availability and setup.', error.code || '');
  await db.end();
  process.exitCode = 1;
}
