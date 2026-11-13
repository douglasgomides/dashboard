---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 01
subsystem: navegação da equipe
status: complete
tags: [menu, busca, registro-de-telas, rota-log, tokens]
requires:
  - "Phase 2: src/lib/uso-das-telas.ts (folhasDaArvore, ROTAS_SO_REDIRECIONAM), rota-log-instalar (data-origem)"
provides:
  - "src/lib/registro-de-telas.ts: REGISTRO_DE_TELAS (87), ROTULOS_MENU_EQUIPE, ROTAS_DE_ACESSO_FORA_DA_ARVORE, ehEquipe, indiceDaBusca, buscarTelasEquipe, linkDaTela"
  - "src/components/busca-de-telas.tsx: BuscaDeTelas (props fontes? e onSemClinica? já declaradas)"
  - "src/styles/nexo-system.css: bloco de tokens Cobalto"
  - "scripts/test-registro-de-telas.ts no npm test"
  - "tests/e2e/menu-equipe.spec.ts (tracer)"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "registro único: menu, busca e teste leem as mesmas linhas"
    - "árvore do roteador lida por texto de routeTree.gen.ts, sem importar rotas"
key-files:
  created:
    - src/lib/registro-de-telas.ts
    - src/components/busca-de-telas.tsx
    - src/styles/nexo-system.css
    - scripts/test-registro-de-telas.ts
    - tests/e2e/menu-equipe.spec.ts
  modified:
    - src/components/app-shell.tsx
    - src/main.tsx
decisions:
  - "Rótulos e descrições do registro vêm de nav.ts (AREAS/AVANCADO) e sap-navigation.ts (ITENS) por busca de caminho; daNav/daSap lançam erro se a aba sumir"
  - "As rotas de acesso e /qa/layout recebem área 'Administração' só para o tipo fechar; elas nunca aparecem na busca de produção"
  - "--text e --control-border já existiam (product-workspace.css) e entram no bloco do 03-01 porque a lista do plano os nomeia e o 03-03 depende de --text = #121212"
metrics:
  duration: "~30 min (continuação, depois da liberação do João)"
  completed: 2026-11-10
actuals:
  tokens: 21000
  tasks: 3
  commits: 2
plan_head_before: 3a52d8a8c54e1e01dc75976b4c9b556df0ff9152
plan_head_after: c56abd4 (HEAD depois dos commits de código; o commit docs deste SUMMARY vem em seguida)
---

# Phase 3 Plan 01: Registro único de telas, busca "Buscar tela" da equipe e log gravando busca

Registro único com 87 linhas (14 vivas, 70 escondidas, 3 tiradas) conferido no CI contra src/routeTree.gen.ts. A equipe (admin do app ou estrategista) usa o novo diálogo "Buscar tela" com o próprio Ctrl+K na casca da clínica. A abertura de uma tela escondida pela busca grava origem `busca` no log da Phase 2. Os tokens Cobalto já resolvem na casca, inclusive com o tema escuro salvo.

## Task 1: portão (Phase 2 mergeada e puxada)

- HEAD do primeiro agente: `724b8788f17319b1a1e288ac78af3943928f7e2d`. Naquele ponto, `git merge-base --is-ancestor origin/claude/doctor-creator-hub-nixvw6 HEAD` saía 1. As árvores de código eram idênticas (`git diff --stat HEAD origin/... -- src tests scripts supabase api package.json` vazio); só faltava a ancestralidade, porque o PR #308 entrou por squash.
- O orquestrador fez o merge da base em gsd/nexo-v5 (`3a52d8a chore: traz a base com a Fase 2 publicada`). **HEAD de partida do código:** `3a52d8a8c54e1e01dc75976b4c9b556df0ff9152`. Checagem de ancestralidade: 0.
- `src/lib/uso-das-telas.ts` exporta `folhasDaArvore` e `ROTAS_SO_REDIRECIONAM`. `02-04-SUMMARY.md` existe.
- **Soma de beforeLoad em src/routes:** 17, igual à linha de base de 1feda71. Continua 17 no fim do plano.
- **Resposta humana:** o João liberou, repassado pelo orquestrador ("sobe logo por favor"). É uma resposta direta dele, não uma seleção automática.
- **Data de início do log:** PENDENTE. Ver o Desvio 1.

## Linha de base antes da primeira edição (Wave 0)

Build de `dist` concluído às 21:29:05. A primeira edição foi às 21:31:34, então a linha de base não foi contaminada.

