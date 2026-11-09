# Stack Research

**Domain:** Brownfield trust layer + "Hoje" screen for a clinic analytics SPA (milestone v5.0 Nexo v5, Fase 0 + degrau v1)
**Researched:** 2026-11-09
**Confidence:** HIGH on "no new npm dependency" and on integration points (read from the repo); MEDIUM on WhatsApp template details (vendor + Meta docs, WABA state unknown); MEDIUM on the TanStack `onResolved` initial-load behavior (read from installed source, not yet run)

## Verdict

**Add zero npm packages.** Every new capability in this milestone is a table, a SQL file, a branch inside the existing dispatcher, a CSS `div`, or a config line. The only thing "added" is one `crons` entry in `vercel.json` (weekly), and one manual Meta-side action (template request in WhatsApp Manager).

Existing stack is not re-researched (React 19.2, TanStack Router 1.170.45 / Query 5.x, Vite 7, `@supabase/supabase-js` 2.112.3, Zod 4.6.7 per lockfile, Tailwind 4, Recharts 2.15, pglite 0.5 for migration tests).

## Recommended Stack (per new capability)

### Core Technologies (all already installed)

| Technology | Version | Purpose in v5.0 | Why Recommended |
|------------|---------|-----------------|-----------------|
| `@tanstack/react-router` `router.subscribe('onResolved')` | 1.170.45 (installed) | Per-route usage log, one hook for every screen incl. hidden ones | Fires once per resolved navigation with `{fromLocation, toLocation, pathChanged}`. Verified in `node_modules/@tanstack/router-core/dist/esm/load-client.js:965` and `router.js:54`. On first load `fromLocation` is undefined so `pathChanged` is true: the initial page open is logged too. One subscription in `src/router.tsx` covers all 90 routes; no per-route edits. |
| `@supabase/supabase-js` direct `insert` under RLS | 2.112.3 (installed) | Write the route log and nothing else from the browser | One PostgREST request (`Prefer: return=minimal`), no Vercel function invocation, no dispatcher auth round-trips. Keeps the log off the 12-function budget and off the heavy-query path. |
| Postgres tables + RLS (migration files) | Supabase PG (existing) | `uso_rota`, `metricas_selo`, `acesso_lista_chamar`, goals seed SQL | Matches the repo pattern (`conferencia_ao_vivo` migration: RLS on, `revoke all`, narrow grants, `is_app_admin()` / `is_client_member()` policies). Delivered as files; only the owner applies them. |
| `api/sync/manual.ts` dispatcher (new `alvo` values) | existing | `hoje` endpoint, "quem chamar" list, role masking, access log | The 12-function cap forces this. Two non-obvious edits are required, see Integration Points. |
| Vercel Cron (`crons` in `vercel.json`) | Hobby: min interval once/day, +-59 min jitter | Weekly Kommo reconciliation trigger | Weekly is allowed on Hobby. Ships inside the PR (no manual n8n step). Calls the **existing** `?conferencia_ao_vivo=1` branch. See Scheduling. |
| `.dbx-bar` (8px) in `src/styles/databoard.css` | existing | Horizontal 8px bars on Hoje | Already exists (`height: 8px; border-radius: 99px`). Do not use Recharts on Hoje: it adds weight and invites forbidden chart types. |
| Existing Cmd+K search (`src/components/app-shell.tsx` lines ~293-320, 630-680; `buscarTelas` in `src/lib/nav.ts:510`) | existing | Open hidden routes | Already a working modal with Ctrl/Cmd+K, accent-insensitive prefix match, focus handling. Extend, do not replace. |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Postgres | existing project `cvdnzoqduliopscfsrkc` | All new storage | No new store. `pg_cron` is already used in production (`resultado-pronto` every 10 min, `resultados-diarios` at 06:30 UTC = 03:30 BRT) and is guarded with `pg_available_extensions` so pglite tests skip it. Reuse that guard for any new in-database job (e.g. route-log retention). |
| `pg_cron` (in-DB jobs only) | existing | Optional: purge `uso_rota` older than ~400 days; nothing that needs HTTP | Fine for pure SQL. **Do not** use `pg_net` + cron to call the dispatcher (needs the secret stored in the DB / Vault, a new privileged surface, and a new extension grant only the owner can make). |

### Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vercel Hobby cron | n/a | Weekly reconciliation | Docs (page last updated 2026-08-11): Hobby = once per day minimum, per-hour precision (job runs anywhere in the scheduled hour), up to 100 cron jobs per project (the old "2 per account" limit is gone). Cron runs only on the production deployment, GET only, no retries, best-effort and occasionally duplicated. Docs flag Cron Jobs as "legacy, migrating to Schedules"; `vercel.json` `crons` still works. |
| n8n (existing, SYNC_SECRET) | existing | Fallback scheduler; also owns the existing e-mail `resumo_equipe` pattern | Keep as the fallback if the owner prefers not to deploy a cron. Not the primary: a workflow lives outside the repo, cannot be part of a "one phase, one PR", and the owner must create it by hand. |
| GitHub Actions `alertas.yml` (hourly SQL) | existing | Dead-man's switch for the weekly job | Add one check to `scripts/alertas/verificar.sql`: `max(rodado_em)` of `conferencia_ao_vivo` for the piloto older than 8 days raises an `atencao` alert. Needed because Vercel cron is best-effort with no retry. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| none new | - | - | Use `zod` (already ^4.6.7 in lockfile) for the new request fields; `date-fns` 4.x for "faltam 8 em 9 dias" if needed; `clsx`/`tailwind-merge` as today. |
| `Intl.Segmenter` / `String.prototype.normalize` (platform) | Node 22 / evergreen browsers | Initials and first-name masking | Pure function in `api/_lib/` (e.g. `mascara-lista.ts`), unit-tested with the repo's `scripts/test-*.ts` + `tsx` runner. Skip particles ("de", "da", "dos") when taking initials. No masking library exists that handles Portuguese particles; 20 lines of code. |
| `crypto.randomUUID()` (platform) | evergreen | Per-tab session id for the route log | Needed so the v2 "fusion" decision can ask "were these screens opened in the same session?". Store in `sessionStorage`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@electric-sql/pglite` ^0.5.10 + `scripts/test-migrations.ts` | Test the new migrations locally before the owner runs them | Already the repo's mechanism. New migrations must be idempotent (`if not exists`, `do $pol$` policy guards) like `20261102180000_conferencia_ao_vivo.sql`. |
| `psql` + `scripts/alertas/verificar.sql` pattern | Verification queries (post_id/ad_id coverage, timestamp freshness per source) | Ship as read-only `.sql` files with `set default_transaction_read_only = on` (new folder, e.g. `scripts/verificacao/`). Run by the owner or by CI with `SUPABASE_DB_URL_PROD`. No ORM, no BI tool. |
| `npm run test:interface` / Playwright + axe | 400px / 720px layout, touch target >=44px, contrast | Already in `quality.yml`. Add a Hoje case at 400px and 720px. |

## Capability-by-capability decisions

### 1. Per-route usage log (cheap, from TanStack Router)

**Do:** subscribe once in `src/router.tsx` right after `createRouter(...)`:

```ts
router.subscribe("onResolved", ({ toLocation, pathChanged }) => {
  if (!pathChanged) return;                       // ignore ?de=&ate= filter changes
  const leaf = router.state.matches.at(-1);       // matched route pattern, not the URL
  registrarAbertura({ rota: leaf?.routeId, pathname: toLocation.pathname });
});
```

- Log the **route pattern** (`routeId`, e.g. `/_authenticated/$clientId/pacientes`) plus `client_id` (param), never query strings (period filters, search text) and never ids of patients.
- `registrarAbertura` (new `src/lib/uso-rota.ts`): skip if there is no Supabase session (login, reset-password, conhecer); dedupe identical consecutive `rota` within ~2 s (StrictMode double-fire, redirects); fire-and-forget `supabase.from("uso_rota").insert({...})` with `.catch(() => {})` so a log failure can never break navigation.
- Table `uso_rota`: `id bigserial`, `criado_em timestamptz default now()`, `user_id uuid not null default auth.uid()`, `client_id uuid null`, `rota text not null`, `via text check (via in ('menu','busca','link','direto','redirect'))`, `papel text`, `sessao uuid`. Indexes `(criado_em desc)` and `(rota, criado_em desc)`.
- RLS: `insert` for `authenticated` with `check (user_id = auth.uid())`; `select` only `is_app_admin()`. Doctors can write their own rows but cannot read the log.
- `via = 'busca'`: the Cmd+K result `TabLink` calls a module-level `marcarVia('busca')` (consumed by the next `onResolved` within ~2 s). Simpler and sturdier than threading `state` through `TabLink`.
- Volume: ~20 clinics, a handful of users each, tens of opens/day/user = thousands of rows/day. Plain table, no partitioning, no batching. Retention: keep raw >= 120 days (the 90-day SAP decision needs it) and optionally purge at ~400 days via `pg_cron`.
- Why not the dispatcher: a POST to `manual.ts` runs `getUser`, an `app_admins` query and a `client_members` query per call, costs a function invocation per screen open, and **returns 403 to viewers** for any `alvo` not on its read-only allowlist (see below).
- Why not `navigator.sendBeacon`: it cannot set the `Authorization` header, so RLS would reject it.
- Why not Vercel Analytics / PostHog / Plausible: new third-party processor handling clinic-user data (LGPD review, CSP is `base-uri/object-src/frame-ancestors/form-action` only today, but a vendor still needs a DPA), and the data would live outside Supabase where the join to `client_id` and role is needed.

### 2. Cmd+K and hidden routes

- **Keep the in-house modal; do not add `cmdk` (v1.1.x) or kbar.** The shortcut, `BottomSheet`, focus trap (`data-dialog-focus`) and result list already exist. Adding `cmdk` brings Radix primitives and a second focus-management model for a feature that is a list filter.
- Hidden-route "flag" = a static field, not a service. Add `escondida?: boolean` to `NavTab` in `src/lib/nav.ts`; menus filter it out, `buscarTelas()` still indexes it for team roles (`vis.isAdmin` / strategist) and the result label can carry the "sem selo" notice. Doctor role never sees hidden routes in the search.
- Do not add LaunchDarkly / GrowthBook / Vercel Flags / Edge Config: one boolean per route in code is auditable in a PR and costs nothing at runtime; per-clinic runtime toggles are not a v1 requirement.
- Routes stay registered in the file-based tree (hidden != deleted), so deep links and the log keep working. The 3 removed routes become redirects or deleted files followed by `npm run routes:generate`.

### 3. Scheduling the weekly Kommo reconciliation

**Most important finding: the job logic already exists.** `api/_lib/conferencia-ao-vivo.ts` + `api/sync/manual.ts?conferencia_ao_vivo=1[&client_id=<uuid>][&fonte=kommo]` already compares Nexo vs the live Kommo API (GET only, 6 req/s via `ritmoKommo`, 270 s deadline), writes `public.conferencia_ao_vivo` (migration `20261102180000`), and authenticates with Bearer `SYNC_SECRET`. `api/_lib/kommo-reconcile.ts` covers missing/deleted leads. v1 item 6 is "schedule it for the pilot clinic and turn its result into a `metricas_selo` row", not "build a reconciler".

| Option | Verdict | Reason |
|--------|---------|--------|
| **Vercel Cron, weekly, GET** | **Recommended** | Weekly satisfies the Hobby once-per-day floor. In the PR, no manual workflow. Path may carry the query string: `{"path":"/api/sync/manual?conferencia_ao_vivo=1&fonte=kommo&client_id=<Lana uuid>","schedule":"0 9 * * 1"}`. Jitter (+-59 min) is irrelevant weekly. One cron per clinic/source keeps each run under the 300 s `maxDuration`; limit is 100 per project. |
| n8n schedule trigger | Fallback | Zero code, same endpoint and secret; but outside the repo/PR flow and runs on the VPS that also hosts production. |
| GitHub Actions `schedule` | Acceptable second fallback | Repo precedent (`alertas.yml`, `creative-worker.yml`); needs `SYNC_SECRET` copied into GitHub secrets; same best-effort delivery. |
| Supabase `pg_cron` + `pg_net` | Reject | Needs `pg_net`, the secret in the DB, a 300 s HTTP call from the DB. Supabase docs advise jobs <= 10 min and <= 8 concurrent; the bigger issue is the secret/extension surface only the owner can grant. |

Required code/config for the recommended option (small):
1. `vercel.json`: add `"crons": [...]`.
2. Vercel env: add `CRON_SECRET` (Vercel sends it automatically as `Authorization: Bearer <CRON_SECRET>`). In `rodarConferenciaAoVivo` accept `CRON_SECRET` **in addition to** `SYNC_SECRET` (constant-time compare as today). Do not just set `CRON_SECRET` equal to `SYNC_SECRET`: that widens the blast radius of the n8n secret and Vercel stores a per-deployment copy.
3. Make the run idempotent (it already writes one row per run; the selo update must be an upsert keyed `(client_id, metrica, versao_definicao)`), because Vercel docs state delivery can be missed or duplicated and there are no retries.
4. Dead-man's switch in `scripts/alertas/verificar.sql` (see Infrastructure).
5. Deploy budget: the cron edit rides along with the other v1 changes; Hobby allows 100 deploys/day, not a constraint here.

### 4. `hoje` endpoint through the dispatcher

No new library. Two integration edits are mandatory or the doctor sees a 403 / 400:
- `api/_lib/request-validation.ts` `manualRequestSchema.alvo` is a closed `z.enum([...])`: add `"hoje"` (and a separate `"quem_chamar"`; keep them separate so the list is never computed when only the summary is asked).
- `api/sync/manual.ts` (~lines 218-222): non-admin members with role other than `owner`/`strategist` get `403 "Seu acesso é somente leitura"` unless `alvo` is in `["audiencia","periodo_instagram","crm_negocio_resumo"]`. Add `"hoje"` to that allowlist. `"quem_chamar"` must **not** be added blindly: it needs its own branch (role -> mask level) because viewers must receive initials only, and a secretary with named access needs a flag the current roles (`owner`/`strategist`/`viewer`) cannot express.
- Put new code in a new `api/_lib/hoje.ts` and `import()` it lazily inside the branch (the file is already 1338 lines; the repo's lazy-import pattern for `central-canais`, `checkout-vendas`, `conferencia-ao-vivo` keeps cold start small).
- Read from `resultado_pronto` / `resultados_diarios` (existing 20-min cache and daily history), never recompute the heavy per-clinic functions; selo comes from a single indexed read of `metricas_selo`. This is what keeps the new screen from making the 10 s heavy queries slower. Return `{ blocos: { agendaram: {status, valor, par, selo}, ... } }` with per-block `status` so each block fails alone.

### 5. `metricas_selo`

- One table, one row per `(client_id, metrica, versao_definicao)`: `estado text check (estado in ('verde','neutro','ambar','nao_medido'))`, `texto_curto text not null`, `conferido_em timestamptz`, `origem text`, `valores jsonb` (the two numbers for the amber case), `atualizado_por text`. "Verde returns to neutro after 30 days" must be a **stored** transition, not a client-side calculation: either the reconciliation job rewrites it, or a pure-SQL `pg_cron` job downgrades `verde` rows with `conferido_em < now() - interval '30 days'` (guarded by `pg_available_extensions`). Never compute the badge in the React tree.
- RLS: members read their clinic's rows; only `service_role` writes (the reconciliation handler); the owner seeds initial rows by SQL.
- Regenerate `src/integrations/supabase/types.ts` after the owner applies the migration (CLI `supabase gen types`, already a devDependency `supabase` ^2.30).

### 6. "Hoje" screen (400px / 720px, 8px bars)

- Plain React + existing `.dbx-bar`, `dbx-*` classes, Inter with `font-variant-numeric: tabular-nums` (Inter is already loaded via Google Fonts in `index.html`; `tabular-nums` is applied in some places only, add a utility class).
- Single column: `max-width: 400px` mobile / `720px` desktop, 16px margin, 12px gap: CSS only. TanStack Query for the single `hoje` call (staleTime ~ 20 min to match `resultado_pronto`; show "Calculando, clínica grande leva até 30 s" after 3 s with a timer, no library).
- **Do not use Recharts** on this route (forbidden types are easy to reach; also the funnel needs a monotonicity check, which is a 5-line pure function, tested).

### 7. "Quem chamar hoje": masking and access log

- Mask on the **server** in the dispatcher branch before serializing; the browser never receives a name the role may not see. Levels: `doctor` (viewer, clinic member) -> initials; `secretaria_nominal` -> first name (needs a stored flag, see Gaps); `agency` (admin/strategist without clinic membership) -> count only.
- Access log: insert into `acesso_lista_chamar (user_id, client_id, nivel, n_linhas, criado_em)` with the service-role client **before** responding (log first, then return; if the insert fails return an error, not the list). No names or phone numbers in the log.
- `api/_lib/mascarar-pii.ts` exists but is for text going to the LLM (regex on e-mail/CPF/phone); it is not the name-masking tool. Do not reuse it for names.
- The button "abre o WhatsApp oficial": v1 can only use a `wa.me` deep link (the repo already does this in `sap-leitura.tsx`) which opens the secretary's own WhatsApp. A *template* message can only be sent through the Cloud API, which does not exist in this repo yet (no WABA id / token env vars, no `messages` call). Treat the template as a v1.5 dependency; v1 ships the link without sending anything.

### 8. Weekly summary in shadow mode

- Deterministic string templates in TypeScript (closed verb list), persisted to a `resumo_semanal_sombra` table and shown in the Conferência screen. **No LLM call in v1** (`api/_lib/ia.ts` stays untouched until v3, and the brief's rule "IA só descreve verde" is trivially met by not using it).
- If the team also wants an e-mail copy, reuse the existing n8n pattern: add an action next to `resumo_equipe` in the `agendamentoSchema` / SYNC_SECRET branch that returns the text; n8n sends it. No Brevo/mail SDK in the app.

### 9. WhatsApp official template request

- **v1 deliverable is a request to Meta, not code.** Submit once in **WhatsApp Manager** (UI) by someone with admin on the WABA. The WhatsApp MCP in this environment requires authorization, so the WABA state could not be inspected: confirm a WABA exists and the number is Cloud-API-enabled.
- API form (only if scripted later): `POST https://graph.facebook.com/{META_GRAPH_VERSION}/{WABA_ID}/message_templates` with `name` (lowercase, underscores), `category` (`utility`|`marketing`|`authentication`), `language` (`pt_BR`), `components` (body with `example`), optional `parameter_format: "named"`. Bearer system-user token with `whatsapp_business_management` (MEDIUM confidence on scope names; Meta's page shows only the bearer header). Reuse `api/_lib/meta-graph-versao.ts` (default `v26.0`); Meta's doc example still shows v23.0. Limit: 100 template creations per hour per account.
- Review is automatic and "can take up to 24 hours"; only `APPROVED` templates are sendable. Status arrives via the `message_template_status_update` webhook or by reading `status` on the template id. For v1, check status by hand in WhatsApp Manager; do **not** build webhook handling now.
- Category risk for a weekly clinic summary: submit as `utility`, but Meta recategorizes templates that are not user-requested/essential or that read as promotional (notice usually 1 day before, webhook `template_category_update`; instant for accounts with a misuse warning). Opt-in recorded before sending (already a pending SQL in decision 6) strengthens the "requested by the user" case. Budget for marketing-rate pricing; keep wording factual and past-tense (also required by CFM rules). Do not use placeholders-only bodies ("{{1}}") because Meta classes unclear content as marketing.
- Group chats via Evolution stay out of this; 1:1 only through the Cloud API (project constraint).
- If the clinic's number is currently used in the WhatsApp Business app, Cloud API onboarding needs either migration of the number or "coexistence" (Embedded Signup path "connect an existing WhatsApp Business app number"; vendor-documented, app version 2.24.17+ per vendors). Verify against Meta docs before promising the clinic anything. MEDIUM/LOW confidence, vendor sources.

