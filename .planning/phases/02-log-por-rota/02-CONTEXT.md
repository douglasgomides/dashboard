# Phase 2: Log por rota - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Gravar cada abertura de tela do Nexo (todas as 81 rotas medidas em `src/routeTree.gen.ts` em 09/11/2026: 80 folhas `/_authenticated` mais `/sem-acesso`; o 90 é o número de arquivos em `src/routes`, que inclui `__root`, os 4 layouts e as telas fora da área logada; inclusive as que ainda serão escondidas e as abertas pela equipe admin) numa tabela própria, e dar à equipe admin uma visão agregada desse uso. É a primeira entrega de código do v5 e a linha de base para esconder telas (Phase 3), cortar telas (decisão 3) e decidir o SAP (90 dias de log).

Fora desta fase: esconder ou mudar menu (Phase 3), Cmd+K com telas escondidas e botão Buscar (Phase 3), qualquer tela para o médico.

Requisitos: LOG-01, LOG-02, LOG-03, LOG-04.

</domain>

<decisions>
## Implementation Decisions

O João respondeu "segue recomendação" para todos os pontos em 09/11/2026. As decisões abaixo são recomendação do Claude aceita por delegação; revisáveis.

### Tabela, gravação e retenção
- **D-01:** Tabela `rota_acessos` (português, no padrão de `lista_acessos` previsto para a Phase 12). Campos: `id`, `criado_em` (timestamptz, default now()), `user_id` (default `auth.uid()`), `client_id` (nullable: rotas sem clínica, como `/admin`), `rota` (padrão da rota, ex. `/_authenticated/$clientId/resultados`, nunca a URL), `origem`, `papel`, `eh_equipe` (boolean), `sessao` (id aleatório por aba). — **Reversibility:** one-way — migration em produção que o João roda; renomear depois exige outra migration e muda as consultas.
- **D-02:** Gravação por insert direto do navegador via supabase-js sob RLS (insert do próprio `user_id`, incluindo admin sem linha em `client_members`); select só `is_app_admin()`. Sem dispatcher, sem função nova em `api/`, sem `sendBeacon`.
- **D-03:** Gancho único no router (`router.subscribe('onResolved')`, filtrando mudança de caminho), cobrindo o primeiro carregamento. Fire-and-forget: erro engolido, nunca trava nem atrasa a navegação.
- **D-04:** Grava só em produção; preview e local não gravam, para não sujar a linha de base. Hosts de produção confirmados pelo João em 09/11/2026: exatamente `dash.doctorcreator.com.br`, `nexo.doctorcreator.com.br` e `sap.doctorcreator.com.br` (nenhum `*.vercel.app` de produção).
- **D-05:** Retenção bruta de 180 dias (cobre os 90 dias da decisão do SAP com folga e duas leituras trimestrais). Limpeza diária por `pg_cron` guardado (mesmo padrão de `resultado_pronto`/`resultados_diarios`), entregue na mesma migration. — **Reversibility:** costly — linhas apagadas não voltam; para aumentar, mudar o job antes do dia 180.
- **D-06:** Nunca gravar query string, hash, id de paciente/lead nem URL completa; `rota` é só o padrão com `$params`. `client_id` é o único id gravado.

### O que conta como abertura
- **D-07:** Mesma rota + mesma clínica (`client_id`) + mesma sessão dentro de 2 s conta uma vez (descarta duplicata de render/redirect). A mesma tela em outra clínica conta de novo. Reabrir depois de 2 s conta de novo. (Refinado e ratificado pelo João em 09/11/2026.)
- **D-08:** Abertura pela equipe na tela de uma clínica grava o `client_id` da clínica e `eh_equipe = true`. A visão agregada separa sempre equipe × clínica; uso da clínica = `eh_equipe = false`.
- **D-09:** Os testes do João e da equipe entram no log (são uso real da equipe) e ficam separáveis por `eh_equipe`. Clínicas com `clients.eh_teste = true` ficam fora da visão agregada por padrão.
- **D-10:** `origem` com valores fechados: `menu`, `busca` (Cmd+K), `link` (clique em link dentro do app), `direto` (primeira carga ou URL digitada/favorito), `redirecionamento` (guardas e redirects), `bloqueada` (guarda de acesso negou). A origem `busca` já é marcada nesta fase no Cmd+K existente, para a Phase 3 só acrescentar as escondidas. Exceção aceita pelo João em 09/11/2026: URL digitada não canônica que o app corrige sozinho (replace do Transitioner) fica como `redirecionamento`; URL digitada canônica continua `direto`.

### Visão agregada (LOG-03)
- **D-11:** Aba nova "Uso das telas" dentro de `/admin/conferencia` (tela que fica viva na v5; Relatórios do admin será escondida). Só admin vê.
- **D-12:** Mostra por rota: aberturas, pessoas distintas, última abertura e divisão por origem; filtro de período (7, 30, 90 dias) e chave equipe × clínica; lista também as rotas com 0 aberturas no período (a partir da árvore de rotas). Tabela simples, sem gráfico (sistema visual: sem pizza/rosca).
- **D-13:** Texto da aba sem jargão e sem conclusão: mostra contagem; não diz "tela inútil" nem sugere corte (corte é decisão do João, e "0 aberturas" nunca é prova sozinho).