`npx playwright test` nos 6 specs: **236 passaram e 13 falharam** (todas já falhavam antes do 03-01):

- tests/e2e/navigation-architecture.spec.ts:8 › Marketing opens an orientation page and the weekly planner survives refresh and history at 1440px
- tests/e2e/navigation-architecture.spec.ts:8 › idem at 375px
- tests/e2e/numbers-first.spec.ts:7 › known numbers appear before recommendations even when ROI is incomplete at 1440px
- tests/e2e/numbers-first.spec.ts:7 › idem at 375px
- tests/e2e/numbers-first.spec.ts:60 › ROI uses only acquisition spend, shows the chosen cost label, the confidence badge and the lag note
- tests/e2e/numbers-first.spec.ts:265 › an unclassified content topic is labelled clearly and is not used as a topic performance recommendation
- tests/e2e/numbers-first.spec.ts:274 › content × commercial opens with plain-language conclusions and the next action
- tests/e2e/routes.spec.ts:12 › route /11111111-…/pacientes renders at 1280px
- tests/e2e/workspace-navigation.spec.ts:8 › desktop: task search leads to existing tools and preserves clinic and period
- tests/e2e/workspace-navigation.spec.ts:48 › mobile: every area is reachable through the menu, without horizontal overflow
- tests/e2e/workspace-navigation.spec.ts:137 › home: detailed analyses remain accessible without competing with the first step
- tests/e2e/workspace-navigation.spec.ts:263 › clinic navigation prioritizes the service and preserves detailed analyses at 1440px
- tests/e2e/workspace-navigation.spec.ts:263 › idem at 375px

rota-log.spec.ts: todos os 15 passaram na linha de base.

`npm test`, rodado com o test-registro-de-telas.ts novo já no disco: "172/178 test scripts passed". Tirando o script novo (PASS), a linha de base fica em 171/177. Os FAIL são todos da linha de base: test-creative-discovery, test-creative-theme, test-kommo-closed-at, test-nao-medido, test-status-que-nao-mente e test-tela-honesta.

Observação para os próximos planos: workspace-navigation.spec.ts:8 (admin, Ctrl+K, "O que você quer fazer?") e navigation-architecture já falhavam antes. Com o 03-01, o admin passa a ver "Buscar tela". Atualizar esses specs é trabalho do 03-04 e do 03-06 (RESEARCH, "Specs afetadas").

## O que foi feito

- **Registro (`src/lib/registro-de-telas.ts`):** tem 85 folhas mais os 2 atalhos de /ideias. Os ids vêm de routeTree.gen.ts. Regras aplicadas:
  - `somenteAdmin`: todo /admin/*, os 30 do SAP e as abas com `admin: true`.
  - `congelado`: os 30 do SAP.
  - `semSelo`: as 6 telas nomeadas.
  - `soRedireciona`: igual a `ROTAS_SO_REDIRECIONAM`, os 12 ids.
  - `soDesenvolvimento`: /qa/layout.
  - Rótulos: Carteira usa `ROTULOS_MENU_EQUIPE.carteira`. /ideias fica com "Revisar roteiros". Tiradas: /marketing → /conteudo (D-05) e os 2 atalhos → /ideias.
  - Rótulos novos: analisar ("Papel de cada funil"), automacoes, consultas, vendas, assistentes-ia, sap/formulario e os redirects.
- **`BuscaDeTelas`:** BottomSheet com título "Buscar tela" e `origem="busca"`, textos do UI-SPEC e `nav` de resultados com `data-origem="busca"`. O atalho Ctrl/Cmd+K é próprio, com add/removeEventListener. Usa `desenvolvimento: import.meta.env.DEV`.
- **AppShell:** `equipe = ehEquipe({ isAdmin, papel })`. Para a equipe, BuscaDeTelas entra no lugar do diálogo antigo, e o `.kbar` e o `.icobtn` abrem a busca nova. O Ctrl+K do AppShell só liga para quem não é equipe. O médico continua igual. qa.layout.tsx compila sem mudança.
- **`nexo-system.css`:** bloco `/* tokens: inicio */ … /* tokens: fim */` em `.app.product-workspace:not(.sap-workspace)`, mais a rampa --b1..--b6 em `:root`. Sem `#000`. Importado logo depois de product-workspace.css.

## Verificação

