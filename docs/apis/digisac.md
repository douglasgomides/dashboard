# Digisac

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (coleção Postman
> oficial) e código no commit `89ae33c` (mais o tipo `comment` desta mudança). As linhas citadas mudam com as correções.
> "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** CRM e WhatsApp de uma clínica com dois médicos. Avisos do sistema (`ticket`, `reaction`, `call_log`) e a 1ª resposta já foram
corrigidos (a 1ª resposta agora vem das mensagens, não do `waitingTime`). A doc oficial é uma coleção de exemplos de pedido: **não publica
limite de taxa, validade do token nem o significado de `metrics.waitingTime`**. Achado que mudou o código: a doc mostra o tipo de mensagem
`comment` (comentário interno), que contava como resposta da clínica (corrigido). Segue o risco maior: a **mesma conta alimenta os dois
clientes** com dados idênticos.

## 1. O que usamos

- **Versão:** `/api/v1` (a coleção oficial só tem essa). Só GET.
- **Base:** `https://<conta>.digisac.io/api/v1` (`digisac-sync.ts:136-139`; o código aceita só `*.digisac.io`). Na doc é `{{URL}}/api/v1`.
- **Doc oficial (lida em 01/11/2026):** coleção Postman <https://documenter.getpostman.com/view/24605757/2sA3BhfaDg> ("Documentação da
  API Digisac", equipe de Suporte Integração), lida pelo JSON público da coleção. Pastas usadas: Chamados, Histórico de chamados,
  Contatos, Mensagens, Departamentos, Usuários, Tokens, Webhooks, Estatísticas de atendimento.

| Endpoint | Para quê | Campos lidos | Na doc? | Código |
|---|---|---|---|---|
| `GET /departments`, `GET /users` | equipes e atendentes | `id, name`; atendente também `email, branch` | sim (`?perPage=40`) | `digisac-sync.ts:253, 259` |
| `GET /tickets` | atendimentos → `wts_sessions` | `id, isOpen, userId, departmentId, contactId, startedAt, endedAt, createdAt, updatedAt, metrics.messagingTime` | sim (`query={"where":...,"order":[["updatedAt","DESC"]],"page":1,"perPage":15}`) | `digisac-sync.ts:279-305` |
| `GET /contacts?include=tags` | contatos → `crm_leads` | `id, isGroup, isMe, isBroadcast, hadChat, deletedAt, name, internalName, alternativeName, data.number, createdAt, updatedAt, tags[].label` | sim | `digisac-sync.ts:327-345` |
| `GET /messages?query={where:{ticketId},order:[[timestamp,ASC]]}&perPage=100` | mensagens | `id, ticketId, timestamp, createdAt, isFromMe/fromMe, isFromBot, origin, userId, type, text, body, caption, data.text, transcription` | sim (`where[contactId]`, `include=file`); o filtro por `ticketId` não tem exemplo | `conversas-digisac.ts:185-200` |

Paginação em todas: `{ data, total, currentPage, lastPage }` com `perPage` e `page` (o formato da resposta não está na coleção; conferido no
dado gravado). A coleção mostra o `query` em JSON (estilo Sequelize: `where`, `order`, `include`, `attributes`, `page`, `perPage`).

## 2. Significado de cada número

- **Atendimento** = ticket ("chamado"). Data: `startedAt` (ou `createdAt`). Status: `isOpen=false` → encerrado; aberto com atendente → em
  andamento; aberto sem atendente → na fila (`digisac-sync.ts:129-132`).
- **`wait_seconds` / `first_response_at`:** calculados pelas mensagens (1ª do paciente até a 1ª de uma pessoa da clínica, sem aviso nem
  robô; `conversas-digisac.ts:55-72, 250-253`). **O que `metrics.waitingTime` mede: não verificado** — a coleção não descreve o objeto
  `metrics`; a estatística oficial é `GET /dashboard/general?startPeriod&endPeriod&periodType=open|close&departmentParticipation=last|middle`.
- **`service_seconds` = `metrics.messagingTime`** (mesma ressalva).
- **Tipos de mensagem (verificado só em parte):** a coleção mostra `"type": "comment", // chat or comment` ao criar mensagem e os campos
  `isFromBot`, `isFromSync`, `origin` ("bot or user"), `userId`, `ticketUserId` em `firstMessage`. **A lista oficial de tipos (ticket,
  call_log, reaction, ciphertext...) não está publicada**: os tipos de sistema seguem vindo do dado real e do contrato ao vivo.
