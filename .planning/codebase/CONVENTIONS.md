---
last_mapped_commit: 4ec717342419efd81373da4bb35f675df4ba1429
last_mapped_at: 2026-11-06
---
# Coding Conventions

**Analysis Date:** 2026-11-06

## Naming Patterns

**Files:**
- kebab-case for every source file: `src/lib/date-range.ts`, `src/components/date-range-picker.tsx`, `api/_lib/integration-http.ts`, `src/hooks/use-auth.tsx`.
- Route files follow TanStack Router flat-file naming with dots for path segments: `src/routes/_authenticated.$clientId.sap.metas.tsx`. Do not hand-edit `src/routeTree.gen.ts` (generated, git-ignored in `.gitignore`).
- Serverless handlers in `api/` are grouped by domain folder: `api/sync/instagram.ts`, `api/admin/create-user.ts`, `api/integrations/kommo/`. Shared server helpers live in `api/_lib/` (underscore prefix means "not a route").
- Test scripts: `scripts/test-<dominio>.ts` (e.g. `scripts/test-sap-metas.ts`, `scripts/test-migrations.ts`). Playwright specs: `tests/e2e/<area>.spec.ts`.
- Runnable one-off scripts at repo root (`run-*.ts`, `_run_*.ts`, `_t1.ts`) are ad hoc and should not be copied as patterns.

**Functions:**
- camelCase, named exports. React components are PascalCase named function exports: `export function DateRangePicker(...)` in `src/components/date-range-picker.tsx`. 109 `.tsx` files use `export function`; default exports are not used for components.
- Hooks: `use` prefix, file `use-<name>.ts(x)` in `src/hooks/`, e.g. `useAuth` in `src/hooks/use-auth.tsx`, `useResultado` in `src/hooks/use-resultado.ts`.
- API handlers: a single `async function handler(req, res)` per file, wrapped at export time (see Error Handling).
- Domain functions are written in Portuguese, in the domain vocabulary of the product: `mensagemDeErro`, `janelaBaseline`, `avaliarKpi`, `proporMeta`, `rotuloPeriodo`, `integrationHost`.

**Variables:**
- camelCase for locals. Module constants in SCREAMING_SNAKE_CASE: `CAMPOS_DIARIOS` (`src/hooks/use-resultados-diarios.ts`), `ROTULO_CONFIANCA` (`src/lib/insight.ts`), `CAMPO` (`src/components/date-range-picker.tsx`), `SEM_DATA` (`api/_lib/ads-planilha-sync.ts`).
- Database columns, JSON payload keys and API request fields are snake_case and are used directly in TypeScript: `client_id`, `post_url`, `seguidores_antes`, `ads_planilha_semanal`. Do not camelCase data fields that cross the DB/API boundary.
- Environment variables are UPPER_SNAKE_CASE and read via `process.env.X` inside handlers: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`api/admin/create-user.ts`). Client-side Vite variables use `VITE_` prefix (`VITE_SUPABASE_URL` in `playwright.config.ts`).

**Types:**
- `interface` for object shapes (`AdsPlanilhaLinha` in `api/_lib/ads-planilha-sync.ts`, `AgenteCatalogo` in `src/lib/agentes-catalogo.ts`, `AuthState` in `src/lib/auth-session.ts`). `type` for unions and aliases (`type IdAgente = "brain" | ...`, `type ErroLike = ...`).
- Union literal types are preferred over enums. `as const` is used for constant lists (85 files), e.g. `CAMPOS_DIARIOS` in `src/hooks/use-resultados-diarios.ts`.
- Zod schemas named `<thing>Schema` (`createUserSchema` in `api/_lib/request-validation.ts`, `manualRequestSchema`); types derived with `z.infer<typeof schema>`.
- Props typed inline in the function signature for components (`src/components/date-range-picker.tsx`) rather than separate `Props` interfaces.

## Code Style

**Formatting:**
- No Prettier or Biome configuration exists in the repo. Follow the observed style:
  - Double quotes for strings (`"..."`), semicolons on statements, 2-space indentation, no tabs (0 tab-indented files).
  - Trailing commas in multi-line object and argument lists.
  - Long lines are common: about 9,900 lines over 120 characters in `src/` and `api/` (of about 96,700 total). Keep new code under ~120 where practical, matching the surrounding file.
  - Several short related declarations are placed on one line when they belong together (`const id = z.string().uuid();`), and object literals with many short fields are written inline (see the `client` fixture in `tests/e2e/fixtures.ts`).

