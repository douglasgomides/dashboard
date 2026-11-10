---
phase: 02-log-por-rota
plan: 01
subsystem: database
tags: [supabase, rls, pglite, tanstack-router, playwright, postgrest]

requires:
  - phase: 01
    provides: conferência de dados (admin.conferencia) onde a aba de uso entra no plano 02-03
provides:
  - tabela public.rota_acessos (arquivo de migration; o João aplica) com CHECKs, índices, RLS e gatilho que força user_id, eh_equipe e papel
  - Wave 0 (CD-07): test:migrations e test-db-security voltam a rodar no banco de teste
  - src/lib/rota-log.ts (regras puras) e src/lib/rota-log-instalar.ts (gancho no router) instalados em main.tsx
  - e2e do caminho navegador -> POST /rest/v1/rota_acessos
affects: [02-02 origem e retenção, 02-03 leitura agregada e aba, 03 esconder telas, 14 log ligado]

actuals:
  tokens: 23000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Gravação fora do caminho da navegação: listener onResolved síncrono, setTimeout 0, await do insert só no callback, disjuntor por sessão"
    - "Campos de auditoria derivados por gatilho BEFORE INSERT, nunca enviados pelo navegador"
    - "Chave de ligar do e2e só lida quando VITE_SUPABASE_URL do bundle é o Supabase falso"

key-files:
  created:
    - supabase/migrations/20261109120000_rota_acessos.sql
    - src/lib/rota-log.ts
    - src/lib/rota-log-instalar.ts
    - tests/e2e/rota-log.spec.ts
  modified:
    - supabase/migrations/20261106130000_resultados_diarios.sql
    - supabase/audits/preflight.sql
    - scripts/test-db-security.ts
    - src/main.tsx

key-decisions:
  - "Task 1 (D-01, forma da tabela): resposta humana direta do João, 'recomendada', em 09/11/2026"
  - "revoke all da tabela inclui authenticated: o default privilege do Supabase concede tudo a authenticated, então só revogar public e anon deixava UPDATE e DELETE abertos"
  - "Gatilho rota_acessos_preencher mantido como invoker (conforme o plano); leu client_members sem problema no teste"

patterns-established:
  - "Rota gravada é o routeId do router, com 4 chaves exatas (client_id, rota, origem, sessao); CHECK no banco repete a regra"
  - "Migrations novas: revoke all from public, anon, authenticated antes do grant mínimo"

requirements-completed: [LOG-01, LOG-02, LOG-03, LOG-04]

coverage:
  - id: D1
    description: "Tabela rota_acessos aceita a linha do caminho único; gatilho força user_id, eh_equipe e papel; RLS barra clínica alheia e leitura por não-admin; CHECK barra query string, hash, URL e UUID; migration roda duas vezes sem erro"
    requirement: "LOG-01"
    verification:
      - kind: integration
        ref: "scripts/test-db-security.ts#rota_acessos (8 checks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Abrir uma tela logada envia um único POST com só client_id, rota, origem e sessao; query string e hash nunca saem; sem chave nada é enviado; falha 500 e tabela inexistente não travam a tela"
    requirement: "LOG-04"
    verification:
      - kind: e2e
        ref: "tests/e2e/rota-log.spec.ts (6 testes)"
        status: pass
      - kind: unit
        ref: "deveGravar via tsx (preview, local e hosts de produção)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Origens menu, busca e redirecionamento, dedupe, retenção, leitura agregada e a aba pertencem aos planos 02-02 e 02-03; este plano só entrega direto e link"
    requirement: "LOG-02"
    verification: []
    human_judgment: true
    rationale: "LOG-02 e LOG-03 só ficam completos com os planos 02-02 e 02-03; aqui cobrem apenas a base (origem direto/link e o CHECK das seis origens)"

duration: 55min
completed: 2026-11-09
status: complete
plan_head_before: 384bee7f4d14e08281ca9eb1bc58268c8bac87c8
plan_head_after: 8a1b808
---

