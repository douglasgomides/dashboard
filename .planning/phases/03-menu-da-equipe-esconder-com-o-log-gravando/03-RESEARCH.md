# Phase 3: Menu da equipe (esconder com o log gravando) - Research

**Researched:** 2026-11-09
**Domain:** navegação por registro único (TanStack Router 1.x + React 19, SPA Vite), busca de telas (Cmd+K), troca do sistema visual de 80 telas (CSS por tokens), 3 cascas (clínica, `/admin`, SAP)
**Confidence:** HIGH no que é leitura de código (cada afirmação traz arquivo e linha); MEDIUM na recontagem 14/70/3 (depende de interpretação do quadro do conselho); LOW em tabular-nums da Urbanist e em comportamento de navegadores marcado `[ASSUMED]`

<user_constraints>
## User Constraints (from CONTEXT.md)

Não existe `03-CONTEXT.md`. O contrato aprovado é `03-UI-SPEC.md` (decisões do dono de 09/11/2026 já gravadas lá). Tratar como travado:

### Locked Decisions
- Equipe com 3 itens: **Carteira** (`/admin`), **Clínica** (`/$clientId`), **Conferência e fontes** (`/admin/conferencia`), nas duas cascas da equipe (clínica e `/admin`). Rótulos provisórios (card sorting, decisão 11), guardados numa constante única `ROTULOS_MENU_EQUIPE` (nome do UI-SPEC); os testes leem a constante.
- Telas fora dos 3 itens abrem pela busca: Cmd+K / Ctrl+K no computador, botão "Buscar tela" sempre visível no celular (44 px ou mais, com texto). Sem barra inferior para a equipe.
- "Clínica" a partir de `/admin` abre a **última clínica aberta naquele navegador** (armazenamento local, só o id da clínica); sem clínica lembrada, fica na Carteira com a linha "Escolha uma clínica para abrir os resultados dela."
- **Estrategista que não é admin do app vê o menu novo da equipe** (resposta do João, 09/11/2026).
- Menu do médico (owner/viewer) **não muda de estrutura** nesta fase; recebe só o visual novo da casca.
- Sistema visual: Cobalto (`--b1` `#1F4FD8` … `--b6`), réplica da referência NEXO, Urbanist, moldura `#F0F2F4` com barra sobre a moldura e painel branco, ícones Tabler traço 1,5, sempre claro, avatar 3D gerado, tudo por variáveis (sem hex solto novo). SAP (`.sap-workspace`) não muda; nenhum `sap_*`.
- `situacao: "viva" | "escondida" | "tirada"`; esconder nunca apaga; decisão 3 (quais telas saem de vez) continua aberta com o João.
- A fase só esconde telas depois de **7 dias corridos de log gravando em produção** (D-14 de `02-CONTEXT.md`).

### Claude's Discretion
- Ícones: `@tabler/icons-react` (opção A) ou SVG inline (opção B).
- Hospedagem da fonte (link Google Fonts ou arquivo próprio).
- Onde guardar a "última clínica" e como tratar `use-theme` na casca do Nexo.
- Estrutura interna do registro, nome dos arquivos, divisão em planos.

### Deferred Ideas (OUT OF SCOPE)
- Menu do médico com Hoje + Ajuda e fontes (Phase 9, MENU-06); aviso "sem selo" dentro das telas (Phase 9, MENU-05); `metricas_selo` real (Phase 6); gráficos, count-up e KPI (Phase 9); rosca (continua proibida); páginas públicas (`nexo.css`: landing, login, `/bem-vindo`) não mudam de visual; qualquer mudança em `sap_*` ou no host `sap.`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MENU-01 | Registro único classifica as rotas em viva / escondida / tirada, conferido por teste | Seção "Registro de telas": 85 folhas do roteador (81 da árvore autenticada + `/login`, `/reset-password`, `/conhecer`, `/qa/layout`), recontagem 14 / 70 / 1+2, tabela por rota, teste que lê `src/routeTree.gen.ts` |
| MENU-02 | Equipe vê 3 itens: Carteira, Clínica, Conferência e fontes | Duas cascas hoje (`app-shell.tsx`, `_authenticated.admin.tsx`); componente compartilhado `MenuEquipe`; tratamento do estrategista não admin |
| MENU-03 | Equipe abre qualquer tela escondida pela busca (Cmd+K / botão no celular) e a abertura é gravada | `BuscaDeTelas` compartilhado, índice do registro, `data-origem="busca"` (Phase 2), links com clínica lembrada |
| MENU-04 | 3 rotas tiradas redirecionam para a tela certa, sem 404 | Só 1 é rota de verdade (`marketing`); 2 são rótulos de `/ideias` (a rota fica) |
| MENU-07 | Login, redefinir senha, primeiro acesso, OAuth, sem acesso e `/r/` nunca escondidos nem redirecionados; SAP congelado | Lista de rotas de acesso, `/r/:slug` é rewrite da Vercel (fora do roteador), SAP só some do menu |
</phase_requirements>

## Summary

A fase tem três blocos de risco diferentes e o plano deve separá-los em ondas. (1) **Registro + busca + menus**: lógica pura testável por `tsx`, mais dois componentes compartilhados (`MenuEquipe`, `BuscaDeTelas`) que substituem três menus hoje independentes (`app-shell.tsx`, `_authenticated.admin.tsx`, e o SAP que deixa de ser item). O menu do médico continua dirigido por `AREAS`/`AVANCADO` de `nav.ts`; o registro novo é uma segunda fonte, só para a equipe (`NavTab` cobre apenas 30 das 85 rotas, então `situacao` em `NavTab` não resolve sozinho). (2) **Sistema visual**: troca de tokens, fonte (Inter→Urbanist), corpo 15→16 px e moldura em `.product-workspace:not(.sap-workspace)`; atinge as ~80 telas do Nexo (inclusive as do médico) e é onde moram os riscos de regressão silenciosa (negrito sintético, tema escuro persistido no navegador, ordem de CSS entre chunks). (3) **Testes**: três specs e2e existentes esperam o menu antigo e um deles (`navigation-architecture.spec.ts`, 1º teste) já está desatualizado no HEAD.

A Phase 2 ainda está executando (02-01 mergeado; 02-02..04 não). 02-02 edita `app-shell.tsx`, `_authenticated.admin.tsx` e `_authenticated.sap.tsx` (marca `data-origem`, `registrarBloqueada`, prop `origem` do `BottomSheet`); 02-03 edita `_authenticated.admin.conferencia.tsx` e cria `folhasDaArvore` (reaproveitável pelo teste do registro). Esta fase reescreve os mesmos trechos de `app-shell.tsx` e `admin.tsx`: **o plano não deve ser executado antes do merge da Phase 2** e a mudança que esconde telas só pode ser publicada depois dos 7 dias de log (D-14). A parte visual pode ser planejada como plano separado dentro da fase, mas ela troca o visual de todas as telas, inclusive as do médico, então precisa do mesmo cuidado de regressão.

**Primary recommendation:** criar `src/lib/registro-de-telas.ts` (puro, 85 linhas + 2 atalhos de rótulo, `situacao` + `flags`), `MenuEquipe` e `BuscaDeTelas` compartilhados montados nas duas cascas, manter `nav.ts` intacto para o médico, carregar Urbanist com pesos `400;500;600;700` (mesmo arquivo variável, custo zero, evita negrito sintético), isolar o visual em `src/styles/nexo-system.css` com seletor `.app.product-workspace:not(.sap-workspace)`, e travar a publicação do plano de menu atrás do marco D-14.

## Project Constraints (from CLAUDE.md)

Não há `./CLAUDE.md` nem `.claude/CLAUDE.md` (`ls` confirma ausência) [VERIFIED: ls]. O `config.json` aponta `claude_md_path: "./.claude/CLAUDE.md"`, que não existe. Diretivas efetivas vêm de `.planning/codebase/CONVENTIONS.md` e `PROJECT.md`:

- Arquivos kebab-case; funções e domínio em português; `interface` para formas, `type` para uniões; strings com aspas duplas, ponto e vírgula, 2 espaços [CITED: .planning/codebase/CONVENTIONS.md].
- Lógica de negócio pura em `src/lib/*.ts`, chamada direto por `scripts/test-*.ts` (sem navegador) [CITED: CONVENTIONS.md "Function Design"].
- `src/routeTree.gen.ts` é gerado e **ignorado pelo git** (`.gitignore:11`) [VERIFIED: .gitignore]; `npm run typecheck` roda `routes:generate` antes de `tsc`. O teste do registro lê esse arquivo, então só roda depois de `npm run routes:generate` (ou build/dev).
- Comentários em português explicando o porquê.
- Sistema visual: texto com sentido ≥14 px, alvo de toque ≥44 px, reutilizar `dbx-*` antes de criar componente, roxo só em IA [CITED: PROJECT.md Constraints].
- Mudança de banco em produção: só o João roda. **Esta fase não precisa de migration** (nada novo em `api/`, nada em `sap_*`).
- Vercel Hobby 12/12 funções: nada novo em `api/`.
- Uma fase, um PR; PR para a base `claude/doctor-creator-hub-nixvw6` [CITED: 02-CONTEXT.md D-15].
- Cada fase termina com print do site no ar conferido.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Registro de telas (`situacao`, rótulos, chips) | Browser / Client (módulo puro em `src/lib`) | — | Dado estático de produto; sem rede (UI-SPEC "busca é local") |
| Quem pode abrir a tela (autorização) | API / Backend (RLS Supabase, `is_app_admin`) | Browser (`beforeLoad` de `/admin` e `/sap`) | `situacao` é só interface; hidden ≠ bloqueado. Nenhuma guarda nova |
| Menu de 3 itens + subtelas | Browser / Client (React) | — | Substitui `GRUPOS` de `admin.tsx` e as áreas do `app-shell.tsx` para a equipe |
| Busca Cmd+K / "Buscar tela" | Browser / Client | — | Filtro local sobre o registro, ≤200 ms por tecla |
| Última clínica aberta | Browser (localStorage, só UUID) | — | Preferência por navegador (decisão do João) |
| Redirect das rotas tiradas | Browser (`beforeLoad` do roteador) | — | SPA sem SSR; padrão já usado em 12 rotas |
| Log de abertura com origem | Browser → Database (insert sob RLS, Phase 2) | — | Esta fase só mantém `data-origem` |
| Tokens, fonte, moldura | CDN / Static (CSS + `index.html`) | Browser | CSS por variáveis; fonte via Google Fonts |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-router` | `^1.168.25` no package.json (UI-SPEC cita 1.170.45) | `beforeLoad`, `redirect`, `Link`, `router.routesById` | Já é o roteador do app [VERIFIED: package.json:`"@tanstack/react-router": "^1.168.25"`] |
| `react` | `^19.2.0` | Componentes `MenuEquipe`, `BuscaDeTelas`, `AvatarGerado` | Já em uso |
| `lucide-react` | `^0.575.0` | **Mantido** nas telas de conteúdo (116 arquivos importam) | Não migrar nesta fase [VERIFIED: grep: 116 arquivos] |
| `@playwright/test` + `@axe-core/playwright` | `1.64.1` / `4.14.0` | e2e e axe wcag2a/wcag2aa | Já em uso [VERIFIED: package.json] |
| `tsx` | `^4.19.2` | `scripts/test-*.ts` | Padrão dos testes de lógica [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tabler/icons-react` | 3.51.0 (publicado 2026-11-08) ou 3.50.0 (2026-10-27) | Ícones Tabler traço 1,5 (menu, busca, chips) | Opção A do UI-SPEC. **SUS pelo seam: "too-new"** — ver Package Legitimacy Audit |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@tabler/icons-react` | SVG inline em `src/components/icons/tabler.tsx` (~20 ícones) | Zero dependência e zero risco de barrel no dev server do Vite; cada ícone novo é cópia manual (MIT). Recomendado se o tamanho do pacote ou o arranque do `vite dev` piorarem |
| Um registro novo | `situacao` dentro de `NavTab` | `NavTab` cobre 30 das 85 rotas (nenhum `NavTab` para admin, SAP, `analisar`, `automacoes`, `consultas`, `conversas`, `marketing`, `vendas`, `aquisicao`, `assistentes-ia`); a pesquisa de milestone já previa `situacao` em `NavTab`, mas o ganho de teste vem do registro por rota |

**Recomendação de ícones (decisão para o planner):** usar **opção B (SVG inline) para a Phase 3** e reavaliar na Phase 9. Motivos medidos: (a) só ~20 ícones novos entram aqui (menu 3, subtelas, busca, chips, chevrons, X, logout, menu-2); (b) `@tabler/icons-react` tem `sideEffects:false` e só o ESM no `main/module`, **sem campo `exports`** [VERIFIED: npm view `main`, `module`, `types`; `exports` ausente], então não há caminho de importação por ícone documentado, e o dev server do Vite transforma o barril inteiro [CITED: vite.dev/guide/performance; github.com/tabler/tabler-icons/issues/1133 — resultado de busca, tema genérico de barrels]; (c) o seam marcou SUS. Se o João/planner preferir A, fixar versão exata, adicionar `checkpoint:human-verify` antes do `npm install` e medir `vite build` + tempo de `vite dev` antes e depois.

**Installation (somente se opção A):**
```bash
npm install --save-exact @tabler/icons-react@3.50.0
```
**Version verification:**
```bash
npm view @tabler/icons-react version license scripts.postinstall sideEffects
# version = '3.51.0' ; license = 'MIT' ; sideEffects = false ; sem postinstall
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tabler/icons-react` | npm | anos (versão 3.51.0 publicada há 1 dia) | 5.220.384 / semana | github.com/tabler/tabler-icons | **SUS** (motivo do seam: `too-new`, só pela versão mais recente) | Flagged — o planner insere `checkpoint:human-verify` antes de instalar; preferir a opção B (SVG inline) ou fixar 3.50.0 |

`gsd-tools query package-legitimacy check --ecosystem npm @tabler/icons-react` devolveu `"verdict": "SUS"`, `"reasons": ["too-new"]`, `"postinstall": null`, `"repoUrl": "git+https://github.com/tabler/tabler-icons.git"` [VERIFIED: seam, 2026-11-09]. `npm view ... scripts.postinstall` vazio [VERIFIED: npm registry]. O nome do pacote vem do UI-SPEC (aprovado pelo dono) e é o pacote oficial do Tabler; ainda assim o gate do projeto exige o checkpoint.

**Packages removed due to [SLOP] verdict:** nenhum
**Packages flagged as suspicious [SUS]:** `@tabler/icons-react` — planner insere `checkpoint:human-verify` antes de instalar

## Architecture Patterns

### System Architecture Diagram

```
                      src/routeTree.gen.ts (gerado, 85 folhas do roteador)
                                   │ (lido só pelo teste)
                                   ▼
  src/lib/registro-de-telas.ts  ── linhas: {rota(routeId), situacao, rotulo, descricao, termos,
  (puro, sem React)                          area, icone, fonte, semSelo, congelado, soRedireciona,
                                             acesso, destino, adminOnly, precisaClinica}
        │                 │                         │
        │ menusEquipe()   │ buscarTelasEquipe()     │ tiradas → `destino`
        ▼                 ▼                         ▼
  MenuEquipe         BuscaDeTelas              beforeLoad de /$clientId/marketing
  (3 itens + subtelas) (dialog, Cmd+K, filtro      throw redirect(destino, search preservado)
        │              local, "Ver todas")
        │                 │ clique → <Link> (data-origem="menu" | "busca")
        ▼                 ▼
  ┌──────── Casca da clínica (AppShell) ────────┐   ┌──── Casca /admin (AdminLayout) ────┐
  │ equipe: MenuEquipe + BuscaDeTelas           │   │ MenuEquipe + BuscaDeTelas           │
  │ médico: AREAS/AVANCADO de nav.ts (inalterado)│   │ (sem clínica atual → "última clínica")│
  └───────────────┬──────────────────────────────┘   └───────────────┬────────────────────┘
                  ▼                                                   ▼
        router.history (Phase 2: origemDaNavegacao lê o marcador data-origem)
                  ▼
        insert em rota_acessos (RLS)  ← origem: menu | busca | link | direto | redirecionamento | bloqueada
