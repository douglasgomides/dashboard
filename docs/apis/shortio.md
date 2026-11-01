# Short.io (links curtos)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e código no commit `89ae33c` (`shortio-sync.ts` e `shortio.ts`
> não mudaram desde `c01b2b9`, então as linhas valem). "Não verificado" = não confirmado na doc oficial nem ao vivo.
> **Doc oficial ainda não lida:** em 01/11/2026 `short.io`, `developers.short.io` e `api.short.io` seguiram bloqueados na rede desta sessão
> (curl sem resposta). Por isso o sinal do `tzOffset`, o limite de uso e o máximo de `limit` continuam não verificados.

**Resumo.** Links do domínio curto da conta da equipe, com cliques e a qual cliente cada um pertence. Roda no fim do sync diário de anúncios.
Funciona hoje, mas **a falha do Short.io não aparece em nenhuma tela** (não tem linha em `sync_status`).

## 1. O que usamos

- **Versão:** sem número no caminho. Bases `https://api.short.io` (links) e `https://api-v2.short.io` (estatísticas).
- **Doc oficial:** <https://developers.short.io/docs/getting-a-list-of-links>,
  <https://docs.short.io/articles/api-reference/API%20guides/Statistics/link-statistics-1>. **Não abertas em 01/11/2026** (domínios
  bloqueados na rede da sessão; trechos de busca).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /api/domains` | domínios da conta | `[].id, hostname` | `shortio-sync.ts:93` |
| `GET /api/links?domain_id=&limit=150&pageToken=` | links | `links[].idString/id, secureShortURL/shortURL, originalURL, title, path, tags, createdAt`; `nextPageToken` | `shortio-sync.ts:108-140` |
| `GET api-v2 /statistics/link/{id}?period=last30&tzOffset=-180` | cliques | `totalClicks, humanClicks, clickStatistics.datasets[0].data[].{x,y}` | `shortio-sync.ts:157-170` |
| `POST /links` | criar link | `idString, secureShortURL` | `shortio.ts:36-49` |
| `GET api-v2 /statistics/link/{id}?period=total` | cliques (função antiga) | `humanClicks` ou `totalClicks` | `shortio.ts:51-56` |
| Graph `GET /{ig}?fields=website` | descobrir o link da bio | `website` | `shortio-sync.ts:82-87` |

Atribuição ao cliente, nesta ordem: link da bio → @ do Instagram → nome do cliente (só se um único bater). Atribuição manual nunca é
sobrescrita (`shortio-sync.ts:30-56`).

## 2. Significado de cada número

- **`cliques_total` / `cliques_humanos`:** cliques dos **últimos 30 dias** (`period=last30`), não desde a criação. A tela diz "Cliques (30 dias)"
  e usa os humanos (sem robôs).
- **Cliques por dia** (`shortio_cliques_dia`): acumulado desde 15/09/2026.
- **Fuso:** `tzOffset=-180` (Brasília). **Não verificado** se o sinal está certo (a doc não abriu).
- A função antiga `cliquesDoLink` usa `period=total` e grava em `links_rastreados.cliques_total`: outra régua.

## 3. Limites

- **Taxa:** **não documentada** no que foi lido. Até 120 chamadas de estatística em sequência por rodada (uma por link), embora exista o
  endpoint em lote `statistics/domain/{id}/link_clicks?ids=`.
- **Paginação:** até 40 páginas de 150 por domínio, com `nextPageToken` (cursor opaco); para no fim do orçamento de 70 s. Máximo de `limit` não verificado.
- **Erros:** prazo de 20 s, nenhuma nova tentativa, nenhum tratamento de 429.

## 4. Token

- **Tipo:** `SHORTIO_API_KEY`, uma conta só para todos os clientes, no cabeçalho `authorization`.
- **Graph (bio):** token de cada conta do Instagram, com `META_ACCESS_TOKEN` de reserva, **na URL**; falha engolida.
- **Validade:** não vence sozinha (não verificado). **Quem renova:** dono da conta Short.io.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| `total` × `last30` são coisas diferentes | Sim (tela diz 30 dias) | `shortio-sync.ts:157`; `src/components/links-shortio.tsx` |
| `humanClicks` × `totalClicks` (com ou sem robôs) | Sim | `shortio-sync.ts:160-163` |
| Falha do Short.io não aparecia em `sync_status` | **Sim** (linha própria `shortio`) | `api/sync/meta-ads.ts:196` |
| Erro em `/api/domains` vira lista vazia | **Não** (registra e segue) | `shortio-sync.ts:93` |
| `cliquesDoLink` devolve null sem dizer o motivo | **Não** | `shortio.ts:56` |
| Atribuição pelo nome: palavra repetida conta duas vezes | **Não** | `shortio-sync.ts:24-26, 41-50` |
| Token da Meta na URL e falha engolida ao ler a bio | **Não** | `shortio-sync.ts:82-87` |
| Sinal do `tzOffset` | Não verificado (doc bloqueada) | `shortio-sync.ts:157` |

## 6. Mudanças anunciadas

As páginas antigas da doc avisam que há uma referência mais nova; **não verificado** se `api-v2.short.io` muda de endereço.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 15/09/2026 | Início do histórico de cliques por dia | — |
| 01/11/2026 | Nenhuma falha vista; risco era ela ficar invisível | Linha própria `shortio` em `sync_status` (`api/sync/meta-ads.ts:196`) |

## Teste de contrato

`scripts/test-contrato-shortio.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_SHORTIO_KEY=...` (3 GET: domínios, 5 links, estatística de 1 link).
A criação de link (POST) nunca é chamada.
