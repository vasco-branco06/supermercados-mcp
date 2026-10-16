import * as cheerio from 'cheerio';

const PIPELINE = '/on/demandware.store/Sites-AuchanPT-Site/pt_PT/';
// The only site actions this server may call. There is no checkout, order or payment action, on purpose.
export const CART_ACTIONS = ['Cart-Show', 'Cart-AddProduct', 'Cart-UpdateQuantity', 'Cart-RemoveProductLineItem'];

export function cartPath(action, params = {}) {
  if (!CART_ACTIONS.includes(action)) throw new Error(`ação não permitida: ${action}`);
  const query = new URLSearchParams(params).toString();
  return `${PIPELINE}${action}${query ? `?${query}` : ''}`;
}

export function validateCartInput(name, args) {
  if (typeof args.product_id !== 'string' || !/^\d{1,20}$/.test(args.product_id)) {
    throw new Error('product_id inválido: usa o número que a pesquisa devolve (por exemplo "3010403")');
  }
  const quantity = args.quantity ?? (name === 'add_to_cart' ? 1 : undefined);
  const min = name === 'add_to_cart' ? 1 : 0;
  if (!Number.isInteger(quantity) || quantity < min || quantity > 99) {
    throw new Error(name === 'add_to_cart'
      ? 'quantity tem de ser um número inteiro de 1 a 99'
      : 'quantity tem de ser um número inteiro de 0 a 99 (0 remove o produto)');
  }
  return { product_id: args.product_id, quantity };
}

// Cart page HTML -> { items: [{ product_id, uuid, name, quantity, price }], total, csrf }.
// Every line item control on the cart page carries data-pid and data-uuid.
// uuid and csrf are for the site requests only; publicCart() is what tools may return.
export function parseCart(html) {
  const $ = cheerio.load(html);
  const lines = new Map();
  $('[data-pid][data-uuid]').each((_, el) => {
    const $el = $(el);
    const uuid = $el.attr('data-uuid');
    const line = lines.get(uuid) ?? { product_id: $el.attr('data-pid'), uuid, name: null, quantity: null, price: null };
    const value = $el.is('select') ? $el.find('option[selected]').attr('value') ?? $el.val() : $el.attr('value');
    if ($el.is('input, select') && line.quantity === null && value !== undefined) line.quantity = Number(value);
    const $line = $el.closest('.product-info, .line-item, .card');
    line.name ??= $el.attr('data-name') || $line.find('.line-item-name').first().text().replace(/\s+/g, ' ').trim() || null;
    const price = Number($line.find('.sales .value[content]').first().attr('content') || NaN);
    if (line.price === null && Number.isFinite(price) && price > 0) line.price = price;
    lines.set(uuid, line);
  });
  const csrf = $('input[name="csrf_token"]').attr('value') || $('[data-csrf-protection-token]').attr('data-csrf-protection-token') || null;
  const total = $('.grand-total, .grand-total-sum').first().text().replace(/\s+/g, ' ').trim() || null;
  return { items: [...lines.values()].filter(item => Number.isFinite(item.quantity)), total, csrf };
}

// The get_cart response from shared/CONTRATO.md: no tokens, no line uuids.
export const publicCart = (cart) => ({
  store: 'auchan',
  count: cart.items.length,
  items: cart.items.map(({ product_id, name, quantity, price }) => ({ product_id, name, quantity, price })),
  total: cart.total,
});

const quantityOf = (cart, productId) =>
  cart.items.filter(item => item.product_id === productId).reduce((sum, item) => sum + item.quantity, 0);

// `site` is { get(path), post(path, form) } -> { status, text }, already logged in.
export async function getCart(site) {
  const res = await site.get(cartPath('Cart-Show'));
  if (res.status >= 400) throw new Error(`não consegui abrir o carrinho (HTTP ${res.status})`);
  return parseCart(res.text);
}

async function sendChange(site, request) {
  const res = await request();
  let payload = null;
  try { payload = JSON.parse(res.text); } catch {}
  if (res.status >= 400 || !payload || payload.error === true || payload.success === false) {
    return { ok: false, error: payload?.message || `o site recusou a alteração (HTTP ${res.status})` };
  }
  return { ok: true };
}

// After a write, never repeat it automatically: report and let the user check with get_cart.
async function confirmQuantity(site, productId, expected) {
  const cart = await getCart(site).catch(() => null);
  const actual = cart ? quantityOf(cart, productId) : null;
  if (actual !== expected) {
    return { success: false, error: 'cart_quantity_not_confirmed', product_id: productId, expected, actual, writeAttempted: true };
  }
  return { success: true, product_id: productId, cart_quantity: actual };
}

export async function addToCart(site, productId, quantity) {
  const before = await getCart(site);
  const previous = quantityOf(before, productId);
  const form = { pid: productId, quantity: String(quantity), options: '[]' };
  if (before.csrf) form.csrf_token = before.csrf;
  const sent = await sendChange(site, () => site.post(cartPath('Cart-AddProduct'), form));
  if (!sent.ok) return { success: false, error: sent.error, writeAttempted: true };
  return confirmQuantity(site, productId, previous + quantity);
}

export async function updateCartItem(site, productId, quantity) {
  const before = await getCart(site);
  const line = before.items.find(item => item.product_id === productId);
  if (!line) return { success: false, error: 'not_in_cart', product_id: productId, writeAttempted: false };
  const params = { pid: productId, uuid: line.uuid };
  if (before.csrf) params.csrf_token = before.csrf;
  const sent = quantity === 0
    ? await sendChange(site, () => site.get(cartPath('Cart-RemoveProductLineItem', params)))
    : await sendChange(site, () => site.get(cartPath('Cart-UpdateQuantity', { ...params, quantity: String(quantity) })));
  if (!sent.ok) return { success: false, error: sent.error, writeAttempted: true };
  return confirmQuantity(site, productId, quantity);
}
