---
phase: 02-log-por-rota
plan: 03
subsystem: database
tags: [supabase, rpc, rls, pglite, tanstack-router, react-query, playwright]

requires:
  - phase: 02-log-por-rota
    provides: tabela rota_acessos com policy só-admin-lê (02-01) e as seis origens gravadas (02-02)
provides:
  - RPC public.rota_acessos_resumo(p_dias, p_equipe, p_incluir_teste) na migration (arquivo; o João aplica), security invoker, 1..90 dias
  - src/lib/uso-das-telas.ts (folhasDaArvore, rotaLegivel, montarTabela, ROTAS_SO_REDIRECIONAM, PERIODOS)
  - aba "Uso das telas" em /admin/conferencia (componente UsoDasTelas)
affects: [03 esconder telas, 14 log ligado, decisão do SAP sobre telas]

actuals:
  tokens: 21000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Leitura agregada por RPC security invoker: a policy de select só-admin decide quem recebe linhas, a função não abre exceção"
    - "Lista de telas vem da árvore de rotas (routesById), não do banco, para mostrar telas com 0 aberturas"

key-files:
  created:
    - src/lib/uso-das-telas.ts
    - src/components/uso-das-telas.tsx
    - scripts/test-uso-das-telas.ts
    - tests/e2e/uso-das-telas.spec.ts
  modified:
    - supabase/migrations/20261109120000_rota_acessos.sql
    - scripts/test-db-security.ts
    - src/routes/_authenticated.admin.conferencia.tsx
    - tests/e2e/navigation-architecture.spec.ts

key-decisions:
  - "RPC security invoker (sem exceção à policy só-admin): viewer, editor e outsider recebem 0 linhas; anon sem execute"
  - "Período limitado a 1..90 dias no SQL e nulo vale 7; 100 dias atrás nunca entra, 89 entra"
  - "Aba de /admin/conferencia: edição mínima (15 linhas inseridas, 0 removidas); corpo antigo vira ConferenciaDados"

patterns-established:
  - "Tabela da aba usa a classe existente table.t com fonte de 14 px e rolagem dentro do contêiner (375 px sem rolagem na página)"

requirements-completed: [LOG-03]

status: complete
completed: 2026-11-09
plan_head_before: 0e262890a290ca012f5083f6c46aa8372a44b559
plan_head_after: f9fadb7f84bd0e4657e1324c7df4944c5cb7f146
---

# Phase 2 Plan 03: Leitura agregada e aba Uso das telas Summary

**RPC rota_acessos_resumo (security invoker, 1..90 dias, só admin recebe linhas) e a aba "Uso das telas" em /admin/conferencia, com as 81 telas da árvore de rotas, as 6 origens, período 7/30/90 e chave Clínicas × Equipe.**

## Performance

- **Tasks:** 3 mais a correção de teste pedida pelo orquestrador
- **Files modified:** 8 (4 criados, 4 alterados)
- **Commits do plano (medidos, sem contar o deste SUMMARY):** 5

## Accomplishments

- Task 1: função `public.rota_acessos_resumo` acrescentada ao fim da migration (sem mexer no bloco de limpeza); devolve exatamente rota, aberturas, pessoas, ultima, menu, busca, link, direto, redirecionamento, bloqueada (nunca user_id). Dois checks novos em `scripts/test-db-security.ts` (91 cenários) provam: soma das 6 origens = aberturas, pessoas distintas, equipe separada de clínica, clínica de teste fora por padrão e dentro com `p_incluir_teste`, 100 dias fora e 89 dentro, nulo vale 7, viewer/editor/outsider com 0 linhas, anon negado (42501), colunas sem user_id, função invoker. Idempotência da migration continua passando. `test-migrations` verde.
- Task 2 (TDD): RED `ff99e19`, GREEN `f8de767`. 81 folhas (80 de /_authenticated + /sem-acesso), 12 rotas só-redirecionam dentro das folhas, `rotaLegivel`, `montarTabela` com zeros, rota fora da árvore mantida e ordem por aberturas desc e nome.
- Task 3: `UsoDasTelas` (tabela simples, sem gráfico, texto neutro, "Registro ligado desde DD/MM/AAAA", mensagens para tabela ausente e erro de leitura) e abas em /admin/conferencia. e2e: 6 testes da aba verdes; `routes.spec.ts` inteiro verde (175).

## Task Commits

