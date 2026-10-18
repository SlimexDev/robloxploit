import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { hashPassword } from '../../server/security.js';

// TEST_DATABASE_URL must point to a disposable PostgreSQL database; use a private test schema.
const schema = `rx_test_${Date.now()}`;
test('PostgreSQL cloud sessions, CRUD and concurrent unlock across app instances', async t => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL in .env.postgres.test.');
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.href;
  const root = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: true } });
  await root.connect();
  await root.query(`CREATE SCHEMA ${schema}`);
  const { app } = await import('../../server/app.js');
  const { db, query } = await import('../../server/db.js');
  const { databaseSessions, DatabaseRateStore } = await import('../../server/cloud-state.js');
  const express = (await import('express')).default;
  let server, second;
  try {
    await db.query(await readFile('supabase/schema.sql', 'utf8'));
    await query('INSERT INTO admins (username,password_hash) VALUES (?,?)',['tester',await hashPassword('long-test-password')]);
    await query('UPDATE settings SET channel_url=?,video_url=?,wait_seconds=1 WHERE id=1',['https://youtube.com/@test','https://youtu.be/test']);
    await query('INSERT INTO scripts (title,game,description,code,script_url,image,published) VALUES (?,?,?,?,?,?,?)',['Cloud post','Game','Description','SECRET_CODE',null,'/assets/cover-placeholder.svg',1]);
    server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    const origin=`http://127.0.0.1:${server.address().port}`;
    let cookie='',csrf;
    const request=async(path,options={})=>{
      const r=await fetch(origin+path,{...options,redirect:'manual',headers:{Cookie:cookie,...options.headers}});
      const next=r.headers.getSetCookie()[0];if(next) cookie=next.split(';')[0];return r;
    };
    const form=data=>({method:'POST',body:new URLSearchParams({_csrf:csrf,...data})});
    const api=(token,action,index)=>request(`/api/unlock/${token}/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({index})});
    await t.test('login rotates token and persists admin, rejects CSRF and old path',async()=>{
      assert.equal((await request('/admin')).status,404);
      const html=await(await request('/robloxploit-slimexdev/login')).text();
      csrf=html.match(/name="csrf-token" content="([^"]+)"/)[1];const before=cookie;
      assert.equal((await request('/robloxploit-slimexdev/login',form({_csrf:'wrong',username:'tester',password:'long-test-password'}))).status,403);
      assert.equal((await request('/robloxploit-slimexdev/login',form({username:'tester',password:'long-test-password'}))).status,303);
      assert.notEqual(cookie,before);
      const dashboard=await(await request('/robloxploit-slimexdev')).text();
      assert.match(dashboard,/Manage posts/);csrf=dashboard.match(/name="csrf-token" content="([^"]+)"/)[1];
      assert.equal((await fetch(origin+'/robloxploit-slimexdev',{redirect:'manual',headers:{Cookie:before}})).status,303);
    });
    await t.test('another middleware instance reads session and serializes overlapping changes',async()=>{
      const other=express();other.use(databaseSessions());
      other.get('/',async(req,res)=>{const n=req.session.counter||0;await new Promise(r=>setTimeout(r,25));req.session.counter=n+1;res.json({admin:req.session.admin,n:req.session.counter});});
      second=other.listen(0,'127.0.0.1');await new Promise(r=>second.once('listening',r));
      const results=await Promise.all(Array.from({length:6},async()=>{const r=await fetch(`http://127.0.0.1:${second.address().port}`,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();}));
      assert.deepEqual(results.map(x=>x.n).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert.ok(results.every(x=>x.admin===1));
    });
    await t.test('parallel task completions cannot skip a step; reload invalidates unlocked token',async()=>{
      const detail=await(await request('/script/1')).text();assert.doesNotMatch(detail,/SECRET_CODE/);
      const token=detail.match(/data-token="([^"]+)"/)[1];
      assert.equal((await api(token,'code')).status,403);
      for(let i=0;i<3;i++){
        assert.equal((await api(token,'start',i)).status,200);
        assert.equal((await api(token,'complete',i)).status,400);
        await new Promise(r=>setTimeout(r,1050));
        const results=await Promise.all([api(token,'complete',i),api(token,'complete',i)]);
        assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
      }
      assert.deepEqual(await(await api(token,'code')).json(),{code:'SECRET_CODE'});
      await request('/script/1');assert.equal((await api(token,'code')).status,410);
    });
    await t.test('editing to link, PostgreSQL search and visibility work',async()=>{
      const body=new FormData();for(const [k,v] of Object.entries({title:'Linked script',game:'Game',description:'Description',content_type:'link',script_url:'https://example.com/PRIVATE_LINK',published:'1'}))body.set(k,v);
      assert.equal((await request(`/robloxploit-slimexdev/scripts/1/edit?_csrf=${csrf}`,{method:'POST',body})).status,303);
      assert.match(await(await request('/?q=linked')).text(),/Linked script/);
      const detail=await(await request('/script/1')).text();assert.doesNotMatch(detail,/PRIVATE_LINK/);
      const token=detail.match(/data-token="([^"]+)"/)[1];
      for(let i=0;i<3;i++){await api(token,'start',i);await new Promise(r=>setTimeout(r,1050));await api(token,'complete',i);}
      assert.deepEqual(await(await api(token,'code')).json(),{url:'https://example.com/PRIVATE_LINK'});
      await request('/robloxploit-slimexdev/scripts/1/visibility',form({}));assert.equal((await request('/script/1')).status,404);
      await request('/robloxploit-slimexdev/scripts/1/visibility',form({}));assert.equal((await request('/script/1')).status,200);
    });
    await t.test('rate limits shared across stores, logout persists',async()=>{
      const a=new DatabaseRateStore('test:');const b=new DatabaseRateStore('test:');a.init({windowMs:60000});b.init({windowMs:60000});
      assert.equal((await a.increment('same-ip')).totalHits,1);assert.equal((await b.increment('same-ip')).totalHits,2);
      await request('/robloxploit-slimexdev/logout',form({}));assert.equal((await request('/robloxploit-slimexdev')).status,303);
    });
  } finally {
    if(server) await new Promise(r=>server.close(r));if(second) await new Promise(r=>second.close(r));
    await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();
  }
});