**Linting:**
- ESLint flat config at `eslint.config.js`, using `@typescript-eslint/parser` and `eslint-plugin-react-hooks`.
- Rules enforced as errors: `constructor-super`, `no-constant-binary-expression`, `no-dupe-else-if`, `no-duplicate-case`, `no-unreachable`, `use-isnan`, `valid-typeof`, `no-unsafe-optional-chaining`, `no-unexpected-multiline`, `no-sparse-arrays`, `no-prototype-builtins`, `no-async-promise-executor`, `react-hooks/rules-of-hooks`.
- `react-hooks/exhaustive-deps` is a warning.
- The config explicitly says TypeScript handles names and types; the lint rules are for syntax and control flow only. Do not expect style-based lint errors.
- Type checking is the main gate: `npm run typecheck` (runs `routes:generate` then `tsc --noEmit`, `strict: true` in `tsconfig.json`).
- Ignored by lint: `dist/**`, `.tanstack/**`, `src/routeTree.gen.ts`, `.claude/**`.
- Type escape hatches are common in the server code: `any` appears in roughly 370 places across `src/`, `api/` and `scripts/`, mostly as `Promise<any>` in `api/_lib/agentes.ts` and untyped Supabase rows. Only 2 `@ts-ignore`/`eslint-disable` directives exist; prefer a typed row interface over adding one. New code should avoid `any` unless matching an existing untyped boundary.

**Pre-commit / full check:**
- `npm run check` runs in sequence: `secrets:check` (`scripts/check-secrets.mjs`), `lint`, `typecheck`, `test`.

## Import Organization

**Order (observed):**
1. Node built-ins with `node:` prefix (`import { createHash } from "node:crypto";`, `import assert from "node:assert/strict";`).
2. Third-party packages (`react`, `@tanstack/react-router`, `@tanstack/react-query`, `recharts`, `zod`, `@supabase/supabase-js`).
3. Internal modules via the `@/` alias (`import { supabase } from "@/integrations/supabase/client";`).
4. Relative imports, used mainly in `api/` and `scripts/`.

Example from `src/routes/_authenticated.$clientId.index.tsx`: React hooks first, then `@tanstack/*`, then `recharts`, then `@/lib/*`, then `@/hooks/*`, then `@/components/*`.

**Path Aliases:**
- `@/*` maps to `src/*` (declared in `tsconfig.json` `paths`, and in Vite via `vite-tsconfig-paths`). Used in roughly 1,070 import lines under `src/`. Use `@/` for every import from `src/`; reserve relative paths for siblings in the same folder.
- API files import each other with explicit `.js` extensions in relative paths: `import { withApiObservability } from "../_lib/observability.js";`. Keep that suffix in `api/` (ESM runtime).
- Use `import type { ... }` for type-only imports (`import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";`, `import { type Metrica } from "@/lib/resultado";`).

## Error Handling

**Client (`src/`):**
- Never show raw database or network errors to the user. Convert them with `mensagemDeErro(e, oQue?)` from `src/lib/erro-amigavel.ts`. Pass the thing being loaded with its article: `mensagemDeErro(error, "o funil")`.
- Technical text (statement timeouts, `permission denied`, `pgrst`, HTTP codes) is logged to the console for debugging, not rendered.
- Auth flows: `try/catch` around the async call, with a fallback state when the provider fails (`src/hooks/use-auth.tsx` uses `.catch(() => controller.accept(null))`).

**Server (`api/`):**
- Every handler is wrapped: `export default withApiObservability(handler, "<endpoint-name>")` (see `api/_lib/observability.ts`). Pair with the handler's own method check and early returns.
- Method guard first, then config check, then auth, then body validation. Example from `api/admin/create-user.ts`:
  - `res.status(405).json({ error: "Method not allowed" }); return;`
  - `res.status(500).json({ error: "Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados" });`
  - `res.status(401).json({ error: "Sem token de autenticação" });`
- Responses for these errors are `{ error: string }` JSON. Keep that shape.
- Validate every request body with Zod before use (`api/_lib/request-validation.ts`). Handlers should never trust `req.body` (typed `any` in `api/_lib/http-types.ts`).
- Outbound HTTP to third-party providers goes through the helpers in `api/_lib/integration-http.ts`:
  - `integrationHost(value, provider)` to validate tenant-supplied domains (Kommo, Digisac).
  - `integrationRequest(options)` sets `redirect: "error"` and a 30 s timeout so tokens never follow redirects.
  - `graphPageUrl(value)` for Meta Graph pagination, rejecting any other origin.
  - Retries with backoff are shared by the same module (429/5xx/network errors only, 4xx never retried).
- Domain and validation errors are thrown as `new Error("<mensagem em português>")` in `src/lib/` and `api/_lib/` (72 occurrences in `src/lib`). Messages are user-facing Portuguese.
- Data-quality decisions are recorded as data, not thrown: e.g. negative values become `null` and are counted in `negativosAnulados` (`api/_lib/ads-planilha-sync.ts`). Prefer explicit `null` ("sem dado") over `0`.

## Logging

