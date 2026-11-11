---
phase: quick-261111-ofr
plan: 01
subsystem: carteira-admin
tags: [carteira, roi, flwchat, instagram, kommo, reservas-do-servidor]
requires:
  - phase: debug carteira-problemas-clientes
    provides: diagnóstico por clínica (defeitos NOSSOS de leitura e critério)
provides:
  - alvo global carteira_avisos (só admin) com último acesso agregado e reservas ausentes pelo nome
  - cartão "Médico não entra" (14 dias) e fato neutro "sem acesso criado"
  - "Sem ROI calculável" em três grupos (cliente, equipe, não se aplica) e regra 0/0
  - fechados do FlwChat conferidos na v2 (won/lost)
  - botão Sincronizar do Instagram sem a reserva global META_ACCESS_TOKEN
  - helper lerUsoDeReservas + avisosDeReserva pronto para o /readyz da VPS
affects: [vps/producao /readyz, Saúde das fontes (erro do Kommo), vendas do FlwChat]
tech-stack:
  added: []
  patterns:
    - "função de aviso recebe só o predicado temVariavel, nunca o env (valor não tem como sair)"
    - "presença de token filtrada no banco (is.null, eq., not is null); coluna do token nunca entra em select"
    - "v2 do FlwChat como conferência dos closed, nunca como listagem dos abertos"
key-files:
  created:
    - src/lib/carteira-alertas.ts
    - api/_lib/avisos-da-carteira.ts
    - scripts/test-carteira-alertas.ts
  modified:
    - api/_lib/request-validation.ts
    - api/sync/manual.ts
    - api/sync/kommo-leads.ts
    - api/_lib/flwchat-sync.ts
    - src/lib/admin-data.ts
    - src/lib/roi.ts
    - src/routes/_authenticated.admin.index.tsx
    - docs/apis/wts-flwchat.md
    - scripts/test-roi.ts
    - scripts/test-flwchat-fechados.ts
    - tests/e2e/admin-dados.ts
    - tests/e2e/admin-painel.spec.ts
key-decisions:
  - "Tela segue com 6 cartões: o alerta real (não entra) fica no valor e o fato neutro (sem acesso criado) na nota"
  - "Precedência equipe > cliente em grupoSemRoi: sem fonte ou etapa, o dado do cliente nem pode ser lido"
  - "fechados_v2_em é gravado também quando a v2 falha, para erro persistente não martelar a API (uma tentativa a cada 6 h por conexão)"
  - "Falha da v2 vira aviso (avisos), nunca erro, para a fonte não ficar vermelha por causa da tentativa"
requirements-completed: [QUICK-261111-ofr]
status: complete
duration: ~2h (maior parte esperando tsc e build na máquina fraca)
completed: 2026-11-11
commits: 6
plan_head_before: dcfc10c6f4f2750994b9d76250c976a6834b7266
plan_head_after: ca119dfd6f1b5524e45026947abf3584d9b83155
actuals:
  tokens: 60000
  tasks: 3
  commits: 6
---

# Quick 261111-ofr: Carteira com alertas honestos e leituras corrigidas

**Cartão de login passa a separar "não entra há mais de 14 dias" (Lana) de "sem acesso criado" (16, tarefa da equipe), "Sem ROI calculável" separa cliente, equipe e não se aplica, e três leituras nossas deixam de mentir (FlwChat closed, Instagram sem reserva, Kommo sem reserva).**

## O que foi entregue

### Task 1 (tracer): acesso do médico de ponta a ponta
- `src/lib/carteira-alertas.ts` (puro, import relativo `.js`): `DIAS_SEM_ENTRAR = 14`, `entraNaCarteira`, `agruparAcessos`, `fatoDeAcesso`, `avisosDeReserva` e os tipos.
- `api/_lib/avisos-da-carteira.ts`: `lerAvisosDaCarteira` (último acesso via `getUserById`, lotes de 10, guarda só `last_sign_in_at` e `created_at`) e `lerUsoDeReservas` (contagens filtradas no banco, sem coluna de token em select).
- Alvo `carteira_avisos` no enum, na exceção do `client_id` e no `alvoGlobal` de `api/sync/manual.ts`, com o ramo ANTES da conferência. Quem não é admin recebe 403 pelo ramo que já existia.
- `getAvisosDaCarteira` em `src/lib/admin-data.ts`.
- Carteira: cartão "Médico não entra" (valor = quem tem acesso e não entra há mais de 14 dias; nota = "sem acesso criado (a equipe cria)"), filtros "Não entra" e "Sem acesso criado", chips por linha ("Não entra há N dias" em atenção, "Sem acesso criado · dar acesso" em neutro) e alerta curto da reserva ausente pelo nome. Inativa e negócio próprio ficam fora das duas contas.
- Com os dados de produção do debug o retrato dá 1 (Lana, 37 dias) e 16 sem acesso criado (teste unitário com fixture de 20 clínicas).

