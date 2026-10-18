import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function listening(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
function launch(executable, args, label) {
  const child = spawn(executable, args, { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', openSync(`.runtime/${label}-stdout.log`, 'a'), openSync(`.runtime/${label}-stderr.log`, 'a')] });
  child.on('error', error => { console.error(`Could not start ${label}: ${error.message}`); process.exitCode = 1; });
  child.unref();
}
try {
  await access('.env');
  const mysqlDir = path.join(root, '.runtime/mysql-8.4.11-winx64');
  if (!await listening(3307)) {
    const executable = path.join(mysqlDir, 'bin/mysqld.exe');
    await access(executable);
    launch(executable, ['--no-defaults', `--basedir=${mysqlDir}`, `--datadir=${path.join(root, '.runtime/mysql-data')}`, '--bind-address=127.0.0.1', '--port=3307', '--mysqlx=0', '--console'], 'mysql');
    for (let attempt = 0; attempt < 30 && !await listening(3307); attempt++) await pause(500);
  }
  if (!await listening(3000)) launch(process.execPath, ['--env-file=.env', 'server/index.js'], 'app');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.text()).includes('RobloXploit')) { ready = true; break; }
    } catch { /* The process may still be starting. */ }
    await pause(500);
  }
  if (!ready) throw new Error('Website did not start. Check .runtime/app-stderr.log and .env.');
  console.log('RobloXploit: http://localhost:3000\nAdmin: http://localhost:3000/robloxploit-slimexdev\nLogin details: .runtime/ADMIN-LOGIN.txt');
} catch (error) { console.error(error.message); process.exitCode = 1; }
