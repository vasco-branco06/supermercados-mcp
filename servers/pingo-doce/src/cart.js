import { PINGO_DOCE_BASE } from './parse.js';

const SITE = `${PINGO_DOCE_BASE}/on/demandware.store/Sites-pingo-doce-Site/default`;

// The only site actions this server may call. There is no checkout, order or payment action,
// and actionUrl refuses anything outside this list.
export const ACTIONS = Object.freeze({
  login: 'Login-Show',
  account: 'Account-Show',
  get: 'Cart-Get',
  add: 'Cart-AddProduct',
  update: 'Cart-UpdateQuantity',
  remove: 'Cart-RemoveProductLineItem',
});

export function actionUrl(action, params = {}) {
  if (!Object.values(ACTIONS).includes(action)) throw new Error(`Action not allowed: ${action}`);
  const url = new URL(`${SITE}/${action}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.href;
}

const money = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// SFRA basket JSON -> { items: [{ product_id, name, quantity, price, uuid }], total }.
export function summarizeCart(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return {
    items: items.map((item) => ({
      product_id: String(item.id),
      name: item.productName ?? null,
      quantity: Number(item.quantity),
      price: money(item.price?.sales?.value),
      uuid: item.UUID ?? null,
    })),
    total: typeof json?.totals?.grandTotal === 'string' ? json.totals.grandTotal : null,
  };
}

const publicCart = (cart) => ({ items: cart.items.map(({ uuid, ...rest }) => rest), total: cart.total });
const findItem = (cart, productId) => cart.items.find((item) => item.product_id === productId);

// request(action, { method, params }) -> { status, json } is provided by the logged-in session.
export function createCart({ request }) {
  async function call(action, options) {
    const { status, json } = await request(action, options);
    if (status !== 200 || !json || typeof json !== 'object') return { error: `http_${status}` };
    if (json.error) return { error: json.message || 'site_error' };
    return { json };
  }

  async function getCart() {
    const { json, error } = await call(ACTIONS.get, { method: 'GET' });
    return error ? { error } : publicCart(summarizeCart(json));
  }

  async function addToCart(productId, quantity) {
    const { json, error } = await call(ACTIONS.add, { method: 'POST', params: { pid: productId, quantity } });
    if (error) return { success: false, error };
    const line = findItem(summarizeCart(json.cart ?? json), productId);
    if (!line) return { success: false, error: 'cart_add_not_confirmed' };
    return { success: true, product_id: productId, quantity: line.quantity };
  }

  async function updateCartItem(productId, quantity) {
    const before = await call(ACTIONS.get, { method: 'GET' });
    if (before.error) return { success: false, error: before.error };
    const line = findItem(summarizeCart(before.json), productId);
    if (!line) return { success: false, error: 'not_found' };
    if (!line.uuid) return { success: false, error: 'missing_line_id' };

    const change = quantity === 0
      ? await call(ACTIONS.remove, { method: 'GET', params: { pid: productId, uuid: line.uuid } })
      : await call(ACTIONS.update, { method: 'GET', params: { pid: productId, quantity, uuid: line.uuid } });
    if (change.error) return { success: false, error: change.error };

    // Check the basket afterwards instead of trusting the response.
    const after = await call(ACTIONS.get, { method: 'GET' });
    if (after.error) return { success: false, error: 'cart_quantity_not_confirmed' };
    const now = findItem(summarizeCart(after.json), productId);
    if ((now?.quantity ?? 0) !== quantity) return { success: false, error: 'cart_quantity_not_confirmed' };
    return { success: true, product_id: productId, quantity };
  }

  return { getCart, addToCart, updateCartItem };
}