### Task 2: "Sem ROI calculável" em três grupos
- `roi.ts`: regra 0/0 (sem venda, valor e canal não travam; sem lead, origem não trava), `Roi.motivoFinal`, `GrupoSemRoi`, `ITENS_DA_EQUIPE`, `ITENS_DO_CLIENTE`, `ROTULO_GRUPO_SEM_ROI`, `grupoSemRoi`.
- Cartão: valor = cliente + equipe; nota = "N cliente (CRM) · N equipe (fonte ou etapa) · N não se aplica"; tooltip com os três rótulos; filtro e chip "Sem ROI" só com cliente e equipe; title da célula do ROI traz o grupo.
- 0 vendas agora diz a verdade ("nenhuma venda foi ganha no período") em vez de "falta: preencher o valor".

### Task 3: leituras honestas
- FlwChat: `idsComSituacao`, `reclassificarFechados`, `deveConferirFechadosV2`, `FECHADOS_V2_INTERVALO_MS` (6 h) e `fetchIdsV2` (`/crm/v2/panel/card` com `Statuses=WON`, depois `Statuses=LOST`, teto de 30 páginas, prazo da rodada). Só `closed` muda (`eq("outcome","closed")`). `cards_por_item` fica fora. Falha da v2 vira aviso.
- Botão Sincronizar do Instagram pela Graph: tira o throw de `META_ACCESS_TOKEN`; lê quais perfis têm token próprio (só o id, nunca a coluna do token); perfil sem token e sem reserva ganha erro próprio e os outros seguem.
- Erro do Kommo (2 pontos em `api/sync/kommo-leads.ts`): "Conexão sem token Kommo próprio, e o servidor não tem a reserva KOMMO_API_TOKEN".
- `docs/apis/wts-flwchat.md` registra a conferência v2 e a pendência de conferir ao vivo.

## Handoff para vps/producao (/readyz)

`server/vps.ts` só existe em `origin/vps/producao`, não em `gsd/nexo-v5`. No merge para essa branch, o orquestrador:

1. Importa `lerUsoDeReservas` de `"../api/_lib/avisos-da-carteira.js"` e `avisosDeReserva` de `"../src/lib/carteira-alertas.js"`.
2. No ramo `/readyz` (`server/vps.ts:99-100`), mantém `ready` pelas 3 variáveis essenciais.
3. Acrescenta o campo `avisos` (lista de `{ variavel, conexoes, texto }`). Ele vem de uma leitura com `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`, com cache de 5 min e timeout de 1,5 s; o erro vira `avisos: null`.
4. Deixa o status igual: 200 quando `ready`, 503 só pelas variáveis essenciais (T-ofr-06).

Exemplo de ligação (a ajustar ao arquivo real):

```ts
const temVariavel = (n: string) => !!process.env[n]?.trim();
const uso = await Promise.race([lerUsoDeReservas(admin), timeout(1500)]); // cache de 5 min por fora
const avisos = avisosDeReserva(uso, temVariavel); // só nome e contagem, nunca o valor
```

## A confirmar ao vivo

- **Filtro `Statuses` da v2 do FlwChat.** Está confirmado só pela doc (`docs/apis/wts-flwchat.md:51-54`). Antes de confiar nas vendas da Juliana Paola, da Marcella e da Mariela, rodar o teste de contrato (`CONTRATO_AO_VIVO=1 CONTRATO_WTS_TOKEN=... CONTRATO_FLW_PAINEL=<id> node --import tsx scripts/test-contrato-wts-flwchat.ts`) ou conferir na produção (SELECT) se `closed` virou `won` depois da próxima rodada.
- Se a v2 devolver card aberto com o filtro, o código ignora (o status tem de ser igual ao pedido), então o pior caso é nada mudar, nunca um card aberto virar venda.

## Deferido (fora deste plano)

