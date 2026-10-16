import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CART_ACTIONS, addToCart, cartPath, getCart, parseCart, publicCart, updateCartItem, validateCartInput } from '../src/cart.js';

// Same structure as the real cart page (see test/fixtures/carrinho.html).
const attr = value => JSON.stringify(value).replace(/"/g, '&quot;');
const cartHtml = (lines, total = '1,70 €') => `<html><body><input type="hidden" name="csrf_token" value="tok123">
${lines.map(({ pid, uuid, qty, name, price }) => `<div class="card product-info uuid-${uuid} auc-cart__product-card" data-pid="${pid}" data-gtm="${attr({ name, ...(price && { price: String(price) }) })}">
  <button class="auc-cart__remove-product" data-pid="${pid}" data-uuid="${uuid}"></button>
  <input class="auc-qty-selector__group__input auc-js-update-product-quantity" type="number" value="${qty}.0" data-uuid="${uuid}">
</div>`).join('\n')}<p class="text-right basket-total"> ${total} </p></body></html>`;

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
    if (action === 'Cart-RemoveProductLineItem') { basket.delete(q.pid); return json({ basket: {} }); }
    throw new Error(`unexpected ${path}`);
  };
  return {
    calls,
    async get(path) { return handle('GET', path); },
    async post(path, form) { return handle('POST', path, form); },
  };
}

const milk = { pid: '3010403', uuid: 'abc', qty: 2, name: 'Leite UHT Auchan Meio Gordo 1L', price: 0.85 };

test('parseCart reads lines, quantities, prices, total and the CSRF token', () => {
  assert.deepEqual(parseCart(cartHtml([milk])), {
    items: [{ product_id: '3010403', uuid: 'abc', name: 'Leite UHT Auchan Meio Gordo 1L', quantity: 2, price: 0.85 }],
    total: '1,70 €',
    csrf: 'tok123',
  });
  assert.deepEqual(parseCart('<html><body></body></html>'), { items: [], total: null, csrf: null });
});

test('parseCart reads the real auchan.pt cart page', () => {
  const real = readFileSync(new URL('./fixtures/carrinho.html', import.meta.url), 'utf8');
  const cart = parseCart(real);
  assert.deepEqual(cart.items, [{ product_id: '3010403', uuid: '715067d4218764863dbd058497', name: 'LEITE UHT AUCHAN MEIO GORDO 1L', quantity: 2, price: 0.85 }]);
  assert.equal(cart.total, '1,80 €');
  assert.equal(cart.csrf, 'TOKEN');
});

test('publicCart is the contract shape and never carries tokens or line ids', () => {
  const unpriced = { pid: '11885', uuid: 'def', qty: 1, name: 'Leite Mimosa' };
  const cart = publicCart(parseCart(cartHtml([milk, unpriced])));
  assert.deepEqual(cart, {
    store: 'auchan',
    count: 2,
    items: [
      { product_id: '3010403', name: 'Leite UHT Auchan Meio Gordo 1L', quantity: 2, price: 0.85 },
      { product_id: '11885', name: 'Leite Mimosa', quantity: 1, price: null },
    ],
    total: '1,70 €',
  });
  assert.doesNotMatch(JSON.stringify(cart), /tok123|abc|def|csrf|uuid/);
});

test('only cart actions exist: there is no way to reach checkout or payment', () => {
  assert.deepEqual(CART_ACTIONS, ['Cart-Show', 'Cart-AddProduct', 'Cart-RemoveProductLineItem']);
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

test('updateCartItem sets a quantity with add and remove, and zero removes the line', async () => {
  const site = fakeSite({ lines: [milk] });
  const writes = () => site.calls.filter(c => c.method === 'POST' || /Remove/.test(c.path)).map(c => c.path.split('/').pop().split('?')[0] + (c.form ? ':' + c.form.quantity : ''));

  assert.equal((await updateCartItem(site, '3010403', 4)).cart_quantity, 4);
  assert.deepEqual(writes(), ['Cart-AddProduct:2'], 'two more units are added');

  site.calls.length = 0;
  assert.equal((await updateCartItem(site, '3010403', 1)).cart_quantity, 1);
  assert.deepEqual(writes(), ['Cart-RemoveProductLineItem', 'Cart-AddProduct:1'], 'fewer units remove the line and add the new amount');

  site.calls.length = 0;
  assert.equal((await updateCartItem(site, '3010403', 1)).cart_quantity, 1);
  assert.deepEqual(writes(), [], 'the same quantity writes nothing');

  assert.equal((await updateCartItem(site, '3010403', 0)).cart_quantity, 0);
  assert.equal((await getCart(site)).items.length, 0);
  assert.ok(!site.calls.some(c => c.path.includes('UpdateQuantity')), 'the route that answers 404 is never called');
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
