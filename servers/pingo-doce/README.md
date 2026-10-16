# Pingo Doce MCP

Deixa o teu assistente de IA pesquisar produtos no pingodoce.pt e encher o carrinho por ti.

Faz parte do plugin [supermercados-mcp](https://github.com/vasco-branco06/supermercados-mcp) e segue os nomes e o estilo do [continente-mcp](https://github.com/davidmarqu3s/continente-mcp) de David Marques.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## O que faz

- **Pesquisa sem login**: nome, marca, tamanho, preço, preço por litro ou quilo e promoções, tal como o site os mostra.
- **Carrinho**: ver, adicionar e mudar quantidades (zero remove o produto), só se guardares as tuas credenciais.
- **Respeito pelo site**: no máximo um pedido por segundo, resultados guardados durante 6 horas e um user-agent que diz quem somos.
- **Tu decides**: a encomenda e o pagamento fazem-se sempre no pingodoce.pt. O servidor não tem nenhuma ferramenta para isso.

## Aviso sobre o robots.txt

O `robots.txt` do pingodoce.pt pede que a pesquisa não seja acedida de forma automática. Este projeto acede na mesma, por decisão do dono, e assume o risco de o site bloquear os pedidos. Se aparecer um CAPTCHA, um desafio anti-robô ou um erro HTTP 403 ou 429, o servidor pára e devolve um erro; não tenta contornar.

## Instalar

Precisa do Node.js 20.18.1 ou mais recente e de um cliente MCP, por exemplo o Claude Code. Junta o servidor e reinicia o cliente:

```json
{
  "mcpServers": {
    "pingo-doce": { "command": "npx", "args": ["-y", "pingo-doce-mcp"] }
  }
}
```

A pesquisa funciona logo, sem conta. O Pingo Doce não tem palavra-passe: cada login pede um código novo, por SMS ou por email, por isso não dá para entrar sozinho. Para o carrinho não crias nada: quando o assistente precisar dele, abre-se uma janela do Edge ou do Chrome na página de login do Pingo Doce. Entras tu, a janela fecha e ficas ligado. Se quiseres poupar o primeiro passo, escreve o teu número (9 dígitos) numa linha `PINGODOCE_PHONE=912345678` em `~/.supermercados-mcp/credentials.env` (o ficheiro que o plugin supermercados-mcp cria e abre sozinho) ou em `~/.pingodoce-mcp/credentials.env`: a janela abre com o número preenchido e o código pedido, e só escreves o código. A palavra-passe nunca passa pelo servidor nem fica guardada: só a sessão, no teu computador (`%USERPROFILE%\.pingodoce-mcp\cookies.json`). Se aparecer um CAPTCHA, resolves tu na janela.

## Usar

Pede ao assistente coisas como "procura leite meio gordo no Pingo Doce" ou "põe 2 pacotes de leite no carrinho do Pingo Doce".

| Ferramenta | Para que serve |
| --- | --- |
| `search_products` | Pesquisar o catálogo (sem login) |
| `get_cart` | Ver o carrinho |
| `add_to_cart` / `update_cart_item` | Adicionar um produto / mudar a quantidade (zero remove) |
| `login` | Ligar a tua conta: abre a janela de login (as ferramentas do carrinho fazem-no sozinhas se for preciso) |
| `logout` | Desligar a conta: apaga a sessão guardada neste computador |
| `close_session` | Libertar recursos |

A pesquisa responde com JSON: `{ "store": "pingo-doce", "query": "leite", "count": 3, "products": [...] }`. O que o site não mostra fica `null`; nenhum preço é inventado.

## Mais

- **Problemas:** [docs/troubleshooting.md](docs/troubleshooting.md).
- **Testes:** `npm test` corre sem internet. `LIVE=1 npm test` faz uma pesquisa real ao site.

## Licença

[MIT](LICENSE)
