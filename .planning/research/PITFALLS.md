# Pitfalls Research

**Domain:** Adding trust-seal, usage-log, "Hoje" and patient-list features to an existing brownfield clinic analytics panel (Nexo v5.0: React 19 SPA + Vercel Hobby dispatcher + Supabase RLS + 5 CRMs)
**Researched:** 2026-11-09
**Confidence:** HIGH for pitfalls verified in this repo's code and migrations; MEDIUM for Kommo, Meta/WhatsApp, LGPD and CFM external rules (vendor docs and secondary sources); LOW items are marked `[LOW]`.

How to read this file: each pitfall is tagged with the evidence level and with the v1 work item where it must be prevented. Work items use the brief's PR order: **P0** = Fase 0 manual reconciliation, **L1** = log por rota, **L2** = consultas de verificação, **L3** = `metricas_selo`, **L4** = endpoint `hoje`, **L5** = tela Hoje, **L6** = job de conferência semanal do Kommo, **L7** = Quem chamar hoje, **L8** = resumo semanal em sombra, **L9** = template WhatsApp, **L10** = metas por SQL, **MENU** = 14/73/3 route hiding.

Findings verified directly in the repo (not generic advice) are called out as "Repo fact".

---

## Critical Pitfalls

### Pitfall 1: Masking done in the UI (or at the wrong layer) leaks patient data

**What goes wrong:** "Quem chamar hoje" must show initials to the doctor, first name to the secretary with nominal access, and only a count to the agency. If the list payload carries the full name/phone and the React component masks it, any member can read the real data from the network tab, from a direct Supabase REST call, or from the TanStack Query cache.

**Why it happens (Repo facts):**
- RLS is row-level only. `is_client_member(client_id)` ignores `client_members.role` (it only checks membership + `clients.active`); only `pode_editar_acoes` looks at `owner/strategist`. A new table with a normal "admin or member reads" policy (the pattern copied from `clinica_metas`, `resultados_diarios`) exposes every column to every member, including a `viewer`.
- `is_app_admin()` short-circuits nearly every policy, so "agency sees only the count" cannot be enforced by a policy that includes the usual `is_app_admin() or is_client_member()` clause. Doctor Creator staff are admins.
- `resultado_pronto` (the 20-minute cache) is keyed by `(client_id, funcao, de, ate)` and its migration states "o resultado não depende de quem pede". If the list is routed through this cache, the first caller's role decides what everyone gets for 20 minutes.
- The three roles `owner/strategist/viewer` do not map to the brief's three profiles (médico / secretária com acesso nominal / agência). Nothing in the schema says who is the secretary.
- `api/sync/manual.ts` returns `err.message` on 500; Postgres error text can embed row values (`Key (telefone)=(...)`).

**How to avoid:**
1. No `select` grant on the list's source table for `authenticated`. Expose only a `security definer ... set search_path = public, pg_temp` RPC (or the `hoje` endpoint branch) that decides the mask level server-side from the verified caller (JWT), never from a client parameter.
2. Add an explicit per-member column (e.g. `acesso_nominal boolean`, set by João under decision 10) instead of inferring from `role`. The RPC must treat `is_app_admin()` as "agency level" for this feature (count only) unless that admin also holds nominal access explicitly.
3. List payload carries opaque row refs, not phone numbers. The WhatsApp link is produced by a second call ("abrir") that writes the access-log row and returns the `wa.me` URL once. This ties "who opened" to actual reveal and keeps the number out of the DOM, the cache and the screenshot of the list.
4. Never put the list through `resultado_pronto`; if cached at all, key by `(client, mask_level)`.
5. Strip `kommo_url`, `lead_id`, `contact_id`, raw payload JSON and any `detalhe jsonb` from the response. Return a generic error plus request id (the `withApiObservability` pattern) and never `err.message`.
6. On sign-out and on clinic/role switch, clear the TanStack Query cache; do not persist this query to localStorage.

**Warning signs:** a test as `viewer` can `curl` the REST endpoint and see names; the list RPC takes `p_nivel`/`mask` as a parameter; Network tab shows `telefone`; the same JSON for admin and viewer.

**Phase to address:** L7 (design gate before any code), with a security test in `scripts/test-db-security.ts` per role. Evidence: HIGH (code).

---

### Pitfall 2: `hoje` and other new dispatcher branches use the service role without a caller-to-client check

**What goes wrong:** `api/sync/manual.ts` builds a service-role client (bypasses RLS) and already hosts two auth modes (user JWT and `SYNC_SECRET`). A new user-facing `?hoje=1&client_id=...` branch that trusts `client_id` shows clinic B's numbers to clinic A's doctor. CONCERNS.md already flags "token presence is not a scope check".

**Why it happens:** the dispatcher is 1,338 lines; new branches get inserted before or after the auth block by pattern-matching on `conferencia_ao_vivo` (which is machine-only, `SYNC_SECRET`) and accidentally inherit the wrong auth model.

**How to avoid:** put one helper in `api/_lib/` (`exigirAcessoAoCliente(req, clientId, {nivelMinimo})`) that verifies the JWT, then `is_client_member` or `is_app_admin`, and make it the first line of every new user-facing branch. Prefer calling the existing RPCs with the user's own JWT (RLS-enforced) over a service-role query. Add `test-api-security.ts` cases: no token (401), valid token of another clinic (403), `SYNC_SECRET` on a user branch (rejected).

**Warning signs:** the new branch reads `req.query.client_id` and goes straight to `admin.from(...)`; no 403 test exists.

**Phase to address:** L4 (hoje), L1 (if the log goes through the dispatcher), L7. Evidence: HIGH.

---

### Pitfall 3: Dispatcher blast radius: one bad import breaks tracked links, webhooks and checkout

**What goes wrong:** with the 12-function cap reached, everything funnels through `api/sync/manual.ts`: Meta webhook, `/r/:slug` short-link redirect (live ad links), Hubla checkout sales, scheduled n8n actions, conferência ao vivo. Adding `hoje`, `uso`, `quem-chamar`, `resumo` branches with static top-level imports means a module error or a heavier cold start affects all of them. `vercel.json` also bundles `api/_assets/creative/**` into this function, so cold starts are already heavy, and the Hoje screen is the first thing a doctor opens in the morning.

**Why it happens:** Hobby counts every file under `api/` (even commented-out ones) against the 12-function limit (the repo has exactly 12: 9 in `api/sync`, 2 in `api/admin`, 1 in `api/integrations/kommo`). There is no room for a new function.

**How to avoid:**
- Load each new branch with `await import("../_lib/<modulo>.js")` exactly as `rodarConferenciaAoVivo` does, so a failure stays inside that branch.
- Put route dispatch for the new branches first and cheap (query-param match), before any heavy work.
- Add a smoke test that hits `/r/:slug` and the Meta webhook verification GET after every dispatcher PR; check it on the deployed preview before merge.
- Measure `hoje` p50/p95 on cold and warm before and after, per the project lesson ("medir a velocidade em produção antes").
- Do not split the hot path (`hoje`) off into a new file without first retiring a function; do not create `api/hoje.ts`.

