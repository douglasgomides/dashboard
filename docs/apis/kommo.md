# Kommo CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (páginas `.md` de
> `developers.kommo.com`) e código no commit `89ae33c`. As linhas citadas mudam com as correções. "Não verificado" = não confirmado na
> doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Leads, apagados e paginação corretos (conferência diária bate nas 3 contas). Ritmo de 6 pedidos/s e nova tentativa em 429
já valem para todas as chamadas, e o vencimento do token (JWT `exp`) já vira aviso. Os riscos: a mesma conta copiada em 3 clientes,
webhook de mensagem só numa conta (as outras ficam sem texto), lead restaurado ignorado e a data do ganho (`closed_at`) sem uso.

## 1. O que usamos

- **Versão:** API **v4**. Só GET. Webhook nativo (`x-www-form-urlencoded`, verificado: "WebHook is sent in x-www-form-urlencoded format").
- **Base:** `https://<conta>.kommo.com/api/v4` (aceita também `amocrm.com/.ru`, `integration-http.ts:2-9`). A doc pede o endereço exato da
  conta: "All requests must not be made on the common domain https://www.kommo.com".
- **Doc oficial (lida em 01/11/2026):** índice <https://developers.kommo.com/llms.txt>;
  [Limitations](https://developers.kommo.com/docs/limitations), [HTTP codes](https://developers.kommo.com/docs/http-codes),
  [Long-lived token](https://developers.kommo.com/docs/long-lived-token), [Webhooks](https://developers.kommo.com/docs/webhooks-general),
  [Get leads](https://developers.kommo.com/reference/leads-list), [Get pipelines](https://developers.kommo.com/reference/pipelines-list),
  [Loss reasons](https://developers.kommo.com/reference/loss-reasons), [Contacts list](https://developers.kommo.com/reference/contacts-list),
  [Events list](https://developers.kommo.com/reference/events-list), [Events filtration](https://developers.kommo.com/reference/events-filtration),
  [Webhook events](https://developers.kommo.com/reference/webhook-events).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /leads?limit=250&page&with=custom_fields_values,source_id,contacts` (incremental: `filter[updated_at][from]` = agora − 3 dias) | leads | `id, status_id, pipeline_id, price, created_at, name, custom_fields_values[].field_name/values[0].value, source_id, _embedded.contacts[].id`, `_links.next` | `kommo-leads-sync.ts:57-85, 170-188, 245-313` |
| `GET /leads?filter[statuses][0][pipeline_id/status_id]` | leads da etapa Entrada (não vêm na listagem padrão) | idem | `kommo-leads-sync.ts:118-150` |
| `GET /leads/pipelines` | funis e etapas | `_embedded.pipelines[].id/name/_embedded.statuses[].id/name` | `kommo-leads-sync.ts:87-103, 222` |
| `GET /leads/loss_reasons?limit=250` | motivos de perda | `_embedded.loss_reasons[].id/name` | `kommo-leads-sync.ts:201` |
| `GET /contacts?filter[id][]=` (lotes) | telefone e e-mail | `custom_fields_values[].field_code` (`PHONE`, `EMAIL`) | `kommo-contatos.ts:36-40, 98` |
| `GET /events?filter[type]=incoming_chat_message/outgoing_chat_message&filter[created_at][from/to]&limit=100` | mensagens (sem texto) | `type, entity_id, entity_type, created_by, created_at, value_after[0].message.{id,origin,talk_id}` | `conversas-kommo.ts:69-88` |
| Webhook `leads[add]`, `leads[status]`, `leads[delete]` | mudança de lead em tempo real | `id, status_id, old_status_id, pipeline_id, price` | `kommo-webhook.ts:61-100`; `api/integrations/kommo/webhook.ts` |

Tradução: status **142 = ganho**, **143 = perdido** (verificado: são as etapas de sistema "Closed - won" e "Closed - lost" em todo funil,
`is_editable: false`), o resto = aberto (`kommo-leads-sync.ts:36-40`).

## 2. Significado de cada número

- **Lead** = card do Kommo (`crm_leads`), uma linha por conexão. **Data do lead** = `created_at` ("Unix Timestamp", UTC).
- **Data do ganho (verificado):** o lead tem `closed_at` ("The time and date the lead was closed in the format of Unix Timestamp"). O
  Nexo **não usa**: `crm_data_desfecho` só lê Clint e RD (`supabase/migrations/20261102120000_data_real_da_venda.sql:36-44`).
- **Desfecho:** 142/143 fixos. Atenção: muitas clínicas usam 142 para "agendou" (já existe alerta).
- **Origem:** campo "Fonte do Lead" ou "Origem do Lead"; **canal** = `source_id` ("GET parameter 'with' is required").
- **Apagado:** `removido_na_origem` (webhook delete ou reconciliação diária). A doc oferece `with=only_deleted` ("return only the deleted
  leads that are still restorable"), que o código não usa.
- **Conversa:** o evento `incoming_chat_message`/`outgoing_chat_message` traz só `value_after[message][id]` (verificado): **o texto não vem
  pela API de eventos**, só pelo webhook de mensagem (`add_message`, "Incoming message received").
- **Fuso:** dia da conversa calculado em UTC−3 fixo (`conversas-kommo.ts:200`); uma clínica fica em UTC−4.
- **Conta compartilhada:** numa conta, os números são do hospital inteiro e aparecem iguais em 3 clientes.

## 3. Limites

- **Taxa (verificado):** "not more than 7 requests per second". "429 HTTP code: in case of exceeding the number of requests". "403 HTTP
  code: if the restrictions are repeatedly violated, the IP address is blocked". Também: bloqueio se "the same data is requested multiple
  times in a short period, or if there is uncontrolled iteration through all data". A doc não fala em `Retry-After`.
- **Quem trata:** todas as chamadas passam por `fetchComRetry` com `ritmoKommo` (6/s por domínio, `integration-http.ts:121-124`):
  leads (`kommo-leads-sync.ts:109, 176, 201, 222`), reconciliação (`kommo-reconcile.ts:84`), contatos (`kommo-contatos.ts:37`), eventos
  (`conversas-kommo.ts:75`). O ritmo é por processo: duas funções ao mesmo tempo na mesma conta podem passar de 7/s.
- **Paginação (verificado):** "The maximum number of returned entities (leads / contacts / companies) is not more than 250"; eventos:
  "limit – 250". O código usa 250 em leads/contatos e 100 em eventos. Incremental segue `_links.next` e avisa se bater o teto de páginas;
  reconciliação para no 204.
- **Webhooks (verificado):** "The number of webhooks per account is limited to 100".
- **Histórico de `/events`:** **não verificado**: a doc da listagem e da filtragem não diz quantos dias de eventos ficam disponíveis.

## 4. Token

- **Tipo:** token de longa duração (Bearer), em `crm_connections.access_token`; uma conta usa `KOMMO_API_TOKEN` do servidor.
- **Validade (verificado):** "The user selects the expirations date of the token and it is valid from 1 day to 5 years"; "Long-lived tokens
  do not have a refresh_token"; "only a user with account administrator rights can create it"; "Such tokens are suitable only for private
  integrations". A tela de autorização mostra data de emissão e de vencimento e permite revogar.
- **Aviso de vencimento:** o Nexo lê o `exp` do JWT e grava/avisa (`api/sync/kommo-leads.ts:163`; `sync-status.ts:42-70`). **Data de
  vencimento de cada uma das 3 contas: não verificada** (exige ler o token guardado; não foi aberto nesta revisão).
- **Webhook:** não é assinado pela Kommo; o Nexo usa um segredo por conexão (cabeçalho `X-Webhook-Secret` ou `?secret=` na URL, comparado
  em tempo constante, `api/integrations/kommo/webhook.ts:46-60`).
- **Quem renova:** administrador da conta Kommo cria um token novo e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| 7 pedidos/s, 429 e bloqueio de IP (403) | **Sim** (ritmo 6/s e nova tentativa em todas as chamadas) | `integration-http.ts:88-124` |
| `limit` máximo 250 | Sim | `kommo-leads-sync.ts`; `kommo-reconcile.ts:83` |
| Leads da Entrada não vêm na listagem padrão; filtro aceita só 1 etapa por funil por pedido (verificado) | Sim (etapa por etapa) | `kommo-leads-sync.ts:118-150` |
| Lead apagado não muda `updated_at` | Sim (reconciliação com trava de 30%) | `kommo-reconcile.ts` |
| Lead restaurado (`restore`) e `update` no webhook | **Não** (só `add`, `status`, `delete`; restaurado fica removido até a reconciliação) | `kommo-webhook.ts:74` |
| Webhook: resposta em até 2 s, 5 tentativas, desliga após 100 falhas em 2 h (verificado) | Sim (responde rápido) | `api/integrations/kommo/webhook.ts:9-16` |
| Token vence sem refresh | **Sim** (aviso pelo `exp` do JWT) | `api/sync/kommo-leads.ts:163` |
| 142/143 fixos | Sim | `kommo-leads-sync.ts:36-40` |
| Data do ganho (`closed_at`) ignorada: venda do Kommo usa outra régua que Clint e RD | **Não** (precisa de migração em `crm_data_desfecho`) | `supabase/migrations/20261102120000_data_real_da_venda.sql:36-44` |
| Texto das mensagens só pelo webhook | Parcial (só uma conta tem webhook entregando) | `conversas-kommo.ts:6-13` |
| `created_at` em UTC; dia da conversa em UTC−3 fixo | Parcial | `conversas-kommo.ts:200` |
| Mesma conta copiada em 3 clientes | **Não** (decisão 2 da auditoria) | `api/sync/kommo-leads.ts` |
| `with=custom_fields_values` não é opção de `with` (verificado: opções são `contacts, only_deleted, loss_reason, is_price_modified_by_robot, catalog_elements, source_id, source`) | Inofensivo (campos personalizados já vêm sempre) | `kommo-leads-sync.ts:287` |

## 6. Mudanças anunciadas

Nenhuma data de fim para a v4 na doc (lida em 01/11/2026). Página de limitações atualizada em 25/03/2026; lista de eventos de webhook em
01/07/2026.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| até 30/10/2026 | Leads da Entrada nunca entravam (199 e 114 em dois clientes) | `leadsDaEntradaKommo` busca etapa por etapa |
| até 10/2026 | Backfill congelava quando estourava o tempo (cursor só salvo no fim) | Cursor salvo por página |
| 10/2026 | 4 conexões sem webhook: mensagens recebidas 100% sem texto | Pendente: ligar o webhook de mensagem nessas contas |

## Teste de contrato

`scripts/test-contrato-kommo.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_KOMMO_DOMINIO=<conta> CONTRATO_KOMMO_TOKEN=...`. São 5 GET por
rodada (bem abaixo de 7/s). O webhook fica só offline. Avisa se as etapas 142/143 sumirem dos funis.
