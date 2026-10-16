---
name: credenciais
description: Abre o ficheiro com o email e a palavra-passe dos supermercados (Auchan e Continente) para a pessoa os preencher ou mudar. Usar quando a pessoa quer configurar o carrinho, mudar de conta, ou quando uma ferramenta do carrinho diz que falta o ficheiro de credenciais ou que o login falhou.
---

# Credenciais dos supermercados

O carrinho do Auchan e do Continente precisa do email e da palavra-passe da pessoa, num ficheiro que fica só no computador dela. O plugin abre-o sozinho na primeira vez; esta skill volta a abri-lo.

1. Corre `node "<pasta do plugin>/scripts/credenciais.js" --forcar`. A pasta do plugin é a que contém a pasta `skills` onde esta skill está (dois níveis acima deste ficheiro). O comando abre o Bloco de Notas (ou o editor do sistema) com o ficheiro `~/.supermercados-mcp/credentials.env` e cria o modelo se ainda não existir.
2. Diz à pessoa, numa frase, o que fazer: preencher `AUCHAN_EMAIL` e `AUCHAN_PASSWORD` (e `CONTINENTE_EMAIL` e `CONTINENTE_PASSWORD`, se usa o Continente), sem aspas e sem espaços à volta do `=`, guardar com Ctrl+S e fechar.
3. O Pingo Doce não precisa de nada neste ficheiro: entra com o número de telemóvel e um código SMS, numa janela que se abre quando o carrinho é pedido. Diz isto se a pessoa perguntar pelo Pingo Doce.
4. Quando a pessoa disser que acabou, chama a ferramenta `login` do servidor do supermercado (por exemplo o `auchan`) para confirmar que o login funciona, e diz o resultado.

Nunca leias nem repitas o conteúdo do ficheiro: contém palavras-passe. Se o login falhar, diz só a mensagem de erro da ferramenta.
