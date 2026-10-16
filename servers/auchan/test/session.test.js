import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSession } from '../src/session.js';

const EMAIL = 'vasco@example.com';
const PASSWORD = 'segredo-123';
const CREDENTIALS = { email: EMAIL, password: PASSWORD };
const COOKIES = [{ name: 'sid', value: 'abc', domain: 'www.auchan.pt', path: '/' }];
const ORIGINS = [{ origin: 'https://www.auchan.pt', localStorage: [{ name: 'device', value: 'known' }] }];
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

// A fake Playwright and a fake auchan.pt. `site.loggedIn` is what the shop thinks; the login form
// only sets it when the right password was typed. Simulated: the real selectors were read from
// login.auchan.pt/authorization and the real flow is only checked live.
function fakePlaywright({ challenge = false, deliveryOk = true, missingChannels = [] } = {}) {
  const site = { loggedIn: false, filled: {}, launches: [], clicked: [], browsersClosed: 0, apis: [], rotated: null };
  const requester = () => ({
    async get(url) {
      if (url.includes('Cart-Show')) return response('https://www.auchan.pt/pt/carrinho-compras', { text: `<body data-authenticated="${site.loggedIn}">` });
      if (url.includes('Delivery-Header')) return response(url, { text: `<div data-has-context="${deliveryOk}"></div>` });
      return response(url, { text: '<html></html>' });
    },
    async post(url) { return response(url, { text: '{}' }); },
    async dispose() {},
    async storageState() { return { cookies: site.rotated ?? COOKIES, origins: [] }; },
  });
  const locator = (selector) => {
    const field = selector.includes('uname1') ? 'email' : selector.includes('passwordLogin') ? 'password' : selector.includes('btnSubmit_login') ? 'submit' : 'other';
    const handle = {
      first: () => handle,
      async fill(value) { site.filled[field] = value; },
      async click() {
        site.clicked.push(field);
        if (field === 'submit' && site.filled.password === PASSWORD && site.filled.email === EMAIL) site.loggedIn = true;
      },
      async count() { return challenge ? 1 : 0; },
    };
    return handle;
  };
  return {
    site,
    load: async () => ({
      chromium: {
        async launch(options) {
          site.launches.push(options);
          if (options.channel ? missingChannels.includes(options.channel) : missingChannels.includes('bundled')) throw new Error('not installed');
          return {
            async close() { site.browsersClosed++; },
            async newContext(contextOptions) {
              site.contextOptions = contextOptions;
              return {
                request: requester(),
                async storageState() { return STATE; },
                async newPage() {
                  return {
                    async goto(url) { site.gotoUrl = url; },
                    locator,
                    async waitForURL() { if (!site.loggedIn) throw new Error('timeout'); },
                  };
                },
              };
            },
          };
        },
      },
      request: {
        async newContext(options) { const api = Object.assign(requester(), { options }); site.apis.push(api); return api; },
      },
    }),
  };
}

const quick = { keepAliveMs: 0, log() {}, loginTimeoutMs: 50 };

test('a saved session that still works logs in nowhere', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  const fake = fakePlaywright();
  fake.site.loggedIn = true;
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'saved');
  assert.equal(fake.site.launches.length, 0, 'no browser was needed');
});

test('without a session it logs in by itself in a background browser and saves the session', async (t) => {
  const cookieFile = tmp(t);
  const fake = fakePlaywright();
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'login');
  assert.deepEqual(fake.site.launches[0], { headless: true, channel: 'msedge' }, 'headless, with the Edge the person already has');
  assert.equal(fake.site.filled.email, EMAIL);
  assert.equal(fake.site.filled.password, PASSWORD);
  assert.ok(fake.site.clicked.includes('submit'));
  assert.equal(fake.site.browsersClosed, 1);
  const saved = readFileSync(cookieFile, 'utf8');
  assert.deepEqual(JSON.parse(saved), STATE, 'cookies and local storage are both kept');
  assert.ok(!saved.includes(PASSWORD) && !saved.includes(EMAIL), 'the credentials never reach the session file');
  assert.equal(await session.login(), 'saved', 'and the second call reuses it');
  assert.equal(fake.site.launches.length, 1);
});

test('it logs in again by itself when the shop ended the session', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  const fake = fakePlaywright(); // the shop no longer knows the saved session
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'login');
  assert.equal(fake.site.launches.length, 1);
  assert.equal(fake.site.launches[0].headless, true, 'never a window');
});

test('without a credentials file the error says exactly what to create', async (t) => {
  const fake = fakePlaywright();
  const session = createSession({ credentials: null, credentialFile: 'C:/x/credentials.env', cookieFile: tmp(t), loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), /falta o ficheiro C:\/x\/credentials\.env com as linhas AUCHAN_EMAIL=.* e AUCHAN_PASSWORD=/);
  assert.equal(fake.site.launches.length, 0);
});

