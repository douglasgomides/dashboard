# Phase 2: Log por rota - Research

**Researched:** 2026-11-09
**Domain:** log de uso por tela numa SPA TanStack Router + Supabase (RLS, pg_cron), sem dependência nova
**Confidence:** HIGH (gancho do router comprovado por execução; RLS/migrations lidos no repo). MEDIUM em: hosts de produção, `statement_timeout`, nomes de erro do PostgREST.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(copiado verbatim de `02-CONTEXT.md` `<decisions>`; o João respondeu "segue recomendação" para todos os pontos em 09/11/2026, revisáveis)

- **D-01:** Tabela `rota_acessos` (português, no padrão de `lista_acessos` previsto para a Phase 12). Campos: `id`, `criado_em` (timestamptz, default now()), `user_id` (default `auth.uid()`), `client_id` (nullable: rotas sem clínica, como `/admin`), `rota` (padrão da rota, ex. `/_authenticated/$clientId/resultados`, nunca a URL), `origem`, `papel`, `eh_equipe` (boolean), `sessao` (id aleatório por aba). — **Reversibility:** one-way — migration em produção que o João roda; renomear depois exige outra migration e muda as consultas.
- **D-02:** Gravação por insert direto do navegador via supabase-js sob RLS (insert do próprio `user_id`, incluindo admin sem linha em `client_members`); select só `is_app_admin()`. Sem dispatcher, sem função nova em `api/`, sem `sendBeacon`.
- **D-03:** Gancho único no router (`router.subscribe('onResolved')`, filtrando mudança de caminho), cobrindo o primeiro carregamento. Fire-and-forget: erro engolido, nunca trava nem atrasa a navegação.
- **D-04:** Grava só em produção (host de produção); preview e local não gravam, para não sujar a linha de base.
- **D-05:** Retenção bruta de 180 dias (cobre os 90 dias da decisão do SAP com folga e duas leituras trimestrais). Limpeza diária por `pg_cron` guardado (mesmo padrão de `resultado_pronto`/`resultados_diarios`), entregue na mesma migration. — **Reversibility:** costly — linhas apagadas não voltam; para aumentar, mudar o job antes do dia 180.
- **D-06:** Nunca gravar query string, hash, id de paciente/lead nem URL completa; `rota` é só o padrão com `$params`. `client_id` é o único id gravado.
- **D-07:** Mesma rota + mesma sessão dentro de 2 s conta uma vez (descarta duplicata de render/redirect). Reabrir depois disso conta de novo.
- **D-08:** Abertura pela equipe na tela de uma clínica grava o `client_id` da clínica e `eh_equipe = true`. A visão agregada separa sempre equipe × clínica; uso da clínica = `eh_equipe = false`.
- **D-09:** Os testes do João e da equipe entram no log (são uso real da equipe) e ficam separáveis por `eh_equipe`. Clínicas com `clients.eh_teste = true` ficam fora da visão agregada por padrão.
- **D-10:** `origem` com valores fechados: `menu`, `busca` (Cmd+K), `link` (clique em link dentro do app), `direto` (primeira carga ou URL digitada/favorito), `redirecionamento` (guardas e redirects), `bloqueada` (guarda de acesso negou). A origem `busca` já é marcada nesta fase no Cmd+K existente, para a Phase 3 só acrescentar as escondidas.
- **D-11:** Aba nova "Uso das telas" dentro de `/admin/conferencia` (tela que fica viva na v5; Relatórios do admin será escondida). Só admin vê.
- **D-12:** Mostra por rota: aberturas, pessoas distintas, última abertura e divisão por origem; filtro de período (7, 30, 90 dias) e chave equipe × clínica; lista também as rotas com 0 aberturas no período (a partir da árvore de rotas). Tabela simples, sem gráfico (sistema visual: sem pizza/rosca).
- **D-13:** Texto da aba sem jargão e sem conclusão: mostra contagem; não diz "tela inútil" nem sugere corte (corte é decisão do João, e "0 aberturas" nunca é prova sozinho).
- **D-14:** A Phase 3 só esconde telas depois de 7 dias corridos de log gravando em produção (uma semana inteira, com dia útil e fim de semana), não 24 h. As 24 h continuam sendo o critério de pronto desta fase (linhas de admin e de viewer aparecendo). ROADMAP atualizado.

### Claude's Discretion
- Todo o bloco acima foi delegado ("segue recomendação"). Detalhes como índices, nome da função de limpeza e forma do id de sessão ficam com o planner.

### Deferred Ideas (OUT OF SCOPE)
- Cmd+K mostrando telas escondidas e botão Buscar no celular — Phase 3.
- Usar o log para propor cortes ou fusões — decisão 3 do João e v2 (fusões só se o log mostrar telas abertas na mesma sessão).
- Critério mensurável de "log ligado" para liberar a v1.5 — o João fixa; medido na Phase 14.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOG-01 | Cada abertura grava rota padrão, clínica, papel, sessão e horário, inclusive da equipe admin | Gancho `onResolved` (provado por execução, §Architecture), trigger BEFORE INSERT que deriva `eh_equipe`/`papel` no banco, policy insert-own por `user_id` |
| LOG-02 | Cada registro diz a origem (menu, busca, link direto, redirecionamento, bloqueada) | Origem = ação de histórico (`PUSH`/`REPLACE`/`POP`) + `data-origem` em contêineres de menu/busca + marcador nos 2 guardas que negam |
| LOG-03 | Equipe admin vê visão agregada por rota e período | RPC `rota_acessos_resumo` (SECURITY INVOKER, RLS já limita a admin) + aba "Uso das telas" em `/admin/conferencia` |
| LOG-04 | Não deixa a navegação lenta e nunca grava query string, id de paciente ou URL completa | Fire-and-forget fora do caminho de navegação; `rota` só do `routeId`; CHECK no banco rejeita `?`/`#`; teste unitário e e2e |
</phase_requirements>

## Summary

O log cabe em **um módulo puro novo (`src/lib/rota-log.ts`), uma instalação em `src/main.tsx`, uma migration, um RPC e uma aba**. Nenhum pacote novo, nenhum arquivo novo em `api/` (hoje 11 funções em `api/admin` + `api/sync`; o limite do projeto é 12, nada é adicionado). O gancho `router.subscribe('onResolved')` foi **executado** (router-core 1.171.38, modo navegador) e confirmado: dispara no primeiro carregamento (`fromLocation` indefinido, `pathChanged: true`), traz o `routeId` da folha em `router.state.matches.at(-1)`, mudança só de query string dá `pathChanged: false`, e um redirect de guarda gera um `REPLACE` no histórico antes do `onResolved` final.

Três decisões de desenho que o planner deve travar, todas dentro do que o CONTEXT delega: (1) **`eh_equipe` e `papel` saem de um trigger BEFORE INSERT**, não do navegador. Isso resolve a pergunta 3 sem nenhum round-trip e sem expor o estado de auth fora do React (o `AuthProvider` guarda `isAdmin` em `useState`; não há acesso de fora). (2) **A origem vem de três sinais baratos**: a ação do histórico (`PUSH` = clique/`navigate`, `REPLACE` = redirect, `POP` = voltar/avançar, nenhuma = primeira carga), um atributo `data-origem` em 6 contêineres de menu/busca lido por um listener de clique delegado, e uma chamada explícita nos 2 guardas que negam acesso. (3) **A agregação é RPC no banco**, nunca consulta de linhas no cliente (PostgREST corta em 1000 linhas e a contagem sairia errada).

