import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUCHAN_BASE, USER_AGENT, assertNotBlocked, throttle } from './http.js';

// The same "Entrar" link the site shows to people.
const LOGIN_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Login-OAuthLogin?oauthProvider=Salesforce&oauthLoginTargetEndPoint=1`;
// The header says whether delivery or pickup was chosen; the cart refuses everything until it is.
const DELIVERY_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Delivery-Header`;
// Every page says data-authenticated="true" or "false"; the account page also answers 200 to visitors.
const CART_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Cart-Show`;
// Edge ships with Windows and Chrome is on most Macs, so nothing has to be downloaded.
const BROWSER_CHANNELS = ['msedge', 'chrome', undefined];
const NO_PLAYWRIGHT = 'falta o Playwright; instala o pacote de novo (npm install auchan-mcp)';
const NO_BROWSER = 'não encontrei o Microsoft Edge nem o Google Chrome para abrir a janela de login; instala um deles ou corre "npx playwright install chromium"';

// The saved session is a Playwright storage state: cookies plus the browser's local storage, where
// logins often keep a "known device" key. Older files held just the cookie list.
export function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

function readState(path) {
  if (!existsSync(path)) return null;
  try {
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    const state = Array.isArray(saved) ? { cookies: saved, origins: [] } : { cookies: saved?.cookies, origins: saved?.origins ?? [] };
    return Array.isArray(state.cookies) && state.cookies.length ? state : null;
  } catch {
    return null;
  }
}

// Login is done by the person, in a normal browser window; no password ever reaches this code.
// Only the session is kept, in cookieFile. After login every cart request is plain HTTP through
// Playwright's request client, so the window is closed as soon as the login works.
// While the server runs, a light request every `keepAliveMs` stops the shop closing the session
// for inactivity, and anything the site renews is saved for next time.
export function createSession({
  cookieFile,
  log = console.error,
  loadPlaywright = () => import('playwright'),
  loginTimeoutMs = 5 * 60 * 1000,
  keepAliveMs = 10 * 60 * 1000,
  pollMs = 3000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  let playwright = null;
  let api = null;
  let state = null; // what is saved on disk: cookies and local storage
  let loggedIn = false;
  let pending = null;
  let inFlight = 0;
  let timer = null;
  let beating = false;

  async function pw() {
    if (!playwright) {
      try { playwright = await loadPlaywright(); } catch { throw new Error(NO_PLAYWRIGHT); }
    }
    return playwright;
  }

  async function openApi(next) {
    state = next;
    await api?.dispose().catch(() => {});
    api = await (await pw()).request.newContext({
      userAgent: USER_AGENT,
      locale: 'pt-PT',
      storageState: { cookies: next.cookies, origins: [] },
    });
  }

  // An expired session would silently fill an anonymous basket, so look at the page's own flag first.
  async function isLoggedIn(requester) {
    const res = await throttle(() => requester.get(CART_URL, { timeout: 15000 }));
    assertNotBlocked(res.status(), '');
    return res.ok() && /data-authenticated="true"/.test(await res.text());
  }

  // Auchan only accepts cart changes after the person chose home delivery or pickup (postal code).
  async function hasDeliveryContext(requester) {
    const res = await throttle(() => requester.get(DELIVERY_URL, { timeout: 15000 }));
    assertNotBlocked(res.status(), '');
    return res.ok() && /data-has-context="true"/.test(await res.text());
  }

  async function launch(chromium, headless) {
    for (const channel of BROWSER_CHANNELS) {
      try {
        return await chromium.launch({ headless, ...(channel && { channel }) });
      } catch { /* try the next browser */ }
    }
    return null;
  }

  async function interactiveLogin(saved = null) {
    const { chromium } = await pw();
    const browser = await launch(chromium, false);
    if (!browser) throw new Error(NO_BROWSER);
    const closed = new Promise(resolve => browser.on('disconnected', () => resolve('closed')));
    try {
      // With a saved login only the delivery choice may be missing, so open the site instead of the login page.
      const context = await browser.newContext({ locale: 'pt-PT', ...(saved && { storageState: saved }) });
      const page = await context.newPage();
      log(saved
        ? '[auth] Abri uma janela do browser: escolhe a entrega ou o levantamento no Auchan.'
        : '[auth] Abri uma janela do browser: faz o login no Auchan e escolhe a entrega ou o levantamento.');
      await throttle(() => page.goto(saved ? `${AUCHAN_BASE}/pt/` : LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      const deadline = Date.now() + loginTimeoutMs;
      while (Date.now() < deadline) {
        if (await Promise.race([closed, sleep(pollMs).then(() => 'tick')]) === 'closed') {
          throw new Error('a janela de login foi fechada antes de o login terminar; tenta de novo');
        }
        // Only ask the site once the window is back on auchan.pt outside the login pages.
        const url = new URL(page.url());
        if (url.hostname !== 'www.auchan.pt' || /login/i.test(url.pathname)) continue;
        if (await isLoggedIn(context.request) && await hasDeliveryContext(context.request)) {
          const next = await context.storageState();
          writeState(cookieFile, next);
          log('[auth] Sessão iniciada.');
          return next;
        }
      }
      throw new Error('o login não terminou em 5 minutos; tenta de novo');
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // Keeps what the site renewed while the server ran, at most every five minutes unless forced.
  let lastPersist = 0;
  async function persist(force = false) {
    if (!api || !state || (!force && Date.now() - lastPersist < 5 * 60 * 1000)) return;
    lastPersist = Date.now();
    try {
      const { cookies } = await api.storageState();
      if (cookies.length) {
        state = { cookies, origins: state.origins };
        writeState(cookieFile, state);
      }
    } catch { /* the saved copy stays as it was */ }
  }

  function startKeepAlive() {
    if (timer || !keepAliveMs) return;
    timer = setInterval(async () => {
      if (!api || !loggedIn || pending || inFlight || beating) return;
      beating = true;
      try {
        if (await isLoggedIn(api)) { await persist(true); return; }
        // The shop closed the session. Auchan's central login always asks for the password again
        // (checked live), so the next cart call asks the person, with a window.
        loggedIn = false;
      } catch { /* offline or blocked: try again at the next beat */ } finally { beating = false; }
    }, keepAliveMs);
    timer.unref?.();
  }

  // Returns 'saved' when the stored session still works, 'window' when the person had to log in.
  function ensureSession() {
    if (api && loggedIn) return Promise.resolve('saved');
    pending ??= (async () => {
      try {
        const saved = readState(cookieFile);
        if (saved) {
          await openApi(saved);
          const logged = await isLoggedIn(api);
          if (logged && await hasDeliveryContext(api)) { loggedIn = true; await persist(true); startKeepAlive(); return 'saved'; }
          log(logged ? '[auth] Falta escolher a entrega.' : '[auth] A sessão guardada expirou.');
          await openApi(await interactiveLogin(logged ? saved : null));
          loggedIn = true;
          startKeepAlive();
          return 'window';
        }
        await openApi(await interactiveLogin());
        loggedIn = true;
        startKeepAlive();
        return 'window';
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  const call = (method, path, form) => throttle(async () => {
    const options = form ? { form, timeout: 15000 } : { timeout: 15000 };
    const res = await api[method](new URL(path, AUCHAN_BASE).href, options);
    const text = await res.text();
    assertNotBlocked(res.status(), text);
    return { status: res.status(), text, url: res.url() };
  });

  async function request(method, path, form) {
    inFlight++;
    try {
      await ensureSession();
      let result = await call(method, path, form);
      if (/login/i.test(new URL(result.url).pathname)) {
        // The session ended while the server was running: ask the person to log in again, once.
        loggedIn = false;
        await ensureSession();
        result = await call(method, path, form);
        if (/login/i.test(new URL(result.url).pathname)) throw new Error('o site não aceitou a sessão; tenta usar a ferramenta login de novo');
      }
      await persist();
      return { status: result.status, text: result.text };
    } finally {
      inFlight--;
    }
  }

  // The `site` interface cart.js expects: relative paths on auchan.pt only.
  const site = {
    get: path => request('get', path),
    post: (path, form) => request('post', path, form),
  };

  async function login() {
    return ensureSession();
  }

  async function close() {
    if (timer) { clearInterval(timer); timer = null; }
    await persist(true);
    const current = api;
    api = null;
    loggedIn = false;
    await current?.dispose().catch(() => {});
  }

  async function logout() {
    await close();
    rmSync(cookieFile, { force: true });
  }

  return { site, login, logout, close };
}