# Phase 2 Plan 01: Log por rota, fatia traçadora Summary

**Abrir uma tela do Nexo grava uma linha em rota_acessos (navegador -> router.subscribe onResolved -> POST do supabase-js -> RLS + gatilho), provada no banco de teste PGlite e em e2e, sem nunca esperar a gravação nem levar a URL.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-11-09T19:40:00Z (aprox.)
- **Completed:** 2026-11-09T20:36:11Z
- **Tasks:** 3 (1 checkpoint de decisão já respondido, 1 auto, 1 traçadora)
- **Files modified:** 8 (4 criados, 4 alterados)

## Accomplishments

- Wave 0 (CD-07): o bloco do cron de `20261106130000_resultados_diarios.sql` ganhou a guarda `pg_available_extensions`; `npm run test:migrations` e `npx tsx scripts/test-db-security.ts` voltaram a passar.
- Migration `20261109120000_rota_acessos.sql` (só arquivo, o João aplica): tabela, CHECKs, três índices (CD-09), RLS insere-o-próprio / só-admin-lê e gatilho `rota_acessos_preencher`.
- 8 checks `rota_acessos:` em `scripts/test-db-security.ts` provam o contrato do banco (forja sobrescrita, admin sem membro, clínica alheia 42501, CHECK 23514, leitura só admin, privilégios, anon, idempotência).
- Módulo puro `rota-log.ts` e instalador `rota-log-instalar.ts` ligados em `main.tsx` antes do primeiro render; 6 testes e2e passam.

## Respostas e decisões do dono

- **Task 1 (checkpoint:decision, forma de public.rota_acessos):** resposta humana direta do João, "recomendada", em 09/11/2026. Não foi seleção automática. Opção recomendada: gatilho preenche user_id/eh_equipe/papel, papel anulável, client_id `on delete set null`, CHECKs.

## Task Commits

1. **Task 1: forma da tabela (decisão)** - sem commit (resposta registrada aqui)
2. **Task 2 / Wave 0: guarda do cron** - `704583d` (fix)
3. **Task 2: tabela, RLS, gatilho e checks** - `5c24753` (feat)
4. **Task 3: gancho no navegador e e2e** - `8a1b808` (feat)

**Plan metadata:** commit docs(02-01) deste SUMMARY.

## Files Created/Modified

- `supabase/migrations/20261109120000_rota_acessos.sql` - tabela, índices, RLS, gatilho (novo)
- `supabase/migrations/20261106130000_resultados_diarios.sql` - cron guardado por pg_available_extensions
- `supabase/audits/preflight.sql` - manifesto atualizado para 217 arquivos, 213 versões, última 20261109120000
- `scripts/test-db-security.ts` - 8 checks `rota_acessos:` antes do check final de anon
- `src/lib/rota-log.ts` - regras puras (Origem, deveGravar, montarLinha, ehTabelaAusente, hosts)
- `src/lib/rota-log-instalar.ts` - instalarRotaLog(router), disjuntor, sessão por aba
- `src/main.tsx` - `instalarRotaLog(router)` depois de `getRouter()`
- `tests/e2e/rota-log.spec.ts` - 6 testes do caminho

## Baseline e Wave 0

- Baseline em HEAD 384bee7 (que contém o 8f719b4 do plano): `npx tsx scripts/test-migrations.ts` falhava (relation cron.job does not exist), e com isso `test-db-security.ts` também não rodava.
- Commit do Wave 0: **`704583d`** `fix(02-01): guarda o cron de resultados_diarios para o banco de teste`.
- **Aviso sobre `20261106130000_resultados_diarios.sql`:** o arquivo já estava aplicado em produção e foi editado. O conteúdo agora diverge do que rodou. O rastreio por nome em `public._migracoes_repo` (scripts/banco/aplicar.sh) segura a reexecução. **Ninguém deve rodar este arquivo de novo, nem em produção nem no homolog.** Nenhum passo deste plano rodou nada remoto.

## Decisions Made

