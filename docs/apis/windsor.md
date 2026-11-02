# Windsor.ai

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e código no commit `89ae33c` (linhas conferidas nesse commit).
> As linhas citadas mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.
> **Doc oficial lida em 01/11/2026 (segunda leitura):** <https://windsor.ai/api-documentation/>,
> <https://windsor.ai/documentation/understanding-cache-data-store-and-query-cache/> e <https://windsor.ai/llms.txt>. `connectors.windsor.ai`
> e `onboard.windsor.ai` continuam recusados pelo proxy (só a API; sem chave não haveria o que ler). Os trechos entre aspas abaixo são da
> doc. O que segue "não verificado" diz o motivo.

**Resumo.** Intermediário que lê Meta Ads e Instagram por nós. Hoje é fonte de anúncios das contas **sem token próprio** e reserva do
Instagram. Os números batem com a fonte. Status por conta (`anuncios-status.ts`) e `api_key` fora dos logs já entraram. Os riscos: **conta
invisível volta como "lista vazia" sem erro** (a doc mostra a saída: `select_accounts`) e cache de 3 dias (agora verificado na doc). O
corpo de erro com HTTP 200 passou a virar erro (`windsor-resposta.ts`).

## 1. O que usamos

- **Versão:** a API REST não tem número de versão. A versão da Graph usada por trás não aparece.
- **Base:** `https://connectors.windsor.ai/facebook` e `https://connectors.windsor.ai/instagram`, com `api_key, date_from, date_to,
  fields, filter=[["account_id","eq",id]], _max_rows=100000` (`meta-ads-sync.ts:115-135`, `instagram-sync.ts:81-101`).
- **Doc oficial:** <https://windsor.ai/api-documentation/>,
  <https://windsor.ai/documentation/understanding-cache-data-store-and-query-cache/>, **lidas em 01/11/2026**. Campos conferidos com
  `get_fields` da Windsor MCP em 01/11/2026.
- **Verificado na doc:** obrigatórios só `api_key` e `fields`; opcionais `date_preset` (`last_7d`, `last_30d`, `last_90d`, `last_year`, e
  dinâmicos `last_Xd`, `last_XdT` "including today", `this_month`...), `date_from`/`date_to` ("If date_to is not set, the query defaults
  to today"), `_max_rows`, `filter` (JSON `[campo, operador, valor]`, "URL-encode the filter parameter"), `select_accounts`, `_renderer`
  (JSON é o padrão), `refresh_since`/`refresh_interval`. Autenticação: "the api_key query parameter only. Header-based authentication ...
  is not supported ... and will return `{"error":"Not authorized"}`". O Nexo usa `date_from`/`date_to` + `filter` e não usa `date_preset`.

| Conector | Para quê | Campos | Código |
|---|---|---|---|
| `facebook` | anúncios das contas sem token | `date, campaign_id, campaign, objective, spend, impressions, reach, clicks, unique_clicks, frequency, actions_link_click, actions_landing_page_view, actions_lead, actions_onsite_conversion_messaging_conversation_started_7d, effective_instagram_media_id, effective_instagram_media__permalink, effective_instagram_media__thumbnail_url, adset_destination_type` | `meta-ads-sync.ts:24-47` |
| `instagram` (posts) | reserva | `media_id, media_type, media_product_type, media_permalink, media_thumbnail_url, media_url, media_caption, timestamp, media_reach, media_saved, media_like_count, media_comments_count, media_shares, media_engagement, media_views, media_reel_*, media_profile_visits, media_follows` | `instagram-sync.ts:149-178` |
| `instagram` (dia) | reserva dos números diários | `date, followers_count, follower_count_1d, follows_and_unfollows, reach_1d, likes, comments, saves, shares, total_interactions, profile_links_taps` | `instagram-sync.ts:302-315` |

## 2. Significado de cada número

- **`spend`** na moeda e no fuso da conta; **`reach`** = pessoas únicas, mas como a Windsor devolve uma linha por anúncio (por causa dos
  campos de mídia), o banco soma o alcance dos anúncios da campanha no dia: aproximação (rótulo honesto "alcanceDiarioSomado").
  Contas da Windsor **não têm frequência real de 7 dias**.
- **Conversas:** `actions_onsite_conversion_messaging_conversation_started_7d` = conversa iniciada depois de 7 dias sem conversa, atribuição
  padrão `7d_click + 1d_view`.
- **`actions_link_click`** inclui cliques que levam ao perfil; na Graph o Nexo usa `inline_link_clicks` (não comparados).
- **Instagram:** `follower_count_1d` só nos últimos 30 dias, sem hoje, e só com 100 seguidores ou mais; `followers_count` só para hoje;
  `profile_links_taps` = botões de contato, não o link da bio. **Fuso do dia no Instagram: não verificado** (a doc da API REST não fala de fuso; depende do conector).
- **Cache (verificado em 01/11/2026, seção "Public (sub)hourly refreshes via API" da doc da API REST):** `refresh_since` "Default: 3d
  (currently, it supports only the last 3 days) ... Data older than this period is considered stable and will be served from the cache if
  available"; `refresh_interval` "Default: 6h ... at most once every refresh_interval". Ou seja: **vale para a API REST**. Dia com mais de
  3 dias vem do cache e o de até 3 dias é relido no máximo a cada 6 h (1 h nos planos Standard/Plus, 15 min no Professional/Enterprise,
  se o Nexo passar `refresh_interval`). A Meta continua atribuindo conversas até 7 dias depois do clique: o dia 4–7 pode ficar menor que
  na Meta. O cache de consulta é "for that exact Connector URL": mudar campos, filtro ou datas cria URL nova e passa por fora dele.

## 3. Limites

- **Taxa (verificado em 01/11/2026):** "600 requests per minute, 10,000 requests per day. If you exceed these limits, you'll receive a 429
  status code. The response will include headers indicating your remaining quota and when it will reset" (os nomes dos cabeçalhos não
  estão na doc). 429 também ao limpar o cache mais de uma vez a cada 2 h (página do cache). O Nexo faz poucas dezenas de pedidos, em
  sequência, prazo de 30 s cada: muito abaixo do teto. **Sem tratamento de 429** (aceitável pelo volume; registrado como erro da conta).
