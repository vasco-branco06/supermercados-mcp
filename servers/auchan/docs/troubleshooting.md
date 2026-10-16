# Resolução de problemas

- **"falta o ficheiro ... com as linhas AUCHAN_EMAIL=... e AUCHAN_PASSWORD=..."**: ainda não há credenciais. Cria `%USERPROFILE%\.auchan-mcp\credentials.env` (ou preenche o ficheiro do plugin em `%USERPROFILE%\.supermercados-mcp\credentials.env`) e reinicia o cliente MCP. Confirma o nome do ficheiro: o Windows às vezes acrescenta `.txt`.
- **"o login não terminou; confirma o email e a palavra-passe"**: o Auchan não aceitou o login. Confirma o email e a palavra-passe no ficheiro (sem aspas e sem espaços à volta do `=`) e experimenta entrar uma vez no auchan.pt pelo browser. Para ver o login a acontecer, põe `AUCHAN_LOGIN_HEADLESS=false` no `env` do servidor.
- **"o formulário de login do Auchan não é o esperado"**: o Auchan mudou a página de login e o servidor deixou de encontrar os campos. É preciso atualizar o servidor; não devolve nada inventado.
- **"o site pediu uma verificação anti-robô (CAPTCHA)"**: o Auchan travou o login automático. O servidor não contorna o bloqueio. Entra uma vez no auchan.pt pelo browser e tenta mais tarde.
- **"o Auchan ainda não tem a tua entrega escolhida"**: o carrinho só aceita produtos depois de escolheres, no auchan.pt, entrega em casa ou levantamento com o código postal. Faz isso uma vez, com a mesma conta, e tenta de novo.
- **"não encontrei o Microsoft Edge nem o Google Chrome"**: o login usa um deles, em segundo plano. Instala um deles ou corre `npx playwright install chromium`.
- **A sessão deixou de funcionar**: o servidor entra outra vez sozinho. Se continuar a falhar, usa `logout` e depois `login`. O `logout` apaga `cookies.json` mas deixa o ficheiro de credenciais.
- **"o site pode ter mudado"**: o Auchan mudou a página de pesquisa e o servidor deixou de encontrar os preços. Não devolve preços inventados; é preciso atualizar o parser.
- **"o site bloqueou o pedido"**: o Auchan travou os pedidos automáticos. O servidor não contorna o bloqueio. Espera algumas horas e tenta de novo; a pesquisa guarda resultados durante 6 horas para fazer poucos pedidos.
- **"falta o Playwright"**: volta a instalar o pacote (`npm install auchan-mcp`).
- **`cart_quantity_not_confirmed`**: o carrinho não mostrou a quantidade esperada depois da alteração. Corre `get_cart` antes de tentar outra vez; a alteração pode ter entrado.
- **Resultados antigos**: a cache fica em `%USERPROFILE%\.auchan-mcp\cache\`. Apagar essa pasta obriga a pesquisar de novo.

O ficheiro de credenciais e `cookies.json` dão acesso à tua conta no Auchan. Não os partilhes nem os mostres em capturas de ecrã ou pedidos de ajuda.

Quando pedires ajuda, indica o nome da ferramenta e a mensagem de erro.