- Planilha semanal fica vermelha com 10 dias, não 4 (`status-fonte.ts:126-130` x `saude-problemas.ts:105-111`).
- O ROI somar o gasto da planilha (`ads_planilha_semanal.valor_periodo`) em `roi_periodo_calc`. Exige SQL ou migration, que esta tarefa não pode fazer (Marcelly e Mariela).
- Limpeza do `.env.example` (SHORTIO_DOMAIN, SYNC_DAYS) e dos textos "na Vercel" (`anuncios-acoes.ts:51`, `agentes-ia.tsx:251`, `manual.ts:1062`, `meta-graph-sync.ts:845`).
- Sergio Maia: "venda por pessoa vs card" (unidade de contagem do ROI). A conexão `cards_por_item` ficou fora de propósito.
- FlwChat: card ganho que nunca apareceu aberto (inserir pela v2) e preço (`monetaryAmount`) do card que virou won. Ficam para depois da conferência ao vivo.
- Usuário que não é admin e está em várias clínicas (Q1b) conta como acesso da clínica. Também falta o conceito de "login previsto", porque o João decide quem ganha login no v5.
- Fora do dev: o UPDATE do token Kommo da Lana (João) e o secret v2 da VPS com a SHORTIO_API_KEY (ops, com o aval do João).

## Verificação

| Gate | Resultado |
| --- | --- |
| `test-carteira-alertas` | ok |
| `test-roi` | ok |
| `test-api-security` | ok |
| `test-flwchat-fechados`, `-reconciliacao`, `-substituidos`, `test-contrato-wts-flwchat` | ok |
| `npx tsc --noEmit` fora dos 2 arquivos conhecidos | 0 erros |
| build com variáveis falsas | ok |
| e2e `admin-painel.spec.ts -g Carteira` (375 e 1440, `--workers=1`) | 2 passed |
| `npm test` | só as 6 falhas conhecidas (creative-discovery, creative-theme, kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta); nao-medido e tela-honesta falham por trecho de migração, sem relação com esta tarefa |
| diff de `package.json`, `package-lock.json`, migrations, SAP | vazio |

Ordem TDD nos commits: o teste vermelho de cada tarefa foi commitado antes da implementação (`33ccd0c`, `d7af24f`, `aa04639`). Vermelho de `test-carteira-alertas` e de `test-roi` foi visto rodando. Para o de `test-flwchat-fechados`, o vermelho está no histórico (o commit `aa04639` não tem os exports, que entram em `ca119df`), mas não rodei esse teste isolado antes de implementar.

## Commits

- `33ccd0c` test: casos de acesso do médico e avisos de reserva (vermelho)
- `03b5529` feat: Carteira mostra médico que não entra e reserva que falta (Task 1)
- `d7af24f` test: grupos do Sem ROI calculável e regra 0/0 (vermelho)
- `231bc18` feat: Sem ROI calculável separa cliente, equipe e não se aplica (Task 2)
- `aa04639` test: fechados do FlwChat conferidos na v2 (vermelho)
- `ca119df` feat: fechados do FlwChat pela v2, Instagram sem reserva global, erro do Kommo (Task 3)

## Deviations from Plan

Nenhuma de regra 1 a 4. Detalhes de implementação que a plan deixava livres:

- **Cartão em erro.** Com a leitura do servidor em erro o valor é "–" e o tom neutro (como o plano pede); com o `isError` o filtro "Não entra" fica sem contagem.
- **`semAcesso` independe do servidor.** O número "sem acesso criado" só precisa de `client_members`, então aparece mesmo se a leitura do `carteira_avisos` falhar. O "não entra" precisa dos dois.
- **Spec e2e.** O bloco novo ficou antes da busca "sorriso" (e não no fim), para não herdar o texto da busca; o cartão é o próprio botão `.adm-cont`, então o clique usa `getByRole("button", { name: /^Médico não entra/ })`.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum além do modelo do plano. O alvo `carteira_avisos` (T-ofr-02) está em `alvoGlobal` (403 para não admin) e devolve só `client_id`, `usuarios`, `ultimo_acesso`, `criado_em`; `avisosDeReserva` só recebe o predicado (T-ofr-01); `avisos-da-carteira.ts` e o pré-check do Instagram não põem token em select (T-ofr-03); só `closed` muda e a v2 tem teto, pausa de 6 h e prazo (T-ofr-04, T-ofr-05).

## Self-Check: PASSED

Os 3 arquivos criados existem e os 6 commits (`33ccd0c`, `03b5529`, `d7af24f`, `231bc18`, `aa04639`, `ca119df`) são ancestrais do HEAD do worktree.
