# Short.io (links curtos)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e código no commit `89ae33c`; as linhas de `shortio-sync.ts` foram
> atualizadas na segunda leitura (01/11/2026), depois do ritmo das estatísticas. "Não verificado" = não confirmado na doc oficial nem ao vivo.
> **Segunda leitura (01/11/2026):** a rede passou a abrir só `short.io` (raiz). `developers.short.io`, `docs.short.io`, `help.short.io`,
> `api.short.io` e `blog.short.io` seguem recusados pelo proxy (403 no CONNECT). Lidas de verdade: <https://short.io/pricing> e
> <https://short.io/llms.txt>. O limite das estatísticas veio de **trechos de busca** do artigo "API limits" da ajuda (marcado "por busca").
> Seguem não verificados: o sinal do `tzOffset`, o máximo de `limit` e os parâmetros do endpoint em lote.

**Resumo.** Links do domínio curto da conta da equipe, com cliques e a qual cliente cada um pertence. Roda no fim do sync diário de anúncios.
Funciona hoje, mas **a falha do Short.io não aparece em nenhuma tela** (não tem linha em `sync_status`).

## 1. O que usamos

- **Versão:** sem número no caminho. Bases `https://api.short.io` (links) e `https://api-v2.short.io` (estatísticas).
- **Doc oficial:** <https://developers.short.io/docs/getting-a-list-of-links>,
  <https://docs.short.io/articles/api-reference/API%20guides/Statistics/link-statistics-1>,
  <https://help.short.io/en/articles/4065925-what-are-the-api-limits-on-short-io>. **Não abertas em 01/11/2026** (proxy recusa esses
  hosts). Abertas: <https://short.io/pricing> (limite geral) e <https://short.io/llms.txt>.

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /api/domains` | domínios da conta | `[].id, hostname` | `shortio-sync.ts:120` |
| `GET /api/links?domain_id=&limit=150&pageToken=` | links | `links[].idString/id, secureShortURL/shortURL, originalURL, title, path, tags, createdAt`; `nextPageToken` | `shortio-sync.ts:135-167` |
| `GET api-v2 /statistics/link/{id}?period=last30&tzOffset=-180` | cliques | `totalClicks, humanClicks, clickStatistics.datasets[0].data[].{x,y}` | `shortio-sync.ts:193-210` |
| `POST /links` | criar link | `idString, secureShortURL` | `shortio.ts:36-49` |
| `GET api-v2 /statistics/link/{id}?period=total` | cliques (função antiga) | `humanClicks` ou `totalClicks` | `shortio.ts:51-56` |
| Graph `GET /{ig}?fields=website` | descobrir o link da bio | `website` | `shortio-sync.ts:109-114` |

Atribuição ao cliente, nesta ordem: link da bio → @ do Instagram → nome do cliente (só se um único bater). Atribuição manual nunca é
sobrescrita (`shortio-sync.ts:31-51`).

## 2. Significado de cada número

- **`cliques_total` / `cliques_humanos`:** cliques dos **últimos 30 dias** (`period=last30`), não desde a criação. A tela diz "Cliques (30 dias)"
  e usa os humanos (sem robôs).
- **Cliques por dia** (`shortio_cliques_dia`): acumulado desde 15/09/2026.
- **Fuso:** `tzOffset=-180` (Brasília). Unidade **minutos** (por busca: descrição do parâmetro na integração Pipedream; os exemplos da
  doc antiga mandam `"tzOffset":"0"`). **O sinal continua não verificado** (nenhuma página do Short.io define o parâmetro; a doc nova está
  bloqueada). Teste sugerido: comparar ao vivo `tzOffset=-180` × `180` num link com clique perto da meia-noite.
- A função antiga `cliquesDoLink` usa `period=total` e grava em `links_rastreados.cliques_total`: outra régua.

## 3. Limites

- **Taxa geral (verificado em 01/11/2026, <https://short.io/pricing>):** "API rate limit — Maximum number of API requests per second.
  50 req/s" e "Link creation rate limit ... 50 req/s", iguais em todos os planos.
- **Taxa das estatísticas (por busca, 01/11/2026):** o artigo "API limits" da ajuda fala em **60 pedidos por minuto** para estatísticas
  (versões antigas do mesmo artigo diziam 10 por minuto, e 5–50 RPS no geral); "if you exceed the rate limit, the 429 error will occur".
  **Não verificado na página** (help.short.io bloqueado).
- **O que o Nexo faz agora:** estatísticas a no máximo **1 por segundo e 50 por minuto** (`RITMO_SHORTIO_STATS`, `shortio-sync.ts:61`),
  com `fetchComRetry` (3 tentativas, respeita `Retry-After` até 10 s). Teto da janela atingido = o resto fica para a próxima rodada
  (`adiados`, não é erro; `shortio-sync.ts:214`). 429 que persiste para a rodada com **um** erro, em vez de um por link
  (`shortio-sync.ts:220`). Só pede link **não lido nas últimas 20 h** (`STATS_VALIDADE_MS`, `shortio-sync.ts:64, 176-181`): antes cada sync
  de anúncios pedia os 120 mais antigos, mesmo os lidos minutos antes. Domínios e links: 20 por segundo (abaixo dos 50) com a mesma
  nova tentativa.
- **Lote:** existe `statistics/domain/{id}/link_clicks?ids=` (por busca), mas a doc dele não abriu e parece devolver só o total de
  cliques, sem humanos nem por dia; **não adotado** até ler a doc.
- **Plano gratuito (verificado, pricing):** estatística detalhada só dos primeiros 50.000 cliques por mês ("Tracked clicks 50,000/mo");
  depois o Short.io "continues collecting data but restricts your ability to see it". Se a conta for gratuita, `humanClicks` pode parar
  de crescer sem erro (**não verificado** qual plano a conta usa).
- **Paginação:** até 40 páginas de 150 por domínio, com `nextPageToken` (cursor opaco); para no fim do orçamento de 70 s. Máximo de `limit` não verificado.
- **Erros:** prazo de 20 s por pedido.

## 4. Token

- **Tipo:** `SHORTIO_API_KEY`, uma conta só para todos os clientes, no cabeçalho `authorization`.
- **Graph (bio):** token de cada conta do Instagram, com `META_ACCESS_TOKEN` de reserva, **na URL**; falha engolida.
- **Validade:** não vence sozinha (não verificado). **Quem renova:** dono da conta Short.io.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| `total` × `last30` são coisas diferentes | Sim (tela diz 30 dias) | `shortio-sync.ts:193`; `src/components/links-shortio.tsx` |
| `humanClicks` × `totalClicks` (com ou sem robôs) | Sim | `shortio-sync.ts:195-198` |
| Falha do Short.io não aparecia em `sync_status` | **Sim** (linha própria `shortio`) | `api/sync/meta-ads.ts:196` |
| Erro em `/api/domains` vira lista vazia | **Não** (registra e segue) | `shortio-sync.ts:120` |
| `cliquesDoLink` devolve null sem dizer o motivo | **Não** | `shortio.ts:56` |
| Atribuição pelo nome: palavra repetida conta duas vezes | **Não** | `shortio-sync.ts:25-27, 42-51` |
| Token da Meta na URL e falha engolida ao ler a bio | **Não** | `shortio-sync.ts:109-114` |
| Sinal do `tzOffset` | Não verificado (doc bloqueada; unidade = minutos por busca) | `shortio-sync.ts:193` |
| 429 "Rate limit exceeded" nas estatísticas (120 em sequência) | **Sim** (1/s, 50/min, só link não lido em 20 h, para no 429) | `shortio-sync.ts:61-64, 176-224` |
| Plano gratuito esconde cliques acima de 50.000/mês | **Não** (não verificado o plano) | — |

## 6. Mudanças anunciadas

As páginas antigas da doc avisam que há uma referência mais nova; **não verificado** se `api-v2.short.io` muda de endereço.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 15/09/2026 | Início do histórico de cliques por dia | — |
| 01/11/2026 | Nenhuma falha vista; risco era ela ficar invisível | Linha própria `shortio` em `sync_status` (`api/sync/meta-ads.ts:196`) |
| 01/11/2026 | Sync recebeu 429 "Rate limit exceeded" nas estatísticas dos links | Ritmo 1/s e 50/min, nova tentativa com `Retry-After`, só links não lidos em 20 h, para no 429 (`scripts/test-docs-apis-2.ts`) |

## Teste de contrato

`scripts/test-contrato-shortio.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_SHORTIO_KEY=...` (3 GET: domínios, 5 links, estatística de 1 link).
A criação de link (POST) nunca é chamada.
