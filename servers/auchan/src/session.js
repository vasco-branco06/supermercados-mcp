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

export function writeCookies(path, cookies) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(cookies, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
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
  log = console.error,
  loadPlaywright = () => import('playwright'),
  loginTimeoutMs = 5 * 60 * 1000,
  silentTimeoutMs = 12000,
  pollMs = 3000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
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
      userAgent: USER_AGENT,
      locale: 'pt-PT',
      storageState: { cookies, origins: [] },
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

  async function launchWindow(chromium) {
    for (const channel of BROWSER_CHANNELS) {
      try {
        return await chromium.launch({ headless: false, ...(channel && { channel }) });
      } catch { /* try the next browser */ }
    }
    throw new Error(NO_BROWSER);
  }

  async function interactiveLogin(savedCookies = null) {
    const { chromium } = await pw();
    const browser = await launchWindow(chromium);
    const closed = new Promise(resolve => browser.on('disconnected', () => resolve('closed')));
    try {
      const context = await browser.newContext({ locale: 'pt-PT' });
      // With a saved login only the delivery choice is missing, so open the site instead of the login page.
      if (savedCookies) await context.addCookies(savedCookies);
      const page = await context.newPage();
      log(savedCookies
        ? '[auth] Abri uma janela do browser: escolhe a entrega ou o levantamento no Auchan.'
        : '[auth] Abri uma janela do browser: faz o login no Auchan e escolhe a entrega ou o levantamento.');
      await throttle(() => page.goto(savedCookies ? `${AUCHAN_BASE}/pt/` : LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      const deadline = Date.now() + loginTimeoutMs;
      while (Date.now() < deadline) {
        if (await Promise.race([closed, sleep(pollMs).then(() => 'tick')]) === 'closed') {
          throw new Error('a janela de login foi fechada antes de o login terminar; tenta de novo');
        }
        // Only ask the site once the window is back on auchan.pt outside the login pages.
        const url = new URL(page.url());
        if (url.hostname !== 'www.auchan.pt' || /login/i.test(url.pathname)) continue;
        if (await isLoggedIn(context.request) && await hasDeliveryContext(context.request)) {
          const cookies = await context.cookies();
          writeCookies(cookieFile, cookies);
          log('[auth] Sessão iniciada.');
          return cookies;
        }
      }
      throw new Error('o login não terminou em 5 minutos; tenta de novo');
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // The short shop session (dwsid) ends quickly, but the central login (login.auchan.pt) remembers the
  // person for much longer. A headless browser with the saved cookies follows the same "Entrar" link a
  // person would and, when the central login still knows them, comes back logged in with no window.
  async function silentRefresh(savedCookies) {
    let browser = null;
    try {
      const { chromium } = await pw();
      for (const channel of BROWSER_CHANNELS) {
        try { browser = await chromium.launch({ headless: true, ...(channel && { channel }) }); break; } catch { /* next browser */ }
      }
      if (!browser) return null;
      const context = await browser.newContext({ locale: 'pt-PT', userAgent: USER_AGENT });
      await context.addCookies(savedCookies);
      const page = await context.newPage();
      await throttle(() => page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      const deadline = Date.now() + silentTimeoutMs;
      while (Date.now() < deadline) {
        await sleep(pollMs);
        const url = new URL(page.url());
        if (url.hostname === 'www.auchan.pt' && !/login/i.test(url.pathname) && await isLoggedIn(context.request)) {
          const cookies = await context.cookies();
          writeCookies(cookieFile, cookies);
          return cookies;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  // Keeps cookies the site renewed while the server ran, at most every five minutes.
  let lastPersist = 0;
  async function persist(force = false) {
    if (!api || (!force && Date.now() - lastPersist < 5 * 60 * 1000)) return;
    lastPersist = Date.now();
    try {
      const { cookies } = await api.storageState();
      if (cookies.length) writeCookies(cookieFile, cookies);
    } catch { /* the saved copy stays as it was */ }
  }

  // Returns 'saved' when the stored session still works, 'window' when the person had to log in.
  function ensureSession() {
    if (api && loggedIn) return Promise.resolve('saved');
    pending ??= (async () => {
      try {
        const saved = readCookies(cookieFile);
        if (saved) {
          await openApi(saved);
          let logged = await isLoggedIn(api);
          let current = saved;
          if (!logged) {
            log('[auth] A sessão do site expirou; vou tentar renová-la sem janela.');
            const renewed = await silentRefresh(saved);
            if (renewed) { current = renewed; await openApi(renewed); logged = true; }
          }
          if (logged && await hasDeliveryContext(api)) { loggedIn = true; await persist(true); return 'saved'; }
          log(logged ? '[auth] Falta escolher a entrega.' : '[auth] Preciso que entres outra vez.');
          await openApi(await interactiveLogin(logged ? current : null));
          loggedIn = true;
          return 'window';
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

  const call = (method, path, form) => throttle(async () => {
    const options = form ? { form, timeout: 15000 } : { timeout: 15000 };
    const res = await api[method](new URL(path, AUCHAN_BASE).href, options);
    const text = await res.text();
    assertNotBlocked(res.status(), text);
    return { status: res.status(), text, url: res.url() };
  });

  async function request(method, path, form) {
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
