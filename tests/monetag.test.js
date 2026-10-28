import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { configurePublicAds, isMonetag } from '../server/monetag.js';

test('Monetag moves only its configured banner into the page head with a nonce', async () => {
 const html='<script src="https://quge5.com/88/tag.min.js" data-zone="302956" async data-cfasync="false"></script>';
 const ads={banner:{enabled:true,type:'embed',html}};
 const headers={};
 const res={locals:{},setHeader:(key,value)=>headers[key]=value};
 configurePublicAds(res,ads,true);
 assert.equal(res.locals.monetagEnabled,true);
 assert.match(headers['Content-Security-Policy'],/'strict-dynamic'/);
 assert.match(headers['Content-Security-Policy'],/worker-src 'self'/);
 const rendered=await ejs.renderFile('views/partials/head.ejs',{csrf:'',title:'Test',path:'/',...res.locals});
 assert.match(rendered,/<script nonce="[^"]+" src="https:\/\/quge5.com\/88\/tag.min.js"/);
 assert.doesNotMatch(rendered,/src="\/ads\/content\/banner"/);
 configurePublicAds(res,ads,false);
 assert.equal(res.locals.monetagEnabled,false);
 assert.equal(isMonetag({enabled:true,html:'<script src="https://other.example/tag.js"></script>'}),false);
 const worker=await readFile('public/sw.js','utf8');
 assert.match(worker,/zoneId.*12140171/);
 assert.match(worker,/importScripts\('https:\/\/5gvci.com/);
});
