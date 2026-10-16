import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PINGO_DOCE_BASE, parseSearchPage } from './parse.js';

export const SEARCH_URL = `${PINGO_DOCE_BASE}/on/demandware.store/Sites-pingo-doce-Site/default/Search-Show`;
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const userAgent = (version) =>
  `supermercados-mcp/${version} (pingo-doce-mcp; +https://github.com/vasco-branco06/supermercados-mcp)`;

// Signs of a CAPTCHA or anti-bot challenge. Only checked when the page has no products.
const CHALLENGE = /captcha|cf-chl|challenge-platform|access denied|are you a robot/i;

export class BlockedError extends Error {}

const cacheKey = (query) => createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 32);

function readCache(file, nowMs) {
  try {
    const entry = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(entry.products) && nowMs - Date.parse(entry.fetched_at) < CACHE_TTL_MS) return entry;
  } catch {}
  return null;
}

// Returns { products: raw[], fetched_at, cached }. Raw products go to normalizePingoDoce.
export function createSearcher({ version, cacheDir, throttle, fetchImpl = fetch, now = () => new Date() }) {
  return async function search(query) {
    const file = join(cacheDir, `${cacheKey(query)}.json`);
    const hit = readCache(file, now().getTime());
    if (hit) return { products: hit.products, fetched_at: hit.fetched_at, cached: true };

    const url = `${SEARCH_URL}?q=${encodeURIComponent(query.trim())}`;
    let response;
    try {
      response = await throttle(() => fetchImpl(url, {
        headers: { 'User-Agent': userAgent(version), 'Accept': 'text/html', 'Accept-Language': 'pt-PT,pt;q=0.9' },
        signal: AbortSignal.timeout(15000),
      }));
    } catch (error) {
      throw new Error(`pingo-doce: sem ligação ao site (${error.message})`);
    }
    if (response.status === 403 || response.status === 429) {
      throw new BlockedError(`pingo-doce: o site recusou o pedido (HTTP ${response.status}); não vou contornar, tenta mais tarde`);
    }
    if (!response.ok) throw new Error(`pingo-doce: o site respondeu HTTP ${response.status}`);

    const html = await response.text();
    let products;
    try {
      products = parseSearchPage(html);
    } catch (error) {
      if (CHALLENGE.test(html)) throw blocked();
      throw error;
    }
    if (products.length === 0 && CHALLENGE.test(html)) throw blocked();

    const fetched_at = now().toISOString();
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify({ query, fetched_at, products }));
    } catch {} // A cache that cannot be written only costs a new request next time.
    return { products, fetched_at, cached: false };
  };
}

const blocked = () => new BlockedError('pingo-doce: o site mostrou um desafio anti-robô (CAPTCHA); não vou contornar, tenta mais tarde');
