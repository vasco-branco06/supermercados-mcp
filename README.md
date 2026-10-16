# supermercados-mcp

Plugin do Claude Code que planeia as refeições da semana e compara o preço do cesto no Continente, no Pingo Doce e no Auchan.

## O que faz

Dizes ao Claude o que tens na cozinha, as restrições alimentares e o que gostas e não gostas. O plugin:

1. cria o teu perfil, com uma pergunta de cada vez (skill `perfil`);
2. cria as receitas da semana e junta tudo numa lista de compras com as quantidades somadas (skill `receitas-semana`);
3. procura cada item nos três supermercados, compara os preços por kg ou litro e diz onde o cesto fica mais barato (skill `cesto-mais-barato`);
4. se quiseres, põe os produtos no carrinho do site.

O plugin nunca encomenda nem paga. A encomenda e o pagamento ficam sempre do teu lado, no site do supermercado.

Exemplo de pedido: "Somos dois homens adultos. Queremos 3 refeições por dia com vaca, frango e peixe, altas em proteína, baixas em gordura, com hidratos médios, e gastar no máximo 350 € por mês."

## Instalação no Windows 11

Precisas de:
- Claude Code instalado;
- Node.js 22.13 ou superior. Para ver a versão, abre o PowerShell e escreve `node -v`. Se for mais antiga, instala a versão LTS em https://nodejs.org.

Passos:

1. Abre o PowerShell e instala o navegador que o servidor do Continente usa. Só se faz uma vez (descarrega cerca de 110 MB):

   ```powershell
   npx -y -p continente-mcp playwright install chromium
   ```

2. No Claude Code, adiciona o plugin:

   ```
   /plugin marketplace add vasco-branco06/supermercados-mcp
   /plugin install supermercados-mcp@supermercados-mcp
   ```

3. Fecha e volta a abrir o Claude Code.
4. Escreve `/mcp`. Deves ver três servidores: `continente`, `pingo-doce` e `auchan`. A primeira vez que cada um arranca demora um pouco, porque o `npx` descarrega o pacote.
5. Na primeira vez abre-se o Bloco de Notas com o ficheiro de credenciais. Preenche o email e a palavra-passe do Auchan e do Continente se quiseres usar o carrinho (podes deixar em branco e voltar mais tarde), guarda com Ctrl+S e fecha.
6. Começa por escrever: "Faz o meu perfil".

A pesquisa de produtos funciona sem conta em nenhum dos três supermercados. Não precisas de instalar mais nada para o Pingo Doce e o Auchan.

## Instalar só os servidores, sem o plugin

Se não queres o plugin, podes ligar os três servidores MCP diretamente ao teu cliente. Ficas sem as skills (`perfil`, `receitas-semana`, `cesto-mais-barato`) e sem o histórico, mas podes pedir ao Claude coisas como "procura leite meio gordo nos três supermercados e diz-me onde é mais barato". O login por janela funciona da mesma forma.

**Claude Code.** No PowerShell, uma vez (o `--scope user` serve para todas as pastas):

```powershell
claude mcp add --scope user pingo-doce -- cmd /c npx -y pingo-doce-mcp
claude mcp add --scope user auchan -- cmd /c npx -y auchan-mcp
claude mcp add --scope user continente -- cmd /c npx -y continente-mcp
npx -y -p continente-mcp playwright install chromium
```

O último comando descarrega o browser que o servidor do Continente usa (cerca de 110 MB) e só é preciso uma vez. Depois escreve `claude mcp list`: os três devem aparecer como "Connected". No macOS ou Linux, tira o `cmd /c`.

**Claude Desktop e outros clientes MCP.** Acrescenta este bloco ao ficheiro de configuração do cliente (no Claude Desktop, em Definições, Programador, Editar configuração, ou em `%APPDATA%\Claude\claude_desktop_config.json`) e reinicia-o:

```json
{
  "mcpServers": {
    "continente": { "command": "npx", "args": ["-y", "continente-mcp"] },
    "pingo-doce": { "command": "npx", "args": ["-y", "pingo-doce-mcp"] },
    "auchan": { "command": "npx", "args": ["-y", "auchan-mcp"] }
  }
}
```

Precisas do Node.js 20.18.1 ou mais recente em qualquer dos casos. Testámos os comandos no Claude Code em Windows; o bloco de configuração segue o formato padrão dos clientes MCP.

Sem o plugin, o ficheiro de credenciais não se abre sozinho. Para o carrinho do Auchan, cria `%USERPROFILE%\.auchan-mcp\credentials.env` com as linhas `AUCHAN_EMAIL=...` e `AUCHAN_PASSWORD=...`; para o do Continente, `%USERPROFILE%\.continente\credentials.env` com `CONTINENTE_EMAIL=...` e `CONTINENTE_PASSWORD=...`. O Pingo Doce abre uma janela de login, sem ficheiro.

## Carrinho (opcional)

A pesquisa e a comparação de preços funcionam sem conta. Para o Claude pôr produtos no carrinho, o plugin entra na tua conta de cada supermercado:

