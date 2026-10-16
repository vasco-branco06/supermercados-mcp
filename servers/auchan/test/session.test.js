import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSession } from '../src/session.js';

const COOKIES = [{ name: 'sid', value: 'abc', domain: 'www.auchan.pt', path: '/' }];
const ORIGINS = [{ origin: 'https://login.auchan.pt', localStorage: [{ name: 'device', value: 'known' }] }];
const STATE = { cookies: COOKIES, origins: ORIGINS };

function tmp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'auchan-session-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'cookies.json');
}

const response = (url, { status = 200, text = '' } = {}) => ({
  status: () => status,
  ok: () => status >= 200 && status < 300,
  url: () => url,
  text: async () => text,
});
const CART = 'https://www.auchan.pt/pt/carrinho-compras';

// A fake Playwright: `accountOk` decides what the account page says; `launches` records the browser windows.
function fakePlaywright({ accountOk = () => true, deliveryOk = () => true, silentFails = false, missingChannels = [], windowClosesAfter = Infinity, afterLoginUrl = 'https://www.auchan.pt/pt/' } = {}) {
  const launches = [];
  const apis = [];
  const state = { polls: 0, urlCalls: 0, windowClosed: 0, pageUrl: 'https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Login-OAuthLogin' };
  const requester = (pages) => ({
    async get(url) {
      if (url.includes('Cart-Show')) return response(CART, { text: `<body data-authenticated="${accountOk()}">` });
      if (url.includes('Delivery-Header')) return response(url, { text: `<div data-has-context="${deliveryOk()}"></div>` });
      return response(pages?.[url] ?? url, { text: '<html></html>' });
    },
    async post(url) { return response(url, { text: '{}' }); },
    async dispose() {},
    async storageState() { return { cookies: state.rotated ?? COOKIES }; },
  });
  return {
    launches, apis, state,
    chromium: {
      async launch(options) {
        launches.push(options);
        if (options.channel ? missingChannels.includes(options.channel) : missingChannels.includes('bundled')) throw new Error('not installed');
        let onDisconnect;
        const headless = options.headless;
        return {
          on(event, fn) { if (event === 'disconnected') onDisconnect = fn; },
          async close() { state.windowClosed++; },
          async newContext(options) {
            state.contextOptions = options;
            return {
              request: { get: async (url) => { state.polls++; if (state.polls >= windowClosesAfter) onDisconnect?.(); return requester().get(url); } },
              async cookies() { return COOKIES; },
              async storageState() { return STATE; },
              async newPage() {
                return {
                  async goto(url) { state.gotoUrl = url; },
                  url() { return !(headless && silentFails) && state.urlCalls++ >= 1 ? afterLoginUrl : state.pageUrl; },
                };
              },
            };
          },
        };
      },
    },
    request: {
      async newContext(options) {
        const api = Object.assign(requester(), { options });
        apis.push(api);
        return api;
      },
    },
  };
}

const quick = { keepAliveMs: 0, pollMs: 1, sleep: ms => new Promise(r => setTimeout(r, ms)), log() {} };

test('a saved session that still works opens no browser window', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: async () => fake, ...quick });
  const reply = await session.site.get('/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Cart-Show');
  assert.equal(reply.status, 200);
  assert.equal(fake.launches.length, 0);
  assert.deepEqual(fake.apis[0].options.storageState.cookies, COOKIES);
  assert.equal(await session.login(), 'saved');
});

test('without a session a visible window opens, the cookies are saved and the window closes', async (t) => {
  const cookieFile = tmp(t);
  const fake = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: async () => fake, ...quick });
  assert.equal(await session.login(), 'window');
  assert.deepEqual(fake.launches[0], { headless: false, channel: 'msedge' });
  assert.equal(fake.state.windowClosed, 1);
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')), STATE, 'cookies and local storage are both kept');
  assert.deepEqual(fake.apis.at(-1).options.storageState.cookies, COOKIES);
  assert.equal(await session.login(), 'saved');
});

test('Edge missing falls back to Chrome, then to the bundled Chromium', async (t) => {
  const chromeOnly = fakePlaywright({ missingChannels: ['msedge'] });
  await createSession({ cookieFile: tmp(t), loadPlaywright: async () => chromeOnly, ...quick }).login();
  assert.deepEqual(chromeOnly.launches.map(l => l.channel), ['msedge', 'chrome']);

  const bundled = fakePlaywright({ missingChannels: ['msedge', 'chrome'] });
  await createSession({ cookieFile: tmp(t), loadPlaywright: async () => bundled, ...quick }).login();
  assert.deepEqual(bundled.launches.map(l => l.channel), ['msedge', 'chrome', undefined]);
});

