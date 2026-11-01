# Kommo CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Leads, apagados e paginação corretos (conferência diária bate nas 3 contas). Os riscos: a mesma conta copiada em 3 clientes,
desistir no primeiro 429, webhook só numa conta (as outras ficam sem texto das mensagens) e vencimento do token sem aviso.

## 1. O que usamos

- **Versão:** API **v4** (a atual). Só GET. Webhook nativo (`x-www-form-urlencoded`).
- **Base:** `https://<conta>.kommo.com/api/v4` (aceita também `amocrm.com/.ru`, `integration-http.ts:2-9`).
- **Doc oficial:** <https://developers.kommo.com/docs/about-kommo-api>, <https://developers.kommo.com/docs/limitations>,
  <https://developers.kommo.com/docs/long-lived-token>, <https://developers.kommo.com/docs/webhooks-general>,
  <https://developers.kommo.com/reference/leads-pipelines-and-stages>. **Lidas em 01/11/2026 só por trechos de busca** (domínio bloqueado).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /leads?limit=250&page&with=custom_fields_values,source_id,contacts` (incremental: `filter[updated_at][from]` = agora − 3 dias) | leads | `id, status_id, pipeline_id, price, created_at, name, custom_fields_values[].field_name/values[0].value, source_id, _embedded.contacts[].id`, `_links.next` | `kommo-leads-sync.ts:57-85, 245-300` |
| `GET /leads?filter[statuses][0][pipeline_id/status_id]` | leads da etapa Entrada (não vêm na listagem padrão) | idem | `kommo-leads-sync.ts:118-150` |
| `GET /leads/pipelines` | funis e etapas | `_embedded.pipelines[].id/name/_embedded.statuses[].id/name/type` | `kommo-leads-sync.ts:87-103` |
| `GET /leads/loss_reasons?limit=250` | motivos de perda | `_embedded.loss_reasons[].id/name` | `kommo-leads-sync.ts:200-217` |
| `GET /contacts?filter[id][]=` (lotes de 100) | telefone e e-mail | `custom_fields_values[].field_code` (`PHONE`, `EMAIL`) | `kommo-contatos.ts:20-77` |
| `GET /events?filter[type]=incoming_chat_message/outgoing_chat_message&filter[created_at][from/to]&limit=100` | mensagens (sem texto) | `type, entity_id, entity_type, created_by, created_at, value_after[0].message.{id,origin,talk_id}` | `conversas-kommo.ts:38-51, 69-88` |
| Webhook `leads[add]`, `leads[status]`, `leads[delete]` | mudança de lead em tempo real | `id, status_id, old_status_id, pipeline_id, price` | `kommo-webhook.ts:29-100`; `api/integrations/kommo/webhook.ts` |

Tradução: status **142 = ganho**, **143 = perdido**, o resto = aberto (`kommo-leads-sync.ts:36-40`).

## 2. Significado de cada número

- **Lead** = card do Kommo (`crm_leads`), uma linha por conexão. **Data do lead** = `created_at` (segundos Unix, UTC); as funções de
  pessoas novas convertem para São Paulo.
- **Desfecho:** 142/143 fixos em todo funil. Atenção: muitas clínicas usam 142 para "agendou" (já existe alerta).
- **Origem:** campo "Fonte do Lead" ou "Origem do Lead"; **canal** = `source_id`.
- **Apagado:** `removido_na_origem` (webhook delete ou reconciliação diária); os painéis filtram.
- **Conversa:** atendimento do lead, encerrado depois de 7 dias sem mensagem. **O texto do paciente só vem pelo webhook de mensagem**;
  a API `/events` não traz texto.
- **Fuso:** dia da conversa calculado em UTC−3 fixo (`conversas-kommo.ts:203`); uma clínica fica em UTC−4.
- **Conta compartilhada:** numa conta, os números são do hospital inteiro e aparecem iguais em 3 clientes.

## 3. Limites

- **Taxa (doc, por busca):** no máximo **7 pedidos por segundo**; acima disso **HTTP 429**; a Kommo pode **bloquear o IP** em varredura
  repetida ou descontrolada; até 100 webhooks por conta.
