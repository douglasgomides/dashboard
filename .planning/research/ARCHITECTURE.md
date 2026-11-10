# Architecture Research

**Domain:** Brownfield SPA + Supabase analytics product for clinics (Nexo v5.0: Fase 0 + degrau v1 integration)
**Researched:** 2026-11-09
**Confidence:** HIGH for integration points that were read in code (dispatcher, nav, router, migrations); MEDIUM for the Kommo events API and for production-only facts (live `pacientes_periodo` definition, pg_cron schedules, n8n schedules); LOW where flagged.

Scope: only what the NEW v5.0 features need. Existing architecture is in `.planning/codebase/ARCHITECTURE.md` and is not repeated.

---

## Headline findings (read these first)

1. **Two of the "new" pieces already exist and must be extended, not rebuilt.**
   - *Weekly Kommo conferência (item 6)*: `api/_lib/conferencia-ao-vivo.ts` (766 lines, `runConferenciaAoVivo`, GET-only against Kommo/RD/FlwChat/WTS/Digisac), table `conferencia_ao_vivo` (`supabase/migrations/20261102180000_conferencia_ao_vivo.sql`), dispatcher branch `?conferencia_ao_vivo=1` (`api/sync/manual.ts:94` and `rodarConferenciaAoVivo` at line ~1306), UI `src/components/conferencia-ao-vivo-resumo.tsx`, plus the lead-sweep reconcile `api/_lib/kommo-reconcile.ts` behind `api/sync/kommo-leads.ts?reconcile=1` (marks `crm_leads.removido_na_origem`). What is missing: (a) it compares *lead counts* (open/created/won/lost + sample of 20), **not** the funnel metrics the selo covers (entrou na etapa Agendada / chegou ao menos / Foram / Fecharam); (b) it does not write `metricas_selo`; (c) no schedule is recorded in the repo (docs/ and `.github/workflows/` have none) - it is probably n8n-only or never scheduled. Verify with the owner.
   - *Cmd+K*: already implemented in `src/components/app-shell.tsx:293` (`Ctrl/Cmd+K` toggles `buscarTelas()` from `src/lib/nav.ts`). The v5 work is "include hidden tabs for the team + log each open", not a new palette.
2. **The metric definitions the Fase 0 table disputes live in two tiny SQL functions, not in the 45k-character `pacientes_periodo`.** `public.crm_papel_conta(p_papel, p_conceito)` and `public.crm_perfil_conta(...)` (`supabase/migrations/20261104100000_perfil_da_clinica.sql:98` and `:117`) hold the concept tables: `'agendou'` and `'compareceu'` are *cumulative* (`compareceu` = `compareceu|venda|posvenda`, which is exactly why Foram=14 came from sales), `'consulta_agendada'` is *entered only* (`agendado`). That is the seam for decisions 1a/1b. Do **not** patch `pacientes_periodo_calc` again unless unavoidable (see Pitfall A).
3. **`pacientes_periodo` is a cache wrapper around a function that only exists in production as text.** `20261105120000_resultado_pronto.sql` renamed the original to `pacientes_periodo_calc` and wrapped it with a 20-min `resultado_pronto` cache; the calc function itself was assembled by ~10 `DO` blocks that rewrite `pg_get_functiondef(...)` text with exact-once `replace()` guards (e.g. `20261104100000_perfil_da_clinica.sql:974-1045`). The repo cannot replay it as a readable definition. Any change to it needs a fresh `pg_get_functiondef` dump from production first (owner runs it).
4. **Hoje cannot call `pacientes_periodo` with the service-role client.** The wrapper starts with `is_app_admin() or is_client_member(p_client)`, both read `auth.uid()`, which is null for service role, so it raises `42501`. Existing precedent for a user-scoped client inside a dispatcher-style handler: `api/_lib/central-canais.ts:32` (`createClient(url, VITE_SUPABASE_PUBLISHABLE_KEY, { global: { headers: { Authorization: bearer } } })`). `hoje` must do the same so RLS and the membership check stay the authorization boundary.
5. **Dispatcher gate details that will bite the `hoje` PR.** `api/_lib/request-validation.ts` `manualRequestSchema.alvo` is a closed `z.enum` with `.strip()`: an unlisted `alvo` returns 400 before any handler runs (note: `src/components/agentes-ia.tsx:214` already sends `alvo: "anuncio_acao"`, which is not in the enum - latent bug, outside scope, but proof the enum is the gate). And in `api/sync/manual.ts:~216` a member whose role is not `owner`/`strategist` gets 403 unless `alvo` is in the hard-coded read-only list `["audiencia", "periodo_instagram", "crm_negocio_resumo"]`. `hoje` (and `quem_chamar`) must be added there or `viewer` doctors get 403.
6. **`resultados_diarios.agendaram/compareceram/fecharam` (daily 03:30 snapshot, 20 clinics since 08/09) were all computed with the old definitions.** After a Fase 0 definition change the history is a mixed series. It needs a `definicao_versao` column (or a documented truncate + `resultados_preencher` refill in windows of at most 14 days) and a `delete from resultado_pronto` (the cache invalidation trigger only fires on CRM-config changes).

---

## Standard Architecture (target, v1 additions highlighted with `+`)

