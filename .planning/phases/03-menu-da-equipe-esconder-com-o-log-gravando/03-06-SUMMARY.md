---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 06
subsystem: navegação da equipe (casca /admin)
status: complete
tags: [menu, busca, admin, ultima-clinica, axe, e2e]
requires:
  - "03-01: registro único, BuscaDeTelas, ROTULOS_MENU_EQUIPE"
  - "03-02: MenuEquipe, MarcaNexo, nexo-casca.css"
  - "03-04: AvatarGerado, LogoutButton({ rotulo }), cabeçalho do celular e folha Menu"
  - "03-05: BuscaDeTelas com onSemClinica e 'Escolha uma clínica primeiro'"
provides:
  - "src/lib/ultima-clinica.ts: CHAVE_ULTIMA_CLINICA, lerUltimaClinica, gravarUltimaClinica (só UUID), ArmazenamentoSimples"
  - "scripts/test-ultima-clinica.ts (entra sozinho no npm test)"
  - "MenuEquipe({ onSemClinica }) opcional"
  - "AdminContent com o mesmo menu, busca, rodapé, cabeçalho do celular e folha Menu da casca da clínica"
affects: [03-07]
tech-stack:
  added: []
  patterns:
    - "armazenamento injetável (padrão window.localStorage), para o teste tsx rodar com um objeto falso"
key-files:
  created:
    - src/lib/ultima-clinica.ts
    - scripts/test-ultima-clinica.ts
    - .planning/phases/03-menu-da-equipe-esconder-com-o-log-gravando/deferred-items.md
  modified:
    - src/routes/_authenticated.$clientId.tsx
    - src/routes/_authenticated.admin.tsx
    - src/components/menu-equipe.tsx
    - src/styles/nexo-casca.css
    - tests/e2e/menu-equipe.spec.ts
    - tests/e2e/navigation-architecture.spec.ts
    - tests/e2e/workspace-navigation.spec.ts
    - tests/e2e/product-design.spec.ts
decisions:
  - "A casca /admin não tem o botão de recolher a barra (o plano não lista esse botão)"
  - "No cabeçalho do celular do /admin, a MarcaNexo recolhida (só o N de 28 px) fica no lugar do tile. O título é um <b> e não um heading, para não repetir o h1 da página"
  - "A dica da Carteira ganhou a classe .nx-dica-clinica (14/20, --muted-ink) em nexo-casca.css. A MarcaNexo não precisou de ajuste de tamanho"
  - "Na casca /admin, Clínica sem clínica lembrada chama onSemClinica. Isso vale para o item e para as subtelas que precisam de clínica"
metrics:
  duration: "~70 min"
  completed: 2026-11-10
actuals:
  tokens: 13000
  tasks: 3
  commits: 4
plan_head_before: 5ec894ad87bb528ae82034d7c6e120d80c1e81dc
plan_head_after: 73ce2cad7661b74012b5f446666b4b76a42b3d70
---

# Phase 3 Plan 06: A casca /admin com o mesmo menu e a mesma busca, e a última clínica lembrada Summary

Na casca /admin, a equipe agora vê o mesmo Menu da equipe de 3 itens da casca da clínica, com:
- a mesma marca N;
- o mesmo campo Buscar tela, que também abre com Ctrl+K;
- o mesmo rodapé com AvatarGerado do e-mail;
- no celular, o cabeçalho com Buscar tela e a folha Menu.

O item "Clínica" leva à última clínica aberta naquele navegador. A chave é `nexo:ultima-clinica` e guarda só o UUID, validado. Sem clínica lembrada, o item fica na Carteira e mostra "Escolha uma clínica para abrir os resultados dela." A busca no /admin usa a mesma clínica lembrada. Sem ela, a linha diz "Escolha uma clínica primeiro" e leva à Carteira com a mesma dica. O menu e a busca passam no axe nas duas cascas e nas duas larguras. Os specs antigos do menu agora descrevem o menu novo.

## O que foi feito

