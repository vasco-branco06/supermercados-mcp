import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AUCHAN_BASE, BlockedError, USER_AGENT, assertNotBlocked, throttle } from './http.js';

const LOGIN_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Login-OAuthLogin?oauthProvider=Salesforce&oauthLoginTargetEndPoint=1`;
const ACCOUNT_URL = `${AUCHAN_BASE}/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Account-Show`;
const EMAIL_FIELD = 'input[type="email"], input[name="username"], input[name="email"]';
const PASSWORD_FIELD = 'input[type="password"]';
const SUBMIT = 'button[type="submit"], input[type="submit"]';

export function writeCookies(path, cookies) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(cookies, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

// Owns the Playwright browser used for login and cart requests.
// Playwright is imported here only, and only when a cart tool runs.
export function createSession({ credentials, cookieFile, log = console.error }) {
  let browser = null;
  let context = null;

  async function login(page) {
    log('[auth] A iniciar sessão no Auchan...');
    await throttle(() => page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }));
    await checkChallenge(page);
    await page.locator(EMAIL_FIELD).first().fill(credentials.email, { timeout: 15000 });
    const password = page.locator(PASSWORD_FIELD).first();
    if (!(await password.isVisible().catch(() => false))) {
      await throttle(() => page.locator(SUBMIT).first().click());
    }
    await password.fill(credentials.password, { timeout: 15000 });
    await throttle(() => page.locator(SUBMIT).first().click());
    await page.waitForURL(url => url.hostname === 'www.auchan.pt', { timeout: 30000 }).catch(async () => {
      await checkChallenge(page);
      throw new Error('o login não terminou; confirma o email e a palavra-passe em credentials.env');
    });
    writeCookies(cookieFile, await context.cookies());
    log('[auth] Sessão iniciada.');
  }

  async function checkChallenge(page) {
    const captcha = await page.locator('iframe[src*="captcha"], .g-recaptcha, .h-captcha, #px-captcha').count();
    if (captcha) throw new BlockedError('o site pediu uma verificação anti-robô (CAPTCHA) no login; entra uma vez no auchan.pt pelo browser e tenta mais tarde');
    assertNotBlocked(200, await page.content());
  }

  async function open() {
    if (context) return;
    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      throw new Error('falta o Playwright; corre "npm install" e "npx playwright install chromium" na pasta servers/auchan');
    }
    browser = await chromium.launch({ headless: process.env.AUCHAN_LOGIN_HEADLESS !== 'false' });
    browser.on('disconnected', () => { browser = context = null; });
    context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-PT' });
    if (existsSync(cookieFile)) {
      try {
        await context.addCookies(JSON.parse(readFileSync(cookieFile, 'utf8')));
      } catch {
        log('[auth] Não consegui ler as cookies guardadas; vou iniciar sessão de novo.');
      }
    }
    // Expired cookies would silently fill an anonymous basket, so check the account page first.
    if (await isLoggedIn()) return;
    const page = await context.newPage();
    try { await login(page); } finally { await page.close().catch(() => {}); }
    if (!(await isLoggedIn())) {
      await close();
      throw new Error('o login não ficou ativo; confirma o email e a palavra-passe em credentials.env');
    }
  }

  async function isLoggedIn() {
    const res = await throttle(() => context.request.get(ACCOUNT_URL, { timeout: 15000 }));
    assertNotBlocked(res.status(), '');
    return res.ok() && !/login/i.test(new URL(res.url()).pathname);
  }

  const call = (fn) => throttle(async () => {
    const res = await fn();
    const text = await res.text();
    assertNotBlocked(res.status(), text);
    return { status: res.status(), text };
  });

  // The `site` interface cart.js expects: relative paths on auchan.pt only.
  const site = {
    get: (path) => scrubbed(async () => {
      await open();
      return call(() => context.request.get(new URL(path, AUCHAN_BASE).href, { timeout: 15000 }));
    }),
    post: (path, form) => scrubbed(async () => {
      await open();
      return call(() => context.request.post(new URL(path, AUCHAN_BASE).href, { form, timeout: 15000 }));
    }),
  };

  // Credentials must never reach an error message, a log or a tool response.
  async function scrubbed(fn) {
    try {
      return await fn();
    } catch (error) {
      for (const secret of [credentials.email, credentials.password]) error.message = String(error.message).split(secret).join('***');
      throw error;
    }
  }

  async function close() {
    const current = browser;
    browser = context = null;
    if (current) await current.close().catch(() => {});
  }

  return { site, close };
}
