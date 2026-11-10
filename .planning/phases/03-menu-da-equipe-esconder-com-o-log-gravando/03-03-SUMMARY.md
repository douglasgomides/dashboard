---
phase: 03-menu-da-equipe-esconder-com-o-log-gravando
plan: 03
subsystem: sistema visual do Nexo
status: complete
tags: [tokens, cobalto, sempre-claro, urbanist, moldura, movimento, sap-congelado]
requires:
  - "03-01: bloco de tokens Cobalto em src/styles/nexo-system.css (marcadores tokens: inicio / tokens: fim)"
provides:
  - "src/styles/nexo-system.css completo: aliases dos nomes antigos, sempre claro (casca, html e body), véu do diálogo, pílula --grad-brand, moldura e painel, limpeza dos cartões, movimento em no-preference, pino Inter 15 px do SAP"
  - "tokens novos no bloco: --sombra-cartao, --sombra-cartao-hover, --sombra-moldura, --sombra-dialogo, --veu-cinza; --white também em :root"
  - "scripts/test-nexo-system-css.ts (entra sozinho no npm test)"
  - "tests/e2e/nexo-visual.spec.ts (11 testes)"
affects: [03-02, 03-04, 03-05, 03-06, 03-07]
tech-stack:
  added: []
  patterns:
    - "tema escuro das folhas antigas reescopado para .product-workspace.sap-workspace / .sap-workspace .dbx"
    - "nomes legados que styles.css calcula em :root (--bg, --text-dim, --good-bg etc.) recalculados na casca"
    - "animação com fill-mode backwards: o CSS base é o estado final"
key-files:
  created:
    - scripts/test-nexo-system-css.ts
    - tests/e2e/nexo-visual.spec.ts
  modified:
    - src/styles/nexo-system.css
    - src/styles/product-workspace.css
    - src/styles/databoard.css
    - src/styles.css
    - index.html
decisions:
  - "Sombras e o cinza do véu viraram tokens dentro dos marcadores (literais rgba só ali); fora deles nexo-system.css só usa var()"
  - "Os nomes legados de :root em styles.css (--bg, --text-dim, --text-faint, --danger, --accent-soft, --good/--warn/--danger-bg e -border) são recalculados na casca; sem isso o tema escuro salvo vazava por eles"
  - "Moldura só em @media (min-width: 821px); em 820 px ou menos a casca zera borda, raio, padding, margem e sombra"
  - "Animações com fill-mode backwards (não both): depois da subida vale o CSS normal, e o cartão desabilitado continua em .75"
  - "Barra inferior do celular ganha fundo --white (ficaria transparente com --side transparent) e item atual em --grad-brand com texto branco"
  - "Marca escura atual (.product-brand--dark) passa a texto escuro sobre a moldura até o 03-02/03-04 trocarem pela marca N"
metrics:
  duration: "~40 min"
  completed: 2026-11-10
actuals:
  tokens: 11150
  tasks: 3
  commits: 4
plan_head_before: df5f6464b05be9718f91e0d6a670318c88fa6cd5
plan_head_after: e574065269f2bba1e3bfff5a9924e800ea7149fa
---

# Phase 3 Plan 03: Sistema visual do Nexo (Cobalto, sempre claro, Urbanist, moldura) Summary

As telas logadas do Nexo, da equipe e do médico, agora abrem claras e em Cobalto, mesmo quando a pessoa salvou o tema escuro (`dc:tema=dark` mais `prefers-color-scheme: dark`). Os nomes antigos apontam para os tokens novos. O corpo é Urbanist 16 px, dentro da moldura cinza com painel branco, e os cartões ficaram limpos. O movimento só roda em `prefers-reduced-motion: no-preference`. O SAP continua escuro e em Inter 15 px.

## O que foi feito

