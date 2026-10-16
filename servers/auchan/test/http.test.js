import assert from 'node:assert/strict';
import test from 'node:test';
import { createThrottle } from '../src/http.js';

test('throttle keeps one second between requests, one at a time', async () => {
  let clock = 0;
  const starts = [];
  const gate = createThrottle(1000, () => clock, async (ms) => { clock += ms; });
  await Promise.all([1, 2, 3].map(() => gate(async () => { starts.push(clock); clock += 10; })));
  assert.deepEqual(starts, [0, 1000, 2000]);
});

test('a failed request does not jam the queue', async () => {
  const gate = createThrottle(0);
  await assert.rejects(gate(async () => { throw new Error('boom'); }));
  assert.equal(await gate(async () => 'ok'), 'ok');
});
