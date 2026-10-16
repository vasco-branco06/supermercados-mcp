---
name: cesto-mais-barato
description: Procura cada item de uma lista de compras no Continente, Pingo Doce e Auchan, compara preços (por kg ou litro quando os tamanhos diferem) e diz em que supermercado o cesto fica mais barato. Usar quando a pessoa quer comparar preços, saber onde comprar, ou pôr a lista no carrinho.
---

# Cesto mais barato

A skill nunca encomenda nem paga. Diz isso à pessoa logo no início: a encomenda e o pagamento ficam sempre do lado dela, no site do supermercado.

## 1. Lista

Usa a lista da conversa (por exemplo a da skill `receitas-semana`). Se não houver, pede-a. Pergunta numa linha em que supermercados procurar; por omissão os do perfil (`~/.supermercados-mcp/perfil.md`), ou os três.

## 2. Procurar

Para cada item, chama `search_products` em cada servidor (`continente`, `pingo-doce`, `auchan`) com um termo curto (por exemplo "leite meio gordo") e `limit` 5.

- Pingo Doce e Auchan respondem com JSON: `{ store, query, count, products: [...] }`. Cada produto já vem no formato do contrato.
- O Continente responde em texto, com um bloco numerado por produto: o nome na primeira linha, depois a linha do preço (por exemplo `5.34€ (0,89€/lt)`), uma linha opcional `Minimum ...` e a linha com o `product_id`. Tira de lá `name`, `price`, `unit` (o que está entre parênteses), `minimum` e `product_id`. O `url` é `https://www.continente.pt/produto/<product_id>.html`. Se a resposta trouxer `structuredContent.products`, usa esses objetos em vez do texto.
- Se um servidor der erro (`isError`) ou não responder, diz qual foi e o que falhou, e continua com os outros. Nunca inventes nem estimes um preço.
- Sem resultados para um item num supermercado: marca "não encontrado" nesse supermercado.

## 3. Comparar

- Só `available: false` exclui um produto. `available: null` quer dizer "não sabemos" (nenhum dos três sites mostra disponibilidade na pesquisa): o produto entra na comparação.
- Quando os tamanhos são diferentes, compara pelo `unit_price` e `unit` (euros por kg, litro ou unidade). No Continente o `unit` vem como texto (`0,89€/lt` quer dizer 0,89 euros por litro). Se faltar o preço por unidade, avisa que a comparação por unidade não é possível para esse produto e compara só o preço da embalagem, dizendo-o.
- Escolhe em cada supermercado o produto que melhor corresponde ao item e diz quantas embalagens cobrem a lista.
- Marca como "a confirmar" as equivalências duvidosas: marcas diferentes, tamanhos muito diferentes, ou nomes que podem não ser o mesmo produto. Pede à pessoa para confirmar antes de fechar.

## 4. Mostrar

1. Tabela por item: produto e preço em cada supermercado, melhor opção marcada, notas ("a confirmar", "sem preço por unidade", "não encontrado").
2. Total por supermercado, com quantos itens ficaram por encontrar em cada um. Um total com itens em falta não é comparável com os outros; diz isso.
3. Recomendação numa linha: o supermercado onde o cesto completo fica mais barato e, se compensar, a alternativa de dividir as compras por dois.

## 5. Quando a pessoa confirma

1. Grava a lista e os preços vistos com o script do histórico, que está em `../../scripts/dist/historico.js` a partir da pasta desta skill:
   - Escreve um ficheiro JSON temporário com `{ "lists": [{ "store": "<supermercado>", "items": [{ "quantity": <n>, "product": <produto> }] }], "seen": [<outros produtos vistos>] }`. Uma entrada em `lists` por supermercado onde a pessoa vai comprar.
   - Os produtos de Pingo Doce e Auchan vão tal como vieram. Os do Continente vão como `{ name, price, currency, product_id, url, unit, minimum, fetched_at }` sem o campo `store`; o script converte-os.
   - Corre `node "<pasta do plugin>/scripts/dist/historico.js" save <ficheiro.json>`. Se der erro, mostra a mensagem: nesse caso nada foi gravado.
2. Se o servidor desse supermercado tiver `add_to_cart`, pergunta se a pessoa quer pôr os produtos no carrinho. Só com um sim, adiciona um a um e no fim mostra `get_cart`. No Pingo Doce e no Auchan, a primeira vez abre-se uma janela do browser na página de login: avisa a pessoa de que deve entrar nessa janela e, no Auchan, escolher também a entrega ou o levantamento com o código postal (sem isso o site não aceita produtos), e espera. O carrinho do Continente só funciona se a pessoa tiver criado o ficheiro de credenciais do servidor dele (ver o README). Se a ferramenta não existir ou falhar por falta de login, diz que pode comprar no site com a lista.
3. Lembra que a encomenda e o pagamento se fazem no site, pela pessoa.

Para ver compras anteriores: `node "<pasta do plugin>/scripts/dist/historico.js" history --limit 5`.