- **Auchan e Continente:** na primeira vez que o plugin arranca, abre-se o Bloco de Notas com o ficheiro `%USERPROFILE%\.supermercados-mcp\credentials.env` já com as linhas `AUCHAN_EMAIL`, `AUCHAN_PASSWORD`, `CONTINENTE_EMAIL` e `CONTINENTE_PASSWORD`. Preenche as dos supermercados que usas, guarda com Ctrl+S e fecha. O plugin entra sozinho, em segundo plano e sem janela, e volta a entrar sempre que o supermercado terminar a sessão, por isso não tens de fazer nada outra vez. Para abrir o ficheiro de novo, pede ao Claude "abre o ficheiro de credenciais" (skill `credenciais`).
- **Pingo Doce:** entra com o número de telemóvel e um código que chega por SMS, por isso não há palavra-passe para guardar. Quando pedires o carrinho, abre-se uma janela do browser (o Edge ou o Chrome que já tens) e entras tu. A sessão fica guardada e dura enquanto o Pingo Doce a mantiver; quando expirar, a janela abre-se outra vez.

No Auchan, o carrinho só aceita produtos depois de escolheres uma vez, no site, entrega em casa ou levantamento (com o código postal); essa escolha fica guardada na tua conta. O Auchan só deixa encomendar a partir de 20 €. Enquanto o Claude Code está aberto, o plugin faz um pedido leve de 10 em 10 minutos para o supermercado não fechar a sessão por inatividade. Se aparecer um CAPTCHA no login automático, o plugin pára e diz-te; não o contorna. Para desligar uma conta, pede ao Claude para terminar a sessão (ferramenta `logout`).

Não existe nenhuma ferramenta para finalizar a encomenda ou pagar.

### Duas versões

Este ramo (`main`) usa o ficheiro de credenciais, que dura mais porque o plugin renova a sessão sozinho. O ramo [`login-por-janela`](https://github.com/vasco-branco06/supermercados-mcp/tree/login-por-janela) usa só uma janela de login, sem guardar a palavra-passe em lado nenhum; em contrapartida, tens de entrar de novo quando o supermercado terminar a sessão.

## Privacidade

Nada sai do teu computador, exceto os pedidos aos sites dos supermercados e a conversa com o Claude.

| O quê | Onde fica |
|---|---|
| O teu perfil | `%USERPROFILE%\.supermercados-mcp\perfil.md` |
| Listas confirmadas, produtos escolhidos e preços vistos | `%USERPROFILE%\.supermercados-mcp\historico.sqlite` |
| Email e palavra-passe do Auchan e do Continente, só os que preencheres | `%USERPROFILE%\.supermercados-mcp\credentials.env` |
| Resultados de pesquisa em cache (6 horas) | `%USERPROFILE%\.pingodoce-mcp\cache` e `%USERPROFILE%\.auchan-mcp\cache` |
| Sessão do carrinho do Pingo Doce e do Auchan (cookies) | `%USERPROFILE%\.pingodoce-mcp\cookies.json` e `%USERPROFILE%\.auchan-mcp\cookies.json` |

As palavras-passe ficam em texto simples nesse ficheiro, dentro da tua pasta de utilizador, como já acontecia no servidor do Continente. Não o partilhes, não o ponhas num backup público e não o mostres em capturas de ecrã. O ficheiro nunca é enviado para lado nenhum: só é lido para preencher o formulário de login do supermercado. O Pingo Doce não guarda palavra-passe nenhuma.

Para apagar tudo, no PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.supermercados-mcp", "$env:USERPROFILE\.pingodoce-mcp", "$env:USERPROFILE\.auchan-mcp", "$env:USERPROFILE\.continente"
```

As palavras-passe e as cookies nunca aparecem nas respostas das ferramentas nem nos registos.

## Limites e avisos

- Este projeto não tem ligação ao Continente, ao Pingo Doce nem ao Auchan. Os nomes pertencem às respetivas empresas.
- Pode deixar de funcionar a qualquer momento se os sites mudarem. Quando a leitura falha, a ferramenta diz o que falhou e nunca inventa um preço.
- Os ficheiros `robots.txt` dos três sites pedem que as páginas de pesquisa não sejam lidas por programas automáticos. O projeto faz poucos pedidos (no máximo 1 por segundo a cada site), identifica-se com um user-agent próprio e guarda os resultados em cache durante 6 horas. Usa-o por tua conta e risco, para uso pessoal, e respeita os termos dos sites.
- A pesquisa não mostra a disponibilidade dos produtos. As promoções só aparecem no Pingo Doce. O Continente não indica a marca nem o tamanho.
- Confirma sempre o produto e o preço no site antes de comprar. As equivalências entre marcas e tamanhos são sugestões.

## Créditos

O servidor do Continente é o [continente-mcp](https://github.com/davidmarqu3s/continente-mcp) de David Marques (licença MIT), usado tal como ele o publica e sem alterações. Os servidores do Pingo Doce e do Auchan foram escritos de raiz neste repositório, com o dele como modelo para a estrutura de pastas, os nomes das ferramentas e a forma de guardar a sessão.

## Para quem quer contribuir

- `shared/` tem o schema dos produtos (zod) e o contrato comum dos servidores: [shared/CONTRATO.md](shared/CONTRATO.md).
- `servers/pingo-doce` e `servers/auchan` são os dois servidores. Cada um tem os seus testes (`npm test` dentro da pasta), que correm sem internet sobre respostas guardadas.
- `npm test` na raiz corre os testes do contrato. `npm run build:historico` volta a gerar `scripts/dist/historico.js`.
- Notas do desenvolvimento em `docs/desenvolvimento`.

## Licença

[MIT](LICENSE)
