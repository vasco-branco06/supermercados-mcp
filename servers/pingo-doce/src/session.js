import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ACTIONS, actionUrl } from './cart.js';
import { BlockedError, userAgent } from './search.js';

const LOGIN_FAILED = 'pingo-doce: o login falhou; confirma PINGODOCE_EMAIL e PINGODOCE_PASSWORD em ~/.pingodoce-mcp/credentials.env';
const NO_PLAYWRIGHT = 'pingo-doce: o carrinho precisa do browser do Playwright; corre "npx playwright install chromium" na pasta do servidor';

function checkBlocked(status) {
  if (status === 403 || status === 429) {
    throw new BlockedError(`pingo-doce: o site recusou o pedido (HTTP ${status}); não vou contornar, tenta mais tarde`);
  }
}

// Logged-in browser session for the cart tools. Playwright is only imported here, on first use.
// Credentials go only into the login form; cookies only into cookieFile. Neither is logged or returned.
export function createSession({ credentials, cookieFile, throttle, version, headless = true, loadPlaywright = () => import('playwright') }) {
  let browser = null;
  let context = null;
  let loggedIn = false;

  async function start() {
    if (context) return;
    let chromium;
    try {
      ({ chromium } = await loadPlaywright());
      browser = await chromium.launch({ headless });
    } catch {
      throw new Error(NO_PLAYWRIGHT);
    }
    const launched = browser;
    launched.on('disconnected', () => {
      if (browser === launched) { browser = context = null; loggedIn = false; }
    });
    context = await browser.newContext({ userAgent: userAgent(version), locale: 'pt-PT' });
    if (existsSync(cookieFile)) {
      try {
        await context.addCookies(JSON.parse(readFileSync(cookieFile, 'utf8')));
      } catch {
        console.error('pingo-doce: could not read the cookie cache; logging in again.');
      }
    }
  }

  // Account-Show answers 200 when logged in and redirects to the login page otherwise.
  async function checkLoggedIn() {
    const response = await throttle(() => context.request.get(actionUrl(ACTIONS.account), { maxRedirects: 0, timeout: 15000 }));
    checkBlocked(response.status());
    return response.status() === 200;
  }

  async function login() {
    const page = await context.newPage();
    try {
      await throttle(() => page.goto(actionUrl(ACTIONS.login), { waitUntil: 'domcontentloaded', timeout: 30000 }));
      await page.locator('#onetrust-accept-btn-handler').click({ timeout: 3000 }).catch(() => {});
      await page.fill('input[name="loginEmail"]', credentials.email, { timeout: 10000 });
      await page.fill('input[name="loginPassword"]', credentials.password, { timeout: 10000 });
      await throttle(() => Promise.all([
        page.waitForResponse((r) => r.url().includes('Account-Login'), { timeout: 20000 }),
        page.locator('form:has(input[name="loginPassword"]) button[type="submit"]').first().click(),
      ]));
    } catch (error) {
      if (error instanceof BlockedError) throw error;
      // Playwright errors can echo selectors and values; replace them with a fixed message.
      throw new Error(LOGIN_FAILED);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async function ensureLoggedIn() {
    if (loggedIn && context) return;
    await start();
    if (!(await checkLoggedIn())) {
      await login();
      if (!(await checkLoggedIn())) throw new Error(LOGIN_FAILED);
      mkdirSync(dirname(cookieFile), { recursive: true });
      writeFileSync(cookieFile, JSON.stringify(await context.cookies()), { mode: 0o600 });
      try { chmodSync(cookieFile, 0o600); } catch {}
    }
    loggedIn = true;
  }

  // Calls one allowed cart action. Returns { status, json }.
  async function request(action, { method = 'GET', params = {} } = {}) {
    await ensureLoggedIn();
    const options = { headers: { 'X-Requested-With': 'XMLHttpRequest' }, maxRedirects: 0, timeout: 15000 };
    const response = await throttle(() => (method === 'POST'
      ? context.request.post(actionUrl(action), { ...options, form: params })
      : context.request.get(actionUrl(action, params), options)));
    const status = response.status();
    checkBlocked(status);
    if (status >= 300 && status < 400) loggedIn = false; // Session expired; the next call logs in again.
    const json = await response.json().catch(() => null);
    return { status, json };
  }

  async function close() {
    const open = browser;
    browser = context = null;
    loggedIn = false;
    if (open) await open.close().catch(() => {});
  }

  return { request, close };
}