- `npm run routes:generate && npx playwright test tests/e2e/menu-equipe.spec.ts tests/e2e/rota-log.spec.ts`: **17 passed** (2 do menu-equipe e 15 do rota-log). O portão do tracer reexecutou o verify com `PLAYWRIGHT_SKIP_BUILD=1` e deu de novo 17 passed.
- `npm run typecheck`: só os 4 erros da linha de base (scripts/test-perfil-da-clinica.ts:385, workers/creative/intelligence.ts). Verify sai 0.
- `npx tsx scripts/test-registro-de-telas.ts`: `test-registro-de-telas: ok`.
- `npx tsx scripts/test-workspace-navigation.ts`: ok.
- `npx eslint` nos arquivos tocados: limpo.
- `git diff --quiet origin/claude/doctor-creator-hub-nixvw6 -- src/lib/nav.ts src/lib/sap-navigation.ts src/routes`: 0.
- `git diff --diff-filter=D … -- src/routes`: vazio. beforeLoad continua 17.
- Contagens: viva 14, escondida 70, tirada 3. Índice do admin: 66 em produção (7 + 59) e 67 em desenvolvimento (7 + 60). Índice do estrategista: 28 linhas, nenhuma atrás de beforeLoad.

## Commits

- `7f25bac` feat(03-01): busca Buscar tela da equipe ligada ao registro único de telas (Task 2, tracer)
- `c56abd4` test(03-01): teste do registro de telas contra a árvore do roteador (Task 3)

## Deviations from Plan

**1. [Portão da Task 1] Data de início do log não registrada**
- PENDENTE — Fase 2 ainda não publicada nos domínios doctorcreator (VPS/EasyPanel serve build antigo); João liberou programar a Fase 3 antes, merge continua esperando 7 dias de log (D-06).
- Nenhum SQL foi rodado em produção.

**2. [Ambiente] Execução no checkout principal, não no worktree**
- O worktree do primeiro agente (agent-ad89f37da9dc97250) foi removido antes da continuação. O código foi feito direto em gsd/nexo-v5 no checkout principal, que não é branch protegida.
- Foram adicionados só os arquivos do plano. As mudanças que já estavam lá (.planning/config.json, .planning/milestone.lock, .planning/state.json e a pasta da fase 01) ficaram de fora.
- O node_modules já existia no checkout principal, então não houve symlink.

**3. [TDD] O RED não falhou contra o registro**
- O registro foi escrito por inteiro na Task 2 (o tracer precisava dele), então o teste da Task 3 passou já na primeira execução.
- O RED foi provado por mutação, com 3 quebras temporárias, cada uma revertida depois:
  - remover a linha /links: falha "precisa de exatamente 1 linha";
  - tirar somenteAdmin de /admin/caixa: falha "deve ser somenteAdmin";
  - formulário do SAP sem congelado: falha "deve ser congelado".
- Não houve commit feat(03-01) depois do test(03-01), porque não havia o que corrigir. O feat do registro (7f25bac) vem antes do test (c56abd4), o que inverte a ordem pedida no critério de aceite.

**4. [Rule 1, tokens] --text e --control-border não são nomes novos**
- Os dois já existiam em product-workspace.css (`--text: var(--ink)` e `--control-border: #7b8fa4`). O plano os lista no bloco e o 03-03 conta com `--text = #121212`, então entraram.
- Efeito dentro da casca do Nexo até o 03-03:
  - texto que usa var(--text) passa de #12263b para #121212;
  - borda de controle passa de #7b8fa4 para #7C808A;
  - no tema escuro salvo, var(--text) fica escuro sobre fundo escuro.
- Nada disso chega a produção: a fase sai num PR só (D-06), e o 03-03 aplica "sempre claro" e os aliases.

## Known Stubs

Nenhum que bloqueie o objetivo:
- Chips, Ver todas, teclado (↑/↓/Enter), estados vazio/erro e ícones da BuscaDeTelas ficam para o 03-05, como o plano manda.
- `fontes` e `onSemClinica` estão declaradas e ainda não são usadas; o 03-05 e o 03-06 passam a usá-las.
- Quando não há clínica, as linhas com $clientId não viram link. Isso não acontece na casca da clínica; o 03-06 trata a casca /admin.

## Threat Flags

Nenhum. Não há endpoint, guarda ou permissão nova. O índice da busca é só interface; quem decide acesso continua sendo o RLS e os beforeLoad que já existiam.

## Self-Check: PASSED

- Os 5 arquivos criados existem.
- Os commits 7f25bac e c56abd4 estão no HEAD.
- `git rev-list --count 3a52d8a..HEAD` = 2.
