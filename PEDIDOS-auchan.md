# Pedidos da sessão do Auchan

## 1. Fixture: disponibilidade do produto 3704143 não está no HTML

`shared/fixtures/auchan-leite.raw.json` diz que o leite Gresso (`3704143`) tem `available: false`, mas o tile desse produto em `shared/fixtures/auchan-leite.html` não tem `.auc-unavailable-text` nem qualquer outra marca que o distinga dos outros dois (comparei a estrutura dos três tiles: é igual). O único `.auc-unavailable-text` da página está fora dos tiles, num modal de carregamento ("Está quase!").

Consequência: nenhum parser honesto consegue tirar `available: false` deste HTML. No servidor, o teste de igualdade exata com o `raw.json` fica marcado como `todo` e há outro teste que compara todos os outros campos (passa).

Proposta (a sessão principal decide):
- ou corrigir o `raw.json` e o `expected.json` para `available: true` no 3704143;
- ou repor no HTML o excerto real do tile indisponível (se a captura original o tinha);
- ou, se a disponibilidade só chega por outro pedido (como a promoção), passar `available` a `null` na pesquisa do Auchan e atualizar o CONTRATO.

Quando estiver decidido, tiro o `todo` de `servers/auchan/test/search.test.js`.
