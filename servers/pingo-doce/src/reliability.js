// createQueue and validateToolInput follow continente-mcp's src/reliability.js closely.
// continente-mcp: Copyright (c) 2026 David Marques, MIT License
// (https://github.com/davidmarqu3s/continente-mcp/blob/main/LICENSE).

// Runs operations one at a time, in call order.
export function createQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}

// Like createQueue, but also waits so that two operations never start less than intervalMs apart.
// Used for every request to pingodoce.pt (at most 1 per second).
export function createThrottle(intervalMs = 1000, { now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const queue = createQueue();
  let last = -Infinity;
  return (operation) => queue(async () => {
    const wait = last + intervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    return operation();
  });
}

const PRODUCT_ID = /^\d{1,12}$/;

export function validateToolInput(name, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments');
  if (name === 'search_products') {
    if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 250 || /[\x00-\x1f\x7f]/.test(args.query)) {
      throw new Error('Query must be nonempty text, at most 250 characters, without control characters');
    }
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50)) {
      throw new Error('Limit must be an integer from 1 to 50');
    }
  }
  if (name === 'add_to_cart' || name === 'update_cart_item') {
    if (typeof args.product_id !== 'string' || !PRODUCT_ID.test(args.product_id)) {
      throw new Error('Invalid product_id: expected the numeric product_id from search_products');
    }
    const quantity = args.quantity === undefined && name === 'add_to_cart' ? 1 : args.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || (name === 'add_to_cart' && quantity === 0)) {
      throw new Error(name === 'add_to_cart'
        ? 'Quantity must be finite and greater than zero'
        : 'Quantity must be finite and non-negative; zero removes the item');
    }
  }
  return args;
}
