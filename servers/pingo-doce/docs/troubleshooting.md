# Problemas comuns

- **"o site pode ter mudado"**: o Pingo Doce mudou a página de pesquisa e o servidor já não encontra os preços. Não devolve nada inventado. É preciso atualizar `src/parse.js`.
- **"o site recusou o pedido (HTTP 403)" ou "(HTTP 429)"**: o site bloqueou os pedidos. Espera algum tempo antes de tentar de novo. O servidor não contorna bloqueios.
- **"desafio anti-robô (CAPTCHA)"**: igual ao anterior. Espera e tenta mais tarde. Se o CAPTCHA aparecer na janela de login, resolve-o tu.
- **"sem ligação ao site"**: verifica a internet.
- **A janela de login não abre**: o servidor usa o Microsoft Edge ou o Google Chrome que já tens. Se não tiver nenhum, instala um deles ou corre `npx playwright install chromium`. Depois pede de novo o carrinho ou usa a ferramenta `login`.
- **"a janela de login foi fechada antes de o login terminar"**: fechaste a janela antes de entrares. Pede o carrinho outra vez e faz o login na janela nova.
- **"o login não terminou em 5 minutos"**: a janela ficou aberta sem login. Tenta de novo.
- **A sessão deixou de funcionar**: usa `logout` e depois `login`. O `logout` apaga o `cookies.json`.
- **"falta o Playwright"**: volta a instalar o pacote (`npm install pingo-doce-mcp`).
- **`cart_add_not_confirmed` / `cart_quantity_not_confirmed`**: o carrinho não mostrou a quantidade esperada depois da mudança. Corre `get_cart` antes de tentar de novo; a mudança pode ter acontecido.
- **Resultados antigos**: a pesquisa fica guardada 6 horas em `~/.pingodoce-mcp/cache/`. Apaga essa pasta para forçar uma pesquisa nova.
- **Windows**: `~/.pingodoce-mcp` é `%USERPROFILE%\.pingodoce-mcp`.

O `~/.pingodoce-mcp/cookies.json` dá acesso à tua conta no Pingo Doce. Não o partilhes nem o ponhas em capturas de ecrã ou pedidos de ajuda.

Quando reportares um problema, indica a ferramenta e a mensagem de erro.