**Task 1: sempre claro, em Cobalto**
- `product-workspace.css`: os dois blocos escuros genéricos agora valem só para `.product-workspace.sap-workspace`:
  - `:root[data-theme="dark"] …`
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }`
- `databoard.css`: as duas regras escuras do `.dbx` passaram para `.sap-workspace .dbx`.
- `@media print` e os blocos próprios do SAP não foram tocados.
- `nexo-system.css` recebeu:
  - **Aliases:** `--page`, `--surface`, `--surface-2`, `--ink`, `--ink-2`, `--muted`, `--border`, `--grid`, `--accent*`, `--action-*`, `--focus`, `--good`, `--good-text`, `--warn`, `--crit` e `--shadow`.
  - **`--side-*`:** `--side` fica transparente e `--side-active` vira `--grad-brand`.
  - **Variáveis do `.dbx`** no sistema novo.
  - **Nomes legados de `:root`**, recalculados na casca.
- **Fundo da página:** `html:has(...)` e `body:has(...)` com `color-scheme: light` e o degradê do UI-SPEC.
- **Véu do diálogo:** `color-mix(--b6 55%, --veu-cinza)` com `blur(2px)`.
- **Item atual em pílula `--grad-brand`:** `nav.side a/button[data-on]`, `[aria-current=page]`, `.sub-itens`, `aside .workspace-pages a[data-on]`, `.themes` pressionado e `.bottomnav [data-on]`.
- **Resto da limpeza:**
  - `.kbar` em `--field`;
  - `.ws-priority` em `--grad-brand` com texto branco e sem dourado;
  - `.logo` e `.avatar` em `--grad-brand`;
  - `.product-brand--dark` legível sobre a moldura.
- **Valores claros fixos dentro dos marcadores:** `--axis #CBD5E1`, `--s1 #2563EB`, `--s2 #EA580C`, `--s3 #0D9488`, `--s7 #7C3AED`, `--serious #C2410C`, `--brand-gold-ink #84612d` e `--ai #85632f` (o mesmo valor de hoje).

**Seletores corrigidos porque usavam `border-color: var(--action-bg)`**, listados por grep em product-workspace.css. Recebem `border-color: var(--b1)` na casca do Nexo:
- `.product-workspace .btn.pri` e `.product-workspace .ws-action--primary` (linha 234)
- `.product-workspace .sap-context-tabs a[aria-current="page"]` (576)
- `.product-workspace .creative-tabs button[aria-current="page"]` (826)
- Junto com eles, `.workspace-content-views button[aria-pressed="true"]` troca o `border-bottom-color` dourado por `--b1`.
- Todo uso de `--action-bg` como fundo já era o atalho `background:` (232, 407, 574, 824, 963), não `background-color`. O degradê funciona sem mudar nada.

**Task 2: fonte, moldura, cartões e movimento**
- `index.html` faz uma requisição só: `family=Inter:wght@400;500;600;700&family=Urbanist:wght@400;500;600;700&display=swap`.
- `styles.css`: o body passou a `var(--font,"Urbanist",ui-sans-serif,…)` em 16 px, sem `font-feature-settings`, e o body de 639 px passou de 15 para 16 px.
- **SAP fixado** em `.product-workspace.sap-workspace`: Inter, 15 px e `"cv11","ss01"`.
- **Moldura acima de 820 px:**
  - `--frame`, raio 30, padding 12, borda 6 em `color-mix(--white 70%, --b6)`, margem 16, `min-height: calc(100dvh - 32px)`, sombra da prancha;
  - grade 232 px (76 px recolhida) com gap 12;
  - aside transparente e sticky, `top: 28px`, padding 14 8;
  - `.mainwrap` como painel branco de raio 22 e padding 20 22.
- **Em 820 px ou menos:** sem moldura, painel branco com raio 0. O `.mhead` fica opaco: fundo `--white`, borda `--line` e sem `backdrop-filter`.
- **Limpeza:**
  - `.dbx-card` branco com borda `--line`, raio 16, padding 18 e `--shadow`; o hover usa borda `--b5` e sombra azulada; o estado `aria-expanded` foi preservado;
  - `.dbx-bar` de 12 px sobre `--field`, com o `i` em `--grad-bar`;
  - `.dbx-det` com borda `--line`;
  - `.workspace-dialog` com raio 22 (folha: só os cantos de cima) e `--sombra-dialogo`;
  - `tabular-nums` em `.dbx` e nas tabelas.
- **Movimento**, todo em `@media (prefers-reduced-motion: no-preference)`:
  - `nexo-subir`: 550 ms, atraso de 55 ms por posição até o 12º cartão;
  - `nexo-crescer`: `scaleX` em 1 s;
  - `nexo-abrir`: 150 ms no diálogo aberto;
  - transição de 200 ms em borda e sombra.

