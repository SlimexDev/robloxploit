import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/unlock.js', 'utf8');
const hintFunction = source.slice(source.indexOf('  function videoHint('), source.indexOf('  async function syncPlayback('));

test('watch instructions hide the countdown until playback starts and retain it when paused', () => {
  const video = { index: 0, playing: false, player: { getPlayerState: () => 2 } };
  let hint;
  const context = vm.createContext({ video, state: [{ done: false, remainingMs: 18000 }], status: (_index, message) => { hint = message; } });
  vm.runInContext(hintFunction, context);
  vm.runInContext('videoHint(video)', context);
  assert.equal(hint, 'Click the play button on the video above to start watching.');
  video.hasPlayed = true;
  video.playing = true;
  vm.runInContext('videoHint(video)', context);
  assert.equal(hint, 'Keep watching… · 18s left');
  video.playing = false;
  vm.runInContext('videoHint(video)', context);
  assert.equal(hint, 'Paused — press play to continue · 18s left');
});