```

Fluxo principal: usuário da equipe aperta Cmd+K → `BuscaDeTelas` filtra o registro localmente → clique em resultado → `<Link>` dentro de `[data-origem="busca"]` → listener da Phase 2 grava o marcador → o router resolve → linha em `rota_acessos` com origem `busca`.

### Recommended Project Structure
```
src/
├── lib/
│   ├── registro-de-telas.ts      # NOVO: 85 linhas + atalhos tirados; funções puras (menu, busca, agrupamento)
│   ├── ultima-clinica.ts         # NOVO: ler/gravar `nexo:ultima-clinica` (só UUID validado)
│   └── nav.ts                    # INALTERADO (menu do médico). Só reexporta o que o registro precisar
├── components/
│   ├── menu-equipe.tsx           # NOVO: 3 itens + subtelas; usado pelas 2 cascas
│   ├── busca-de-telas.tsx        # NOVO: BottomSheet + Cmd+K + lista + "Ver todas"; usado pelas 2 cascas
│   ├── nx-chip.tsx               # NOVO: sem selo / congelado
│   ├── avatar-gerado.tsx         # NOVO: SVG determinístico (FNV-1a)
│   └── app-shell.tsx             # EDITA: ramo `ehEquipe` troca barra lateral/folha/cabeçalho; ramo médico fica
├── routes/
│   ├── _authenticated.admin.tsx  # EDITA: `GRUPOS` sai; MenuEquipe + BuscaDeTelas entram
│   └── _authenticated.$clientId.marketing.tsx  # EDITA: destino vem do registro
├── styles/nexo-system.css        # NOVO: tokens, moldura, chips, movimento (escopo Nexo)
└── hooks/use-theme.ts            # INALTERADO (SAP segue usando)
scripts/test-registro-de-telas.ts # NOVO: 85 = 14 + 70 + 1 (+2 atalhos), destinos, acesso, SAP
```

### Pattern 1: Registro por rota, não por rótulo
**What:** uma linha por `routeId` do roteador (`/_authenticated/$clientId/pacientes`, …) com `situacao`. Rótulo, descrição e termos de busca **importados** de `NavTab` (`AREAS`, `AVANCADO`), de `ITENS` (`sap-navigation.ts`) e do `ITENS` do admin (que hoje é privado de `admin.tsx:20-30`; copiar as 9 strings para o registro e testar cobertura, em vez de importar de um arquivo de rota, que é código dividido por chunk).
**When to use:** sempre que o teste precisar provar "toda rota tem destino".
**Example:**
```typescript
// Fonte: forma proposta; valores de rota lidos de src/routeTree.gen.ts (FileRoutesById)
export type Situacao = "viva" | "escondida" | "tirada";
export interface TelaDoRegistro {
  rota: string;                // routeId do roteador, ex.: "/_authenticated/$clientId/pacientes"
  situacao: Situacao;
  rotulo: string;
  area: "Resultados" | "Marketing" | "Comercial" | "Plano de ação" | "Relatórios" | "Administração" | "SAP";
  semSelo?: true;              // 6 telas (Decisão 3 do conselho)
  congelado?: true;            // SAP
  soRedireciona?: true;        // 10 escondidas + 1 tirada + a rota "/" (Phase 2: ROTAS_SO_REDIRECIONAM)
  acesso?: true;               // nunca escondida nem redirecionada (MENU-07)
  destino?: string;            // só `tirada`: para onde levar
  somenteAdmin?: true;         // admin/*, SAP, abas `admin: true` de nav.ts
  precisaClinica?: true;       // rota com $clientId
}
```

### Pattern 2: Componente compartilhado montado dentro de cada casca
**What:** `MenuEquipe` e `BuscaDeTelas` recebem `vis`, `clientId | null`, `dateRange` e `pathname` por props; nenhuma das duas cascas guarda lógica de menu. O atalho Cmd+K vive dentro de `BuscaDeTelas` (um `useEffect` com `document.addEventListener("keydown")`), não em `_authenticated.tsx`, para não ligar o atalho no SAP nem em `/bem-vindo`.
**When to use:** nas duas cascas da equipe.

### Pattern 3: `data-origem` no contêiner, nunca no link
O listener de clique da Phase 2 lê `closest('[data-origem]')`; os novos componentes colocam o atributo na `aside`/`nav`/`dialog`, como em 02-02 [CITED: 02-02-PLAN.md Task 2 e UI-SPEC "Marcas de origem"].

### Anti-Patterns to Avoid
- **Bloquear rota escondida por papel nova:** hidden ≠ blocked. Hoje não há `beforeLoad` de papel nas telas da clínica (só `/admin` e `/sap`, em `_authenticated.admin.tsx:12-15` e `_authenticated.sap.tsx:23-39`). Adicionar guarda a uma tela escondida geraria linhas `bloqueada` falsas e quebraria o acesso por link direto.
- **Substituir `AREAS` de `nav.ts`:** o menu do médico e o teste `scripts/test-workspace-navigation.ts` dependem dele.
- **Listar no resultado uma rota que só redireciona:** duplica o destino (ex.: `aquisicao` → painel do SAP). Ficam no registro (para o teste de contagem) e fora do índice de busca.
- **Mexer em `.sap-workspace`, `sap-workspace.css`, `sap-navigation.ts`, `_authenticated.sap.tsx` além do que 02-02 já faz.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lista de folhas do roteador | Lista digitada à mão | `folhasDaArvore(Object.keys(router.routesById))` de `src/lib/uso-das-telas.ts` (Phase 2, plano 02-03) | A regra "X é layout quando outro id começa com X + '/'; ids terminados em '/' são folhas" já está desenhada e dá 81; reaproveitar evita dois contadores |
| Diálogo com foco preso | Modal próprio | `BottomSheet` (`<dialog>` nativo, `app-shell.tsx:114-165`) | Foco, Esc e inércia do resto da página já resolvidos |
| Redirect com período | `window.location` | `throw redirect({ to, params, search })` em `beforeLoad` | Padrão das outras 11 rotas; preserva `search` |
| Contraste e anel de foco | Cálculo próprio | Tokens do UI-SPEC e o comando `node -e` do UI-SPEC | Já medido |
| Avatar | Biblioteca de avatares | `AvatarGerado` (SVG, hash FNV-1a) conforme UI-SPEC | Decisão do dono: arte própria, sem copiar a do designer |
| Detecção de preferência de movimento | JS | `@media (prefers-reduced-motion: no-preference)` | Estado final é o CSS base |

**Key insight:** o que parece "um menu" é três coisas independentes (registro, componentes, tema). O teste mais barato é o do registro (`tsx`, sem navegador); gaste a maior parte do esforço de verificação nos efeitos colaterais do tema nas 80 telas.

## Registro de telas — recontagem contra `src/routeTree.gen.ts`

**Método.** Extraí os ids de `FileRoutesById` (`src/routeTree.gen.ts`, interface `FileRoutesById`) e apliquei a regra de folha da Phase 2 (`folhasDaArvore`: id que termina em `/` é folha; os demais só se nenhum outro id começar com `id + "/"`). Resultado [VERIFIED: script em scratchpad sobre `src/routeTree.gen.ts`, 2026-11-09]:

- **81 folhas** autenticadas ou de acesso dentro da árvore `/_authenticated` mais `/sem-acesso` (confere com 02-03-PLAN: "80 folhas /_authenticated mais /sem-acesso").
- **+4 folhas fora de `/_authenticated`**: `/login`, `/reset-password`, `/conhecer`, `/qa/layout` (esta só existe em desenvolvimento: `beforeLoad: () => { if (!import.meta.env.DEV) throw notFound(); }`, `src/routes/qa.layout.tsx:20`).
- **= 85 folhas do roteador.** Os "90" do brief são os 90 arquivos de `src/routes` (`ls | wc -l` = 90) e incluem 5 arquivos que não são telas: `__root.tsx`, `_authenticated.tsx`, `_authenticated.$clientId.tsx`, `_authenticated.admin.tsx`, `_authenticated.sap.tsx`. 85 + 5 = 90.
- `/r/:slug` **não é rota do roteador**: é `rewrite` da Vercel para o dispatcher (`vercel.json`: `"source": "/r/:slug", "destination": "/api/sync/manual?r=:slug"`) [VERIFIED: vercel.json]. Entra no registro só como constante de acesso fora da árvore.

**Divisão proposta (a recontagem pedida):**

| Situação | Quantidade | Composição |
|---|---|---|
| viva | **14** | 7 telas de menu (Carteira, Resultados da clínica, Relatório do período, Etapas do CRM, Configurar este cliente, Conferência de dados, Integrações) + 7 de acesso (`/login`, `/reset-password`, `/conhecer`, `/bem-vindo`, `/oauth/consent`, `/sem-acesso`, e `/` — o resolvedor de entrada, que só redireciona) |
| escondida | **70** | `/qa/layout` (dev) + `/assistentes-ia` + 31 da clínica + 7 de `/admin` + **30 do SAP** (confere com "73 escondidas (30 do SAP)"). Dessas 70, **10 só redirecionam** (ficam no registro, fora do índice de busca): `$clientId/aquisicao`, `$clientId/conversas`, `admin/aquisicao`, `$clientId/sap/` e `sap/etapas|execucao|leitura|metas`, `sap/$clientId/semana`, `sap/$clientId/passo-a-passo` |
| tirada | **1 rota + 2 atalhos de rótulo** | `$clientId/marketing` (rota que só redireciona) + os rótulos "Planejar a semana" (`/ideias?visao=semana`) e "Encontrar ideias" (`/ideias?visao=ideias`); a rota `/ideias` fica (escondida) |
| **Total de linhas do registro** | **87** | 85 rotas + 2 atalhos = 14 + 70 + 3 |

**Como isso se compara ao brief (14 / 73 / 3 = 90).** A origem é o quadro "Decisão 2" do conselho [VERIFIED: leitura de `~/dev/nexo-arquitetos/saidas/20261109-141415/03_decisoes_do_arbitro.md`, linhas 1-35] e o inventário [VERIFIED: `~/dev/nexo-arquitetos/contexto/inventario-nexo.md`, que diz "90 rotas" sem listá-las]. O conselho soma "14 vivas, 73 escondidas (30 do SAP) e 3 TIRAR" = 90; a proposta anterior listava os 14 como "2 do médico, 3 da equipe, Resultados, Config, Etapas, 6 de infraestrutura" (`01_propostas.md:306`). Duas das 14 (Hoje, Ajuda e fontes) **não existem como rotas** (Phase 9). A recontagem acima fecha em 14 por outro caminho (7 telas existentes + 7 rotas de acesso) e em 70 escondidas (as 3 de diferença estão nos 5 arquivos que não são telas). **Os números 14/73/3 do ROADMAP precisam ser atualizados para 14/70/3 (87 linhas) depois da aprovação do João**; o ROADMAP já avisa que a divisão "é recontada contra esse conjunto na Phase 3". `[ASSUMED]` — a escolha de quais 7 telas são "vivas" vem da proposta do UI-SPEC (3 itens + 4 subtelas) a partir do quadro do conselho, não de uma lista aprovada pelo João.

### Classificação proposta por rota (85)

Legenda: **V** viva · **E** escondida · **T** tirada · `selo` = chip "sem selo" · `congel` = chip "congelado" · `redir` = só redireciona · `adm` = só admin do app (guarda existente) · `acesso` = MENU-07.

| Rota (id do roteador sem `/_authenticated`) | Rótulo (fonte) | Situação | Flags | Área antiga |
|---|---|---|---|---|
| `/login` | Entrar | V | acesso | — |
| `/reset-password` | Redefinir senha | V | acesso | — |
| `/conhecer` | Conheça o Nexo | V | acesso | — |
| `/bem-vindo` | Primeiro acesso | V | acesso | — |
| `/oauth/consent` | Consentimento OAuth | V | acesso | — |
| `/sem-acesso` | Sem acesso | V | acesso | — |
| `/` (índice) | resolvedor de entrada | V | acesso, redir | — |
| `/admin/` | Carteira ("Clientes do Nexo") | V | adm | Administração |
| `/$clientId/` | Resultados da clínica | V | **selo** | Resultados |
| `/$clientId/relatorio` | Relatório do período | V | **selo** | Relatórios |
| `/$clientId/crm-estrutura` | Etapas do CRM | V | adm (AVANCADO) | Administração |
| `/admin/$clientId` | Configurar este cliente | V | adm | Administração |
| `/admin/conferencia` | Conferência de dados | V | adm | Administração |
| `/admin/integracoes` | Integrações | V | adm | Administração |
| `/$clientId/pacientes` | Pacientes do período | E | **selo** | Resultados |
| `/$clientId/anuncios` | Resultados dos anúncios | E | **selo**, fonte anúncios | Marketing |
| `/$clientId/crm-painel` | Funil comercial | E | **selo**, fonte CRM | Comercial |
| `/$clientId/vendas-kommo` | Resultados por origem do CRM | E | **selo**, adm | Comercial |
| `/$clientId/conteudo` | Analisar desempenho | E | fonte Instagram | Marketing |
| `/$clientId/conteudo-comercial` | Conteúdo × Comercial | E | equipe | Marketing |
| `/$clientId/audiencia` | Público do Instagram | E | equipe | Marketing |
| `/$clientId/top` | Encontrar destaques | E | equipe | Marketing |
| `/$clientId/posts` | Consultar publicações | E | equipe | Marketing |
| `/$clientId/ideias` | Revisar roteiros | E | — | Marketing |
| `/$clientId/inteligencia-criativa` | Inteligência Criativa | E | adm | Marketing |
| `/$clientId/inspiracao` | Referências salvas | E | equipe | Marketing |
| `/$clientId/duvidas` | Dúvidas do público | E | equipe | Marketing |
| `/$clientId/campanhas` | Estratégias e campanhas | E | equipe | Marketing |
| `/$clientId/links` | Links rastreados | E | equipe | Marketing |
| `/$clientId/central-atendimento` | Central de atendimento | E | — | Comercial |
| `/$clientId/atendimento` | Qualidade do atendimento | E | equipe | Comercial |
| `/$clientId/crm-contatos` | Contatos e oportunidades | E | kanban | Comercial |
| `/$clientId/crm-guia` | Guia de organização do CRM | E | equipe | Comercial |
| `/$clientId/jornada` | Jornada comercial | E | adm | Comercial |
| `/$clientId/plano` | Plano da semana | E | — | Plano de ação |
| `/$clientId/reunioes` | Reuniões | E | adm | Plano de ação |
| `/$clientId/proximas-acoes` | Prioridades da equipe | E | equipe | Plano de ação |
| `/$clientId/agentes` | Agentes e entregas | E | equipe | Plano de ação |
| `/$clientId/oportunidades` | Oportunidades de melhoria | E | equipe | Plano de ação |
| `/$clientId/analisar` | Papel de cada funil (sem NavTab) | E | **sem rótulo hoje** | Comercial |
| `/$clientId/automacoes` | Automações (`PhasePlaceholder`) | E | **sem NavTab** | Plano de ação |
| `/$clientId/consultas` | O que virou paciente (`PhasePlaceholder`) | E | **sem NavTab** | Resultados |
| `/$clientId/vendas` | O que virou venda (`PhasePlaceholder`) | E | **sem NavTab** | Resultados |
| `/$clientId/aquisicao` | → painel do SAP | E | redir | SAP |
| `/$clientId/conversas` | → atendimento (aba conversas) | E | redir | Comercial |
| `/$clientId/marketing` | Visão geral de Marketing | **T** | redir | Marketing |
| `/assistentes-ia` | Assistentes de IA · Doctor Creator MCP | E | **sem NavTab** | Administração |
| `/admin/caixa` | Caixa de entrada | E | adm | Administração |
| `/admin/referencia` | Referência entre clientes | E | adm | Administração |
| `/admin/relatorios` | Relatórios da semana | E | adm | Administração |
| `/admin/agentes` | Central de Agentes | E | adm | Administração |
| `/admin/brain` | Brand Brain | E | adm | Administração |
| `/admin/equipe` | Equipe | E | adm | Administração |
| `/admin/aquisicao` | → `/sap` | E | adm, redir | Administração |
| `/sap/` | Todas as clínicas (SAP) | E | congel, adm | SAP |
| `/sap/comece`, `/sap/docs`, `/sap/guia`, `/sap/venda` | Comece aqui · Documentos do SAP · Como operamos · Diagnósticos de venda | E | congel | SAP |
| `/sap/$clientId/` + 18 filhas (`painel`, `plano`, `cronograma`, `sessao`, `onboarding`, `formulario`, `rastreamento`, `anuncios`, `etapas`, `papeis`, `leitura`, `execucao`, `midia`, `agentes`, `gerador`, `metas`, `documentos`) + `semana` e `passo-a-passo` (redir) | rótulos de `ITENS` em `sap-navigation.ts` | E | congel; `semana`, `passo-a-passo` redir | SAP |
| `/$clientId/sap/` + `etapas`, `execucao`, `leitura`, `metas` | → `/sap/$clientId/...` | E | congel, redir | SAP |
| `/qa/layout` | Layout de QA (só dev) | E | só em DEV | — |
| atalho `/$clientId/ideias?visao=semana` | Planejar a semana | **T** (rótulo) | — | Marketing |
| atalho `/$clientId/ideias?visao=ideias` | Encontrar ideias | **T** (rótulo) | — | Marketing |

Contagem conferida: 14 V + 70 E + 1 T (rota) = 85 rotas. A linha do SAP agrupa 30 rotas: 4 globais + `/sap/` + 20 de `/sap/$clientId` (índice + 19 filhas) + 5 de `/$clientId/sap`. (`/sap/$clientId/*` tem 19 filhas + índice, todas nomeadas na linha do SAP; o executor deve mesmo assim derivar as linhas do `routeTree.gen.ts`, não da tabela.)

**Rotas que o brief não nomeia — sinalizar ao planner/João (decisão 3 segue aberta; esta fase esconde, nunca apaga):**
1. `/` (índice autenticado) não aparece no quadro; proposto como viva/acesso (apagar ou esconder o resolvedor de entrada quebraria o login).
2. `/qa/layout`: fora dos 81 e só existe em DEV; o quadro diz "Layout de QA: ESCONDER". Proposto escondida e fora do índice de busca em produção (retorna `notFound`).
3. `analisar`, `automacoes`, `consultas`, `vendas`, `assistentes-ia`: sem `NavTab`; o executor precisa de rótulo e descrição novos (os três de `PhasePlaceholder` são telas "ainda não construídas" — candidatas naturais a "tirar de vez" na decisão 3, mas aqui ficam escondidas).
4. Os 4 "FUNDIR" do quadro (Pacientes/Funil/Jornada/Vendas Kommo → Resultados; Qualidade/Guia/Oportunidades/Prioridades → Clínica; anúncios/conteúdo → abas) só serão fundidos na v2; **hoje ficam escondidos**, como diz o texto do conselho ("FUNDIR só é executado na v2 ... Até lá a tela fica escondida").
5. `Relatório do período`: o quadro diz MANTER (equipe; médico depois do selo) e o UI-SPEC o põe como subtela de Clínica; proposto viva com chip `sem selo`.

## Menus, busca e papéis — como é hoje (com linhas)

**Papéis e visibilidade (`src/lib/nav.ts`).** Interface e lógica atuais [VERIFIED: nav.ts:433-457 e 484-487]:

```ts
export interface Visibilidade {
  isAdmin: boolean;
  ...
  papel?: "admin" | "owner" | "strategist" | "viewer" | null;
}
export function tabVisivel(t: NavTab, v: Visibilidade): boolean {
  return (
    (!t.atendimentoOperacional || v.isAdmin || v.papel === "owner" || v.papel === "strategist") &&
    (!t.kanban || !!v.crmOperacional) &&
    (!t.admin || v.isAdmin) &&
    (!t.equipe || (v.papel !== "owner" && v.papel !== "viewer")) &&   // nav.ts:451
    ...
```
`avancadoVisivel` devolve `[]` se `!v.isAdmin || papel === "owner" || papel === "viewer"` (nav.ts:484-487). `navegacaoClinica(areas, equipe)` recebe `vis.isAdmin` como `equipe` (app-shell.tsx:252). Logo, hoje o estrategista não admin vê as telas `equipe: true` mas o menu de "principais" do médico.

**Cmd+K e dialog hoje (`app-shell.tsx`).** `onKey` em 291-303 (`(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"`, alterna `busca`); `buscarTelas(vis, consulta)` em 280; dialog em 631-685 com `titulo="O que você quer fazer?"` e `nav className="workspace-search-results" aria-label="Resultados da busca"` (656-659). `buscarTelas` (nav.ts:510-531) indexa só `areasVisiveis(v)` + `avancadoVisivel(v)` e aplica filtro de fonte/`soCrm`/`semAudiencia` — por isso hoje as telas "somem" por clínica; o UI-SPEC manda a busca da equipe **não aplicar** esses filtros.

**Casca `/admin` (`_authenticated.admin.tsx`).** `beforeLoad` nega com `redirect({ to: "/" })` quando `!isAdmin` (12-15). Menu: `ITENS` (20-30) e `GRUPOS` (32-36), 9 itens; `<aside aria-label="Menu do admin">` (71); `<details className="ws-admin-menu">` no celular (95). **Não existe busca nem Cmd+K nesta casca.** Contém `TrocaProduto` em 75 e 97.

**Casca SAP.** `_authenticated.sap.tsx`: `beforeLoad` 23-39 (admin passa; senão exige clínica com SAP, senão `redirect` para `/$clientId/pacientes` ou `/sem-acesso`). `TrocaProduto atual="sap"` em 129. Não muda nesta fase.

**`TrocaProduto`** (`troca-produto.tsx`) é usado em `app-shell.tsx:368,577`, `admin.tsx:75,97` e `sap.tsx:129`. O UI-SPEC o tira das duas cascas do Nexo; a casca do SAP **mantém** o seletor (é o caminho de volta para o Nexo).

**Terceiro consumidor de `AppShell`:** `src/routes/qa.layout.tsx` (página de QA só em DEV). Mudanças de props do `AppShell` precisam manter essa tela compilando [VERIFIED: qa.layout.tsx:1-8, importa `AppShell`].

### Estrategista que não é admin do app — contradição a resolver

Resposta do João: "o estrategista não admin vê o menu novo da equipe (Carteira, Clínica, Conferência e fontes)". Mas **Carteira (`/admin`) e Conferência (`/admin/conferencia`) estão atrás de `is_app_admin`** (`_authenticated.admin.tsx:12-15`), e `useClientRole` calcula `papel` a partir de `client_members` só quando `!isAdmin` (`use-client-role.ts`). Um estrategista não admin que clique em Carteira cai em `redirect({ to: "/" })` (e, com a Phase 2, grava `bloqueada`). **Recomendação ao planner:** `ehEquipe = isAdmin || papel === "strategist"`; o menu desse perfil mostra os itens que ele realmente abre (Clínica com subtelas `equipe`, sem "Configurar este cliente"), mais a busca filtrada pelo mesmo critério (`somenteAdmin` e SAP fora); **pedir ao João que confirme** que não quer abrir `/admin` ao estrategista (isso seria mudança de autorização, fora desta fase). Tratado no Open Questions #2. Não foi possível contar estrategistas não admin em produção (SQL vedado).

## Rotas tiradas e destinos

| Tirada | Hoje | Destino proposto | Justificativa |
|---|---|---|---|
| `/$clientId/marketing` | `beforeLoad` já faz `throw redirect({ to: "/$clientId/conteudo", params: { clientId: params.clientId }, search: search as never })` (`_authenticated.$clientId.marketing.tsx:5-7`); o comentário diz "A 'Visão geral de Marketing' repetia o menu lateral" | **Manter `/$clientId/conteudo`** (rota existe; médico ainda a alcança pelo próprio menu; sem 404; período preservado porque `search` é repassado) e registrar o destino em `destino` do registro | Mudança zero de comportamento; trocar para `/$clientId` mudaria favoritos de quem já cai em conteúdo. Alternativa: `/$clientId` (viva). `[ASSUMED]` |
| rótulo "Planejar a semana" (`/ideias?visao=semana`) | `NavTab` em `nav.ts:183-191` | **Não é redirect**: `/ideias` continua abrindo as 3 visões (`validateSearch: parseContentViewSearch`, ideias.tsx:71; alternância no próprio corpo da tela, ideias.tsx:751-771). "Tirar" = o rótulo sai do menu e da busca da equipe | A rota fica (quadro do conselho) |
| rótulo "Encontrar ideias" (`/ideias?visao=ideias`) | `nav.ts:192-200` | idem | idem |

**Qual dos 3 rótulos de `/ideias` fica?** O quadro não diz. Proposto: fica "Revisar roteiros" (visão padrão, `nav.ts:174-182`) como a linha `escondida` da rota; saem "Planejar a semana" e "Encontrar ideias". `[ASSUMED]` — confirmar com o João. **O menu do médico não muda**, então `AREAS` continua com os 3 rótulos (os testes `scripts/test-workspace-navigation.ts` e `navigation-architecture.spec.ts` dependem deles); "tirada" vale para o menu e a busca da equipe.

**O que o teste de MENU-04 prova na prática:** (a) `/$clientId/marketing?preset=7d` chega em `/$clientId/conteudo?preset=7d`; (b) `/ideias?visao=semana` e `?visao=ideias` continuam abrindo a tela certa (sem 404); (c) nenhum resultado da busca traz as 3 linhas tiradas.

**Guardas por papel nas escondidas.** Nenhuma tela escondida ganha `beforeLoad`. O que decide acesso continua sendo (i) RLS no Supabase e (ii) `beforeLoad` de `/admin` e `/sap`. O registro só alimenta o índice de busca com filtro de papel (`somenteAdmin`, SAP).

**Rotas de acesso (MENU-07).** Teste dedicado: toda linha com `acesso: true` tem `situacao === "viva"` e **não** tem `destino`; o conjunto de ids de acesso é exatamente {`/login`, `/reset-password`, `/conhecer`, `/_authenticated/bem-vindo`, `/_authenticated/oauth/consent`, `/sem-acesso`, `/_authenticated/`} mais a constante `/r/:slug` (fora da árvore). Nenhum arquivo dessas rotas é editado nesta fase.

## Busca para a equipe

- **Índice** = linhas do registro com `situacao !== "tirada"`, `!soRedireciona`, filtradas por papel (`somenteAdmin` só com `isAdmin`; SAP só `isAdmin`). Sem filtro de fonte/`soCrm`/`semAudiencia` (UI-SPEC). Quando a clínica atual não tem a fonte, a linha de apoio diz "Sem {Instagram|anúncios|CRM|atendimento} nesta clínica" e o link continua abrindo. Para isso o registro guarda `fonte?: Fonte` (já existe em `NavTab`) e a função recebe `fontes` da clínica atual.
- **Ordem** (UI-SPEC): título começa com o termo > título contém > descrição/termos; empate: vivas antes de escondidas, depois ordem do registro. Normalização NFD como em `buscarTelas` (nav.ts:514-518).
- **Links com clínica.** Rotas com `$clientId` precisam de um id: na casca da clínica é o `clientId` atual; na casca `/admin` é a **última clínica** (`nexo:ultima-clinica`). Sem clínica lembrada, a linha mostra "Escolha uma clínica primeiro" e leva a `/admin`. Isto não está no UI-SPEC (Open Question #3). Gravar a última clínica em `ClientLayout` (efeito quando `clientId` casa com UUID) e ao abrir `/admin/$clientId`.
- **Teclado/ARIA**: reaproveitar `BottomSheet` (`data-dialog-focus`, `aria-label=titulo`). `↓` do campo vai ao primeiro resultado; `Enter` abre o primeiro.
- **Celular**: botão "Buscar tela" no cabeçalho de 56 px; hoje o cabeçalho tem só um `.icobtn` de ícone com `aria-label="Encontrar uma ferramenta"` (app-shell.tsx:449-456). A barra inferior `nav.bottomnav aria-label="Áreas"` (530-552) continua para o médico e some para a equipe.
- **`data-origem`**: `BuscaDeTelas` põe `data-origem="busca"` na `nav` de resultados e no `details` "Ver todas" (UI-SPEC "Marcas de origem"); `MenuEquipe` põe `data-origem="menu"` na `aside` e na folha. 02-02 introduz a prop `origem` do `BottomSheet` — a Phase 3 deve usá-la, não reinventar.

## Sistema visual — onde mora o quê e como isolar o SAP

**Camadas de CSS (ordem de carga em `src/main.tsx`)**: `./styles.css` → `./nexo.css` → `./styles/product-workspace.css` [VERIFIED: main.tsx:6-8]. Telas e componentes puxam o resto de forma tardia: `app-shell.tsx` importa `workspace-navigation.css` e `databoard-shell.css` (linhas 37-38); `databoard.css` vem das telas (`_authenticated.admin.index.tsx`, `pacientes.tsx`, `databoard-*`). Com `autoCodeSplitting: true` (vite.config.ts) esses CSS caem em chunks de rota carregados **depois** do CSS de entrada.

**Consequência (armadilha de cascata):** um `nexo-system.css` importado no `main.tsx` perde empates de especificidade para `workspace-navigation.css` e `databoard.css` carregados depois. Mitigação: todo seletor novo começa por `.app.product-workspace:not(.sap-workspace)` (especificidade 0,3,0), ou o arquivo é importado dentro de `app-shell.tsx` e do layout admin por último. `[ASSUMED]` sobre a ordem final dos `<link>` do build; medir com `document.styleSheets` no e2e (UI-SPEC pede V9/V12).

**Escopo do Nexo vs SAP.** As três cascas usam `div.app.product-workspace`: clínica (`app-shell.tsx:343-345`, com `workspace-guided`), admin (`admin.tsx:70`, `workspace-admin`), SAP (`sap.tsx:119`, `sap-workspace`) [VERIFIED]. `product-workspace.css` tem 175 ocorrências de `.product-workspace`; o bloco de tokens é `.product-workspace` (linhas 2-33), com variantes escuras `:root[data-theme="dark"] .product-workspace` (34) e `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .product-workspace` (57-58). Estas têm especificidade 0,3,0 e **vencem** `.product-workspace:not(.sap-workspace)` (0,2,0): é preciso reescopá-las para `.product-workspace.sap-workspace` (o SAP herda o escuro genérico hoje) ou o sempre-claro do UI-SPEC não funciona para quem tem `dc:tema=dark` salvo.

Outros blocos escuros que atingem o Nexo e precisam do mesmo reescopo: `databoard.css:4-6` (`:root[data-theme="dark"] .dbx` e a media query), `nexo.css:9-10` (escuro de `:root`, usado pelas páginas públicas e pelos tokens-base), `styles.css:23-46` (`@media dark` e `:root[data-theme="dark"]` de `:root`). Estes últimos definem `--page`, `--ink` etc. no `html`; dentro de `.product-workspace` o bloco do UI-SPEC redeclara tudo, mas **o fundo de `html`/`body` entre a moldura e a borda da janela continua escuro** (margem de 16 px da moldura). Mitigação: `html:has(.product-workspace:not(.sap-workspace)), body:has(...) { background: …gradiente…; color-scheme: light }`. `[ASSUMED]` suporte a `:has` (Safari 15.4+, Chrome 105+); alternativa: padding no `.app` em vez de margem.

**`use-theme.ts` (`dc:tema`, `dc:accent`).** `aplicarTemaSalvo()` roda em `main.tsx` antes do React e põe `data-theme`/`data-accent` em `<html>`. Achados [VERIFIED: grep]:
- `data-accent` **não tem nenhuma regra CSS** (`grep -n "data-accent" src/*.css src/styles/*.css` = vazio); `ThemeMenu` (`theme-menu.tsx`) não é importado por ninguém. Logo `dc:accent` já é inerte. Nada a fazer além de não reintroduzir.
- O único controle de tema é `TemaBotoes` em `app-shell.tsx:167-187`, usado em 436 (barra) e 628 (folha). `padrão: claro` — `temaValido(null)` devolve `"light"` (use-theme.ts), então só quem clicou "Escuro" ou "Sistema" tem tema escuro persistido.
- Resolução recomendada para o item "unresolved" do UI-SPEC: **remover `TemaBotoes` e o import de `useTheme` do `app-shell.tsx`**, **deixar o hook e `aplicarTemaSalvo` como estão** (o SAP depende do `data-theme` global) e **reescopar o CSS escuro** para `.sap-workspace`. O SAP continua escuro/claro como antes; não há botão para mudar (já não havia no SAP). Teste e2e `product-design.spec.ts` "theme preference stays synchronized…" (usa `viewer`, linhas 253-283) **sai ou muda** — conflita com "sai das barras e da folha 'Menu' da equipe e do médico" (UI-SPEC linha 49).

**Fonte e pesos.** `index.html` linha 9 carrega `family=Inter:wght@400;500;600;700`; `styles.css:67` fixa `font-family:"Inter"`, `font-size:15px`, `font-feature-settings:"cv11","ss01"`. O UI-SPEC pede Urbanist `wght@400;500` apenas. **Risco medido:** o código usa pesos ≥600 em 133 declarações CSS (`grep -rhoE "font-weight: ?[6-9][0-9]{2}" src | wc -l`), 652 `font-semibold`, 22 `font-bold`, 374 aberturas de `<b>`/`<strong>`. Com só 400 e 500 carregados, o navegador sintetiza negrito (ou cai em 500) em todas essas telas. A resposta do Google Fonts mostra que 400 e 500 apontam para o **mesmo arquivo** woff2 de cada subconjunto (fonte variável) [VERIFIED: curl em `https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap`: `…/L0x-DF02iFML4hGCyMqlbS1miXK2.woff2` repetido para 400 e 500; arquivo de 27.812 bytes]. **Carregar `wght@400;500;600;700` não custa download extra.** Mantém o contrato (corpo 400, títulos 500 nas telas novas) sem degradar as 80 telas antigas. Alternativa de baixo custo se o João exigir só 2 pesos: `font-synthesis-weight: none` no corpo e aceitar títulos antigos em 500. `[ASSUMED]` comportamento de síntese de negrito do Chrome/Safari; conferir por captura.

`tabular-nums`: não verifiquei se a Urbanist traz `tnum` (sem `fonttools` no ambiente). `[ASSUMED]` — o e2e pode medir `getBoundingClientRect().width` de "1111" vs "0000" com `font-variant-numeric: tabular-nums`; o UI-SPEC já aceita registrar no SUMMARY.

**Corpo 15→16 px.** `styles.css:67` e `styles.css:450` (`@media (max-width:639px){ body{font-size:15px}`) fixam 15 px; o UI-SPEC pede 16. Atinge todas as telas: pede o teste de rolagem horizontal a 375 e 1440 px já listado (V7) em uma amostra de telas (uma por área antiga), não nas 80.

**Cores do Nexo hoje (confirma o UI-SPEC).** `product-workspace.css` linhas 2-33: `--accent:#194f73`, `--side:#101f30`, `--action-bg:#163f5c`; `nav.side a[data-on]` usa `box-shadow: inset 3px 0 0 #e5c78e` e `background: var(--side-active)` (linhas ~160-170); `.product-workspace .kbar { background: #20364c; … }`. O `:root` de `styles.css` tem `--accent:#2563EB`, `--side:#111827`, `--ai:#7C3AED`. As 29 ocorrências de `var(--ai` e a disposição estão no UI-SPEC.

**Telas que declaram `--side-*`/tema próprio**: `TrocaProduto` usa `var(--side-active)` e `#fff` inline (troca-produto.tsx); sai das cascas do Nexo mas fica no SAP.

**Ícones.** `NavTab.Icone` é `LucideIcon` (nav.ts:56). O registro novo precisa de ícone por tela para a lista de resultados (UI-SPEC: "ícone Tabler da tela 20 px"): são ~60 telas abertas pela busca. **Decisão pragmática:** o registro guarda o `Icone` de lucide que já existe em `NavTab`/SAP/admin para a lista de resultados e usa Tabler/SVG só no cromo novo (menu, busca, chips). Isso contradiz uma leitura literal do UI-SPEC ("nenhum componente novo desta fase usa lucide") — **sinalizar**. Se o João exigir Tabler também nos resultados, a opção A (pacote) fica mais viável que B (60 SVGs).

## Avatar gerado (`AvatarGerado`) — onde pessoas aparecem hoje

`ClientAvatar` (`src/components/client-avatar.tsx`) é usado em **clínica**, não em pessoa: `app-shell.tsx:444,470` (cabeçalho e `workspace-clinic`), `admin.index.tsx` (cartões de clientes), `admin.$clientId.tsx`, `client-profile-form.tsx`, `admin-data.ts` [VERIFIED: grep]. Cor derivada do nome (`hsl(${h} 45% 42%)`) com matiz livre, podendo cair em roxo — por isso o UI-SPEC põe clínica em "tile de iniciais em degradê Cobalto". **Não existe hoje avatar de pessoa na casca.** O único local novo da Phase 3 é o bloco do usuário no rodapé da barra (40 px). A fonte de dados do nome é fraca: não há tabela de perfil lida pela casca nem `user_metadata.nome` (só `primeiro_acesso` é lido; `grep user_metadata` acha apenas essa chave). **Recomendação:** semente do hash = e-mail em minúsculas (`useAuth().user.email`); rótulo = e-mail (a linha "nome" do UI-SPEC fica vazia ou usa a parte local do e-mail). Open Question #4.

## Testes e comandos exatos

`package.json` scripts [VERIFIED: package.json]: `"test": "node scripts/run-tests.mjs"`, `"typecheck": "npm run routes:generate && tsc --noEmit"`, `"lint": "eslint ."`, `"test:e2e": "playwright test"`, `"test:interface": "node scripts/verify-nexo-interface.mjs"`, `"check": "npm run secrets:check && npm run lint && npm run typecheck && npm test"`. `run-tests.mjs` executa todo `scripts/test-*.ts` com `--import ./scripts/test-network-guard.mjs --import tsx`. CI (`.github/workflows/quality.yml`): `npm run check`, `npm run build`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, `npm run test:interface`.

**Specs afetadas pelo menu novo (equipe = `mockAccount(context, "admin")`):**
- `tests/e2e/workspace-navigation.spec.ts` (287 linhas; 2 testes com admin): menu de áreas, dialog "O que você quer fazer?", `Equipe e configuração` → reescrever para o menu de 3 itens e o dialog "Buscar tela".
- `tests/e2e/navigation-architecture.spec.ts`: o 1º teste (`Marketing opens an orientation page…`) **já está desatualizado no HEAD**: espera o heading "Visão geral de Marketing" e a URL `/marketing?preset=7d`, mas `marketing.tsx` só redireciona para `/conteudo` desde 1b84cea (06/11) e o texto "Visão geral de Marketing" só existe num comentário (`grep` em `src`). A spec foi tocada pela última vez em 5920fa2 (22/10) [VERIFIED: git]. Não executei a spec para não escrever PNGs fora do repositório (`const outputs = new URL("../../../../outputs/", import.meta.url)` resolve para `/Users/joao/outputs/`). **Wave 0: rodar o baseline e consertar ou remover antes de mudar o menu.** Os outros testes dela usam `viewer` (menu do médico, inalterado).
- `tests/e2e/product-design.spec.ts`: teste de tema (viewer) e `admin mobile: grouped navigation` (9 links em `.ws-admin-menu`) — o 2º muda para o cabeçalho do celular.
- `tests/e2e/numbers-first.spec.ts:114-120`: `mobile product switch remains available to the team…` (admin, procura `TrocaProduto` na folha "Navegar no Nexo") — **o seletor de produto sai** (UI-SPEC), reescrever.
- `tests/e2e/service-delivery.spec.ts:32`: `Áreas do Nexo` com 3 links, mas o ramo é `product === "hub"`; verificar o perfil usado antes de assumir impacto.
- `tests/e2e/rota-log.spec.ts` (Phase 2): testes (7)-(13) usam `viewer` e `aside[aria-label="Menu principal"]` — inalterados. (14)-(15) usam admin por URL — inalterados.
- `scripts/verify-nexo-interface.mjs` (`npm run test:interface`): só cita "Áreas do SAP" (SAP não muda), mas roda varreduras de contraste/overflow com fonte/tema novos; rodar como regressão visual.
- `scripts/test-workspace-navigation.ts`: **continua válido** (nav.ts não muda); acrescentar teste do registro à parte.

**Teste novo: `scripts/test-registro-de-telas.ts`** (auto-descoberto por `run-tests.mjs`; `import assert from "node:assert/strict"`, imprimir `test-registro-de-telas: ok`). Asserções: (1) `folhasDaArvore(ids de FileRoutesById)` + as 4 folhas fora de `/_authenticated` = 85; (2) toda folha tem exatamente 1 linha e toda linha de rota aponta para uma folha existente; (3) contagem por `situacao` = 14 / 70 / 1 (+2 atalhos = 3 tiradas); (4) SAP = 30 escondidas com `congelado`; (5) `acesso` ⊂ viva, sem `destino`; (6) toda `tirada` com rota tem `destino` que existe em `FileRoutesById` e não é `tirada`; (7) `semSelo` em exatamente as 6 rotas nomeadas; (8) nenhuma linha escondida tem `beforeLoad` novo (garantido por revisão, não por teste); (9) o índice de busca da equipe devolve 60 + vivas, nenhuma tirada, nenhuma `soRedireciona`. Se `src/routeTree.gen.ts` não existir, falhar com a mensagem "rode npm run routes:generate".

## Common Pitfalls

### Pitfall 1: Esconder antes da linha de base (D-14)
**What goes wrong:** o menu novo sobe no mesmo PR da Phase 2 ou logo depois do merge; a "linha de base" mede o efeito do menu, não o uso.
**How to avoid:** executar a fase só depois do merge da Phase 2 **e** de 7 dias corridos de linhas de admin e de viewer em `rota_acessos` (D-14; o João roda a migration). Prever um interruptor de build (constante no registro, ex. `MENU_EQUIPE_ESCONDE = true`) para o plano de menu poder ser mergeado e não publicado, ou ordenar o merge. A parte visual não depende do marco, mas muda todas as telas (item 7 abaixo).
**Warning signs:** `select min(criado_em)` de `rota_acessos` com menos de 7 dias no dia do merge.

### Pitfall 2: Conflito de merge com a Phase 2
02-02 edita `app-shell.tsx` (atributos `data-origem`, prop `origem` do `BottomSheet`), `_authenticated.admin.tsx` e `_authenticated.sap.tsx` (`registrarBloqueada(location.pathname)` antes dos `throw redirect`); 02-03 reescreve `_authenticated.admin.conferencia.tsx` (abas) e cria `uso-das-telas.ts`. A Phase 3 reescreve a barra lateral, a folha e o dialog do `app-shell.tsx` e todo o menu do `admin.tsx`. **Linhas citadas aqui ainda são as do HEAD (3ea6ca2) e vão deslocar.** O planner deve localizar por `aria-label`/`className`, e a Phase 3 deve **preservar** `registrarBloqueada(...)` no `beforeLoad` do admin e `data-origem` nos contêineres novos.

### Pitfall 3: Dark persistido atrás da moldura
Ver Sistema visual: `data-theme="dark"` vence `.product-workspace:not(.sap-workspace)` por especificidade e pinta o fundo de `html`. Verificação V12 precisa abrir o app com `localStorage.setItem("dc:tema","dark")` e comprovar fundo claro.

### Pitfall 4: Negrito sintético e quebra de largura
Pesos 600/650/680/700 em ~1.200 pontos do código (ver acima). Capturar `/${CID}/pacientes` e `/${CID}/` em 375 e 1440 antes e depois da troca de fonte.

### Pitfall 5: Ordem de CSS entre chunks
Ver "armadilha de cascata". Sintoma: o item atual do menu fica com o marcador dourado `#e5c78e` (regra `product-workspace.css` ~160-172) em vez da pílula degradê.

### Pitfall 6: Busca da equipe sem clínica (casca `/admin`)
~60 das telas abertas pela busca precisam de `$clientId`. Sem tratar "última clínica", o teste "abrem as escondidas" só funciona na casca da clínica.

### Pitfall 7: Estrategista não admin vê links que o `beforeLoad` bloqueia
Ver contradição acima; vira linha `bloqueada` no log e frustra o usuário.

### Pitfall 8: Rótulos finais (decisão 11) e testes
Texto solto dos itens em teste ou componente quebra quando o card sorting trocar os rótulos. Usar a constante única; os specs importam o valor (ou o `data-testid` equivalente) em vez de repetir "Conferência e fontes".

### Pitfall 9: `Ctrl+K` em casca sem busca
O listener do atalho hoje mora dentro de `AppShell`. Se `BuscaDeTelas` for montado em `AdminLayout`, o `useEffect` precisa de limpeza (`removeEventListener`) e de `e.preventDefault()` (já existe em 293-296).

### Pitfall 10: Telas só-redirect no índice
Se uma rota `soRedireciona` entrar no índice, o resultado leva a outra tela e o log mostra `redirecionamento` em vez de `busca` — o teste V2 ("origem = busca") falha para elas.

## Code Examples

### Redirect da rota tirada com destino vindo do registro
```typescript
// Fonte: padrão atual de src/routes/_authenticated.$clientId.marketing.tsx:5-7
export const Route = createFileRoute("/_authenticated/$clientId/marketing")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId/conteudo", params: { clientId: params.clientId }, search: search as never });
  },
});
```
(o registro guarda `destino: "/_authenticated/$clientId/conteudo"` e o teste confere que a string existe em `FileRoutesById`; a rota continua com o `to` literal porque o `to` do TanStack é tipado.)

### Última clínica (só UUID, validado na leitura)
```typescript
// Forma proposta (src/lib/ultima-clinica.ts); a chave é nova
const CHAVE = "nexo:ultima-clinica";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lerUltimaClinica(): string | null {
  try { const v = localStorage.getItem(CHAVE); return v && UUID.test(v) ? v : null; } catch { return null; }
}
export function gravarUltimaClinica(id: string) {
  try { if (UUID.test(id)) localStorage.setItem(CHAVE, id); } catch { /* sem storage */ }
}
```

### Fonte (index.html)
```html
<!-- Fonte: https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap (resposta verificada) -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap" />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5 áreas + "Equipe e configuração" no menu da equipe | 3 itens + busca com todas as telas | esta fase | `nav.ts` segue servindo o médico |
| Menu do admin com 9 itens (`GRUPOS`) | Mesmo `MenuEquipe` das duas cascas | esta fase | `GRUPOS`/`ITENS` do admin saem do menu e viram linhas do registro |
| Seletor Nexo/SAP em barra e folha | SAP achado pela busca com chip `congelado` | esta fase | o SAP mantém o seletor na própria casca |
| Inter 15 px, barra escura, marcador dourado | Urbanist 16 px, barra sobre moldura clara, pílula Cobalto | esta fase | ver Pitfalls 3-5 |

