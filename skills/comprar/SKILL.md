---
name: comprar
description: Usar SEMPRE que a pessoa quiser comprar, procurar ou comparar produtos de supermercado, pôr coisas no carrinho, ou perguntar onde fica mais barato (Continente, Pingo Doce, Auchan), seja com uma lista, uma receita ou pedidos soltos. Procura os produtos, escolhe o mais barato de cada item e põe-nos no carrinho do supermercado que a pessoa disser; se não disser nenhum, compara os três e propõe o mais barato. Nunca encomenda nem paga.
---

# Comprar

A skill nunca encomenda nem paga. Diz isso à pessoa logo no início: a encomenda e o pagamento ficam sempre do lado dela, no site do supermercado.

## 1. O que comprar

- Usa a lista da conversa ou os itens que a pessoa disse.
- Se a pessoa pediu uma receita ou um prato ("lasanha para 4"), passa-o a ingredientes com quantidades de supermercado (kg, g, L, ml ou unidades), e tira o que ela disser que já tem em casa. Se pediu um plano da semana, usa a skill `receitas-semana`.
- Se faltar algo que muda o resultado (quantidade, uma marca que ela exige), pergunta numa linha.

## 2. Em que supermercado

- Se a pessoa disse um supermercado (ou dois), usa só esses.
- Se não disse nenhum, compara os três e diz isso numa linha: "Não indicaste supermercado, por isso vou comparar os três."
- Se a pessoa pediu para comparar, compara os três mesmo que tenha nomeado um.
- Os servidores chamam-se `continente`, `pingo-doce` e `auchan`.

## 3. Procurar

Para cada item, chama `search_products` em cada servidor escolhido com um termo curto (por exemplo "leite meio gordo") e `limit` 5.

- Pingo Doce e Auchan respondem com JSON: `{ store, query, count, products: [...] }`. Cada produto já vem no formato do contrato.
- O Continente responde em texto, com um bloco numerado por produto: o nome na primeira linha, depois a linha do preço (por exemplo `5.34€ (0,89€/lt)`), uma linha opcional `Minimum ...` e a linha com o `product_id`. Tira de lá `name`, `price`, `unit` (o que está entre parênteses), `minimum` e `product_id`. Se a resposta trouxer `structuredContent.products`, usa esses objetos em vez do texto.
- Se um servidor der erro (`isError`) ou não responder, diz qual foi e o que falhou, e continua com os outros. Nunca inventes nem estimes um preço.
- Sem resultados para um item num supermercado: marca "não encontrado" nesse supermercado.

## 4. Escolher o mais barato em cada supermercado

- Para cada item, entre os resultados que são mesmo o que a pessoa pediu (o mesmo tipo de produto, e a marca que ela exigiu, se exigiu), escolhe o que custa menos para a quantidade de que ela precisa: compara pelo `unit_price` e `unit` (euros por kg, litro ou unidade) e calcula quantas embalagens cobrem a necessidade, arredondando para cima. O mais barato não é o de menor preço de embalagem, é o de menor custo pela quantidade que precisa.
- Só `available: false` exclui um produto. `available: null` quer dizer "não sabemos" (nenhum dos três sites mostra a disponibilidade na pesquisa): o produto entra.
- No Continente o `unit` vem como texto (`0,89€/lt` quer dizer 0,89 euros por litro). Se faltar o preço por unidade, avisa que a comparação por unidade não é possível para esse produto e compara só o preço da embalagem, dizendo-o.
- Marca como "a confirmar" as equivalências duvidosas: marca própria contra marca conhecida, tamanhos muito diferentes, ou nomes que podem não ser o mesmo produto.

## 5. Comparar os três (só quando há mais de um supermercado)

1. Mostra o total do cesto completo em cada supermercado e quantos itens ficaram por encontrar. Um total com itens em falta não é comparável com os outros: diz isso.
2. Recomenda numa linha o supermercado onde o cesto completo fica mais barato e, se compensar, a alternativa de dividir as compras por dois.
3. Se a diferença for pequena ou houver itens em falta, pergunta em qual a pessoa quer comprar.

## 6. Confirmar e pôr no carrinho

1. Mostra uma tabela do supermercado escolhido: item, produto escolhido, quantidade e preço, com as notas "a confirmar". Pergunta uma vez: "Ponho isto no carrinho do <supermercado>?".
2. Com o sim, chama `add_to_cart` para cada item, um a um, e no fim `get_cart`: mostra o que ficou no carrinho e o total. Se um item falhar, diz qual e continua com os outros.
3. Login:
   - O Auchan e o Continente entram sozinhos com o email e a palavra-passe do ficheiro de credenciais do plugin. Se uma ferramenta disser que falta o ficheiro ou que o login falhou, usa a skill `credenciais` para o abrir à pessoa.
   - O Auchan precisa também de a pessoa ter escolhido uma vez, no site, a entrega ou o levantamento com o código postal (sem isso não aceita produtos), e só deixa encomendar a partir de 20 €.
   - No Pingo Doce, a primeira vez abre-se uma página de login no browser: avisa a pessoa de que deve entrar nela (com o código que recebe por SMS ou email) e espera.
4. Se o supermercado não tiver as ferramentas do carrinho ou o login não for possível, dá à pessoa a lista com os produtos escolhidos, para ela comprar no site.
5. Se a pessoa quiser dividir por dois supermercados, repete os passos 1 e 2 para cada um.
6. Opcional, se a pessoa quiser guardar o histórico: grava a lista e os preços com o script `../../scripts/dist/historico.js` a partir da pasta desta skill. Escreve um ficheiro JSON temporário com `{ "lists": [{ "store": "<supermercado>", "items": [{ "quantity": <n>, "product": <produto> }] }], "seen": [<outros produtos vistos>] }` e corre `node "<pasta do plugin>/scripts/dist/historico.js" save <ficheiro.json>`. Os produtos do Pingo Doce e do Auchan vão tal como vieram; os do Continente vão como `{ name, price, currency, product_id, url, unit, minimum, fetched_at }` sem o campo `store`. Para ver compras anteriores: `node "<pasta do plugin>/scripts/dist/historico.js" history --limit 5`.
7. Termina a lembrar que a encomenda e o pagamento se fazem no site, pela pessoa.