**Dois achados que mudam o plano.** (A) `npm run test:migrations` e `npx tsx scripts/test-db-security.ts` **já falham em HEAD**: `20261106130000_resultados_diarios.sql:88-89` chama `cron.job`/`cron.schedule` sem guarda e o PGlite não tem `cron` (`error: relation "cron.job" does not exist`, reproduzido nesta sessão). O mesmo vale para `scripts/banco/remontar.ts`. Nenhum teste de banco do log pode rodar antes de corrigir isso (Wave 0). (B) O `zod` local é 3.25.76 contra `^4.6.7` do lockfile (`npm ls zod` → `invalid`); esta fase não usa zod, mas `npm ci` é pré-requisito para `npm run check`.

**Primary recommendation:** módulo puro injetável (`montarLinha`, `origemDaNavegacao`, `deduplicar`, `deveGravar`) + instalação única em `main.tsx` + migration `20261109120000_rota_acessos.sql` (tabela, CHECKs, trigger, policies, RPC, cron guardado) + aba nova em componente separado para não colidir com a Phase 1 em `_authenticated.admin.conferencia.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Detectar abertura de tela e rota padrão | Browser / Client | — | `router.subscribe('onResolved')` só existe no cliente (SPA pura, `vite.config.ts` sem SSR) |
| Derivar `eh_equipe` e `papel` | Database / Storage | — | Trigger lê `is_app_admin()` e `client_members`; infalsificável e sem round-trip |
| Garantir "só insere o próprio, só admin lê" | Database / Storage | — | RLS é a fronteira de segurança do projeto (comentário em `vite.config.ts`: "Auth/RLS is enforced by Supabase, not by the server") |
| Gravar a linha | Browser / Client | Database | insert direto supabase-js (D-02); sem API |
| Origem da abertura | Browser / Client | — | Depende de clique/histórico, que só o navegador vê |
| Agregar por rota e período | Database / Storage | — | RPC; volume e limite de 1000 linhas do PostgREST |
| Lista de rotas com 0 aberturas | Browser / Client | — | `router.routesById` em tempo de execução (única fonte da árvore) |
| Retenção de 180 dias | Database / Storage | — | `pg_cron` guardado |
| Visão agregada | Browser / Client | — | Aba na rota admin, gate por `is_app_admin` já existente |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-router` | 1.170.45 instalado (`router-core` 1.171.38) [VERIFIED: node_modules/@tanstack/*/package.json] | `router.subscribe`, `router.history.subscribe`, `router.state.matches`, `router.routesById`, `router.getMatchedRoutes` | já é o router do app |
| `@supabase/supabase-js` | `^2.105.4` em `package.json` | `supabase.from("rota_acessos").insert(...)`, `.rpc(...)` | cliente único do app (`src/integrations/supabase/client.ts`) |
| `@tanstack/react-query` | `^5.83.0` | `useQuery` da aba (padrão do repo) | convenção: fetch em hook/`useQuery` |
| `@electric-sql/pglite` | `^0.5.10` | testes de migration/RLS | já usado por `scripts/test-migrations.ts` e `test-db-security.ts` |
| `tsx` + `node:assert/strict` | `^4.19.2` | teste unitário `scripts/test-rota-log.ts` | não há Vitest/Jest [VERIFIED: TESTING.md + `scripts/run-tests.mjs`] |
| `@playwright/test` | 1.64.1 | e2e `tests/e2e/rota-log.spec.ts` | já configurado |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| trigger deriva `eh_equipe`/`papel` | navegador calcula (RPC `is_app_admin` memoizado + `queryClient.fetchQuery(["papel", clientId, userId])`) | Aceitável, mas dá round-trip extra na 1ª abertura, precisa de plumbing fora do React e deixa os campos falsificáveis por qualquer logado. Usar só se o planner rejeitar trigger |
| `useRouterState`+`useEffect` em `AuthLayout` | `router.subscribe` em `main.tsx` | `AuthLayout` só monta depois de `loading=false`; perde a 1ª carga. D-03 já escolheu `router.subscribe` |
| marcador por `state` do histórico | `data-origem` + listener | `state` exigiria passar prop em cada `Link` e persiste no histórico |

**Installation:** nenhuma. `npm ci` (não `npm install`) antes de qualquer verificação para corrigir o zod local.

**Version verification:** versões lidas dos `package.json` instalados nesta sessão (acima). Nenhum pacote novo é recomendado.

## Package Legitimacy Audit

Nenhum pacote externo é instalado por esta fase. Auditoria dispensada.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 clique em <a data-origem=menu|busca>  ──► listener 'click' (capture, document) ─► marcador {origem, em}
 clique em outro <Link>/navigate()      ─┐
 URL digitada / 1ª carga                ─┤
                                         ▼
                              router.history.subscribe(({action}) )   action.type: PUSH | REPLACE | BACK | FORWARD | GO
                                         │  guarda "ultimaAcao"
                                         ▼
 router.load() ─► beforeLoad dos guardas ──► (nega) registrarBloqueada(location.pathname) ──┐
        │                │                                                                   │
        │                └─► throw redirect() ─► history REPLACE ─► nova rodada de load      │
        ▼                                                                                    │
 router.subscribe('onResolved', {pathChanged, toLocation})                                   │
        │ pathChanged? não ─► descarta (só query/hash mudou)                                 │
        ▼ sim                                                                                │
 folha = router.state.matches.at(-1)  ─► routeId, params.clientId, status                    │
        │ filtro: routeId começa com '/_authenticated' ou é '/sem-acesso'; status success    │
        │ clientId deve ser UUID (senão descarta a linha: 404 caiu em $clientId)             │
        ▼                                                                                    ▼
 origemDaNavegacao(ultimaAcao, marcador, primeira)  ──►  montarLinha  ──►  deduplicar(2 s, chave rota|client_id)
                                                                                 │
                                                          setTimeout 0 + try/catch, sem await
                                                                                 ▼
                        supabase.from("rota_acessos").insert({client_id, rota, origem, sessao})   (sem .select())
                                                                                 ▼
          RLS with check (user_id = auth.uid(), client_id nulo ou membro/admin) + trigger BEFORE INSERT
                          (user_id := auth.uid(); eh_equipe := is_app_admin(); papel := admin | client_members.role)
                                                                                 ▼
                                      public.rota_acessos ──► cron diário apaga > 180 dias
 Aba "Uso das telas" ─► supabase.rpc("rota_acessos_resumo", {p_dias, p_equipe, p_incluir_teste}) (invoker; RLS = só admin)
                      + lista de rotas de router.routesById ─► mescla com 0 aberturas
```

### Recommended Project Structure
```
src/lib/rota-log.ts                 # puro: tipos, deveGravar, rotaRegistravel, montarLinha, origemDaNavegacao, deduplicar, resumo -> linhas da tabela
src/lib/rota-log-instalar.ts        # efeitos: router.subscribe, history.subscribe, listener de clique, sessionStorage, supabase.insert
src/components/uso-das-telas.tsx    # a aba (useQuery + tabela); evita conflito com a Phase 1 no arquivo de conferência
src/routes/_authenticated.admin.conferencia.tsx   # só: renomear ConferenciaPage -> ConferenciaDados + wrapper com tablist
supabase/migrations/20261109120000_rota_acessos.sql
scripts/test-rota-log.ts            # unitário (padrão scripts/test-*.ts)
tests/e2e/rota-log.spec.ts
```

### Pattern 1: Gancho do router (provado por execução)
**What:** instalar uma vez, em `main.tsx`, logo depois de `getRouter()` e antes de `createRoot().render()` — `router.load()` só é chamado pelo `Transitioner` na montagem (`node_modules/@tanstack/react-router/src/Transitioner.tsx:90`, `router.load({ sync: true })`), então a primeira carga é capturada.
**Evidência (execução local, `node --conditions=browser`, árvore sintética igual à do app):**
```
RESOLVED /_authenticated/$clientId/pacientes {"clientId":"1111…"} success from undefined pathChanged true      <- 1ª carga
RESOLVED /_authenticated/$clientId/ {"clientId":"2222…"} success from /1111…/pacientes pathChanged true        <- rota índice termina em '/'
RESOLVED /_authenticated/$clientId/pacientes … from /2222… pathChanged true
RESOLVED /_authenticated/$clientId/pacientes … from /2222…/pacientes pathChanged false                         <- só ?x=2 mudou
HIST { type: 'PUSH' } /abc/conversas      -> BEFORENAV /abc/conversas
HIST { type: 'REPLACE' } /abc/pacientes   -> BEFORENAV /abc/pacientes  (redirect de beforeLoad)  -> RESOLVED … pathChanged false (voltou onde estava)
RESOLVED /_authenticated/$clientId  (rota inexistente '/nao-existe' casa com o segmento dinâmico) n=3
```
Fatos (todos [VERIFIED: execução nesta sessão]; código em `node_modules/@tanstack/router-core/src/router.ts:625-631` e `load-client.ts:1927`):
- payload de `onResolved`: `{type, fromLocation?, toLocation, pathChanged, hrefChanged, hashChanged}` (tipo `NavigationEventInfo` e `RouterEvents.onResolved`, `router.ts` ~606-632; `getLocationChangeInfo`, `router.ts:950-962`).
- folha: `router.state.matches[matches.length-1]` tem `routeId`, `fullPath`, `params` (com `clientId`), `status`. Rota índice tem `routeId` terminando em `/` (ex.: `/_authenticated/$clientId/`).
- **O `action` do histórico é um objeto**: `router.history.subscribe(({ action }) => action.type)` com `type` em `'PUSH'|'REPLACE'|'BACK'|'FORWARD'|'GO'` (`@tanstack/history/src/index.ts:9-14,19-22`). Não é string.
- um `redirect` de `beforeLoad` **nunca resolve a rota de origem**: só o destino final emite `onResolved`. Rotas só-redirect (lista abaixo) nunca aparecerão no log.
- `emit` envolve o listener em `try/catch` e só faz `console.error` (`router.ts:1442-1448`); mesmo assim o listener deve ter o próprio `try/catch`.
- Não há `defaultPreload` em `src/router.tsx` (o único `preload=` do src é `<video>`), logo preload não gera `onResolved` [VERIFIED: src/router.tsx, grep].
- Teste em Node exige `--conditions=browser` e shims de `window`/`document`; sem isso o router entra no caminho de servidor e **não emite `onResolved`** (armadilha para quem tentar testar o gancho em `scripts/`; usar Playwright).

### Pattern 2: Origem (D-10), mecanismo menos invasivo
Regra de decisão em `origemDaNavegacao({ acao, primeira, marcador, houveRedirect })`, na ordem:
1. se o guarda chamou `registrarBloqueada` → linha própria com `origem='bloqueada'` (ver abaixo), não passa por aqui;
2. `acao === 'REPLACE'` desde a última resolução → `redirecionamento` (cobre `throw redirect`, `<Navigate replace>` e os `navigate({replace:true})` de `$clientId.tsx:~48-65`);
3. nenhuma ação e sem resolução anterior → `direto` (primeira carga; cobre URL digitada, favorito, F5, link externo);
4. `BACK`/`FORWARD`/`GO` → `link` (recomendação; ver Open Questions — D-10 não nomeia voltar/avançar);
5. `PUSH` com marcador válido (≤ 10 s) → `marcador.origem` (`menu` ou `busca`);
6. `PUSH` sem marcador → `link`.

**Marcador:** um único listener `click` na fase de **captura** em `document`. Replica a guarda do `Link` (`button===0`, sem Ctrl/Meta/Alt/Shift, `target` ausente ou `_self`; `node_modules/@tanstack/react-router/src/link.tsx:434-457`) e lê `e.target.closest('[data-origem]')?.dataset.origem`. Captura porque garante rodar antes do `router.navigate` do `Link`.
**`data-origem` nos contêineres (todos os pontos de chamada, lidos nesta sessão):**
| Valor | Arquivo:linha | Elemento |
|---|---|---|
| `menu` | `src/components/app-shell.tsx:349` | `<aside aria-label="Menu principal">` (sidebar desktop; inclui `TabLink` de áreas e de detalhes, linhas 383-398) |
| `menu` | `src/components/app-shell.tsx:530` | `<nav className="bottomnav" aria-label="Áreas">` |
| `menu` | `src/components/app-shell.tsx:569` | conteúdo do `BottomSheet titulo="Navegar no Nexo"` (envolver em `<div data-origem="menu">`; `BottomSheet` é componente, o `<dialog>` está na linha 139) |
| `busca` | `src/components/app-shell.tsx:656` | `<nav className="workspace-search-results" aria-label="Resultados da busca">` (os `TabLink` das linhas 661-676) |
| `menu` | `src/routes/_authenticated.admin.tsx:71` | `<aside aria-label="Menu do admin">` |
| `menu` | `src/routes/_authenticated.sap.tsx:122` | `<aside … aria-label="Menu do Sistema d…">` (e a `<nav className="sap-context-tabs">` da linha 152) |
Tudo fora desses contêineres (cartões dentro de `<main>`, `TrocaProduto` fora de aside, `sap-week-overview`) cai em `link`. **Rejeitado:** heurística "qualquer `<nav>`/`<aside>` é menu": há `<nav>` de paginação e de abas dentro de telas (`crm-contatos.tsx:103,133`, `ideias.tsx:728,899`, `central-atendimento.tsx:55`) que inflariam `menu`.
O `TabLink` (`app-shell.tsx:65-109`) **não muda** — os atributos ficam nos contêineres. Tamanho da mudança em `app-shell.tsx`: 4 atributos/1 wrapper.

**`bloqueada`:** só dois guardas negam acesso a uma tela hoje [VERIFIED: grep de `throw redirect`/`<Navigate`, lista completa abaixo]:
- `src/routes/_authenticated.admin.tsx:12-15` — `beforeLoad: async () => { … if (!isAdmin) throw redirect({ to: "/" }); }` (hoje sem argumento; passar a receber `{ location }`);
- `src/routes/_authenticated.sap.tsx:23-38` — já recebe `{ location }`; nega nas linhas 37-38 (`redirect` para `/$clientId/pacientes` ou `/sem-acesso`).
Em cada um, **antes** do `throw`, chamar `registrarBloqueada(location.pathname)`. A função usa o router guardado no módulo na instalação: `router.getMatchedRoutes(pathname)` devolve `[ramo, rawParams, rota]` (público, `router.ts:1787-1801`, tipo `GetMatchRoutesFn` em `router.ts:778-783`); `ramo.at(-1).id` é o `routeId` e `rawParams.clientId` a clínica. Grava uma linha `bloqueada` para a rota negada; o destino do redirect gera outra linha `redirecionamento`. `_authenticated.admin.tsx:52` (`<Navigate to="/" replace />` em `AdminLayout`) é redundante com o `beforeLoad`; não precisa de chamada.

**Rotas só-redirect (nunca resolvem; aparecem sempre com 0 na lista de D-12; marcar na aba como "só redireciona"):** `/_authenticated/` (índice), `/_authenticated/$clientId/aquisicao`, `/_authenticated/$clientId/conversas`, `/_authenticated/$clientId/marketing`, `/_authenticated/$clientId/sap/` , `/_authenticated/$clientId/sap/etapas`, `…/sap/execucao`, `…/sap/leitura`, `…/sap/metas`, `/_authenticated/admin/aquisicao`, `/_authenticated/sap/$clientId/semana`, `/_authenticated/sap/$clientId/passo-a-passo` (12; origem: `grep "throw redirect" src/routes`). Manter como constante `ROTAS_SO_REDIRECIONAM` em `rota-log.ts` com teste que confere que cada id existe em `routeTree.gen.ts`.

### Pattern 3: Cliente, papel e equipe sem round-trip (pergunta 3)
- `client_id`: `params.clientId` da folha (única família de parâmetro nas 90 rotas: `ls src/routes | grep -o '\$[a-zA-Z]*'` → só `$clientId`, 62 arquivos). **Validar contra regex de UUID**; `/nao-existe` casa com `/_authenticated/$clientId` (provado na execução acima), então um `clientId` que não é UUID significa "não é tela": **descartar a linha** (e nunca mandar texto livre para uma coluna `uuid`).
- `papel` do usuário: hoje `useClientRole` (`src/hooks/use-client-role.ts:11-22`) faz `queryKey: ["papel", clientId, user?.id]`, `staleTime: 10 * 60_000`, `enabled: !!user && !isAdmin`, e devolve `"admin"` se `isAdmin`. `isAdmin` vive só no `useState` do `AuthProvider` (`src/hooks/use-auth.tsx:16-37`); não há acesso de fora do React [VERIFIED].
- **Recomendado:** trigger no banco (ver SQL). O navegador manda só `client_id, rota, origem, sessao`.

### Pattern 4: Gate de produção (D-04, pergunta 4)
Não existe noção de "produção" no código hoje [VERIFIED: único `import.meta.env` são `VITE_SUPABASE_*`, `VITE_LINK_BASE_URL`, `DEV` em `qa.layout.tsx`; único teste de host é `ehEnderecoSap`, `src/lib/marca.ts:4`, regex `/^sap\./i`]. Hosts citados no repo: `dash.doctorcreator.com.br` (`src/lib/rastreio.ts:91`, `api/_lib/central-canais.ts:36`), `nexo.doctorcreator.com.br` e `sap.doctorcreator.com.br` (`scripts/verify-nexo-interface.mjs:199-200`).
**Recomendado:** `deveGravar(host, forcar)` puro: `true` se `/\.doctorcreator\.com\.br$/i.test(host)` ou `forcar`. `forcar` = `localStorage["nexo:rota-log"] === "1"` (leitura em try/catch). Isso (a) cobre os três hosts, (b) exclui `localhost`, `127.0.0.1` (e2e, porta 5198) e `*.vercel.app` (previews), (c) deixa o Playwright ligar o log por `context.addInitScript` **só no spec novo**, sem tocar `playwright.config.ts` (ligar por env no config faria todos os specs enviarem POSTs). O domínio `*.vercel.app` de produção, se existir como alias, ficaria sem log: ver Open Questions.

### Pattern 5: Sessão por aba e dedupe (pergunta 9)
Nenhum util existente de sessão de aba. Há precedente de `sessionStorage` injetável em `src/main.tsx:21-24` (`createDeployRecovery({ getItem, setItem })`, `src/lib/deploy-recovery.ts`). Criar `obterSessao()`: `sessionStorage["nexo:rota-sessao"]` ou `crypto.randomUUID()`, com fallback em memória se o storage lançar (modo privado). 36 caracteres; a tabela aceita 8–64.
Dedupe (D-07): `Map<chave, ts>` com chave **`rota|client_id`** (não só `rota`, para não esconder a troca rápida de clínica pela equipe), janela 2000 ms. Isso refina "mesma rota" de D-07; avisar na revisão.

### Anti-Patterns to Avoid
- **`await` do insert no listener ou em `beforeLoad`**: atrasa a navegação (LOG-04). Sempre `setTimeout(0)` + `void promessa.catch(() => {})`.
- **Encadear `.select()` no insert**: viria `Prefer: return=representation` e a policy de select (só admin) rejeitaria o viewer. Insert puro (`return=minimal`, comportamento padrão do supabase-js sem `.select()` [ASSUMED]). Cobrir com asserção do cabeçalho `prefer` no e2e.
- **Gravar `location.href`, `pathname`, `search`**: LOG-04. Só `routeId`.
- **Logar no `useEffect` de componente**: StrictMode (`main.tsx:54`) dispara duas vezes. A instalação em `main.tsx` fica fora do React; ainda assim torná-la idempotente por router (HMR).
- **Contar rotas de layout**: só a folha entra; `/_authenticated`, `/_authenticated/$clientId`, `/_authenticated/admin`, `/_authenticated/sap` nunca são folha.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Casar URL com padrão de rota | regex/parser de pathname | `routeId` da folha em `router.state.matches` (ou `router.getMatchedRoutes`) | O router já resolve `$params`, índice e prefixos |
| Fronteira "quem lê/escreve" | checagem no cliente | RLS + trigger | `vite.config.ts` declara que a segurança é do Supabase |
| Papel/equipe | cache de role no cliente | trigger lendo `is_app_admin()`/`client_members` | evita plumbing de auth fora do React e falsificação |
| Agregação | `select *` + reduce no cliente | RPC `group by` | limite de 1000 linhas do PostgREST |
| Lista de rotas | constante digitada à mão | `Object.keys(router.routesById)` filtrado por `route.children` | a árvore muda; 80 folhas autenticadas hoje |
| Agendar limpeza | rotina externa/Vercel cron | `pg_cron` guardado | padrão de `20261105120000_resultado_pronto.sql`; Vercel está em 11/12 funções |
| Id de sessão | contador/data | `crypto.randomUUID()` | sem colisão |

**Key insight:** o log só tem valor se for **confiável como linha de base** (D-14 espera 7 dias). Tudo que deixa a contagem enganosa (preview sujando, redirect duplicando, 404 caindo em `$clientId`, campo falsificável) é pior que não ter o log.

## Common Pitfalls / Landmines

### Pitfall 1: Os testes de banco já estão vermelhos em HEAD
**What goes wrong:** `npm run test:migrations` e `npx tsx scripts/test-db-security.ts` abortam em `Migração 20261106130000_resultados_diarios.sql falhou` / `error: relation "cron.job" does not exist` [VERIFIED: executado nesta sessão, Node v24.19.0]. As linhas culpadas: `select cron.unschedule(jobid) from cron.job where jobname = 'resultados-diarios';` e `select cron.schedule('resultados-diarios', …)` (`20261106130000_resultados_diarios.sql:88-89`, sem guarda). `scripts/banco/remontar.ts` (workflow `banco.yml`) aplica as mesmas migrations e tem o mesmo problema. `npm test` e `npm run check` incluem os dois testes (`scripts/run-tests.mjs` roda todo `test-*.ts`).
**How to avoid (Wave 0, tarefa própria e primeiro commit):** envolver essas duas linhas no bloco guardado idêntico ao de `20261105120000_resultado_pronto.sql:174-184` (`do $cron$ … if exists (select 1 from pg_available_extensions where name = 'pg_cron') … exception when others then raise notice … end $cron$;`). Seguro em produção: `scripts/banco/aplicar.sh` rastreia por **nome de arquivo** (`public._migracoes_repo`), não por checksum, então a migration já aplicada não roda de novo. Alternativa: stubar o schema `cron` nos 3 harnesses. Escolher a primeira (1 edição, em vez de 3).
**Warning signs:** CI do PR vermelho antes de qualquer linha do log.

### Pitfall 2: Rotas só-redirect e "0 aberturas" enganoso
Doze rotas nunca resolvem (lista acima). Sem anotação, a aba diria "0 aberturas" para telas que as pessoas acessam por link antigo. A aba deve rotulá-las "só redireciona" e D-13 já proíbe concluir qualquer coisa.

### Pitfall 3: 404 vira linha de `$clientId`
Qualquer URL desconhecida de um segmento casa com `/_authenticated/$clientId` (provado). Sem validação de UUID, `client_id` recebe lixo (erro de tipo `uuid` engolido) ou a rota índice ganha aberturas falsas.

### Pitfall 4: Primeira carga redirecionada
Abrir `/` sempre redireciona (`_authenticated.index.tsx`: `/sap`, `/admin`, `/sem-acesso`, `/sap/$clientId/painel` ou `/$clientId/pacientes`). A 1ª resolução ocorre no destino, com `REPLACE` no meio → `redirecionamento` (correto). Já uma URL fora da forma canônica faz o `Transitioner` chamar `commitLocation({ replace: true })` (`Transitioner.tsx:~58-70`) e seria rotulada `redirecionamento` em vez de `direto`; efeito marginal, documentar.

### Pitfall 5: Tabela ainda não criada quando o código sobe
O código sobe pelo merge; a migration roda por ação do João. Insert falha (PostgREST 404/`42P01`). Requisito do CONTEXT: degradar em silêncio. Implementar um disjuntor: após um erro de "tabela inexistente" parar de tentar na sessão. Não tratar 401/403 como "tabela inexistente" (página pública `/sem-acesso` sem sessão). O navegador ainda imprime 1 `Failed to load resource` por sessão; aceitável e esperado. A aba mostra "A tabela do registro ainda não foi criada" quando o RPC falha com código de objeto inexistente (`42P01`, `42883`, `PGRST202`, `PGRST205` [ASSUMED: nomes de código do PostgREST]); qualquer outro erro → "Não foi possível ler agora".

### Pitfall 6: Policy de insert que exclui admin
Padrão do repo para "membro": `public.is_client_member(...)`. Admin da equipe muitas vezes não tem linha em `client_members`. A policy deste log é por `user_id`, não por membro (CONTEXT, Established Patterns).

### Pitfall 7: Conflito com a Phase 1 em `_authenticated.admin.conferencia.tsx`
A Phase 1 mexe na conferência em paralelo. Manter a edição ao mínimo: `ConferenciaPage` (linha 241 do arquivo, hoje `function ConferenciaPage()`) vira `ConferenciaDados`, e um `ConferenciaPage` novo (≈20 linhas) renderiza o `tablist` + `<ConferenciaDados />` ou `<UsoDasTelas />`. Corpo da aba em arquivo próprio.

### Pitfall 8: Timing do marcador
Disparar o marcador no **clique** e consumi-lo no `onResolved`. Descartar marcador com mais de 10 s e sempre limpá-lo ao consumir. Clique com Ctrl/Meta (nova aba) não chega ao router, por isso o filtro de modificadores no listener; sem ele o marcador "vazaria" para a próxima navegação programática.

### Pitfall 9: Estado de auth não acessível fora do React
Se o planner rejeitar o trigger, precisará de `supabase.rpc("is_app_admin")` memoizado por `user.id` no módulo (o `AuthProvider` faz a mesma chamada, `use-auth.tsx:8-12`); não existe store compartilhado.

### Pitfall 10: Node local e engines
`package.json` pede `node 22.x` (`.nvmrc` = 22); a máquina tem v24.19.0. Os testes acima rodaram assim; o CI usa 22 (`quality.yml` `node-version-file: .nvmrc`).

## Code Examples

### Migration (esqueleto; nome segue `^[0-9]+_[a-z0-9_]+\.sql$` exigido por `aplicar.sh`; maior timestamp existente é `20261106130000`)
```sql
-- 20261109120000_rota_acessos.sql
-- Cada abertura de tela do Nexo (rota padrão, nunca a URL). Aditiva. Reversão:
--   select cron.unschedule('rota-acessos-limpeza');
--   drop function public.rota_acessos_limpar(); drop function public.rota_acessos_resumo(integer, boolean, boolean);
--   drop table public.rota_acessos; drop function public.rota_acessos_preencher();   (o trigger cai com a tabela)
create table if not exists public.rota_acessos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  user_id uuid not null default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  rota text not null check (rota like '/%' and rota !~ '[?#]' and length(rota) <= 200),
  origem text not null check (origem in ('menu','busca','link','direto','redirecionamento','bloqueada')),
  papel text check (papel is null or papel in ('admin','owner','strategist','viewer')),
  eh_equipe boolean not null default false,
  sessao text not null check (length(sessao) between 8 and 64)
);
create index if not exists rota_acessos_criado_em_idx on public.rota_acessos (criado_em desc);
create index if not exists rota_acessos_rota_criado_em_idx on public.rota_acessos (rota, criado_em desc);
alter table public.rota_acessos enable row level security;
revoke all on table public.rota_acessos from public, anon;
grant select, insert on table public.rota_acessos to authenticated;
grant all on table public.rota_acessos to service_role;
drop policy if exists "rota_acessos: insere o proprio" on public.rota_acessos;
create policy "rota_acessos: insere o proprio" on public.rota_acessos for insert to authenticated
  with check (user_id = (select auth.uid())
    and (client_id is null or public.is_app_admin() or public.is_client_member(client_id)));
drop policy if exists "rota_acessos: so admin le" on public.rota_acessos;
create policy "rota_acessos: so admin le" on public.rota_acessos for select to authenticated
  using (public.is_app_admin());

-- Preenche no banco o que o navegador não pode afirmar. SECURITY INVOKER basta: o usuário lê a própria linha de client_members.
create or replace function public.rota_acessos_preencher() returns trigger language plpgsql as $$
begin
  new.user_id := auth.uid();
  new.eh_equipe := public.is_app_admin();
  new.papel := case when new.eh_equipe then 'admin'
    else (select m.role from public.client_members m where m.client_id = new.client_id and m.user_id = auth.uid()) end;
  return new;
end $$;
revoke all on function public.rota_acessos_preencher() from public, anon, authenticated;
drop trigger if exists rota_acessos_preencher on public.rota_acessos;
create trigger rota_acessos_preencher before insert on public.rota_acessos for each row execute function public.rota_acessos_preencher();
```
Notas que o executor precisa respeitar (do `test-db-security.ts` global, linhas 118-139, que passa a cobrir a tabela nova sem editar nada): RLS ligada em toda tabela de `public`; `anon` sem privilégio de tabela nem de função; todo `SECURITY DEFINER` precisa de `set search_path = public, pg_temp` (ou `""`); `authenticated` sem `TRUNCATE`. As funções acima são invoker, mas **revogar `execute` de `public, anon`** mesmo assim ("estado final bloqueia toda função public para anon", última verificação do arquivo). `papel` fica `null` para não-admin em rota sem clínica (decisão a confirmar; Open Questions).

### RPC de agregação (invoker; a RLS de select já devolve zero linhas a quem não é admin)
```sql
create or replace function public.rota_acessos_resumo(p_dias integer, p_equipe boolean, p_incluir_teste boolean default false)
returns table (rota text, aberturas integer, pessoas integer, ultima timestamptz,
  menu integer, busca integer, link integer, direto integer, redirecionamento integer, bloqueada integer)
language sql stable as $$
  select a.rota, count(*)::int, count(distinct a.user_id)::int, max(a.criado_em),
    count(*) filter (where a.origem = 'menu')::int, count(*) filter (where a.origem = 'busca')::int,
    count(*) filter (where a.origem = 'link')::int, count(*) filter (where a.origem = 'direto')::int,
    count(*) filter (where a.origem = 'redirecionamento')::int, count(*) filter (where a.origem = 'bloqueada')::int
  from public.rota_acessos a left join public.clients c on c.id = a.client_id
  where a.criado_em >= now() - make_interval(days => least(greatest(p_dias, 1), 180))
    and a.eh_equipe = p_equipe and (p_incluir_teste or c.eh_teste is not true)
  group by a.rota order by 2 desc
$$;
revoke all on function public.rota_acessos_resumo(integer, boolean, boolean) from public, anon;
grant execute on function public.rota_acessos_resumo(integer, boolean, boolean) to authenticated;
```
`clients.eh_teste` existe (`20261030200000_clientes_de_teste.sql:4`, `grant select (eh_teste)` na linha 7). A aba também lê `min(criado_em)` direto da tabela para escrever "Registro ligado desde …", para não confundir "0 aberturas" com "ainda não estávamos gravando" (D-13/D-14).

### Cron guardado e idempotente (padrão do repo; copiar a forma, mudar jobname/comando)
```sql
-- Fonte: supabase/migrations/20261105120000_resultado_pronto.sql:174-184
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'rota-acessos-limpeza';
    perform cron.schedule('rota-acessos-limpeza', '40 6 * * *', 'select public.rota_acessos_limpar()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;
```
`rota_acessos_limpar()`: `language plpgsql security definer set search_path = public, pg_temp`, `delete from public.rota_acessos where criado_em < now() - interval '180 days'`, retorna a contagem; `revoke all … from public, anon, authenticated; grant execute … to service_role` (forma de `resultados_gravar_dia`, `20261106130000_resultados_diarios.sql:57-58`). O `exception when others` **engole falha em produção**: pedir ao João o resultado de `select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';` após aplicar.

### Módulo puro (assinaturas; sem importar supabase, para o teste rodar em `scripts/`)
```ts
// src/lib/rota-log.ts
export type Origem = "menu" | "busca" | "link" | "direto" | "redirecionamento" | "bloqueada";
export interface LinhaRota { client_id: string | null; rota: string; origem: Origem; sessao: string }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehHostDeProducao = (host: string) => /\.doctorcreator\.com\.br$/i.test(host);
export function rotaRegistravel(routeId: string): boolean { return routeId.startsWith("/_authenticated") || routeId === "/sem-acesso"; }
export function montarLinha(i: { routeId: string; params: Record<string, unknown>; origem: Origem; sessao: string }): LinhaRota | null {
  if (!rotaRegistravel(i.routeId)) return null;
  const id = i.params.clientId;
  if (i.routeId.includes("$clientId") && !(typeof id === "string" && UUID.test(id))) return null; // 404 caiu em $clientId
  return { client_id: typeof id === "string" && UUID.test(id) ? id : null, rota: i.routeId, origem: i.origem, sessao: i.sessao };
}
```
```ts
// src/lib/rota-log-instalar.ts (trecho)
router.history.subscribe(({ action }) => { ultimaAcao = action.type; });       // action é objeto { type }
router.subscribe("onResolved", (e) => {
  try {
    if (!e.pathChanged) return;                                                 // D-03: só mudança de caminho
    const folha = router.state.matches.at(-1);
    if (!folha || folha.status !== "success") return;
    const origem = origemDaNavegacao({ acao: ultimaAcao, primeira: !jaResolveu, marcador: consumirMarcador() });
    ultimaAcao = undefined; jaResolveu = true;
    const linha = montarLinha({ routeId: folha.routeId, params: folha.params, origem, sessao: obterSessao() });
    if (linha && deveGravar(location.hostname) && !dedupe(linha)) setTimeout(() => void gravar(linha).catch(() => {}), 0);
  } catch { /* nunca propaga */ }
});
document.addEventListener("click", marcarOrigem, true);                         // captura
```
`gravar` = `(supabase as any).from("rota_acessos").insert(linha)` (sem `.select()`); `(supabase as any)` segue o padrão de tabelas fora de `src/integrations/supabase/types.ts` (ex.: `admin.conferencia.tsx:~43`).

### Lista de rotas para "0 aberturas" (D-12)
`const folhas = Object.values(router.routesById).filter(r => !r.children?.length && rotaRegistravel(r.id))` — `routesById` e `children` provados na execução (`routesById` chaves = ids; `children` é array nos layouts, `undefined` nas folhas). Resultado esperado hoje: **80 folhas** `/_authenticated/*` (83 linhas `'/_authenticated/…'` em `FileRoutesById`, `routeTree.gen.ts:794-885`, menos os 3 layouts `$clientId`, `admin`, `sap`) mais `/sem-acesso`. O CONTEXT fala em "90 rotas": 90 é o número de **arquivos** em `src/routes` (`ls | wc -l`), que inclui `__root`, layouts, 4 públicas e `qa.layout`. O planner deve usar 80 (+1) como esperado do teste, não 90. O exemplo `/_authenticated/$clientId/resultados` do D-01 é ilustrativo: **não existe** arquivo `_authenticated.$clientId.resultados.tsx`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useRouterState` + effect no layout | `router.subscribe('onResolved')` + `router.history.subscribe` | router-core 1.17x | cobre 1ª carga e rotas fora do layout autenticado |
| `sendBeacon` | `fetch` autenticado via supabase-js | (STACK.md) | beacon não leva o JWT; RLS rejeitaria |

**Deprecated/outdated:** `FEATURES.md` ainda cita lote via `sendBeacon` no dispatcher; `SUMMARY.md` §Divergências já o descarta.

## Runtime State Inventory

Fase aditiva (tabela nova, nada renomeado). **Omitida** por não ser rename/refactor/migration de dados.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `supabase.from(t).insert(x)` sem `.select()` envia `Prefer: return=minimal` | Anti-Patterns | viewer não conseguiria inserir (policy de select só admin); o e2e confere o cabeçalho |
| A2 | Os 3 hosts `dash.`/`nexo.`/`sap.doctorcreator.com.br` são os únicos de produção; não há alias `*.vercel.app` de produção em uso | Pattern 4 | se o João usa outro host, o log não grava em produção |
| A3 | `statement_timeout` do papel `authenticated` ~8 s (STATE.md deixa 8 s ou 30 s aberto; `20261105120000_resultado_pronto.sql:3` cita "limite de 8 s") | RPC | RPC lenta estoura; mitigado por limitar a janela a 90 dias e índice em `criado_em` |
| A4 | Volume ≈ (20 clínicas + equipe) × alguns milhares de linhas/dia → ≤ ~900 mil linhas em 180 dias | RPC / índices | agregação mais lenta; reavaliar índices |
| A5 | Códigos de erro do PostgREST para objeto inexistente (`PGRST202`, `PGRST205`) | Pitfall 5 | aba mostra "não foi possível ler" em vez de "tabela não criada"; cosmético |
| A6 | `BACK`/`FORWARD` gravados como `link` | Pattern 2 | contagem de `link` ligeiramente inflada; decisão do João/planner |
| A7 | `strategist` sem `is_app_admin` conta como clínica (`eh_equipe=false`) | Pattern 3 | se a equipe usa `strategist`, "uso da clínica" mistura equipe |
| A8 | Edição do `20261106130000_resultados_diarios.sql` (guarda do cron) é segura em produção | Pitfall 1 | confirmado por `aplicar.sh` (rastreio por nome), mas o João deve ciente de que o arquivo mudou |

## Open Questions

1. **Voltar/avançar (D-10 não nomeia).**
   - Sabe-se: o histórico entrega `BACK`/`FORWARD`/`GO`.
   - Falta: se contam como abertura e com qual origem.
   - Recomendação: contar, origem `link`; registrar a escolha no PLAN. Se o João preferir ignorar, é um `if` em `origemDaNavegacao`.
2. **`eh_equipe` para `strategist`/`owner`.** Recomendação: `eh_equipe = is_app_admin()` apenas (A7).
3. **`papel` nulo para não-admin em rota sem clínica (`/bem-vindo`, `/assistentes-ia`, `/sap` índice).** Recomendação: aceitar `null` (coluna anulável com CHECK); a visão agregada usa `eh_equipe`, não `papel`.
4. **Host de produção.** Confirmar com o João se existe algum host além dos três (A2).
5. **Linhas das rotas só-redirect de origem.** Recomendação: **não** gravar a rota de origem do redirect (D-10 define `redirecionamento` como origem do destino) e rotular as 12 como "só redireciona" na aba. Alternativa mais cara: gravar também a origem abandonada; exige deduzir a rota a partir de `onBeforeNavigate` + `getMatchedRoutes`.
6. **Chave do dedupe com `client_id`** (refina D-07; Pattern 5).
7. **`client_id` com `on delete set null` vs `cascade`.** Recomendo `set null` para o log de decisão não encolher quando uma clínica for apagada.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tudo | ✓ | v24.19.0 (projeto pede 22.x) | `.nvmrc` 22 no CI |
| npm / `npx tsx` | testes | ✓ | — | — |
| PGlite | testes de banco | ✓ | `^0.5.10` | — |
| Playwright + Chromium | e2e | ✓ | 1.64.1; `~/Library/Caches/ms-playwright` tem chromium-1234/1243/1248 | `PLAYWRIGHT_SKIP_BUILD=1` reaproveita build |
| `dist/` | e2e | ✓ (existe) | — | `npm run build` |
| `psql` / Supabase CLI | — | ✗ | — | não necessários (testes em PGlite; migration roda pelo João) |
| `gh` | abrir PR | ✗ | — | PR pelo Chrome (memória do projeto "PR pelo Chrome autorizado", base `claude/doctor-creator-hub-nixvw6`) |
| zod correto | `npm run check` | ✗ (3.25.76 vs `^4.6.7`) | — | `npm ci` |

**Missing dependencies with no fallback:** nenhuma.
**Missing with fallback:** zod (`npm ci`); `gh` (Chrome).

## Validation Architecture

> `workflow.nyquist_validation` está `false` em `.planning/config.json`; incluído porque o pedido o exige.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | scripts `tsx` + `node:assert/strict` (unitário e banco/PGlite); Playwright 1.64.1 (e2e) |
| Config file | `scripts/run-tests.mjs` (descobre `scripts/test-*.ts`, 120 s cada, com `scripts/test-network-guard.mjs`); `playwright.config.ts` (porta 5198, `workers: 1`) |
| Quick run command | `npx tsx scripts/test-rota-log.ts` |
| Full suite command | `npm run check` (secrets + lint + typecheck + `npm test`), depois `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOG-01 | `montarLinha` só devolve linha para `/_authenticated*` e `/sem-acesso`; descarta `clientId` não UUID; `ROTAS_SO_REDIRECIONAM` ⊂ ids de `routeTree.gen.ts` | unit | `npx tsx scripts/test-rota-log.ts` | ❌ Wave 0 |
| LOG-01 | insert-own: `user_id` forçado = `auth.uid()`; admin sem `client_members` insere; trigger preenche `eh_equipe`/`papel`; viewer não consegue declarar `client_id` de outra clínica | DB (PGlite) | `npx tsx scripts/test-db-security.ts` (novo `check` por tabela) | ❌ Wave 0 (+ corrigir Pitfall 1) |
| LOG-01 | outro usuário e não-admin não leem (`select` devolve 0); anon sem privilégio | DB | idem | ❌ |
| LOG-01 | admin e viewer geram POST em `/rest/v1/rota_acessos` no e2e (log forçado por `addInitScript`) | e2e | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/rota-log.spec.ts` | ❌ |
| LOG-02 | `origemDaNavegacao` para cada caso (`REPLACE`, 1ª carga, `PUSH`+menu, `PUSH`+busca, `PUSH` solto, `BACK`) | unit | `npx tsx scripts/test-rota-log.ts` | ❌ |
| LOG-02 | e2e: abrir direto → `direto`; clicar item do menu → `menu`; Cmd+K e escolher → `busca`; viewer abrindo `/admin/conferencia` → `bloqueada` e depois `redirecionamento` | e2e | `npx playwright test tests/e2e/rota-log.spec.ts` | ❌ |
| LOG-03 | `rota_acessos_resumo` agrega por rota, separa `eh_equipe`, exclui `eh_teste` por padrão, não-admin recebe 0 linhas | DB | `npx tsx scripts/test-db-security.ts` | ❌ |
| LOG-03 | aba "Uso das telas" lista 80+1 rotas (mescla com 0), rotula as 12 "só redireciona", mostra "ainda não criada" se o RPC falha | e2e (mock) | `npx playwright test tests/e2e/rota-log.spec.ts` | ❌ |
| LOG-04 | nenhuma linha com `?`, `#`, `http` ou UUID de paciente: CHECK do banco rejeita (`insert` com `rota='/x?y'` falha) + `montarLinha` + asserção no e2e sobre `postDataJSON()` | DB + unit + e2e | os três acima | ❌ |
| LOG-04 | falha ao gravar não trava a tela: e2e responde 500/aborta o POST e a tela navega normal; `gravar` que lança não propaga (unit) | e2e + unit | idem | ❌ |
| LOG-04 | navegação não ficou lenta | manual em produção | ver Sampling | — |

### Verificação em produção (critérios 1, 2, 4, 5; nenhuma é automatizável sem o João)
- **Critério 5:** o João roda `supabase/migrations/20261109120000_rota_acessos.sql` (e confirma `select jobname, schedule from cron.job where jobname = 'rota-acessos-limpeza';`). Print da aba "Uso das telas" no site no ar, com aberturas reais (conferir o print, não só o teste).
- **Critério 1 (24 h):** consulta de leitura pelo João: `select eh_equipe, papel, count(*) from public.rota_acessos where criado_em > now() - interval '24 hours' group by 1, 2;` — esperado linhas com `admin` e `viewer`.
- **Critério 2:** `select count(*) from public.rota_acessos where rota ~ '[?#]' or rota !~ '^/' or rota ~* 'https?:' or rota ~ '[0-9a-f]{8}-[0-9a-f]{4}';` — esperado 0 (o CHECK já garante, a consulta é a prova pedida pelo ROADMAP).
- **Critério 4:** medir antes/depois em produção (DevTools Performance ou tempo de troca de tela) e conferir que o POST sai depois do commit da tela (aba Network: `rota_acessos` aparece após o XHR da tela, não antes). Falha simulada: bloquear `rota_acessos` no DevTools e navegar.

### Sampling Rate
- **Per task commit:** `npx tsx scripts/test-rota-log.ts`
- **Per wave merge:** `npm run test:migrations && npx tsx scripts/test-db-security.ts && npm run typecheck && npm run lint`
- **Phase gate:** `npm ci` → `npm run check` → `npm run build` → `npm run test:e2e` verdes; depois verificação em produção acima.

### Wave 0 Gaps
- [ ] Guardar o cron de `20261106130000_resultados_diarios.sql` (Pitfall 1); sem isto nenhum teste de banco roda
- [ ] `npm ci` (zod) e baseline `npm run check` na branch limpa, para saber o que já estava vermelho
- [ ] `scripts/test-rota-log.ts`
- [ ] Caso(s) novo(s) em `scripts/test-db-security.ts` para `rota_acessos` (usar o helper `role()`/`como()` do arquivo; seed de usuários `editor, viewer, outsider, admin` já existe nas linhas 15-17 e 64-65)
- [ ] `tests/e2e/rota-log.spec.ts` (usa `mockAccount`; ligar o log com `context.addInitScript(() => localStorage.setItem("nexo:rota-log","1"))`; capturar com `page.on("request")`; `mockAccount` devolve `[]` com 200 para `/rest/v1/*` desconhecido, então o POST não quebra o resto — `tests/e2e/fixtures.ts`)

## Security Domain

`security_enforcement` está ativo (`config.json`: `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | login existente; o insert exige JWT `authenticated` |
| V3 Session Management | parcial | `sessao` é id de aba, não token; nunca derivar do JWT |
| V4 Access Control | yes | RLS: insert por `user_id = (select auth.uid())` + `client_id` nulo/admin/membro; select `is_app_admin()`; trigger força `user_id` |
| V5 Input Validation | yes | CHECKs no banco (`rota`, `origem`, `papel`, `sessao`) + `montarLinha` no cliente |
| V6 Cryptography | no | nada novo |
| V8 Data Protection / privacidade | yes | sem query string/hash/URL/id de paciente; `user_id` é dado pessoal da equipe e das clínicas: retenção 180 dias |

### Known Threat Patterns for {supabase RLS + SPA}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Usuário logado grava `client_id` de outra clínica ou `eh_equipe=true` | Tampering | policy `with check` por membro/admin + trigger deriva `eh_equipe`/`papel` |
| Não-admin lê o log | Information disclosure | policy de select só `is_app_admin()`; RPC invoker; teste no `test-db-security.ts` |
| PII em `rota` | Information disclosure | só `routeId`; CHECK `rota !~ '[?#]'`; teste |
| Inundação de inserts por usuário autenticado | DoS | dedupe de 2 s no cliente; sem limite no servidor (aceito, base fechada) — registrar como risco residual |
| `SECURITY DEFINER` sem `search_path` | Elevation | `rota_acessos_limpar` com `set search_path = public, pg_temp`; teste global já cobre |
| RPC chamável por anon | Elevation | `revoke … from public, anon`; teste final do arquivo |

## Sources

### Primary (HIGH confidence)
- Execução local do router (`node --conditions=browser`, `@tanstack/react-router` + `router-core` 1.171.38): eventos, `routeId`, `params`, `pathChanged`, `REPLACE`, `routesById`, `children`.
- Código lido nesta sessão: `src/router.tsx`, `src/main.tsx`, `src/hooks/use-auth.tsx`, `src/hooks/use-client-role.ts`, `src/lib/auth-session.ts`, `src/lib/marca.ts`, `src/routes/_authenticated.tsx`, `_authenticated.index.tsx`, `_authenticated.admin.tsx`, `_authenticated.sap.tsx`, `_authenticated.$clientId.tsx`, `_authenticated.admin.conferencia.tsx`, `src/components/app-shell.tsx`, `src/lib/nav.ts`, `src/routeTree.gen.ts:794-885`, `node_modules/@tanstack/router-core/src/{router.ts,load-client.ts}`, `react-router/src/{Transitioner.tsx,link.tsx}`, `history/src/index.ts`.
- Migrations: `20260822000000_fase1_schema.sql`, `20260824170000_admin_roles.sql`, `20261021240000_mcp_chamadas.sql`, `20261021290000_desempenho_indices_rls.sql`, `20261105120000_resultado_pronto.sql`, `20261106120000_clinica_metas.sql`, `20261106130000_resultados_diarios.sql`, `20261030200000_clientes_de_teste.sql`.
- Testes: `scripts/test-migrations.ts`, `scripts/test-db-security.ts`, `scripts/run-tests.mjs`, `scripts/banco/{aplicar.sh,remontar.ts}`, `tests/e2e/fixtures.ts`, `playwright.config.ts`, `.github/workflows/{quality,banco}.yml`; execuções de `npm run test:migrations` e `test-db-security.ts` (falham, Pitfall 1); `npm ls zod`.
- `.planning/` (CONTEXT, REQUIREMENTS, ROADMAP, STATE, `research/*`, `codebase/{TESTING,CONVENTIONS,CONCERNS}.md`).

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` (marcador `marcarVia`; substituído aqui por `data-origem`).

### Tertiary (LOW confidence)
- A1, A2, A3, A5 (ver Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova; versões lidas.
- Architecture: HIGH — gancho e `routesById` executados; lista de chamadas lida arquivo a arquivo.
- Pitfalls: HIGH — o bloqueio dos testes de banco foi reproduzido; demais por leitura de código.

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (router 1.17x se move rápido; reconferir `onResolved` se `npm ci` mudar a versão de `@tanstack/router-core`)