**Deprecated/outdated:** `ThemeMenu` (`theme-menu.tsx`) sem importadores; `dc:accent` sem CSS; o 1º teste de `navigation-architecture.spec.ts`.

## Runtime State Inventory

> A fase não é rename/refactor/migração de dados, mas esconde telas e troca tokens; o inventário mínimo abaixo evita surpresas.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `rota_acessos` (Phase 2) é só leitura aqui. Nenhum dado grava rótulos de menu | Nenhuma. Não há migration |
| Live service config | `vercel.json` rewrite `/r/:slug` e demais rewrites ficam como estão | Nenhuma |
| OS-registered state | Nenhum | Nenhuma — verificado: nada registra rótulos/paths de menu fora do repositório |
| Secrets/env vars | Nenhum | Nenhuma |
| Build artifacts | `src/routeTree.gen.ts` (gitignored, gerado) precisa estar atualizado para o teste do registro | `npm run routes:generate` antes do teste; CI já roda via `typecheck` |
| Navegador do usuário | `localStorage`: `dc:tema` (pode estar `dark`/`system`), `dc:accent` (inerte), `hub-sidebar-recolhida`, e a nova `nexo:ultima-clinica` | `dc:tema` persistido precisa ser neutralizado por CSS (Pitfall 3); `hub-sidebar-recolhida` continua válido |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | scripts, build | ✓ | v24.19.0 | — |
| `node_modules` (231 pacotes) | testes | ✓ | — | `npm ci` (STATE.md: Zod local 3.25.76 vs 4.6.7, rodar `npm ci` antes de mexer em schemas) |
| Playwright Chromium | e2e | ✓ | `~/Library/Caches/ms-playwright/chromium-1234/1243/1248` | `npx playwright install chromium` |
| Google Fonts (rede) | carregar Urbanist em produção | ✓ (curl 200 em 2026-11-09) | v18 | arquivo woff2 próprio em `public/` |
| `gsd-tools graphify` | contexto de grafo | ✗ (desabilitado) | — | — |
| `python fonttools` | checar `tnum` | ✗ | — | medir por e2e |
| Supabase de produção | log de 7 dias | não acessado (SQL vedado) | — | o João confirma a data de início |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** `fonttools` (medir `tnum` no navegador).