```
Browser (React SPA)
  _authenticated.tsx ── + useRouteLog (route pattern, origem, sessao)  ──insert──► + rota_acessos
  app-shell.tsx ─ Cmd+K (buscarTelas incl. hidden tabs for team) ── + marca origem 'cmdk'
  + routes/_authenticated.$clientId.hoje.tsx ── + components/hoje/* (dbx-*) ──POST alvo:"hoje"──┐
  + routes/_authenticated.$clientId.ajuda.tsx (médico: "Ajuda e fontes")                         │
  admin routes (Carteira / Clínica / Conferência e fontes) ── read selo + conferencia_ao_vivo    │
                                                                                                  ▼
Vercel (12/12 functions, no new files in api/)                                  api/sync/manual.ts (dispatcher)
  + alvo "hoje"        ─► + api/_lib/hoje.ts      ── user-scoped client ──► RPCs (RLS applies)
  + alvo "quem_chamar" ─► + api/_lib/quem-chamar.ts ─ service client + server-side mask ─► log
  ?conferencia_ao_vivo=1 (SYNC_SECRET) ─► conferencia-ao-vivo.ts  ── + funil metrics ── + selo writer
  agendamento SYNC_SECRET: acao + "resumo_semanal" ─► + api/_lib/resumo-semanal.ts (shadow)
                                                                                                  │
Supabase (cvdnzoqduliopscfsrkc)                                                                   ▼
  existing: pacientes_periodo (cache wrapper) · crm_perfil_* · resultados_diarios · clinica_metas · sync_status · conferencia_ao_vivo
  + rota_acessos · + metricas_definicao · + metricas_selo · + quem_chamar_liberacao · + lista_acessos
  + resumos_semanais_sombra · + hoje_numeros()/hoje_par() RPC (small, set-based, cached)
  pg_cron: resultados-diarios 03:30 (exists) · resultado-pronto */10 (exists) · + selo_expirar (daily)
```

### Component Responsibilities

| Component | Responsibility | New / Modified | Lives in |
|-----------|----------------|----------------|----------|
| Route log hook | One insert per navigation, route *pattern* not URL, `origem`, per-tab session id | NEW | `src/hooks/use-route-log.ts`, mounted in `src/routes/_authenticated.tsx` `AuthLayout` |
| Nav descriptor flag | `situacao: "viva" \| "escondida" \| "tirada"` per tab; hidden tabs searchable by team only | MODIFIED | `src/lib/nav.ts` (`NavTab`, `tabVisivel`, `buscarTelas`, `navegacaoClinica`) |
| Cmd+K origin tag | Tells the log the open came from the palette | MODIFIED | `src/components/app-shell.tsx` (palette item click) |
| Selo store | Stored seal per clinic × metric × definition version | NEW | table `metricas_selo` + `metricas_definicao`, reader `src/lib/selo-data.ts`, UI `src/components/selo-badge.tsx` |
| Selo writer | Sets `verde`/`ambar` from weekly conferência; expires `verde` to `neutro` after 30 days | NEW | `api/_lib/selo.ts` (called by conferência job), SQL fn `selo_definir` (admin), cron `selo_expirar` |
| `hoje` composer | Per-block fetch with isolated failure, selo merge, worst-selo propagation, role-aware withholding | NEW | `api/_lib/hoje.ts` (I/O) + `src/lib/hoje.ts` (pure: frase template, funil monotonicity, worst selo) |
| `hoje` numbers RPC | Par "entraram na etapa / chegaram ao menos" for Agendaram, Foram strict, Fecharam com valor | NEW (small, set-based) | migration `hoje_numeros` using `crm_perfil_etapas()` + `crm_lead_eventos`, wrapped like `resultado_pronto` |
| Hoje screen | Single column, 5 states per block | NEW | `src/routes/_authenticated.$clientId.hoje.tsx`, `src/components/hoje/*` |
| Weekly Kommo job | Compare funnel metrics for the closed week vs live Kommo; write `conferencia_ao_vivo` rows + selo | MODIFIED (extend existing) | `api/_lib/conferencia-ao-vivo.ts`, `src/lib/conferencia-ao-vivo.ts` (tolerances), trigger = n8n weekly call |
| Quem chamar | List behind 4 conditions, masked by role, every open logged | NEW | `alvo:"quem_chamar"`, `api/_lib/quem-chamar.ts`, SQL `quem_chamar_hoje()` (service-only), tables `quem_chamar_liberacao`, `lista_acessos`, `lista_acesso_nominal` |
| Weekly summary (shadow) | Compose from stored selo + same numbers as Hoje; team only; never to doctor | NEW | `agendamentoSchema` new `acao`, `api/_lib/resumo-semanal.ts`, table `resumos_semanais_sombra` |
| Goals | `clinica_metas` seed by SQL (table exists, metrics limited to 3) | DATA ONLY | `supabase/seeds/` file, owner runs |
| Verification queries | Read-only SQL: post_id/ad_id coverage, per-source timestamps | NEW (files) | `supabase/verificacao/*.sql` (new dir), optional runner via the `alertas.yml` pattern |
| WhatsApp template request | Ops deliverable; registry row only | DOC + tiny table | `docs/` file; no runtime code in v1 |

---

## Where each v1 item lives (per PR, in the brief's mandated order)

### PR 1 - Log por rota

- **Migration** `supabase/migrations/2026110910xxxx_rota_acessos.sql` (new, additive):
  `rota_acessos(id bigint identity pk, user_id uuid not null default auth.uid(), client_id uuid null, rota text not null, origem text not null check (origem in ('menu','cmdk','url','redirect','atalho')), escondida boolean not null default false, papel text, sessao uuid not null, aberto_em timestamptz not null default now())`.
  Indexes `(rota, aberto_em)`, `(client_id, aberto_em)`, `(sessao, aberto_em)`. The `sessao` column is what v2 needs for the "opened in the same session" fusion test.
