import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PingoDoceServer } from '../src/index.js';
import { ProductSchema } from '../src/shared.js';

// Hits pingodoce.pt once. Off by default: run with LIVE=1 npm test.
test('live search returns real products that pass the schema', { skip: process.env.LIVE !== '1' && 'set LIVE=1 to run' }, async () => {
  const server = new PingoDoceServer({ env: { PINGODOCE_STATE_DIR: mkdtempSync(join(tmpdir(), 'pd-live-')) } });
  const result = await server.callTool('search_products', { query: 'leite', limit: 5 });
  assert.equal(result.isError, undefined, result.content[0].text);
  const body = JSON.parse(result.content[0].text);
  assert.ok(body.count > 0, 'no products');
  for (const p of body.products) ProductSchema.parse(p);
  console.log(body.products.map((p) => `${p.product_id} ${p.name} ${p.price} EUR`).join('\n'));
});
