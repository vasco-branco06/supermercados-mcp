# Contrato dos servidores de supermercado

Vale para os três servidores: `continente-mcp` (do David Marques, não alterado), `pingo-doce-mcp` e `auchan-mcp`. Os dois últimos imitam o do David em nomes e parâmetros. Este contrato só se muda na sessão principal.

## Ferramentas

| Ferramenta | Parâmetros | Quando existe |
|---|---|---|
| `search_products` | `query` (texto, 1 a 250 caracteres, sem caracteres de controlo), `limit` (inteiro 1 a 50, por omissão 10) | sempre, sem login |
| `get_cart` | nenhum | sempre (pede login se não houver sessão) |
| `add_to_cart` | `product_id` (texto), `quantity` (número maior que 0, por omissão 1) | sempre (pede login se não houver sessão) |
| `update_cart_item` | `product_id`, `quantity` (0 remove a linha) | sempre (pede login se não houver sessão) |
| `login` | nenhum | sempre; só Pingo Doce e Auchan |
| `logout` | nenhum | sempre; só Pingo Doce e Auchan |
| `close_session` | nenhum | sempre |

Não existe nenhuma ferramenta para finalizar a encomenda ou pagar, em nenhum dos três. Favoritos e histórico (`get_favorites`, `refresh_favorites`, `get_order_history`, `get_most_bought`) são só do Continente e ficam fora da v1 nos outros dois.

No Pingo Doce e no Auchan não há ficheiros de credenciais. Quando uma ferramenta do carrinho precisa de sessão (ou quando se chama `login`), abre-se uma janela do browser que a pessoa já tem (Edge ou Chrome) na página de login do supermercado; a pessoa entra ela mesma, a janela fecha e só ficam as cookies da sessão em `~/.pingodoce-mcp/cookies.json` ou `~/.auchan-mcp/cookies.json`. A palavra-passe nunca passa pelo servidor. `logout` apaga essa sessão. Nunca há cookies, tokens nem credenciais nas respostas nem nos registos.
- O Continente (servidor do David) regista as ferramentas do carrinho sempre e continua a pedir `~/.continente/credentials.env`; a skill trata essa diferença.

## Formato do produto

Cada produto devolvido pela pesquisa tem exatamente estes campos (schema em `shared/schema.js`). O que não se sabe fica `null`; nunca se inventa.

| Campo | Tipo | Notas |
|---|---|---|
| `store` | `continente`, `pingo-doce` ou `auchan` | |
| `product_id` | texto | o que `add_to_cart` aceita |
| `name` | texto | tal como o site mostra |
| `brand` | texto ou null | |
| `price` | número maior que 0 | em euros, preço que o cliente paga agora |
| `currency` | `EUR` | o do David devolve `€`; o normalizador converte |
| `size` | texto ou null | por exemplo `1 L` (só o Pingo Doce o mostra à parte) |
| `unit_price` | número ou null | euros por `unit`; vem com `unit` ou ambos null |
| `unit` | `kg`, `l`, `un` ou null | outras unidades (por exemplo 100 g) ficam null |
| `promo` | `{ label, original_price }` ou null | `original_price` pode ser null |
| `minimum` | texto ou null | por exemplo a quantidade mínima de produtos ao peso |
| `available` | verdadeiro, falso ou null | |
| `url` | endereço absoluto | |
| `fetched_at` | data e hora ISO | |

O `unit` do David (texto como `0,89€/lt`) passa a `unit_price` mais `unit`.

Limites do que cada site mostra na pesquisa (verificado em 2026-10-16):
- Continente: sem marca, tamanho, promoção nem disponibilidade (null).
- Pingo Doce: promoção visível como texto e preço antigo; sem disponibilidade (null).
- Auchan: sem disponibilidade (null) e sem promoção (null): a promoção só carrega depois por outro pedido e a pesquisa não mostra a disponibilidade.

## Resposta de `search_products`

Nos servidores do Pingo Doce e do Auchan, a resposta MCP tem um único bloco de texto com JSON:

```json
{ "store": "pingo-doce", "query": "leite", "count": 3, "products": [ /* produtos no formato acima */ ] }
```

- `limit` limita o número de produtos; se a página do site trouxer menos, devolve os que há (a v1 não pagina).
- Sem resultados: `count: 0` e `products: []`, sem erro.
- Erro (site mudou, bloqueio, sem rede): resposta com `isError: true` e uma frase que diz o que falhou, por exemplo `Error: pingo-doce: não encontrei os preços na página (o site pode ter mudado)`. Nunca um produto com preço inventado.
- O Continente responde em texto formatado (é o servidor do David, não se altera). A skill extrai de lá `name, price, product_id, url, unit` e usa `normalizeContinente`.

## Resposta de `get_cart`

Nos servidores do Pingo Doce e do Auchan, a resposta é um único bloco de texto com JSON:

```json
{ "store": "auchan", "count": 1, "items": [ { "product_id": "3010403", "name": "...", "quantity": 2, "price": 0.85 } ], "total": "1,70 €" }
```

- `price` é número ou null; `total` é o texto que o site mostra, ou null.
- Só estes campos. Nunca tokens, cookies, identificadores internos da sessão nem credenciais.
- Erro: `isError: true` com uma frase, como na pesquisa.
- `add_to_cart` e `update_cart_item` respondem com uma frase curta em português; `update_cart_item` com quantidade 0 remove a linha.

## Normalização

- `normalizeContinente(raw, fetched_at)`: `raw` é o objeto que o código do David devolve por produto (`name, price, currency, product_id, url, unit, minimum`).
- `normalizePingoDoce(raw, fetched_at)`: `raw = { product_id, name, brand, price, unit_text, original_price, promo_label, url }`.
- `normalizeAuchan(raw, fetched_at)`: `raw = { product_id, name, brand, price, unit_text, url }`.

Cada uma valida com o schema e falha com erro se os dados não servirem. Um preço que não passe nunca chega ao histórico.

## Fixtures e testes de contrato

`shared/fixtures/` tem, por supermercado:
- `*-leite.raw.json`: o que o parser do servidor tem de extrair.
- `*-leite.expected.json`: o que o normalizador tem de devolver.
- `*-leite.html` (só Pingo Doce e Auchan): excerto real da pesquisa "leite" de 2026-10-16, sem scripts.

O servidor de cada sessão tem de provar, num teste sem internet, que `parse(html)` dá exatamente o `raw.json`. Se o site mudar e o parse falhar, a ferramenta devolve um erro que diz o que falhou. Nunca devolve um preço inventado.

As fixtures do Continente são os objetos do David reconstruídos a partir da saída real de 2026-10-16. O endereço `url` segue o padrão `https://www.continente.pt/produto/<id>.html` visto nos resultados.

## Regras de acesso aos sites

- No máximo 1 pedido por segundo a cada site.
- Cache dos resultados de pesquisa durante algumas horas.
- User-agent honesto que identifica o projeto (`supermercados-mcp/<versão>`).
- Sem contornar CAPTCHA nem proteção anti-bot: se aparecer, o servidor devolve erro.
- Os `robots.txt` dos três sites pedem para não aceder à pesquisa automaticamente. O projeto segue por decisão do dono, assumindo o risco de bloqueio, e o README tem de o dizer.