- **RLS**: `insert` for `authenticated` with check `user_id = auth.uid() and (client_id is null or public.is_app_admin() or public.is_client_member(client_id))`; `select` only `public.is_app_admin()`; no update/delete grants. Mirror the grant style of `conferencia_ao_vivo` (`revoke all ... from public, anon, authenticated` then explicit grants).
- **Write path**: direct `supabase.from("rota_acessos").insert()` from the browser, fire-and-forget, errors swallowed. **Do not route through the dispatcher** (cost, cold start, 100 deploys/day irrelevant here, and logging must never block navigation). This is the only v1 write that deliberately bypasses `/api/sync/manual`.
- **Hook**: `useRouterState({ select: s => s.matches.at(-1)?.routeId })` yields the *pattern* (`/_authenticated/$clientId/pacientes`) - no UUIDs in the route column, so the log is aggregable and holds no PII. `$clientId` comes from `s.matches` params into `client_id`. Mount once in `AuthLayout` in `src/routes/_authenticated.tsx:22` so it covers `/admin/*`, `/sap/*`, `/assistentes-ia`, client routes. Debounce identical consecutive route+client within ~1.5 s (React 19 StrictMode double effect in dev, redirects).
- **Origin tagging**: a tiny module-level `marcarOrigem("cmdk")` set by the palette click in `app-shell.tsx` and consumed (then cleared) by the hook; default `menu` when the click came from a `TabLink`, `url` on first load/back/forward, `redirect` for the guards in `_authenticated.$clientId.tsx` (`CLIENTES_SO_CRM`, `semAudiencia`).
- **Admin read**: a view/RPC `rota_uso(p_dias int)` (admin only) grouping by `rota`, with count and distinct users. Used for the "log is on" release condition (rows in the last 24 h) and for the 90-day SAP decision.
- **Risk**: `routeTree.gen.ts` is generated and gitignored - never edit it; adding the hook touches no route files except `_authenticated.tsx`.

### PR 2 - Consultas de verificação

- **Files only** (agent cannot run SQL): `supabase/verificacao/01-post-id-ad-id-cobertura.sql`, `02-timestamp-por-fonte.sql`, `03-cards-removidos-e-copias.sql`, each with `\set client_id '<uuid>'`, read-only, one result table with the columns the Fase 0 table needs. Existing precedents for read-only audit SQL: `supabase/audits/preflight.sql`, `scripts/alertas/verificar.sql`, `supabase/tests/operacao_verificavel.sql`. Run by the owner in psql, or via a `workflow_dispatch` job cloned from `.github/workflows/alertas.yml` (it already has `SUPABASE_DB_URL_PROD` and a step-summary pattern).
- **post_id/ad_id coverage**: ad origin lives in `conversas_origem_anuncio(conversa_id, ad_id, campaign_id, ctwa_clid ...)` (`20261014105000`), filled only by the WTS path (`api/_lib/conversas-wts.ts`). Kommo/Digisac/FlwChat have no equivalent column today, so coverage for the Lana (Kommo) pilot will likely read ~0% from this table; the query must also look at `crm_leads.raw_payload` source fields (`source_id` is requested with `with=source_id,contacts` in `kommo-reconcile.ts`) and `links_rastreados.instagram_post_id / ad_campaign_id`. The result sets decision 8 (coverage floor). Nothing in the app consumes it in v1.
- **Timestamp per source**: compare `sync_status.last_success_at/data_ate` (per client × fonte: instagram, comentarios, anuncios, crm, atendimento) against `max(crm_lead_eventos.ocorreu_em)`, `max(conversas.ultima_msg_em)`, `max(mensagens.enviada_em)`, and against a live-source sample from the existing `conferencia_ao_vivo.detalhe`. Check *timezone*: `CONCERNS.md` records `America/Sao_Paulo` vs UTC drift (`api/_lib/dia-meta.ts`, `report-metrics.ts`); `conferencia-ao-vivo.ts` hard-codes `FUSO_BR = 3h`. Query 02 is also the evidence for condition 4 of "Quem chamar".

### PR 3 - `metricas_selo`

- **Migration** `..._metricas_selo.sql`:
  - `metricas_definicao(metrica text, versao int, o_que_conta text not null, vigente boolean, vigente_desde timestamptz, primary key (metrica, versao))` - the "o que este número conta" text lives with the *version*, not duplicated per clinic. Readable by any authenticated user; written by admin RPC only.
  - `metricas_selo(client_id uuid, metrica text, definicao_versao int, estado text check (estado in ('verde','neutro','ambar','nao_medido')), texto_curto text not null, valor_nexo numeric, valor_origem numeric, fonte text, conferido_em timestamptz, expira_em timestamptz, evidencia jsonb, definido_por text, atualizado_em timestamptz default now(), primary key (client_id, metrica, definicao_versao))`, FK `(metrica, definicao_versao)` to `metricas_definicao`.
  - RLS: `select` for `is_app_admin() or is_client_member(client_id)` (identical to `resultados_diarios` and `clinica_metas`); writes only `service_role` and an admin `security definer` RPC `selo_definir(...)` with `set search_path = public, pg_temp` (CONCERNS.md flags earlier definer functions without it).
  - **"Stored, never computed" includes expiry**: do not compute "30 days → neutro" at read time. A daily `pg_cron` job `selo_expirar()` updates `estado='verde' and expira_em < now()` to `neutro` with new text. pg_cron already runs in production (`resultados-diarios`, `resultado-pronto`); copy the guarded `do $cron$` block from `20261105120000_resultado_pronto.sql` so local tests skip it.
- **Reader**: `src/lib/selo-data.ts` (`lerSelos(clientId)` returning a `Map<metrica, Selo>` for the *vigente* version), `src/components/selo-badge.tsx` (icon + 14px text always, per brief). No selo computed in React.
- **Who writes**: v1 first rows come from the owner's SQL (decision 6) with the Fase 0 evidence (`evidencia` points at the manual table/`conferencia_ao_vivo` ids); afterwards the weekly job (PR 6). Missing row ⇒ the block has no selo ⇒ the endpoint withholds the number from non-team roles (see PR 4).
- **Does not block on decision 1**: ship with `definicao_versao = 0` ("regra atual, acumulada") rows in `ambar` (the rule differs from the CRM; both numbers in text, as in the brief). Version 1 appears when João closes the definitions.

### PR 4 - `hoje` endpoint (dispatcher)

