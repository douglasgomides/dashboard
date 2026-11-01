# Clint CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** A leitura e a paginação batem com a Clint. O erro grave é a **data da venda**: o Nexo usa a data de entrada do lead, e a
Clint informa a data real do ganho (`won_at`). Não há nova tentativa quando a Clint falha.

## 1. O que usamos

- **Versões:** REST **v1** (negócios, funis, contatos, motivos de perda) e REST **v2** (canais, conversas, mensagens), que o próprio
  repositório chama de "beta, só canais oficiais" (`sonda-conversas-crm.ts:6`). Não usa GraphQL.
- **Base:** `https://api.clint.digital`. A chave vai no cabeçalho `api-token`. Só leitura.
- **Doc oficial:** <https://clint-api.readme.io/> (ex.: <https://clint-api.readme.io/reference/get_deals-id>).
  **Não aberta em 01/11/2026** (domínio bloqueado); só a página de `GET /v1/deals` apareceu na busca. Quase tudo abaixo vem do código
  e do dado guardado no banco.

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /v1/origins?limit=200&page=N` | funis e etapas | `data[].id, name, group.name, stages[].id/label`, `hasNext` | `clint-sync.ts:118-130` |
| `GET /v1/deals?origin_id=X&limit=200&page=N` | negócios | `id, origin_id, stage, stage_id, status, value, created_at, updated_at, fields.fonte/origem/utm_source/parameters_utm_source, contact.{id,name,email,phone}`, `hasNext` | `clint-sync.ts:135-160, 289-311` |
| `GET /v1/lost-status?limit=200` | nomes dos motivos de perda | `data[].id, name` | `clint-sync.ts:198, 458` |
| `GET /v1/contacts/{id}` | tags do contato | `data.tags[]` (texto ou `{name}`) | `clint-tags.ts:148-156, 284-294` |
| `GET /v1/deals?limit=1&origin_id=X` | total para a conferência diária | `totalCount` | `conferencia-crm.ts:82-95` |
| `GET /v2/channel-accounts?limit=200` | canais de conversa | `data[].id, name, type, status`, `has_next` | `conversas-clint.ts:74-77` |
| `GET /v2/chats/channel-account/{id}?last_message_at_start/end&page` | conversas | `id, contact_id, created_at, last_message_at`, `has_next` | `conversas-clint.ts:84-90` |
| `GET /v2/messages/chat/{id}?limit=200&page` | mensagens | `id, type (USER/CUSTOMER/NOTE), sent, source, content, content_type, content_action.components[].formatted_text, created_at` | `conversas-clint.ts:10-19, 105-113` |

Chegam e ficam só no `raw_payload`, sem uso: `won_at`, `lost_at`, `updated_stage_at`, `won_by`, `lost_by`.

## 2. Significado de cada número

- **Negócio** = card. **Funil** (`origin`) = pipeline; **etapa** (`stage`) = status.
- **Lead novo:** pela data de criação (`created_at`, sempre com fuso explícito), convertida para São Paulo nas funções do banco.
- **Venda:** status `WON`, ou card num funil marcado como "compra aprovada" (regra própria de um cliente).
- **Data da venda (hoje):** a do evento "ganhou" que o próprio banco registra no momento do sync; sem esse evento, a **data de criação**
  do card. A Clint tem a data real (`won_at`), ignorada. Em outubro/2026, um cliente viu 17 vendas no Nexo contra 19 pela data real.
- **Origem:** `fields.fonte/origem/utm`, depois o nome do funil configurado, depois as tags do contato.
- **Valor:** `value`. Às vezes vem como **texto** (conversão funciona).
- **Status desconhecido** vira "aberto" sem aviso (`clint-sync.ts:98-106`).

## 3. Limites

- **Taxa:** **não verificado** (doc não abriu; não achei o limite oficial nem se há `Retry-After`).
- **Paginação:** v1 usa `page`/`limit=200` e `hasNext`; v2 usa `page` e `has_next` (nomes diferentes). Trava de 200 páginas e erro
  quando a página vem vazia dizendo que tem mais. `/v1/lost-status` lê só 1 página (ignora o resto sem avisar);
  `/v2/channel-accounts` lê 1 página e dá erro se tiver mais.
- **Lado do banco:** a detecção de apagados usa `.limit(50_000)`, mas o banco devolve no máximo 1.000 linhas (`clint-sync.ts:369-375`).
- **O que fazer em 429:** hoje nada: vira erro na hora para aquele funil, conversa ou lote de tags. A próxima rodada refaz tudo.

## 4. Token

- **Tipo:** chave fixa `api-token`, uma por conexão, em `crm_connections.access_token`. Vai sempre no cabeçalho, nunca na URL; o
  corpo das respostas de erro não é guardado (`clint-sync.ts:109-113`).
- **Validade e escopo:** **não verificados** (não se sabe se existe chave só de leitura).
- **Dois clientes do Nexo usam a mesma chave** (conferido por hash, sem ver o valor).
- **Quem renova:** o administrador da conta Clint gera e cola no Admin do Nexo. 401 vira erro em `sync_status`.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Data da venda é `won_at`; `created_at` joga a venda no mês de entrada | **Não** | `clint-sync.ts:300`; `supabase/migrations/20261031100000_vendas_do_periodo.sql:39-43` |
| Banco devolve no máximo 1.000 linhas; apagados além disso nunca são marcados | **Não** | `clint-sync.ts:369-375` |
| v1 usa `hasNext`, v2 usa `has_next` | Sim | `clint-sync.ts:126, 154`; `conversas-clint.ts:112, 120` |
| `value` às vezes é texto | Sim | `clint-sync.ts:85-90` |
| Uma conta Clint serve dois clientes: conversa gravada nos dois | Parcial (negócios separados; 79 conversas nos dois) | `clint-sync.ts:282`; `conversas-clint.ts:92-98` |
| Tags só por `/contacts/{id}`, uma chamada por contato | Sim | `clint-tags.ts:137-151, 284-294` |
| 429 e falhas passageiras | **Não** (sem nova tentativa) | `clint-sync.ts:108-116`; `conversas-clint.ts:21-27`; `clint-tags.ts:284-294` |
| Canal de WhatsApp desconectado não vira erro (status verde) | Parcial | `conversas-clint.ts:77`; `api/sync/clint.ts:88` |
| Resposta 200 com corpo inesperado em contatos vira "sem tag" por 14 dias | **Não** | `clint-tags.ts:291-293` |
| Rota `?tags=1` não grava `sync_status` | **Não** | `api/sync/clint.ts:68-77` |
| Gatilho que registra "ganhou" engole qualquer erro (`exception when others then null`) | **Não** | `supabase/migrations/20261016090000_crm_eventos_visoes.sql:54-56` |
| API v2 é beta: pode mudar sem aviso | Contrato de teste cobre os campos lidos | `sonda-conversas-crm.ts:6` |

## 6. Mudanças anunciadas

Nenhuma conhecida. **Não verificado** se v1 ou v2 têm data de saída (doc não abriu).

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| até 10/2026 | Venda datada pela entrada do lead | Pendente: usar `won_at` (decisão 1 da auditoria) |
| 29/10–01/11/2026 | 6 e 7 negócios a mais no Nexo que na Clint em dois clientes (apagados não marcados) | Pendente: paginar a leitura do banco |

## Teste de contrato

`scripts/test-contrato-clint.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_CLINT_TOKEN=...`. Mensagens da v2 ficam só offline (pedir um chat
real exigiria abrir uma conversa de paciente).