- **Paginação:** não há. Tudo vem numa resposta limitada por `_max_rows` (a doc só dá `100` como exemplo; o corte em 100 sem o parâmetro
  foi visto no Nexo, não está escrito). O Nexo manda 100000 e, desde 02/11/2026, trata resposta com `_max_rows` linhas como corte (erro) e espera e tenta uma vez no 429 (`windsor-resposta.ts`, `buscarWindsor`).
- **Tempo:** nos anúncios, em timeout refaz em janelas de 2 dias (`meta-ads-sync.ts:143-164`).

## 4. Token

- **Tipo:** uma única `WINDSOR_API_KEY` (variável do servidor), enviada **na URL** (`api_key`). Dá acesso a **todas** as contas da equipe na
  Windsor, inclusive de quem não é cliente; o código sempre filtra por `account_id`.
- **Por trás:** o login do Facebook dentro da Windsor pode expirar (troca de senha, revogação). O Nexo **não sabe quando**.
- **Cuidado:** a chave vai na URL; o filtro de segredos de `sync-status.ts:14-25` esconde `access_token`, `api_key`, `key`, `token` e `Bearer`.
- **Quem renova:** dono da conta Windsor (chave) e quem conectou o Facebook na Windsor (login).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Sem `_max_rows` a Windsor corta em 100 linhas | Sim | `meta-ads-sync.ts:132`; `instagram-sync.ts:96` |
| Conta que não está na Windsor volta 200 com lista vazia, sem erro | Parcial (status por conta: conta que tinha gasto e ficou sem dado vira aviso; conta nova e vazia segue "0 linhas"). **A doc oferece saída:** com `select_accounts`, "If none of the requested accounts is connected, the request fails with an error that lists your connected accounts"; com `filter` (o que o Nexo usa) a lista só vem vazia. Não trocado nesta mudança (muda a chave do cache e o formato do id do Instagram não foi conferido); proposta abaixo | `meta-ads-sync.ts:131`; `instagram-sync.ts:95`; `anuncios-status.ts` |
| Cache de 3 dias × atribuição da Meta até 7 dias | Parcial (relê 30 dias, mas o antigo vem do cache) | `meta-ads-sync.ts:11-12` |
| Linha por anúncio: somar alcance conta duas vezes | Parcial | `meta-ads-sync.ts:240-246` |
| `follower_count_1d` com mais de 30 dias recusa o pedido inteiro (400) | Sim (pede o trecho antigo sem ele) | `instagram-sync.ts:316-330` |
| `followers_count` só para hoje | Sim (não grava nulo por cima) | `instagram-sync.ts:406-417` |
| Várias linhas por data (tabelas diferentes) | Sim (junta por data) | `instagram-sync.ts:345-367` |
| Período de um dia só (`date_from = date_to`) não pede nada no Instagram | **Não** | `instagram-sync.ts:120-128` |
| Pedaços de 30 dias se sobrepõem no dia da emenda | Corrigido em 02/11/2026: janelas que não se tocam (`janelasWindsor`) e repetidos fora antes do upsert (`semRepetidos`); teste em `scripts/test-definicoes-restantes.ts`. A sobreposição derrubava o lote de posts (Dra. Samira: 41 de 309) | `windsor-resposta.ts`, `instagram-sync.ts` |
| Filtro de data dos posts em UTC | Contornado em 02/11/2026: os posts pedem um dia a mais em cada ponta | `instagram-sync.ts` (syncPosts) |
| Erro parcial gravado como sucesso; falha total em conta antiga não é gravada | **Sim** (leitura por conta) | `meta-ads-sync.ts:359-368`; `api/sync/meta-ads.ts:165` |
| HTTP 200 com corpo de erro vira lista vazia | **Sim** (`linhasWindsor`: `error` em texto ou `{code, message}`, `data` que não é lista ou corpo que não é JSON viram erro). A doc diz que o erro vem "with an appropriate HTTP status code", mas mostra também a forma curta `{"error":"Not authorized"}` sem dizer o status: por isso o corpo é conferido mesmo com 200 | `windsor-resposta.ts`; `meta-ads-sync.ts:139`; `instagram-sync.ts:103` |
| Chave na URL e fora do filtro de segredos | Parcial (ainda na URL, **e a doc confirma que não há outro jeito**: "api_key query parameter only"; o filtro já esconde `api_key`) | `meta-ads-sync.ts:127`; `instagram-sync.ts:91`; `sync-status.ts:14-25` |
| Atribuição padrão da Windsor pode diferir do Gerenciador | Não verificado (a doc da API REST não fala de janela de atribuição; as duas vias são coerentes entre si) | `meta-ads-sync.ts:121-129` |