- **Registration**: add `"hoje"` to `manualRequestSchema.alvo` (`api/_lib/request-validation.ts`), add it to the read-only allowlist at `api/sync/manual.ts:~216`, add a branch next to `if (alvo === "crm_negocio_resumo")` (line ~230, the closest existing read-only pattern) that delegates to `api/_lib/hoje.ts`. Keep the branch to ~6 lines; the dispatcher is already 1338 lines.
- **Identity**: build a user-scoped client from the caller's bearer (pattern `central-canais.ts:32`), call RPCs with it so `pacientes_periodo`, `crm_perfil_*` and RLS apply. Use the service client only for tables with no member policy.
- **Blocks and sources** (each wrapped in its own `Promise.allSettled` slot with an `AbortSignal` budget so one slow block cannot take the others down):

| Block | Source | Notes |
|-------|--------|-------|
| `fontes` | `sync_status` (member-readable: policy "membro ou admin le sync_status") / RPC `client_sync_status(uuid)` | `status_das_fontes()` is **admin-only** (`20261105130000`), so the médico view must use the per-client reader |
| `agendaram` | new `hoje_numeros()` + selo | par "entraram / chegaram ao menos"; only CRM source can be green |
| `fecharam` | `pacientes_periodo.numeros.fecharam` (`vendas`, `sem_valor`, `valor_total` already returned) | "13 vendas, 3 com valor" = `vendas`, `vendas - sem_valor`; no SQL change needed |
| `chamaram` | `numeros.mandaram_mensagem` | neutral selo |
| `foram` | `numeros.compareceram` or strict variant from `hoje_numeros()` | `nao_medido` when `valor` is null |
| `funil` | pure `src/lib/hoje.ts` over the numbers; reuse `src/lib/funil-taxa.ts` (`passagem`, `agendadosSaoGanhos`) | drop-highlight only if monotonic and no unmeasured stage |
| `meta` | `clinica_metas` + `pacientes_periodo(first_of_month, yesterday)` | **not** `sum(resultados_diarios)`; that migration states the daily sum is not the period number |
| `quem_chamar` | `quem_chamar_liberacao` row | returns only `{liberado, n}` here; the list itself is a separate call (PR 7) |
| `frase` | pure template over the other blocks | inherits worst selo; fixed model, past tense |

- **Response contract** (HTTP 200 whenever auth succeeded; do not use top-level `ok:false` for partial failure because `withApiObservability` counts `ok:false` as a failed request):

```ts
{ ok: true, gerado_em: string, clinica: string, periodo: { de: string; ate: string },
  blocos: Record<BlocoId, {
    status: "ok" | "sem_dado" | "nao_medido" | "sem_selo" | "erro" | "calculando",
    dado?: unknown, selo?: { estado: "verde"|"neutro"|"ambar"|"nao_medido"; texto: string; definicao_versao: number },
    atualizado_em?: string, ultimo_valor?: unknown, erro?: string  // erro: user-safe Portuguese only
  }> }
```

- **Role-aware withholding is server-side**: for `owner`/`viewer`, a block without a selo row returns `status:"sem_selo"` and **no number** ("nenhum número sem selo"). Team roles (`admin`, `strategist`) get the number with the "sem selo" notice. Never rely on the React layer for this.
- **Performance**: Hoje opens a *fixed* window so the existing `resultado_pronto_aquecer()` (every 10 min, re-warms anything opened in the last 24 h) keeps it hot; Hoje calls `pacientes_periodo` at most twice (week window + month-to-date). Open question for João: which window is "the week" on Hoje (rolling 7 days to yesterday vs Monday-to-yesterday vs last closed week)? The brief does not say; it determines cache keys. The "cálculo de hoje 03:30" strip in the brief suggests reading a nightly snapshot; if the live-open time exceeds ~10 s on large clinics, add a snapshot step to the existing 03:30 cron instead of computing on open.
- **`hoje_numeros()`**: new small RPC, set-based, joining `crm_perfil_etapas(p_client)` once (`materialized`, exactly the pattern in `20261104100000`) against `crm_lead_eventos`. **Never** call `crm_perfil_conta()` per row; the 04/11 per-row performance regression (memory: "Função por linha deixa o Nexo lento") is why `crm_papel_conta` exists. Cache it by extending the `resultado_pronto` pattern; note `resultado_pronto_aquecer()` has a hard-coded `CASE` over three function names and was last redefined in `20261105130000_resultado_pronto_geral.sql` - a 4th function means a `create or replace` of the *latest* version, not the first.
- **Tests**: `scripts/test-hoje.ts` (pure composition, role withholding, block isolation) auto-picked up by `scripts/run-tests.mjs` (`test-*.ts`).

### PR 5 - Hoje screen

- **Route**: `src/routes/_authenticated.$clientId.hoje.tsx` (flat-file convention), components in `src/components/hoje/` reusing `dbx-*` classes from `src/styles/databoard.css` and `WorkspaceButton/WorkspaceEmpty` from `src/components/workspace-ui.tsx`. Run `npm run routes:generate`.
- **Data**: one `useQuery(["hoje", clientId, de, ate])` posting `alvo:"hoje"` with the session bearer (same fetch pattern as `src/lib/audiencia.ts:44`). Per-block rendering from `blocos[x].status`; do not gate the whole screen on one query state.
- **Landing change**: `src/routes/_authenticated.index.tsx` currently ends with `redirect to /$clientId/pacientes` and sends clinics inside the SAP programme to `/sap/$clientId/painel`. Médicos should land on `/hoje`; the SAP redirect conflicts with "SAP escondido e congelado" and needs a decision (flag, do not silently change).
- **Menu**: this is where médico gets Hoje + Ajuda e fontes (see Menu below). `Ajuda e fontes` is a new simple route `_authenticated.$clientId.ajuda.tsx` reading the member-readable `sync_status`.
- **Pitfall**: `src/routes/_authenticated.$clientId.tsx` mounts `CoberturaPeriodo`, `DisponibilidadeFontes`, the period picker and `cobertura_periodo` RPC for every child route. Hoje has no period picker; either bypass these for the `/hoje` pathname (as is done with `ehOperacaoCrm`) or the 400px layout is polluted.

### PR 6 - Weekly Kommo conferência

