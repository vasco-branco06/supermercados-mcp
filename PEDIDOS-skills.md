# Pedidos da sessão das skills

Coisas fora de `.claude-plugin/`, `.mcp.json`, `skills/` e `scripts/` que a sessão principal deve decidir.

## 1. `engines` do `package.json` da raiz

`scripts/historico.js` usa `node:sqlite`. Esse módulo só funciona sem a flag `--experimental-sqlite` a partir do Node 22.13.0 (e 23.4.0). O `package.json` da raiz pede `>=22.5.0`; entre 22.5 e 22.12 o histórico falha ao arrancar. Proposta: `"node": ">=22.13.0"`.

## 2. Dependências quando o plugin é instalado

`scripts/historico.js` importa `shared/schema.js` e `shared/normalize.js`, que precisam do `zod` em `node_modules` da raiz. Os servidores locais do Pingo Doce e do Auchan devem ter o mesmo problema. Um plugin instalado a partir de um marketplace não corre `npm install` sozinho. Opções: o README manda correr `npm install` na pasta do plugin, ou publicar tudo no npm na Fase 4 e o histórico passar a ser um binário de um pacote.

## 3. README: navegador do Continente

O `continente-mcp` usa o Playwright. Antes da primeira pesquisa é preciso correr uma vez `npx -y -p continente-mcp playwright install chromium`. Confirmei a 2026-10-16 que `npx -y continente-mcp` arranca (v4.1.0) e lista as ferramentas; a pesquisa real não foi testada. O README tem de dizer isto em passos simples para Windows.

## 4. Fase 4

Trocar no `.mcp.json` os caminhos `node ${CLAUDE_PLUGIN_ROOT}/servers/.../src/index.js` por `npx -y pingo-doce-mcp` e `npx -y auchan-mcp` depois da publicação no npm. Esta sessão pode fazer a troca quando lhe pedirem.

## 5. Sugestão de issue para o David (continente-mcp)

Título: Incluir o `url` do produto na resposta em texto de `search_products`

> O texto de `search_products` mostra nome, preço, preço por unidade e `product_id`, mas não o endereço do produto. O `structuredContent.products` já o tem. Clientes MCP que só leem o bloco de texto têm de reconstruir o endereço a partir do `product_id`. Seria útil uma linha com o `url` em cada produto.