## Validation Architecture

> `workflow.nyquist_validation` é `false` em `.planning/config.json`, mas o pedido do orquestrador exige esta seção; mantida.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `tsx` + `node:assert/strict` para lógica; Playwright 1.64.1 + `@axe-core/playwright` 4.14.0 para UI |
| Config file | `playwright.config.ts` (preview em `127.0.0.1:5198`, Supabase falso `http://localhost:9`, `workers: 1`) |
| Quick run command | `npx tsx scripts/test-registro-de-telas.ts && npx tsx scripts/test-workspace-navigation.ts` |
| Full suite command | `npm run check && npm run build && npm run test:e2e && npm run test:interface` |

### Phase Success Criteria → Test Map
| Critério (ROADMAP) | Behavior | Test Type | Automated Command | File Exists? |
|--------------------|----------|-----------|-------------------|-------------|
| 1. Equipe vê só 3 itens; médico não muda | admin: `nav` "Menu da equipe" com 3 links a 1440 e folha a 375, nas 2 cascas; viewer mantém `AREAS` | e2e | `npx playwright test tests/e2e/menu-equipe.spec.ts` | ❌ Wave 0 |
| 1b. Médico inalterado | `buscarTelas`, `AREAS`, `AVANCADO` iguais | unit | `npx tsx scripts/test-workspace-navigation.ts` | ✅ |
| 2. 73 (→ 60 openáveis + SAP) escondidas abrem por Cmd+K e botão; abertura gravada com `busca` | para cada linha escondida não-redir: buscar pelo rótulo, abrir, conferir URL; POST de `rota_acessos` com `origem: "busca"` | e2e (uma por área) + unit (todas via índice) | `npx playwright test tests/e2e/menu-equipe.spec.ts tests/e2e/rota-log.spec.ts` | ❌ Wave 0 (spec novo; `rota-log.spec.ts` existe) |
| 2b. Botão "Buscar tela" ≥44 px, com texto, a 375 e 320 | `boundingBox()` ≥ 44; texto visível | e2e | idem | ❌ Wave 0 |
| 3. Tiradas levam à tela certa; acesso abre como antes; `sap_*` intocado | `marketing?preset=7d` → `conteudo?preset=7d`; 6 rotas de acesso abrem; `git diff --stat` | e2e + git | `npx playwright test tests/e2e/menu-equipe.spec.ts` ; `git diff --stat origin/claude/doctor-creator-hub-nixvw6 -- supabase 'src/lib/sap-*' src/sap-workspace.css 'src/routes/_authenticated.sap*'` | ❌ Wave 0 |
| 4. Registro: contagem fecha | 85 folhas = 14 + 70 + 1 (+2 atalhos = 3) | unit | `npx tsx scripts/test-registro-de-telas.ts` | ❌ Wave 0 |
| 5. Print do site no ar | menu da equipe (computador e celular) e tela escondida aberta pela busca | manual | — (checkpoint humano, `human_verify_mode: end-of-phase`) | manual |
| V7 acessibilidade | axe `wcag2a`+`wcag2aa` no menu, folha e diálogo a 375 e 1440 | e2e | `npx playwright test tests/e2e/menu-equipe.spec.ts` com `test.use({ reducedMotion: "reduce" })` | ❌ Wave 0 |
| V9/V12 tokens e claro | `grep` de hex solto e `#000`; fundo claro com `dc:tema=dark` | script + e2e | `npx tsx scripts/test-nexo-system-css.ts` (ou `grep`) ; e2e com `localStorage` | ❌ Wave 0 |
| V13 avatar determinístico | mesmo nome → mesmo SVG; nomes diferentes → traços diferentes | unit | `npx tsx scripts/test-avatar-gerado.ts` | ❌ Wave 0 |
| V14 movimento | `prefers-reduced-motion: reduce` → `opacity` 1 | e2e | `npx playwright test tests/e2e/menu-equipe.spec.ts` | ❌ Wave 0 |