- **Reuse**: trigger `GET/POST /api/sync/manual?conferencia_ao_vivo=1&fonte=kommo&client_id=<Lana>` with `Bearer SYNC_SECRET` (`timingSafeEqual` path, no body schema, so no enum change). Schedule from **n8n weekly (Monday, after the 03:30 snapshot)**: consistent with how `agentes` schedule calls already use `SYNC_SECRET`. GitHub Actions `schedule` is the alternative, but scheduled workflows run from the default branch (`prod-fix`) while `quality.yml/banco.yml` still point at `claude/doctor-creator-hub-nixvw6` (CONCERNS.md), so confirm branch behaviour first.
- **Extend `runConferenciaAoVivo`** with funnel metrics for the closed week, as extra `metrica` rows (table accepts any `^[a-z0-9_]{1,60}$` metric, so **no schema change**): `agendaram_entraram`, `agendaram_ao_menos`, `compareceram_estrito`, `fecharam_vendas`, `fecharam_com_valor`. Live source for "entered stage in week": Kommo `GET /api/v4/events` with `filter[type]=lead_status_changed` and `filter[created_at][from|to]` (Unix), `filter[entity]=lead`, `limit` up to 250, paginated via `_links.next`. **There is no server-side filter by destination status** (`value_after` is not filterable) - the job must page all status-change events of the week and filter client-side; event retention is undocumented (MEDIUM/LOW; spike in Fase 0 before committing). Nexo side: `crm_lead_eventos` (movements only exist since 14/10/2025 per FASE0). Rate-limit through `ritmoKommo()` and the existing 270 s `prazo`.
- **Selo writer** (`api/_lib/selo.ts`): after the rows are saved, for each metric within tolerance (`TOL_EXATA` for closed periods in `src/lib/conferencia-ao-vivo.ts`) upsert `verde` with `texto_curto = "Conferido no Kommo em dd/mm"`, `expira_em = +30d`; if outside tolerance upsert `ambar` with both numbers in the text; if the source could not be read (`ok = null`) **do not touch the selo** (a failed job must not demote or promote). Never write `verde` when the number's `fonte` includes `conversa` (the `agendaram` CTE unions CRM with AI-read conversations: `ag_crm full join ag_ia`), only for CRM-only metrics.
- **Reconcile prerequisite for Quem chamar**: schedule `api/sync/kommo-leads.ts?reconcile=1` in the same weekly run, *before* the conferência, so `removido_na_origem` is fresh (39% of Lana's cards are flagged; this is a precondition for condition 1).
- **Auth detail**: `api/sync/kommo-leads.ts` compares the secret with `token !== SYNC_SECRET` (not constant time) unlike the dispatcher. Out of scope, note only.
- **Do not add a new `api/` file** (12/12, a 13th silently freezes deploys; the header comment in `kommo-leads.ts` documents exactly this).

### PR 7 - "Quem chamar hoje" behind 4 conditions

- **Conditions as data, not code**: table `quem_chamar_liberacao(client_id pk, c1_exclusoes_ok bool, c2_so_quem_escreveu_ok bool, c3_validadas int, c3_acertos int, c4_timestamp_ok bool, liberado_em, liberado_por, evidencia jsonb)` with generated `liberado = c1 and c2 and c3_validadas >= 20 and c3_acertos >= 18 and c4`. Written by owner SQL / admin RPC. The `hoje` block `quem_chamar` only reads `liberado`.
- **List query**: new SQL `quem_chamar_hoje(p_client)`, `security definer`, `set search_path`, **service_role only**, derived from `recuperacao_sem_resposta()` (`20261105160000`) which already implements: WhatsApp conversations, last patient message that asks for a reply, no human (non-robot) reply since, person not already agendada/compareceu/venda via `crm_perfil_etapas`. Add: `removido_na_origem is null` (already in `avancou`, must be in the main set too), read cards through `crm_leads_do_cliente(p_client)` (the accessor that respects shared CRM accounts and `crm_filtro_cliente`; HOMS is shared by 3 clients), and robot-copy exclusion. **"Cópia do robô" today is only a heuristic in sales**: `crm_perfil_vendas_sql` flags `copia` when the same person has another sale-stage card within 3 days (`lag(...) <= interval '3 days'`). Condition 1 needs a card-level definition from the Fase 0 evidence (e.g. creation source / duplicate contact within a window) - this is a Fase 0 deliverable, not something to guess in PR 7. Keep `limit 5`, motivo explicit, `tempo_parado` from the timestamp verified in PR 2.
- **Masking server-side** in `api/_lib/quem-chamar.ts`, never React: `owner` → initials; new `lista_acesso_nominal(client_id, user_id, base_legal text, concedido_por, concedido_em, revogado_em)` row → first name (`public.primeiro_nome()` already exists); `admin`/`strategist` (agência) → count only. The DB `client_members.role` has only `owner|strategist|viewer` (`20260822000000_fase1_schema.sql:27`), so "secretária" is **not** a role today; model it as the `lista_acesso_nominal` grant, which also gives decision 10 (LGPD basis) a column to record. `api/_lib/mascarar-pii.ts` is the existing masking helper to extend/reuse.
- **Access log**: `lista_acessos(id, client_id, user_id, papel_visto, mascara text, n_linhas int, aberto_em)` insert by the handler (service role) in the same request that returns the list; if the insert fails, the list is not returned (fail closed, opposite of the route log).
- **Dispatcher**: `alvo:"quem_chamar"`, `acao:"listar"`. This one is **not** in the viewer read-only allowlist by default; allow `owner` and `viewer` only after the handler's own grant check, because the allowlist skips the write-permission guard entirely.
- **WhatsApp button**: opens the official-API flow with an approved template and a confirmation; never auto-sends. Template approval (PR 9) gates the button's enabled state; the existing Meta channel code is `api/_lib/central-meta.ts` / `central-canais.ts` (Central de atendimento), which is hidden but must stay functional.
- **Existing overlap to retire**: `paraChamarAgora()` in `src/lib/pacientes.ts:390` ("quem chamar agora": recompra + agendou sem retorno) feeds the Pacientes screen from the 200-capped lists. Keep it for the team's hidden screen; do **not** reuse its output for the v5 list (different meaning, no "wrote to the clinic" test).

### PR 8 - Weekly summary in shadow mode

- Reuse the `resumo_equipe` pattern: `agendamentoSchema` in `api/sync/manual.ts:~57` is `.strict()` with `acao: z.enum(["rodar","brain_enfileirar","agendar","resumo_equipe"])`; add `"resumo_semanal"`. The `SYNC_SECRET` branch (line ~161) returns composed content + team recipients (`resumoEquipe()` in `api/_lib/resumo-equipe.ts` resolves `app_admins` emails and n8n/Brevo sends). New `api/_lib/resumo-semanal.ts` composes from the **same pure functions as Hoje** (`src/lib/hoje.ts`) and from stored selo only, so "reviewer checks against `metricas_selo`, not prose" is structural. Writes `resumos_semanais_sombra(client_id, semana, texto, numeros jsonb, selos jsonb, gerado_em, revisado_por, revisao_ok)`; RLS admin-only. Silence rules: any non-verde selo, group < 5, source > 1 day, stage out of order ⇒ row with `motivo_silencio` and the team receives "resumo suspenso".
- Opt-in table for v1.5 (decision 6) is a SQL file delivered now, unused by code.

### PR 9 - WhatsApp template request

No runtime code. A `docs/` file with the template text (past tense, no promise, CFM rules) and a tiny `whatsapp_templates(nome, idioma, categoria, status, aprovado_em)` registry only if the owner wants the PR 7 button state driven by data. Meta Dev/WhatsApp connectors are not authorized in this session (needs claude.ai connector auth); request goes through the owner. Start the request early in calendar time (approval latency), independent of PR order.

### PR 10 - Metas por SQL

`clinica_metas` exists (`20261106120000`): PK `(client_id, metrica)`, `metrica in ('mandaram_mensagem','agendaram','fecharam')`, `valor > 0`, monthly, empty today, writes admin-only. Deliver `supabase/seeds/metas_lana.sql` (a seed, not a migration, owner runs). `src/components/databoard-inteligencia.tsx` is the only current reader; the Hoje meta block adds a second reader through the `hoje` endpoint. Constraint to flag: `faturamento` and "Foram" cannot have goals without altering the check constraint.

---

## Phase 0: where corrections touch the existing metric code

| # | Finding (FASE0-Lana) | Code location | Nature of fix | Risk |
|---|----------------------|---------------|---------------|------|
| 1 | Agendaram 11 vs 7 (cumulative) | `crm_papel_conta` / `crm_perfil_conta` concepts `'agendou'` (cumulative) vs `'consulta_agendada'` (entered) in `20261104100000_perfil_da_clinica.sql:98,117`; the `agendaram` CTE (`ag_crm`) in `pacientes_periodo_calc` also unions `c.em_agendamento` (cards *currently* at/after the stage) with the stage-entry events (`20261031150000_pacientes_do_periodo.sql:296-304`) | Do **not** flip the cumulative one. Add the *pair* via the new `hoje_numeros()`; the label "marcaram consulta" in `src/lib/pacientes.ts` `TEXTO_NUMERO` must change to say which one it counts | Medium. Same function feeds `resultados_diarios`, Jornada (`src/lib/jornada-funil.ts`), PDF (`src/lib/pdf-relatorio-completo.tsx`) and `report-metrics.ts`; they must show one definition |
| 2 | Foram 14 (comes from sales) | concept `'compareceu'` = `compareceram` + `venda` + `posvenda` (`crm_papel_conta`); `compareceram` CTE (`:319-325` base) | Add concept `'compareceu_estrito'` (`array['compareceu']`) used only by `hoje_numeros()`; leave `'compareceu'` for follow-up logic (`depois` CTE depends on it) | Medium. Changing the shared array silently changes "agendou sem retorno" |
| 3 | 10 of 13 sales without value | `numeros.fecharam.{vendas,sem_valor,valor_total}` already returned (base `:585-600`); money display in UI | UI/label only: "13 vendas, 3 com valor"; ban bare R$ | Low |
| 4 | Robot copy | `copia` heuristic in `crm_perfil_vendas_sql` (3-day lag, sales only) | Needs evidence-based card-level rule from Fase 0; reuse in Quem chamar | High: definition unknown |
| 5 | 39% cards removed at origin | `removido_na_origem` filtered in `pacientes_cards` (`:133`), `crm_perfil_vendas_sql`, `recuperacao_sem_resposta`; set by `kommo-reconcile.ts` | Ensure every new function filters it; schedule reconcile | Medium (freshness) |
| 6 | 107 people without nova/antiga | `leads_novos`/`antigos` in `numeros`; `origem = 'Paciente antigo'` in `cards_u` | Selo `ambar` with the gap in text; no calc change in v1 | Low |
| 7 | "Incoming leads" is `venda` in Lana's profile | data in `crm_perfil_etapa` (set via `crm_definir_perfil_etapa`, admin) | Data fix by RPC after the team confirms (decision 2); triggers `resultado_pronto_invalidar` automatically | Low, but also changes historic sale counts |
| 8 | History only since 14/10/2025 for 36% of cards | `crm_lead_eventos` coverage | "Esta semana" auto-disable at <50% coverage (v2); selo text states the date | Low |
| 9 | Daily series built on old definitions | `resultados_gravar_dia` / `resultados_preencher` (`20261106130000`) | add `definicao_versao`; refill in ≤14-day windows after the change | Medium |

**Rule for Phase 0 SQL**: ship each correction as a new migration file (owner applies), never edit a published migration. Before any text-patch of `pacientes_periodo_calc`, get the production `pg_get_functiondef` (owner), because the patch pattern aborts if a snippet does not appear exactly once.

---

## Menu reduction (14 live / 73 hidden / 3 removed)

- **Mechanism**: a static descriptor field in `src/lib/nav.ts` (`NavTab.situacao`), not a remote feature-flag service. A hidden route still renders (deep links, bookmarks, e2e specs keep working); it simply leaves the sidebar and is returned by `buscarTelas()` only for team (`isAdmin` or strategist). This is "hide, don't delete" at the cost of one boolean.
- **Where the 73 are**: `AREAS` (≈28), `AVANCADO`, admin sidebar `ITENS`/`GRUPOS` in `src/routes/_authenticated.admin.tsx`, and SAP routes (`_authenticated.sap.*`, ≈30; hidden behind the existing `tab.sap` filter and the `ehEnderecoSap()` host check in `src/lib/marca.ts`). Admin and SAP menus are separate component trees from `app-shell.tsx`, so the flag must be honoured in three places, not one.
- **"3 tiradas"**: `marketing.tsx` redirect and two duplicate `/ideias` labels (`NavTab` entries "Planejar a semana"/"Revisar roteiros" share `path:"/ideias"` with different `search.visao`; `navTabKey()` already disambiguates).
- **Médico menu**: `navegacaoClinica(areas, equipe)` builds today's médico menu; replace with two fixed items (Hoje, Ajuda e fontes). **Team**: Carteira (= `/admin`, "Clientes do Nexo"), Clínica (= client index "Resultados da clínica"), Conferência e fontes (= `/admin/conferencia` + `/admin/integracoes`).
- **Screens without selo**: `tabVisivel()` gets a `semSelo` aviso for team-only screens (Pacientes do período, Resultados da clínica, anúncios, Funil comercial, Relatório, Resultados por origem). Authorization is still RLS; this is presentation (anti-pattern in `ARCHITECTURE.md`: never trust route guards).
- **Order constraint**: log (PR 1) must be live and verified before any tab is hidden, otherwise opens of hidden screens during the gap are unrecorded and the 90-day clock (SAP decision, v3 "0 acessos em 90 dias") starts late.

---

## Data flow changes

1. **Before**: SPA → `supabase.rpc("pacientes_periodo")` directly per screen (hook `src/hooks/use-pacientes-periodo.ts`), numbers rendered with their own legends; no seal.
2. **After (Hoje path)**: SPA → `POST /api/sync/manual {alvo:"hoje"}` → user-scoped RPCs (cached 20 min) + `metricas_selo` + `sync_status` → merged per-block payload → SPA. The legacy screens keep reading RPCs directly and are visible to the team only until they read `metricas_selo`.
3. **Selo write path**: n8n (weekly) → `?conferencia_ao_vivo=1` (service role, GET-only against CRM) → `conferencia_ao_vivo` rows → `selo.ts` → `metricas_selo` → `selo_expirar` (daily cron) → read by `hoje`/summary.
4. **Log path**: SPA → `rota_acessos` (direct insert) → admin `rota_uso()`. Separate path for the sensitive list: dispatcher → `lista_acessos` (fail closed).

---

## Recommended build order (dependency-checked)

```
Fase 0 (manual, parallel) ───────────────────────────────────────────────┐
                                                                          │ evidence + decisions 1,2
PR1 log ─► (verify live 24h) ─► MENU hide (needs PR1) ─────────────┐      │
PR2 verificação (SQL files) ─────────────► feeds Fase 0 + PR6 + PR7│      │
PR3 selo (table+reader) ◄───────── seeded with Fase 0 numbers ◄────┼──────┘
PR4 hoje endpoint (needs PR3, hoje_numeros) ─► PR5 Hoje screen ────┘ (+ landing redirect, médico menu)
PR6 weekly job (needs PR3; reuse conferencia_ao_vivo) ─► schedules reconcile first
PR7 Quem chamar (needs PR2 timestamp, PR6 fresh removido_na_origem, PR4/5 button, LGPD decision 10, PR9 template)
PR8 resumo sombra (needs PR3, PR4 pure composer)
PR9 template request: start immediately in calendar terms (latency), no code dependency
PR10 metas seed: data, run before the PR5 live-site screenshot so the meta block is verifiable
```

Rationale for the non-obvious edges:
- *selo before Hoje*: Hoje's contract is "no number without a seal"; the endpoint's withholding rule needs the table to exist, even if rows are only `ambar`.
- *log before hide*: see Menu order constraint.
- *PR6 before PR7*: condition 1 (exclude removed cards) is only as good as the last `removido_na_origem` sweep; condition 3 (secretary validates 20 rows, ≥18 correct) needs a stable list definition, which depends on the Fase 0 robot-copy rule.
- *PR2 before PR7*: condition 4 is literally PR 2's timestamp query.
- *Release condition mapping*: "João closes 4 definitions" (decision 1) gates selo `definicao_versao = 1` and green; "Agendaram/Fecharam green in Lana" is PR 6 output; "≥18 of 20" is `quem_chamar_liberacao`; "log on" is `rota_uso()`.
- *Seam between Fase 0 and the build*: the brief says construction does not wait for Fase 0, and the design honours it because everything ships first with `definicao_versao = 0` + `ambar`.

Each PR needs a migration file the owner applies; the CI checks `scripts/test-migrations.ts` / `scripts/test-db-security.ts` should get one case per new table (RLS: "unrelated clinic cannot read the row").

---

## Patterns to Follow

### Pattern 1: User-scoped client for member-authorised reads
**What:** In a dispatcher branch, authenticate with admin `auth.getUser(token)` then run RPCs with a second client carrying the caller's bearer.
**When:** any read that calls an RPC guarded by `is_client_member()`.
**Example:** `api/_lib/central-canais.ts:32`.

### Pattern 2: Per-block isolation
**What:** `Promise.allSettled` over block loaders, each with its own timeout/abort; failed block ⇒ `{status:"erro", ultimo_valor, atualizado_em}`.
**When:** `hoje`, `resumo_semanal`.

### Pattern 3: Heavy calc behind the cache wrapper
**What:** `*_calc` (service_role only) + public wrapper doing the access check and `resultado_pronto_ler/guardar`.
**When:** `hoje_numeros()` if it exceeds ~1 s on Lana-size clinics.
**Example:** `20261105120000_resultado_pronto.sql`.

### Pattern 4: Stored, versioned definition
**What:** metric meaning (`metricas_definicao`) and seal (`metricas_selo`) keyed by version; UI only renders.
**When:** every number shown to a médico.

### Pattern 5: Additive migrations with reversal notes
**What:** `create table if not exists`, RLS on, `revoke all ... from public, anon`, explicit grants, header with reversal SQL (house style in `20261106120000_clinica_metas.sql`, `20261102180000_conferencia_ao_vivo.sql`).

## Anti-Patterns to Avoid

### A: Re-patching `pacientes_periodo_calc` by text replacement
**Why bad:** 45k chars, ~10 stacked patches, exact-once guards abort on drift, production is the only readable truth.
**Instead:** new small functions (`hoje_numeros`) and concept entries in `crm_papel_conta`; if a patch is truly needed, dump production definition first.

### B: Function per row for stage roles
**Why bad:** caused the 04/11 slowdown (reverted). **Instead:** `materialized` join to `crm_perfil_etapas()` once.

### C: Computing the seal or its expiry in React/at read time
**Why bad:** violates "stored, never computed"; unauditable. **Instead:** cron + writer.

### D: Summing `resultados_diarios` to get a period number
**Why bad:** a person who wrote on two days counts twice (stated in `20261106130000`). **Instead:** call `pacientes_periodo` for the period.

### E: New `api/*.ts` file for any v1 item
**Why bad:** 13th function breaks the Vercel build silently (previous deploy stays live). **Instead:** dispatcher `alvo`/`acao`, or a query-param branch like `?conferencia_ao_vivo=1`.

### F: Masking in the browser
**Why bad:** names reach the network for roles that must not see them. **Instead:** mask in `quem-chamar.ts`; log in the same request.

### G: Writing `verde` on a partial or CRM+conversation number
**Why bad:** the green says "conferido ao vivo na origem". **Instead:** green only for CRM-only metrics, only when the live read succeeded.

## Scalability / Performance Considerations

| Concern | Lana-size clinic (22k cards) | 20 clinics (today) | Notes |
|---------|------------------------------|--------------------|-------|
| `pacientes_periodo` | ~10 s uncached, 20 min cache + 10-min warming | cron warms only recently opened windows | Hoje fixed windows keep the cache hot |
| Route log | trivial insert per navigation | ~hundreds of rows/day | prune/aggregate after 12 months; no partitioning needed |
| Kommo weekly conferência | events paging is O(events in week); 250/page, `ritmoKommo` 6 req/s | sequential per connection, 270 s budget | If the week exceeds budget, chunk by day and persist a cursor like `kommo-leads-sync.ts` |
| `selo_expirar` | one `update` | trivial | |
| Dispatcher cold start | importing more modules at top of `manual.ts` slows every action | use dynamic `await import()` for new handlers, as `_central` branches already do | |

## Open questions that block specific PRs (flagged, not assumed)

- Period window for Hoje (PR 4/5).
- Whether `conferencia_ao_vivo` and `?reconcile=1` are currently scheduled anywhere (n8n); if not, "weekly" is a net-new schedule (decision 7).
- Is production `statement_timeout` for `authenticated` 8 s or 30 s? `src/hooks/use-pacientes-periodo.ts` comment says 8 s, PROJECT.md says 30 s. Sets per-block timeouts in `hoje`.
- Robot-copy definition at card level (Fase 0 output) - blocks PR 7 condition 1.
- Secretary role model (`lista_acesso_nominal` vs a new `client_members.role`) and the LGPD basis (decision 10) - blocks PR 7.
- Kommo events retention and whether `lead_status_changed` covers moves made by robots/bulk edits - spike during Fase 0.
- SAP-programme redirect in `_authenticated.index.tsx` vs "SAP congelado" - needs a call.

## Sources

- Code read: `api/sync/manual.ts`, `api/_lib/request-validation.ts`, `api/_lib/observability.ts`, `api/_lib/conferencia-ao-vivo.ts`, `api/_lib/kommo-reconcile.ts`, `api/sync/kommo-leads.ts`, `api/_lib/central-canais.ts`, `api/_lib/resumo-equipe.ts`, `api/_lib/sync-status.ts`, `src/lib/nav.ts`, `src/components/app-shell.tsx`, `src/routes/_authenticated.tsx`, `src/routes/_authenticated.$clientId.tsx`, `src/routes/_authenticated.index.tsx`, `src/routes/_authenticated.admin.tsx`, `src/lib/pacientes.ts`, `src/hooks/use-pacientes-periodo.ts`, `src/lib/conferencia-ao-vivo.ts`, `src/components/conferencia-ao-vivo-resumo.tsx`, `vercel.json` (HIGH).
- Migrations read: `20261031150000_pacientes_do_periodo.sql`, `20261104100000_perfil_da_clinica.sql`, `20261105120000_resultado_pronto.sql`, `20261105130000_resultado_pronto_geral.sql`, `20261105160000_recuperacao_sem_resposta.sql`, `20261106120000_clinica_metas.sql`, `20261106130000_resultados_diarios.sql`, `20261102180000_conferencia_ao_vivo.sql`, `20261102150000_apis_resilientes.sql`, `20261014105000_conversas_origem_anuncio.sql` (HIGH for repo state; MEDIUM for production state, which can differ).
- Planning: `.planning/PROJECT.md`, `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONCERNS}.md`, `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md`, `~/Downloads/Nexo-Modelo/FASE0-Lana-27out-02nov.md`.
- External: Kommo developer docs, Events list (`https://developers.kommo.com/reference/events-list`): filters `type`, `created_at[from/to]`, `entity`, `entity_id`, pagination `limit` max 250; no `value_after/value_before` filter; retention not stated (MEDIUM).
