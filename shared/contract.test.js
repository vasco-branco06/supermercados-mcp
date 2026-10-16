import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProductSchema, ProductListSchema } from './schema.js';
import { normalizeAuchan, normalizeContinente, normalizePingoDoce, parseSize, parseUnitPrice } from './normalize.js';

const FETCHED_AT = '2026-10-16T12:00:00.000Z';
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));

const stores = [
  { fixture: 'continente-leite', normalize: normalizeContinente, html: false },
  { fixture: 'pingo-doce-leite', normalize: normalizePingoDoce, html: true },
  { fixture: 'auchan-leite', normalize: normalizeAuchan, html: true },
];

for (const { fixture: name, normalize, html } of stores) {
  test(`${name}: raw product normalizes to the expected contract shape`, () => {
    const normalized = json(`${name}.raw.json`).map((raw) => normalize(raw, FETCHED_AT));
    assert.deepEqual(normalized, json(`${name}.expected.json`));
    ProductListSchema.parse(normalized);
  });

  if (html) {
    // The HTML is a real page excerpt. Server tests must parse it into exactly the raw.json objects.
    test(`${name}: html fixture contains every expected product`, () => {
      const page = fixture(`${name}.html`);
      for (const p of json(`${name}.expected.json`)) {
        assert.ok(page.includes(`data-pid="${p.product_id}"`), `missing ${p.product_id}`);
      }
    });
  }
}

test('parseUnitPrice reads the three site formats', () => {
  assert.deepEqual(parseUnitPrice('0,89€/lt'), { unit_price: 0.89, unit: 'l' });
  assert.deepEqual(parseUnitPrice('1 L | 0,85 €/L'), { unit_price: 0.85, unit: 'l' });
  assert.deepEqual(parseUnitPrice('0.85 €/Lt'), { unit_price: 0.85, unit: 'l' });
  assert.deepEqual(parseUnitPrice('3,49€/kg'), { unit_price: 3.49, unit: 'kg' });
  assert.deepEqual(parseUnitPrice('0,25 €/un'), { unit_price: 0.25, unit: 'un' });
});

test('parseUnitPrice returns null instead of guessing', () => {
  assert.equal(parseUnitPrice('0,40€/100gr'), null);
  assert.equal(parseUnitPrice('sem preço'), null);
  assert.equal(parseUnitPrice(null), null);
});

test('parseSize keeps only the part before the pipe', () => {
  assert.equal(parseSize('1 L | 0,85 €/L'), '1 L');
  assert.equal(parseSize('0,85 €/L'), null);
});

test('promo only carries a label and the original price', () => {
  const [, , promo] = json('pingo-doce-leite.expected.json');
  assert.deepEqual(promo.promo, { label: 'Promoção até 19/10', original_price: 1 });
});

const valid = json('auchan-leite.expected.json')[0];

test('schema rejects invalid prices', () => {
  for (const price of [0, -1, NaN, Infinity, '0.85', null]) {
    assert.equal(ProductSchema.safeParse({ ...valid, price }).success, false, `price ${price}`);
  }
});

test('schema rejects unit_price without unit', () => {
  assert.equal(ProductSchema.safeParse({ ...valid, unit: null }).success, false);
  assert.equal(ProductSchema.safeParse({ ...valid, unit_price: null }).success, false);
  assert.equal(ProductSchema.safeParse({ ...valid, unit_price: null, unit: null }).success, true);
});

test('schema rejects unknown store, unit, extra fields and bad dates', () => {
  assert.equal(ProductSchema.safeParse({ ...valid, store: 'lidl' }).success, false);
  assert.equal(ProductSchema.safeParse({ ...valid, unit: 'lt' }).success, false);
  assert.equal(ProductSchema.safeParse({ ...valid, extra: 1 }).success, false);
  assert.equal(ProductSchema.safeParse({ ...valid, fetched_at: 'ontem' }).success, false);
});

test('normalizers refuse to invent a price', () => {
  const raw = json('auchan-leite.raw.json')[0];
  assert.throws(() => normalizeAuchan({ ...raw, price: undefined }, FETCHED_AT));
});