**tnum da Urbanist:** a fonte **não tem** o recurso `tnum`. Conferi baixando o TTF que o css2 da Urbanist serve a um user-agent antigo (`L0xjDF02iFML4hGCyOCpRdycFsGxSrqDyx4fFg.ttf`, 41.060 bytes) e lendo as tabelas de recursos:
- GSUB tem `ccmp` e `frac`;
- GPOS tem `kern`, `mark` e `mkmk`.

A regra `font-variant-numeric: tabular-nums` continua declarada, mas não tem efeito. O UI-SPEC aceita esse registro.

**Task 3: e2e (`tests/e2e/nexo-visual.spec.ts`, 11 testes)**
- Sempre claro com tema escuro salvo, em 3 casos: admin em /CID, admin em /admin e viewer em /CID.
- SAP: `--page` continua `#0b1420`, com Inter 15 px e cv11.
- Moldura e painel a 1440 px. A barra mede 232 px com a Urbanist bloqueada pelo fixture, o que serve de backstop da troca de fonte.
- A 375 px: raio 0, cabeçalho opaco e a linha do cabeçalho com 56 px ou menos.
- Fonte Urbanist 16 px, com `font-feature-settings` em `normal`.
- Movimento com `reduce`: opacity 1, transform none e nenhuma animação. Com `no-preference`: `nexo-subir`.
- O `::backdrop` não é preto e tem blur. O diálogo tem raio 22.
- Sem rolagem horizontal em 8 telas, a 375 e a 1440 px.

## Verificação

**Testes automáticos**
- `npx tsx scripts/test-nexo-system-css.ts`: `test-nexo-system-css: ok`.
  - Prova por mutação: devolver o `.dbx` escuro genérico faz o teste falhar com "regra escura fora do SAP". Pôr uma `transition` fora da media faz falhar com "animação ou transição fora de …".
  - Contraste do texto branco sobre `--grad-brand`: 6,63 em 0%, 5,58 em 50% e 4,75 em 100% da caixa.
- `npm run build`: sai 0.
- `npx playwright test tests/e2e/nexo-visual.spec.ts`, com build completo: **11 passed**.
- Regressão com o mesmo build:
  - `menu-equipe`, `product-design` e `rota-log`: 32 passed;
  - `routes`, `workspace-navigation` e `navigation-architecture`: 184 passed e 7 failed. As 7 já falhavam antes: navigation-architecture (2) e workspace-navigation (5). Todas as rotas de routes.spec passaram nas duas larguras, inclusive /pacientes a 1280.
- `npx tsc --noEmit`: só os erros da linha de base (scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts).
- `npx eslint` nos 2 arquivos novos: limpo.

**Critérios de aceite**
- `#e5c78e` continua aparecendo 2 vezes em product-workspace.css.
- `sap-workspace` em product-workspace.css passou de 13 para 15.
- O grep de `--ai` com valor diferente de `#85632f` dá 0.
- `git diff --quiet` sai 0 para `src/sap-workspace.css`, `src/hooks/use-theme.ts` e `src/nexo.css`.
- Hex nas linhas acrescentadas: 0 em styles.css e index.html; em product-workspace.css e databoard.css, ver o Desvio 1.
- Contagens em index.html: Urbanist 1, Inter 1.
- styles.css: `cv11/ss01` 0 vezes e `font-size:15px;line-height:1.5` 0 vezes.
- nexo-system.css: `prefers-reduced-motion: no-preference` 1 vez.
- nexo-visual.spec.ts: `outputs/` 0 vezes e `emulateMedia` 1 vez.
- Ordem no histórico: test(03-03) antes de feat(03-03).

## Commits

- `180a13f` test(03-03): teste estático do sistema visual do Nexo (RED, falhava em `--axis`)
- `6a2ad9d` feat(03-03): Nexo sempre claro em Cobalto com os nomes antigos apontando para os tokens novos
- `bf80248` feat(03-03): Urbanist 16 px, moldura com painel branco, cartões limpos e movimento com respeito à preferência
- `e574065` test(03-03): e2e do sistema visual

## Deviations from Plan