`reducedMotion` existe em `ReducedMotion`/`reducedMotion: ReducedMotion` do `playwright/types/test.d.ts` [VERIFIED: node_modules/playwright/types/test.d.ts:6947 e 7756].

### Sampling Rate
- **Per task commit:** `npx tsx scripts/test-registro-de-telas.ts` e `npx tsx scripts/test-workspace-navigation.ts`
- **Per wave merge:** `npm run lint && npm run typecheck && npm test`
- **Phase gate:** `npm run check`, `npm run build`, `npm run test:e2e`, `npm run test:interface` verdes + print do site no ar

### Wave 0 Gaps
- [ ] Rodar o baseline de `npm run test:e2e` **antes** de editar nada (o 1º teste de `navigation-architecture.spec.ts` está desatualizado; contar o que já falha)
- [ ] `scripts/test-registro-de-telas.ts` — MENU-01, MENU-07
- [ ] `tests/e2e/menu-equipe.spec.ts` — MENU-02, MENU-03, MENU-04 (admin e strategist com `mockAccount`; o fixture hoje só tem `admin | viewer | anonymous`, então **estender `mockAccount` com `strategist`** ou criar `options.role`)
- [ ] `scripts/test-avatar-gerado.ts`
- [ ] Reescrever `workspace-navigation.spec.ts`, `product-design.spec.ts`, `numbers-first.spec.ts:114-120`
- [ ] Teste de pesos/negrito: captura de `/${CID}/pacientes` antes/depois

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não (fluxo de login não muda) | — |
| V3 Session Management | não | — |
| V4 Access Control | **sim** | RLS Supabase + `beforeLoad` de `/admin` e `/sap` continuam sendo a autorização; `situacao`/índice de busca são só interface; filtrar a busca por papel para não listar o que o usuário não abre |
| V5 Input Validation | sim | O campo de busca é filtro local sem rede (não vai a SQL/HTML); `nexo:ultima-clinica` validado por regex UUID na leitura antes de entrar em `params` |
| V6 Cryptography | não | — |

