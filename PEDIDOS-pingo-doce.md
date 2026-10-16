# Pedidos da sessão do Pingo Doce

Coisas fora de `servers/pingo-doce/` que a sessão principal deve decidir. Nada disto foi alterado nesta worktree.

## 1. Formato da resposta de `get_cart` não está no contrato

O `CONTRATO.md` define a resposta de `search_products`, mas não a do carrinho. O servidor do Pingo Doce responde a `get_cart` com um bloco de texto JSON:

```json
{ "store": "pingo-doce", "count": 1, "items": [{ "product_id": "48150", "name": "...", "quantity": 2, "price": 0.85 }], "total": "1,70 €" }
```

`price` é número ou `null`; `total` é o texto que o site mostra, ou `null`. As respostas de `add_to_cart` e `update_cart_item` são frases curtas em português. Sugestão: fixar este formato no contrato para o Auchan seguir o mesmo e a skill poder ler os dois.

## 2. `npm test` na raiz também corre os testes dos servidores

`node --test` na raiz encontra `servers/*/test/*.test.js`. Esses testes importam `@modelcontextprotocol/sdk` e `cheerio`, que só existem em `servers/pingo-doce/node_modules`. Numa cópia nova, `npm test` na raiz falha até alguém correr `npm install` dentro de `servers/pingo-doce/`. Opções: limitar o teste da raiz a `shared/` (por exemplo `node --test shared/`), ou documentar a ordem de instalação no README da raiz.

## 3. Endereços do carrinho por confirmar ao vivo

Sem credenciais, o carrinho foi testado só com respostas simuladas. O código usa as ações padrão da plataforma do site (Salesforce Commerce Cloud, a mesma do Continente): `Login-Show`, `Account-Show`, `Cart-Get`, `Cart-AddProduct`, `Cart-UpdateQuantity` e `Cart-RemoveProductLineItem`. A página de pesquisa confirma `Cart-AddProduct` e `Cart-UpdateQuantity`; as outras não foram vistas. Os passos para o Vasco testar estão no `TAREFA.md` desta worktree.

## 4. Endereço do repositório no user-agent

O user-agent usa `+https://github.com/Vascobranco2509/supermercados-mcp`, como pede a tarefa. Confirmar na Fase 4; muda-se em `servers/pingo-doce/src/search.js` (função `userAgent`).

## Issues para o David

Nenhum. O servidor do Pingo Doce não depende do código do `continente-mcp`.
