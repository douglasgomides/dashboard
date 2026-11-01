# RD Station CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (páginas `.md` de
> `developers.rdstation.com`) e código no commit `89ae33c`. As linhas citadas mudam com as correções. "Não verificado" = não confirmado na
> doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Um cliente usa. Leitura correta e honesta quanto a erros (conferência 157 = 157). `closed_at` como data da venda e a nova
tentativa em 429/5xx já entraram. A doc confirma 120 pedidos/min, `limit` máximo 200, `has_more`/`total`/`next_page` e o corte em 10 mil
registros. Novo risco achado na doc: **o token só enxerga o que o usuário dono dele enxerga** (visibilidade Restrito/Equipe/Geral).

## 1. O que usamos

- **Versão:** API **v1** do CRM, token na query (`?token=`). Só GET.
- **Base (verificado):** `https://crm.rdstation.com/api/v1` (`rdstation-sync.ts:19`; servidor "Production" da definição OpenAPI).
- **Doc oficial (lida em 01/11/2026):** índice <https://developers.rdstation.com/llms.txt>;
  [Introdução e requisitos (v1)](https://developers.rdstation.com/reference/crm-v1-introducao-e-requisitos),
  [Limite de requisições](https://developers.rdstation.com/reference/crm-v1-limite-de-requisicoes-da-api),
  [Mensagens de erro](https://developers.rdstation.com/reference/crm-v1-mensagens-de-erro),
  [Token](https://developers.rdstation.com/reference/crm-v1-token),
  [Listar negociações](https://developers.rdstation.com/reference/crm-v1-list-deals),
  [Introdução v2](https://developers.rdstation.com/reference/crm-v2-introduction).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /deal_pipelines` | funis e etapas | lista (ou `deal_pipelines`) com `id, name, deal_stages[]._id/id/name` | `rdstation-sync.ts:107-110` |
| `GET /deals?limit=200&page=N` | negociações | `_id, name, amount_total, win, closed_at, created_at, updated_at, deal_stage._id, deal_source.name, contacts[0]...`; `has_more` | `rdstation-sync.ts:112-124, 220-240` |
| `GET /deals?limit=1&page=1` | total para a conferência | `total` | `conferencia-crm.ts:99` |

## 2. Significado de cada número

- **Entrada** (`occurred_at`) = `created_at` (fuso −03:00, convertido certo). Ordem padrão da listagem (verificado): `order` "created_at",
  `direction` "desc".
- **Ganho / perdido / aberto (verificado):** filtro `win`: "true (retorna as negociações 'ganhas'), false ('perdidas') e null ('em aberto')".
  **Pausado** é outro estado (`hold`: "Se marcado como true retorna todas negociações 'pausadas'"); `closed_at=false` traz "em aberto OU
  pausadas". O código não trata `hold` (hoje 0 casos).
- **Data da venda:** `closed_at`, via `crm_data_desfecho` (`supabase/migrations/20261102120000_data_real_da_venda.sql:38-41`).
- **Valor:** `amount_total`; 0 vira "sem valor". Ganhos sem valor no RD são processo da equipe da clínica.
- **Origem:** `deal_source.name`.
- **`received_at`** = `updated_at` do RD (última edição), não a hora em que o Nexo recebeu (`rdstation-sync.ts:236`).

## 3. Limites

- **Taxa (verificado):** "A API tem um limite de **120 requisições por minuto**" (planos Basic, Pro; GET, POST, PUT, DELETE). Acima: "429
  (Too Many Requests) — API usage limit exceeded". **Se o 429 traz `Retry-After`: não verificado** (a página de erros da v1 não diz).
  O código usa `fetchComRetry` (`rdstation-sync.ts:83`).
- **Paginação (verificado):** `limit` "Valor padrão é 20. Valor máximo é 200"; resposta `{deals, has_more, total, next_page}`. "É possível
  listar apenas os **10 mil primeiros registros** a cada requisição". Existe `next_page` (cursor, ex. `"i-1726778672521,s-66ec..."`), que
  o código não usa. Teto do código: 100 páginas × 200.
- **Lado do banco:** leituras em páginas de 1.000 (`lerTodasAsLinhas`, `rdstation-sync.ts:200-203, 265`). **O `max_rows` configurado no
  projeto: não verificado** (não é da doc do RD; o código já assume 1.000).

## 4. Token

- **v1 (verificado):** "Cada usuário do RD Station CRM possui um token único e imutável, cujas permissões de uso da API são definidas pelo
  nível de visibilidade do usuário". Com visibilidade **Restrito**, "serão retornadas somente as negociações cujo responsável é o dono do
  token"; **Equipe**, as da equipe dele; **Geral**, todas. 401 "Se o Token do usuário não for passado na Query, se o Token for inválido ou
  estiver desativado".
- **Validade:** a doc não fala em vencimento ("imutável"). **Se morre quando o usuário é desativado: não verificado**; a doc diz que 401 vem
  com token "desativado", o que sugere que sim.
- **Quem renova:** usuário do RD gera o token e cola no Admin. **Tem de ser um usuário com visibilidade Geral em negociações**, senão a
  listagem e a conferência (`total`) contam só uma parte, e as duas batem entre si mesmo assim.
- **v2 (se migrar):** OAuth2 (`https://api.rd.services/crm/v2/`), com criar app, código de autorização, token e renovação.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Listagem só traz os primeiros 10 mil registros | Parcial (teto de 20 mil, confia em `has_more`; não usa `next_page`) | `rdstation-sync.ts:20-24, 112-124` |
| 429 acima de 120/min | **Sim** (`fetchComRetry`) | `rdstation-sync.ts:83` |
| `win=null` = aberto; existe `hold` (pausado) | Parcial (`hold` ignorado) | `rdstation-sync.ts:72-77` |
| Data da venda é `closed_at` | **Sim** (`crm_data_desfecho`) | `rdstation-sync.ts:228`; `20261102120000_data_real_da_venda.sql:38-41` |
| Token do usuário com visibilidade restrita esconde negociações sem erro | **Não** (nada confere a visibilidade) | `rdstation-sync.ts:80-88`; `conferencia-crm.ts:99` |
| Token no endereço pode vazar em log | Sim (erro não leva a URL) | `rdstation-sync.ts:85-86` |
| Negócio apagado some da listagem | Sim (só com lista completa e trava) | `rdstation-sync.ts:260-280` |
| Negócio com vários contatos | **Não** (pega só o primeiro; impacto pequeno) | `rdstation-sync.ts` |
| Falha ao ler funis apagava o funil e criava "mudou de etapa" falso | **Sim** (`funilDoNegocio` usa o catálogo salvo) | `rdstation-sync.ts:90-105` |

## 6. Mudanças anunciadas

- v2 do CRM publicada (`https://api.rd.services/crm/v2/`, OAuth2, filtros RDQL); introdução da v2 atualizada em 26/10/2026.
- **Fim da v1: não anunciado** — o índice inteiro da doc (lido em 01/11/2026) não tem aviso de descontinuação da v1 do CRM; a página de
  negociações v1 foi atualizada em 10/06/2026. Os avisos de "Recurso depreciado" são só de rotas de Conversas e do Marketing.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi resolvido |
|---|---|---|
| até 10/2026 | Vendas antigas contadas no mês de entrada | `closed_at` via `crm_data_desfecho` (`20261102120000`) |
| 30–31/10 e 01/11/2026 | Conferência bateu (157 = 157) | — |

## Teste de contrato

`scripts/test-contrato-rdstation.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_RD_TOKEN=...` (2 chamadas). O token vai na query, como a v1
exige; o script nunca imprime a URL. Avisa quando `total` passa de 10 mil.
