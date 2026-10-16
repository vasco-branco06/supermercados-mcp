import assert from 'node:assert/strict';
import test from 'node:test';
import { searchProducts } from '../src/search.js';
import { ProductSchema } from '../src/shared.js';

// Makes one real request to auchan.pt. Off by default; run with LIVE=1 (PowerShell: $env:LIVE=1; npm test).
test('live search returns real products that pass the contract schema', { skip: process.env.LIVE !== '1' && 'set LIVE=1 to run' }, async () => {
  const result = await searchProducts('leite', 24);
  assert.equal(result.store, 'auchan');
  assert.ok(result.count > 0, 'expected at least one product');
  result.products.forEach(p => ProductSchema.parse(p));
  console.log(`live: ${result.count} produtos; primeiro: ${result.products[0].name} ${result.products[0].price} EUR`);
});
