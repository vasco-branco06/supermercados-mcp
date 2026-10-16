#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { addToCart, getCart, publicCart, updateCartItem, validateCartInput } from './cart.js';
import { VERSION } from './http.js';
import { loadCredentials, resolveStatePaths } from './paths.js';
import { searchProducts } from './search.js';
import { createSession } from './session.js';

const SEARCH_TOOL = {
  name: 'search_products',
  description: 'Search Auchan.pt products. Returns JSON with store, query, count and products (price in EUR, unit price). Promotions and availability are not loaded (promo and available are always null).',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term (e.g., "leite", "pao")' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max results (default: 10)' },
    },
    required: ['query'],
  },
};

const CART_TOOLS = [
  {
    name: 'get_cart',
    description: 'View your current Auchan shopping cart. Returns JSON with store, count, items (product_id, name, quantity, price) and total.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the Auchan cart by product ID. Checkout and payment always happen on Auchan.pt.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID from search results' },
        quantity: { type: 'integer', minimum: 1, maximum: 99, description: 'Quantity (default: 1)' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'update_cart_item',
    description: 'Set the quantity for a product already in the Auchan cart. Use quantity 0 to remove it.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID from search results or the cart' },
        quantity: { type: 'integer', minimum: 0, maximum: 99, description: 'Desired cart quantity' },
      },
      required: ['product_id', 'quantity'],
    },
  },
];

const CLOSE_TOOL = {
  name: 'close_session',
  description: 'Close the browser session. Call when done to free resources.',
  inputSchema: { type: 'object', properties: {} },
};

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError && { isError: true }),
});

function validateSearch(args) {
  const { query, limit = 10 } = args;
  if (typeof query !== 'string' || !query.trim() || query.length > 250 || /[\x00-\x1f\x7f]/.test(query)) {
    throw new Error('a pesquisa tem de ser texto, até 250 caracteres');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit tem de ser um número inteiro de 1 a 50');
  return { query, limit };
}

export class AuchanServer {
  // `session` and `fetchImpl` are injectable so tests never touch the network or a browser.
  constructor({ env = process.env, session, fetchImpl } = {}) {
    const paths = resolveStatePaths(env);
    const credentials = loadCredentials(env);
    this.cacheDir = paths.cacheDir;
    this.fetchImpl = fetchImpl;
    this.cartEnabled = Boolean(credentials);
    this.session = session ?? (credentials ? createSession({ credentials, cookieFile: paths.cookieFile }) : null);
    this.tools = [SEARCH_TOOL, ...(this.cartEnabled ? CART_TOOLS : []), CLOSE_TOOL];

    this.server = new Server({ name: 'auchan-mcp', version: VERSION }, { capabilities: { tools: {} } });
    this.server.onclose = () => { void this.session?.close(); };
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools }));
    this.server.setRequestHandler(CallToolRequestSchema, request =>
      this.callTool(request.params.name, request.params.arguments ?? {}));
    this.pending = Promise.resolve();
  }

  // One tool call at a time: cart tools share one browser session.
  callTool(name, args = {}) {
    const result = this.pending.then(() => this.executeTool(name, args));
    this.pending = result.catch(() => {});
    return result;
  }

  async executeTool(name, args) {
    try {
      if (!this.tools.some(tool => tool.name === name)) return text(`Unknown tool: ${name}`, true);
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('argumentos inválidos');
      switch (name) {
        case 'search_products': {
          const { query, limit } = validateSearch(args);
          return text(await searchProducts(query, limit, { cacheDir: this.cacheDir, fetchImpl: this.fetchImpl }));
        }
        case 'get_cart':
          return text(publicCart(await getCart(this.session.site)));
        case 'add_to_cart':
        case 'update_cart_item': {
          const { product_id, quantity } = validateCartInput(name, args);
          const run = name === 'add_to_cart' ? addToCart : updateCartItem;
          const result = await run(this.session.site, product_id, quantity);
          return text(result, !result.success);
        }
        case 'close_session':
          await this.session?.close();
          return text('Session closed.');
      }
    } catch (error) {
      return text(`Error: auchan: ${error.message}`, true);
    }
  }

  async start() {
    await this.server.connect(new StdioServerTransport());
    console.error(`Auchan MCP v${VERSION} started${this.cartEnabled ? '' : ' (search only: no credentials file)'}`);
  }
}

// npm bins run through symlinks, so compare the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  new AuchanServer().start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
