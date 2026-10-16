import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseProducts, searchProducts, SiteChangedError } from '../src/search.js';
import { ProductSchema } from '../src/shared.js';

const fixture = (name) => readFileSync(new URL(`../../../shared/fixtures/${name}`, import.meta.url), 'utf8');
const html = fixture('auchan-leite.html');
const raw = JSON.parse(fixture('auchan-leite.raw.json'));
const expected = JSON.parse(fixture('auchan-leite.expected.json'));
const FETCHED_AT = '2026-10-16T12:00:00.000Z';
test('parseProducts turns the fixture into exactly raw.json', () => {
  assert.deepEqual(parseProducts(html), raw);
});

test('a tile without a price is skipped, never invented', () => {
  const products = parseProducts(html.replace('content="0.89"', 'content=""'));
  assert.deepEqual(products.map(p => p.product_id), ['3010403', '3704143']);
});

test('tiles with no readable price at all are a clear error', () => {
  const broken = html.replace(/class="sales"/g, 'class="other"');
  assert.throws(() => parseProducts(broken), /o site pode ter mudado/);
});

test('a page without the product list is an error, an empty search is not', () => {
  assert.throws(() => parseProducts('<html><body><p>Bem-vindo</p></body></html>'), SiteChangedError);
  assert.deepEqual(parseProducts('<html><body><div class="search-results"></div></body></html>'), []);
});

test('searchProducts normalizes, limits, and serves the cache for 6 hours', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'auchan-cache-'));
  try {
    let requests = 0;
    let clock = Date.parse(FETCHED_AT);
    const fetchImpl = async (url, init) => {
      requests++;
      assert.equal(url, 'https://www.auchan.pt/pt/pesquisa?q=leite%20meio');
      assert.match(init.headers['User-Agent'], /^supermercados-mcp\/\d+\.\d+\.\d+ \(auchan-mcp; \+https:\/\//);
      return new Response(html, { status: 200 });
    };
    const options = { cacheDir, fetchImpl, now: () => clock };

    const first = await searchProducts('leite meio', 2, options);
    assert.equal(first.store, 'auchan');
    assert.equal(first.count, 2);
    assert.deepEqual(first.products, expected.slice(0, 2));
    first.products.forEach(p => ProductSchema.parse(p));

    clock += 5 * 60 * 60 * 1000;
    const cached = await searchProducts('Leite Meio ', 10, options);
    assert.equal(requests, 1);
    assert.equal(cached.count, 3);
    assert.equal(cached.products[0].fetched_at, FETCHED_AT);

    clock += 2 * 60 * 60 * 1000;
    await searchProducts('leite meio', 1, options);
    assert.equal(requests, 2);
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('blocks and challenges stop with an error instead of being worked around', async () => {
  for (const [status, body] of [[403, ''], [429, ''], [200, '<html><title>Just a moment...</title>captcha</html>']]) {
    const fetchImpl = async () => new Response(body, { status });
    await assert.rejects(searchProducts('leite', 5, { fetchImpl }), /bloqueou|anti-robô/);
  }
});
