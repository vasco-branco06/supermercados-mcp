import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ACTIONS, actionUrl } from './cart.js';
import { BlockedError, userAgent } from './search.js';

const HOST = 'www.pingodoce.pt';
// Edge ships with Windows and Chrome is on most Macs, so nothing has to be downloaded.
const BROWSER_CHANNELS = ['msedge', 'chrome', undefined];
const NO_PLAYWRIGHT = 'pingo-doce: falta o Playwright; instala o pacote de novo (npm install pingo-doce-mcp)';
const NO_BROWSER = 'pingo-doce: não encontrei o Microsoft Edge nem o Google Chrome para abrir a janela de login; instala um deles ou corre "npx playwright install chromium"';

function checkBlocked(status) {
  if (status === 403 || status === 429) {
    throw new BlockedError(`pingo-doce: o site recusou o pedido (HTTP ${status}); não vou contornar, tenta mais tarde`);
  }
}

function readCookies(path) {
  if (!existsSync(path)) return null;
  try {
    const cookies = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(cookies) && cookies.length ? cookies : null;
  } catch {
    return null;
  }
}

// Login is done by the person, in a normal browser window; no password ever reaches this code.
// Only the session cookies are kept, in cookieFile. After login every cart request is plain HTTP
// through Playwright's request client, so the window is closed as soon as the login works.
export function createSession({
  cookieFile,
  throttle,
  version,
  log = console.error,
  loadPlaywright = () => import('playwright'),
  loginTimeoutMs = 5 * 60 * 1000,
  pollMs = 3000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let playwright = null;
  let api = null;
  let loggedIn = false;
  let pending = null;

  async function pw() {
    if (!playwright) {
      try { playwright = await loadPlaywright(); } catch { throw new Error(NO_PLAYWRIGHT); }
    }
    return playwright;
  }

  async function openApi(cookies) {
    await api?.dispose().catch(() => {});
    api = await (await pw()).request.newContext({
      userAgent: userAgent(version),
      locale: 'pt-PT',
      storageState: { cookies, origins: [] },
    });
  }

  // Account-Show answers 200 when logged in and redirects to the login page otherwise.
  async function checkLoggedIn(requester) {
    const response = await throttle(() => requester.get(actionUrl(ACTIONS.account), { maxRedirects: 0, timeout: 15000 }));
    checkBlocked(response.status());
    return response.status() === 200;
  }

  async function launchWindow(chromium) {
    for (const channel of BROWSER_CHANNELS) {
      try {
        return await chromium.launch({ headless: false, ...(channel && { channel }) });
      } catch { /* try the next browser */ }
    }
    throw new Error(NO_BROWSER);
  }

  async function interactiveLogin() {
    const { chromium } = await pw();
    const browser = await launchWindow(chromium);
    const closed = new Promise((resolve) => browser.on('disconnected', () => resolve('closed')));
    try {
      const context = await browser.newContext({ locale: 'pt-PT' });
      const page = await context.newPage();
      log('[auth] Abri uma janela do browser: faz o login no Pingo Doce.');
      await throttle(() => page.goto(actionUrl(ACTIONS.login), { waitUntil: 'domcontentloaded', timeout: 30000 }));
      await page.locator('#onetrust-accept-btn-handler').click({ timeout: 3000 }).catch(() => {});
      const deadline = Date.now() + loginTimeoutMs;
      while (Date.now() < deadline) {
        if (await Promise.race([closed, sleep(pollMs).then(() => 'tick')]) === 'closed') {
          throw new Error('pingo-doce: a janela de login foi fechada antes de o login terminar; tenta de novo');
        }
        // Only ask the site once the window is back on pingodoce.pt outside the login pages.
        const url = new URL(page.url());
        if (url.hostname !== HOST || /login/i.test(url.pathname)) continue;
        if (await checkLoggedIn(context.request)) {
          const cookies = await context.cookies();
          mkdirSync(dirname(cookieFile), { recursive: true });
          writeFileSync(cookieFile, JSON.stringify(cookies), { mode: 0o600 });
          try { chmodSync(cookieFile, 0o600); } catch {}
          log('[auth] Sessão iniciada.');
          return cookies;
        }
      }
      throw new Error('pingo-doce: o login não terminou em 5 minutos; tenta de novo');
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // Returns 'saved' when the stored session still works, 'window' when the person had to log in.
  function ensureSession() {
    if (api && loggedIn) return Promise.resolve('saved');
    pending ??= (async () => {
      try {
        const saved = readCookies(cookieFile);
        if (saved) {
          await openApi(saved);
          if (await checkLoggedIn(api)) { loggedIn = true; return 'saved'; }
          log('[auth] A sessão guardada expirou.');
        }
        await openApi(await interactiveLogin());
        loggedIn = true;
        return 'window';
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  async function send(action, { method, params }) {
    const options = { headers: { 'X-Requested-With': 'XMLHttpRequest' }, maxRedirects: 0, timeout: 15000 };
    const response = await throttle(() => (method === 'POST'
      ? api.post(actionUrl(action), { ...options, form: params })
      : api.get(actionUrl(action, params), options)));
    const status = response.status();
    checkBlocked(status);
    return { status, json: await response.json().catch(() => null) };
  }

  // Calls one allowed cart action. Returns { status, json }.
  async function request(action, { method = 'GET', params = {} } = {}) {
    await ensureSession();
    let result = await send(action, { method, params });
    if (result.status >= 300 && result.status < 400) {
      // The session ended while the server was running: ask the person to log in again, once.
      loggedIn = false;
      await ensureSession();
      result = await send(action, { method, params });
    }
    return result;
  }

  async function login() {
    return ensureSession();
  }

  async function close() {
    const current = api;
    api = null;
    loggedIn = false;
    await current?.dispose().catch(() => {});
  }

  async function logout() {
    await close();
    rmSync(cookieFile, { force: true });
  }

  return { request, login, logout, close };
}
