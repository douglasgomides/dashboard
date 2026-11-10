---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 02
subsystem: navegação da equipe
status: complete
tags: [menu, barra-lateral, icones, e2e, estrategista, trava-do-medico]
requires:
  - "03-01: registro único (ROTULOS_MENU_EQUIPE, NomeIcone, linkDaTela, ehEquipe), BuscaDeTelas, tokens Cobalto em nexo-system.css"
provides:
  - "src/lib/registro-de-telas.ts: ItemMenuEquipe, ChaveMenuEquipe, ItemAtual, itensMenuEquipe(perfil), itemAtualDoMenu(pathname)"
  - "src/components/icons/tabler.tsx: IconeTabler({ nome, tamanho, traco, className }), ICONES_TABLER (30 ícones de NomeIcone)"
  - "src/components/menu-equipe.tsx: MenuEquipe (variantes barra e folha), MarcaNexo({ recolhida })"
  - "src/styles/nexo-casca.css: barra da equipe (marca N, campo Buscar tela, itens, subtelas, rodapé, barra recolhida)"
  - "tests/e2e/fixtures.ts: mockAccount(context, 'strategist')"
  - "tests/e2e/links-do-medico.ts: LINKS_DO_MEDICO { barra, barraInferior, folha } (trava do D-10 para o 03-04)"
