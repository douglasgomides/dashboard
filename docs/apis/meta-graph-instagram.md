# Meta Graph API — Instagram

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** e código no commit
> `89ae33c` (mais a correção de `demografiaDoMes` desta mesma mudança). As linhas citadas (`arquivo:linha`) mudam com as correções.
> "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Versão e métricas em dia com a doc. O erro de fuso da mudança de horário dos EUA e o "vazio vira 0" já foram corrigidos
(`dia-meta.ts`, `lerSeguiramEDeixaram`). Sobram: o código não lê o cabeçalho de uso nem os códigos de limite, não sabe quando o token
vence e a doc não diz o fuso do `online_followers`.

## 1. O que usamos

- **Versão:** `v26.0`, num lugar só: `api/_lib/meta-graph-versao.ts:5` (troca pela variável `META_GRAPH_VERSION`).
- **Base:** `https://graph.facebook.com/v26.0`.
- **Doc oficial (lida em 01/11/2026):**
  [insights da conta](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights),
  [insights da mídia](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights),
  [comentários](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments),
  [stories](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/stories),
  [changelog do Instagram](https://developers.facebook.com/docs/instagram-platform/changelog),
  [limites](https://developers.facebook.com/docs/graph-api/overview/rate-limiting),
  [tokens longos](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived),
  [debug_token](https://developers.facebook.com/docs/graph-api/reference/debug_token),
  [versões](https://developers.facebook.com/docs/graph-api/changelog/versions) e
  [changelog v26.0](https://developers.facebook.com/docs/graph-api/changelog/version26.0).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /{ig-id}/media?fields=...&limit=100` | lista de posts | `id, caption, timestamp, media_type, media_product_type, permalink, thumbnail_url, media_url`, `paging.next`, `paging.cursors.after` | `meta-graph-sync.ts:96-114` |
| `POST /` em lote de 50 com `{media-id}/insights` | métricas do post | `reach, likes, comments, shares, saved, views, total_interactions`; 2ª passada: `ig_reels_avg_watch_time, ig_reels_video_view_total_time` (Reels), `profile_visits, follows` (feed) | `meta-graph-sync.ts:36, 120-185` |
| `GET /{ig-id}?fields=followers_count` | total de seguidores | `followers_count` | `meta-graph-sync.ts:343-350` |
| `GET /{ig-id}/insights` `period=day&metric_type=total_value` | números do dia da conta | `reach, total_interactions, likes, comments, saves, shares, profile_links_taps` | `meta-graph-sync.ts:517-527` |
| idem com `metric=follows_and_unfollows&breakdown=follow_type` | seguiu / deixou de seguir | `total_value.breakdowns[0].results[].dimension_values[0]` (`FOLLOWER`/`NON_FOLLOWER`) e `value` | `meta-graph-sync.ts:429-441` |
| `GET /{ig-id}/stories?limit=50` + `{story-id}/insights` | stories no ar | `reach, replies, shares, total_interactions, profile_visits, follows, views` | `meta-audiencia.ts:132-170` |
| `GET /{ig-id}/insights` (demografia, `online_followers`) | tela Audiência, ao vivo | `follower_demographics`, `reached/engaged_audience_demographics` (`this_month`, reserva `prev_month`) | `meta-audiencia.ts:87-104, 216-274` |
| `GET /{media-id}/comments` em lote | comentários | `id, text, username, like_count, timestamp, replies.limit(50){...}` + `replies.paging.next` seguido | `meta-comments-sync.ts:34-48, 117-143` |
| `GET /{media-id}?fields=media_url,media_type` | transcrição de Reels | `media_url` | `transcrever-reels.ts:37-41` |

Todas as métricas pedidas existem na referência da v26.0 para o tipo de mídia em que são pedidas (conferido métrica a métrica:
`profile_visits` e `follows` = "FEED (posts), STORY"; `ig_reels_*` = "REELS"; stories aceitam as 7 de `METRICAS_STORY`).
A Windsor (`instagram-sync.ts`) é só reserva para os números diários. Ver [windsor.md](windsor.md).

## 2. Significado de cada número

- **Fuso:** a Meta fecha o dia no fuso da **Califórnia** (`America/Los_Angeles`). O código calcula a meia-noite de cada data com o fuso
  daquela data (`dia-meta.ts:30-46`). O total de seguidores é gravado na data de Brasília com UTC−3 fixo (`meta-graph-sync.ts:451`).
  A doc não fala em fuso para as métricas diárias: diz só que `end_time` é "ISO 8601 timestamp with time and offset. For example:
  2022-08-01T07:00:00+0000" (07:00 UTC = meia-noite do verão da Califórnia). **Confirmado pelo exemplo, não por frase explícita.**
- **Atraso:** **verificado.** "Data used to calculate metrics may be delayed up to 48 hours." O código relê a partir de 2 dias atrás.
- **Dia sem dado:** **verificado.** "If insights data you are requesting does not exist or is currently unavailable, the API will return
  an empty data set instead of 0 for individual metrics." O código trata vazio como "não medido" (`meta-graph-sync.ts:429-441`).
- **`reach` (post):** "Number of unique Instagram users that have seen the reel at least once" (estimado). **`reach` (dia):** "The number
  of unique accounts that have seen your content" (estimado). **Não se soma entre dias.**
- **`views`:** "Total number of times IG Media has been played on Instagram" (mídia) e "The number of times your content was played or
  displayed" (conta). Substitui `impressions` (descontinuada para mídia criada a partir de 02/07/2024; v22.0+ e todas as versões em 21/04/2025).
- **Orgânico × pago:** **verificado.** "Metrics such as comments, likes, views, and total_interactions report organic interaction metrics
  only; interactions on ads containing a media object are not counted." Para o total com anúncios existem `total_likes`, `total_comments`
  e `total_views` (novos em 22/04/2026; o código não usa). Por isso o número do Nexo pode ficar abaixo do painel do Instagram em post
  impulsionado.
- **`follows_and_unfollows`:** a doc diz "The number of accounts that followed you and the number of accounts that unfollowed you or left
  Instagram in the selected time period" e lista os valores `FOLLOWER`, `NON_FOLLOWER`, `UNKNOWN` do `follow_type`, **sem dizer qual valor é
  qual lado**. A leitura `NON_FOLLOWER = deixou de seguir` continua **não verificada** (só um teste ao vivo com conta conhecida confirma).
  "Not returned if the IG User has less than 100 followers."
- **`online_followers`:** a métrica não aparece mais na tabela de métricas da v26.0; só nas limitações ("not available ... with fewer than
  100 followers"; "only available for the last 30 days"). **Fuso não verificado**: a doc não diz. O código assume Califórnia pelo pico
  observado (`meta-audiencia.ts:106-127`) e soma 24 h fixas ao `end_time` (erra 1 hora nos dias de troca de horário).
- **Stories:** **verificado.** "Story media metrics are only available for 24 hours"; "values less than 5 return an error code 10";
  respostas de usuários da Europa e do Japão vêm 0. A doc indica o webhook `story_insights` para pegar o número antes de expirar
  (o Nexo não usa).
- **Demografia:** "Demographic metrics only return the top 45 performers"; somar pode dar menos que o total de seguidores.

## 3. Limites

- **Taxa (verificado):** Instagram Platform, fora mensagens: "Calls within 24 hours = 4800 * Number of Impressions", por par app + conta,
  janela móvel de 24 h. Pedidos com token de página ou de sistema caem no limite por caso de uso (BUC), com o cabeçalho
  `X-Business-Use-Case-Usage` (`call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access`). Códigos de limite:
  **4** (app), **17** (usuário), **32** (páginas), **613** (limite próprio). "When the limit has been reached, stop making API calls.
  Continuing to make calls will continue to increase your call count."
- **O código não lê `X-Business-Use-Case-Usage` nem `X-App-Usage` e não reconhece 4/17/32/613** (`meta-audiencia.ts:50-58` só repassa
  a mensagem). Não há nova tentativa automática na Graph (o que é o certo para limite estourado).
- **Paginação:** `/media` segue `paging.next` (trava de host em `integration-http.ts:17-23`) e guarda o cursor; `/media` aceita também
  paginação por tempo (`since`/`until`). Comentários: "Returns a maximum of 50 comments per query", "reverse chronological order by
  default", "Returns only top-level comments" (respostas só por `replies`): o código pede 50 e segue `paging.next` das duas listas.
  Stories: 50 por página, até 100 stories (`meta-audiencia.ts:146`).

## 4. Token

- **Tipo:** token de usuário de longa duração, **um por conta**, em `instagram_account_secrets`; a transcrição usa o token da conta e só
  cai no `META_ACCESS_TOKEN` global na falta dele (`transcrever-reels.ts:83`).
- **Permissões (verificado):** insights pedem `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` (e `ads_management`
  ou `ads_read` se o papel na Página veio da Business Manager). Comentários pedem `instagram_manage_comments`. **Se todas as contas têm
  essa permissão: não verificado** (exige `debug_token` com o token de cada uma; não chamado com credencial nesta revisão).
- **Validade (verificado):** "A long-lived token generally lasts about 60 days" (`expires_in` ≈ 5.183.944 s). `GET /debug_token` devolve
  `expires_at`, `data_access_expires_at` ("Timestamp when app's access to user data expires"), `is_valid` e `scopes`. Token de usuário de
  sistema: a validade é escolhida ao gerar ("choose a token expiration preference").
- **O Nexo não chama `debug_token`**: só descobre o vencimento depois do erro 190. **Data de vencimento de cada conta: não verificada**
  (exige chamar `debug_token` com cada token).
- **Quem renova:** Admin da Business Manager do cliente gera de novo e cola no Admin do Nexo.
- **Cuidado:** o token vai na URL (`?access_token=`); `sync-status.ts:27-32` tira o token das mensagens de erro.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Mudança de horário de verão na Califórnia | **Sim** (meia-noite de cada data com o fuso daquela data) | `dia-meta.ts:30-46`; `meta-graph-sync.ts:481, 588` |
| Dia aberto ou sem medida vem vazio, não 0 (doc: "empty data set instead of 0") | **Sim** (`status: "vazio"` vira nulo e é relido) | `meta-graph-sync.ts:429-441, 528-545` |
| `impressions`, `plays`, `video_views` descontinuadas | Sim (usa `views` e `reach`) | `meta-graph-sync.ts:24-36` |
| Métricas orgânicas não contam interação de anúncio | **Não** (não usa `total_likes/total_comments/total_views`; decisão de produto) | `meta-graph-sync.ts:24-36` |
| Somar o `reach` diário conta a mesma pessoa de novo | Parcial (alcance único até 30 dias; acima disso, "soma dos dias" com rótulo) | `meta-audiencia.ts:298-310`; `src/lib/resultado.ts:236` |
| Story some em 24 h; menos de 5 vira erro 10 | Parcial (lê a cada rodada; métrica ausente fica de fora, não vira 0) | `meta-audiencia.ts:132-145`; `meta-graph-sync.ts:395-420` |
| Seguidores novos só dos últimos 30 dias | Sim (reconstrução de 28 dias) | `meta-graph-sync.ts:481` |
| Métricas da conta levam até 48 h para fechar | Sim (começa em k=2 e relê) | `meta-graph-sync.ts:556-558` |
| `prev_month` recusado em `reached/engaged_audience_demographics` (changelog v20.0) | **Sim desde 01/11/2026**: recusa depois de o mês atual responder vira "sem dado suficiente", não erro | `meta-audiencia.ts:87-104`; teste `scripts/test-docs-apis.ts` |
| `media_url` omitido em vídeo com áudio protegido, **mesmo de mídia própria**, com resposta 200 (changelog 30/07/2026) | Sim (marca como permanente: "sem arquivo de vídeo disponível") | `transcrever-reels.ts:24, 40` |
| Limite de uso por conta e cabeçalho de uso | **Não** | nenhum arquivo lê `X-Business-Use-Case-Usage` |
| `online_followers`: fuso não documentado e 24 h fixas no dia da troca de horário | **Não** (erro de 1 hora em 2 dias por ano) | `meta-audiencia.ts:106-127` |

## 6. Mudanças anunciadas (verificado na tabela de versões, 01/11/2026)

- `v26.0`: lançada em 29/07/2026, fim "TBD". `v25.0` até 29/07/2028; `v24.0` até 18/02/2028; `v21.0` até **21/01/2027**;
  `v20.0` saiu em 24/09/2026. O código só usa `v26.0`.
- v26.0 (Graph): `GET /?ids=...` passa a dar erro, `date_format` dá erro, `pretty`, `debug` e `If-None-Match` são ignorados; vale para
  todas as versões desde **27/10/2026**. Conferido no código: nenhum uso (`grep` sem resultado). O lote `POST /` com `batch` continua aceito.
- Changelog do Instagram: `/ordered_comments` (20/10/2026, ordem do app; o Nexo usa `/comments`), `link_clicks` em story (22/06/2026),
  `total_*` com anúncio (22/04/2026), `media_url` omitido por direitos autorais (30/07/2026).
- O teste de contrato mostra o cabeçalho `facebook-api-version`: se vier diferente do pedido, a Meta trocou a versão sozinha.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi resolvido |
|---|---|---|
| 21/04/2025 | Meta descontinuou `impressions`/`plays` | Código já usa `views` |
| até 10/2026 | Windsor travava em períodos longos | Sync direto pela Graph (`meta-graph-sync.ts`), Windsor só como reserva |
| 24–30/10/2026 | Números diários gravados no dia seguinte nos 17 clientes (saída do horário de verão dos EUA em 01/11) | `dia-meta.ts` (commit `7016f1d`) |
| 30/10/2026 | "0 seguidores novos" em 14 clientes | Vazio vira nulo e é relido (`7016f1d`) |
| 24/10/2026 | 5 transcrições com 401 da OpenAI marcadas como permanentes | 401/400 de token passaram a ser passageiros (`transcrever-reels.ts:24`) |
| 01/11/2026 | Demografia de alcançados/engajados podia virar erro no começo do mês se a Meta recusasse `prev_month` | `demografiaDoMes` devolve "sem dado suficiente" |

## Teste de contrato

`scripts/test-contrato-meta-graph-instagram.ts` (amostra em `scripts/fixtures/contrato/meta-graph-instagram.json`).
Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_META_TOKEN=... CONTRATO_META_IG_ID=...`. O lote (POST) não é chamado ao vivo; o formato de
cada item é o mesmo de `insights_post`, que é conferido por GET.
