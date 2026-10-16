#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePingoDoce } from './shared.js';
import { loadPhone, resolveStatePaths } from './paths.js';
import { createQueue, createThrottle, validateToolInput } from './reliability.js';
import { createSearcher } from './search.js';
import { createCart } from './cart.js';
import { createSession } from './session.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const text = (value, isError = false) => ({ content: [{ type: 'text', text: value }], ...(isError ? { isError } : {}) });

const SEARCH_TOOL = {
  name: 'search_products',
  description: 'Search Pingo Doce products (no login needed). Returns JSON with store, query, count and products.',
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
    description: 'View your current Pingo Doce cart. Returns JSON with items and total.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the Pingo Doce cart by product_id.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID from search results' },
        quantity: { type: 'number', exclusiveMinimum: 0, description: 'Quantity (default: 1)' },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'update_cart_item',
    description: 'Set the quantity of a product already in the cart. Use quantity 0 to remove the line.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID from search results or the cart' },
        quantity: { type: 'number', minimum: 0, description: 'Desired cart quantity' },
      },
      required: ['product_id', 'quantity'],
    },
  },
];

const LOGIN_TOOLS = [
  {
    name: 'login',
    description: 'Connect your Pingo Doce account. Opens a browser window on the pingodoce.pt login page. Pingo Doce has no password: the person types the code that arrives by SMS or email (if PINGODOCE_PHONE is set, the phone number is already filled in and the first step already sent), then the window closes. Nothing secret is seen or stored. Cart tools call this automatically when there is no session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'logout',
    description: 'Disconnect your Pingo Doce account: deletes the saved session from this computer.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const CLOSE_TOOL = {
  name: 'close_session',
  description: 'Close the browser session used by the cart tools. Call when done to free resources.',
  inputSchema: { type: 'object', properties: {} },
};

const CHECKOUT_NOTE = 'A encomenda e o pagamento fazem-se no site pingodoce.pt.';

export class PingoDoceServer {
  constructor({ env = process.env, fetchImpl = fetch, now, loadPlaywright, session } = {}) {
    const paths = resolveStatePaths(env);
    this.throttle = createThrottle(1000);
    this.search = createSearcher({ version: VERSION, cacheDir: paths.cacheDir, throttle: this.throttle, fetchImpl, now });
    this.session = session ?? createSession({
      cookieFile: paths.cookieFile,
      phone: loadPhone(env),
      throttle: this.throttle,
      version: VERSION,
      ...(loadPlaywright ? { loadPlaywright } : {}),
    });
    this.cart = createCart({ request: this.session.request });
    this.server = new Server({ name: 'pingo-doce-mcp', version: VERSION }, { capabilities: { tools: {} } });
    this.server.onclose = () => { void this.session?.close(); };
    this.pending = createQueue();
    this.setupTools();
  }

  tools() {
    return [SEARCH_TOOL, ...CART_TOOLS, ...LOGIN_TOOLS, CLOSE_TOOL];
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools() }));
    this.server.setRequestHandler(CallToolRequestSchema, (request) =>
      this.callTool(request.params.name, request.params.arguments ?? {}));
  }

  callTool(name, args = {}) {
    // Tools run one at a time; the cart tools share one browser session.
    return this.pending(() => this.executeTool(name, args));
  }

  async executeTool(name, args) {
    try {
      if (!this.tools().some((tool) => tool.name === name)) return text(`Unknown tool: ${name}`, true);
      args = validateToolInput(name, args);
      switch (name) {
        case 'search_products':
          return await this.handleSearch(args.query, args.limit ?? 10);
        case 'get_cart':
          return await this.handleGetCart();
        case 'add_to_cart':
          return await this.handleAddToCart(args.product_id, args.quantity ?? 1);
        case 'update_cart_item':
          return await this.handleUpdateCartItem(args.product_id, args.quantity);
        case 'login':
          return text(await this.session.login() === 'saved'
            ? 'Já tens a sessão do Pingo Doce iniciada.'
            : 'Sessão do Pingo Doce iniciada. Já posso usar o teu carrinho.');
        case 'logout':
          await this.session.logout();
          return text('Sessão do Pingo Doce terminada: apaguei a sessão guardada neste computador.');
        case 'close_session':
          await this.session?.close();
          return text('Sessão fechada.');
      }
    } catch (error) {
      return text(`Error: ${error.message}`, true);
    }
  }

  async handleSearch(query, limit) {
    const { products: raw, fetched_at } = await this.search(query);
    const products = [];
    for (const item of raw) {
      try {
        products.push(normalizePingoDoce(item, fetched_at));
      } catch {} // A product that fails the contract is left out, never patched up.
    }
    if (raw.length > 0 && products.length === 0) {
      throw new Error('pingo-doce: os produtos da página não passaram na validação (o site pode ter mudado)');
    }
    const top = products.slice(0, limit);
    return text(JSON.stringify({ store: 'pingo-doce', query, count: top.length, products: top }));
  }

  async handleGetCart() {
    const cart = await this.cart.getCart();
    if (cart.error) return text(`Error: pingo-doce: não consegui ler o carrinho (${cart.error})`, true);
    return text(JSON.stringify({ store: 'pingo-doce', count: cart.items.length, items: cart.items, total: cart.total }));
  }

  async handleAddToCart(productId, quantity) {
    const result = await this.cart.addToCart(productId, quantity);
    if (!result.success) {
      return text(`Error: pingo-doce: não consegui adicionar ${productId} (${result.error}). Corre get_cart antes de tentar de novo.`, true);
    }
    return text(`Adicionado ao carrinho: ${productId}, agora com quantidade ${result.quantity}. Usa get_cart para rever. ${CHECKOUT_NOTE}`);
  }

  async handleUpdateCartItem(productId, quantity) {
    const result = await this.cart.updateCartItem(productId, quantity);
    if (result.error === 'not_found') return text(`Error: pingo-doce: o produto ${productId} não está no carrinho.`, true);
    if (!result.success) {
      return text(`Error: pingo-doce: não consegui mudar ${productId} (${result.error}). Corre get_cart antes de tentar de novo.`, true);
    }
    return text(quantity === 0
      ? `Removido do carrinho: ${productId}. ${CHECKOUT_NOTE}`
      : `Quantidade de ${productId} no carrinho: ${quantity}. ${CHECKOUT_NOTE}`);
  }

  async start() {
    await this.server.connect(new StdioServerTransport());
    console.error(`Pingo Doce MCP v${VERSION} started`);
  }
}

// npm bins run through symlinks, so compare the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  new PingoDoceServer().start().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
