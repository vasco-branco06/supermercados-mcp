# Auchan MCP

Deixa o teu assistente pesquisar produtos no Auchan.pt e encher o carrinho por ti.

[![Licença: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Feito à imagem do [continente-mcp](https://github.com/davidmarqu3s/continente-mcp) de David Marques.

## O que faz

- **Pesquisa sem conta**: nome, marca, preço, preço e preço por litro, quilo ou unidade.
- **Carrinho**: ver, juntar e mudar quantidades; cada alteração é confirmada no carrinho a seguir.
- **Entra sozinho**: usa o email e a palavra-passe de um ficheiro teu, em segundo plano e sem janela, e volta a entrar sempre que o Auchan termina a sessão.
- **Respeita o site**: no máximo um pedido por segundo, resultados guardados durante 6 horas e um user-agent que diz quem é.
- **Tu decides**: a finalização da encomenda e o pagamento fazem-se sempre no Auchan.pt. O servidor não tem nenhuma ferramenta para isso.

As promoções e a disponibilidade não aparecem na pesquisa: o Auchan carrega-as em pedidos à parte que esta versão não faz, por isso `promo` e `available` vêm sempre `null`.

## Aviso

O `robots.txt` do Auchan pede que a pesquisa não seja usada de forma automática. Este servidor usa-a na mesma, com os limites acima, por decisão do dono do projeto, que assume o risco de bloqueio. Se o site bloquear ou pedir um CAPTCHA, o servidor pára e devolve um erro; nunca tenta contornar.

## Instalar

Precisas do Node.js 20.18.1 ou mais recente e de um cliente MCP, por exemplo o Claude Code. Junta o servidor e reinicia o cliente:

```json
{
  "mcpServers": {
    "auchan": { "command": "npx", "args": ["-y", "auchan-mcp"] }
  }
}
```

A pesquisa funciona logo, sem conta. Para o carrinho, cria o ficheiro `%USERPROFILE%\.auchan-mcp\credentials.env` (no macOS e Linux, `~/.auchan-mcp/credentials.env`) com duas linhas, sem aspas e sem espaços à volta do `=`:

```
AUCHAN_EMAIL=o-teu-email
AUCHAN_PASSWORD=a-tua-palavra-passe
```

Também lê `~/.supermercados-mcp/credentials.env`, o ficheiro que o plugin [supermercados-mcp](https://github.com/vasco-branco06/supermercados-mcp) cria e abre sozinho na primeira vez, e o que `AUCHAN_ENV_PATH` indicar. O Auchan só aceita produtos no carrinho depois de escolheres uma vez, no site, entrega em casa ou levantamento (com o código postal); essa escolha fica guardada na tua conta.

A palavra-passe fica em texto simples nesse ficheiro, na tua pasta de utilizador. Não o partilhes. Só é lida para preencher o formulário de login e nunca aparece nas respostas nem nos registos. A sessão (cookies e armazenamento local) fica em `%USERPROFILE%\.auchan-mcp\cookies.json`.

## Usar

Pede coisas como "procura leite meio-gordo no Auchan" ou "junta 2 pacotes ao carrinho do Auchan".

| Ferramenta | Para quê |
| --- | --- |
| `search_products` | Pesquisar o catálogo (devolve JSON) |
| `get_cart` | Ver o carrinho |
| `add_to_cart` / `update_cart_item` | Juntar um produto / mudar a quantidade (0 tira-o) |
| `login` | Verificar ou renovar a sessão com o ficheiro de credenciais (as ferramentas do carrinho fazem-no sozinhas) |
| `logout` | Desligar a conta: apaga a sessão guardada neste computador (o ficheiro de credenciais fica) |
| `close_session` | Libertar recursos |

Com o servidor a correr, faz um pedido leve de 10 em 10 minutos para o Auchan não fechar a sessão por inatividade, e guarda o que o site renova.

## Mais

- **Definições:** variáveis em [`.env.example`](.env.example).
- **Problemas:** [docs/troubleshooting.md](docs/troubleshooting.md).
- **Testes:** `npm test` corre sem internet. `LIVE=1` liga um teste que faz um pedido real ao Auchan.pt (no PowerShell: `$env:LIVE=1; npm test`).

## Licença

[MIT](LICENSE)
