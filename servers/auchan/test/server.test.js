import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AuchanServer } from '../src/index.js';
import { ProductSchema } from '../src/shared.js';

const SERVER = fileURLToPath(new URL('../src/index.js', import.meta.url));
const html = readFileSync(new URL('../../../shared/fixtures/auchan-leite.html', import.meta.url), 'utf8');

// Each test gets its own state dir, so nothing reads or writes the real ~/.auchan-mcp.
function stateDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'auchan-server-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function listToolsOverStdio(dir) {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, AUCHAN_STATE_DIR: dir },
    stderr: 'ignore',
  }));
  try {
    return (await client.listTools()).tools.map(tool => tool.name);
  } finally {
    await client.close();
  }
}

test('the server offers search, cart, login and close_session, and nothing for checkout or payment', async (t) => {
  const tools = await listToolsOverStdio(stateDir(t));
  assert.deepEqual(tools, ['search_products', 'get_cart', 'add_to_cart', 'update_cart_item', 'login', 'logout', 'close_session']);
  assert.ok(!tools.some(name => /checkout|order|pay/i.test(name)));
});

test('search_products answers with the contract JSON', async (t) => {
  const server = new AuchanServer({
    env: { AUCHAN_STATE_DIR: stateDir(t) },
    fetchImpl: async () => new Response(html, { status: 200 }),
  });
  const result = await server.callTool('search_products', { query: 'leite', limit: 2 });
  assert.equal(result.isError, undefined);
  assert.equal(result.content.length, 1);
  const body = JSON.parse(result.content[0].text);
  assert.deepEqual(Object.keys(body), ['store', 'query', 'count', 'products']);
  assert.equal(body.count, 2);
  body.products.forEach(p => ProductSchema.parse(p));
});

test('errors come back as isError with a sentence that says what failed', async (t) => {
  const env = { AUCHAN_STATE_DIR: stateDir(t) };
  const changed = new AuchanServer({ env, fetchImpl: async () => new Response(html.replace(/class="sales"/g, 'class="x"')) });
  const result = await changed.callTool('search_products', { query: 'leite' });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Error: auchan: não encontrei os preços na página (o site pode ter mudado)');

  const blocked = new AuchanServer({ env, fetchImpl: async () => new Response('', { status: 429 }) });
  assert.match((await blocked.callTool('search_products', { query: 'iogurte' })).content[0].text, /^Error: auchan: o site bloqueou/);

  assert.equal((await changed.callTool('search_products', { query: '' })).isError, true);
  assert.equal((await changed.callTool('search_products', { query: 'leite', limit: 51 })).isError, true);
});

test('cart tools use the session and close_session closes it', async (t) => {
  let closed = 0;
  const site = {
    async get() { return { status: 200, text: '<input name="csrf_token" value="t"><div class="auc-cart__product-card" data-pid="1"><input class="auc-js-update-product-quantity" data-uuid="u" value="2.0"></div>' }; },
    async post() { throw new Error('no writes in this test'); },
  };
  const server = new AuchanServer({
    env: { AUCHAN_STATE_DIR: stateDir(t, 'AUCHAN_EMAIL=a@b.pt\nAUCHAN_PASSWORD=segredo\n') },
    session: { site, async close() { closed++; } },
  });
  const response = (await server.callTool('get_cart', {})).content[0].text;
  assert.deepEqual(JSON.parse(response), { store: 'auchan', count: 1, items: [{ product_id: '1', name: null, quantity: 2, price: null }], total: null });
  assert.doesNotMatch(response, /csrf|uuid|"t"|"u"/, 'no site token or line id in the response');
  assert.equal((await server.callTool('add_to_cart', { product_id: 'abc' })).isError, true);
  assert.equal((await server.callTool('close_session', {})).content[0].text, 'Session closed.');
  assert.equal(closed, 1);
});

test('add_to_cart and update_cart_item answer with one short sentence, errors with isError', async (t) => {
  let qty = 0;
  let rejectWrites = false;
  const site = {
    async get(path) {
      if (path.includes('Cart-Show')) {
        return { status: 200, text: qty ? `<div class="auc-cart__product-card" data-pid="3010403"><input class="auc-js-update-product-quantity" data-uuid="u" value="${qty}"></div>` : '<html></html>' };
      }
      if (rejectWrites) return { status: 200, text: '{"error":true,"message":"Produto sem stock"}' };
      const q = new URL(path, 'https://www.auchan.pt').searchParams;
      qty = path.includes('RemoveProductLineItem') ? 0 : Number(q.get('quantity'));
      return { status: 200, text: '{}' };
    },
    async post(path, form) {
      if (rejectWrites) return { status: 200, text: '{"error":true,"message":"Produto sem stock"}' };
      qty += Number(form.quantity);
      return { status: 200, text: '{"error":false}' };
    },
  };
  const server = new AuchanServer({
    env: { AUCHAN_STATE_DIR: stateDir(t, 'AUCHAN_EMAIL=a@b.pt\nAUCHAN_PASSWORD=segredo\n') },
    session: { site, async close() {} },
  });
  const reply = async (name, args) => {
    const result = await server.callTool(name, args);
    assert.equal(result.content.length, 1);
    return { text: result.content[0].text, isError: result.isError === true };
  };
  const note = 'A encomenda e o pagamento fazem-se no site auchan.pt.';

  assert.deepEqual(await reply('add_to_cart', { product_id: '3010403', quantity: 2 }),
    { text: `Adicionado ao carrinho: 3010403, agora com quantidade 2. Usa get_cart para rever. ${note}`, isError: false });
  assert.deepEqual(await reply('update_cart_item', { product_id: '3010403', quantity: 5 }),
    { text: `Quantidade de 3010403 no carrinho: 5. ${note}`, isError: false });
  assert.deepEqual(await reply('update_cart_item', { product_id: '3010403', quantity: 0 }),
    { text: `Removido do carrinho: 3010403. ${note}`, isError: false });
  assert.deepEqual(await reply('update_cart_item', { product_id: '999', quantity: 1 }),
    { text: 'Error: auchan: o produto 999 não está no carrinho.', isError: true });

  rejectWrites = true;
  qty = 1;
  assert.deepEqual(await reply('update_cart_item', { product_id: '3010403', quantity: 3 }),
    { text: 'Error: auchan: não consegui mudar 3010403 (Produto sem stock). Corre get_cart antes de tentar de novo.', isError: true });
});

test('login and logout talk to the session and say what happened', async (t) => {
  const calls = [];
  let answer = 'login';
  const server = new AuchanServer({
    env: { AUCHAN_STATE_DIR: stateDir(t) },
    session: { site: {}, async login() { calls.push('login'); return answer; }, async logout() { calls.push('logout'); }, async close() {} },
  });
  assert.equal((await server.callTool('login', {})).content[0].text, 'Sessão do Auchan iniciada com o ficheiro de credenciais. Já posso usar o teu carrinho.');
  answer = 'saved';
  assert.equal((await server.callTool('login', {})).content[0].text, 'Já tens a sessão do Auchan iniciada.');
  assert.match((await server.callTool('logout', {})).content[0].text, /apaguei a sessão guardada/);
  assert.deepEqual(calls, ['login', 'login', 'logout']);
});

test('a login that fails comes back as an error sentence', async (t) => {
  const server = new AuchanServer({
    env: { AUCHAN_STATE_DIR: stateDir(t) },
    session: { site: {}, async login() { throw new Error('o login não terminou; confirma o email e a palavra-passe no ficheiro de credenciais'); }, async close() {} },
  });
  const result = await server.callTool('login', {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Error: auchan: o login não terminou/);
});