**1. [Critério de aceite da Task 1] O grep de hex no diff dá 2 linhas em databoard.css, não 0**
- **Causa:** as duas regras escuras do `.dbx` ocupam uma linha só, com seletor e declarações juntos. Para reescopar, a linha inteira muda e aparece como `+` com os mesmos hex.
- **Conferência:** o conjunto de hex das linhas `+` é idêntico ao das linhas `-`, então não há hex novo (V9). Em product-workspace.css o grep dá 0.
- **Arquivo:** src/styles/databoard.css, linhas 4 e 6. **Commit:** 6a2ad9d.

**2. [Rule 1] Nomes legados de `:root` vazavam o tema escuro**
- **Causa:** `--bg`, `--text-dim`, `--text-faint`, `--danger`, `--accent-soft` e os `--good/--warn/--danger-bg/-border` são calculados em `:root` (styles.css), com o tema de `:root`, e chegam à casca já escuros.
- **Correção:** foram recalculados no bloco de aliases. Commit 6a2ad9d.

**3. [Rule 1] Consumidores de `--side`/`--side-active` ficariam ilegíveis**
- **`.bottomnav`:** com `--side` transparente, o fundo ficaria transparente. Recebeu fundo `--white`.
- **Texto escuro sobre o degradê:** `nav.side a[aria-current]`, `.sub-itens`, `.themes` pressionado e `.bottomnav [data-on]` passaram a texto branco. `.grupo-toggle:hover` foi para `--side-hover`.
- **`.product-brand--dark`:** tinha texto claro fixo e foi ajustado para a moldura clara.
- Commit 6a2ad9d.

**4. [Rule 1] Estado `aria-expanded` do `button.dbx-card`**
- A borda nova do cartão (0,4,0) apagaria o destaque do cartão aberto. A regra foi repetida no escopo do Nexo. Commit bf80248.

**5. [Teste] O teste estático ganhou 2 checagens na Task 2**
- O "pelo menos 3 animações" foi tirado da versão RED, porque a Task 1 não declara movimento, e voltou na Task 2 junto com a checagem do pino do SAP. Commit bf80248.

**6. [e2e] /pacientes quebra com os dados do fixture, uma falha anterior a esta fase**
- Com admin e os dados falsos, /CID/pacientes cai em "Essa página não carregou" (`TypeError: Cannot read properties of undefined (reading 'agendaram')`) uns segundos depois de abrir.
- Não vem do CSS: um TypeError não nasce de folha de estilo. É a mesma falha conhecida de routes.spec /pacientes 1280, que é intermitente porque aquele teste mede logo depois do domcontentloaded.
- **Como o teste de rolagem trata isso:**
  - mede a casca assim que ela aparece e de novo depois do networkidle;
  - aceita a tela de erro só em /pacientes, registrada como anotação "falha anterior";
  - falha se qualquer outra tela quebrar.
- Não corrigi, porque está fora do escopo (dado de tela). Fica para registrar no WINDOWS.md quando o orquestrador consolidar. Não escrevi lá para não conflitar com o 03-02, que roda em paralelo.

**7. [Ambiente] Build com o env do e2e**
- O primeiro `PLAYWRIGHT_SKIP_BUILD=1` usou o `dist` do `npm run build` puro, que não tem o Supabase falso. Todas as telas mostraram "Supabase não configurado". A partir daí rodei com o build do próprio Playwright.

## Pontos para o João e para os próximos planos

- **Páginas públicas também mudam de fonte.** O body de styles.css é global, como o plano manda. Login, landing, /bem-vindo e o login do SAP passam a usar Urbanist 16 px. Só a casca logada do SAP fica fixada em Inter 15 px.
- **Para o 03-04:** o `.mhead` só tem a base opaca. O conteúdo do cabeçalho do celular é dele.
- **Para o 03-02:** a barra da equipe, a marca N e o campo "Buscar tela" ficam em nexo-casca.css. A aside e o `.mainwrap` continuam filhos diretos do `.app`.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. A única superfície nova é a família Urbanist na mesma requisição do Google Fonts que já existia (T-03-10, accept).

## Self-Check: PASSED

- Os arquivos criados existem: scripts/test-nexo-system-css.ts e tests/e2e/nexo-visual.spec.ts.
- Os commits 180a13f, 6a2ad9d, bf80248 e e574065 estão no HEAD.
- `git rev-list --count df5f646..HEAD` = 4.