### 10. Goals by SQL and verification queries

- Goals: a seed `.sql` for `clinica_metas` delivered as a file for the owner to run (the table exists and is empty). No admin UI in v1.
- Verification queries: read-only SQL files (see Development Tools). Coverage of `post_id` / `ad_id` = `count(*) filter (where post_id is not null) / count(*)` per clinic and source; freshness = `max(<source timestamp>)` per source against `now()`, reusing `status_fontes_clientes()` which `verificar.sql` already calls. Do not materialize views for these in v1.

## Installation

```bash
# Nothing to install for v5.0.
# Before writing new Zod schemas: the local node_modules has zod 3.25.76 while package.json / lockfile say 4.6.7.
npm ci
```

Env/config changes (owner or Vercel dashboard, not code):
```bash
# Vercel Production env
CRON_SECRET=<random string, 16+ chars, header-safe characters only>

# Only for v1.5 (do NOT add now): WABA id + system-user token for the Cloud API
# WHATSAPP_WABA_ID, WHATSAPP_TOKEN
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Direct Supabase insert from the browser for the route log | Dispatcher `alvo: "uso_rota"` | Only if you must enrich the row server-side (IP, UA). Costs a function call per screen and needs a viewer allowlist exception. |
| `router.subscribe('onResolved')` in `src/router.tsx` | `useRouterState` + `useEffect` in `_authenticated.tsx` | If you want the hook tied to React lifecycle/StrictMode; it re-renders on every state change and misses non-authenticated layouts. |
| In-house Cmd+K modal | `cmdk` ^1.1.1 | Only if the palette grows actions, nested pages or async sources. Not in this milestone. |
| Vercel Cron weekly | n8n schedule trigger | If the owner wants to change the schedule without a deploy or wants e-mail-on-failure out of the box. |
| Server-side masking in the dispatcher | Postgres view/RPC with `security definer` masking by `auth.uid()` role | Attractive for defense in depth, but CONCERNS.md already flags `security definer` functions without `search_path`; if used, set `search_path` explicitly and test with pglite. |
| Stored `estado` in `metricas_selo` | Computing the seal in the React tree or in a view | Never: contradicts the Core Value (audit trail per clinic x metric x definition version). |
| WhatsApp Manager UI submission | Scripted Graph call | Scripted only when v1.5 needs several templates or a status checker. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| New Vercel function files (`api/hoje.ts`, `api/uso.ts`, `api/cron/*.ts`) | 12-function Hobby cap already reached; the next deploy fails | New `alvo` / query-string branches in `api/sync/manual.ts` with lazy `import()` |
| `pg_net` / `http` extension from `pg_cron` to call the API | Secret in the DB, new extension grant, 300 s HTTP from the DB | Vercel cron or n8n calling the existing endpoint |
| Vercel Cron at sub-daily frequency | Fails the Hobby deploy ("limited to daily cron jobs") | Weekly/daily only; anything faster stays on `pg_cron` (SQL) or n8n |
| Product-analytics SaaS (PostHog, GA, Plausible, Vercel Analytics) for the route log | Third-party processor for clinic-user data, data outside Supabase, no join to role/clinic | `uso_rota` table |
| Feature-flag service (LaunchDarkly, GrowthBook, Vercel Flags/Edge Config) | A boolean per route is enough and reviewable in the PR | `escondida` field in `nav.ts` |
| `cmdk`, `kbar`, `fuse.js` | Existing modal + `buscarTelas` already does accent-insensitive prefix search over ~90 items | Extend `buscarTelas` |
| Recharts / any chart lib on Hoje | Brief allows only 8px horizontal bars and the goal bar; chart libs make forbidden shapes one prop away | `.dbx-bar` |
| LLM (`ia.ts`) for the weekly shadow summary or the Hoje sentence | Rule: AI never calculates, silent when seal is not green; fixed template is auditable | Closed-verb string templates |
| `sendBeacon` for the route log | Cannot carry the JWT; RLS rejects it | `supabase.from(...).insert` |
| Reusing `mascarar-pii.ts` for names | It is a regex scrubber for outbound LLM text | A dedicated pure `mascararNome(nivel, nome)` with tests |
| Setting `CRON_SECRET` = `SYNC_SECRET` | Spreads the n8n/agent secret into Vercel's cron machinery and per-deployment copies | Separate `CRON_SECRET`, accepted only on the conferencia branch |
| Webhook handling for WhatsApp template status in v1 | No sending in v1; adds a verified-HMAC endpoint to maintain | Manual check in WhatsApp Manager until v1.5 |

## Stack Patterns by Variant

**If the owner declines the Vercel cron (prefers n8n):**
- Create an n8n workflow: Schedule trigger weekly -> HTTP Request GET `https://<host>/api/sync/manual?conferencia_ao_vivo=1&fonte=kommo&client_id=<uuid>` with `Authorization: Bearer $SYNC_SECRET`, timeout >= 300 s.
- Skip steps 1-2 of the cron recipe; keep the dead-man's switch.

**If the reconciliation for the 3 pilot CRMs (Kommo now; FlwChat/Digisac in v2) approaches 300 s:**
- One cron entry per `client_id` + `fonte`, staggered by hour. Do not lengthen `prazo` or add a queue.

**If a route-log insert is ever too chatty:**
- Buffer in memory and flush on `visibilitychange` with `fetch(..., { keepalive: true })` against PostgREST using the session access token. Not needed at current volume.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@tanstack/react-router` 1.170.45 | `router.subscribe('onResolved')` payload `{fromLocation,toLocation,pathChanged,hrefChanged,hashChanged}` | Confirmed in installed source. `router.state.matches` shape should be verified by `npm run typecheck` when implementing (router internals changed across 1.16x-1.17x). |
| `@supabase/supabase-js` 2.112.3 | `.insert()` without `.select()` sends `return=minimal` | Keeps the log insert to one small request. |
| Zod 4.6.7 (lockfile) vs 3.25.76 (local node_modules) | `z.enum` in `manualRequestSchema` | Local install is stale; run `npm ci` so schema work is typed against v4. |
| Graph API `v26.0` (repo default) | WhatsApp `message_templates` edge | Meta docs example shows v23.0; the same edge exists in later versions; keep one version constant via `meta-graph-versao.ts`. |
| Node 22.x (`engines`) | `Intl.Segmenter`, `crypto.randomUUID` | Native. |

## Gaps / Open Items for the roadmap

- **Secretary with named access has no role today.** `client_members.role` is `owner`/`strategist`/`viewer`. "Doctor sees initials, secretary first name, agency only count" needs a stored attribute (e.g. `client_members.acesso_nominal boolean` or a small table). That is a migration plus decision 10 (LGPD contractual basis). Flag for phase planning.
- **Initial-load `onResolved` behavior** and `via` attribution are read from source, not run. Add a Playwright check (open a route directly, navigate via Cmd+K, assert two rows with `via = direto` then `busca`).
- **Vercel cron delivery is best-effort and Cron Jobs are marked legacy** (Schedules is the successor). Acceptable for a weekly job with the alert; revisit if the project leaves Hobby.
- **WABA state unknown** (WhatsApp MCP not authorized here). Confirm WABA id, number onboarding path (new number vs coexistence) and Business verification before the template request is scheduled.
- Meta's per-message pricing for BRL and the current recategorization policy were only confirmed from vendor summaries; read Meta's pricing page before v1.5.

## Sources

- Repo (HIGH): `package.json`, `package-lock.json`, `vercel.json`, `src/router.tsx`, `src/components/app-shell.tsx`, `src/lib/nav.ts`, `api/sync/manual.ts` (dispatcher branches, viewer allowlist, `rodarConferenciaAoVivo`), `api/_lib/request-validation.ts`, `api/_lib/conferencia-ao-vivo.ts`, `api/_lib/kommo-reconcile.ts`, `supabase/migrations/20261102180000_conferencia_ao_vivo.sql`, `20261105120000_resultado_pronto.sql`, `20261106130000_resultados_diarios.sql`, `.github/workflows/alertas.yml`, `scripts/alertas/verificar.sql`, `src/styles/databoard.css`.
- Installed source (HIGH): `node_modules/@tanstack/router-core/dist/esm/load-client.js` (`type: "onResolved"`), `router.js` (`getLocationChangeInfo`).
- Vercel Cron usage and pricing, Hobby limits (HIGH, official, updated 2026-07-15): https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel managing cron jobs: `CRON_SECRET`, GET/production-only, no retries, duplicate/missed delivery, accuracy (HIGH, official, updated 2026-08-11): https://vercel.com/docs/cron-jobs/manage-cron-jobs
- TanStack Router events (HIGH, official): https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType
- Supabase Cron / pg_cron guidance (MEDIUM, official page omits pg_net/Vault detail): https://supabase.com/docs/guides/cron
- WhatsApp message templates API: endpoint, fields, categories, 24 h review, webhooks, rate limit (HIGH for what the page states, official): https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
- WhatsApp template categorization and `template_category_update` (HIGH, official): https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- WhatsApp coexistence (LOW/MEDIUM, vendor docs, e.g. https://developer.8x8.com/connect/docs/whatsapp/whatsapp-business-app-coexistence, https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence)
- Template category/pricing vendor summaries (LOW, cross-check with Meta pricing page): https://www.courier.com/guides/whatsapp-pricing

---
*Stack research for: Nexo v5.0 (trust seal, usage log, Hoje, weekly reconciliation, WhatsApp template request)*
*Researched: 2026-11-09*
