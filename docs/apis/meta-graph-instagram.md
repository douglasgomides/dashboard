# Meta Graph API — Instagram

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas (`arquivo:linha`) são desse commit e mudam com as correções.
> "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Versão e métricas em dia. O que mais quebra é o **fuso**: a Meta fecha o dia na Califórnia, e o código erra o
começo do dia quando muda o horário de verão dos EUA.

## 1. O que usamos

- **Versão:** `v26.0`, num lugar só: `api/_lib/meta-graph-versao.ts:5` (troca pela variável `META_GRAPH_VERSION`).
- **Base:** `https://graph.facebook.com/v26.0`.
- **Doc oficial:** <https://developers.facebook.com/docs/instagram-platform> (referência de insights de usuário e de mídia)
  e <https://developers.facebook.com/docs/graph-api/changelog/versions>.
  **Lida em 01/11/2026 só por trechos de busca**: o domínio está bloqueado na rede das sessões de auditoria.

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /{ig-id}/media?fields=...&limit=100` | lista de posts | `id, caption, timestamp, media_type, media_product_type, permalink, thumbnail_url, media_url`, `paging.next`, `paging.cursors.after` | `meta-graph-sync.ts:88-111` |
| `POST /` em lote de 50 com `{media-id}/insights` | métricas do post | `reach, likes, comments, shares, saved, views, total_interactions`; 2ª passada: `ig_reels_avg_watch_time, ig_reels_video_view_total_time` (Reels), `profile_visits, follows` (feed) | `meta-graph-sync.ts:25-35, 120-180` |
| `GET /{ig-id}?fields=followers_count` | total de seguidores | `followers_count` | `meta-graph-sync.ts:285-289` |
| `GET /{ig-id}/insights` `period=day&metric_type=total_value` | números do dia da conta | `reach, total_interactions, likes, comments, saves, shares, profile_links_taps` | `meta-graph-sync.ts:418-428` |
| idem com `metric=follows_and_unfollows&breakdown=follow_type` | seguiu / deixou de seguir | `total_value.breakdowns[0].results[].dimension_values[0]` (`FOLLOWER`/`NON_FOLLOWER`) e `value` | `meta-graph-sync.ts:430-437, 340-401` |
| `GET /{ig-id}/stories` + `{story-id}/insights` | stories no ar | `reach, replies, shares, total_interactions, profile_visits, follows, views` | `meta-audiencia.ts:125-168` |
| `GET /{ig-id}/insights` (demografia, `online_followers`) | tela Audiência, ao vivo | `follower_demographics`, `reached/engaged_audience_demographics` (`this_month`, reserva `prev_month`) | `meta-audiencia.ts:87-251` |
| `GET /{media-id}/comments` em lote | comentários | `id, text, username, like_count, timestamp, replies.limit(50){...}` | `meta-comments-sync.ts:34, 76-128` |
| `GET /{media-id}?fields=media_url,media_type` | transcrição de Reels | `media_url` | `transcrever-reels.ts:19-51` |

A Windsor (`instagram-sync.ts`) é só reserva para os números diários. Ver [windsor.md](windsor.md).

## 2. Significado de cada número

- **Fuso:** a Meta fecha o dia no fuso da **Califórnia** (`America/Los_Angeles`, muda de horário em março e novembro).
  O código grava os números diários na data da Califórnia, mas o **total de seguidores na data de Brasília**
  (`meta-graph-sync.ts:289`) e o resumo do período corta na meia-noite de Brasília (`meta-audiencia.ts:294`). São três réguas.
- **Atraso:** o dia leva cerca de 48 h para fechar (fonte de terceiros, não verificado). O código relê a partir de 2 dias atrás e
  relê os 7 últimos dias a cada rodada.
- **`reach` (post):** contas únicas durante toda a vida do post.
- **`reach` (dia):** contas únicas do dia. **Não se soma entre dias** (a mesma pessoa conta de novo). A tela mostra o alcance único
  até 30 dias e só soma, com rótulo "soma dos dias", acima disso.
- **`views`:** vezes que o conteúdo foi exibido (com repetição). Substitui `impressions` e `plays`, descontinuadas em 21/04/2025.
- **`follows_and_unfollows`:** o código lê `FOLLOWER` = seguiu e `NON_FOLLOWER` = deixou de seguir. A doc lista
  `FOLLOWER/NON_FOLLOWER/UNKNOWN` sem dizer isso para esta métrica: **não verificado**.
- **Stories:** só dá para ler enquanto o story está no ar (24 h). O Nexo guarda a última leitura; 73% dos stories tiveram a última
  leitura antes de 20 h de vida, então o número final fica abaixo do real.
- **Seguidores novos:** a Meta só devolve os últimos 30 dias. Demografia exige 100 seguidores ou mais.
- **Dia sem dado:** a Meta devolve "conjunto vazio" e não zero. Vazio não pode virar 0.

## 3. Limites

- **Taxa:** limite por caso de uso do negócio (Business Use Case), informado no cabeçalho `X-Business-Use-Case-Usage`; códigos
  de limite 4, 17, 32, 613 (trechos de busca; **valor oficial não verificado**). **O código não lê o cabeçalho nem trata esses
  códigos.** Por rodada e por conta: ~35 dias × 2 chamadas diárias + 28 da reconstrução de seguidores + stories + lotes de insights.
- **Paginação:** `/media` segue `paging.next` (com trava para continuar em `graph.facebook.com`, `integration-http.ts:17-23`) e
  guarda o cursor em `instagram_backfill_state`; cursor inválido recomeça do topo. Comentários: respostas param em 50
  (`replies.paging.next` não é seguido). Stories: lê só os 25 primeiros (`meta-audiencia.ts:136`).
- **O que fazer em 429 / limite:** esperar o tempo de `estimated_time_to_regain_access` do cabeçalho; pausar acima de 80% de uso.
  Hoje o erro vira "Graph respondeu 4xx" e, na reconstrução de seguidores, **vira 0 sem aviso** (`meta-graph-sync.ts:381`).

## 4. Token

- **Tipo:** token de usuário de longa duração, **um por conta**, em `instagram_account_secrets` (as 17 contas ativas têm).
- **Exceção:** a transcrição de Reels usa só o `META_ACCESS_TOKEN` global (`transcrever-reels.ts:65`). Conta de outra Business
  Manager recebe 400.
- **Permissões (comentário do código, `meta-graph-sync.ts:8-13`):** `instagram_basic`, `instagram_manage_insights`,
  `pages_read_engagement`, `pages_show_list`. Comentários exigem `instagram_manage_comments` (**não verificado** se todas as contas têm).
- **Validade:** cerca de 60 dias (token de usuário longo; não verificado). **O Nexo não sabe quando vence**: não chama `debug_token` nem
  lê `data_access_expires_at`. Só descobre depois do erro 190 (`sync-status.ts:66`).
- **Quem renova:** quem é Admin da Business Manager do cliente gera de novo e cola no Admin do Nexo.
- **Cuidado:** o token vai na URL (`?access_token=`, `meta-graph-sync.ts:90, 285`). Não vaza nas mensagens de erro hoje.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Mudança de horário de verão na Califórnia: o código usa o fuso de hoje para os dias anteriores (`hoje − k×24h`) e pede o dia seguinte | **Não** (erro confirmado de 24 a 30/10/2026) | `meta-graph-sync.ts:411-415, 452-456`; mesma conta em `reconstruirSeguidores` |
| Dia aberto ou sem medida vem vazio e não pode virar 0 | **Não** (`?? 0` grava 0 novos e 0 saídas) | `meta-graph-sync.ts:435, 490`; filtro de "dia completo" em `:465` |
| `impressions`, `plays`, `video_views` descontinuadas em 21/04/2025 | Sim (usa `views` e `reach`) | `meta-graph-sync.ts:25` |
| Somar o `reach` diário conta a mesma pessoa de novo | Parcial (só soma acima de 30 dias, com rótulo) | `src/routes/_authenticated.$clientId.index.tsx:724, 864-887` |
| Story some em 24 h; métrica só enquanto está no ar | Parcial (lê a cada rodada; falta leitura perto das 24 h; métrica ausente vira 0) | `meta-graph-sync.ts:304-335`; `meta-audiencia.ts:145` |
| Seguidores novos só dos últimos 30 dias | Sim (reconstrução de 28 dias) | `meta-graph-sync.ts:352` |
| Métricas da conta levam ~48 h para fechar | Parcial (começa em k=2) | `meta-graph-sync.ts:471` |
| Demografia: 100 seguidores ou mais; `prev_month` pode não ser mais aceito desde a v20 | Não verificado | `meta-audiencia.ts:90` |
| `media_url` some em mídia com direitos autorais | Parcial (marca como permanente, sem aviso na tela) | `transcrever-reels.ts` |
| Token global não cobre contas de outra Business Manager | **Não** (transcrição usa só o global; 400 e 401 marcados como permanentes) | `transcrever-reels.ts:65, 86` |
| Limite de uso por conta e cabeçalho de uso | **Não** | nenhum arquivo lê `X-Business-Use-Case-Usage` |
| Respostas de comentário acima de 50 e cursor que só anda sem erro | **Não** | `meta-comments-sync.ts:34, 41-47, 264` |
| Dias antigos vindos da Windsor com `new_followers=0` e `unfollowers=null` contam como completos | **Não** | `meta-graph-sync.ts:465`; `instagram-sync.ts:387-398` |

## 6. Mudanças anunciadas

- `v26.0` saiu em 29/07/2026, sem data de fim (tabela de versões, por busca). A `v21.0` deixa de funcionar em **21/01/2027**:
  conferir que nada mais usa versão fixa antiga (hoje só `meta-graph-versao.ts`).
- Timeframes de demografia mudaram na v20 (a própria doc se contradiz sobre `prev_month`): testar ao vivo.
- O teste de contrato mostra o cabeçalho `facebook-api-version` da resposta: se vier diferente do pedido, a Meta trocou a versão sozinha.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 21/04/2025 | Meta descontinuou `impressions`/`plays` | Código já usa `views` |
| até 10/2026 | Windsor travava em períodos longos | Sync direto pela Graph (`meta-graph-sync.ts`), Windsor só como reserva |
| 24–30/10/2026 | Números diários gravados no dia seguinte nos 17 clientes (saída do horário de verão dos EUA em 01/11) | Pendente: calcular a meia-noite de cada dia com o fuso daquele dia e reler de 24/10 em diante |
| 30/10/2026 | "0 seguidores novos" em 14 clientes (consequência do erro de fuso) | Pendente: gravar nulo quando vier vazio |
| 08–09/2026 | Dias com `new_followers=0` e `unfollowers` vazio (via Windsor) nunca relidos | Pendente: tratar como incompleto |
| 24/10/2026 | 5 transcrições com 401 da OpenAI marcadas como permanentes | Pendente: tratar 401/400 como passageiros |

## Teste de contrato

`scripts/test-contrato-meta-graph-instagram.ts` (amostra em `scripts/fixtures/contrato/meta-graph-instagram.json`).
Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_META_TOKEN=... CONTRATO_META_IG_ID=...`. O lote (POST) não é chamado ao vivo; o formato de
cada item é o mesmo de `insights_post`, que é conferido por GET.
