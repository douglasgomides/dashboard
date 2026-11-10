---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 05
subsystem: navegação da equipe
status: complete
tags: [busca, chips, ver-todas, teclado, e2e, estrategista, tiradas, rotas-de-acesso]
requires:
  - "03-01: registro único, indiceDaBusca, buscarTelasEquipe, linkDaTela, BuscaDeTelas (props fontes/onSemClinica declaradas)"
  - "03-02: IconeTabler, mockAccount strategist"
  - "03-03: tokens Cobalto e scripts/test-nexo-system-css.ts (varre nexo-*.css)"
provides:
  - "src/lib/registro-de-telas.ts: ORDEM_DAS_AREAS, GrupoDeTelas, telasPorArea(perfil, opcoes)"
  - "src/components/nx-chip.tsx: NxChip({ tipo: sem-selo | congelado })"
  - "src/components/busca-de-telas.tsx: busca completa (ícone, apoio, fonte ausente, sem clínica + onSemClinica, chips, nota, Ver todas, vazio, erro, setas e Enter)"
  - "src/styles/nexo-busca.css"
  - "tests/e2e/busca-equipe.spec.ts (18 testes)"
affects: [03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "estado da busca num useMemo com try/catch: um erro do registro vira a mensagem do Copywriting Contract e a casca continua de pé"
    - "o e2e lê N, os rótulos das tiradas e as URLs do estrategista do registro (indiceDaBusca, linkDaTela); nada é escrito à mão"
key-files:
  created:
    - src/components/nx-chip.tsx
    - src/styles/nexo-busca.css
    - tests/e2e/busca-equipe.spec.ts
  modified:
    - src/lib/registro-de-telas.ts
    - scripts/test-registro-de-telas.ts
    - src/components/busca-de-telas.tsx
decisions:
  - "O chip sem selo usa role=img com aria-label 'Número sem selo de confiança', porque aria-label num span sem papel não é um nome acessível confiável. O chip congelado é só ícone e texto"
  - "O details 'Ver todas as telas' fica fora da nav 'Resultados da busca', para os links ocultos não se misturarem aos resultados. Ele continua dentro do diálogo data-origem=busca e tem um data-origem=busca próprio (D-08)"
  - "Com 0 resultados, o bloco ws-empty assume o role=status no lugar da contagem"
  - "Sem clientId, a linha vira link para /admin com 'Escolha uma clínica primeiro' e chama onSemClinica no clique (D-02). A casca /admin liga isso no 03-06"
metrics:
  duration: "~45 min"
  completed: 2026-11-10
actuals:
  tokens: 10750
  tasks: 3
  commits: 3
plan_head_before: de4c80a534abf93bb3d91b7032f43540789527ec
plan_head_after: 1904d7f8fa1d96802888457694679c605a8aa469
---

# Phase 3 Plan 05: Busca da equipe completa e provada em e2e

O diálogo "Buscar tela" agora tem o que o UI-SPEC pede para cada resultado:
- ícone Tabler;
- título em 1 linha e apoio "área · descrição" em até 2 linhas;
- "Sem {fonte} nesta clínica" quando a clínica não tem a fonte;
- "Escolha uma clínica primeiro" quando não há clínica;
- os chips sem selo e congelado.

Também tem a nota do chip no rodapé, "Ver todas as telas (N)" agrupado por área antiga, o estado vazio, a mensagem de erro e a navegação por setas e Enter. Nada do que é digitado sai do navegador. O e2e prova cinco coisas:
- cada área antiga tem uma tela escondida que abre pela busca e grava origem busca;
- o build de produção dá 66 telas, das quais 59 escondidas;
- o estrategista abre de fato cada tela que a busca dele mostra;
- as tiradas levam à tela certa;
- as rotas de acesso continuam iguais.

## O que foi feito

- **Registro:** `telasPorArea` agrupa o `indiceDaBusca` na ordem Resultados, Marketing, Comercial, Plano de ação, Relatórios, Administração, SAP. Área sem tela some. O teste do registro confere:
  - a soma dos grupos é igual ao índice, para admin e estrategista, em produção e em desenvolvimento;
  - as áreas vêm na ordem certa;
  - o admin em produção soma 66;
  - o estrategista não tem grupo SAP.
- **NxChip:** classe `nx-chip` com o modificador `--sem-selo` (shield-off) ou `--congelado` (snowflake). Ícone de 16 px mais texto, nunca só cor.
- **BuscaDeTelas:**
  - usa `fontes` (via `fonteOk`) e `onSemClinica`;
  - o filtro roda num `useMemo` com try/catch;
  - não tem rede, cliente do banco nem armazenamento do navegador (a contagem de grep dá 0);
  - ↓ no campo vai ao primeiro link, ↑/↓ percorrem os links visíveis e ↑ no primeiro volta ao campo;
  - Enter no campo faz `click()` no primeiro resultado, e o clique passa pelo listener de origem da Phase 2;
  - importa `../styles/nexo-busca.css`.
- **nexo-busca.css:** todo seletor começa por `.app.product-workspace:not(.sap-workspace)` e o arquivo só usa `var()`.
  - Linhas de resultado: 56 px, padding 12, raio 12, hover `--b6`, anel de foco de 2 px em `--b1`.
  - Título com ellipsis e apoio com line-clamp 2.
  - Chip: 14/20 500, 28 px, borda tracejada `--muted-soft`.
  - Diálogo com no máximo 85dvh, rolagem vertical por dentro e nenhuma rolagem lateral. 32 px entre o campo e a lista.
  - Nada anima.

## Verificação

- `npm run routes:generate && npx tsx scripts/test-registro-de-telas.ts && npx tsx scripts/test-nexo-system-css.ts`: os dois deram ok.
- `npm run typecheck`: só os erros da linha de base (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts), e o verify saiu 0.
- `npx eslint` nos arquivos tocados: limpo.
- Os e2e rodaram no build de produção, por uma cópia do playwright.config.ts no scratchpad na porta 5498. A config do repositório não mudou.
  - `busca-equipe.spec.ts` + `rota-log.spec.ts`: **28 passed** (13 + 15). Depois da Task 3, `busca-equipe.spec.ts` + `routes.spec.ts` + `rota-log.spec.ts` deram **207 passed e 1 failed**.
  - A falha é `routes /pacientes renders at 375px`, da linha de base: /pacientes quebra com o Supabase falso. Com `--repeat-each 3`, falha em 1 de 6 execuções, ora a 375, ora a 1280. Nenhuma falha nova.
- `git diff --quiet origin/claude/doctor-creator-hub-nixvw6` saiu 0 para estes arquivos: login, reset-password, conhecer, sem-acesso, bem-vindo, oauth.consent, _authenticated.index, $clientId.marketing e vercel.json.
- A soma de beforeLoad em src/routes continua 17, igual à do 03-01 (D-07).
- Contagens de grep:
  - `<NxChip` = 2, `Ver todas as telas` = 3 e `nexo-busca.css` = 1 em busca-de-telas.tsx;
  - hex em nexo-busca.css = 0;
  - no spec: `indiceDaBusca(` = 2, `Conferência e fontes` = 0, `"strategist"` = 2, `bloqueada` = 3 e `linkDaTela(` = 1;
  - commits 03-05 nos arquivos do 03-04 = 0.

## Commits

- `e904470` feat(03-05): busca da equipe completa com chips, Ver todas, teclado e estados
- `2a7b377` test(03-05): e2e da busca da equipe com origem busca, chips, teclado e contagem de produção
- `1904d7f` test(03-05): e2e do estrategista abrindo cada tela do índice, das tiradas e das rotas de acesso

## Deviations from Plan

**1. [Ajuste de teste] /pacientes mostra a página de erro com o Supabase falso, e no teste D-03 isso não conta como falha de acesso**
- Com o fixture, /pacientes quebra logo depois de montar: a resposta vazia de `pacientes_periodo` não traz `listas.agendaram`. É a mesma falha da linha de base do 03-01 e do Desvio 4 do 03-02.
- No laço do estrategista, essa única rota fica num conjunto nomeado (`QUEBRA_COM_O_SUPABASE_FALSO`). Para ela continuam conferidos o pathname igual ao pedido e a ausência de POST com origem bloqueada; só a checagem do texto "Essa página não carregou" é pulada.
- Tirar a exceção faz o teste falhar exatamente em /pacientes, e só nela. As outras 27 telas do índice do estrategista abrem sem a página de erro.
- Nenhuma linha do registro ganhou somenteAdmin, porque não houve falha de classificação.

**2. [Ajuste de teste] O Ctrl+K espera a casca assentar**
- Na primeira rodada, 3 dos 13 testes não abriram o diálogo. Neles o Ctrl+K saiu logo depois de "Menu da equipe" ficar visível.
- O helper `abrirBusca` agora espera o h1 "Resultados da clínica", como faz o tracer do 03-01, e repete o atalho só enquanto o diálogo não abriu.
- Na casca já carregada, um Ctrl+K basta. O componente não foi mudado por causa disso.

**3. [Leitura do plano] "Caixa de entrada" na busca do estrategista**
- A busca devolve "Central de atendimento", que tem "caixa de entrada" nos termos de nav.ts.
- O teste exige o que importa para o D-03: nenhum título "Caixa de entrada" e nenhum link para /admin ou /sap, nos resultados e em Ver todas as telas.

**4. [Ambiente]**
- Worktree em `worktree-agent-ac2b7eb949a6f460a`, que já continha gsd/nexo-v5 (de4c80a), então não houve merge.
- node_modules é um symlink.
- Durante a Task 3, um `git checkout --` desfez o bloco ainda não commitado do spec. Ele foi reaplicado igual antes do commit 1904d7f.

## Known Stubs

Nenhum. `onSemClinica` é chamado, mas a casca /admin que passa a função é do 03-06. A dica "Escolha uma clínica primeiro" já aparece aqui quando `clientId` é null.

## Threat Flags

Nenhum.
- T-03-14: zero requisições durante a digitação, provado em e2e, e o grep dá 0.
- T-03-16 e T-03-24: o estrategista abre cada tela do índice dele, nenhuma grava "bloqueada", e não houve guarda nem somenteAdmin novos.
- T-03-SC: nenhum pacote novo.

## Self-Check: PASSED

- Existem: src/components/nx-chip.tsx, src/styles/nexo-busca.css e tests/e2e/busca-equipe.spec.ts.
- Os commits e904470, 2a7b377 e 1904d7f estão no HEAD.
- `git rev-list --count de4c80a..HEAD` = 3.
