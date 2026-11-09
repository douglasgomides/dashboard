---
phase: 02-log-por-rota
plan: 02
subsystem: analytics
tags: [tanstack-router, supabase, pg_cron, playwright, pglite]

requires:
  - phase: 02-log-por-rota
    provides: "plano 02-01: tabela rota_acessos, instalarRotaLog, montarLinha, deveGravar, ehTabelaAusente, routerDoRotaLog"
provides:
  - "origemDaNavegacao, origemDoClique, criarDeduplicador, decidirPendente e as constantes de tempo em src/lib/rota-log.ts"
  - "instalador ligado ao histórico (REPLACE descarta a tela abandonada), ao clique em captura (data-origem) e registrarBloqueada para os guardas"
  - "data-origem menu/busca em 8 contêineres de menu e na lista do Cmd+K"
  - "public.rota_acessos_limpar() (180 dias) e job rota-acessos-limpeza, no arquivo de migration (o João aplica)"
affects: [02-03 leitura agregada e aba, 03 esconder telas, 14 log ligado]

requirements-completed: [LOG-01, LOG-02, LOG-04]

actuals:
  tokens: 11400
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Linha pendente por ESPERA_ASSENTAR_MS: quem a descarta é o REPLACE recebido síncrono pelo history.subscribe, nunca uma corrida entre setTimeouts"
    - "Origem declarada no DOM (data-origem) e lida por um único listener de clique em captura que deixa um marcador de 10 s"
    - "REPLACE só de query string (?preset=30d) não conta como redirecionamento; só o REPLACE que troca o pathname conta"

key-files:
  created:
    - scripts/test-rota-log.ts
  modified:
    - src/lib/rota-log.ts
    - src/lib/rota-log-instalar.ts
    - src/components/app-shell.tsx
    - src/routes/_authenticated.admin.tsx
    - src/routes/_authenticated.sap.tsx
    - tests/e2e/rota-log.spec.ts
    - supabase/migrations/20261109120000_rota_acessos.sql
    - scripts/test-db-security.ts

key-decisions:
  - "ESPERA_ASSENTAR_MS = 500: o POST de cada abertura sai até 500 ms depois da tela, sem atrasar a navegação. Quem descarta a linha da tela que o app abandonou com replace é o próprio REPLACE (history.subscribe é síncrono dentro do navigate do app); um setTimeout 0 não tem ordem garantida contra a tarefa do Scheduler do React que roda os useEffect. O timer só limita a espera."
  - "Só o REPLACE que troca o pathname entra nas ações de origem. O app faz replace de ?preset=30d na primeira carga de /$clientId; contá-lo marcava a URL canônica digitada como redirecionamento e quebrava a regra da D-10 (descoberto no e2e 1)."
  - "Os redirects do guarda da área logada (src/routes/_authenticated.tsx para /bem-vindo e src/routes/_authenticated.index.tsx para /sem-acesso) não gravam bloqueada: a regra a da D-16 nomeia só os guardas do admin e do SAP; nenhuma lógica muda por isso."

duration: 75min
completed: 2026-11-09
status: complete
plan_head_before: 9c8344db052bb78ee6073e19115fd3fffbfa173a
plan_head_after: b3f695cde761b6a13a0aedfe527a22dbcd714965
---

# Phase 2 Plan 02: origem, dedupe, bloqueada e retenção Summary

**Cada abertura de tela agora diz de onde veio (menu, busca, link, direto, redirecionamento, bloqueada) por histórico do router + marcador de clique em data-origem, sem duplicata de 2 s, com a tela que o app abandona via replace descartada, guardas que gravam bloqueada e limpeza diária de 180 dias.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-11-09
- **Tasks:** 3 (1 TDD, 2 auto)
- **Files modified:** 9 (1 criado, 8 alterados)

## Accomplishments

- Regras puras testadas por tsx (`scripts/test-rota-log.ts`): origem da navegação, clique, dedupe (D-07), decisão da linha pendente (D-16), `deveGravar`, `montarLinha`, `ehTabelaAusente`.
- Instalador: acumula as ações do histórico, marca menu/busca no clique, segura cada linha 500 ms e a descarta quando um REPLACE para outro pathname abandona a tela; dedupe na hora de gravar; `registrarBloqueada` síncrona.
- Menu lateral, barra Áreas, folha Navegar no Nexo, menus do admin e do SAP gravam `menu`; lista do Cmd+K grava `busca`. Guardas do admin e do SAP gravam `bloqueada` antes de negar, com os mesmos destinos de antes.
- e2e: 15 testes passam (6 do 02-01 + 9 novos: menu, busca, bloqueada admin, voltar, POST pendurado, bloqueada SAP, barra Áreas em 375 px, replace do app em duas clínicas).
- Migration: `rota_acessos_limpar()` security definer só para service_role e job `rota-acessos-limpeza` às 06:40 UTC guardado por `pg_available_extensions`; 2 checks novos em `test-db-security` (181 dias sai, 179 fica; authenticated e anon negados com 42501).