- `revoke all on table public.rota_acessos from public, anon, authenticated` (o plano dizia só public e anon): o check de privilégios achou UPDATE e DELETE abertos para authenticated, porque o default privilege concede tudo a authenticated em tabela nova (no harness e no Supabase). Sem isso a prohibition LOG-01 seria violada em produção.
- Gatilho mantido invoker, com `revoke all ... from public, anon, authenticated` na função; o gatilho funcionou sem EXECUTE para quem insere.
- `routerDoRotaLog()` exportado como acessor do router guardado (o plano 02-02 usa).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] authenticated herdava UPDATE/DELETE na tabela nova**
- **Found during:** Task 2 (check de privilégios)
- **Issue:** `revoke all ... from public, anon` não remove o grant que o default privilege dá a authenticated; has_table_privilege devolveu true para UPDATE e DELETE.
- **Fix:** incluir `authenticated` no revoke antes do `grant select, insert`.
- **Files modified:** supabase/migrations/20261109120000_rota_acessos.sql
- **Verification:** check "rota_acessos: authenticated só tem SELECT e INSERT" passa.
- **Committed in:** 5c24753

**2. [Rule 3 - Blocking] Manifesto de preflight.sql defasado**
- **Found during:** Task 2 (test-db-security, check "preflight e contagens legadas")
- **Issue:** `supabase/audits/preflight.sql` tinha 214 arquivos / 210 versões fixos; o repositório já tinha 216 antes desta fase (defasagem anterior, escondida pela falha do cron) e 217 com a migration nova. O comentário do próprio arquivo manda atualizar o manifesto ao adicionar arquivos.
- **Fix:** 217 arquivos, 213 versões distintas, última versão 20261109120000.
- **Files modified:** supabase/audits/preflight.sql
- **Verification:** test-db-security passa (87 cenários).
- **Committed in:** 5c24753

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** ambas necessárias para correção/segurança e para os testes de banco ficarem verdes. Sem aumento de escopo.

## Issues Encountered

- `npm run typecheck` sai com erro por problemas que já existiam e não tocam esta fatia: `scripts/test-perfil-da-clinica.ts(385,16) TS2532` e `workers/creative/intelligence.ts` (módulos `@ai-sdk/openai` e `ai` ausentes, TS7006). Nenhum erro em `rota-log*`, `main.tsx` ou no spec (conferido com tsc filtrado). Fora do escopo; não corrigido. Vale o orquestrador/João saber, porque o critério "typecheck verde" do plano não é atingível sem tratar isso (possivelmente workers/ tem dependências próprias e o `npm ci` na raiz não as instala).
- Os testes de e2e rodam o build completo (npm run build) pelo webServer; ~46 s.

## Threat Flags

Nenhuma superfície nova além do threat model do plano (T-02-01 a T-02-08, T-02-22, T-02-SC): todas mitigadas pelos checks e pelo e2e acima.

## Known Stubs

Nenhum. A regra de origem (`direto` na primeira, `link` nas demais) é intencional nesta fatia e é trocada no plano 02-02.

## User Setup Required

**Ação do João:** aplicar `supabase/migrations/20261109120000_rota_acessos.sql` (o agente não aplica). Até lá o insert falha em silêncio e o disjuntor para de tentar na aba (CD-08). Nada foi rodado em banco remoto.

## Next Phase Readiness

- Pronto para 02-02 (origem real, dedupe, retenção de 180 dias, `registrarBloqueada`) e 02-03 (RPC de resumo e aba).
- Pendência: typecheck vermelho preexistente (acima).

## Self-Check: PASSED

- Arquivos criados existem (migration, rota-log.ts, rota-log-instalar.ts, rota-log.spec.ts).
- Commits 704583d, 5c24753 e 8a1b808 existem na branch.
- test-migrations, test-db-security (87 cenários), deveGravar via tsx e rota-log.spec.ts (6 de 6) passam; package.json e package-lock.json iguais ao base; nada novo em api/.

---
*Phase: 02-log-por-rota*
*Completed: 2026-11-09*
