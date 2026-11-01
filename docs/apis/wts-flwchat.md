# WTS Chat / FlwChat (Helena)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** (definições OpenAPI em
> `helena.readme.io/reference/<endpoint>.md`) e código no commit `89ae33c` (mais a leitura de `details.utm` desta mudança). As linhas
> citadas mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** A doc oficial existe e é a da **Helena** (<https://helena.readme.io>), com servidores `https://api.helena.run/{chat,core,crm}`.
O Nexo usa `https://api.wts.chat`, que segue respondendo as mesmas rotas. A doc confirma: **1.000 pedidos a cada 5 minutos e 200 a cada
5 segundos por conta**, `pageSize` máximo 100, token permanente `pn_` sem validade. Ela **não explica** `timeWait`, `timeService`,
`PENDING` e `HIDDEN`. Achado que muda o código: a origem do anúncio vem em `details.utm` (`sourceId`, `clid`, `referralUrl`...), e o código
não reconhecia `clid` nem `referralUrl` (corrigido). Riscos que seguem: `/chat/v1/session` não aparece mais na doc (só `/chat/v2/session`),
a ordem das mensagens não é fixada, sessão que troca de equipe fica em duas médicas.

## 1. O que usamos

- **Versão:** rotas `/chat/v1`, `/core/v1`, `/crm/v1`, sem cabeçalho de versão. Base `https://api.wts.chat` (`wts-sync.ts:27`,
  `flwchat-sync.ts:32`, `conversas-wts.ts:17`). **A doc usa `https://api.helena.run`**; não há aviso de desligamento do domínio antigo
  (não verificado se e quando ele sai).
- **Doc oficial (lida em 01/11/2026):** índice <https://helena.readme.io/llms.txt>;
  [Autenticação](https://helena.readme.io/reference/getting-started-with-your-api), [Paginação](https://helena.readme.io/reference/paginação),
  [Rate Limiting](https://helena.readme.io/reference/rate-limiting), [Webhooks](https://helena.readme.io/reference/webhooks-1),
  [Criar token](https://helena.readme.io/reference/criar-token-de-integração),
  [Listar conversas (v2)](https://helena.readme.io/reference/get_v2-session),
  [Listar mensagens da conversa](https://helena.readme.io/reference/get_v1-session-id-message),
  [Listar cards (v2)](https://helena.readme.io/reference/get_v2-panel-card), [Listar contatos](https://helena.readme.io/reference/get_v1-contact),
  [Listar etiquetas](https://helena.readme.io/reference/get_v1-tag), [Rastreio UTM](https://helena.readme.io/reference/rastreio-de-campanha-utm).

| Endpoint | Para quê | Campos lidos | Na doc? | Código |
|---|---|---|---|---|
| `GET /core/v1/department` | equipes | `id, name` | sim (Equipes) | `wts-sync.ts:99-118` |
| `GET /core/v1/agent` | atendentes | `userId`, `name, email, profile` | sim | `wts-sync.ts:120-139` |
| `GET /chat/v1/session?PageSize=100&PageNumber=N&OrderBy=createdat&OrderDirection=DESCENDING` (+ 2ª passada `UpdatedAt.After`) | sessões | `id, createdAt, startAt, endAt, status, departmentId, userId, channelId, contactId, timeWait, timeService, firstResponseAt`; `{items, hasMorePages}` | **só a v2** (`/chat/v2/session`, mesmos campos no `PublicSessionDTOV2`) | `wts-sync.ts:313-378` |
| `GET /chat/v1/session/{id}/message?PageSize=100&PageNumber=N` (até 8 páginas) | mensagens | `id, timestamp/createdAt, direction, type, origin, text, details.transcription, details.utm` | sim | `conversas-wts.ts:245-262` |
| `GET /core/v1/contact/{id}` | telefone e nome | `phoneNumber, name/nameWhatsapp, email, instagram` | sim | `conversas-wts.ts:194-199` |
| `GET /crm/v1/panel/{id}?includeDetails=Steps` | painel e etapas | `title, steps[].id/title` | sim | `flwchat-sync.ts:440` |
| `GET /crm/v1/panel/card?panelId&pageSize=100&pageNumber` | cards de venda | `id, title, stepId, monetaryAmount, createdAt, updatedAt, customFields, description, contactIds, sessionId, number`; `{items, hasMorePages}` | a doc lista a **v2** (`/crm/v2/panel/card`) | `flwchat-sync.ts:101-110` |
| `GET /core/v1/tag` e `GET /core/v1/contact?IncludeDetails=Tags&orderBy&orderDirection` | etiquetas dos contatos | `items[].id/name`; `items[].id, tagIds, updatedAt`, `totalPages` | sim | `flwchat-sync.ts:240-249, 394-404` |

## 2. Significado de cada número

- **"Espera até a 1ª resposta":** mediana de `timeWait`. **Significado oficial não verificado**: o schema `PublicSessionDTOV2` lista
  `timeService`, `timeWait`, `firstResponseAt`, `startAt` só como `string`, sem descrição. Medido no banco: `timeWait` é sempre ≤
  (`firstResponseAt` − `startAt`).
- **"Tempo até fechar":** mediana de `timeService` (mesma ressalva).
- **Status (verificado só a lista):** `UNDEFINED, STARTED, PENDING, IN_PROGRESS, COMPLETED, HIDDEN` (filtro `Status` de `/v2/session`). A doc
  **não descreve** `PENDING` nem `HIDDEN`; o guia de webhooks mostra o "ciclo de vida de uma conversa" só em imagem. Abertas = só
  `IN_PROGRESS` no Nexo.
- **Datas (verificado):** filtros "sempre em fuso horário UTM" (UTC). O dia do Nexo é `America/Sao_Paulo`.
- **Origem de anúncio (verificado):** `details.utm` da mensagem e `utm` da sessão usam `PublicUtmDTO {sourceId, source, clid, medium,
  campaign, content, headline, term, referralUrl}`. O guia de UTM mostra `utm_source/medium/campaign` vindo de link `wa/[TELEFONE]`.
- **Cards (verificado):** a v2 tem `status` e o filtro `Statuses` = `OPEN, WON, LOST, ARCHIVED`, mais `stepPhase` e `lostReason`. Ou seja,
  **existe forma oficial de listar cards arquivados e de saber se o card foi ganho ou perdido** (`/crm/v2/panel/card?Statuses=ARCHIVED`,
  `IncludeDetails=StepPhase,LostReason`). O Nexo usa a v1 e marca o card que some como `closed` (resultado desconhecido,
  `flwchat-sync.ts:510-533`).

## 3. Limites

- **Taxa (verificado):** "até **1.000 requisições a cada 5 minutos**" e "**200 requisições a cada 5 segundos**", "aplicados por conta e não por
  parceiro"; acima disso `429 – Too Many Requests`. A doc pede "retry com espera (backoff)" e **não fala em `Retry-After`**.
- **Quem trata:** `wts-sync.ts:76-77`, `flwchat-sync.ts:84-87` e `conversas-wts.ts:27-33` usam `fetchComRetry` (429/5xx/rede, espera
  crescente, usa `Retry-After` se vier). Não há ritmo por conta: uma rodada que lê 4 clientes na mesma conta pode chegar perto de 1.000
  pedidos em 5 minutos.
- **Paginação (verificado):** `pageNumber` e `pageSize` "sendo possível no máximo 100"; resposta `{pageNumber, pageSize, totalPages, totalItems,
  hasMorePages, items}`; "é importante manter um pageSize constante enquanto se itera". É por número de página (não cursor): com dado
  mudando, um item pode ser pulado. **Não há cursor nem ordem estável documentada** além de `OrderBy`/`OrderDirection`.
- `GET /core/v1/tag` não tem parâmetros de página na doc (lista simples); o `pageSize: 200` mandado pelo código é ignorado, e o código já
  aceita lista sem página (`flwchat-sync.ts:244-246`).
- Tetos do código: sessões alteradas até `MAX_PAGINAS_MEXIDAS` páginas, **agora com erro registrado** ao bater no teto
  (`wts-sync.ts:363-369`); mensagens até 8 páginas (800); cards até 150 páginas por painel, com erro no teto (`flwchat-sync.ts:457`).

## 4. Token

- **Tipo (verificado):** "token permanente" gerado em `Ajustes > Integrações > Integração via API`, enviado como `Authorization: Bearer
  pn_...`. "Uma vez excluído, todas as integrações que utilizavam esse token deixarão de funcionar." A doc **não cita validade**: não vence
  sozinho, só quando é excluído.
- **Escopo:** **não verificado** se vale para todos os departamentos: a doc não descreve escopo do token (há também o "Token de Parceiro"
  para gestão de contas, que o Nexo não usa).
- Três origens no Nexo: `WTS_API_TOKEN`, `clients.wts_api_token` e `crm_connections.access_token`.
- **Cuidado:** rota errada responde **401 "Acesso negado"**, igual a falta de permissão (comentário do código, não está na doc).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Filtros de data de criação ignorados na v1 (a v2 documenta `CreatedAt.Before/After`) | Sim (pagina do mais novo e corta no código) | `wts-sync.ts:10-16, 313-334` |
| `PageSize` máximo 100 (doc) | Sim (usa 100) | `wts-sync.ts:28`; `flwchat-sync.ts:33` |
| Origem do anúncio em `details.utm` com `clid` e `referralUrl` | **Sim desde 01/11/2026** | `conversas-wts.ts:96-125`; teste `scripts/test-contrato-wts-flwchat.ts` |
| `/chat/v1/session` e `/crm/v1/panel/card` não estão mais na doc (só v2) | **Não** (risco de desligamento sem aviso) | `wts-sync.ts:325, 372`; `flwchat-sync.ts:105` |
| Ordem das mensagens não fixada (o código não manda `OrderBy`): acima de 800 não se sabe quais ficam | **Não** | `conversas-wts.ts:248` |
| Sessão que muda de equipe muda de dono; a cópia antiga fica no outro cliente | **Não** | `wts-sync.ts:294-296` |
| `PENDING` (sem atendente) não é `IN_PROGRESS` | **Não** (somem das abertas) | funções `wts_fila_do_cliente`, `wts_resumo` |
| Card arquivado perde o resultado (a v2 tem `Statuses=ARCHIVED` e `status`) | Parcial (vira `closed`) | `flwchat-sync.ts:510-533` |
| `stepTitle` vem nulo sem `includeDetails=Steps` | Sim (nome vem do painel) | `flwchat-sync.ts:440` |
| Falha ao ler `crm_etapa_resultado` | **Sim** (pula a conexão com erro, não regrava cards) | `flwchat-sync.ts:351-356` |
| Teto de páginas nas sessões alteradas | **Sim** (erro registrado) | `wts-sync.ts:363-369` |
| Limite de 1.000 pedidos/5 min por conta compartilhada entre clientes | **Não** (sem ritmo por conta) | `wts-sync.ts:76` |
| A cliente vê o nome da outra médica que divide a conta | **Não** | `src/lib/fila-whatsapp.ts:47-50` |

## 6. Mudanças anunciadas

A marca agora é **Helena** e o domínio da doc é `api.helena.run`. A doc publica só `/chat/v2/session` e `/crm/v2/panel/card` (as rotas v1
que o Nexo usa seguem respondendo, mas não estão documentadas). Webhooks disponíveis: `SESSION_NEW`, `SESSION_UPDATE`, `SESSION_COMPLETE`,
`MESSAGE_RECEIVED`, `MESSAGE_UPDATED`, `MESSAGE_SENT` (corpo `{eventType, date, content}`), que evitariam reler sessões. Se o domínio
`api.wts.chat` sair, o teste de contrato ao vivo vai acusar falha de rede ou 401.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| antes de 10/2026 | Filtro de data ignorado pela API trazia a base inteira | Paginação do mais novo para o mais velho, corte no código |
| antes de 10/2026 | Etiquetas de uma conta com 24 mil contatos paravam na página 50 e apagavam a origem | Leitura em partes com retomada (`config.tags_varredura`) |
| 30/10/2026 | Descoberto que `UpdatedAt.After` filtra | 2ª passada de sessões alteradas |
| 10/2026 | Sessões trocando de equipe gravadas em duas médicas | Pendente (decisão 2 da auditoria) |
| 01/11/2026 | `clid` e `referralUrl` de `details.utm` não eram lidos como origem do anúncio | `CHAVE_ANUNCIO` e `acharOrigemAnuncio` |

## Teste de contrato

`scripts/test-contrato-wts-flwchat.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_WTS_TOKEN=... [CONTRATO_FLW_PAINEL=<id>]`. Avisa status de
sessão novo (fora de COMPLETED/IN_PROGRESS/PENDING/HIDDEN) e `timeWait` fora de `HH:MM:SS`. Offline confere também o formato
`details.utm` da doc.
