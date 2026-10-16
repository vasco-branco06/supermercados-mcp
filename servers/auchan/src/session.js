import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUCHAN_BASE, BlockedError, USER_AGENT, assertNotBlocked, throttle } from './http.js';

// The same "Entrar" link the site shows to people; it ends on the central login at login.auchan.pt.
const LOGIN_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Login-OAuthLogin?oauthProvider=Salesforce&oauthLoginTargetEndPoint=1`;
// The header says whether delivery or pickup was chosen; the cart refuses everything until it is.
const DELIVERY_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Delivery-Header`;
// Every page says data-authenticated="true" or "false"; the account page also answers 200 to visitors.
const CART_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Cart-Show`;
// Fields of the real login form (checked on login.auchan.pt/authorization).
const EMAIL_FIELD = 'input[name="uname1"], input[type="email"]';
const PASSWORD_FIELD = 'input[name="passwordLogin"], input[type="password"]';
const SUBMIT_BUTTON = '#btnSubmit_login, input[name="btnSubmit_login"], button[type="submit"]:visible';
const CHALLENGE = 'iframe[src*="captcha"], iframe[title*="challenge"], .g-recaptcha, .h-captcha, #px-captcha';
// Edge ships with Windows and Chrome is on most Macs, so nothing has to be downloaded.
const BROWSER_CHANNELS = ['msedge', 'chrome', undefined];
const NO_PLAYWRIGHT = 'falta o Playwright; instala o pacote de novo (npm install auchan-mcp)';
const NO_BROWSER = 'não encontrei o Microsoft Edge nem o Google Chrome para fazer o login; instala um deles ou corre "npx playwright install chromium"';
const FORM_CHANGED = 'o formulário de login do Auchan não é o esperado (o site pode ter mudado); é preciso atualizar o servidor';
const LOGIN_FAILED = 'o login não terminou; confirma o email e a palavra-passe no ficheiro de credenciais';
const NO_DELIVERY = 'o Auchan ainda não tem a tua entrega escolhida; escolhe-a uma vez no auchan.pt (entrega em casa ou levantamento, com o código postal) e tenta de novo';

// The saved session is a Playwright storage state: cookies plus the browser's local storage.
// Older files held just the cookie list.
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

// Logs in with the email and password from credentials.env, in a background browser, and again
// whenever the shop ends the session, so the connection never has to be redone by hand.
// Credentials go only into the login form; the session only into cookieFile. Neither is logged or returned.
// After login every cart request is plain HTTP through Playwright's request client.
// While the server runs, a light request every `keepAliveMs` stops the shop closing the session for
// inactivity, and anything the site renews is saved for next time.
export function createSession({
  credentials,
  credentialFile = 'credentials.env',
  cookieFile,
  log = console.error,
  loadPlaywright = () => import('playwright'),
  headless = true,
  loginTimeoutMs = 30000,
  keepAliveMs = 10 * 60 * 1000,
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

  // The delivery or pickup choice is kept on the account, so it only has to be made once on auchan.pt.
  async function hasDeliveryContext(requester) {
    const res = await throttle(() => requester.get(DELIVERY_URL, { timeout: 15000 }));
    assertNotBlocked(res.status(), '');
    return res.ok() && /data-has-context="true"/.test(await res.text());
  }

  async function launch(chromium) {
    for (const channel of BROWSER_CHANNELS) {
      try {
        return await chromium.launch({ headless, ...(channel && { channel }) });
      } catch { /* try the next browser */ }
    }
    return null;
  }

  // Credentials must never reach an error message, a log or a tool response.
  function scrubbed(error) {
    for (const secret of [credentials?.email, credentials?.password]) {
      if (secret) error.message = String(error.message).split(secret).join('***');
    }
    return error;
  }

  async function autoLogin() {
    if (!credentials) {
      throw new Error(`falta o ficheiro ${credentialFile} com as linhas AUCHAN_EMAIL=... e AUCHAN_PASSWORD=... (ver o README)`);
    }
    const { chromium } = await pw();
    const browser = await launch(chromium);
    if (!browser) throw new Error(NO_BROWSER);
    try {
      const context = await browser.newContext({ locale: 'pt-PT', userAgent: USER_AGENT });
      const page = await context.newPage();
      log('[auth] A iniciar sessão no Auchan...');
      await throttle(() => page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
      await page.locator('#onetrust-accept-btn-handler').click({ timeout: 2000 }).catch(() => {});
      try {
        await page.locator(EMAIL_FIELD).first().fill(credentials.email, { timeout: 20000 });
        await page.locator(PASSWORD_FIELD).first().fill(credentials.password, { timeout: 10000 });
        await throttle(() => page.locator(SUBMIT_BUTTON).first().click({ timeout: 10000 }));
      } catch {
        throw new Error(FORM_CHANGED);
      }
      try {
        await page.waitForURL(url => url.hostname === 'www.auchan.pt' && !/login/i.test(url.pathname), { timeout: loginTimeoutMs });
      } catch {
        if (await page.locator(CHALLENGE).count()) {
          throw new BlockedError('o site pediu uma verificação anti-robô (CAPTCHA) no login; entra uma vez no auchan.pt pelo browser e tenta mais tarde');
        }
        throw new Error(LOGIN_FAILED);
      }
      if (!(await isLoggedIn(context.request))) throw new Error(LOGIN_FAILED);
      const next = await context.storageState();
      writeState(cookieFile, next);
      log('[auth] Sessão iniciada.');
      return next;
    } catch (error) {
      if (error instanceof BlockedError || error.message === LOGIN_FAILED || error.message === FORM_CHANGED || error.message.startsWith('falta ')) throw scrubbed(error);
      // Playwright errors can echo selectors and values, so only fixed messages leave this function.
      throw new Error(LOGIN_FAILED);
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
        // The shop closed the session: log in again now, so the next request just works.
        if (credentials) await openApi(await autoLogin());
        else loggedIn = false;
      } catch { loggedIn = false; /* the next cart call tries again and says why it failed */ } finally { beating = false; }
    }, keepAliveMs);
    timer.unref?.();
  }

  // Returns 'saved' when the stored session still works, 'login' when it had to log in again.
  function ensureSession() {
    if (api && loggedIn) return Promise.resolve('saved');
    pending ??= (async () => {
      try {
        let how = 'login';
        const saved = readState(cookieFile);
        if (saved) {
          await openApi(saved);
          if (await isLoggedIn(api)) how = 'saved';
          else log('[auth] A sessão guardada expirou; vou entrar outra vez.');
        }
        if (how === 'login') await openApi(await autoLogin());
        if (!(await hasDeliveryContext(api))) throw new Error(NO_DELIVERY);
        loggedIn = true;
        await persist(true);
        startKeepAlive();
        return how;
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
        // The session ended while the server was running: log in again, once.
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