**Warning signs:** a preview deploy fails with "No more than 12 Serverless Functions"; redirect latency climbs; Meta webhook returns 503 after a deploy.

**Phase to address:** L1, L4, L6, L7, L8 (every PR that touches the dispatcher). Evidence: HIGH (code + Vercel community/docs, MEDIUM for the exact counting rule).

---

### Pitfall 4: Seal goes stale, or becomes a computed value, or outlives its definition

**What goes wrong:** the core value is "no number without a seal", and the brief says the seal is stored, not computed. Failure modes:
1. A green seal stays green because the job that should downgrade it silently did not run (n8n down, secret missing, token expired). The system shows "Conferido no Kommo em 03/11" with 100% confidence about a stale fact.
2. The UI derives the state ("if |nexo - crm| < 2% then green") from live numbers. That is a computed seal; it reintroduces the thing the team distrusts.
3. The seal row is keyed `(clínica × métrica × versão)` but the data rows it vouches for are not. `resultados_diarios` has no definition-version column; after João closes the 4 definitions and the perfil de etapas is fixed, historic rows were computed under the old rule while a "green v2" seal sits next to them.
4. Green attached to a metric, not to a period and a value. "Agendaram verde" confirmed for week 27/10–02/11 does not vouch for November or another clinic. The stage profile is per clinic and was already misapplied in one clinic.
5. "Volta a neutro em 30 dias" implemented only by a cron job; if the job fails the seal never expires.
6. Seal written by hand in SQL (decision 6) with no trail: anyone can mark green.

**How to avoid:**
- Table design: `estado` constrained to the four values; `conferido_em`, `valido_ate`, `periodo_de/ate`, `valor_nexo`, `valor_fonte`, `versao_definicao`, `conferencia_id` (FK to `conferencia_ao_vivo` row or to a manual-reconciliation record), `definido_por`, `texto_curto` with a length check. `CHECK (estado <> 'verde' or (conferido_em is not null and conferencia_id is not null))`.
- Expiry is evaluated at read time against `valido_ate` (that is comparing a stored timestamp, not computing the seal), and a job additionally rewrites to neutral. Either alone is fragile.
- The weekly job writes a seal row on every run, including failures (`ok = null` in `conferencia_ao_vivo` for unreadable sources must produce "não conferido nesta semana", never leave the previous green).
- `hoje` joins on the *current* definition version only; bumping the version instantly drops all old greens to neutral.
- Define the "worst seal" lattice explicitly and test it: `não medido` dominates `âmbar` dominates `neutro` dominates `verde`. The headline sentence inherits it.
- Add `versao_definicao` to `resultados_diarios` (or record the change date) so history and seal can be matched; mark a visible step where the definition changed instead of silently splicing series.
- Seal green only for what the source can actually verify: FlwChat's API lists only open cards (won/lost not verifiable) and Digisac has no won/lost at all (both documented in `conferencia-ao-vivo.ts`). `Fecharam` for Marcella and Antonione can never be auto-green; it needs a manual-conference record, a different source (Hubla, clinic ledger), or stays neutral.

**Warning signs:** `metricas_selo` has rows with `estado = 'verde'` and `conferido_em` older than 30 days; a metric is green on a clinic whose last `conferencia_ao_vivo` row has `ok is null`; any `.tsx` with `Math.abs(a - b)` deciding a seal color.

**Phase to address:** L3 (schema + rules), L6 (writer), L5 (reader). Evidence: HIGH (code + brief).

---

### Pitfall 5: Reconciliation compares different definitions, or builds a third reconciler

**What goes wrong:**
- The Fase 0 finding is that the Nexo is correct for a definition the screen does not explain. A weekly job that compares "Nexo Agendaram = 11" with "Kommo count of cards in stage" is comparing three different things: stock (cards currently in the stage), flow (cards that *entered* the stage in the week: 7), and cumulative (entered or went beyond: 11). It will report permanent amber, or worse, a spurious green.
- The repo already has `api/_lib/conferencia-ao-vivo.ts` (766 lines, five sources, GET-only, writes `conferencia_ao_vivo`, reachable via `?conferencia_ao_vivo=1`) and `api/_lib/kommo-reconcile.ts` (finds deleted/missing leads, marks instead of deleting). Writing a new "weekly job" beside them guarantees divergence. Note the existing live check works on "30 dias inteiros até ontem", not on a closed Mon–Sun week and not on stage-entry events.
- Robot copies on win exist since 01/11/2026. The Fase 0 week (27/10–02/11) straddles that date. Nexo discounts copies; the live API returns them. Without one shared discount rule, the live-vs-Nexo diff is a known constant, and a different rule in the reconciler "fixes" it the wrong way. A dedupe-by-contact heuristic also deletes legitimate returning patients (second procedure = real second sale). Use an exact signature (creator = the robot user, or the copy relation) validated per clinic.
- 39% of Lana's cards are "removed at origin"; `kommo-reconcile` refuses to mark automatically when the slice exceeds 30% (`FATIA_QUE_EXIGE_CONFIRMACAO`). An unattended weekly job must never pass `confirmar: true`; for Lana it will correctly stop every week until a human confirms.
- Kommo stage-entry history only exists in the Nexo since 14/10/2025 and only for 36% of cards; the "entered the stage in the week" side is computable for recent weeks only.

**How to avoid:**
- Extend, schedule and parametrize the existing live check (closed week in BRT, per-side metrics for the pair "entraram" / "chegaram até"); do not add a third module.
- One shared function for "copy of robot" and "removed at origin" used by both the Nexo metric and the reconciliation expected value; diff reasons are explicit ("3 cópias do robô", "N removidos na origem").
- Reconcile each side of the pair separately; the seal for the headline metric only turns green after João closes decision 1, and the seal text stores both numbers when amber.
- Hold the `detalhe` convention of the existing table: counts and periods only, no names, phones or lead ids.

**Warning signs:** a new file named like `kommo-semanal.ts`; the diff column is never zero for Lana for reasons nobody can name; the job passes `confirmar`.

**Phase to address:** P0 (definitions), L6. Evidence: HIGH (code), MEDIUM (Kommo event-history behavior; verify the events API retention before promising a historical entry-count reconciliation).

---

### Pitfall 6: Weekly Kommo job trips Kommo's limits, because the pacer is per process

