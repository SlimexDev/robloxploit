import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ejs from 'ejs';

async function filesIn(dir) {
  const entries=await readdir(dir,{withFileTypes:true});
  return (await Promise.all(entries.map(entry=>entry.isDirectory()?filesIn(`${dir}/${entry.name}`):`${dir}/${entry.name}`))).flat();
}
for(const dir of ['server','scripts','api','public']) for(const file of await filesIn(dir)) {
  if(file.endsWith('.js')) execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
}
for(const file of await filesIn('views')) if(file.endsWith('.ejs')) ejs.compile(await readFile(file,'utf8'),{filename:file});
const config=JSON.parse(await readFile('vercel.json','utf8'));
assert.equal(config.functions['api/index.js'].includeFiles,'views/**');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const privateFiles=files.filter(file=>/^(\.runtime\/|\.vercel\/|node_modules\/|backups\/)|\.pem$/.test(file)||(/^\.env/.test(file)&&!['.env.example','.env.production.example'].includes(file))||(file.startsWith('uploads/')&&file!=='uploads/.gitkeep'));
assert.deepEqual(privateFiles,[],'Private files must not be staged/tracked or eligible for git add.');
const history=execFileSync('git',['log','--all','--format=','--name-only'],{encoding:'utf8'}).split(/\r?\n/);
assert.ok(!history.some(file=>/^\.env(?:$|\.(?!example$|production\.example$))|^\.runtime\//.test(file)), 'Private environment/runtime file appeared in Git history; review before publishing.');
console.log('Release checks passed: JavaScript syntax, EJS templates, Vercel template inclusion, private-file exclusions and environment-file history.');
