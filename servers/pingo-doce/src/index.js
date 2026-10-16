#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normalizePingoDoce } from './shared.js';
import { resolveStatePaths } from './paths.js';
import { createQueue, createThrottle, validateToolInput } from './reliability.js';
import { createSearcher } from './search.js';

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

const CLOSE_TOOL = {
  name: 'close_session',
  description: 'Close the browser session used by the cart tools. Call when done to free resources.',
  inputSchema: { type: 'object', properties: {} },
};

export class PingoDoceServer {
  constructor({ env = process.env, fetchImpl = fetch, now } = {}) {
    const paths = resolveStatePaths(env);
    this.throttle = createThrottle(1000);
    this.search = createSearcher({ version: VERSION, cacheDir: paths.cacheDir, throttle: this.throttle, fetchImpl, now });
    this.server = new Server({ name: 'pingo-doce-mcp', version: VERSION }, { capabilities: { tools: {} } });
    this.pending = createQueue();
    this.setupTools();
  }

  tools() {
    return [SEARCH_TOOL, CLOSE_TOOL];
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools() }));
    this.server.setRequestHandler(CallToolRequestSchema, (request) =>
      this.callTool(request.params.name, request.params.arguments ?? {}));
  }

  callTool(name, args = {}) {
    return this.pending(() => this.executeTool(name, args));
  }

  async executeTool(name, args) {
    try {
      if (!this.tools().some((tool) => tool.name === name)) return text(`Unknown tool: ${name}`, true);
      args = validateToolInput(name, args);
      switch (name) {
        case 'search_products':
          return await this.handleSearch(args.query, args.limit ?? 10);
        case 'close_session':
          return text('Session closed.');
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

  async start() {
    await this.server.connect(new StdioServerTransport());
    console.error(`Pingo Doce MCP v${VERSION} started`);
  }
}

// npm bins run through symlinks, so compare the resolved path.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  new PingoDoceServer().start().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
