import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createQueue } from '../src/reliability.js';
import { createSession } from '../src/session.js';
import { PingoDoceServer } from '../src/index.js';

const COOKIES = [{ name: 'dwsid', value: 'session-cookie', domain: 'www.pingodoce.pt', path: '/' }];
const ORIGINS = [{ origin: 'https://www.pingodoce.pt', localStorage: [{ name: 'device', value: 'known' }] }];
const STATE = { cookies: COOKIES, origins: ORIGINS };

const response = (status, json = null) => ({ status: () => status, json: async () => json });

// Minimal stand-in for Playwright. `loggedIn()` decides what the account page says.
// Simulated; the real login page is only checked live, by a person.
function fakePlaywright({ loggedIn = () => true, missingChannels = [], windowClosesAfter = Infinity, afterLoginUrl = 'https://www.pingodoce.pt/home/' } = {}) {
  const launches = [];
  const apis = [];
  const state = { polls: 0, urlCalls: 0, windowClosed: 0, requests: [] };
  const requester = () => ({
    get: async (url) => {
      state.requests.push(url);
      if (url.includes('Account-Show')) return response(loggedIn() ? 200 : 302);
      return response(200, { items: [], totals: { grandTotal: '0,00 €' } });
    },
    post: async (url, options) => {
      state.requests.push(url);
      return response(200, { error: false, cart: { items: [{ id: options.form.pid, quantity: options.form.quantity, UUID: 'u' }] } });
    },
    dispose: async () => {},
    storageState: async () => ({ cookies: state.rotated ?? COOKIES, origins: [] }),
  });
  return {
    launches, apis, state,
    load: async () => ({
      chromium: {
        launch: async (options) => {
          launches.push(options);
          if (options.channel ? missingChannels.includes(options.channel) : missingChannels.includes('bundled')) throw new Error('not installed');
          let onDisconnect;
          return {
            on: (event, fn) => { if (event === 'disconnected') onDisconnect = fn; },
            close: async () => { state.windowClosed++; },
            newContext: async () => ({
              request: { get: async (url) => { state.polls++; if (state.polls >= windowClosesAfter) onDisconnect?.(); return requester().get(url); } },
              storageState: async () => STATE,
              newPage: async () => ({
                goto: async () => {},
                locator: () => ({ click: async () => {} }),
                url: () => (state.urlCalls++ >= 1 ? afterLoginUrl : 'https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Login-Show'),
              }),
            }),
          };
        },
      },
      request: {
        newContext: async (options) => { const api = Object.assign(requester(), { options }); apis.push(api); return api; },
      },
    }),
  };
}

const tempFile = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pd-session-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'cookies.json');
};
const quick = { throttle: createQueue(), version: '1', keepAliveMs: 0, pollMs: 1, log() {} };

test('a saved session that still works opens no browser window', async (t) => {
  const cookieFile = tempFile(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal((await session.request('Cart-Get')).status, 200);
  assert.equal(fake.launches.length, 0);
  assert.deepEqual(fake.apis[0].options.storageState.cookies, COOKIES);
  assert.equal(await session.login(), 'saved');
});

test('without a session a visible window opens, the cookies are saved and the window closes', async (t) => {
  const cookieFile = tempFile(t);
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'window');
  assert.deepEqual(fake.launches[0], { headless: false, channel: 'msedge' });
  assert.equal(fake.state.windowClosed, 1);
  const saved = readFileSync(cookieFile, 'utf8');
  assert.deepEqual(JSON.parse(saved), STATE, 'cookies and local storage are both kept');
  assert.deepEqual(fake.apis.at(-1).options.storageState.cookies, COOKIES);
  assert.equal(await session.login(), 'saved');
  await session.request('Cart-Get');
  assert.equal(fake.launches.length, 1, 'one window only');
});

test('Edge missing falls back to Chrome, then to the bundled Chromium', async (t) => {
  const chromeOnly = fakePlaywright({ missingChannels: ['msedge'] });
  await createSession({ cookieFile: tempFile(t), loadPlaywright: chromeOnly.load, ...quick }).login();
  assert.deepEqual(chromeOnly.launches.map((l) => l.channel), ['msedge', 'chrome']);

  const bundled = fakePlaywright({ missingChannels: ['msedge', 'chrome'] });
  await createSession({ cookieFile: tempFile(t), loadPlaywright: bundled.load, ...quick }).login();
  assert.deepEqual(bundled.launches.map((l) => l.channel), ['msedge', 'chrome', undefined]);
});

test('no browser at all gives a clear message', async (t) => {
  const none = fakePlaywright({ missingChannels: ['msedge', 'chrome', 'bundled'] });
  const session = createSession({ cookieFile: tempFile(t), loadPlaywright: none.load, ...quick });
  await assert.rejects(session.login(), /não encontrei o Microsoft Edge nem o Google Chrome/);
});

