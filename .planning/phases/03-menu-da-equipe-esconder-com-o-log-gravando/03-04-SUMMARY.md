---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 04
subsystem: navegação da equipe (celular, rodapé) e casca do médico
status: complete
tags: [menu, celular, avatar, sempre-claro, marca-n, e2e]
requires:
  - "03-01: BuscaDeTelas, ROTULOS_MENU_EQUIPE, ehEquipe"
  - "03-02: MenuEquipe (variante folha), MarcaNexo, nexo-casca.css, LINKS_DO_MEDICO"
  - "03-03: base opaca do .mhead, tokens Cobalto, sempre claro"
provides:
  - "src/lib/avatar-gerado.ts: normalizarNome, hashFnv1a, tracosDoAvatar, TracosAvatar"
  - "src/components/avatar-gerado.tsx: AvatarGerado({ nome, tamanho }) em SVG inline, sem img"
  - "scripts/test-avatar-gerado.ts (entra sozinho no npm test)"
  - "LogoutButton({ rotulo }) opcional, padrão Sair"
  - "AppShell: cabeçalho do celular da equipe, folha Menu, bloco do usuário; médico com MarcaNexo e sem Aparência"
affects: [03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "ids de degradê do SVG por useId, limpos para caber em url(#...)"
    - "cores de interface do avatar por var() em style stopColor; tons de pele e cabelo literais (desenho, não interface)"
key-files:
  created:
    - src/lib/avatar-gerado.ts
    - src/components/avatar-gerado.tsx
    - scripts/test-avatar-gerado.ts
  modified:
    - src/components/app-shell.tsx
    - src/components/logout-button.tsx
    - src/styles/nexo-casca.css
    - tests/e2e/menu-equipe.spec.ts
    - tests/e2e/product-design.spec.ts
    - tests/e2e/numbers-first.spec.ts
    - tests/e2e/nexo-visual.spec.ts
decisions:
  - "O hash usa o nome normalizado (o UI-SPEC pede assim). A prancha faz o hash do nome cru, mas usa os mesmos deslocamentos de bits: pele h%5, cabelo h>>>3, camisa h>>>6, estilo h>>>9, óculos (h>>>12)%4==0"
  - "Semente e texto do avatar: o e-mail em minúsculas; o nome mostrado é a parte local do e-mail"
  - "Linha do cabeçalho do celular com 56 px por margin-top -8px no filho (anula o padding de cima do .mhead sem estilizar o .mhead)"
  - "Período e frescor da equipe vão para uma segunda linha (.nx-mhead-periodo) dentro do .mhead, abaixo da linha de 56 px"
  - "A linha 'Nexo · Marketing e vendas' saiu do rodapé da equipe (o UI-SPEC não a lista); o rodapé do médico continua com ela"
metrics:
  duration: "~35 min"
  completed: 2026-11-10
actuals:
  tokens: 10400
  tasks: 3
  commits: 5
plan_head_before: de4c80a534abf93bb3d91b7032f43540789527ec
plan_head_after: a1216cb6917117b29aab0315760c4a9ca4672b1e
---

# Phase 3 Plan 04: Celular da equipe, avatar do rodapé e o médico sempre claro Summary

No celular, a equipe agora vê na casca da clínica um cabeçalho branco com:
- o tile da clínica com as iniciais;
- o nome da clínica, que trunca com reticências;
- o botão "Buscar tela", sempre com o texto;
- o botão "Abrir menu", que abre a folha "Menu".

A folha "Menu" traz os 3 itens de ROTULOS_MENU_EQUIPE, depois "Trocar de clínica" e "Sair da conta". A equipe não tem mais barra inferior. No computador, o rodapé da barra da equipe mostra o AvatarGerado do e-mail, o nome e o e-mail. O médico (owner e viewer) mantém os mesmos itens e áreas. Ele só perde os botões Claro/Escuro e passa a ver a marca N Cobalto. O seletor Nexo/SAP saiu das cascas do Nexo, e a equipe acha o SAP pela busca.

## O que foi feito

- **Task 1 (TDD):** `tracosDoAvatar` é uma função pura do nome normalizado, com hash FNV-1a de 32 bits.
  - O RED `cf1ae6a` falhou com `ERR_MODULE_NOT_FOUND` e veio antes do feat `33e3e5a`.
  - Em 1000 nomes, os óculos ficaram na faixa de 15% a 35%.
  - 20 nomes deram pelo menos 10 combinações de traços.
- **Task 2:**
  - **AvatarGerado:** é a função `avatar()` da prancha reescrita em TSX. O fundo é um degradê de `--b4` para `--b2`, o raio é `round(tamanho × .28)` e o SVG é `aria-hidden`. Não há nenhum `<img>`.
  - **AppShell, equipe:**
    - o cabeçalho do celular, cujo "Buscar tela" chama o mesmo `abrirBusca` da BuscaDeTelas;
    - a folha `BottomSheet titulo="Menu" origem="menu"`, com MenuEquipe na variante folha;
    - a `nav.bottomnav` e a folha "Navegar no Nexo" só aparecem para o médico;
    - o rodapé tem `LogoutButton rotulo="Sair da conta"` e o bloco do usuário.
  - **AppShell, médico:** MarcaNexo entra no lugar de ProductBrand. Saem TemaBotoes e TrocaProduto, que nunca aparecia para ele porque `isAdmin` é falso nesse ramo.
  - Saíram os imports de useTheme, ProductBrand e TrocaProduto. use-theme.ts, product-brand.tsx e troca-produto.tsx não mudaram.
  - **nexo-casca.css:** ganhou o bloco do usuário, os filhos do cabeçalho do celular, a folha Menu (linhas de 56 px) e os `.mais-item` dentro do diálogo. O arquivo usa só `var()`, sem hex e sem `backdrop-filter`.
- **Task 3:**
  - **menu-equipe.spec.ts:** ganhou 5 testes:
    - 375 px: Buscar tela, a folha Menu e a falta da barra inferior;
    - origem menu no log ao tocar um item da folha;
    - 320 px: sem rolagem lateral, nome com ellipsis e "Conferência e fontes" em 1 linha na folha;
    - avatar igual em `/${CID}` e `/${CID}/relatorio`, sem img;
    - viewer com a marca N e sem Aparência na barra e na folha.
  - **product-design.spec.ts:** o teste do controle de tema sincronizado virou "a casca do Nexo não oferece mais o controle Aparência".
  - **numbers-first.spec.ts:** o teste do seletor de produto no celular virou "a equipe acha o Sistema de Aquisição pela busca no celular, mesmo com a barra recolhida". Ele usa o resultado com `href="/sap"`.

## Verificação

- `npx tsx scripts/test-avatar-gerado.ts`: `test-avatar-gerado: ok`.
- `npm run typecheck`: nenhum `error TS` fora de scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts, que são a linha de base. `npx eslint` nos arquivos tocados: limpo.
- **e2e:** rodou com build novo, por uma cópia da config no scratchpad na porta 5398. Nenhum arquivo de config do repositório mudou.
  - Verify da Task 2 (menu-equipe, rota-log e nexo-visual): **35 passed**.
  - Verify da Task 3 (menu-equipe, product-design, numbers-first e rota-log): **67 passed, 5 failed**. As 5 falhas são todas da linha de base de numbers-first: `:7` a 375 e a 1440, `:60`, `:269` e `:278`. As linhas mudaram de número com a reescrita.
  - **product-design `:140` "Nexo home … in dark"** (375 e 1440) **agora passa.** O sempre claro do 03-03 resolveu, como previsto no Desvio 3 do 03-02.
  - numbers-first `:90`, o teste instável "Marketing sidebar", passou nesta rodada.
  - O teste de trava LINKS_DO_MEDICO passa sem mudar links-do-medico.ts.
- **Gates:**
  - `git diff --quiet origin/claude/doctor-creator-hub-nixvw6 -- package.json package-lock.json src/lib/nav.ts src/hooks/use-theme.ts src/components/troca-produto.tsx src/components/product-brand.tsx src/routes/_authenticated.sap.tsx` sai 0.
  - Nenhum commit 03-04 em busca-de-telas.tsx, registro-de-telas.ts, nexo-busca.css, busca-equipe.spec.ts ou links-do-medico.ts.
  - Contagens em app-shell.tsx: `<MenuEquipe` 2, `<AvatarGerado` 1, `TemaBotoes` 0, `useTheme` 0, `TrocaProduto` 0, `ProductBrand` 0 e `bottomnav` 1.
  - `<img` em avatar-gerado.tsx: 0. `16777619` em avatar-gerado.ts: 1.
  - Nos testes: `theme preference stays synchronized` 0, `mobile product switch remains available` 0 e `Conferência e fontes` em menu-equipe.spec.ts 0.
- **Human-check visual:** não feito por captura. A comparação com a prancha a 375 (admin) e a 1440 (viewer) fica para o orquestrador ou para o 03-07.

## Commits

- `cf1ae6a` test(03-04): casos do avatar gerado determinístico
- `33e3e5a` feat(03-04): traços do avatar gerado como função pura do nome
- `dbd3bc6` feat(03-04): celular da equipe com Buscar tela e folha Menu, avatar no rodapé, médico sem Aparência e com a marca N
- `53491f1` refactor(03-04): comentário do hash sem repetir o multiplicador
- `a1216cb` test(03-04): e2e do celular da equipe, do avatar do rodapé e do médico sempre claro

## Deviations from Plan

**1. [Rule 3 - Blocking] nexo-visual.spec.ts esperava o seletor de produto**
- **Found during:** verify da Task 2.
- **Issue:** o teste "fundo do diálogo: nunca preto", do 03-03, esperava `navigation "Produto"` para saber que o papel tinha chegado. O 03-04 tira esse seletor.
- **Fix:** a espera passou a ser `navigation "Menu da equipe"` visível, a mesma do tracer. É uma linha num arquivo fora de `files_modified`.
- **Commit:** dbd3bc6

**2. [Rule 1 - Bug de teste] Locator do menu da barra pegava também a folha**
- **Found during:** verify da Task 2.
- **Issue:** a folha Menu tem o mesmo `nav "Menu da equipe"` dentro do `<dialog>` fechado, que continua no DOM. O locator CSS `itensDoMenu` do 03-02 passou a achar 6 links em vez de 3.
- **Fix:** o locator agora fica restrito à aside "Menu principal". 4 testes do 03-02 voltaram a passar.
- **Commit:** dbd3bc6

**3. [Ajuste] "Sair da conta" sem o ícone IconLogout**
- LogoutButton só ganhou a prop `rotulo`. Dar ícone a ele mudaria o SAP e o /admin.

## Known Stubs

Nenhum. A folha Menu, o cabeçalho e o rodapé estão ligados a dados reais: `useAuth().user.email`, `client.name` e o registro.

## Threat Flags

Nenhum.
- **T-03-22:** a folha tem `data-origem="menu"`, e o e2e confere a origem menu no log.
- **T-03-23:** a trava LINKS_DO_MEDICO passa, nav.ts é igual à base, e nexo-visual rodou no verify.
- **T-03-SC:** nenhum pacote novo.

## Self-Check: PASSED

- Os arquivos criados existem: src/lib/avatar-gerado.ts, src/components/avatar-gerado.tsx e scripts/test-avatar-gerado.ts.
- Os commits cf1ae6a, 33e3e5a, dbd3bc6, 53491f1 e a1216cb estão no HEAD.
- `git rev-list --count de4c80a..HEAD` = 5, igual a `actuals.commits`.
