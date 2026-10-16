# supermercados-mcp

Plugin do Claude Code que planeia as refeições da semana e compara o preço do cesto no Continente, no Pingo Doce e no Auchan.

![Demonstração: o Claude cria o plano da semana e compara o cesto nos três supermercados](docs/demo.gif)

[Ver a demonstração em MP4](docs/demo.mp4) (48 segundos)

## O que faz

Dizes ao Claude o que tens na cozinha, as restrições alimentares e o que gostas e não gostas. O plugin:

1. cria o teu perfil, com uma pergunta de cada vez (skill `perfil`);
2. cria as receitas da semana e junta tudo numa lista de compras com as quantidades somadas (skill `receitas-semana`);
3. procura cada item nos três supermercados, compara os preços por kg ou litro e diz onde o cesto fica mais barato (skill `cesto-mais-barato`);
4. se quiseres, põe os produtos no carrinho do site.

O plugin nunca encomenda nem paga. A encomenda e o pagamento ficam sempre do teu lado, no site do supermercado.

Exemplo de pedido: "Somos dois homens adultos. Queremos 3 refeições por dia com vaca, frango e peixe, altas em proteína, baixas em gordura, com hidratos médios, e gastar no máximo 350 € por mês." Na demonstração acima, o cesto semanal ficou em 76,94 € no Auchan, 81,34 € no Pingo Doce e 81,81 € no Continente. Os preços mudam todos os dias.

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
5. Começa por escrever: "Faz o meu perfil".

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

**Claude Desktop e outros clientes MCP.** Acrescenta este bloco ao ficheiro de configuração do cliente (no Claude Desktop, em Definições, Programador, Editar configuração, ou em `%APPDATA%Claudeclaude_desktop_config.json`) e reinicia-o:

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

## Carrinho (opcional)

Pingo Doce e Auchan: quando pedes ao Claude para pôr produtos no carrinho, abre-se uma janela do browser (o Edge ou o Chrome que já tens) na página de login do supermercado. Entras tu, a janela fecha e ficas ligado, como nos outros conectores do Claude. No Auchan escolhes também, na mesma janela, se queres entrega em casa ou levantamento e o código postal, porque o site não aceita produtos no carrinho sem isso. O Auchan só deixa encomendar a partir de 20 €. Não crias nenhum ficheiro e a palavra-passe nunca passa pelo plugin: só fica a sessão, no teu computador. Se aparecer um CAPTCHA, resolves tu na janela. A sessão fica guardada no teu computador e, enquanto o Claude Code estiver aberto, o plugin faz um pedido leve de 10 em 10 minutos para o supermercado não a fechar por inatividade. Dura enquanto o supermercado a mantiver; quando expirar, a janela abre-se outra vez, porque o Continente, o Pingo Doce e o Auchan não oferecem outra forma de entrar. Para desligar, pede ao Claude para terminar a sessão (ferramenta `logout`).

Continente: o servidor do David Marques ainda não tem login por janela, por isso o carrinho dele pede um ficheiro `%USERPROFILE%\.continente\credentials.env` com `CONTINENTE_EMAIL=...` e `CONTINENTE_PASSWORD=...`. Sem esse ficheiro, o Continente só pesquisa.

Não existe nenhuma ferramenta para finalizar a encomenda ou pagar.

## Privacidade

Nada sai do teu computador, exceto os pedidos aos sites dos supermercados e a conversa com o Claude.

| O quê | Onde fica |
|---|---|
| O teu perfil | `%USERPROFILE%\.supermercados-mcp\perfil.md` |
| Listas confirmadas, produtos escolhidos e preços vistos | `%USERPROFILE%\.supermercados-mcp\historico.sqlite` |
| Resultados de pesquisa em cache (6 horas) | `%USERPROFILE%\.pingodoce-mcp\cache` e `%USERPROFILE%\.auchan-mcp\cache` |
| Sessão do carrinho do Pingo Doce e do Auchan (cookies) | `%USERPROFILE%\.pingodoce-mcp\cookies.json` e `%USERPROFILE%\.auchan-mcp\cookies.json` |
| Credenciais do Continente, só se as criares | `%USERPROFILE%\.continente\credentials.env` |

Para apagar tudo, no PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.supermercados-mcp", "$env:USERPROFILE\.pingodoce-mcp", "$env:USERPROFILE\.auchan-mcp", "$env:USERPROFILE\.continente"
```

O plugin nunca vê as tuas palavras-passe do Pingo Doce e do Auchan: fazes o login na janela do próprio site. As cookies nunca aparecem nas respostas das ferramentas nem nos registos.

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
