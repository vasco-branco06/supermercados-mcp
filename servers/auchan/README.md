# Auchan MCP

Deixa o teu assistente pesquisar produtos no Auchan.pt e encher o carrinho por ti.

[![Licença: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Feito à imagem do [continente-mcp](https://github.com/davidmarqu3s/continente-mcp) de David Marques.

## O que faz

- **Pesquisa sem conta**: nome, marca, preço, preço e preço por litro, quilo ou unidade.
- **Carrinho**: ver, juntar e mudar quantidades; cada alteração é confirmada no carrinho a seguir.
- **Respeita o site**: no máximo um pedido por segundo, resultados guardados durante 6 horas e um user-agent que diz quem é.
- **Tu decides**: a finalização da encomenda e o pagamento fazem-se sempre no Auchan.pt. O servidor não tem nenhuma ferramenta para isso.

As promoções e a disponibilidade não aparecem na pesquisa: o Auchan carrega-as em pedidos à parte que esta versão não faz, por isso `promo` e `available` vêm sempre `null`.

## Aviso

O `robots.txt` do Auchan pede que a pesquisa não seja usada de forma automática. Este servidor usa-a na mesma, com os limites acima, por decisão do dono do projeto, que assume o risco de bloqueio. Se o site bloquear ou pedir um CAPTCHA, o servidor pára e devolve um erro; nunca tenta contornar.

## Instalar

Precisas do Node.js 20.18.1 ou mais recente. Na pasta `servers/auchan`:

```
npm install
```

Para o carrinho, instala também o browser que o login usa:

```
npx playwright install chromium
```

e cria `%USERPROFILE%\.auchan-mcp\credentials.env` (no macOS/Linux, `~/.auchan-mcp/credentials.env`) com o teu login do Auchan. A pesquisa funciona sem este ficheiro.

```
AUCHAN_EMAIL=tu@exemplo.pt
AUCHAN_PASSWORD=a-tua-palavra-passe
```

Depois junta o servidor ao teu cliente MCP e reinicia-o:

```json
{
  "mcpServers": {
    "auchan": { "command": "node", "args": ["C:/caminho/para/servers/auchan/src/index.js"] }
  }
}
```

## Usar

Pede coisas como "procura leite meio-gordo no Auchan" ou "junta 2 pacotes ao carrinho do Auchan".

| Ferramenta | Para quê |
| --- | --- |
| `search_products` | Pesquisar o catálogo (devolve JSON) |
| `get_cart` | Ver o carrinho |
| `add_to_cart` / `update_cart_item` | Juntar um produto / mudar a quantidade (0 tira-o) |
| `close_session` | Fechar o browser |

As ferramentas do carrinho só aparecem quando existe o ficheiro de credenciais.

## Mais

- **Definições:** caminhos e opções em [`.env.example`](.env.example).
- **Problemas:** [docs/troubleshooting.md](docs/troubleshooting.md).
- **Testes:** `npm test` corre sem internet. `LIVE=1` liga um teste que faz um pedido real ao Auchan.pt (no PowerShell: `$env:LIVE=1; npm test`).

## Licença

[MIT](LICENSE)
