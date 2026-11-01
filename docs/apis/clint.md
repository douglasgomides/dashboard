# Clint CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (definição OpenAPI de
> cada endpoint em `clint-api.readme.io/reference/<endpoint>.md`) e código no commit `89ae33c` (mais o `limit=100` dos canais desta
> mudança). As linhas citadas mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Leitura, paginação e nomes de campo batem com a doc. A data real da venda (`won_at`) e a nova tentativa em 429/5xx já
entraram. A doc **não publica limite de taxa nem validade do token**. Corrigido nesta revisão: a lista de canais pedia `limit=200`, e a doc
limita a 100.

## 1. O que usamos

- **Versões:** REST **v1** (negócios, funis, contatos, motivos de perda) e **v2** (canais, conversas, mensagens). A doc atual não marca a v2
  como beta nem anuncia fim de nenhuma das duas (lida em 01/11/2026).
- **Base (verificado):** `https://api.clint.digital` ("Production API"). Chave no cabeçalho `api-token`. Só leitura.
- **Doc oficial (lida em 01/11/2026):** índice <https://clint-api.readme.io/llms.txt>;
  [List deals](https://clint-api.readme.io/reference/get_v1-deals), [Get deal](https://clint-api.readme.io/reference/get_v1-deals-id),
  [List origins](https://clint-api.readme.io/reference/get_v1-origins), [List lost status](https://clint-api.readme.io/reference/get_v1-lost-status),
  [Get contact](https://clint-api.readme.io/reference/get_v1-contacts-id),
  [List channel accounts](https://clint-api.readme.io/reference/get_v2-channel-accounts),
  [List chats by channel account](https://clint-api.readme.io/reference/get_v2-chats-channel-account-channelaccountid),
  [List messages by chat](https://clint-api.readme.io/reference/get_v2-messages-chat-chatid),
  [Set webhook config](https://clint-api.readme.io/reference/put_v2-webhooks),
  [Deal history](https://clint-api.readme.io/reference/get_v2-deals-id-history).

| Endpoint | Para quê | Campos lidos | Limite da doc | Código |
|---|---|---|---|---|
| `GET /v1/origins?limit=200&page=N` | funis e etapas | `data[].id, name, group.name, stages[].id/label`, `hasNext` | `limit` padrão 200, máx. 1000 | `clint-sync.ts:136-147` |
| `GET /v1/deals?origin_id=X&limit=200&page=N` | negócios | `id, origin_id, stage, stage_id, status, value, created_at, updated_at, won_at, lost_at, fields.*, contact.{id,name,email,phone}`, `hasNext` | máx. 1000 | `clint-sync.ts:150-178, 300-330` |
| `GET /v1/lost-status?limit=200` | nomes dos motivos de perda | `data[].id, name` | máx. 1000 | `clint-sync.ts:216, 492` |
| `GET /v1/contacts/{id}` | tags do contato | `data.tags[]` (`{id,name,color,created_at}`) | — | `clint-tags.ts:148-156` |
| `GET /v1/deals?limit=1&origin_id=X` | total para a conferência diária | `totalCount` | — | `conferencia-crm.ts:82-95` |
| `GET /v2/channel-accounts?limit=100` | canais de conversa | `data[].id, name, type, status`, `has_next` | **padrão 100, máx. 100** | `conversas-clint.ts:76-79` |
| `GET /v2/chats/channel-account/{id}?last_message_at_start/end&limit=200&page` | conversas | `id, contact_id, created_at, last_message_at`, `has_next` | máx. 200 | `conversas-clint.ts:88-91` |
| `GET /v2/messages/chat/{id}?limit=200&page` | mensagens | `id, type (USER/CUSTOMER/EVENT/NOTE), sent, source, content, content_type, content_action...formatted_text, created_at` | máx. 1000 | `conversas-clint.ts:10-19, 107-116` |

**Campos lidos que a doc não lista** no schema `Deal`: `stage` (nome), `value` e `updated_at`. Chegam no dado real (conferido no
`raw_payload`), mas não estão documentados: podem sumir sem aviso. O contrato de teste cobre os três.

## 2. Significado de cada número

- **Negócio** = card. **Funil** (`origin`) = pipeline; **etapa** (`stage`) = status. `status` é `OPEN`, `WON` ou `LOST` (verificado:
  enum `DealStatus`, padrão `OPEN`).
- **Lead novo:** pela data de criação (`created_at`, formato `2020-01-01T14:15:00.000000+00:00`), convertida para São Paulo no banco.
- **Data da venda:** `won_at` (verificado no schema `Deal`; também existe filtro `won_at_start/won_at_end`). O banco usa
  `crm_data_desfecho` (`supabase/migrations/20261102120000_data_real_da_venda.sql:26-56`).
- **Mensagens (verificado):** "Messages are sorted by created_at descending"; conversas "sorted by last_message_at descending". `type`
  tem também `EVENT` (evento do sistema), que o código descarta (`conversas-clint.ts:12`).
- **Status do canal (verificado):** `CONNECTED`, `DISCONNECTED`, `CANCELLED`. O código só avisa `DISCONNECTED`.
- **Valor:** `value`. Às vezes vem como **texto** (conversão funciona, `clint-sync.ts:87-92`).

## 3. Limites

- **Taxa:** **não verificado**: nenhuma página da doc (índice `llms.txt` inteiro, 01/11/2026) publica limite de pedidos nem fala de
  `Retry-After`. O código usa `fetchComRetry` (429/5xx/rede, respeita `Retry-After` se vier, teto de 10 s) em todas as chamadas
  (`clint-sync.ts:125-127`, `clint-tags.ts:150`, `conversas-clint.ts:21-27`).
- **Paginação (verificado):** v1 devolve `{status, totalCount, page, totalPages, hasNext, hasPrevious}`; v2 devolve `{status, total_count,
  page, total_pages, has_next, has_previous}` ("V2 paginated response with snake_case keys"). As duas aceitam `page`, `limit` e `offset`.
  Trava de 200 páginas; `/v1/lost-status` lê 1 página de 200 (há ~20 motivos); `/v2/channel-accounts` dá erro se tiver mais de 100 canais.
- **Lado do banco:** a detecção de apagados lê em páginas de 1.000 (`lerTodasAsLinhas`, `clint-sync.ts:400`).

## 4. Token

- **Tipo:** chave fixa `api-token`, uma por conexão, em `crm_connections.access_token`. Vai sempre no cabeçalho; o corpo das respostas de
  erro não é guardado.
- **Escopo (verificado em parte):** a doc cita escopos por chave em endpoints novos ("API key missing the deals:read scope",
  "activities:read", "whatsapp-flows:read"), então existe chave com escopo. **Se dá para criar uma chave só de leitura de negócios,
  contatos e conversas: não verificado** (a doc não descreve a tela de criação nem a lista completa de escopos).
- **Validade:** **não verificado**: a doc não fala em vencimento.
- **Dois clientes do Nexo usam a mesma chave** (conferido por hash, sem ver o valor).
- **Quem renova:** o administrador da conta Clint gera e cola no Admin do Nexo. 401 vira erro em `sync_status`.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Data da venda é `won_at` | **Sim** (via `crm_data_desfecho`) | `clint-sync.ts:321`; `supabase/migrations/20261102120000_data_real_da_venda.sql:36-37` |
| Banco devolve no máximo 1.000 linhas | **Sim** (páginas de 1.000) | `clint-sync.ts:400`; `ler-paginas.ts` |
| v1 usa `hasNext`, v2 usa `has_next` (doc confirma) | Sim | `clint-sync.ts:144, 172`; `conversas-clint.ts:79, 116, 124` |
| `/v2/channel-accounts`: `limit` máximo 100 | **Sim desde 01/11/2026** (pedia 200) | `conversas-clint.ts:78`; teste `scripts/test-conversas-clint.ts:57` |
| `value` às vezes é texto | Sim | `clint-sync.ts:87-92` |
| Uma conta Clint serve dois clientes | Parcial (o vínculo de CRM decide o cliente da conversa) | `conversas-clint.ts:95-97` |
| 429 e falhas passageiras | **Sim** (`fetchComRetry`) | `clint-sync.ts:127`; `conversas-clint.ts:25`; `clint-tags.ts:150` |
| Canal `CANCELLED` não vira aviso (só `DISCONNECTED`) | **Não** | `conversas-clint.ts:81` |
| Conversas paginadas por página com ordem `last_message_at desc`: conversa que recebe mensagem nova sai da janela fixa e empurra as outras uma posição, podendo pular uma conversa entre páginas | **Não** (risco; a janela da rodada seguinte cobre só o que tiver `last_message_at` recente) | `conversas-clint.ts:83-91` |
| `stage`, `value`, `updated_at` não estão no schema da doc | Contrato de teste cobre | `scripts/test-contrato-clint.ts` |

## 6. Mudanças anunciadas

Nenhuma data de fim para v1 ou v2 na doc (lida em 01/11/2026). Novidades listadas: histórico do negócio (`GET /v2/deals/{id}/history`),
atividades, transcrições, webhooks de SMS/voz e de WhatsApp.

**Webhook de negócio (verificado: não existe).** O `PUT /v2/webhooks` só aceita eventos `sms.*` e `voice.*`, e o `PUT /v2/webhooks/whatsapp`
só eventos de mensagem do WhatsApp. Não há evento de negócio ganho ou apagado: continua sendo preciso reler o funil.
Os webhooks da Clint são assinados: `X-Clint-Signature = "sha256=" + HMAC-SHA256 over "<X-Clint-Timestamp>.<rawBody>"`.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi resolvido |
|---|---|---|
| até 10/2026 | Venda datada pela entrada do lead | `won_at` via `crm_data_desfecho` (`20261102120000`) |
| 29/10–01/11/2026 | 6 e 7 negócios a mais no Nexo que na Clint em dois clientes (apagados não marcados) | leitura do banco em páginas de 1.000 |
| 01/11/2026 | Lista de canais pedia `limit=200` acima do máximo da doc (100) | `limit=100` |

## Teste de contrato

`scripts/test-contrato-clint.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_CLINT_TOKEN=...`. Mensagens da v2 ficam só offline (pedir um chat
real exigiria abrir uma conversa de paciente).
