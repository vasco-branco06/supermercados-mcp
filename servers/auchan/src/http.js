import { readFileSync } from 'node:fs';

export const AUCHAN_BASE = 'https://www.auchan.pt';
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const USER_AGENT = `supermercados-mcp/${VERSION} (auchan-mcp; +https://github.com/vasco-branco06/supermercados-mcp)`;

const BLOCK_MARKERS = /captcha|cf-challenge|just a moment\.\.\.|_incapsula_|datadome|perimeterx|px-captcha|access denied/i;

const CHALLENGE_MAX_BYTES = 30000;

export class BlockedError extends Error {}

// Serialises calls and keeps at least `intervalMs` between the start of each one.
// ponytail: one process-wide gate for auchan.pt; per-host gates if more sites share this module.
export function createThrottle(intervalMs = 1000, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  let tail = Promise.resolve();
  let last = -Infinity;
  return operation => {
    const run = tail.then(async () => {
      const wait = last + intervalMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      return operation();
    });
    tail = run.catch(() => {});
    return run;
  };
}

export const throttle = createThrottle();

// Never works around a block: a 403/429 or a challenge page ends the request with an error.
export function assertNotBlocked(status, body = '') {
  if (status === 403 || status === 429) throw new BlockedError(`o site bloqueou o pedido (HTTP ${status}); tenta mais tarde`);
  // A challenge page is small. Normal pages (the cart has a harmless 'auc-recaptcha-check' component) are not.
  if (body.length < CHALLENGE_MAX_BYTES && BLOCK_MARKERS.test(body) && !body.includes('data-pid=')) {
    throw new BlockedError('o site pediu uma verificação anti-robô (CAPTCHA); abre o auchan.pt no browser e tenta mais tarde');
  }
}

export async function fetchPage(url, { fetchImpl = fetch, gate = throttle } = {}) {
  return gate(async () => {
    let res;
    try {
      res = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-PT,pt;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new Error(`sem ligação ao site (${error.message})`);
    }
    const body = await res.text();
    assertNotBlocked(res.status, body);
    if (!res.ok) throw new Error(`o site respondeu HTTP ${res.status}`);
    return body;
  });
}