test('no browser at all gives a clear message', async (t) => {
  const none = fakePlaywright({ missingChannels: ['msedge', 'chrome', 'bundled'] });
  const session = createSession({ cookieFile: tmp(t), loadPlaywright: async () => none, ...quick });
  await assert.rejects(session.login(), /não encontrei o Microsoft Edge nem o Google Chrome/);
});

test('closing the window before logging in ends with an error and saves nothing', async (t) => {
  const cookieFile = tmp(t);
  const fake = fakePlaywright({ accountOk: () => false, windowClosesAfter: 2 });
  const session = createSession({ cookieFile, loadPlaywright: async () => fake, ...quick });
  await assert.rejects(session.login(), /a janela de login foi fechada/);
  assert.equal(existsSync(cookieFile), false);
});

test('the person has a limited time to log in', async (t) => {
  const fake = fakePlaywright({ accountOk: () => false, afterLoginUrl: 'https://login.example.com/' });
  const session = createSession({ cookieFile: tmp(t), loadPlaywright: async () => fake, loginTimeoutMs: 30, ...quick });
  await assert.rejects(session.login(), /o login não terminou/);
  assert.equal(fake.state.windowClosed, 1);
});

test('logout deletes the saved session', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const session = createSession({ cookieFile, loadPlaywright: async () => fakePlaywright(), ...quick });
  await session.login();
  await session.logout();
  assert.equal(existsSync(cookieFile), false);
});

test('a missing Playwright package is reported in Portuguese', async (t) => {
  const session = createSession({ cookieFile: tmp(t), loadPlaywright: async () => { throw new Error('nope'); }, ...quick });
  await assert.rejects(session.login(), /falta o Playwright/);
});

test('a login without a delivery choice keeps the window open until the person picks one', async (t) => {
  const cookieFile = tmp(t);
  // The delivery choice only shows up in the site header after the window was polled a few times.
  const probe = fakePlaywright({ deliveryOk: () => probe.state.polls >= 3 });
  const session = createSession({ cookieFile, loadPlaywright: async () => probe, ...quick });
  assert.equal(await session.login(), 'window');
  assert.ok(probe.state.polls >= 3, 'the window waited for the delivery choice');
  assert.equal(probe.state.windowClosed, 1);
});

test('a saved login that lacks the delivery choice reopens the site with that login', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const probe = fakePlaywright({ deliveryOk: () => probe.state.polls >= 2 });
  // The saved session answers "no delivery" until the person picks one in the window.
  const session = createSession({ cookieFile, loadPlaywright: async () => probe, ...quick });
  assert.equal(await session.login(), 'window');
  assert.deepEqual(probe.state.contextOptions.storageState.cookies, COOKIES, 'the saved login is loaded into the window');
  assert.equal(probe.state.gotoUrl, 'https://www.auchan.pt/pt/', 'it opens the site, not the login page');
});

test('cookies the site renewed while running are saved for next time', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const probe = fakePlaywright();
  probe.state.rotated = [{ name: 'dwsid', value: 'renewed', domain: 'www.auchan.pt', path: '/' }];
  const session = createSession({ cookieFile, loadPlaywright: async () => probe, ...quick });
  await session.site.get('/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Cart-Show');
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')), { cookies: probe.state.rotated, origins: [] });
});

test('the session is kept alive while the server runs, and what the site renews is saved', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  const probe = fakePlaywright();
  const session = createSession({ cookieFile, loadPlaywright: async () => probe, ...quick, keepAliveMs: 20 });
  assert.equal(await session.login(), 'saved');
  const before = probe.state.requests;
  probe.state.rotated = [{ name: 'dwsid', value: 'kept-alive', domain: 'www.auchan.pt', path: '/' }];
  await new Promise(r => setTimeout(r, 3500));
  await session.close();
  assert.ok(probe.state.polls >= 0);
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')).cookies, probe.state.rotated);
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')).origins, ORIGINS, 'local storage is not lost');
});


test('a session that expires while idle makes the next cart call ask the person, never opens a window by itself', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  let expired = false;
  const probe = fakePlaywright({ accountOk: () => !expired });
  const session = createSession({ cookieFile, loadPlaywright: async () => probe, ...quick, keepAliveMs: 20 });
  await session.login();
  expired = true;
  await new Promise(r => setTimeout(r, 3500));
  await session.close();
  assert.equal(probe.launches.length, 0, 'the keep-alive never opens a window');
});