test('a login form that is not the expected one says so, without the credentials', async (t) => {
  const fake = fakePlaywright();
  const load = fake.load;
  fake.load = async () => {
    const pw = await load();
    const launch = pw.chromium.launch;
    pw.chromium.launch = async (o) => {
      const b = await launch(o);
      const newContext = b.newContext;
      b.newContext = async (c) => { const ctx = await newContext(c); const newPage = ctx.newPage; ctx.newPage = async () => { const p = await newPage(); p.locator = () => ({ first() { return this; }, async fill() { throw new Error('Timeout waiting for locator'); }, async click() {}, async count() { return 0; } }); return p; }; return ctx; };
      return b;
    };
    return pw;
  };
  const session = createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), (e) => /formulário de login do Auchan não é o esperado/.test(e.message) && !e.message.includes(PASSWORD));
});

test('a wrong password gives a fixed message that does not contain the credentials', async (t) => {
  const fake = fakePlaywright();
  const session = createSession({ credentials: { email: EMAIL, password: 'errada' }, cookieFile: tmp(t), loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), (e) => /o login não terminou/.test(e.message) && !e.message.includes(EMAIL) && !e.message.includes('errada'));
});

test('a CAPTCHA at login stops with an error and is never worked around', async (t) => {
  const fake = fakePlaywright({ challenge: true });
  const session = createSession({ credentials: { email: EMAIL, password: 'errada' }, cookieFile: tmp(t), loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), /verificação anti-robô \(CAPTCHA\)/);
});

test('a login that works but has no delivery chosen says to choose it once on auchan.pt', async (t) => {
  const fake = fakePlaywright({ deliveryOk: false });
  const session = createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: fake.load, ...quick });
  await assert.rejects(session.login(), /escolhe-a uma vez no auchan\.pt/);
});

test('Edge missing falls back to Chrome, then to the bundled Chromium', async (t) => {
  const chromeOnly = fakePlaywright({ missingChannels: ['msedge'] });
  await createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: chromeOnly.load, ...quick }).login();
  assert.deepEqual(chromeOnly.site.launches.map(l => l.channel), ['msedge', 'chrome']);

  const bundled = fakePlaywright({ missingChannels: ['msedge', 'chrome'] });
  await createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: bundled.load, ...quick }).login();
  assert.deepEqual(bundled.site.launches.map(l => l.channel), ['msedge', 'chrome', undefined]);

  const none = fakePlaywright({ missingChannels: ['msedge', 'chrome', 'bundled'] });
  await assert.rejects(createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: none.load, ...quick }).login(), /não encontrei o Microsoft Edge nem o Google Chrome/);
});

test('a missing Playwright package is reported in Portuguese', async (t) => {
  const session = createSession({ credentials: CREDENTIALS, cookieFile: tmp(t), loadPlaywright: async () => { throw new Error('nope'); }, ...quick });
  await assert.rejects(session.login(), /falta o Playwright/);
});

test('logout deletes the saved session', async (t) => {
  const cookieFile = tmp(t);
  const fake = fakePlaywright();
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick });
  await session.login();
  assert.ok(existsSync(cookieFile));
  await session.logout();
  assert.equal(existsSync(cookieFile), false);
});

test('the keep-alive saves what the site renews and logs in again when the shop ends the session', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(STATE));
  const fake = fakePlaywright();
  fake.site.loggedIn = true;
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick, keepAliveMs: 20 });
  assert.equal(await session.login(), 'saved');
  fake.site.rotated = [{ name: 'sid', value: 'renewed', domain: 'www.auchan.pt', path: '/' }];
  await new Promise(r => setTimeout(r, 3500));
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')).cookies, fake.site.rotated, 'renewed cookies are saved');
  assert.deepEqual(JSON.parse(readFileSync(cookieFile, 'utf8')).origins, ORIGINS, 'local storage is not lost');

  fake.site.loggedIn = false; // the shop ends the session while the server is idle
  await new Promise(r => setTimeout(r, 6000));
  await session.close();
  assert.equal(fake.site.launches.length, 1, 'it logged in again by itself, in the background');
  assert.equal(fake.site.launches[0].headless, true);
});

test('an old cookies-only session file is still read', async (t) => {
  const cookieFile = tmp(t);
  writeFileSync(cookieFile, JSON.stringify(COOKIES));
  const fake = fakePlaywright();
  fake.site.loggedIn = true;
  const session = createSession({ credentials: CREDENTIALS, cookieFile, loadPlaywright: fake.load, ...quick });
  assert.equal(await session.login(), 'saved');
});
