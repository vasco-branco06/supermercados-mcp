#!/usr/bin/env node
// Local history of confirmed shopping lists and observed prices (SQLite via node:sqlite).
// Usage: node historico.js save <file.json> | node historico.js history [--limit N]
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProductSchema } from '../shared/schema.js';
import { normalizeContinente } from '../shared/normalize.js';

export function openDb(dir = process.env.SUPERMERCADOS_MCP_DIR || join(homedir(), '.supermercados-mcp')) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'historico.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY, confirmed_at TEXT NOT NULL, store TEXT NOT NULL, total REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS list_items (
      list_id INTEGER NOT NULL REFERENCES lists(id), product_id TEXT NOT NULL, name TEXT NOT NULL,
      quantity REAL NOT NULL, price REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS price_observations (
      store TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL,
      unit_price REAL, unit TEXT, seen_at TEXT NOT NULL);
  `);
  return db;
}

// A product with a `store` field must already match the contract.
// One without it is the raw object from continente-mcp and goes through normalizeContinente.
function toProduct(entry) {
  if (entry?.store !== undefined) return ProductSchema.parse(entry);
  return normalizeContinente(entry, entry?.fetched_at ?? new Date().toISOString());
}

// Validates everything before writing anything: one bad product rejects the whole file.
// data: { lists: [{ store, items: [{ quantity, product }] }], seen: [product] }
export function validate(data) {
  const errors = [];
  const check = (label, fn) => {
    try {
      return fn();
    } catch (error) {
      errors.push(`${label}: ${error.issues ? error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') : error.message}`);
    }
  };
  const lists = (data?.lists ?? []).map((list, li) => ({
    store: list.store,
    items: (list.items ?? []).map((item, ii) => {
      const label = `lists[${li}].items[${ii}]`;
      const product = check(label, () => toProduct(item.product));
      if (!(Number.isFinite(item.quantity) && item.quantity > 0)) errors.push(`${label}: quantity must be a number > 0`);
      if (product && product.store !== list.store) errors.push(`${label}: product store ${product.store} != list store ${list.store}`);
      return { quantity: item.quantity, product };
    }),
  }));
  lists.forEach((list, li) => list.items.length || errors.push(`lists[${li}]: no items`));
  const seen = (data?.seen ?? []).map((p, i) => check(`seen[${i}]`, () => toProduct(p)));
  if (!lists.length && !seen.length) errors.push('nothing to save: expected "lists" and/or "seen"');
  if (errors.length) throw new Error(`Invalid data, nothing saved:\n- ${errors.join('\n- ')}`);
  return { lists, seen };
}

export function save(db, data, now = new Date().toISOString()) {
  const { lists, seen } = validate(data);
  const insertList = db.prepare('INSERT INTO lists (confirmed_at, store, total) VALUES (?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO list_items (list_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)');
  const insertObs = db.prepare(
    'INSERT INTO price_observations (store, product_id, name, price, unit_price, unit, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const observe = (p) => insertObs.run(p.store, p.product_id, p.name, p.price, p.unit_price, p.unit, p.fetched_at);
  const ids = [];
  db.exec('BEGIN');
  try {
    for (const list of lists) {
      // Total is computed here from validated prices, never taken from the input.
      const total = Math.round(list.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0) * 100) / 100;
      const id = Number(insertList.run(now, list.store, total).lastInsertRowid);
      for (const { quantity, product } of list.items) {
        insertItem.run(id, product.product_id, product.name, quantity, product.price);
        observe(product);
      }
      ids.push({ id, store: list.store, total });
    }
    seen.forEach(observe);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { lists: ids, observations: seen.length + lists.reduce((n, l) => n + l.items.length, 0) };
}

export function history(db, limit = 10) {
  const lists = db.prepare('SELECT id, confirmed_at, store, total FROM lists ORDER BY id DESC LIMIT ?').all(limit);
  const items = db.prepare('SELECT product_id, name, quantity, price FROM list_items WHERE list_id = ?');
  return lists.map((l) => ({ ...l, items: items.all(l.id) }));
}

function main([command, arg, value]) {
  if (command === 'save' && arg) {
    const db = openDb();
    console.log(JSON.stringify(save(db, JSON.parse(readFileSync(arg, 'utf8'))), null, 2));
  } else if (command === 'history') {
    const limit = arg === '--limit' ? Number(value) : 10;
    if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a whole number >= 1');
    console.log(JSON.stringify(history(openDb(), limit), null, 2));
  } else {
    throw new Error('Usage: node historico.js save <file.json> | node historico.js history [--limit N]');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
