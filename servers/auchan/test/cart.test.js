import assert from 'node:assert/strict';
import test from 'node:test';
import { CART_ACTIONS, addToCart, cartPath, getCart, parseCart, updateCartItem, validateCartInput } from '../src/cart.js';

const cartHtml = (lines) => `<html><body><input type="hidden" name="csrf_token" value="tok123">
${lines.map(({ pid, uuid, qty, name }) => `<div class="card product-info uuid-${uuid}">
  <div class="line-item-name"><span>${name}</span></div>
  <input class="quantity" type="number" data-pid="${pid}" data-uuid="${uuid}" value="${qty}">
  <button class="remove-product" data-pid="${pid}" data-uuid="${uuid}" data-name="${name}"></button>
</div>`).join('\n')}</body></html>`;

// A fake auchan.pt: keeps a basket in memory and records every call.
function fakeSite({ lines = [], reject = false, ignoreWrites = false } = {}) {
  const calls = [];
  const basket = new Map(lines.map(l => [l.pid, { ...l }]));
  const json = (body, status = 200) => ({ status, text: JSON.stringify(body) });
  const handle = (method, path, form) => {
    calls.push({ method, path, form });
    const url = new URL(path, 'https://www.auchan.pt');
    const action = url.pathname.split('/').pop();
    const q = Object.fromEntries(url.searchParams);
    if (action === 'Cart-Show') return { status: 200, text: cartHtml([...basket.values()]) };
    if (reject) return json({ error: true, message: 'Produto sem stock' });
    if (ignoreWrites) return json({ error: false });
    if (action === 'Cart-AddProduct') {
      const line = basket.get(form.pid) ?? { pid: form.pid, uuid: `u${form.pid}`, qty: 0, name: 'Novo' };
      basket.set(form.pid, { ...line, qty: line.qty + Number(form.quantity) });
      return json({ error: false, quantityTotal: 1 });
    }
    if (action === 'Cart-UpdateQuantity') { basket.get(q.pid).qty = Number(q.quantity); return json({ items: [] }); }
    if (action === 'Cart-RemoveProductLineItem') { basket.delete(q.pid); return json({ basket: {} }); }
    throw new Error(`unexpected ${path}`);
  };
  return {
    calls,
    async get(path) { return handle('GET', path); },
    async post(path, form) { return handle('POST', path, form); },
  };
}

const milk = { pid: '3010403', uuid: 'abc', qty: 2, name: 'Leite UHT Auchan Meio Gordo 1L' };

test('parseCart reads lines, quantities and the CSRF token', () => {
  assert.deepEqual(parseCart(cartHtml([milk])), {
    items: [{ product_id: '3010403', uuid: 'abc', name: 'Leite UHT Auchan Meio Gordo 1L', quantity: 2 }],
    csrf: 'tok123',
  });
  assert.deepEqual(parseCart('<html><body></body></html>').items, []);
});

test('only cart actions exist: there is no way to reach checkout or payment', () => {
  assert.deepEqual(CART_ACTIONS, ['Cart-Show', 'Cart-AddProduct', 'Cart-UpdateQuantity', 'Cart-RemoveProductLineItem']);
  for (const action of ['CheckoutServices-PlaceOrder', 'Checkout-Begin', 'Order-Confirm', 'Payment-Submit']) {
    assert.throws(() => cartPath(action), /não permitida/);
  }
});

test('cart input is validated before anything is sent', () => {
  assert.deepEqual(validateCartInput('add_to_cart', { product_id: '3010403' }), { product_id: '3010403', quantity: 1 });
  assert.throws(() => validateCartInput('add_to_cart', { product_id: '../Checkout' }), /product_id/);
  assert.throws(() => validateCartInput('add_to_cart', { product_id: '1', quantity: 0 }), /1 a 99/);
  assert.throws(() => validateCartInput('add_to_cart', { product_id: '1', quantity: 1.5 }), /inteiro/);
  assert.throws(() => validateCartInput('update_cart_item', { product_id: '1' }), /0 a 99/);
  assert.equal(validateCartInput('update_cart_item', { product_id: '1', quantity: 0 }).quantity, 0);
});

test('addToCart posts once, with the CSRF token, and confirms the new quantity', async () => {
  const site = fakeSite({ lines: [milk] });
  assert.deepEqual(await addToCart(site, '3010403', 3), { success: true, product_id: '3010403', cart_quantity: 5 });
  const posts = site.calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].form, { pid: '3010403', quantity: '3', options: '[]', csrf_token: 'tok123' });
  assert.match(posts[0].path, /Sites-AuchanPT-Site\/pt_PT\/Cart-AddProduct$/);
});

test('updateCartItem sets a quantity, and zero removes the line', async () => {
  const site = fakeSite({ lines: [milk] });
  assert.equal((await updateCartItem(site, '3010403', 4)).cart_quantity, 4);
  assert.match(site.calls.find(c => c.path.includes('UpdateQuantity')).path, /pid=3010403&uuid=abc&csrf_token=tok123&quantity=4/);
  assert.equal((await updateCartItem(site, '3010403', 0)).cart_quantity, 0);
  assert.equal((await getCart(site)).items.length, 0);
});

test('a product not in the cart is reported without writing', async () => {
  const site = fakeSite();
  assert.deepEqual(await updateCartItem(site, '999', 1), { success: false, error: 'not_in_cart', product_id: '999', writeAttempted: false });
  assert.equal(site.calls.length, 1);
});

test('a rejected or unconfirmed write is reported and never repeated', async () => {
  const rejected = fakeSite({ reject: true });
  assert.deepEqual(await addToCart(rejected, '1', 1), { success: false, error: 'Produto sem stock', writeAttempted: true });
  assert.equal(rejected.calls.filter(c => c.method === 'POST').length, 1);

  const ignored = fakeSite({ lines: [milk], ignoreWrites: true });
  const result = await addToCart(ignored, '3010403', 1);
  assert.equal(result.error, 'cart_quantity_not_confirmed');
  assert.equal(result.actual, 2);
  assert.equal(ignored.calls.filter(c => c.method === 'POST').length, 1);
});