1. **Task 1: RPC rota_acessos_resumo e checks** - `63ebf2d` (feat)
2. **Task 2 RED: teste da lista de telas** - `ff99e19` (test)
3. **Task 2 GREEN: src/lib/uso-das-telas.ts** - `f8de767` (feat)
4. **Task 3: aba Uso das telas e e2e** - `cf7a9ad` (feat)
5. **Correção de teste (orquestrador): navigation-architecture viewer** - `f9fadb7` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Grant de colunas de clients resetado no meio do test-db-security**
- **Found during:** Task 1 (check novo da RPC)
- **Issue:** os checks anteriores reaplicam `20261022170000_reconcile_hosted_security.sql`, que refaz o `revoke select` + grant por allowlist em `public.clients` e leva embora o `grant select (eh_teste)` da migration `20261030200000`. Na hora do meu check o admin recebia "permission denied for table clients" ao ler `eh_teste`. Em produção o grant de `eh_teste` continua valendo (as listas do admin já leem a coluna).
- **Fix:** o check repõe `grant select (eh_teste) on public.clients to authenticated` no começo (com comentário), reproduzindo o estado de produção. A RPC não mudou.
- **Files modified:** scripts/test-db-security.ts
- **Commit:** 63ebf2d

**2. [Pedido do orquestrador] Teste frágil navigation-architecture.spec.ts:82 (viewer)**
- **Issue:** o teste esperava ver o link "Guia de organização do CRM" (tela de equipe) para o viewer, mas `src/lib/nav.ts:451` esconde telas de equipe de viewer assim que o papel carrega; só passava ao pegar o instante anterior ao papel. Os atributos `data-origem` da wave 2 deslocaram o tempo e o teste passou a falhar.
- **Fix (só teste, sem mudar comportamento do app):** o teste espera a leitura própria do papel (`client_members` com `client_id` e `user_id`) antes de afirmar, e afirma o estado final: o guia aparece 1 vez para admin e 0 para viewer. Verificado com `--repeat-each 5` (10 de 10).
- **Files modified:** tests/e2e/navigation-architecture.spec.ts
- **Commit:** f9fadb7

**Total deviations:** 2. Sem mudança de escopo nem de lógica do app.

## Notas

- O rótulo "só redireciona" quer dizer que a rota nunca ganha linha por redirecionar (D-16), não que a linha dela fica sempre em zero. Três das 12 ficam sob os guardas do admin e do SAP (`/_authenticated/admin/aquisicao`, `/_authenticated/sap/$clientId/semana` e `/_authenticated/sap/$clientId/passo-a-passo`); uma visita negada a elas ainda aparece na coluna Bloqueada (regra a da D-16). O comentário em `src/lib/uso-das-telas.ts` registra isso.
- `scripts/test-uso-das-telas.ts` lê `src/routeTree.gen.ts`, que é gerado e está no .gitignore. Em checkout limpo é preciso rodar `npm run routes:generate` antes (o `npm run typecheck` já faz isso); o teste avisa com mensagem clara se o arquivo não existir. Atenção para `npm test` isolado em máquina sem o arquivo.
- Verificação: `test-db-security` (91 cenários) e `test-migrations` verdes; `test-uso-das-telas` verde; `uso-das-telas.spec.ts` 6/6; `routes.spec.ts` 175/175; `navigation-architecture.spec.ts:82` 10/10 em repetição. `npm run typecheck` só mostra os erros do baseline (test-perfil-da-clinica.ts(385) e workers/creative/intelligence.ts); eslint limpo nos arquivos tocados. Não rodei a suíte completa (instrução do orquestrador).
- `package.json` e `package-lock.json` intactos; nada em `api/`; STATE.md e ROADMAP.md não tocados.

## Threat Flags

Nenhuma superfície nova além do threat model do plano (T-02-14, T-02-15, T-02-16, T-02-20, T-02-SC): RPC sem colunas de usuário e invoker (checks da Task 1), viewer fora da aba (e2e 6), períodos 7/30/90 e limite 90 no SQL.

## Known Stubs

Nenhum.

## User Setup Required

**Ação do João (fim da fase):** aplicar `supabase/migrations/20261109120000_rota_acessos.sql` (agora inclui a função `rota_acessos_resumo`). Até lá a aba mostra "A tabela do registro ainda não foi criada…". Nada foi rodado em banco remoto.

## Self-Check: PASSED

- Arquivos criados existem: src/lib/uso-das-telas.ts, src/components/uso-das-telas.tsx, scripts/test-uso-das-telas.ts, tests/e2e/uso-das-telas.spec.ts.
- Commits 63ebf2d, ff99e19, f8de767, cf7a9ad e f9fadb7 existem na branch; RED (ff99e19) antes do GREEN (f8de767).

---
*Phase: 02-log-por-rota*
*Completed: 2026-11-09*
