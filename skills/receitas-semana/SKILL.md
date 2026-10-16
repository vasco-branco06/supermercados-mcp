---
name: receitas-semana
description: Planeia as refeições da semana a partir do perfil e do que a pessoa tem em casa, e junta tudo numa lista de compras com as quantidades somadas. Usar quando a pessoa pede receitas, ementa ou plano da semana, ou uma lista de compras.
---

# Receitas da semana

## Antes de começar

1. Lê `~/.supermercados-mcp/perfil.md` (ou o da pasta em `SUPERMERCADOS_MCP_DIR`).
2. Se não existir, diz à pessoa que primeiro é preciso criar o perfil e corre a skill `perfil`. Só continua depois de o perfil estar gravado.
3. Pergunta numa linha o que já tem na despensa e no frigorífico, e quantas refeições quer (sugestão: almoço e jantar, de segunda a domingo).

## Regras do plano

- Só receitas que se fazem com o equipamento do perfil. Sem forno, nada no forno.
- Nada que a pessoa não coma, e nada com as alergias ou restrições do perfil. Na dúvida sobre um ingrediente, deixa-o de fora.
- Doses para o número de pessoas do perfil.
- Aproveita o que a pessoa já tem em casa e repete ingredientes entre receitas para gastar menos.
- Tem em conta o orçamento semanal, mas não inventes preços: o custo real só se sabe com a skill `comprar`.

## O que mostrar

1. Tabela por dia: refeição, prato, tempo de preparação.
2. Cada receita em poucas linhas: ingredientes com quantidades e passos curtos.
3. Lista de compras:
   - Junta o mesmo ingrediente de todas as receitas e soma as quantidades (por exemplo 3 receitas com 200 g de arroz dão 600 g).
   - Tira o que a pessoa já tem em casa.
   - Usa unidades de supermercado: kg, g, L, ml ou unidades.
   - Agrupa por secção: frutas e legumes, talho e peixaria, laticínios e ovos, mercearia, congelados, outros.
4. Pergunta se quer ajustar algum prato. Depois oferece a skill `comprar` para procurar os produtos mais baratos e pô-los no carrinho do supermercado que a pessoa escolher, ou comparar os três.
