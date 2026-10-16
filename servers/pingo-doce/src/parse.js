import * as cheerio from 'cheerio';

export const PINGO_DOCE_BASE = 'https://www.pingodoce.pt';

const text = ($el) => $el.first().text().replace(/\s+/g, ' ').trim();

const price = ($el) => {
  const value = Number($el.first().attr('content'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

export class SiteChangedError extends Error {}

// Parses a Pingo Doce search page into raw objects for normalizePingoDoce.
// Tiles without a readable price are skipped; a page with tiles but no prices throws.
export function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const tiles = $('div.product[data-pid]');
  const products = [];
  const seen = new Set();

  tiles.each((_, el) => {
    const $el = $(el);
    const productId = $el.attr('data-pid');
    const current = price($el.find('.sales .value[content]'));
    const link = $el.find('.product-name-link a').first();
    const href = link.attr('href');
    const name = text(link);
    if (!productId || current === null || !href || !name || seen.has(productId)) return;
    seen.add(productId);

    const reduced = $el.find('.sales.reduced-price').length > 0;
    products.push({
      product_id: productId,
      name,
      brand: text($el.find('.product-brand-name')) || null,
      price: current,
      unit_text: text($el.find('.product-unit')) || null,
      original_price: reduced ? price($el.find('.strike-through.list .value[content]')) : null,
      promo_label: text($el.find('.promo-message')) || null,
      url: new URL(href, PINGO_DOCE_BASE).href,
    });
  });

  if (tiles.length > 0 && products.length === 0) {
    throw new SiteChangedError('pingo-doce: não encontrei os preços na página (o site pode ter mudado)');
  }
  // Product ids on the page but no tiles: the tile markup changed.
  if (tiles.length === 0 && /data-pid="\d+"/.test(html)) {
    throw new SiteChangedError('pingo-doce: não encontrei os produtos na página (o site pode ter mudado)');
  }
  return products;
}
