# Publicar uma seção do Nexo na VPS

Receita única para levar ao ar o que uma seção da Phase 3.1 terminou (Resultados, Instagram, Anúncios, Conteúdo, Plano e Relatórios, Carteira e Integrações, o resto). O João revisa ao vivo depois. Tudo mora em `scripts/vps/publicar.sh`.

## Quando usar

- A seção ficou pronta, os testes dela passaram e o commit está feito (a árvore não pode ter mudança sem commit).
- Uma publicação por onda. O plano que publica leva ao ar também o que o plano do lado fez na onda anterior, porque o script sempre publica o commit atual inteiro.
- Nunca para "testar": tudo o que sobe vai para o site que os médicos usam (nexo, dash e sap, no mesmo serviço).

## O que cada opção faz

**`scripts/vps/publicar.sh --conferir`** só lê. Não escreve nada na VPS e não troca nada. Mostra:

- `imagem no ar:` a imagem que o serviço do Nexo está usando agora;
- `vps/producao:` os 12 primeiros caracteres do último commit do ramo que a VPS publica;
- o código de `/healthz` nos três domínios (precisa ser 200 nos três);
- o tamanho da chave publicável que está no pacote servido (precisa passar de 30; o valor nunca é impresso);
- termina com `conferir: ok` só quando os três domínios respondem, a chave é válida e a imagem no ar é a do último commit de `vps/producao`.

**`scripts/vps/publicar.sh --publicar`** publica. Sem opção nenhuma, o script só mostra a ajuda. Passo a passo:

1. Recusa se a árvore local tem mudança sem commit.
2. Usa o commit atual (HEAD). Vale na branch e na worktree de um executor.
3. Lê a chave publicável do pacote que já está no ar. A regra é "10 ou mais caracteres depois de `sb_publishable_`": o texto solto `sb_publishable_` existe no código da biblioteca do Supabase e sairia vazio, o que derrubou o login por uns 3 minutos em 10/11/2026. Se achar zero ou mais de uma candidata, ou tamanho de 30 ou menos, para sem fazer nada.
4. Junta o commit em `vps/producao` numa pasta temporária (que some no fim) e envia. Se der conflito, para tudo e não publica.
5. Manda o código desse commit para a VPS como um arquivo (não depende de acesso do GitHub na VPS) e, dentro de uma trava de uma publicação por vez, constrói a imagem nova com a etiqueta `doctor-creator-hub:<12 caracteres do commit>`.
6. Antes de trocar, confere que a chave publicável está dentro da imagem nova. Se não estiver, para e nada é trocado.
7. Troca só a imagem do serviço do Nexo e espera o serviço ficar de pé.
8. Confere de novo `/healthz` nos três domínios e a chave no pacote servido. Se qualquer conferência falhar, volta sozinho para a imagem anterior, sai com erro e diz que voltou.
9. Termina com `publicado: <etiqueta>`.

## Como voltar à mão para a imagem anterior

O script grava no começo o nome da imagem anterior (linha `ANTERIOR=...` na saída da publicação). A imagem antiga continua guardada na VPS, porque o script não apaga imagens. Para voltar:

1. Descobrir o nome da imagem anterior: ele aparece na saída da publicação, e `--conferir` mostra a que está no ar.
2. Trocar o serviço de volta para essa imagem, só a imagem do serviço `doctor-creator-hub`, pelo ssh (`ssh hermes-vps`).
3. Rodar `scripts/vps/publicar.sh --conferir` e olhar se o login do site abre.

## O que nunca fazer

Do manual da VPS (`~/minha-vps-hermes.md`):

- Esta máquina também roda a produção da Doctor Creator (automações, WhatsApp, painel de hospedagem, bancos). Não é só do agente.
- Nunca reinstalar o sistema: apaga tudo isso.
- Nunca reiniciar a máquina nem o Docker: derruba a produção por cerca de 75 segundos. Só com aviso e fora do horário, e nunca por causa de uma publicação.
- Não mexer nas automações, no WhatsApp nem no painel de hospedagem, e não mexer nos bancos.
- Não apagar imagens antigas: elas são a volta rápida se algo der errado.
- Nunca escrever, colar ou imprimir chave ou senha. A chave publicável é pública, mas o script mostra só o tamanho dela, por hábito.
- Duas publicações ao mesmo tempo, não. A trava na VPS impede, e quem vê o aviso "outra publicação está em andamento" espera.

## O que foi conferido nesta fase (03.1-01) e o que fica para a primeira publicação

Medido em 10/11/2026, só olhando o site público (sem entrar na VPS):

- `/healthz` deu 200 em nexo, dash e sap.
- O pacote principal servido por nexo tem uma única chave publicável candidata, com 46 caracteres (valor não registrado aqui).

Não conferido: a leitura de dentro da VPS (imagem no ar, de onde o código chega em `/opt/doctor-creator-hub`, argumentos de construção da imagem). O acesso pelo ssh foi negado pelo sistema de permissões na hora da execução deste plano, e a regra é não dar a volta nele. Por isso o script foi escrito para não depender dessas descobertas:

- o código vai como arquivo do commit, então não importa como a VPS buscava o código antes;
- `docker history` da imagem no ar fornece `VITE_SUPABASE_URL` e `VITE_LINK_BASE_URL`; se a imagem não guardar esses argumentos, o script para antes de construir e pede `NEXO_VITE_SUPABASE_URL` e `NEXO_VITE_LINK_BASE_URL` no ambiente (os dois são endereços públicos);
- a imagem no ar pode ter outra etiqueta; o `--conferir` compara o final da etiqueta com o começo do commit (de 7 a 12 caracteres).

Antes da primeira publicação real (03.1-03), rodar `scripts/vps/publicar.sh --conferir` com o ssh liberado e conferir essas três coisas.
