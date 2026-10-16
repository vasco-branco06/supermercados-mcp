import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { openDb, save, history } from './historico.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../shared/fixtures/${name}`, import.meta.url), 'utf8'));
const NOW = '2026-10-16T13:00:00.000Z';
let dir;
let db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'smcp-'));
  db = openDb(dir);
});

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('saves a confirmed list with computed total and price observations', () => {
  const [a, b] = fixture('pingo-doce-leite.expected.json');
  const result = save(db, { lists: [{ store: 'pingo-doce', items: [{ quantity: 6, product: a }, { quantity: 2, product: b }] }] }, NOW);
  assert.deepEqual(result.lists, [{ id: 1, store: 'pingo-doce', total: 6.8 }]);
  const [list] = history(db);
  assert.equal(list.confirmed_at, NOW);
  assert.equal(list.items.length, 2);
  assert.equal(count('price_observations'), 2);
});

test('converts raw Continente objects with normalizeContinente', () => {
  const raw = fixture('continente-leite.raw.json').map((p) => ({ ...p, fetched_at: '2026-10-16T12:00:00.000Z' }));
  save(db, { lists: [{ store: 'continente', items: [{ quantity: 1, product: raw[0] }] }], seen: raw.slice(1) }, NOW);
  const obs = db.prepare('SELECT * FROM price_observations ORDER BY rowid').all();
  const expected = fixture('continente-leite.expected.json');
  assert.equal(obs.length, 3);
  assert.deepEqual(
    obs.map((o) => [o.product_id, o.unit_price, o.unit]),
    expected.map((p) => [p.product_id, p.unit_price, p.unit]),
  );
});

test('one invalid product rejects the whole file and writes nothing', () => {
  const [good] = fixture('auchan-leite.expected.json');
  const bad = { ...good, price: 0 };
  assert.throws(
    () => save(db, { lists: [{ store: 'auchan', items: [{ quantity: 1, product: good }, { quantity: 1, product: bad }] }] }),
    /nothing saved[\s\S]*items\[1\]/,
  );
  assert.throws(() => save(db, { seen: [{ ...good, unit_price: 1, unit: null }] }), /nothing saved/);
  assert.throws(() => save(db, { lists: [{ store: 'auchan', items: [{ quantity: 0, product: good }] }] }), /quantity/);
  assert.throws(() => save(db, { lists: [{ store: 'continente', items: [{ quantity: 1, product: good }] }] }), /store/);
  assert.throws(() => save(db, {}), /nothing to save/);
  assert.equal(count('lists'), 0);
  assert.equal(count('price_observations'), 0);
});

test('history returns newest first and respects the limit', () => {
  const [p] = fixture('pingo-doce-leite.expected.json');
  for (let i = 0; i < 3; i++) save(db, { lists: [{ store: 'pingo-doce', items: [{ quantity: i + 1, product: p }] }] });
  assert.deepEqual(history(db, 2).map((l) => l.id), [3, 2]);
});

test('CLI save and history use SUPERMERCADOS_MCP_DIR', () => {
  const env = { ...process.env, SUPERMERCADOS_MCP_DIR: dir };
  const script = new URL('./historico.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const file = join(dir, 'lista.json');
  const [p] = fixture('auchan-leite.expected.json');
  writeFileSync(file, JSON.stringify({ lists: [{ store: 'auchan', items: [{ quantity: 2, product: p }] }] }));
  execFileSync(process.execPath, [script, 'save', file], { env });
  const out = JSON.parse(execFileSync(process.execPath, [script, 'history', '--limit', '1'], { env, encoding: 'utf8' }));
  assert.equal(out[0].store, 'auchan');
  assert.equal(out[0].total, Math.round(p.price * 200) / 100);
  const bad = spawnSync(process.execPath, [script, 'history', '--limit', 'x'], { env, encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
