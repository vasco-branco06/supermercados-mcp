import { ProductSchema } from './schema.js';

const UNIT_ALIASES = { kg: 'kg', l: 'l', lt: 'l', un: 'un', uni: 'un', unid: 'un' };

const toNumber = (text) => Number(text.replace(',', '.'));

// "0,89€/lt", "1 L | 0,85 €/L", "0.85 €/Lt" -> { unit_price: 0.89, unit: 'l' }.
// Returns null for anything else (e.g. per 100 g) instead of guessing.
export function parseUnitPrice(text) {
  const match = /(\d+(?:[.,]\d+)?)\s*€\s*\/\s*([a-z]+)\b/i.exec(text ?? '');
  const unit = match && UNIT_ALIASES[match[2].toLowerCase()];
  return unit ? { unit_price: toNumber(match[1]), unit } : null;
}

// "1 L | 0,85 €/L" -> "1 L". Only Pingo Doce shows the size separately.
export function parseSize(text) {
  const size = (text ?? '').split('|')[0].trim();
  return size && !size.includes('€') ? size : null;
}

const common = (store, raw, fetched_at) => ({
  store,
  product_id: raw.product_id,
  name: raw.name,
  currency: 'EUR',
  url: raw.url,
  fetched_at,
});

const unitFields = (text) => parseUnitPrice(text) ?? { unit_price: null, unit: null };

// raw: the object parsed by continente-mcp's parseProducts (name, price, product_id, url, unit "0,89€/lt", minimum).
export function normalizeContinente(raw, fetched_at) {
  return ProductSchema.parse({
    ...common('continente', raw, fetched_at),
    brand: null,
    price: raw.price,
    size: null,
    ...unitFields(raw.unit),
    promo: null,
    minimum: raw.minimum ?? null,
    available: null,
  });
}

// raw: { product_id, name, brand, price, unit_text, original_price, promo_label, url }
export function normalizePingoDoce(raw, fetched_at) {
  return ProductSchema.parse({
    ...common('pingo-doce', raw, fetched_at),
    brand: raw.brand || null,
    price: raw.price,
    size: parseSize(raw.unit_text),
    ...unitFields(raw.unit_text),
    promo: raw.promo_label ? { label: raw.promo_label, original_price: raw.original_price ?? null } : null,
    minimum: null,
    available: null,
  });
}

// raw: { product_id, name, brand, price, unit_text, available, url }
export function normalizeAuchan(raw, fetched_at) {
  return ProductSchema.parse({
    ...common('auchan', raw, fetched_at),
    brand: raw.brand || null,
    price: raw.price,
    size: null,
    ...unitFields(raw.unit_text),
    promo: null,
    minimum: null,
    available: raw.available,
  });
}