**What goes wrong:** Kommo documents ~7 requests/second per account; exceeding it returns 429; repeated violations can lead to blocking where every call returns 403 (Kommo's own pages disagree on whether the block is per IP or per account; treat both as possible). `ritmoKommo` allows 6/s, but `aguardarRitmo` stores `proximoPedido` in a module-level `Map`: it throttles only within one function instance. The weekly reconciliation (full scan: Lana has ~22k cards = ~90 pages at 250/page), the incremental `kommo-leads` sync, the Kommo webhook handler, `conferencia_ao_vivo`, and the manual "Sincronizar" button can run in separate instances at the same time. Two instances = 12 rps. Vercel egress IPs are shared and not static, so an IP-level block can also hit unrelated tenants and future calls.

**How to avoid:**
- Per-Kommo-domain lease: one row in a small table (or `sync_status`), `try-acquire` with expiry at the start of any full scan; others skip or wait. This is the only way to make the limit global across instances.
- One clinic per invocation (`client_id` param already supported), staggered by n8n; never loop 20 clinics in one call (270 s budget; the existing code passes `prazo = inicio + 270_000`).
- Treat 429 as "stop and resume next run with cursor", not "retry until deadline"; treat 403 as a circuit breaker that halts all Kommo traffic for hours and alerts.
- Schedule off the daily window (`resultados_gravar_dia` runs 03:30 BRT; `resultado_pronto` background refresh every 10 min), e.g. Monday ~05:00–06:00 BRT, and never during the manual Fase 0 conference.
- Persist progress per page so a failed page does not discard the run (the existing comments in `kommo-leads-sync.ts` record this exact past bug).

**Warning signs:** 429s in the observability log; any 403 from Kommo; overlapping `rodado_em` values for the same domain.

**Phase to address:** L6. Evidence: HIGH (code: in-memory Map), MEDIUM (Kommo docs via search summary).

---

### Pitfall 7: Timezone and period bugs: the project has three clocks and was already burned once

**What goes wrong (Repo facts):**
- `dia-meta.ts`: Instagram "day" is `America/Los_Angeles`; the DST change on 01/11/2026 already stored 24–30/10 with the neighbor day's numbers.
- `resultados_gravar_dia`: `America/Sao_Paulo` date, scheduled in UTC (`'30 6 * * *'` = 03:30 BRT). pg_cron, Vercel cron and GitHub Actions all run in UTC; the n8n instance timezone is a separate setting on the VPS.
- `conferencia-ao-vivo.ts`: hard-coded `FUSO_BR = 3h`. Correct today (Brazil abolished DST in 2019) but a constant with no tests.
- Supabase sessions default to UTC: `created_at::date` puts a lead created 22:00 BRT on Sunday into Monday. Check whether this explains part of Lana's 482 vs 493 gap before attributing it to "filtro de origem" `[hypothesis, not verified]`.
- Kommo reports use the *account's* configured timezone, not BRT; a hand-count in the Kommo UI for Phase 0 can shift a week boundary.

**New-feature traps:**
- "Hoje" is a 03:30 snapshot of *yesterday*. The label says "cálculo de hoje 03:30" but the "day" counted is the previous one; a doctor reading "Agendaram hoje" at 15:00 sees nothing from today. Name the period on the card ("ontem, 08/11") and render the time from `gravado_em`, not hard-coded text.
- Goals: "12 de 20, faltam 8 em 9 dias" computed in the browser uses device timezone and an inclusive/exclusive "today" decision. Compute days left server-side in BRT and test the last day of month and the first day.
- Month-to-date for the goal bar built by summing `resultados_diarios` is wrong by design: the table's own comment says "a soma dos dias NÃO é o número do período" (a person who wrote on two days counts twice). Use the period RPC for MTD.
- Weekly job boundaries: use closed Mon 00:00 to Sun 23:59:59 BRT (= 03:00Z to 02:59:59Z the next day), run only after the 03:30 snapshot, stamp the "as of" time. Late edits in Kommo will move a "closed" week; keep a tolerance and a re-run rule.
- Display: format with `timeZone: "America/Sao_Paulo"` explicitly; a doctor traveling must not see shifted dates.

**How to avoid:** one `fusoBR` helper module shared by `api/_lib` and `src/lib` (CONCERNS already notes client/server drift); a table of golden tests: 22:00 BRT Sunday, 23:59 Sunday, 00:00 Monday, month end, and 01/11-type boundaries.

**Phase to address:** P0, L4, L5, L6, L10. Evidence: HIGH.

---

### Pitfall 8: Phase 0 repeats the circular check and moves its own target

**What goes wrong:**
- The first Lana conference was against the Nexo's own database ("ainda não conferido contra o Kommo ao vivo"). If Phase 0 for Marcella (FlwChat) and Antonione (Digisac) repeats that, both sides inherit the same sync gaps.
- FlwChat lists only open cards and Digisac has no won/lost: "Fecharam" cannot be compared to a CRM in those two clinics. The brief's table "contra o CRM ao vivo" has no answer for those cells; use another independent source (Hubla checkout, clinic agenda/finance) or record "não verificável".
- One closed week in one clinic is one observation. A week with 0 "Consulta Realizada" proves a definition problem, not accuracy. Green seals must carry the clinic, the period and the version; do not generalize to other clinics (stage profile is per clinic).
- Fixing causes (perfil de etapas, robot copies, period/timezone, source off) during the conference changes the target. Freeze the Nexo numbers with timestamp and commit hash first, then re-run after each fix.
- Fixing the profile rewrites past meaning: `resultados_diarios` snapshots were computed with the old rule; backfill with `resultados_preencher` (max 14-day windows, seconds per clinic-day, with 20 clinics) is heavy. Run off-peak and in small windows; never as a user-facing query (30 s cutoff).
- Data handling: hand-counting means exporting cards with names and phones. Keep exports out of the repo (`.planning/` is committed and pushed), out of ClickUp/Notion, and out of the agent's context; the reconciliation table records counts and card ids only.

**How to avoid:** write the count method per cell (which Kommo screen, filter, timezone, stock vs flow) in the table so it is repeatable; version the table; mark unverifiable cells explicitly.

**Phase to address:** P0. Evidence: HIGH (FASE0 doc and code).

---

### Pitfall 9: New tables ship with the wrong RLS (or none), or break because the SQL is not applied yet

**What goes wrong:**
- Supabase exposes `public` tables through PostgREST; a table created without `enable row level security` is world-readable with the anon key. New functions default to `EXECUTE` for PUBLIC/anon/authenticated unless revoked (the repo revokes explicitly, e.g. `resultados_gravar_dia`; copy that, do not assume).
- `security definer` without `set search_path` already exists in two known migrations (`20261001130000`, `20261101130000`). Every new RPC (`hoje`, list, seal writer, log writer) needs `set search_path = public, pg_temp`.
- A view over a table runs with the owner's rights and bypasses RLS unless created `with (security_invoker = true)`. A `v_hoje` or `v_selo` view for convenience becomes cross-clinic exposure.
- Policy `for all using (...)` without `with check` allows writes that fail the check on read side, or the reverse.
- Log table: if the insert policy is `with check (user_id = auth.uid() and is_client_member(client_id))`, **admin/staff inserts fail** (admins often have no `client_members` row). Because the client swallows log errors by design, the log looks "ligado" while recording none of the team's usage, which is the very data the cut decisions need. Include `is_app_admin()` in the check and add a test that an admin insert succeeds.
- Rights: a `viewer` must not write `metricas_selo` or `clinica_metas`; service_role only (selo) and admin only (metas), following the `clinica_metas` template; revoke on sequences too.
- Production migrations are run only by João. The PR will deploy to Vercel on merge before the SQL exists: a `hoje` that selects from `metricas_selo` returns 500/PGRST205 and breaks Hoje for the pilot. Code must treat "relation missing" as `neutro/não medido` and feature-flagged, with the deploy order written in the PR (migration first via the `banco.yml` homolog → prod flow).
- Test coverage: add a `test-db-security.ts` case per new table: unrelated-clinic member reads 0 rows, `viewer` cannot write, `anon` cannot call the RPC. Check that CI runs for the PR base (CONCERNS: some workflows trigger only on `claude/doctor-creator-hub-nixvw6`; the team's PR base is that branch, so confirm the checks actually run on each PR).

**Phase to address:** L1, L3, L7, L8, L10 (each migration). Evidence: HIGH (migrations read).

---

### Pitfall 10: The usage log slows the app, counts the wrong thing, or leaks PII

**What goes wrong:**
- **Slowness:** the project's lesson (per-row function, 04/11) is about work on the hot path. For the log: awaiting the insert in `beforeLoad`/loader blocks navigation; a database trigger or function per insert multiplies cost; routing every navigation through the dispatcher spends function invocations and cold starts for a write the browser can do itself. Note `resultado_pronto_ler` already does a write-on-read (`usado_em`); do not add another one per route.
- **Inflated or wrong counts:** logging on component render or every search-param change (filters change the URL constantly); StrictMode double-fire; Link preload on hover (TanStack `intent` preload) running loaders; redirects logged twice (old route + target). The brief wants to decide cuts from this data, and the decision rule is "0 accesses in 90 days".
- **Dominated by staff:** the team (admins) and Playwright/QA runs open everything via Cmd+K; if user role and origin are not recorded, the log says the screens are used when the doctor never opens them.
- **Missing the openings that matter:** deep links, bookmarks and redirects are where hidden routes are still hit; if `origem` (menu | cmdk | deeplink | redirect | bloqueada) is not captured, you cannot tell "hidden and unused" from "hidden and bookmarked".
- **PII:** logging `location.href` or search strings captures patient names/phones typed into search boxes (`conversas`, `crm-contatos`, `pacientes`) and ids in paths. Log the route *pattern* (`/_authenticated/$clientId/pacientes`), `client_id`, `user_id`, `role`, `origem`, app version, timestamp. Nothing from `search`/`params` except `client_id`.
- **Retention:** the 90-day decision needs the log to persist ≥90 days *continuously*; "ligado" in the v1.5 condition should mean "rows from the doctor's sessions in the last 24 h", not "table exists".
- **Weak decision rule:** monthly/quarterly screens (Relatório do período, PDF) look unused for 90 days and are critical. Treat "0 in 90 days" as a candidate for review, not an auto-delete; seasonality noted in the decision.

**How to avoid:** direct `insert` from the SPA via supabase-js (RLS-checked, no function), fire-and-forget with an in-memory batch flushed on interval/`visibilitychange`, never awaited by navigation; subscribe to router "resolved" events (once per pathname change, deduped with the previous route); `try/catch` that cannot throw into UI and does not retry in a loop; index `(rota, em)` and `(client_id, em)`; add a minimal "log health" tile on Conferência (rows in last 24 h by role); add a retention policy (aggregate after 12 months).

**Warning signs:** navigation feels slower after the PR; the table has 10× more rows than users × sessions; zero rows from admins; `rota` values contain `?` or digits that look like phones.

**Phase to address:** L1, then MENU. Evidence: HIGH (code), MEDIUM (TanStack preload behavior; verify against `defaultPreload` in this router).

---

### Pitfall 11: Hiding 73 routes breaks deep links, bookmarks, OAuth and sold products

**What goes wrong:**
- **Hide ≠ block.** Removing a menu item leaves the URL working. The brief requires screens "without seal" to be visible *only to staff*: a doctor can still open them from a bookmark, an old n8n alert e-mail, a PDF link, a WhatsApp message. That is a data-trust violation, not a UX nuance. Menu hiding needs a route guard (`beforeLoad`) by role/flag as well.
- **Conversely, a hard block breaks existing habits.** The doctor's bookmark to `/$clientId/pacientes` that now redirects to nowhere or 404s reads as "the system broke". Redirect to Hoje with a one-line notice ("Esta tela mudou de lugar") and log the attempt as `origem = bloqueada`.
- **Routes that must never be hidden or redirected:** `/login`, `/reset-password`, `/bem-vindo` (first access), `/oauth/consent` (MCP OAuth redirect; hiding it breaks assistant connections), `/sem-acesso`, `/r/:slug` (served by the dispatcher), `/conhecer`.
- **SAP.** `nav.ts` already shows SAP tabs to a client only when that client's SAP is active. Hiding SAP for everyone could hide a product a client bought (decision 5 is open: "algum cliente foi vendido com SAP?"). Hide for the pilot only, per client, after the answer.
- **Flag design:** a build-time `import.meta.env` flag needs a deploy to flip (and the project has a 100-deploys/day cap); a runtime flag adds a boot query and, if it defaults to "hidden" while loading, flashes the new menu then the old one. Per-clinic and per-role rows, cached in the existing session query, default to the *current* behavior while loading.
- **Single source of truth.** Menu, Cmd+K index, route guard and log must read one registry with `status: viva | escondida | tirada` and the `termos/descricao` search fields already in `NavTab`. Add a test that every route in `routeTree.gen.ts` appears in the registry, so 90 = 14 + 73 + 3 stays true and a new route cannot be silently unlogged.
- The 3 "tiradas" must keep redirects from their old URLs (the `marketing` redirect and two repeated `/ideias` labels), not 404.
- **Cmd+K:** Cmd on Mac, Ctrl on Windows (the browser's own Ctrl+K focuses its search bar in some browsers: call `preventDefault`), and a visible "Buscar" button because the team will also use phones.
- E2E specs `navigation-architecture.spec.ts` and `workspace-navigation.spec.ts` assert the current menu; update them in the same PR.

**Phase to address:** MENU (with L1 already live so openings are recorded from day one). Evidence: HIGH (routes, nav.ts), MEDIUM (browser shortcut specifics).

---

### Pitfall 12: LGPD: a contact list of people who wrote to a clinic is health-adjacent personal data

**What goes wrong:**
- Name + clinic + "Consulta Agendada"/stage + origin reveals that a person is, or is about to be, a patient of a given specialty. Treat as sensitive health data (LGPD art. 5 II, art. 11). Art. 11 has no "legítimo interesse" basis (that is art. 7 IX); do not rely on it `[MEDIUM: a contested area; get legal advice]`. Plausible bases: tutela da saúde by health professionals (art. 11 II f) or consent. Decision 10 (contract basis for nominal access) is a legal gate, not a UI detail.
- Roles: the clinic is controller, Doctor Creator is processor for patient data (and possibly controller for its own benchmarking). Without a data-processing clause per clinic, "nominal access for the team" has no documented basis.
- Purpose limitation: data collected for analytics is reused to prompt contact. Condition 2 ("only people who already wrote, with explicit motive") is the right guard, but the system has **no opt-out tracking**: a person who wrote "pare de me mandar mensagem" or is in a group chat (Evolution; 1:1 official API only) can reappear. Exclude opted-out, blocked and group-origin contacts.
- Erasure and removal: Kommo cards "removed at origin" (39% for Lana) keep their PII in the Nexo (syncs are upsert-only; `kommo-reconcile` only marks). The list excludes them (condition 1) but the data still sits in the database. Define PII purge for removed cards.
- Access log (art. 37, art. 6 X): record who, when, clinic, mask level and count; never the list. The log is itself personal data about employees: set retention.
- Cross-border: Vercel functions default to `iad1` (US) and LLM providers are US-based. Confirm Supabase region and record the transfer basis (art. 33) `[Supabase region not verified]`.
- Leak channels beyond the UI: PDF/report export (`pdf-relatorio-completo.tsx`, `relatorio-envio.ts`), the MCP server, the AI layer. `mascararDadosPessoais` masks e-mail, CPF and phone but **not names**, and its phone regex also matches any 8–9 digit run (ids, amounts); do not send first names to an LLM thinking it is covered.
- Process: Claude Code sessions and Supabase MCP queries put whatever they read into a third-party model's context. Phase 0 and the validation of the 20 rows must work from counts and ids, or inside the app, never by pasting real names into the agent. Fixtures for tests and the 400px prototype ("com dados da Lana", decision 11) must be synthetic or aggregate-only: committed fixtures live forever in git history.
- Incident readiness (art. 48): no documented incident procedure was found; add a one-page runbook before the list ships.

**Phase to address:** L7 gate (decision 10 + DPA before nominal access), P0 data handling, L8. Evidence: MEDIUM (statute from knowledge and secondary sources; not legal advice).

---

### Pitfall 13: CFM copy rules are violated by arithmetic labels, existing alerts and template text

**What goes wrong:** Resolução CFM 2.336/2023 (in force since 11/03/2024) prohibits guaranteeing, promising or insinuating results and sensationalist/mercantile advertising, and constrains price/benefit offers. The project's own rule is stricter and operational: past tense, no promise, no prediction, no adjective. Where it breaks in practice:
- **Existing UI already predicts.** `clinica_metas` is described as showing "no prazo, em risco, fora do prazo"; the n8n alert sends "meta em risco". The brief bans projection ("sem projeção"). "Em risco" is a forecast. Replace with a count and a fact ("12 de 20 até 09/11; faltam 8; restam 9 dias").
- **Adjectives and verbs hiding in generators:** "queda forte", "ótimo", "boa semana", "vai", "deve", "pode", "tende a", "crescimento", exclamation marks, emojis. Variation chips (+120%) read as celebration when large.
- **The fixed-sentence builder** needs plural/zero/"não medido" cases ("1 pessoa agendou", never "0 pessoas fecharam" when the stage does not exist).
- **Patient-facing text (Quem chamar template, v1.5 summary):** nothing about outcomes ("resultado garantido"), no urgency/scarcity ("últimas vagas"), no discounts/benefits bundled with consultation, no specialty or condition in the preview text (a phone can be shared; avoid disclosing that the person is a patient of a given specialty).
- **"Venda/fechou" vocabulary** for consultations in doctor-facing text is jargon the doctor may repost; keep the fixed vocabulary reviewed (decision 9).
- Writing copy in code scattered over components means no one can audit it.

**How to avoid:** one copy module (closed verbs and templates) as the only source of strings going to doctors/patients; a unit test that fails on a deny-list (future tense, modal verbs, `!`, emoji, adjective list, the words "risco", "meta atingida em"), run in CI over every template with sample values; João signs off the closed list (decision 9). Retire "em risco" in `clinica_metas` UI and the n8n alert text in the same milestone.

**Phase to address:** L5, L8, L9, L10. Evidence: HIGH (repo strings), MEDIUM (CFM text: confirm article numbers against the official PDF and the CFM manual before quoting).

---

### Pitfall 14: WhatsApp template: wrong channel assumptions, wrong category, wrong WABA

**What goes wrong:**
- **Conflating two mechanisms.** The brief says the button "opens official WhatsApp with approved template, never auto-sends". A `wa.me/<number>?text=` link (the app already generates these) needs **no Meta template** at all; it prefills a message in the secretary's own WhatsApp. A Meta-approved template is required only for business-initiated messages through the Cloud API (via a BSP such as FlwChat/Digisac/Kommo), or for the v1.5 doctor summary. Decide which flow L7 uses before requesting anything; otherwise L9 requests the wrong thing (or nothing blocks L7 while the team waits).
- **Wrong category → rejection or reclassification.** Meta rejects with `INCORRECT_CATEGORY` when content disagrees with the chosen category; utility templates must be non-promotional and tied to a user action or essential info; mixed or unclear content is treated as marketing. A "retomar contato com quem não agendou" message is marketing; "confirmar a consulta marcada" can be utility. They are two templates with different categories and costs (per-message pricing applies). Approved utility templates can be reclassified to marketing after notice, and repeated misuse can escalate to rate limiting and utility-template restrictions on the WABA, which is the clinic's real operational number, not a sandbox.
- **Format rejections** (secondary sources, MEDIUM): non-sequential variables ({{1}},{{2}},{{4}}), variable at the very start/end, variable-heavy text for its length, missing sample values, duplicate of an existing template, language mismatch (pt_BR content with another language tag), URL shorteners (the stack uses Short.io: use the clinic's direct URL), mixed button types, vague or spammy wording.
- **Whose WABA?** The clinic's templates live in the clinic's WABA (through its BSP); the weekly summary to the doctor is sent from Doctor Creator's number and needs the doctor's opt-in. One "request to Meta" does not cover both.
- **Quality side effects:** recipients who block or report lower the number's quality rating and messaging limits; a "call everyone from the list" habit hurts the clinic's number.
- **Calendar risk:** approval and rejection loops take days, and edits to approved templates are limited and re-reviewed. The brief puts L9 ninth; since v1.5 is gated on an approved template, submit the request right after the CFM-reviewed copy exists, in parallel with the code.
- **Evolution API** is for groups only; never route 1:1 templates through it.
- Do not collect or place sensitive identifiers (CPF, diagnosis) in template text or variables `[LOW: verify against current WhatsApp Business Messaging Policy]`.

**How to avoid:** a one-page flow decision (wa.me prefill vs API send) before L7; two templates with correct categories; English-free pt_BR copy with realistic samples; test submission on a non-production WABA first if available; log the template name/version/category with each v1.5 send.

**Phase to address:** L7 decision, L9. Evidence: MEDIUM (Meta developer page and vendor guides; Meta's own rejection-code list not fully retrieved).

---

## Moderate Pitfalls

### Pitfall 15: `hoje` makes blocks depend on each other or recompute heavy work per open

**What goes wrong:** one failing block (Foram has no stage) takes down the screen; or all blocks call heavy RPCs on each open; or the "Quem chamar" list evaluates a per-row function over 22k cards (the exact 04/11 slowdown pattern); first open after the 20-minute cache TTL shows a 10 s skeleton; Monday-morning bursts from 20 clinics hit the connection pooler together.

**Prevention:** `Promise.allSettled` with a per-block timeout well under the 30 s database cutoff; each block returns `{estado, valor|null, conferido_em, motivo}` and the last good value from `resultado_pronto`/`resultados_diarios` with its timestamp on failure; set-based SQL only (no function per row), `LIMIT 5` with supporting partial indexes (e.g. `client_id` where not removed); warm the day's results in the 03:30 job; keep `Cache-Control: private, no-store` (already global in `vercel.json`; do not add shared caching to PII).

**Phase:** L4, L5, L7. Evidence: HIGH.

### Pitfall 16: "Não medido" quietly becomes zero

**What goes wrong:** `?? 0`, `Number(x || 0)`, `coalesce(...,0)` in new SQL, chart libraries treating null as gap but sums coercing, "Foram: 0" where the stage does not exist. There is already a migration (`nao_medido_no_lugar_de_zero`) because this happened.

**Prevention:** the `hoje` contract is a discriminated union (`{estado:'nao_medido'}` has no numeric field); ESLint/grep gate for `?? 0` and `coalesce(…,0)` in the new files; test per block; "funil inconsistente nesta clínica" when non-monotonic.

**Phase:** L4, L5. Evidence: HIGH.

### Pitfall 17: "Quem chamar" timestamps lie

**What goes wrong:** "tempo parado" computed from the CRM card's `updated_at` resets on any robot/tag/field edit, so a card stuck for 10 days appears fresh (or the reverse). Stage-change history exists only since 14/10/2025 and for 36% of cards. Message timestamps come in other timezones/epochs per source. The same person can appear twice (robot copies, two pipelines), or be listed after already booking in another pipeline.

**Prevention:** define "parado" from last inbound/outbound message or last stage change, with explicit fallback to "sem data" (excluded, not guessed); dedupe by contact; exclude contacts with a scheduled/won card in any pipeline; condition 4 is a test on the exact timestamp column used, run per clinic. The 20-row validation must sample across ≥2 different days and include rows the rules excluded (to estimate wrong exclusions), be marked in-app, and not be exported to a sheet.

**Phase:** L7. Evidence: HIGH/MEDIUM.

### Pitfall 18: Shadow-mode summary never graduates, or leaks by a code path that can send

**What goes wrong:** nobody reads the shadow output, so no evidence accumulates; or the shadow job shares a sender with the future v1.5 path and a misconfigured recipient list sends to the doctor; the summary is LLM-written with names or breaks the "silent when not green" rule.

**Prevention:** v1 contains **no outbound send code** for the summary (writes rows and a staff page only); store inputs (numbers, seal state, definition version) with the generated text; define the graduation metric up front (v1.5 asks 2 sends with no text/source difference); text from templates, not an LLM, until v3; opt-in table queried by an explicit allowlist.

**Phase:** L8. Evidence: MEDIUM.

### Pitfall 19: Goals by SQL: values that contradict the definitions

**What goes wrong:** `clinica_metas` allows `agendaram`, `fecharam`, `mandaram_mensagem`; a goal of "20 agendaram" set before decision 1 is compared against an actual that may switch from 11 to 7. Writes only by admin SQL means no audit and typos (`valor` constraints exist but no period).

**Prevention:** add `definicao_versao` to the goal (or freeze the metric label) and show the goal only when the metric's seal is not "não medido"; version the goal by month; João runs the file the agent delivers and the PR notes the exact rows.

**Phase:** L10. Evidence: HIGH.

### Pitfall 20: Deployment budget and PR mechanics

**What goes wrong:** Hobby allows 100 deployments/day and each pushed commit to an open PR creates a preview deployment; ten PRs with fixes plus Fase 0 corrections can exhaust it on busy days. Merging a dispatcher change on a day when a live ad campaign runs is a risk (Pitfall 3).

**Prevention:** batch commits per PR (push once when green), schedule merges for off-peak, post-deploy checklist with print of the live site (project rule), keep a rollback note per PR (revert commit + migration reversal comment, as the migrations already do).

**Phase:** All. Evidence: MEDIUM (limit from project constraints).

### Pitfall 21: Scheduling lives in the wrong place (Vercel cron, GitHub Actions)

**What goes wrong:** Vercel Hobby cron runs at most once per day with ±59-minute precision (expressions that run more often fail the deploy), so it cannot host a precise weekly run; its auth is a `CRON_SECRET` Bearer, not `SYNC_SECRET`, and the dispatcher compares to `SYNC_SECRET`. Existing `vercel.json` has no `crons` block: schedules live in pg_cron (`resultados-diarios`, `resultado-pronto`), n8n (VPS, shared with production) and GitHub Actions. GitHub scheduled workflows can be delayed and `alertas.yml` exits green when its secret is missing (CONCERNS).

**Prevention:** weekly Kommo job from n8n (same pattern as today) with a failure notification, and a staleness check ("último ciclo > 8 dias") surfaced on Conferência and in the seal (Pitfall 4). Do not add `crons` to `vercel.json`.

**Phase:** L6, L8. Evidence: HIGH (Vercel docs), MEDIUM (GitHub behavior).

---

## Minor Pitfalls

- **Cmd+K accessibility:** focus trap, Esc, screen-reader labels; the brief requires touch targets ≥44px and text ≥14px, check on the 400px layout.
- **Seal text length and jargon:** "sync", "token", "connection" are banned for doctors; set a character limit in a `CHECK`.
- **Selo/amber text with two numbers** must follow Pitfall 13 rules ("7 entraram · 11 chegaram a ela ou além"), no judgement words.
- **Phone regex false positives** in `mascararDadosPessoais` can corrupt numbers in generated text; unit-test with ids and amounts.
- **`routeTree.gen.ts`** is generated; do not hand-edit when adding the registry.
- **`any` casts (~490)** around RPC results will hide a renamed field in `hoje`; type the new endpoint with zod/`Database` types.
- **QA route** gated only by `import.meta.env.DEV`; keep it out of the "73" reorganization.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Add the `hoje`/log/list logic as static imports in `manual.ts` | No new files, fast | One import error breaks `/r/:slug`, webhooks, checkout | Never; use dynamic `import()` |
| Compute the seal state in React from live numbers | No new table/job | Reintroduces unexplained numbers; contradicts core value | Never |
| Reuse `resultado_pronto` cache for the list | Free speed | Role-agnostic cache leaks nominal data across roles | Never for PII |
| Hide routes with a build-time env flag | Trivial | Deploy per flip, whole-app granularity, burns deploy budget | Only for the very first spike |
| Write a new reconciler file | Clean slate | Third divergent copy of discount/removal rules | Never; extend `conferencia-ao-vivo.ts` |
| Hand-written SQL seal updates without evidence columns | Fast start | Green seals nobody can audit | Only if `conferencia_id` + `definido_por` are mandatory |
| Copy templates inline in components | Faster UI | CFM copy cannot be audited or linted | Never for doctor/patient-facing text |
| Skip `search_path` on "small" RPCs | Less typing | Repeats the two known `security definer` gaps | Never |
| Log full `location.href` | Easy | PII in log, inflated counts | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Kommo API | Per-process throttle, concurrent full scans | Per-domain lease in the database, one clinic per call, 429 = stop, 403 = circuit breaker |
| Kommo data | Counting stock vs flow vs cumulative as one "Agendaram" | Reconcile each definition separately; record the Kommo account timezone used |
| Kommo robot copies | Dedupe by contact | Exact signature (creator/robot relation), validated per clinic, date-aware (starts 01/11/2026) |
| FlwChat/WTS | Expecting won/lost in the live API | Only open cards listed; won/lost unverifiable, so no auto-green for Fecharam |
| Digisac | Expecting won/lost | No won/lost; use another source or leave neutral |
| Supabase RLS | "admin or member reads" copied to a PII table | RPC with server-side mask; no direct select grant |
| Supabase views | Convenience view over RLS table | `security_invoker = true` or no view |
| Supabase pg_cron | Cron expression in local time | UTC only; document BRT in the comment as the existing migration does |
| Vercel Hobby | New function file / cron more than daily | Dispatcher branch; n8n or pg_cron schedules |
| Meta WhatsApp Cloud API | Utility category for re-engagement; shortener links; wrong WABA | Marketing vs utility templates separately; direct URLs; request in the right WABA |
| `wa.me` | Phone number embedded in list payload/DOM | Server-issued link at click time, logged |
| LLM providers | Assuming `mascararDadosPessoais` covers names | Do not send patient names; templates, not LLM, for v1 |
| MCP server | New table readable by any authenticated token | Keep PII tables out of MCP tools; RLS via caller JWT stays the backstop |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Function per row in the list | Hoje slow, 30 s cutoff | One set-based query with `LIMIT`, partial index | Clinic with ~20k cards (Lana: 22,324) |
| Heavy blocks recomputed on open | Skeleton "Calculando" for ~10 s | Read `resultado_pronto`/`resultados_diarios`, warm at 03:30 | First open after 20 min TTL |
| 20 clinics opened at once | Pooler saturation, 500s Monday 08:00 | Cache, stagger background refresh | Monday morning bursts |
| Weekly full scan of all clinics in one invocation | 300 s timeout | One clinic per call, cursor/page progress persisted | Beyond ~3 large clinics |
| Log insert awaited in navigation | Perceived slowness | Batched fire-and-forget | Immediately |
| Dispatcher cold start with `creative` assets | First Hoje of the day slow | Measure; dynamic import; keep branch light | Every cold start |
| `resultados_preencher` backfill after profile fix | Long locked sessions | Off-peak, 5–7-day windows per the migration note | 20 clinics × 60 days |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting `client_id` on a service-role branch | Cross-clinic data exposure | Shared access helper + 403 tests (Pitfall 2) |
| Mask level taken from client input | Anyone reveals full data | Derive from JWT + membership column |
| `is_app_admin()` in the list policy | Agency sees names | Feature-specific RPC ignoring admin override |
| Returning `err.message` from handlers | Postgres values in error text | Generic error + request id |
| Phone in `wa.me` link inside list HTML | Number in DOM, history, screenshots | Reveal endpoint, logged |
| Real patient data in fixtures, prototype, `.planning/` | Permanent exposure in git | Synthetic/aggregate-only fixtures |
| Access log storing list contents | Log becomes a second copy of PII | Log metadata only |
| `security definer` without `search_path` | Function hijack | `set search_path = public, pg_temp` + test asserting it |
| Guard only in menu | Doctor opens unsealed screens by URL | `beforeLoad` guard + log of blocked attempts |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Moved screens with no redirect | "The system broke" for bookmarks | Redirect to Hoje with one-line notice |
| Green badge without date | False certainty | "Conferido no Kommo em dd/mm" always, expiring to neutral |
| Hoje labelled "hoje" but showing yesterday | Doctor distrusts the numbers | Name the day on the card; show `gravado_em` |
| Same names on the list every day | List ignored | Exclude recently contacted via the access log; cap at 5 |
| Empty state without the missing condition | Looks broken | State what is missing ("faltam 20 conferências da secretária") |
| Large jumps shown as celebration | CFM-sensational tone | Neutral chip, base ≥30, cap 300% (existing rule) |
| Amber used for both "differs from CRM" and "failed to load" | Confusion | Separate wording; red only for confirmed collection failure (brief) |

## "Looks Done But Isn't" Checklist

- [ ] **Usage log:** often missing admin inserts and origin (`menu/cmdk/deeplink/bloqueada`) — verify rows exist from an admin session and a viewer session in production.
- [ ] **`metricas_selo`:** often missing expiry and the downgrade-on-failure path — verify a forced job failure turns the seal neutral/amber.
- [ ] **Seal text:** often missing the period and version — verify the green text shows date, period and definition version.
- [ ] **RLS:** often missing a cross-clinic test and `enable row level security` on the new table — verify with a second clinic's member and with anon.
- [ ] **`security definer`:** often missing `set search_path` and `revoke execute` — verify `pg_proc.proconfig` and grants.
- [ ] **Masking:** often only in React — verify with `curl` as each role.
- [ ] **Access log:** often records the page view, not the reveal — verify a row per `abrir`.
- [ ] **Hidden routes:** often reachable by URL — verify as `viewer` opening a hidden "sem selo" URL gets the redirect and a log row.
- [ ] **OAuth consent / login / `/r/:slug`:** often forgotten — verify they work after the menu PR.
- [ ] **Weekly job:** often runs once and never again — verify a second scheduled run in n8n and the staleness alert.
- [ ] **Timezone:** often tested only at noon — verify Sunday 22:00 BRT and month end.
- [ ] **Copy:** often passes review once, not in CI — verify the deny-list test runs on every template.
- [ ] **Migration order:** often deployed before SQL — verify the PR page loads with the table absent.
- [ ] **Live-site print:** project rule — attach a screenshot of the deployed site per PR.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| PII exposed through list/response | HIGH | Disable the list flag, rotate sessions, review access log, assess art. 48 notification, fix mask in RPC, add role test |
| Dispatcher outage (import error) | MEDIUM | Revert the PR; Vercel instant rollback; verify `/r/:slug`, Meta webhook, Hubla |
| Stale green seal discovered | LOW | Run a SQL (João) setting affected seals to neutral; add `valido_ate` check; fix writer |
| Kommo 403 block | MEDIUM | Halt all Kommo schedules, contact Kommo support, resume with lease and lower pace |
| Log table without admin rows | LOW | Fix policy, restart the clock for the 90-day window and record the gap |
| Template rejected/reclassified | MEDIUM | Re-submit with the correct category and cleaned copy, request review within 60 days; stop sending the old template |
| Wrong definition version on history | MEDIUM | Backfill `resultados_diarios` in small windows after João closes the definitions; mark the break in charts |
| Hidden route broke a bookmark/OAuth | LOW | Restore the route in the registry; add redirect |
| Migration not applied before deploy | LOW | Run the migration (João); code already degrades to neutral |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Masking leaks | L7 | `curl` as viewer/owner/admin returns different shapes; no phone in list payload |
| 2 Service-role scope | L4, L1, L7 | 401/403 tests in `test-api-security.ts` |
| 3 Dispatcher blast radius | L1, L4, L6, L7, L8 | Smoke of `/r/:slug` + Meta webhook on preview; dynamic imports present |
| 4 Seal stale/computed/version | L3, L6, L5 | Forced failure test; version bump drops greens; lattice unit test |
| 5 Definition mismatch / third reconciler | P0, L6 | One module; diff reasons named; no `confirmar: true` |
| 6 Kommo limits | L6 | Lease row; overlapping run skipped; 429/403 handling test |
| 7 Timezone | P0, L4, L5, L6, L10 | Golden tests; "as of" label; MTD via period RPC |
| 8 Phase 0 circularity | P0 | Table cites independent source per cell; frozen snapshot hash |
| 9 RLS / migration order | L1, L3, L7, L8, L10 | `test-db-security.ts` per table; page loads with table missing |
| 10 Usage log | L1, MENU | Rows from admin+viewer; no `?` in `rota`; navigation timing unchanged |
| 11 Hiding routes | MENU | Registry test (90 = 14+73+3); guard test; OAuth/login/`/r/` smoke |
| 12 LGPD | L7 gate, P0 | Decision 10 written; DPA; purge rule for removed cards; synthetic fixtures |
| 13 CFM copy | L5, L8, L9, L10 | Deny-list test in CI; "em risco" removed |
| 14 WhatsApp template | L7 decision, L9 | Flow decision doc; two templates with correct categories |
| 15 hoje blocks/perf | L4, L5 | Block failure isolation test; p95 before/after |
| 16 Não medido → 0 | L4, L5 | Contract test; grep gate |
| 17 Timestamps | L7 | Condition 4 test on the exact column; 2-day validation |
| 18 Shadow summary | L8 | No send path in code; graduation metric defined |
| 19 Goals | L10 | Version column; seal-aware display |
| 20 Deploy budget | All | Batched pushes; rollback notes |
| 21 Scheduling | L6, L8 | n8n run history; staleness alert |

## Open items needing phase-specific research

- Whether the Kommo events API can reproduce "entered stage in week" for dates before the Nexo's own 14/10/2025 history (L6, P0).
- Whether L7 uses `wa.me` prefill or an API send through a BSP (L7, L9); which BSP each pilot clinic uses.
- Supabase project region and the exact LGPD basis for nominal access (L7, decision 10; needs legal review).
- Official CFM 2.336/2023 articles for sensational/mercantile language to cite in the copy test (L5, L8, L9).
- Current WhatsApp Business Messaging Policy treatment of health-related content in templates `[LOW]`.
- `defaultPreload` setting of the router, to decide log dedupe rules (L1).

## Sources

- Repo (read directly): `supabase/migrations/20261106120000_clinica_metas.sql`, `20261106130000_resultados_diarios.sql`, `20261105120000_resultado_pronto.sql`, `20261102150000_apis_resilientes.sql`, `20261102180000_conferencia_ao_vivo.sql`, `20261021240000_mcp_chamadas.sql`; `api/_lib/integration-http.ts`, `kommo-reconcile.ts`, `conferencia-ao-vivo.ts`, `dia-meta.ts`, `mascarar-pii.ts`, `observability.ts`; `api/sync/manual.ts`; `vercel.json`; `src/lib/nav.ts`; `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `INTEGRATIONS.md`; `~/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md`, `FASE0-Lana-27out-02nov.md`. (HIGH)
- Vercel Functions limits (Hobby: 300 s max, 2 GB, 4.5 MB body, 1,024 file descriptors): https://vercel.com/docs/functions/limitations (HIGH)
- Vercel cron on Hobby (once per day, hourly precision, daily-only enforcement at deploy): https://vercel.com/docs/cron-jobs/usage-and-pricing (HIGH via search summary)
- Vercel Hobby 12-function limit and counting of `api/` files: https://community.vercel.com/t/serverless-function-limit/12797 and https://community.vercel.com/t/vercel-deployment-fails-with-12-serverless-functions-limit-error-despite-having-11-functions/35397 (MEDIUM; the `api/_lib` exclusion is community-reported, and the repo evidently relies on it)
- Kommo limitations (7 req/s, 429, 403 on repeated violations; IP vs account wording differs between pages): https://developers.kommo.com/docs/limitations and https://www.kommo.com/developers/content/api/recommendations (MEDIUM via search summary; pages themselves not retrieved in full)
- Meta WhatsApp template category guidelines (utility vs marketing, recategorization, `INCORRECT_CATEGORY`, 60-day appeal): https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines (MEDIUM-HIGH)
- Template rejection reasons (variables, category, shorteners, duplicates): https://help.respond.io/whatsapp/whatsapp-message-templates, https://www.ycloud.com/blog/common-whatsapp-api-template-message-rejection-reasons-with-fixes.md, https://chakrahq.com/article/whatsapp-api-template-rejections-issues-guidelines-coexistence/amp/ (MEDIUM, vendor sources)
- CFM Resolução 2.336/2023 (in force 11/03/2024; prohibits guaranteeing/insinuating results): https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf, https://www.mattosfilho.com.br/unico/regras-publicidade-medica/, https://med.estrategia.com/portal/noticias/publicidade-medica/ (MEDIUM; articles not read in full)
- LGPD (Lei 13.709/2018) arts. 5 II, 6, 11, 18, 33, 37, 46, 48: statute knowledge, not re-fetched (MEDIUM; legal review required)

---
*Pitfalls research for: Nexo v5.0 (Fase 0 + degrau v1) feature additions*
*Researched: 2026-11-09*
