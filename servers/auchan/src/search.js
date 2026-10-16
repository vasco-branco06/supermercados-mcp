import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUCHAN_BASE, fetchPage } from './http.js';
import { normalizeAuchan } from './shared.js';

export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NO_RESULTS = /n[ãa]o (foram )?encontr|sem resultados|0 resultados/i;

export class SiteChangedError extends Error {}

const readGtm = (value) => {
  try { return JSON.parse(value ?? ''); } catch { return {}; }
};

// Search page HTML -> raw products in the shape normalizeAuchan expects.
// Tiles without a readable price are skipped; a page where no price can be read is an error.
export function parseProducts(html) {
  const $ = cheerio.load(html);
  const tiles = $('div.product[data-pid]');
  const products = [];

  tiles.each((_, el) => {
    const $product = $(el);
    const $tile = $product.find('.product-tile.auc-product-tile').first();
    const price = Number($tile.find('.sales .value').first().attr('content') || NaN);
    const href = $tile.find('.auc-product-tile__name a[href]').first().attr('href');
    const gtm = readGtm($tile.attr('data-gtm'));
    if (!$tile.length || !Number.isFinite(price) || price <= 0 || !href || !gtm.name) return;

    products.push({
      product_id: $product.attr('data-pid'),
      name: gtm.name.trim(),
      brand: gtm.brand?.trim() || null,
      price,
      unit_text: $tile.find('.auc-measures--price-per-unit').first().text().trim() || null,
      available: $tile.find('.auc-unavailable-text').length === 0,
      url: new URL(href, AUCHAN_BASE).href,
    });
  });

  if (tiles.length > 0 && products.length === 0) {
    throw new SiteChangedError('não encontrei os preços na página (o site pode ter mudado)');
  }
  if (tiles.length === 0 && !$('.search-results, .grid-footer').length && !NO_RESULTS.test($('body').text())) {
    throw new SiteChangedError('não encontrei a lista de produtos na página (o site pode ter mudado)');
  }

  const seen = new Set();
  return products.filter(p => !seen.has(p.product_id) && seen.add(p.product_id));
}

export const searchUrl = (query) => `${AUCHAN_BASE}/pt/pesquisa?q=${encodeURIComponent(query)}`;

const cacheFile = (cacheDir, query) =>
  join(cacheDir, `${createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 32)}.json`);

function readCache(file, now) {
  try {
    const entry = JSON.parse(readFileSync(file, 'utf8'));
    if (now - Date.parse(entry.fetched_at) < CACHE_TTL_MS && Array.isArray(entry.raw)) return entry;
  } catch {}
  return null;
}

// Returns the search response described in shared/CONTRATO.md (without the MCP wrapper).
export async function searchProducts(query, limit = 10, { cacheDir, fetchImpl, now = Date.now } = {}) {
  const file = cacheDir && cacheFile(cacheDir, query);
  let entry = file && readCache(file, now());
  if (!entry) {
    const html = await fetchPage(searchUrl(query.trim()), { fetchImpl });
    entry = { fetched_at: new Date(now()).toISOString(), raw: parseProducts(html) };
    if (file) {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(file, JSON.stringify(entry));
      } catch {} // A cache that cannot be written only costs a new request next time.
    }
  }
  const products = entry.raw.slice(0, limit).map(raw => normalizeAuchan(raw, entry.fetched_at));
  return { store: 'auchan', query, count: products.length, products };
}
