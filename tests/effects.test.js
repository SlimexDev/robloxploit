import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('public/effects.js', 'utf8');
test('particles render, respect reduced motion, and pause in hidden tabs', () => {
  for (const reduced of [false, true]) {
    let dots = 0, scheduled = 0;
    const listeners = {};
    const context = { setTransform(){}, clearRect(){}, beginPath(){}, arc(){ dots++; }, fill(){}, moveTo(){}, lineTo(){}, stroke(){} };
    const document = { hidden:false, documentElement:{addEventListener(){}}, querySelectorAll:()=>[], querySelector: selector => selector === '#particles' ? { getContext:()=>context } : null, addEventListener:(name,fn)=>listeners[name]=fn };
    const environment = { document, matchMedia:()=>({matches:reduced,addEventListener(){}}), innerWidth:375, innerHeight:800, devicePixelRatio:2, window:{addEventListener(){}}, requestAnimationFrame:()=>++scheduled, cancelAnimationFrame(){} };
    vm.runInNewContext(source, environment);
    assert.ok(dots >= 28);
    assert.equal(scheduled, reduced ? 0 : 1);
    document.hidden = true;
    listeners.visibilitychange();
    assert.equal(scheduled, reduced ? 0 : 1);
  }
});
