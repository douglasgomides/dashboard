# Digisac

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** CRM e WhatsApp de uma clínica com dois médicos. O sync é honesto quanto a erros, mas: a **mesma conta alimenta os dois
clientes** com dados idênticos, **avisos do sistema contam como mensagem do paciente** e o "tempo de 1ª resposta" não bate com as mensagens.

## 1. O que usamos

- **Versão:** `/api/v1` (único caminho encontrado). Só GET.
- **Base:** `https://<conta>.digisac.io/api/v1` (`digisac-sync.ts:136-139`; o código aceita só `*.digisac.io`).
- **Doc oficial:** coleção Postman <https://documenter.getpostman.com/view/24605757/2sA3BhfaDg>. **Não aberta em 01/11/2026** (bloqueada).
  Só fontes de terceiros. O formato foi conferido pelo dado já gravado no banco.

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /departments`, `GET /users` | equipes e atendentes | `id, name`; atendente também `email, branch` | `digisac-sync.ts:253, 259` |
| `GET /tickets` | atendimentos → `wts_sessions` | `id, isOpen, userId, departmentId, contactId, startedAt, endedAt, createdAt, updatedAt, metrics.waitingTime, metrics.messagingTime` | `digisac-sync.ts:282-304` |
| `GET /contacts?include=tags` | contatos → `crm_leads` | `id, isGroup, isMe, isBroadcast, hadChat, deletedAt, name, internalName, alternativeName, data.number, createdAt, updatedAt, tags[].label` | `digisac-sync.ts:330-341` |
| `GET /messages?query={where:{ticketId},order:[[timestamp,ASC]]}&perPage=100` | mensagens | `id, ticketId, timestamp, createdAt, isFromMe/fromMe, type, text, body, caption, data.text, transcription` | `conversas-digisac.ts:145-168` |

Paginação em todas: `{ data, total, currentPage, lastPage }` com `perPage` e `page`.

## 2. Significado de cada número

- **Atendimento** = ticket. Data: `startedAt` (ou `createdAt`). Status: `isOpen=false` → encerrado; aberto com atendente → em andamento;
  aberto sem atendente → na fila (`digisac-sync.ts:129-132`).
- **`wait_seconds` = `metrics.waitingTime`** (segundos, coerente com a duração). **Não é a 1ª resposta ao paciente**: bate em só 30% dos
  casos e vem vazio em 49% dos atendimentos. Mesmo assim `first_response_at = startedAt + waitingTime` para todos (`digisac-sync.ts:304`),
  inclusive quando a clínica falou primeiro.
- **`service_seconds` = `metrics.messagingTime`**.
- **Lead** = contato que já conversou, não é grupo e não foi apagado. Médico, origem e etapa vêm das **etiquetas**
  ("Dra. X"/"Dr. Y", "Instagram [Origem]", "Agendado"/"Não agendado"/"Sem resposta"). 92% dos contatos estão sem médico identificado.
- **Fuso:** datas em ISO UTC; o alerta de SLA usa `America/Sao_Paulo` (a clínica segue o horário de Brasília).

## 3. Limites

- **Taxa:** **não verificada.** O código só reage a 429 e 5xx com 2 tentativas (0,8 s e 1,6 s), sem `Retry-After` e sem espaçar
  (`digisac-sync.ts:152-155`). Guia de terceiros recomenda páginas de 20 a 50; o código usa 200 (contatos, atendimentos) e 100 (mensagens).
- **Paginação:** para quando a página volta vazia ou chega em `lastPage`; teto de 100 páginas. Nas mensagens confere `currentPage` e marca
  "parcial" se faltar página. Página por número com ordem por `updatedAt` pode pular registro alterado durante a leitura (`digisac-sync.ts:172-186`);
  a sobreposição de 24 h cobre só se o sync rodar a cada menos de 24 h.

## 4. Token

- **Tipo:** token pessoal da conta (Bearer), em `crm_connections.access_token`, **uma cópia por cliente (o mesmo token nas 2 conexões)**.
- **Proteções:** só vai para `*.digisac.io`, não segue redirecionamento, prazo de 30 s (`integration-http.ts`); erro leva só caminho e
  código HTTP (`digisac-sync.ts:156-157`).
- **Validade e escopo:** **não verificados**. Por terceiros: 401 = token removido, 403 = sem permissão. Não verificado se o token cai quando
  o usuário que o criou sai da conta.
- **Quem renova:** administrador da conta Digisac gera e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Mensagem de sistema tipo `ticket` (abriu, transferiu, fechou) vem com `isFromMe=false` e não é do paciente | **Não** (3.483 avisos gravados como "entrada" numa conta) | `conversas-digisac.ts:26-31` |
| Reações e registros de chamada (`reaction`, `call_log`) contados como mensagem | **Não** | `conversas-digisac.ts:26-31, 196` |
| Duas clínicas (clientes) com a mesma conta | **Não** (mesmos contatos, atendimentos e conversas nos dois) | `conversas-digisac.ts:74` (a trava não pega esse caso) |
| Página por número com ordem por `updatedAt` pode pular registro | Parcial (sobreposição de 24 h) | `digisac-sync.ts:30, 172-186, 212-216` |
| `waitingTime`/`messagingTime`: unidade e significado | Parcial (unidade certa; significado não é "1ª resposta") | `digisac-sync.ts:289, 304` |
| Atendimento iniciado pela clínica não tem espera do paciente | **Não** | `digisac-sync.ts:304` |
| 429 e `Retry-After` | Parcial | `digisac-sync.ts:152-155` |
| Contato apagado no Digisac | **Não** (pula, mas não marca a linha antiga) | `digisac-sync.ts:341` |
| Filtro ignorado pela API misturaria mensagens de outro atendimento | Sim (confere `ticketId` de cada mensagem) | `conversas-digisac.ts:165-167` |
| Token no texto do erro | Sim (não vai) | `digisac-sync.ts:156-157` |
| Meta de 1ª resposta do SAP usa `waitingTime` | **Não** | `supabase/migrations/20261015090000_sap_tracker_auto.sql:200-203, 238-239` |

## 6. Mudanças anunciadas

Nenhuma conhecida. A doc antiga em S3 citada por terceiros parece abandonada. **Não verificado** na fonte oficial.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 10/2026 | Conector criado (`supabase/migrations/20261018100000_digisac_conector.sql`) | — |
| 11/2026 | Mesma conta nos dois médicos; avisos do sistema como paciente; 1ª resposta errada | Pendente (decisão 2 da auditoria para a conta compartilhada) |

## Teste de contrato

`scripts/test-contrato-digisac.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_DIGISAC_SUBDOMINIO=<conta> CONTRATO_DIGISAC_TOKEN=...`.
Avisa quando aparece um tipo de mensagem novo (pode ser outro aviso do sistema contado como paciente). Usa `perPage=5`.