- **Lead** = contato que já conversou, não é grupo e não foi apagado. Médico, origem e etapa vêm das **etiquetas**.
- **Fuso:** datas em ISO UTC (os exemplos usam `...Z`); o alerta de SLA usa `America/Sao_Paulo`.

## 3. Limites

- **Taxa:** **não verificado** — a coleção não tem nenhuma menção a limite de pedidos, 429 ou `Retry-After` (procurado no JSON inteiro em
  01/11/2026). O código usa `fetchComRetry` (429/5xx/rede, usa `Retry-After` se vier, `digisac-sync.ts:149`).
- **Paginação:** os exemplos usam `perPage` de 15 a 50; o código usa 200 (contatos, atendimentos) e 100 (mensagens). Não há máximo
  documentado. Para quando a página volta vazia ou chega em `lastPage`; teto de 100 páginas. Página por número com ordem por `updatedAt` pode
  pular registro alterado durante a leitura; a sobreposição de 24 h cobre só se o sync rodar a cada menos de 24 h.

## 4. Token

- **Tipo:** token pessoal (Bearer), em `crm_connections.access_token`, **o mesmo token nas 2 conexões**.
- **O que a doc mostra (verificado):** tokens ficam em "Tokens de acesso pessoal" (`GET/POST/PUT/DELETE /api/v1/me/tokens`); criar pede só
  `{"name": ...}` (sem data de vencimento). Também existe `POST /api/v1/oauth/token` com `grant_type: password` (e-mail e senha do usuário),
  que o Nexo não usa.
- **Validade:** **não verificado** — a coleção não fala em vencimento. **Se o token cai quando o usuário sai da conta: não verificado**; como
  ele mora em `/me/tokens` (é do usuário), o mais provável é que sim.
- **Proteções:** só vai para `*.digisac.io`, não segue redirecionamento; erro leva só caminho e código HTTP.
- **Quem renova:** administrador da conta Digisac gera e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Aviso de sistema `ticket` vem com `isFromMe=false` e não é do paciente | **Sim** | `conversas-digisac.ts:26-34` |
| `reaction` e `call_log` contados como mensagem | **Sim** (viram "sistema") | `conversas-digisac.ts:34` |
| Comentário interno (`type: "comment"`, doc oficial) contava como resposta da clínica | **Sim desde 01/11/2026** | `conversas-digisac.ts:34`; teste `scripts/test-apis-resilientes.ts` |
| Robô de boas-vindas como 1ª resposta | Sim (`isFromBot`, `origin`, `userId` vazio) | `conversas-digisac.ts:41-53` |
| Duas clínicas (clientes) com a mesma conta | **Não** (mesmos contatos, atendimentos e conversas nos dois) | decisão 2 da auditoria |
| Página por número com ordem por `updatedAt` pode pular registro | Parcial (sobreposição de 24 h) | `digisac-sync.ts:30, 165-186` |
| `waitingTime` não é a 1ª resposta | **Sim** (não é mais usado) | `digisac-sync.ts:298-300` |
| 429 e `Retry-After` | Sim (`fetchComRetry`) | `digisac-sync.ts:149` |
| Contato apagado no Digisac | **Não** (pula, mas não marca a linha antiga) | `digisac-sync.ts:338` |
| Filtro ignorado pela API misturaria mensagens de outro atendimento | Sim (confere `ticketId` de cada mensagem) | `conversas-digisac.ts` |
| Meta de 1ª resposta do SAP usa `wait_seconds` | Sim (agora vem das mensagens) | `supabase/migrations/20261015090000_sap_tracker_auto.sql:200-203` |

## 6. Mudanças anunciadas

Nenhuma na coleção oficial (lida em 01/11/2026). Há webhooks (`/api/v1/me/webhooks`, eventos como `message.created`, `message.updated`) que
evitariam reler mensagens; o Nexo não usa.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 10/2026 | Conector criado (`supabase/migrations/20261018100000_digisac_conector.sql`) | — |
| 11/2026 | Avisos do sistema como paciente; 1ª resposta pelo `waitingTime` | Tipos de sistema e 1ª resposta pelas mensagens |
| 11/2026 | Mesma conta nos dois médicos | Pendente (decisão 2 da auditoria) |
| 01/11/2026 | Comentário interno contava como 1ª resposta | `comment` entrou nos tipos de sistema |

## Teste de contrato

`scripts/test-contrato-digisac.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_DIGISAC_SUBDOMINIO=<conta> CONTRATO_DIGISAC_TOKEN=...`.
Avisa quando aparece um tipo de mensagem novo (pode ser outro aviso do sistema contado como paciente). Usa `perPage=5`.
