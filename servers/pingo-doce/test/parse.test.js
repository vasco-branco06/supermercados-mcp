import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearchPage, SiteChangedError } from '../src/parse.js';
import { normalizePingoDoce, ProductSchema } from '../src/shared.js';

const FETCHED_AT = '2026-10-16T12:00:00.000Z';
const fixture = (name) => readFileSync(new URL(`../../../shared/fixtures/${name}`, import.meta.url), 'utf8');
const html = fixture('pingo-doce-leite.html');

test('parses the html fixture into exactly raw.json', () => {
  assert.deepEqual(parseSearchPage(html), JSON.parse(fixture('pingo-doce-leite.raw.json')));
});

test('normalized fixture matches expected.json and the schema', () => {
  const normalized = parseSearchPage(html).map((raw) => normalizePingoDoce(raw, FETCHED_AT));
  assert.deepEqual(normalized, JSON.parse(fixture('pingo-doce-leite.expected.json')));
  for (const p of normalized) ProductSchema.parse(p);
});

test('a tile without a price is skipped, not invented', () => {
  const noPrice = html.replace('<span class="value" content="0.85"></span>', '<span class="value"></span>');
  const ids = parseSearchPage(noPrice).map((p) => p.product_id);
  assert.deepEqual(ids, ['48149', '41043']);
});

test('tiles with no readable price throw a clear error', () => {
  const broken = html.replaceAll('class="sales', 'class="renamed');
  assert.throws(() => parseSearchPage(broken), (e) => e instanceof SiteChangedError && /o site pode ter mudado/.test(e.message));
});

test('product ids without tiles mean the markup changed', () => {
  assert.throws(() => parseSearchPage(html.replaceAll('class="product"', 'class="tile"')), SiteChangedError);
});

test('a page without products is an empty result', () => {
  assert.deepEqual(parseSearchPage('<html><body><p>Sem resultados</p></body></html>'), []);
});