### Known Threat Patterns for SPA React + Supabase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Valor adulterado em `localStorage` vira parâmetro de rota | Tampering | Validar UUID; RLS barra clínica alheia (a tela abriria vazia/negada) |
| Esconder item ≠ proteger rota (falsa sensação de segurança) | Elevation of Privilege | Não confiar em `situacao` para autorização; nenhuma rota escondida perde a guarda que já tinha |
| Estrategista vê link para `/admin` e cai em `bloqueada` | Information Disclosure (baixa) | Filtrar índice/menus por `isAdmin` |
| XSS por rótulo de registro | Tampering | Rótulos são constantes do código; React escapa; nada vem de dado de usuário |
| Font externa (Google Fonts) como dependência de terceiro | Tampering/Availability | `display=swap` e fallback do sistema; hospedar o woff2 em `public/` é a alternativa sem terceiro |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Quais 7 telas são "vivas" (Carteira, Resultados da clínica, Relatório, Etapas do CRM, Configurar, Conferência, Integrações) | Registro | O teste 14/70/3 muda; o João pode querer outras |
| A2 | Destino de `marketing` continua `/conteudo` | Rotas tiradas | Favoritos/links caem em tela escondida; alternativa `/$clientId` |
| A3 | Dos 3 rótulos de `/ideias`, fica "Revisar roteiros" e saem "Planejar a semana" e "Encontrar ideias" | Rotas tiradas | Os dois rótulos errados saem da busca da equipe |
| A4 | Rotas que só redirecionam ficam fora do índice de busca (60 openáveis, não 73) | Busca | O critério "73 abrem" do ROADMAP precisa ser reescrito para o número real |
| A5 | Estrategista não admin: menu mostra só o que ele abre (Clínica), não os 3 itens | Papéis | O João esperava os 3 itens; mudar exigiria abrir `/admin` ao estrategista (autorização) |
| A6 | Ícones dos resultados da busca ficam em lucide (já nos `NavTab`) | Ícones | Contraria uma leitura literal do UI-SPEC |
| A7 | Carregar Urbanist com 600 e 700 evita negrito sintético e não custa download extra | Fonte | Se o João exigir só 400/500, as telas antigas ficam com negrito sintético ou 500 |
| A8 | Navegadores sintetizam negrito quando só 400/500 estão carregados | Fonte | Impacto estético menor se não sintetizarem |
| A9 | Ordem de `<link>` de CSS no build faz o CSS de entrada perder empates para CSS de chunk | Sistema visual | Mitigação de especificidade fica supérflua, sem prejuízo |
| A10 | `:has()` aceitável para pintar `html/body` claro | Sistema visual | Em navegador sem suporte a margem da moldura fica escura (só no dark persistido) |
| A11 | Urbanist tem `tnum` | Fonte | Colunas numéricas desalinham; `tabular-nums` sem efeito |
| A12 | `@tabler/icons-react` não tem caminho de importação por ícone documentado | Ícones | Se houver, o argumento contra o barril enfraquece |
| A13 | "Etapas do CRM" e "Relatório do período" ficam como subtelas de Clínica (UI-SPEC) | Registro | Ajuste só de menu |

