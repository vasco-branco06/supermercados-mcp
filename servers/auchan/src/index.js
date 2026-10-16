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

const LOGIN_TOOLS = [
  {
    name: 'login',
    description: 'Connect your Auchan account with the email and password in credentials.env (no window). Logs in again by itself whenever the session ends. Cart tools call this automatically.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'logout',
    description: 'Disconnect your Auchan account: deletes the saved session from this computer (credentials.env is kept).',
    inputSchema: { type: 'object', properties: {} },
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

const CHECKOUT_NOTE = 'A encomenda e o pagamento fazem-se no site auchan.pt.';

// add_to_cart / update_cart_item answer with one short sentence (shared/CONTRATO.md).
function cartReply(result, verb, productId, success) {
  if (result.success) return text(success(result));
  if (result.error === 'not_in_cart') return text(`Error: auchan: o produto ${productId} não está no carrinho.`, true);
  return text(`Error: auchan: não consegui ${verb} ${productId} (${result.error}). Corre get_cart antes de tentar de novo.`, true);
}

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
    this.cacheDir = paths.cacheDir;
    this.fetchImpl = fetchImpl;
    this.credentialsFound = Boolean(loadCredentials(env));
    this.session = session ?? createSession({
      credentials: loadCredentials(env),
      credentialFile: paths.sharedCredentialFile,
      cookieFile: paths.cookieFile,
      headless: env.AUCHAN_LOGIN_HEADLESS !== 'false',
    });
    this.tools = [SEARCH_TOOL, ...CART_TOOLS, ...LOGIN_TOOLS, CLOSE_TOOL];

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
          return name === 'add_to_cart'
            ? cartReply(await addToCart(this.session.site, product_id, quantity), 'adicionar', product_id,
              r => `Adicionado ao carrinho: ${product_id}, agora com quantidade ${r.cart_quantity}. Usa get_cart para rever. ${CHECKOUT_NOTE}`)
            : cartReply(await updateCartItem(this.session.site, product_id, quantity), 'mudar', product_id,
              () => quantity === 0
                ? `Removido do carrinho: ${product_id}. ${CHECKOUT_NOTE}`
                : `Quantidade de ${product_id} no carrinho: ${quantity}. ${CHECKOUT_NOTE}`);
        }
        case 'login':
          return text(await this.session.login() === 'saved'
            ? 'Já tens a sessão do Auchan iniciada.'
            : 'Sessão do Auchan iniciada com o ficheiro de credenciais. Já posso usar o teu carrinho.');
        case 'logout':
          await this.session.logout();
          return text('Sessão do Auchan terminada: apaguei a sessão guardada neste computador.');
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
    console.error(`Auchan MCP v${VERSION} started${this.credentialsFound ? '' : ' (search only until credentials.env exists)'}`);
  }
}

// npm bins run through symlinks, so compare the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  new AuchanServer().start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
