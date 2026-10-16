# Regras das sessões de trabalho

Estas regras valem para todas as sessões que trabalham numa worktree deste repositório. A sessão principal (a que vive no ramo `main`) é a única que muda o contrato e faz merges.

## Mapa de worktrees

| Pasta | Ramo | Tarefa |
|---|---|---|
| `workspaces/supermercados-mcp/dab` | `Vascobranco2509/dab` | servidor do Pingo Doce |
| `workspaces/supermercados-mcp/feat-auchan` | `Vascobranco2509/feat-auchan` | servidor do Auchan |
| `workspaces/supermercados-mcp/feat-skills` | `Vascobranco2509/feat-skills` | `.mcp.json`, três skills e o histórico em SQLite |

Os nomes dos ramos são os que o Orca criou. Não se renomeiam.

## Regras

1. **Uma tarefa por sessão.** Cada sessão só mexe nas pastas da sua tarefa. Se vir um problema noutra parte, regista-o no ficheiro de pedidos da sua worktree (`PEDIDOS-pingo-doce.md`, `PEDIDOS-auchan.md` ou `PEDIDOS-skills.md`; ficheiros separados para não chocarem no merge) e continua.
2. **Contrato fechado.** Nenhuma worktree altera `shared/`, `REGRAS.md` nem `package.json` e `package-lock.json` da raiz. O `.mcp.json` só o altera a sessão das skills. Se uma sessão precisar de mudar o contrato, escreve no seu ficheiro de pedidos o que precisa e porquê, e pára essa parte. A sessão principal lê os pedidos quando o Vasco pedir, decide, muda o contrato no `main` e avisa as outras sessões, que fazem `git merge main`.
3. **Nada do MCP do David.** Ninguém altera o código do `continente-mcp` (https://github.com/davidmarqu3s/continente-mcp). Bugs ou faltas viram texto de um issue no ficheiro de pedidos.
4. **Commits pequenos.** Um commit por passo que funcione, com mensagem clara em português, sempre no ramo da própria worktree. Ninguém faz push nem merge.
5. **Testes antes de acabar.** A sessão só dá a tarefa por terminada quando os testes de contrato passam (`npm test` na raiz da worktree e na pasta do servidor). No fim do `TAREFA.md` escreve um resumo do que fez, do que ficou por fazer e de como testar.
6. **Segurança.** Sem contornar CAPTCHA nem proteção anti-bot, sem segredos no git e sem nenhuma ferramenta para encomendar ou pagar. Máximo de 1 pedido por segundo a cada site, user-agent honesto, cache dos resultados.
7. **O `TAREFA.md` não vai para o git.** Cada worktree tem o seu e eles chocariam no merge. Fica na pasta, sem `git add`. Os ficheiros de pedidos esses vão para o git (cada um tem o seu nome).
8. **Língua.** Código, comentários e nomes em inglês. README, skills, mensagens de commit e tudo o que o utilizador final lê em português de Portugal, sem emojis.
9. **Nunca inventar.** Se o site mudar e a leitura falhar, a ferramenta devolve um erro claro. Nunca devolve um preço que não leu.

## Como saber que está tudo bem

- `npm test` na raiz passa (testes de contrato do `shared/`).
- Os testes da sua pasta passam sem internet.
- `git status` não mostra segredos (`.env`, cookies, `*.sqlite`).
