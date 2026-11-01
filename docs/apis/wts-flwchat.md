# WTS Chat / FlwChat (Helena)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** A plataforma WTS (hoje chamada "Helena") atende o WhatsApp de 4 clientes e os painéis de vendas (FlwChat). **Não há doc
oficial encontrada**: as regras abaixo vêm de testes feitos pela equipe contra a conta real e estão nos comentários do código.
Riscos: sessões "aguardando" somem das abertas, sessão que troca de equipe fica em duas médicas, card arquivado perde o resultado.

## 1. O que usamos

- **Versão:** rotas `/chat/v1`, `/core/v1`, `/crm/v1`, sem cabeçalho de versão. Base única `https://api.wts.chat`.
- **Doc oficial:** **não encontrada.** `helena.readme.io` e `frontend-f26.pages.dev` não abriram (fora da rede liberada); a busca só achou
  pacotes da comunidade para n8n apontando `api-test.helena.run`. Tudo campo a campo é **não verificado**.

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /core/v1/department` | equipes | `id, name` | `wts-sync.ts:99-118` |
| `GET /core/v1/agent` | atendentes | `userId` (a sessão aponta para `userId`, não `id`), `name, email, profile` | `wts-sync.ts:120-139` |
| `GET /chat/v1/session?PageSize=100&PageNumber=N&OrderBy=createdat&OrderDirection=DESCENDING` (+ 2ª passada `UpdatedAt.After`) | sessões de atendimento | `id, createdAt, startAt, endAt, status, departmentId, userId, channelId, contactId, timeWait, timeService ("HH:MM:SS"), firstResponseAt`; `{items, hasMorePages}` | `wts-sync.ts:313-358` |
| `GET /chat/v1/session/{id}/message?PageSize=100&PageNumber=N` (até 8 páginas) | mensagens | `id, timestamp/createdAt, direction (FROM_HUB = paciente, TO_HUB = clínica), type, origin, text, details.transcription` | `conversas-wts.ts:39-49, 249-250` |
| `GET /core/v1/contact/{id}` | telefone e nome | `phoneNumber, name/nameWhatsapp, email, instagram` | `conversas-wts.ts:198-199` |
| `GET /crm/v1/panel/{id}?includeDetails=Steps` | painel e etapas | `title, steps[].id/title` | `flwchat-sync.ts:433` |
| `GET /crm/v1/panel/card?panelId&pageSize=100&pageNumber` | cards de venda | `id, title, stepId, monetaryAmount, createdAt, updatedAt, customFields['origem-do-lead'], description, contactIds`, `sessionId`, `number`; `{items, hasMorePages}` | `flwchat-sync.ts:104-106` |
| `GET /core/v1/tag?pageSize=200` e `GET /core/v1/contact?IncludeDetails=Tags&orderBy&orderDirection` | etiquetas dos contatos | `items[].id/name`; `items[].id, tagIds, updatedAt`, `totalPages` | `flwchat-sync.ts:243, 397` |

## 2. Significado de cada número

- **"Espera até a 1ª resposta":** mediana de `timeWait`, só nas sessões com o dado. O significado oficial é **não verificado**. Medido no
  banco: `timeWait` é sempre ≤ (`firstResponseAt` − `startAt`); provavelmente conta a partir da entrada na fila da equipe, não da
  mensagem do paciente. Cobertura baixa em alguns clientes (85 de 861 sessões num deles).
- **"Tempo até fechar":** mediana de `timeService` (a tela já avisa que não é tempo de atendimento).
- **Abertas / em andamento:** só status `IN_PROGRESS`. `PENDING` (sem atendente, sem fim) e `HIDDEN` ficam fora de tudo.
- **Dia e janela:** `America/Sao_Paulo`.
- **Cards:** ganho/perdido vem do nome da etapa (`config.etapas_ganho/perdido`) ou do mapeamento da equipe. `closed` = o card sumiu da
  lista (arquivado), resultado desconhecido. Em dois clientes, "ganho" quer dizer agendamento.

## 3. Limites

- **Taxa:** **não documentada** e não verificada. Só `conversas-wts.ts:26-37` trata 429 (3 tentativas, espera curta, sem `Retry-After`).
  `wts-sync.ts` e `flwchat-sync.ts` não tratam: um pico derruba a rodada daquela conta.
- **Paginação por número de página** (não cursor): se algo muda no meio, um item pode ser pulado. Sessões até 400 páginas; sessões
  alteradas até 20 páginas **sem avisar quando sobra** (`wts-sync.ts:352-358`); mensagens até 8 páginas (800), acima disso "parcial";
  cards até 150 páginas por painel; etiquetas até 120 páginas com retomada (`config.tags_varredura`).
- **`PageSize` > 100 dá erro 500** (não 400), segundo o comentário do código.

## 4. Token

- **Tipo:** token permanente `pn_` (Ajustes > Integrações > Integração via API), em `Bearer`. Três origens: `WTS_API_TOKEN` (servidor),
  `clients.wts_api_token` (por conta, não legível por usuário comum) e `crm_connections.access_token` (FlwChat; RLS limita a admin).
- **Validade e escopo:** **não verificados**.
- **Cuidado:** rota errada responde **401 "Acesso negado"**, igual a falta de permissão: um 401 não prova que o token venceu.
- **Quem renova:** administrador da conta WTS gera outro token e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Filtros de data de criação são aceitos e ignorados (só `UpdatedAt.After`, `Status` e `DepartmentId` filtram) | Sim (pagina do mais novo e corta no código) | `wts-sync.ts:10-16, 313-334` |
| `PageSize` > 100 dá 500 | Sim (usa 100; etiquetas usam 200 e funcionam) | `wts-sync.ts:27`; `flwchat-sync.ts:242` |
| Rota inexistente responde 401 | Parcial (comentário avisa; erro não separa) | `wts-sync.ts:19-21, 83` |
| Duração acima de 24 h no formato .NET `d.hh:mm:ss` | Sim (a API manda horas acumuladas; 0 casos) | `wts-sync.ts:90-97` |
| Sessão que muda de equipe muda de dono; a cópia antiga fica no outro cliente | **Não** | `wts-sync.ts:294-296` |
| `PENDING` (aguardando sem atendente) não é `IN_PROGRESS` | **Não** (somem das abertas) | funções `wts_fila_do_cliente`, `wts_resumo` |
| Listagem de cards só traz não arquivados; resultado do arquivado não vem | Parcial (vira `closed`) | `flwchat-sync.ts:504-533` |
| `stepTitle` vem nulo sem `includeDetails=Steps` | Sim (nome vem do painel) | `flwchat-sync.ts:433` |
| Se a leitura de `crm_etapa_resultado` falhar, ganhos viram "aberto" e o sync diz sucesso | **Não** (erro engolido) | `flwchat-sync.ts:346-352` |
| Paginação por página com dado mudando pode pular itens | Não verificado | `flwchat-sync.ts:95-99` |
| Teto de 20 páginas nas sessões alteradas sem aviso | **Não** | `wts-sync.ts:352-358` |
| A cliente vê o nome da outra médica que divide a conta | **Não** | `src/lib/fila-whatsapp.ts:47-50` |

## 6. Mudanças anunciadas

Nenhuma confirmada. Há sinal de troca de marca para "Helena" (pacote da comunidade com `api-test.helena.run`), sem data. Se o domínio
mudar de `api.wts.chat`, o teste de contrato ao vivo vai acusar falha de rede ou 401.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| antes de 10/2026 | Filtro de data ignorado pela API trazia a base inteira | Paginação do mais novo para o mais velho, corte no código |
| antes de 10/2026 | Etiquetas de uma conta com 24 mil contatos paravam na página 50 e apagavam a origem | Leitura em partes com retomada (`config.tags_varredura`) |
| 30/10/2026 | Descoberto que `UpdatedAt.After` filtra | 2ª passada de sessões alteradas |
| 10/2026 | Sessões trocando de equipe gravadas em duas médicas | Pendente (decisão 2 da auditoria) |

## Teste de contrato

`scripts/test-contrato-wts-flwchat.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_WTS_TOKEN=... [CONTRATO_FLW_PAINEL=<id>]`. Avisa status de
sessão novo (fora de COMPLETED/IN_PROGRESS/PENDING/HIDDEN) e `timeWait` fora de `HH:MM:SS`.