test('closing the window before logging in ends with an error and saves nothing', async (t) => {
  const cookieFile = tempFile(t);
  const fake = fakePlaywright({ loggedIn: () => false, windowClosesAfter: 2 });
  const session = createSession({ cookieFile, loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), /a janela de login foi fechada/);
  assert.equal(existsSync(cookieFile), false);
});

test('the person has a limited time to log in', async (t) => {
  const fake = fakePlaywright({ loggedIn: () => false, afterLoginUrl: 'https://login.example.com/' });
  const session = createSession({ cookieFile: tempFile(t), loadPlaywright: fake.load, loginTimeoutMs: 30, ...quick });
  await assert.rejects(session.login(), /o login não terminou/);
  assert.equal(fake.state.windowClosed, 1);
});

test('a session that ends while running is checked again and the call is retried once', async (t) => {
  const cookieFile = tempFile(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  let expireNext = false;
  const load = async () => {
    const pw = await fake.load();
    const newContext = pw.request.newContext;
    pw.request.newContext = async (options) => {
      const api = await newContext(options);
      const get = api.get;
      api.get = async (url, opts) => {
        if (expireNext && url.includes('Cart-Get')) { expireNext = false; return response(302); }
        return get(url, opts);
      };
      return api;
    };
    return pw;
  };
  const session = createSession({ cookieFile, loadPlaywright: load, ...quick });
  assert.equal((await session.request('Cart-Get')).status, 200);
  expireNext = true;
  assert.equal((await session.request('Cart-Get')).status, 200, 'the second call recovers');
  assert.equal(fake.state.requests.filter((url) => url.includes('Account-Show')).length, 2, 'the session was checked again');
  assert.equal(fake.launches.length, 0, 'the saved session was still good, so no window');
});

test('logout deletes the saved session', async (t) => {
  const cookieFile = tempFile(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const session = createSession({ cookieFile, loadPlaywright: fakePlaywright().load, ...quick });
  await session.login();
  await session.logout();
  assert.equal(existsSync(cookieFile), false);
});

test('missing Playwright gives an install hint', async (t) => {
  const session = createSession({ cookieFile: tempFile(t), loadPlaywright: async () => { throw new Error('nope'); }, ...quick });
  await assert.rejects(session.login(), /falta o Playwright/);
});

test('the server lists the cart and login tools, and never echoes the session', async (t) => {
  const cookieFile = tempFile(t);
  const dir = join(cookieFile, '..');
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  const server = new PingoDoceServer({ env: { PINGODOCE_STATE_DIR: dir }, loadPlaywright: fake.load });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.server.connect(a), client.connect(b)]);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ['search_products', 'get_cart', 'add_to_cart', 'update_cart_item', 'login', 'logout', 'close_session']);
  assert.ok(!tools.some((tool) => /checkout|order|pay/i.test(tool.name)));

  const outputs = [];
  for (const [name, args] of [['login', {}], ['get_cart', {}], ['add_to_cart', { product_id: '48150', quantity: 2 }], ['add_to_cart', { product_id: '../x' }], ['logout', {}], ['close_session', {}]]) {
    outputs.push((await client.callTool({ name, arguments: args })).content[0].text);
  }
  assert.equal(outputs[0], 'Já tens a sessão do Pingo Doce iniciada.');
  assert.deepEqual(JSON.parse(outputs[1]), { store: 'pingo-doce', count: 0, items: [], total: '0,00 €' });
  assert.match(outputs[2], /Adicionado ao carrinho: 48150, agora com quantidade 2/);
  assert.match(outputs[3], /Invalid product_id/);
  assert.match(outputs[4], /apaguei a sessão guardada/);
  for (const out of outputs) assert.ok(!out.includes('session-cookie'));
  assert.equal(existsSync(cookieFile), false);
});

test('the session is kept alive while the server runs, and what the site renews is saved', async (t) => {
  const cookieFile = tempFile(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: fake.load, ...quick, keepAliveMs: 20 });
  assert.equal(await session.login(), 'saved');
  const checks = () => fake.state.requests.filter((url) => url.includes('Account-Show')).length;
  const before = checks();
  fake.state.rotated = [{ name: 'dwsid', value: 'kept-alive', domain: 'www.pingodoce.pt', path: '/' }];
  await new Promise((r) => setTimeout(r, 150));
  await session.close();
  assert.ok(checks() > before, 'the keep-alive asked the site');
  const saved = JSON.parse(readFileSync(cookieFile, 'utf8'));
  assert.deepEqual(saved.cookies, fake.state.rotated);
  assert.deepEqual(saved.origins, ORIGINS, 'local storage is not lost');
});

test('an old cookies-only file is still read', async (t) => {
  const cookieFile = tempFile(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'saved');
  assert.equal(fake.launches.length, 0);
});
