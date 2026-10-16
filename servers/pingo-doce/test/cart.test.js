import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ACTIONS, actionUrl, createCart, summarizeCart } from '../src/cart.js';

// Shaped like the SFRA basket JSON (Cart-Get / Cart-AddProduct). Simulated, not captured from the site.
const basket = (lines) => ({
  items: lines.map(([id, quantity]) => ({
    id, productName: `Produto ${id}`, quantity, UUID: `uuid-${id}`, price: { sales: { value: 0.85, formatted: '0,85 €' } },
  })),
  totals: { grandTotal: '1,70 €' },
});

// A fake site: keeps a basket and records every action called.
function fakeSite(initial = []) {
  const lines = new Map(initial);
  const calls = [];
  const request = async (action, { params = {} } = {}) => {
    calls.push({ action, params });
    if (action === ACTIONS.add) lines.set(params.pid, (lines.get(params.pid) ?? 0) + params.quantity);
    if (action === ACTIONS.update) lines.set(params.pid, params.quantity);
    if (action === ACTIONS.remove) lines.delete(params.pid);
    const json = basket([...lines]);
    return { status: 200, json: action === ACTIONS.add ? { error: false, cart: json } : json };
  };
  return { request, calls, lines };
}

test('summarizeCart reads items and total', () => {
  assert.deepEqual(summarizeCart(basket([['48150', 2]])), {
    items: [{ product_id: '48150', name: 'Produto 48150', quantity: 2, price: 0.85, uuid: 'uuid-48150' }],
    total: '1,70 €',
  });
  assert.deepEqual(summarizeCart({}), { items: [], total: null });
});

test('getCart hides the internal line id', async () => {
  const cart = await createCart(fakeSite([['48150', 1]])).getCart();
  assert.deepEqual(cart.items[0], { product_id: '48150', name: 'Produto 48150', quantity: 1, price: 0.85 });
});

test('addToCart confirms the line in the returned basket', async () => {
  const site = fakeSite();
  assert.deepEqual(await createCart(site).addToCart('48150', 2), { success: true, product_id: '48150', quantity: 2 });
  assert.deepEqual(site.calls[0], { action: 'Cart-AddProduct', params: { pid: '48150', quantity: 2 } });
});

test('addToCart reports a site error without claiming success', async () => {
  const cart = createCart({ request: async () => ({ status: 200, json: { error: true, message: 'Produto indisponível' } }) });
  assert.deepEqual(await cart.addToCart('48150', 1), { success: false, error: 'Produto indisponível' });
});

test('addToCart reports when the line does not show up', async () => {
  const cart = createCart({ request: async () => ({ status: 200, json: { error: false, cart: basket([]) } }) });
  assert.equal((await cart.addToCart('48150', 1)).error, 'cart_add_not_confirmed');
});

test('updateCartItem sets the quantity and checks it afterwards', async () => {
  const site = fakeSite([['48150', 1]]);
  assert.equal((await createCart(site).updateCartItem('48150', 3)).success, true);
  assert.deepEqual(site.calls.map((c) => c.action), ['Cart-Get', 'Cart-UpdateQuantity', 'Cart-Get']);
  assert.deepEqual(site.calls[1].params, { pid: '48150', quantity: 3, uuid: 'uuid-48150' });
});

test('updateCartItem with 0 removes the line', async () => {
  const site = fakeSite([['48150', 1]]);
  assert.equal((await createCart(site).updateCartItem('48150', 0)).success, true);
  assert.equal(site.calls[1].action, 'Cart-RemoveProductLineItem');
  assert.equal(site.lines.size, 0);
});

test('updateCartItem on a missing product changes nothing', async () => {
  const site = fakeSite();
  assert.equal((await createCart(site).updateCartItem('48150', 2)).error, 'not_found');
  assert.deepEqual(site.calls.map((c) => c.action), ['Cart-Get']);
});

test('HTTP errors become error codes', async () => {
  const cart = createCart({ request: async () => ({ status: 500, json: null }) });
  assert.deepEqual(await cart.getCart(), { error: 'http_500' });
});

test('only cart and login actions are allowed; nothing reaches checkout or payment', () => {
  for (const action of Object.values(ACTIONS)) assert.doesNotMatch(action, /checkout|order|payment|billing/i);
  for (const action of ['CheckoutServices-PlaceOrder', 'Checkout-Begin', 'Order-Confirm', 'PaymentInstruments-List']) {
    assert.throws(() => actionUrl(action), /not allowed/);
  }
  assert.equal(actionUrl(ACTIONS.get), 'https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Cart-Get');
});

test('no source file mentions a checkout or payment endpoint', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const code = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(code, /Checkout-|CheckoutServices|PlaceOrder|Payment-|\/checkout/i, file);
  }
});