- **Quem trata 429:** contatos (pausa de 180 ms e até 4 tentativas, `kommo-contatos.ts:36-46`) e eventos (até 3, `conversas-kommo.ts:73-77`).
  **Não tratam:** sync de leads (`kommo-leads-sync.ts:176-182`), reconciliação (`kommo-reconcile.ts:84-90`), motivos, funis.
  A conta compartilhada é varrida 3 vezes por rodada (uma por cliente), o que parece "varredura repetida".
- **Paginação:** `limit=250` (máximo). Backfill guarda cursor por página; incremental segue `_links.next` com teto de 5 páginas e avisa;
  reconciliação até 200 páginas e para no 204. `/events` 100 por página, até 60 páginas por dia (erro se passar).

## 4. Token

- **Tipo:** token de longa duração (Bearer), em `crm_connections.access_token`; uma conta usa `KOMMO_API_TOKEN` do servidor, que também é
  reserva para conexão sem token.
- **Validade (doc):** de **1 dia a 5 anos**, escolhida na criação; **sem refresh_token**; só administrador cria; só integração privada.
- **O Nexo não guarda o vencimento** e não avisa antes. Quando vence, o sync de leads registra erro; reconciliação e conversas não.
- **Webhook:** não é assinado pela Kommo; o Nexo usa um segredo por conexão **na URL** (comparado em tempo constante). A URL pode parar em log.
- **Quem renova:** administrador da conta Kommo cria um token novo e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| 7 pedidos/s, 429 e bloqueio de IP | Parcial (contatos e eventos sim; leads e reconciliação não) | `kommo-leads-sync.ts:180`; `kommo-reconcile.ts:88` |
| `limit` máximo 250 | Sim | `kommo-leads-sync.ts:18`; `kommo-reconcile.ts:31` |
| Leads da Entrada não vêm na listagem padrão | Sim | `kommo-leads-sync.ts:118-150`; `kommo-reconcile.ts:72-80` |
| Lead apagado não muda `updated_at` | Sim (reconciliação com trava de 30%) | `kommo-reconcile.ts:38, 183-212` |
| Webhook `leads[restore]` e `leads[update]` ignorados | **Não** (lead restaurado fica removido até ~1 dia) | `kommo-webhook.ts:74`; `api/integrations/kommo/webhook.ts:141` |
| Token vence sem refresh | Parcial (erro só depois) | sem campo de vencimento |
| Webhook não assinado | Sim (segredo na URL, tempo constante) | `api/integrations/kommo/webhook.ts:46-53` |
| 142/143 fixos | Sim | `kommo-leads-sync.ts:36-40` |
| Texto das mensagens só pelo webhook | Parcial (só uma conta tem webhook entregando) | `conversas-kommo.ts:6-13` |
| `created_at` em UTC; dia da conversa em UTC−3 fixo | Parcial | `conversas-kommo.ts:203` |
| Mesma conta copiada em 3 clientes | **Não** (decisão 2 da auditoria) | `api/sync/kommo-leads.ts:129-147`; `conversas-kommo.ts:149-150` |
| `with=custom_fields_values` não aparece como opção de `with` | Inofensivo; não verificado | `kommo-leads-sync.ts:287` |

## 6. Mudanças anunciadas

Nenhuma conhecida para a v4. **Não verificado** na doc completa.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| até 30/10/2026 | Leads da Entrada nunca entravam (199 e 114 em dois clientes) | `leadsDaEntradaKommo` busca etapa por etapa |
| até 10/2026 | Backfill congelava quando estourava o tempo (cursor só salvo no fim) | Cursor salvo por página |
| 10/2026 | 4 conexões sem webhook: mensagens recebidas 100% sem texto | Pendente: ligar o webhook de mensagem nessas contas |

## Teste de contrato

`scripts/test-contrato-kommo.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_KOMMO_DOMINIO=<conta> CONTRATO_KOMMO_TOKEN=...`. São 5 GET por
rodada (bem abaixo de 7/s). O webhook fica só offline. Avisa se as etapas 142/143 sumirem dos funis.
