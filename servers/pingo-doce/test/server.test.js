import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PingoDoceServer } from '../src/index.js';
import { ProductSchema } from '../src/shared.js';

const html = readFileSync(new URL('../../../shared/fixtures/pingo-doce-leite.html', import.meta.url), 'utf8');

async function connect({ body = html, status = 200 } = {}) {
  const env = { PINGODOCE_STATE_DIR: mkdtempSync(join(tmpdir(), 'pd-')) };
  const server = new PingoDoceServer({ env, fetchImpl: async () => new Response(body, { status }) });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.server.connect(a), client.connect(b)]);
  return client;
}

const search = (client, args) => client.callTool({ name: 'search_products', arguments: args });

test('the server lists search, cart, login and close_session', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['search_products', 'get_cart', 'add_to_cart', 'update_cart_item', 'login', 'logout', 'close_session']);
});

test('search returns one JSON text block in the contract format', async () => {
  const client = await connect();
  const result = await search(client, { query: 'leite' });
  assert.equal(result.isError, undefined);
  assert.equal(result.content.length, 1);
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.store, 'pingo-doce');
  assert.equal(body.query, 'leite');
  assert.equal(body.count, 3);
  for (const p of body.products) ProductSchema.parse(p);
});

test('limit caps the number of products', async () => {
  const body = JSON.parse((await search(await connect(), { query: 'leite', limit: 2 })).content[0].text);
  assert.equal(body.count, 2);
  assert.equal(body.products.length, 2);
});

test('no results is count 0, not an error', async () => {
  const result = await search(await connect({ body: '<html><body>Sem resultados</body></html>' }), { query: 'xyz' });
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), { store: 'pingo-doce', query: 'xyz', count: 0, products: [] });
});

test('a page that changed returns isError with the reason', async () => {
  const result = await search(await connect({ body: html.replaceAll('class="sales', 'class="x') }), { query: 'leite' });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Error: pingo-doce: não encontrei os preços na página (o site pode ter mudado)');
});

test('a block returns isError', async () => {
  const result = await search(await connect({ body: '', status: 429 }), { query: 'leite' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /HTTP 429/);
});

test('invalid input is rejected', async () => {
  const client = await connect();
  for (const args of [{ query: '' }, { query: 'a\nb' }, { query: 'x'.repeat(251) }, { query: 'leite', limit: 0 }, { query: 'leite', limit: 51 }]) {
    assert.equal((await search(client, args)).isError, true, JSON.stringify(args).slice(0, 40));
  }
});

test('a failed login comes back as an error sentence', async () => {
  const env = { PINGODOCE_STATE_DIR: mkdtempSync(join(tmpdir(), 'pd-')) };
  const session = { request: async () => ({ status: 200, json: null }), login: async () => { throw new Error('pingo-doce: a janela de login foi fechada antes de o login terminar; tenta de novo'); }, logout: async () => {}, close: async () => {} };
  const server = new PingoDoceServer({ env, session });
  const result = await server.callTool('login', {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error: pingo-doce: a janela de login foi fechada/);
});

test('close_session always answers', async () => {
  const result = await (await connect()).callTool({ name: 'close_session', arguments: {} });
  assert.equal(result.content[0].text, 'Sessão fechada.');
});
