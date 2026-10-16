# Resolução de problemas

- **Só aparecem `search_products` e `close_session`**: o servidor não encontrou `credentials.env` com `AUCHAN_EMAIL` e `AUCHAN_PASSWORD` em `%USERPROFILE%\.auchan-mcp\`. Confirma o nome do ficheiro (o Windows às vezes acrescenta `.txt`) e reinicia o cliente MCP.
- **"o site pode ter mudado"**: o Auchan mudou a página de pesquisa e o servidor deixou de encontrar os preços. Não devolve preços inventados; é preciso atualizar o parser.
- **"o site bloqueou o pedido" ou "verificação anti-robô (CAPTCHA)"**: o Auchan travou os pedidos automáticos. O servidor não contorna o bloqueio. Espera algumas horas e tenta de novo; a pesquisa guarda resultados durante 6 horas para fazer poucos pedidos.
- **"falta o Playwright"**: na pasta `servers/auchan` corre `npm install` e depois `npx playwright install chromium`.
- **"o login não terminou"**: confirma o email e a palavra-passe. Para ver o login a acontecer, define `AUCHAN_LOGIN_HEADLESS=false` no `env` do servidor.
- **`cart_quantity_not_confirmed`**: o carrinho não mostrou a quantidade esperada depois da alteração. Corre `get_cart` antes de tentar outra vez; a alteração pode ter entrado.
- **Resultados antigos**: a cache fica em `%USERPROFILE%\.auchan-mcp\cache\`. Apagar essa pasta obriga a pesquisar de novo.

`credentials.env` e `cookies.json` dão acesso à tua conta. Não os partilhes nem os mostres em capturas de ecrã ou pedidos de ajuda.

Quando pedires ajuda, indica o nome da ferramenta e a mensagem de erro.