### Linha de base antes de esconder
- **D-14:** A Phase 3 só esconde telas depois de 7 dias corridos de log gravando em produção (uma semana inteira, com dia útil e fim de semana), não 24 h. As 24 h continuam sendo o critério de pronto desta fase (linhas de admin e de viewer aparecendo). ROADMAP atualizado.

### PR e efeitos
- **D-15:** O PR da fase vai para a base `claude/doctor-creator-hub-nixvw6` (confirmado pelo João em 09/11/2026). O merge dispara o `banco.yml`, que aplica a migration nova em homologação automaticamente; produção continua só com aprovação do João.

- **D-16:** Telas negadas por guarda (admin, SAP) gravam `bloqueada` para a tela negada e `redirecionamento` para o destino. As 12 rotas que só redirecionam pela configuração (sem componente) não ganham linha própria; quem chega por elas aparece na tela de destino com origem `redirecionamento`, e a aba as marca como "só redireciona". Critério 1 do ROADMAP ajustado. (Ratificado pelo João em 09/11/2026.)

### Claude's Discretion
- Todo o bloco acima foi delegado ("segue recomendação"). Detalhes como índices, nome da função de limpeza e forma do id de sessão ficam com o planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Produto e escopo
- `.planning/ROADMAP.md` §Phase 2 — goal, success criteria, "uma fase, um PR", migration como arquivo que o João roda
- `.planning/REQUIREMENTS.md` §Log por rota (LOG-01..04)
- `.planning/PROJECT.md` §Constraints — Vercel 12/12 funções, só o João roda SQL de produção, print do site no ar
- `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md` — princípio 3 (nada é apagado sem dado de uso; abertura de escondida é gravada) e roteiro v1 item (1)

### Pesquisa
- `.planning/research/SUMMARY.md` §Fase 1: Log por rota, §Divergências (insert direto), §Gaps 4 e 18
- `.planning/research/STACK.md` — `router.subscribe('onResolved')`, marcador de origem do Cmd+K
- `.planning/research/ARCHITECTURE.md` — hook no layout autenticado, RLS insert-own / select admin
- `.planning/research/PITFALLS.md` — log que não grava admin (policy por `is_client_member`), log que grava parâmetros com id, migration não aplicada quando o código sobe

### Código
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/TESTING.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/router.tsx` (`getRouter`/`createRouter`): ponto do gancho `router.subscribe('onResolved')`.
- `src/routes/_authenticated.tsx` (`AuthLayout` com `useAuth`): usuário e sessão disponíveis; `src/lib/auth-session.ts` já resolve `isAdmin` via RPC `is_app_admin`.
- `src/components/app-shell.tsx` (~293–320, 630–680) e `buscarTelas` em `src/lib/nav.ts:510`: Cmd+K existente, onde marcar `origem = busca`.
- `src/routes/_authenticated.admin.conferencia.tsx`: tela onde entra a aba "Uso das telas"; já usa `supabase` direto e `clients.eh_teste`.
- Migrations com `pg_cron` guardado: `supabase/migrations/20261105120000_resultado_pronto.sql`, `20261106130000_resultados_diarios.sql`.
- Testes de banco: `scripts/test-migrations.ts`, `scripts/test-db-security.ts` (um caso por tabela nova: outra clínica/viewer não lê; insert só do próprio user).

### Established Patterns
- RLS por `is_client_member`/`is_app_admin()`; staff admin muitas vezes sem linha em `client_members`, por isso a policy de insert é por `user_id = auth.uid()`.
- Código deve degradar se a migration ainda não rodou (insert falha em silêncio; aba mostra "tabela ainda não criada").

### Integration Points
- Router (gancho global), Cmd+K (marcador de origem), guardas de rota (origem `redirecionamento`/`bloqueada`), `/admin/conferencia` (aba).

</code_context>

<specifics>
## Specific Ideas

- Rotas com 0 aberturas aparecem na lista, para a decisão 3 e para a decisão do SAP, sempre com o período escrito.
- Zod local desatualizado (3.25.76 vs 4.6.7 no lockfile): rodar `npm ci` antes de mexer em schemas.

</specifics>

<deferred>
## Deferred Ideas

- Cmd+K mostrando telas escondidas e botão Buscar no celular — Phase 3.
- Usar o log para propor cortes ou fusões — decisão 3 do João e v2 (fusões só se o log mostrar telas abertas na mesma sessão).
- Critério mensurável de "log ligado" para liberar a v1.5 — o João fixa; medido na Phase 14.

</deferred>

---

*Phase: 02-log-por-rota*
*Context gathered: 2026-11-09*