## 6. Mudanças anunciadas

Nenhuma data de desligamento na doc lida em 01/11/2026.

**Proposta (não feita):** trocar `filter=[["account_id","eq",id]]` por `select_accounts=id` (mantendo o filtro) nos anúncios. A doc diz
que para Facebook Ads "the account ID may be passed with or without the act_ prefix" e que a conta não conectada vira **erro** em vez de
lista vazia. Antes, rodar o contrato ao vivo com uma conta de anúncio e uma do Instagram para confirmar o formato do id. O plano do Nexo é **sair da Windsor** nos anúncios quando houver token de cada conta
(`api/sync/meta-ads.ts:21-31`); no Instagram, as 17 contas já estão na Graph.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| antes de 10/2026 | Sem `_max_rows`, Reels de um cliente sumiram (corte em 100) | `_max_rows=100000` |
| antes de 10/2026 | Windsor travava em períodos longos do Instagram | Instagram migrado para a Graph |
| antes de 10/2026 | `follower_count_1d` com mais de 30 dias derrubava alcance e interações | Pedido dividido |
| 08–09/2026 | Dias com `new_followers=0` e `unfollowers` vazio gravados pela reserva | Sem a coluna quando não há medida (`instagram-sync.ts:397-400`) e releitura pela Graph |
| 01/11/2026 | Uma conta de anúncios nunca lida, com status "sucesso, 0 linhas" | Status por conta (`anuncios-status.ts`): conta não lida vira erro do cliente |
| 01/11/2026 | Risco: corpo de erro com HTTP 200 virava "lista vazia" | `linhasWindsor` confere `error` e o formato de `data` (`scripts/test-docs-apis-2.ts`) |

## Teste de contrato

`scripts/test-contrato-windsor.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_WINDSOR_KEY=... CONTRATO_WINDSOR_CONTA_ANUNCIO=<id>
[CONTRATO_WINDSOR_CONTA_IG=<id>]`, `_max_rows=20`, 3 dias. Avisa "lista vazia" (conta sem dado ou fora da Windsor). A chave vai na
query; o script nunca imprime a URL.