## Task Commits

1. **Task 1 RED:** `4417f8f` test(02-02) regras de origem e dedupe
2. **Task 1 GREEN:** `0192d4c` feat(02-02) origem, dedupe e linha pendente
3. **Task 1 ajuste:** `acfb077` fix(02-02) replace só de query string não conta como redirecionamento
4. **Task 3:** `34e42c1` feat(02-02) limpeza de 180 dias
5. **Task 2:** `b3f695c` feat(02-02) menu, Cmd+K e guardas marcam a origem

**Plan metadata:** commit docs(02-02) deste SUMMARY.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] REPLACE de query string contava como redirecionamento**
- **Found during:** Task 2 (e2e 1 do 02-01 depois da troca de regra)
- **Issue:** na primeira carga de `/$clientId` o app faz `replaceState` para `?preset=30d` (mesmo pathname). A regra "qualquer REPLACE vira redirecionamento" rotulava a URL canônica digitada como `redirecionamento`, contra a D-10.
- **Fix:** o instalador guarda o último pathname e só empurra o REPLACE em `acoes` quando o pathname muda. `origemDaNavegacao` ficou como no plano.
- **Files modified:** src/lib/rota-log-instalar.ts
- **Verification:** e2e 1 e os 14 outros passam
- **Commit:** acfb077

**2. [Rule 3 - Blocking] e2e do Cmd+K: "Planejar a semana" leva ao mesmo pathname**
- **Found during:** Task 2
- **Issue:** o resultado usado a partir de `/ideias` não troca o pathname (só a query), então o router não resolve outro pathname.
- **Fix:** o teste parte de `/${CID}`, busca "calendário" e clica no primeiro resultado cujo pathname difere do atual (conferido no href).
- **Files modified:** tests/e2e/rota-log.spec.ts
- **Commit:** b3f695c

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact:** nenhum aumento de escopo.

## Issues Encountered

- **e2e frágil preexistente que o bundle novo derruba:** `navigation-architecture.spec.ts:82` (viewer) passou no base 9c8344d só porque o `expect` pegava o instante em que o papel ainda carregava; `src/lib/nav.ts:451` esconde telas `equipe` de viewer depois. Três atributos `data-origem` em app-shell.tsx deslocam o tempo e o teste passa a falhar de forma determinística (bisseção numa cópia do base). Nenhum item de menu, rótulo ou visibilidade mudou. Detalhes e a lista dos 8 e2e que já falhavam no base estão em `.planning/phases/02-log-por-rota/deferred-items.md`. Não corrigido (fora do escopo; menu é Phase 3).
- `npm run typecheck`: só os erros do baseline (`scripts/test-perfil-da-clinica.ts(385)` e `workers/creative/intelligence.ts`). `npm test`: 170/176, as mesmas 6 do baseline. `npm run lint`: limpo.
- Os guardas do admin e do SAP gravam a linha `bloqueada` para a tela negada, e o destino sai como `redirecionamento` (e2e 9 e 12). A rota índice `/_authenticated/` nunca ganha linha (e2e 9).

## Verification

- `npx tsx scripts/test-rota-log.ts`: ok
- `npx tsx scripts/test-db-security.ts`: ok (89 cenários); `npx tsx scripts/test-migrations.ts`: ok
- `npx playwright test tests/e2e/rota-log.spec.ts`: 15 de 15
- `routes.spec`, `navigation-architecture.spec`, `workspace-navigation.spec`: 182 passam; 9 falham, 8 delas idênticas no base e 1 a do item acima.
- package.json, package-lock.json, nav.ts e sap-navigation.ts iguais ao base; nada novo em api/.

## Threat Flags

Nenhuma superfície nova além do threat model do plano. T-02-09 (limpeza só service_role, search_path fixo), T-02-10 (registrarBloqueada síncrona, com try/catch, destinos dos guardas intactos) e T-02-11 (retenção de 180 dias) cobertos pelos checks e pelos e2e acima.

## Known Stubs

Nenhum.

## User Setup Required

**Ação do João:** aplicar `supabase/migrations/20261109120000_rota_acessos.sql` (agora com a limpeza e o cron; o agente não aplica). O bloco do cron engole qualquer falha com `raise notice`, então depois de aplicar conferir: `select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';` (esperado `40 6 * * *`). Nada foi rodado em banco remoto.

## Next Phase Readiness

- Pronto para 02-03 (RPC de resumo e aba de uso); o arquivo da migration recebe mais um bloco ali.

## Self-Check: PASSED

- Arquivos criados e alterados existem; commits 4417f8f, 0192d4c, acfb077, 34e42c1 e b3f695c estão na branch.
- Critérios de aceite das 3 tasks conferidos por grep e execução.

---
*Phase: 02-log-por-rota*
*Completed: 2026-11-09*
