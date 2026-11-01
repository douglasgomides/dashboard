# Windsor.ai

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Intermediário que lê Meta Ads e Instagram por nós. Hoje é fonte de anúncios das contas **sem token próprio** e reserva do
Instagram. Os números batem com a fonte. Os riscos: **erro parcial gravado como sucesso**, **conta invisível volta como "lista vazia"
sem erro** e cache de 3 dias.

## 1. O que usamos

- **Versão:** a API REST não tem número de versão. A versão da Graph usada por trás não aparece.
- **Base:** `https://connectors.windsor.ai/facebook` e `https://connectors.windsor.ai/instagram`, com `api_key, date_from, date_to,
  fields, filter=[["account_id","eq",id]], _max_rows=100000` (`meta-ads-sync.ts:111-131`, `instagram-sync.ts:81-101`).
- **Doc oficial:** <https://windsor.ai/api-documentation/>,
  <https://windsor.ai/documentation/understanding-cache-data-store-and-query-cache/>. **Lidas em 01/11/2026 só por trechos de busca**
  (domínio bloqueado). Campos conferidos com `get_fields` da Windsor MCP em 01/11/2026.

| Conector | Para quê | Campos | Código |
|---|---|---|---|
| `facebook` | anúncios das contas sem token | `date, campaign_id, campaign, objective, spend, impressions, reach, clicks, unique_clicks, frequency, actions_link_click, actions_landing_page_view, actions_lead, actions_onsite_conversion_messaging_conversation_started_7d, effective_instagram_media_id, effective_instagram_media__permalink, effective_instagram_media__thumbnail_url, adset_destination_type` | `meta-ads-sync.ts:22-45` |
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
  `profile_links_taps` = botões de contato, não o link da bio. **Fuso do dia no Instagram: não verificado.**
- **Cache (doc):** só os **últimos 3 dias** são buscados de novo; dias mais antigos vêm do cache, e a consulta é guardada por 6 h. A Meta
  continua atribuindo conversas até 7 dias depois do clique: dias com mais de 3 dias podem ficar menores que na Meta (**não verificado**
  se vale para a API REST).

## 3. Limites

- **Taxa (doc, por busca):** **600 por minuto** e **10.000 por dia**; 429 se limpar o cache mais de uma vez a cada 2 h. O Nexo faz poucas
  dezenas de pedidos, em sequência, prazo de 30 s cada. **Sem tratamento de 429** nem espera crescente.
- **Paginação:** não há. Tudo vem numa resposta limitada por `_max_rows` (**padrão 100 sem o parâmetro**). O Nexo manda 100000. O código
  não confere se veio exatamente `_max_rows` linhas (sinal de corte).
- **Tempo:** nos anúncios, em timeout refaz em janelas de 2 dias (`meta-ads-sync.ts:139-160`).

## 4. Token

- **Tipo:** uma única `WINDSOR_API_KEY` (variável do servidor), enviada **na URL** (`api_key`). Dá acesso a **todas** as contas da equipe na
  Windsor, inclusive de quem não é cliente; o código sempre filtra por `account_id`.
- **Por trás:** o login do Facebook dentro da Windsor pode expirar (troca de senha, revogação). O Nexo **não sabe quando**.
- **Cuidado:** o filtro de segredos de `sync-status.ts:16-24` esconde `access_token` e `Bearer`, **mas não `api_key`**.
- **Quem renova:** dono da conta Windsor (chave) e quem conectou o Facebook na Windsor (login).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Sem `_max_rows` a Windsor corta em 100 linhas | Sim | `meta-ads-sync.ts:127`; `instagram-sync.ts:94` |
| Conta que não está na Windsor volta 200 com lista vazia, sem erro | **Não** (vira "0 linhas" e status de sucesso) | `meta-ads-sync.ts:131-132`; `api/sync/meta-ads.ts:174-181` |
| Cache de 3 dias × atribuição da Meta até 7 dias | Parcial (relê 30 dias, mas o antigo vem do cache) | `meta-ads-sync.ts:11-12` |
| Linha por anúncio: somar alcance conta duas vezes | Parcial | `meta-ads-sync.ts:236-242` |
| `follower_count_1d` com mais de 30 dias recusa o pedido inteiro (400) | Sim (pede o trecho antigo sem ele) | `instagram-sync.ts:316-330` |
| `followers_count` só para hoje | Sim (não grava nulo por cima) | `instagram-sync.ts:402-413` |
| Várias linhas por data (tabelas diferentes) | Sim (junta por data) | `instagram-sync.ts:345-367` |
| Período de um dia só (`date_from = date_to`) não pede nada no Instagram | **Não** | `instagram-sync.ts:120-128` |
| Pedaços de 30 dias se sobrepõem no dia da emenda | Não verificado | `instagram-sync.ts:124-127` |
| Erro parcial gravado como sucesso; falha total em conta antiga não é gravada | **Não** | `api/sync/meta-ads.ts:165` |
| HTTP 200 com corpo de erro vira lista vazia | **Não** (`body.data ?? []`) | `meta-ads-sync.ts:131`; `instagram-sync.ts:100` |
| Chave na URL e fora do filtro de segredos | **Não** | `meta-ads-sync.ts:118`; `instagram-sync.ts:89`; `sync-status.ts:19-20` |
| Atribuição padrão da Windsor pode diferir do Gerenciador | Não verificado (as duas vias são coerentes entre si) | `meta-ads-sync.ts:117-125` |

## 6. Mudanças anunciadas

Nenhuma data de desligamento conhecida. O plano do Nexo é **sair da Windsor** nos anúncios quando houver token de cada conta
(`api/sync/meta-ads.ts:20-27`); no Instagram, as 17 contas já estão na Graph.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| antes de 10/2026 | Sem `_max_rows`, Reels de um cliente sumiram (corte em 100) | `_max_rows=100000` |
| antes de 10/2026 | Windsor travava em períodos longos do Instagram | Instagram migrado para a Graph |
| antes de 10/2026 | `follower_count_1d` com mais de 30 dias derrubava alcance e interações | Pedido dividido |
| 08–09/2026 | Dias com `new_followers=0` e `unfollowers` vazio gravados pela reserva | Pendente (ver [meta-graph-instagram.md](meta-graph-instagram.md)) |
| 01/11/2026 | Uma conta de anúncios nunca lida, com status "sucesso, 0 linhas" | Pendente |

## Teste de contrato

`scripts/test-contrato-windsor.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_WINDSOR_KEY=... CONTRATO_WINDSOR_CONTA_ANUNCIO=<id>
[CONTRATO_WINDSOR_CONTA_IG=<id>]`, `_max_rows=20`, 3 dias. Avisa "lista vazia" (conta sem dado ou fora da Windsor). A chave vai na
query; o script nunca imprime a URL.
