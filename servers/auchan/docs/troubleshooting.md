# Resolução de problemas

- **A janela de login não abre**: o servidor usa o Microsoft Edge ou o Google Chrome que já tens. Se não tiver nenhum, instala um deles ou corre `npx playwright install chromium`. Depois pede de novo o carrinho ou usa a ferramenta `login`.
- **"a janela de login foi fechada antes de o login terminar"**: fechaste a janela antes de entrares. Pede o carrinho outra vez e faz o login na janela nova.
- **"o login não terminou em 5 minutos"**: a janela ficou aberta sem login. Tenta de novo.
- **A sessão deixou de funcionar**: usa `logout` e depois `login`. O `logout` apaga `cookies.json`.
- **"o site pode ter mudado"**: o Auchan mudou a página de pesquisa e o servidor deixou de encontrar os preços. Não devolve preços inventados; é preciso atualizar o parser.
- **"o site bloqueou o pedido" ou "verificação anti-robô (CAPTCHA)"**: o Auchan travou os pedidos automáticos. O servidor não contorna o bloqueio. Espera algumas horas e tenta de novo; a pesquisa guarda resultados durante 6 horas para fazer poucos pedidos. Se o CAPTCHA aparecer na janela de login, resolve-o tu.
- **"falta o Playwright"**: volta a instalar o pacote (`npm install auchan-mcp`).
- **`cart_quantity_not_confirmed`**: o carrinho não mostrou a quantidade esperada depois da alteração. Corre `get_cart` antes de tentar outra vez; a alteração pode ter entrado.
- **Resultados antigos**: a cache fica em `%USERPROFILE%\.auchan-mcp\cache\`. Apagar essa pasta obriga a pesquisar de novo.

`cookies.json` dá acesso à tua conta no Auchan. Não o partilhes nem o mostres em capturas de ecrã ou pedidos de ajuda.

Quando pedires ajuda, indica o nome da ferramenta e a mensagem de erro.
