import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQueue, createThrottle } from '../src/reliability.js';
import { BlockedError, createSearcher, SEARCH_URL } from '../src/search.js';

const html = readFileSync(new URL('../../../shared/fixtures/pingo-doce-leite.html', import.meta.url), 'utf8');
const noThrottle = createQueue();

function fakeFetch(status = 200, body = html) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return new Response(body, { status });
  };
  return { impl, calls };
}

const searcher = (fetch, now = () => new Date('2026-10-16T12:00:00Z')) =>
  createSearcher({ version: '9.9.9', cacheDir: mkdtempSync(join(tmpdir(), 'pd-')), throttle: noThrottle, fetchImpl: fetch.impl, now });

test('requests the search page with an honest user agent', async () => {
  const fetch = fakeFetch();
  const result = await searcher(fetch)(' leite meio gordo ');
  assert.equal(fetch.calls[0].url, `${SEARCH_URL}?q=leite%20meio%20gordo`);
  assert.equal(fetch.calls[0].init.headers['User-Agent'],
    'supermercados-mcp/9.9.9 (pingo-doce-mcp; +https://github.com/Vascobranco2509/supermercados-mcp)');
  assert.equal(result.products.length, 3);
  assert.equal(result.fetched_at, '2026-10-16T12:00:00.000Z');
});

test('caches results for 6 hours, then fetches again', async () => {
  const fetch = fakeFetch();
  let clock = new Date('2026-10-16T12:00:00Z').getTime();
  const search = searcher(fetch, () => new Date(clock));
  await search('leite');
  clock += 5 * 3600_000;
  const cached = await search('LEITE');
  assert.equal(cached.cached, true);
  assert.equal(cached.fetched_at, '2026-10-16T12:00:00.000Z');
  assert.equal(fetch.calls.length, 1);
  clock += 2 * 3600_000;
  assert.equal((await search('leite')).cached, false);
  assert.equal(fetch.calls.length, 2);
});

for (const status of [403, 429]) {
  test(`HTTP ${status} stops with an error and is not cached`, async () => {
    const fetch = fakeFetch(status, 'blocked');
    const cacheDir = mkdtempSync(join(tmpdir(), 'pd-'));
    const search = createSearcher({ version: '1', cacheDir, throttle: noThrottle, fetchImpl: fetch.impl });
    await assert.rejects(search('leite'), (e) => e instanceof BlockedError && e.message.includes(`HTTP ${status}`));
    assert.deepEqual(readdirSync(cacheDir), []);
  });
}

test('a CAPTCHA page stops with an error', async () => {
  const fetch = fakeFetch(200, '<html><body><div class="g-recaptcha">Please verify you are not a robot (captcha)</div></body></html>');
  await assert.rejects(searcher(fetch)('leite'), BlockedError);
});

test('network failure gives a clear error', async () => {
  const search = createSearcher({ version: '1', cacheDir: mkdtempSync(join(tmpdir(), 'pd-')), throttle: noThrottle,
    fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  await assert.rejects(search('leite'), /pingo-doce: sem ligação ao site/);
});

test('throttle keeps requests at least 1 second apart', async () => {
  let clock = 0;
  const starts = [];
  const throttle = createThrottle(1000, { now: () => clock, sleep: async (ms) => { clock += ms; } });
  await Promise.all([1, 2, 3].map(() => throttle(async () => { starts.push(clock); clock += 100; })));
  assert.deepEqual(starts, [0, 1000, 2000]);
});