- **Task 1 (TDD):**
  - Primeiro o RED `0056644`: `scripts/test-ultima-clinica.ts` falhou com `ERR_MODULE_NOT_FOUND`.
  - Depois o feat `f033011`, com `src/lib/ultima-clinica.ts`: UUID validado na leitura e na escrita, try/catch e armazenamento injetável.
  - `ClientLayout` grava o `clientId` num efeito.
- **Task 2 (`62d7f22`):**
  - **MenuEquipe:** ganhou `onSemClinica`. Quando a tela precisa de clínica e não há nenhuma, o link vai para /admin e chama a função.
  - **AdminContent:**
    - `clientIdDoMenu` é o id de `/admin/<id>` ou o valor de `lerUltimaClinica()`. Ao abrir `/admin/<id>`, a clínica fica gravada.
    - A aside "Menu do admin" tem `data-origem=menu` e `nx-barra`. Ela traz MarcaNexo, Buscar tela, MenuEquipe na variante barra, o separador, Conheça o Nexo, "Sair da conta" e o bloco do usuário.
    - O cabeçalho `.mhead` mostra a marca N, o título truncado, Buscar tela e Abrir menu.
    - A folha `BottomSheet titulo="Menu" origem="menu"`, a `BuscaDeTelas` (perfil admin) e a linha `role=status` da dica completam a casca.
  - **O que saiu:** ITENS, GRUPOS, o nav "Ferramentas administrativas", o `details.ws-admin-menu`, os dois TrocaProduto, o ProductBrand e os ícones lucide. O beforeLoad com `registrarBloqueada` não mudou.
  - **menu-equipe.spec.ts:** ganhou 7 testes, que cobrem os casos (a) a (f) do plano. O caso (c) virou dois testes, com e sem clínica lembrada.
- **Task 3 (`73ce2ca`):**
  - **menu-equipe.spec.ts:** 3 testes de axe (wcag2a e wcag2aa, reducedMotion reduce):
    - a 1440: a aside "Menu principal" e a aside "Menu do admin";
    - a 375, em `/<clínica>` e em `/admin`: o `header.mhead`, a folha Menu aberta e Buscar tela com "funil" digitado.
  - **navigation-architecture.spec.ts:**
    - O primeiro teste virou "Marketing antigo leva a Analisar desempenho…": `/marketing?preset=7d` termina em `/conteudo?preset=7d` com o h1 "Analisar desempenho". Depois vem o fluxo de /ideias: semana, refresh, histórico e Encontrar ideias.
    - Saíram a página de orientação, o mkdir e o PNG em `outputs/`.
  - **workspace-navigation.spec.ts:** as expectativas de menu passam a seguir o menu do médico de hoje, travado em links-do-medico.ts (D-10):
    - Marketing com 5 telas nos grupos Resultados e Conteúdo;
    - "Planejar a semana" no lugar de "Referências salvas";
    - Comercial com só o Funil comercial;
    - Entregas leva a /plano.
  - **product-design.spec.ts:** "admin no celular: o menu da equipe e a busca levam às ferramentas…". A folha Menu tem os 3 itens, e a busca leva à Central de Agentes: URL `/admin/agentes`, heading visível e diálogo fechado.

## Verificação

- `npx tsx scripts/test-ultima-clinica.ts`: `test-ultima-clinica: ok`.
- `npm run typecheck`: nenhum `error TS` fora de scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts, que são a linha de base. `npx eslint` nos arquivos tocados: limpo. `scripts/test-nexo-system-css.ts`: ok.
- **e2e:** rodou no build de produção, por uma cópia da config no scratchpad na porta 5598. A config do repositório não mudou.
  - Verify da Task 2 (menu-equipe, rota-log, nexo-visual e busca-equipe): **65 passed**. rota-log continua com os 15.
  - Rodada final dos 7 specs da seção verification do plano: **98 passed, 1 failed**. A falha é `workspace-navigation.spec.ts:131 › home: detailed analyses…`. Ela está na linha de base do 03-01 e foi registrada em deferred-items.md, porque o conteúdo da home está fora do menu (ver abaixo).
  - navigation-architecture e workspace-navigation com `--repeat-each 2`: **30 passed**. Só falhou a home, nas duas repetições.