affects: [03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "ícones Tabler como SVG inline copiado do repositório oficial (opção B), sem pacote novo"
    - "Link do TanStack com activeOptions exact: a regra do item atual do registro é a única que marca aria-current"
key-files:
  created:
    - src/components/icons/tabler.tsx
    - src/components/menu-equipe.tsx
    - src/styles/nexo-casca.css
    - tests/e2e/links-do-medico.ts
  modified:
    - src/lib/registro-de-telas.ts
    - scripts/test-registro-de-telas.ts
    - src/components/app-shell.tsx
    - tests/e2e/fixtures.ts
    - tests/e2e/menu-equipe.spec.ts
decisions:
  - "Classes próprias nx-* para a barra da equipe (não .kbar, nav.side nem .workspace-pages): as regras antigas (marcador dourado, .app.recolhida .kbar display none, cores da barra escura) não vazam e o 03-03 pode restilizar as classes antigas sem mexer no menu novo"
  - "A aside da equipe fica com fundo transparent (barra sobre a moldura); moldura, largura de 232 px e posição continuam do 03-03"
  - "Na barra recolhida o rodapé (Conheça o Nexo, Sair) some, como o .so-aberta de hoje"
  - "Sem clientId, o link de uma tela com $clientId no MenuEquipe vai para /admin (D-02: fica na Carteira); a dica e a última clínica são do 03-06"
  - "LINKS_DO_MEDICO guarda os 3 grupos separados (barra, barraInferior, folha) para o diff do teste apontar onde mudou"
metrics:
  duration: "~32 min"
  completed: 2026-11-10
actuals:
  tokens: 12300
  tasks: 3
  commits: 5
plan_head_before: df5f6464b05be9718f91e0d6a670318c88fa6cd5
plan_head_after: 225122bcf1d0eece844f3ead8bbbfc36f088cb6a
---

# Phase 3 Plan 02: Menu da equipe de 3 itens na barra do computador Summary

Na casca da clínica, a equipe vê no computador a marca N Cobalto com a palavra Nexo e o campo "Buscar tela", que abre a busca do 03-01. Abaixo vem o Menu da equipe com Carteira, Clínica e Conferência e fontes. O item atual aparece em pílula degradê e as subtelas vivas ficam embaixo dele. O estrategista que não é admin vê só Clínica, com Resultados da clínica e Relatório do período. O médico e o celular continuam iguais à base, e os links do médico ficaram travados em e2e para o 03-04.

## O que foi feito

- **Regras puras (Task 1, TDD):**
  - `itensMenuEquipe(perfil)`:
    - admin: 3 itens, com rótulos de `ROTULOS_MENU_EQUIPE` e ícones briefcase, stethoscope e shield-check;
    - estrategista não admin: só Clínica, com as subtelas sem `somenteAdmin`;
    - owner, viewer e sem papel: `[]`.
  - Subtelas: Clínica tem Resultados da clínica, Relatório do período, Etapas do CRM e Configurar este cliente; Conferência tem Conferência de dados e Integrações. Toda subtela é uma linha viva do registro. As rotas dos 3 itens mais as subtelas cobrem exatamente as 7 vivas que não são acesso.
  - `itemAtualDoMenu(pathname)` devolve `{ chave, exato }`. O id da clínica é validado com `[0-9a-f-]{36}`, a mesma forma de `_authenticated.admin.tsx`.
- **Ícones (opção B):** 30 SVG outline baixados de `raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline/{nome}.svg`. Todos responderam 200, então nenhum nome foi trocado. Os arquivos atuais já não têm a moldura sem traço; o script descarta qualquer `<path stroke="none">` mesmo assim. O cabeçalho do arquivo traz a licença MIT (Copyright (c) 2020-2026 Paweł Kuna).
- **MenuEquipe e MarcaNexo:**
  - `nav[aria-label="Menu da equipe"] > ul > li > a`: o item atual ganha `data-on`, e `aria-current="page"` só quando o endereço é o destino exato.
  - As subtelas ficam num `nav` "Telas de {rótulo}" dentro do `li`, e só aparecem para o item atual com a barra aberta.
  - Na barra recolhida, o rótulo vai para `sr-only` e o link ganha `title`.
  - A variante `folha` tem a classe `nx-menu--folha`, chevron-right 16 e subtelas de 48 px. O 03-04 monta a folha.
- **nexo-casca.css:**
  - Todo seletor começa por `.app.product-workspace:not(.sap-workspace)` e o arquivo usa só `var()`, sem nenhum hex.
  - Marca N: 28 x 32, com o clip-path da prancha e degradê 180deg de b1 para b2. Palavra Nexo em 30/400/36.
  - Campo Buscar tela: 44 px, raio 12, fundo `--field`, borda `--control-border`. A dica `⌘ K` ou `Ctrl K` é 14/500 e `aria-hidden`.
  - Itens de 46 px, com gap 2, ícone 20, gap 12 e raio 12. Hover em color-mix de `--white` 60%; item atual em `--grad-brand` com texto branco; foco em 2 px `--b1` com offset -2.
  - Subtelas de 44 px: texto alinhado em 46 px, traço `--line-2`, subtela atual em `--b1` 500.
  - Barra recolhida com ícones de 48 x 48. Nenhum texto fica abaixo de 14 px e nada anima.
- **AppShell:** só a aside "Menu principal" muda no ramo `equipe`:
  - `data-origem="menu"` continua na aside, que segue filha direta do `.app`;
  - o topo tem MarcaNexo e o botão de recolher (44 x 44, mesmos aria-label, mesma chave `hub-sidebar-recolhida`);
  - o campo Buscar tela chama o mesmo `abrirBusca` da BuscaDeTelas;
  - vêm depois o MenuEquipe barra, o separador e o rodapé (Conheça o Nexo, LogoutButton e a linha "Nexo · Marketing e vendas").

  Saem da barra da equipe: Áreas do Nexo, Análises detalhadas, Em {área}, Equipe e configuração, TrocaProduto e TemaBotoes. O ramo do médico, o `.mhead`, a `nav.bottomnav` e a folha "Navegar no Nexo" não mudaram (o ramo do médico só foi envolvido num fragmento). `TemaBotoes`, `useTheme` e `TrocaProduto` continuam importados e em uso.

## Verificação

- `npm run routes:generate && npx tsx scripts/test-registro-de-telas.ts`: `test-registro-de-telas: ok`. O RED foi visto antes do feat: o import de `itemAtualDoMenu` não existia, e o commit test(03-02) `7a617fb` vem antes do feat(03-02) `995acc2`.
- `npm run typecheck`: só os 4 erros da linha de base (scripts/test-perfil-da-clinica.ts:385 e workers/creative/intelligence.ts). Nenhum erro novo.
- `npx eslint` nos arquivos tocados: limpo. `npx tsx scripts/test-workspace-navigation.ts`: ok, porque nav.ts não mudou.
- Gate `git diff --quiet origin/claude/doctor-creator-hub-nixvw6 -- package.json package-lock.json src/lib/nav.ts src/hooks/use-theme.ts src/components/troca-produto.tsx src/components/logout-button.tsx src/routes/_authenticated.sap.tsx`: sai 0.
- Contagens de grep em app-shell.tsx:
  - `<MenuEquipe` = 1;
  - `<MarcaNexo` = 1;
  - `bottomnav` = 1;
  - `Recolher menu lateral` = 2 (o aria-label novo da equipe e o do médico);
  - `data-origem="menu"` = 2.
- nexo-casca.css: hex = 0 e `mhead` = 0.
- Contagens de grep nos testes:
  - `"strategist"` em fixtures.ts = 3;
  - `ROTULOS_MENU_EQUIPE` no spec = 12;
  - `Conferência e fontes` no spec = 0;
  - `export const LINKS_DO_MEDICO` = 1;
  - `LINKS_DO_MEDICO` no spec = 4.
- e2e com build novo, rodado por uma cópia do playwright.config.ts na porta 5298 (o 03-03 roda em paralelo na 5198):
  - **menu-equipe.spec.ts + rota-log.spec.ts:** 24 passed (9 + 15).
  - **product-design.spec.ts + numbers-first.spec.ts:** falham 8.
    - numbers-first :7 (375 e 1440), :60, :265 e :274: estão na linha de base do 03-01.
    - numbers-first :90 "Marketing sidebar…" (viewer): instável. Passou na 1ª rodada completa e, no repeat-each 3, ficou em 1 de 3. O ramo do médico não mudou.
    - product-design :140 "Nexo home … in dark" (375 e 1440): ver Desvio 3.
  - O teste "mobile product switch remains available to the team…" passa: o botão de recolher manteve o nome e a folha do celular ficou igual.
- Conferência visual (human-check, feita por captura a 1440 em /${CID} com tema claro):
  - admin: marca N + Nexo, campo Buscar tela com ⌘ K, Carteira, Clínica em pílula degradê com as 4 subtelas, Conferência e fontes em 1 linha, separador e rodapé;
  - barra recolhida: só ícones;
  - viewer: a barra é a mesma de antes.

## Commits

- `7a617fb` test(03-02): casos do menu da equipe por papel e do item atual
- `995acc2` feat(03-02): regras puras do menu da equipe (itens por papel e item atual)
- `e5a1569` feat(03-02): barra da equipe com Menu da equipe de 3 itens e campo Buscar tela
- `832b1d7` fix(03-02): Link do Menu da equipe só fica ativo no destino exato
- `225122b` test(03-02): e2e do menu da equipe no computador, do estrategista e trava dos links do médico

## Deviations from Plan

**1. [Rule 1 - Bug] O Link do TanStack marcava aria-current sozinho por prefixo**
- **Found during:** Task 3, no e2e da tela escondida.
- **Issue:** em /${CID}/conteudo, o item Clínica e a subtela Resultados da clínica recebiam `aria-current="page"`. O casamento padrão do Link é por prefixo, e ele põe `aria-current` sozinho, por cima do `undefined` que o componente passava.
- **Fix:** `activeOptions={{ exact: true, includeSearch: false }}` no link do MenuEquipe. Agora só o destino exato fica ativo, igual a `itemAtualDoMenu`.
- **Files modified:** src/components/menu-equipe.tsx
- **Commit:** 832b1d7

**2. [Rule 3 - Blocking] A espera do tracer do 03-01 dependia do seletor de produto na barra**
- **Found during:** Task 2, no verify.
- **Issue:** o tracer esperava `navigation "Produto"` para saber que o papel tinha chegado. A barra da equipe não tem mais o seletor, e o da folha fica dentro de um `<dialog>` fechado, fora da árvore de acessibilidade.
- **Fix:** o tracer passa a esperar `navigation "Menu da equipe"` visível. É uma linha em tests/e2e/menu-equipe.spec.ts (arquivo da Task 3) e entrou no commit da Task 2, porque o verify dela roda esse spec.
- **Commit:** e5a1569

**3. [Fora do escopo] product-design "Nexo home … in dark" falha por contraste e não é deste plano**
- **Sintoma:** o axe acha `#121212` sobre `#17283b` em `.service-followup`, na tela do viewer com `dc:tema=dark`.
- **Causa:** é o efeito descrito no Desvio 4 do 03-01: `--text` passou a `#121212` no bloco de tokens, e no tema escuro salvo o texto fica escuro sobre fundo escuro.
- **Por que não é deste plano:** o 03-02 não toca no ramo do médico nem em nexo-system.css, e nexo-casca.css só tem seletores `nx-*`.
- **Quem resolve:** o "sempre claro" do 03-03. Não foi corrigido aqui.

**4. [Ajuste de teste] Tela escondida do e2e: /conteudo no lugar de /pacientes**
- O plano pedia /${CID}/pacientes. Com o Supabase falso, /pacientes quebra logo depois de montar (`Cannot read properties of undefined (reading 'agendaram')`, em admin e viewer). A tela de erro substitui a casca inteira. É a mesma falha da linha de base do 03-01 (routes /pacientes 1280).
- O teste usa /${CID}/conteudo, que também é escondida, e confere a mesma regra: Clínica com `data-on` e sem `aria-current`, e nenhuma subtela com `aria-current`.

**5. [Ambiente] e2e numa porta própria**
- `playwright.config.ts` fixa a porta 5198 com `strictPort`, e o 03-03 roda em paralelo em outro worktree.
- Os verifies rodaram com uma cópia da config no scratchpad, na porta 5298, com o mesmo build e os mesmos specs. Nenhum arquivo de config do repositório mudou.
- `node_modules` é um symlink para o checkout principal, ignorado pelo git.

## Known Stubs

Nenhum que bloqueie o objetivo:
- `MenuEquipe` sem `clientId`: o link de uma tela com `$clientId` cai em /admin (D-02). A última clínica lembrada e a dica "Escolha uma clínica" são do 03-06.
- A variante `folha` existe, mas ainda não está montada. O 03-04 monta a folha "Menu" do celular e estiliza as linhas de 56 px.
- No rodapé da barra da equipe, o LogoutButton ainda diz "Sair". O rótulo "Sair da conta" e o bloco do usuário com AvatarGerado são do 03-04, como o plano manda.

O ledger `.planning/WINDOWS.md` não foi tocado. Ele é opcional, e o orquestrador restringiu a escrita aos arquivos do plano.

## Threat Flags

Nenhum. Não há endpoint, guarda nem permissão nova:
- T-03-06: `itensMenuEquipe(strategist)` só devolve linhas sem `somenteAdmin`, e o e2e confere que não há `a[href^="/admin"]` na aside do estrategista;
- T-03-07: origem menu conferida no e2e;
- T-03-09 e T-03-SC: só SVG estático, nenhum pacote, gate de package.json saindo 0.

## Self-Check: PASSED

- Os arquivos criados existem: src/components/icons/tabler.tsx, src/components/menu-equipe.tsx, src/styles/nexo-casca.css e tests/e2e/links-do-medico.ts.
- Os commits 7a617fb, 995acc2, e5a1569, 832b1d7 e 225122b estão no HEAD.
- `git rev-list --count df5f646..HEAD` = 5, igual a `actuals.commits`.
