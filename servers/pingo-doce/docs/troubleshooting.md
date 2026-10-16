# Problemas comuns

- **"o site pode ter mudado"**: o Pingo Doce mudou a página de pesquisa e o servidor já não encontra os preços. Não devolve nada inventado. É preciso atualizar `src/parse.js`.
- **"o site recusou o pedido (HTTP 403)" ou "(HTTP 429)"**: o site bloqueou os pedidos. Espera algum tempo antes de tentar de novo. O servidor não contorna bloqueios.
- **"desafio anti-robô (CAPTCHA)"**: igual ao anterior. Espera e tenta mais tarde.
- **"sem ligação ao site"**: verifica a internet.
- **As ferramentas do carrinho não aparecem**: falta `~/.pingodoce-mcp/credentials.env` ou falta uma das linhas `PINGODOCE_EMAIL` e `PINGODOCE_PASSWORD`. Depois de criar o ficheiro, reinicia o cliente MCP.
- **"o login falhou"**: confirma o email e a palavra-passe em `credentials.env`. Para veres o login a acontecer, põe `PINGODOCE_LOGIN_HEADLESS=false` no `env` do servidor no cliente MCP.
- **"o carrinho precisa do browser do Playwright"**: corre `npx playwright install chromium` na pasta do servidor.
- **`cart_add_not_confirmed` / `cart_quantity_not_confirmed`**: o carrinho não mostrou a quantidade esperada depois da mudança. Corre `get_cart` antes de tentar de novo; a mudança pode ter acontecido.
- **Resultados antigos**: a pesquisa fica guardada 6 horas em `~/.pingodoce-mcp/cache/`. Apaga essa pasta para forçar uma pesquisa nova.
- **Windows**: `~/.pingodoce-mcp` é `%USERPROFILE%\.pingodoce-mcp`.

O `credentials.env` e o `~/.pingodoce-mcp/cookies.json` dão acesso à tua conta. Não os partilhes nem os ponhas em capturas de ecrã ou pedidos de ajuda.

Quando reportares um problema, indica a ferramenta e a mensagem de erro.
