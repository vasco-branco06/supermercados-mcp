import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadCredentials, parseEnvFile } from '../src/credentials.js';
import { createQueue } from '../src/reliability.js';
import { createSession } from '../src/session.js';
import { PingoDoceServer } from '../src/index.js';

const EMAIL = 'vasco@example.com';
const PASSWORD = 'segredo-123';

// Minimal stand-in for Playwright's chromium. Logged out until the login form is submitted
// with the right password. Simulated; the real selectors are only checked live.
function fakePlaywright({ acceptLogin = true } = {}) {
  const state = { loggedIn: false, filled: {}, launches: 0, closed: 0, requests: [] };
  const response = (status, json = null) => ({ status: () => status, json: async () => json });
  const context = {
    addCookies: async () => {},
    cookies: async () => [{ name: 'dwsid', value: 'session-cookie', domain: 'www.pingodoce.pt', path: '/' }],
    newPage: async () => ({
      goto: async () => {},
      locator: () => ({ click: async () => {}, first: () => ({ click: async () => { if (acceptLogin && state.filled['input[name="loginPassword"]'] === PASSWORD) state.loggedIn = true; } }) }),
      fill: async (selector, value) => { state.filled[selector] = value; },
      waitForResponse: async () => {},
      close: async () => {},
    }),
    request: {
      get: async (url) => {
        state.requests.push(url);
        if (url.endsWith('Account-Show')) return response(state.loggedIn ? 200 : 302);
        return response(200, { items: [], totals: { grandTotal: '0,00 €' } });
      },
      post: async (url, options) => { state.requests.push(url); return response(200, { error: false, cart: { items: [{ id: options.form.pid, quantity: options.form.quantity, UUID: 'u' }] } }); },
    },
  };
  const browser = { on: () => {}, newContext: async () => context, close: async () => { state.closed++; } };
  return { state, load: async () => ({ chromium: { launch: async () => { state.launches++; return browser; } } }) };
}

const tempDir = () => mkdtempSync(join(tmpdir(), 'pd-session-'));

test('parseEnvFile reads KEY=VALUE lines and ignores comments', () => {
  assert.deepEqual(parseEnvFile('# c\nPINGODOCE_EMAIL = a@b.pt\r\nPINGODOCE_PASSWORD="x y"\n\n'), { PINGODOCE_EMAIL: 'a@b.pt', PINGODOCE_PASSWORD: 'x y' });
});

test('loadCredentials needs both values in credentials.env', () => {
  const dir = tempDir();
  const env = { PINGODOCE_STATE_DIR: dir };
  assert.equal(loadCredentials(env), null);
  writeFileSync(join(dir, 'credentials.env'), `PINGODOCE_EMAIL=${EMAIL}\n`);
  assert.equal(loadCredentials(env), null);
  writeFileSync(join(dir, 'credentials.env'), `PINGODOCE_EMAIL=${EMAIL}\nPINGODOCE_PASSWORD=${PASSWORD}\n`);
  assert.deepEqual(loadCredentials(env), { email: EMAIL, password: PASSWORD });
});

test('logs in once, saves cookies and reuses the session', async () => {
  const dir = tempDir();
  const fake = fakePlaywright();
  const session = createSession({ credentials: { email: EMAIL, password: PASSWORD }, cookieFile: join(dir, 'cookies.json'), throttle: createQueue(), version: '1', loadPlaywright: fake.load });
  assert.equal((await session.request('Cart-Get')).status, 200);
  await session.request('Cart-Get');
  assert.equal(fake.state.launches, 1);
  assert.equal(fake.state.filled['input[name="loginEmail"]'], EMAIL);
  const cookies = readFileSync(join(dir, 'cookies.json'), 'utf8');
  assert.match(cookies, /dwsid/);
  assert.doesNotMatch(cookies, new RegExp(PASSWORD));
  await session.close();
  assert.equal(fake.state.closed, 1);
});

test('a failed login gives a fixed message without the credentials', async () => {
  const fake = fakePlaywright({ acceptLogin: false });
  const session = createSession({ credentials: { email: EMAIL, password: PASSWORD }, cookieFile: join(tempDir(), 'cookies.json'), throttle: createQueue(), version: '1', loadPlaywright: fake.load });
  await assert.rejects(session.request('Cart-Get'), (e) => /o login falhou/.test(e.message) && !e.message.includes(EMAIL) && !e.message.includes(PASSWORD));
});

test('missing Playwright gives an install hint', async () => {
  const session = createSession({ credentials: { email: EMAIL, password: PASSWORD }, cookieFile: join(tempDir(), 'c.json'), throttle: createQueue(), version: '1', loadPlaywright: async () => { throw new Error('Cannot find package'); } });
  await assert.rejects(session.request('Cart-Get'), /playwright install chromium/);
});

test('with credentials the server lists the cart tools and never echoes secrets', async () => {
  const dir = tempDir();
  writeFileSync(join(dir, 'credentials.env'), `PINGODOCE_EMAIL=${EMAIL}\nPINGODOCE_PASSWORD=${PASSWORD}\n`);
  const fake = fakePlaywright();
  const server = new PingoDoceServer({ env: { PINGODOCE_STATE_DIR: dir }, loadPlaywright: fake.load });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.server.connect(a), client.connect(b)]);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['search_products', 'get_cart', 'add_to_cart', 'update_cart_item', 'close_session']);

  const outputs = [];
  for (const [name, args] of [['get_cart', {}], ['add_to_cart', { product_id: '48150', quantity: 2 }], ['add_to_cart', { product_id: '../x' }], ['close_session', {}]]) {
    outputs.push((await client.callTool({ name, arguments: args })).content[0].text);
  }
  assert.deepEqual(JSON.parse(outputs[0]), { store: 'pingo-doce', count: 0, items: [], total: '0,00 €' });
  assert.match(outputs[1], /Adicionado ao carrinho: 48150, agora com quantidade 2/);
  assert.match(outputs[2], /Invalid product_id/);
  for (const out of outputs) assert.ok(!out.includes(EMAIL) && !out.includes(PASSWORD) && !out.includes('session-cookie'));
});
