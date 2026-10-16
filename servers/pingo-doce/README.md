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

Precisa do Node.js 20.18.1 ou mais recente. Na pasta do servidor:

```bash
npm install
```

A pesquisa já funciona. Para o carrinho, instala o browser que o servidor usa no login:

```bash
npx playwright install chromium
```

E cria o ficheiro `~/.pingodoce-mcp/credentials.env` (no Windows, `%USERPROFILE%\.pingodoce-mcp\credentials.env`) com o teu login do Pingo Doce:

```
PINGODOCE_EMAIL=tu@exemplo.pt
PINGODOCE_PASSWORD=a-tua-palavra-passe
```

Depois junta o servidor ao teu cliente MCP e reinicia-o:

```json
{
  "mcpServers": {
    "pingo-doce": { "command": "node", "args": ["/caminho/absoluto/para/servers/pingo-doce/src/index.js"] }
  }
}
```

## Usar

Pede ao assistente coisas como "procura leite meio gordo no Pingo Doce" ou "põe 2 pacotes de leite no carrinho do Pingo Doce".

| Ferramenta | Para que serve |
| --- | --- |
| `search_products` | Pesquisar o catálogo (sem login) |
| `get_cart` | Ver o carrinho |
| `add_to_cart` / `update_cart_item` | Adicionar um produto / mudar a quantidade (zero remove) |
| `close_session` | Fechar o browser do carrinho |

As três ferramentas do carrinho só aparecem quando existe o `credentials.env` com os dois valores.

A pesquisa responde com JSON: `{ "store": "pingo-doce", "query": "leite", "count": 3, "products": [...] }`. O que o site não mostra fica `null`; nenhum preço é inventado.

## Mais

- **Definições:** caminhos alternativos em [`.env.example`](.env.example).
- **Problemas:** [docs/troubleshooting.md](docs/troubleshooting.md).
- **Testes:** `npm test` corre sem internet. `LIVE=1 npm test` faz uma pesquisa real ao site.

## Licença

[MIT](LICENSE)