- **Contagens de grep:**
  - em admin.tsx: `registrarBloqueada(location.pathname)` = 1, `GRUPOS` = 0, `TrocaProduto` = 0, `ws-admin-menu` = 0, `<MenuEquipe` = 2, `<BuscaDeTelas` = 1, `<AvatarGerado` = 1 e `lerUltimaClinica(` = 1;
  - `gravarUltimaClinica(` = 1 em `$clientId.tsx`;
  - hex em nexo-casca.css = 0;
  - `AxeBuilder` = 2 em menu-equipe.spec.ts;
  - em navigation-architecture.spec.ts: `outputs/` = 0 e `Visão geral de Marketing` = 0;
  - `ws-admin-menu` = 0 em product-design.spec.ts.

## Commits

- `0056644` test(03-06): teste da última clínica lembrada com armazenamento falso
- `f033011` feat(03-06): a última clínica aberta fica lembrada naquele navegador
- `62d7f22` feat(03-06): a casca /admin ganha o mesmo menu, a mesma busca e o mesmo rodapé
- `73ce2ca` test(03-06): axe do menu e da busca e os specs antigos do menu descrevendo o menu novo

## Deviations from Plan

**1. [Rule 1 - teste quebrado pela fase] "commercial results remain restricted … for admin" foi atualizado, embora o plano dissesse para não mexer**
- Esse teste passava na linha de base do 03-01. Ele quebrou no 03-02, quando o admin trocou as abas de Comercial pelo Menu da equipe, e agora não acha o nav "Telas de Comercial".
- O ramo do admin agora confere que esse nav não existe. Pela busca, confere duas coisas: "Resultados por origem do CRM" aparece com "Comercial" no texto de apoio, e "Guia de organização do CRM" também aparece.
- O ramo do viewer, que é a correção da Phase 2 em f9fadb7 com a espera do papel, ficou igual e passa.

**2. [Rule 3 - instabilidade] O Ctrl+K do teste "task search leads straight to the weekly planner" é repetido até o diálogo abrir**
- Numa rodada o atalho saiu antes de a casca do viewer assentar, e o diálogo nunca abriu.
- O teste agora usa o mesmo padrão `toPass` do 03-05 (Desvio 2). O componente não mudou.

**3. [Plano, passo 3 de Task 2] nexo-casca.css mudou por causa da dica, não da marca**
- A MarcaNexo recolhida já tem 28 px e não precisou de ajuste.
- A linha "Escolha uma clínica para abrir os resultados dela." precisava do estilo 14/20 `--muted-ink`. Ela ganhou uma regra com o mesmo prefixo `.app.product-workspace:not(.sap-workspace)`, só com `var()`.

**4. [Adiado] workspace-navigation.spec.ts:131 (home)**
- O estado vazio da home ("Sem recomendação para este período") não tem o link "Ver prioridades da equipe". Isso é conteúdo da home, fora do menu e do visual.
- Ficou registrado em `deferred-items.md` com a causa e não foi corrigido aqui.

**5. [Ambiente]**
- O worktree `worktree-agent-afc61903d498f2919` já continha gsd/nexo-v5 (5ec894a), então não houve merge.
- node_modules é um symlink.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum.
- T-03-13: UUID validado na leitura e na escrita, coberto pelo teste tsx com valor inválido e com armazenamento que lança.
- T-03-15: o beforeLoad do /admin ficou idêntico.
- T-03-25: as duas origens menu estão provadas em e2e: na aside "Menu do admin" (Integrações) e na folha.
- T-03-SC: nenhum pacote novo.

## Self-Check: PASSED

- Existem: src/lib/ultima-clinica.ts, scripts/test-ultima-clinica.ts e deferred-items.md.
- Os commits 0056644, f033011, 62d7f22 e 73ce2ca estão no HEAD.
- `git rev-list --count 5ec894a..73ce2ca` = 4.
