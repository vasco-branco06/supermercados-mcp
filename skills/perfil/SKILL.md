---
name: perfil
description: Cria ou atualiza o perfil de cozinha da pessoa (equipamento, restrições, gostos, pessoas, orçamento e supermercados perto). Usar quando a pessoa quer configurar o perfil, quando muda alguma coisa em casa, ou quando outra skill pede o perfil e ele não existe.
---

# Perfil de cozinha

Objetivo: saber o que a pessoa tem e o que come, e gravar isso em `~/.supermercados-mcp/perfil.md` (ou na pasta indicada pela variável `SUPERMERCADOS_MCP_DIR`).

## Como entrevistar

- Uma pergunta de cada vez. Espera pela resposta antes da seguinte.
- Cada pergunta leva uma resposta sugerida, para a pessoa só confirmar ou corrigir. Exemplo: "Que equipamento tem na cozinha? Sugestão: fogão, forno, micro-ondas e frigorífico."
- Se já existir um perfil, mostra o que lá está e pergunta só o que a pessoa quer mudar.
- Linguagem simples, sem termos técnicos. Não inventes respostas: o que a pessoa não disser fica "não indicado".

## Perguntas, por esta ordem

1. Equipamento de cozinha (fogão, forno, micro-ondas, air fryer, robot de cozinha, panela de pressão, varinha, arca congeladora).
2. Restrições e alergias (por exemplo glúten, lactose, frutos secos, marisco; vegetariano, vegano, halal).
3. Gostos: pratos e sabores de que gosta.
4. Alimentos que não come.
5. Quantas pessoas comem em casa, e se há crianças.
6. Orçamento semanal para supermercado, em euros.
7. Supermercados que tem perto: Continente, Pingo Doce, Auchan (um, vários ou todos).

## No fim

1. Mostra o resumo no formato abaixo e pergunta: "Posso gravar o perfil assim?"
2. Só grava depois de um sim claro. Cria a pasta se não existir.
3. Diz onde ficou o ficheiro.

```markdown
# Perfil
Atualizado: <data>

## Equipamento
## Restrições e alergias
## Gostos
## Não come
## Pessoas
## Orçamento semanal
## Supermercados perto
```