**Framework:** `console` only. No logging library is in `package.json`.

**Patterns:**
- Server observability goes through `withApiObservability(handler, endpoint, log = console.info)` in `api/_lib/observability.ts`. Add new endpoints there rather than hand-rolling timing logs.
- Client code uses `console.*` sparingly (3 call sites in `src/`).
- Never log tokens, passwords, or PII. `api/_lib/mascarar-pii.ts` exists to mask personal data before it reaches logs or AI prompts; use it for any patient or contact text that gets logged.

## Comments

**When to Comment:**
- Comments are written in Portuguese, and explain the business rule or the reason for a non-obvious decision, often with the date or the incident that caused it. Example from `api/_lib/ads-planilha-sync.ts`: the header block lists each cleaning rule with the real-world case it came from.
- Do not restate what the code does. Do state why a limit, sentinel or fallback exists (`SEM_DATA = "2099-12-31"` is explained next to its definition).
- Keep comments short for inline use; use a block `/** ... */` above exported functions and interfaces.

**JSDoc/TSDoc:**
- `/** ... */` on exported helpers and interface fields when the contract is not obvious, e.g. `OpcoesRetry` in `api/_lib/integration-http.ts` documents `tentativas` default and meaning.
- `@param` tags are used selectively (`mensagemDeErro` in `src/lib/erro-amigavel.ts`). Types are not repeated in JSDoc, TypeScript carries them.

## Function Design

**Size:** Pure business logic lives in `src/lib/*.ts` as small exported functions with explicit inputs and outputs, so that `scripts/test-*.ts` can call them directly without a browser. Data-fetching and orchestration live in `api/_lib/*.ts` and `src/hooks/*.ts`. Large files exist (e.g. `api/_lib/agentes.ts`, `api/_lib/ads-planilha-sync.ts`), so prefer adding a new focused module over growing a large one.

**Parameters:**
- Use a single options object for functions with more than 2–3 parameters: `avaliarKpi({ kpi, baseline, meta, atual, amostra, verbaEmDia })`, `avaliarGarantia({ plano, atual, consultaPaga, verbaEmDia, score })`, `createAuthSessionController({ fetchIsAdmin, clearCache, publish })`.
- Injected dependencies are passed as parameters (`fetchIsAdmin`, `clearCache`, `publish`) to keep side effects testable.
- Supabase clients are passed as arguments (`admin: Admin`, `(admin: SupabaseClient)`), not created inside helpers.

**Return Values:**
- Return typed objects with explicit status fields, not booleans: `{ resultado: "melhorou" | "nao_melhorou" | "nao_avaliavel" | "sem_baseline" }`.
- Use `null` for "no data" and `undefined` only for optional parameters.

## Module Design

**Exports:**
- Named exports only. No default exports in `src/` components or lib modules. (`api/` handlers use `export default` for the Vercel function entry.)
- Constants and their types are exported together (`AGENTES` and `AgenteCatalogo` in `src/lib/agentes-catalogo.ts`).

**Barrel Files:**
- Not used. Import from the specific file path (`@/lib/date-range`, not an index).

**React specifics:**
- Route components: `createFileRoute("/_authenticated/$clientId/...")` in files under `src/routes/`; the route file default-exports via TanStack conventions.
- Data fetching: `useQuery` from `@tanstack/react-query` in 113 files, typically wrapped in a `src/hooks/use-*.ts` file (`useResultado`, `usePacientesPeriodo`). Put new fetch logic in a hook, not inline in the route.
- Styling: Tailwind CSS 4 utility classes inline, with per-screen stylesheets for legacy areas (`src/nexo.css`, `src/landing.css`, `src/sap-workspace.css`, `src/styles.css`). Use the `min-[821px]:` breakpoint pattern already present for the desktop/mobile split. Touch targets are sized to 44 px on mobile (`min-h-[44px]`).
- Charts: `recharts`. Icons: `lucide-react`. Class merging: `clsx` and `tailwind-merge`.

## Examples to Copy

**Pure rule with injected inputs (`src/lib/*`):**

```ts
export function avaliarKpi({ kpi, baseline, meta, atual, amostra, verbaEmDia }: { ... }) {
  // returns { resultado: "melhorou" | "nao_melhorou" | "nao_avaliavel" | "sem_baseline" }
}
```

**API handler skeleton (`api/<dominio>/<endpoint>.ts`):**

```ts
import { withApiObservability } from "../_lib/observability.js";
import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { someSchema } from "../_lib/request-validation.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const parsed = someSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "..." }); return; }
  // ...
}

export default withApiObservability(handler, "endpoint-name");
```

**Hook (`src/hooks/use-*.ts`):** export a named `use<Thing>` function that owns the `useQuery` call, and keep the route file free of query keys and fetch code.

---

*Convention analysis: 2026-11-06*