## Open Questions (RESOLVED)

Resolvidas pelo João em 09/11/2026 (03-CONTEXT.md D-02..D-11) ou pelo Claude's Discretion do CONTEXT. O que continua em aberto está dito em cada item e não bloqueia a fase.

1. **A decisão 3 (telas removidas de vez) segue com o João; esta fase esconde.** — RESOLVED (provisório): D-07 + D-11 + D-04.
   - What we know: o quadro lista só 1 rota tirada de verdade (`marketing`) e 2 rótulos. Há candidatas óbvias (`automacoes`, `consultas`, `vendas` são `PhasePlaceholder`).
   - What's unclear: se "tirada" deve passar a significar mais do que isso.
   - Recommendation: manter 1 rota + 2 atalhos; não tirar nada além; registrar no SUMMARY as candidatas.
   - Resolução: D-11 aceita a decisão 3 como provisória (nada sai de vez nesta fase); D-07 (esconder não bloqueia nem apaga); D-04 fixa as 3 tiradas (1 rota + 2 atalhos de `/ideias`). Continua aberto com o João: a lista final do que sai de vez (Deferred no CONTEXT); muda depois sem refazer a fase.

2. **Estrategista não admin e as telas `/admin`.** — RESOLVED: D-03.
   - What we know: `/admin` e `/admin/conferencia` exigem `is_app_admin` (`_authenticated.admin.tsx:12-15`); o João disse que o estrategista não admin vê o menu novo.
   - What's unclear: se ele deve abrir Carteira/Conferência (isso muda autorização) ou ver só "Clínica".
   - Recommendation: mostrar só o que ele abre e perguntar ao João; não mexer em `is_app_admin`.
   - Resolução: D-03 — vê o menu novo só com "Clínica" e a busca das telas que ele abre; Carteira e Conferência ficam só para admin; nenhuma permissão muda. Nada em aberto.

3. **Busca na casca `/admin` para telas que precisam de clínica.** — RESOLVED: D-02.
   - What we know: ~60 das telas abertas pela busca têm `$clientId`; a casca `/admin` não tem clínica atual.
   - What's unclear: abrir na última clínica, abrir o seletor de clínica, ou desabilitar.
   - Recommendation: última clínica; sem ela, "Escolha uma clínica primeiro" levando a `/admin`.
   - Resolução: D-02 — última clínica aberta naquele navegador (só o id no armazenamento local); sem ela, fica na Carteira com a dica "Escolha uma clínica". Nada em aberto.

4. **Nome da pessoa para o `AvatarGerado` do rodapé.** — RESOLVED: Claude's Discretion do CONTEXT.
   - What we know: a casca só tem `user.email`; nenhum nome é lido.
   - Recommendation: semente = e-mail em minúsculas; rótulo = e-mail.
   - Resolução: CONTEXT (Claude's Discretion) fixa a semente pelo e-mail; os planos exibem a parte local do e-mail como nome e o e-mail completo abaixo (FA-11 no 03-01). Nada em aberto.

5. **Janela de publicação.** — RESOLVED: D-06.
   - What we know: D-14 exige 7 dias de log; "um PR por fase".
   - What's unclear: se o João aceita um PR separado só do visual antes do marco (quebra a regra de um PR por fase) ou prefere ordenar o merge do PR único.
   - Recommendation: um PR; plano de visual primeiro nas ondas; merge só depois do marco. Se quiser o visual antes, abrir um segundo PR e atualizar a regra.
   - Resolução: D-06 — um PR só para a fase (visual + menu), merge só depois dos 7 dias corridos de log em produção; o código pode ser escrito antes. Nada em aberto.

6. **ROADMAP diz 14/73/3 e "73 abrem".** A recontagem dá 14/70/3 e 60 openáveis por busca (+ as redirecionadas contam como "abrem" no destino). Pedir aprovação da recontagem e atualizar ROADMAP/REQUIREMENTS (MENU-01). — RESOLVED: D-04 + D-09.
   - Resolução: D-04 — o João aceitou 14/70/3 (87 linhas); das 70 escondidas, 60 abrem pela busca e 10 só redirecionam; ROADMAP e MENU-01 já atualizados. D-09 — no build de produção o índice tem 59 escondidas (a `/qa/layout` só existe em desenvolvimento, onde são 60). Nada em aberto.

7. **Pesos da Urbanist (400/500 vs 400–700).** Ver A7. — RESOLVED: Claude's Discretion do CONTEXT.
   - Resolução: CONTEXT (Claude's Discretion) — carregar Urbanist 400/500/600/700 (mesmo arquivo variável); FA-07 no 03-01. Nada em aberto.

Ainda provisório, sem bloquear a fase (D-11): decisões 5 (SAP escondido e congelado para todos) e 11 (rótulos "Carteira", "Clínica", "Conferência e fontes"), além da 3 acima; mudam depois sem refazer a fase. Menu do médico: itens e áreas iguais nesta fase, mas sempre claro e marca "N" Cobalto também para ele (D-10).

## Sources

### Primary (HIGH confidence)
- Código lido nesta sessão: `src/lib/nav.ts`, `src/lib/sap-navigation.ts`, `src/components/app-shell.tsx`, `src/routes/_authenticated.admin.tsx`, `_authenticated.sap.tsx`, `_authenticated.$clientId.tsx`, `_authenticated.tsx`, `_authenticated.index.tsx`, `_authenticated.$clientId.marketing.tsx`, `src/hooks/use-theme.ts`, `use-client-role.ts`, `use-auth.tsx`, `src/components/client-avatar.tsx`, `troca-produto.tsx`, `src/styles.css`, `src/styles/product-workspace.css`, `src/main.tsx`, `index.html`, `vite.config.ts`, `vercel.json`, `package.json`, `playwright.config.ts`, `.gitignore`
- `src/routeTree.gen.ts` (interfaces `FileRoutesById` e `FileRoutesByTo`)
- `.planning/phases/03-.../03-UI-SPEC.md`, `REQUIREMENTS.md`, `STATE.md`, `PROJECT.md`, `ROADMAP.md`, `02-CONTEXT.md`, `02-01-SUMMARY.md`, `02-02-PLAN.md`, `02-03-PLAN.md`, `.planning/research/SUMMARY.md`, `.planning/codebase/CONVENTIONS.md`, `CONCERNS.md`
- `~/dev/nexo-arquitetos/saidas/20261109-141415/03_decisoes_do_arbitro.md` (Decisões 1-6), `01_propostas.md:306`, `~/dev/nexo-arquitetos/contexto/inventario-nexo.md`
- npm registry (`npm view @tabler/icons-react`), seam `package-legitimacy check`
- `curl` de `fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap`

### Secondary (MEDIUM confidence)
- Vite performance guide (barrels): https://vite.dev/guide/performance — [citado via busca]
- https://github.com/tabler/tabler-icons/issues/1133 — [citado via busca; tema do barril]

### Tertiary (LOW confidence)
- Comportamento de síntese de negrito, `:has()`, `tnum` da Urbanist — `[ASSUMED]`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhum pacote obrigatório; a única dependência nova é opcional e sinalizada.
- Architecture: HIGH — registro/componentes/guardas lidos no código; MEDIUM na recontagem (interpretação do quadro).
- Pitfalls: HIGH para tema/dark, pesos e specs desatualizadas (verificados); MEDIUM para cascata de CSS.

**Research date:** 2026-11-09
**Valid until:** 7 dias para linhas de código (a Phase 2 muda `app-shell.tsx` e `admin.tsx`); 30 dias para o restante
