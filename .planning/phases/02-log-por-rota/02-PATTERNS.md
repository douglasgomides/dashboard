# Phase 2: Log por rota - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 16
**Analogs found:** 15 / 16

Todos os analogs abaixo sao arquivos rastreados pelo git (nao ha espelhos gitignored envolvidos).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/lib/rota-log.ts` (novo, puro) | utility | transform | `src/lib/deploy-recovery.ts` | role-match (injecao de dependencias, testavel em tsx) |
| `src/lib/rota-log-instalar.ts` (novo, efeitos) | utility | event-driven | `src/main.tsx:21-24` + `src/hooks/use-client-role.ts` (supabase) | partial |
| `src/main.tsx` (mod) | config/bootstrap | event-driven | proprio arquivo, linhas 21-24 e 47-54 | exact |
| `src/router.tsx` | config | - | sem mudanca prevista (so `getRouter()`); conferir se precisa exportar router | - |
| `src/components/app-shell.tsx` (mod: `data-origem`) | component | request-response | proprio arquivo, linhas 349, 530, 572, 658 | exact |
| `src/routes/_authenticated.admin.tsx` (mod: guarda) | route/guard | request-response | `_authenticated.sap.tsx:23-38` (ja recebe `{ location }`) | exact |
| `src/routes/_authenticated.sap.tsx` (mod: guarda) | route/guard | request-response | proprio arquivo | exact |
| `src/routes/_authenticated.admin.conferencia.tsx` (mod: tablist) | component | CRUD (leitura) | proprio arquivo (`ConferenciaPage`, linha 211) | exact |
| `src/components/uso-das-telas.tsx` (novo) | component | request-response | `src/routes/_authenticated.admin.conferencia.tsx` (`useQuery` linha 213) + `src/hooks/use-client-role.ts` | role-match |
| `supabase/migrations/20261109120000_rota_acessos.sql` (novo) | migration | CRUD + batch (cron) | `20261106130000_resultados_diarios.sql` + `20261105120000_resultado_pronto.sql:174-184` | exact |
| `supabase/migrations/20261106130000_resultados_diarios.sql` (mod: guarda do cron, linhas 88-89) | migration | batch | `20261105120000_resultado_pronto.sql:174-184` | exact |
| `scripts/test-rota-log.ts` (novo) | test | transform | `scripts/test-*.ts` (ex.: `scripts/test-agente-acessos.ts`), `node:assert/strict` + tsx | role-match |
| `scripts/test-db-security.ts` (mod: novos `check`) | test | CRUD | proprio arquivo, linhas 1-40 e 118-139 | exact |
| `scripts/test-migrations.ts` (mod, se precisar) | test | batch | proprio arquivo, linhas 1-30 | exact |
| `tests/e2e/rota-log.spec.ts` (novo) | test | request-response | `tests/e2e/auth-profile.spec.ts` + `tests/e2e/fixtures.ts` | role-match |

## Pattern Assignments

### `supabase/migrations/20261106130000_resultados_diarios.sql` (Wave 0, primeiro commit)

Linhas 87-89 hoje, sem guarda (quebram no PGlite):
```sql
select cron.unschedule(jobid) from cron.job where jobname = 'resultados-diarios';
select cron.schedule('resultados-diarios', '30 6 * * *', $$select public.resultados_gravar_dia((now() at time zone 'America/Sao_Paulo')::date - 1)$$);
```
Substituir pelo bloco guardado de `20261105120000_resultado_pronto.sql:174-184` (copiar a forma, trocar jobname/schedule/comando):
```sql
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'resultado-pronto';
    perform cron.schedule('resultado-pronto', '*/10 * * * *', 'select public.resultado_pronto_aquecer()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;
```
Usar `$cron$` externo e o comando em string com `$q$...$q$` ou aspas dobradas para o `$$` interno do resultados_diarios.

### `supabase/migrations/20261109120000_rota_acessos.sql` (migration, CRUD + cron)

**Analog:** `20261106130000_resultados_diarios.sql`

Cabecalho/reversao em comentario (linhas 1-7), `create table if not exists`, `comment on table` (linha 22), e bloco RLS (linhas 23-30):
```sql
alter table public.resultados_diarios enable row level security;
revoke all on table public.resultados_diarios from public, anon;
grant select on table public.resultados_diarios to authenticated;
grant all on table public.resultados_diarios to service_role;
drop policy if exists "resultados diarios: admin ou membro le" on public.resultados_diarios;
create policy "resultados diarios: admin ou membro le" on public.resultados_diarios for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
```
Funcao de manutencao so para service_role (linhas 57-58 e 90-91 do mesmo arquivo):
```sql
revoke all on function public.resultados_preencher(date, date) from public, anon, authenticated;
grant execute on function public.resultados_preencher(date, date) to service_role;
```
Cron: bloco guardado acima. Tabela, trigger `rota_acessos_preencher`, RPC `rota_acessos_resumo` e `rota_acessos_limpar` (security definer com `set search_path = public, pg_temp`): usar o SQL do 02-RESEARCH.md (linhas 270-352). Nome do arquivo precisa casar `^[0-9]+_[a-z0-9_]+\.sql$`; maior existente e `20261106130000`.

### `scripts/test-db-security.ts` (test, CRUD)

Seed de usuarios: `const A = id(1), B = id(2), editor = id(3), viewer = id(4), outsider = id(5), admin = id(6);` (linha 17). Helpers a reutilizar (linhas 24-39):
```ts
async function check(name: string, run: () => Promise<void>) { try { await run(); checks++; } catch (cause) { throw new Error(name, { cause }); } }
async function role<T>(name: "anon" | "authenticated" | "service_role", user: string | null, run: () => Promise<T>): Promise<T> { /* set_config request.jwt.claims + set local role */ }
const rows = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
const denied = (run: () => Promise<unknown>, code = "42501") => assert.rejects(run, (err: unknown) => !!err && typeof err === "object" && "code" in err && err.code === code);
```
Padrao de caso novo (linhas 140-142):
```ts
await check("anon não lê view nem executa RPC", async () => {
  await denied(() => role("anon", null, () => rows("select * from meta_ads_daily_v")));
});
```
Os checks globais (linhas ~118-139: RLS em toda tabela, anon sem privilegio, SECURITY DEFINER com search_path) cobrem a tabela nova sem edicao. Adicionar checks proprios: viewer insere com `user_id` proprio; admin sem `client_members` insere; viewer com `client_id` de outra clinica e negado (`denied`); nao-admin le 0 linhas; `rota='/x?y'` rejeitado por CHECK (codigo `23514`); `eh_equipe` forcado pelo trigger.

### `scripts/test-migrations.ts`

Apenas executa todas as migrations em ordem (linhas 9-26); falha em HEAD por causa do cron (Pitfall 1). Nao precisa edicao se a guarda for corrigida; opcionalmente adicionar asserts de existencia de `public.rota_acessos`.

### `src/main.tsx` (instalacao do gancho)

Precedente de `sessionStorage` injetavel (linhas 21-24):
```ts
const recoverDeploy = createDeployRecovery({ getItem: (key) => sessionStorage.getItem(key), setItem: (key, value) => sessionStorage.setItem(key, value) });
window.addEventListener("vite:preloadError", (evento) => { /* ... */ });
```
Ponto de insercao (linhas 47-54), logo depois de `getRouter()` e antes de `createRoot(...).render`:
```ts
} else {
  const router = getRouter();
  // <- instalarRotaLog(router) aqui, fora do React
  createRoot(rootEl).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
}
```
Imports ao topo seguem o estilo relativo de `main.tsx` (`./lib/...`), enquanto o resto do app usa alias `@/`.

### `src/lib/rota-log.ts` (utility puro) e `src/lib/rota-log-instalar.ts`

**Analog:** `src/lib/deploy-recovery.ts` (linhas 1-12): funcao fabrica com dependencias injetadas (`storage`, `now = Date.now`), `try/catch` que degrada em silencio:
```ts
export function createDeployRecovery(storage: Pick<Storage, "getItem" | "setItem">, now = Date.now) {
  let attempted = false;
  return () => { if (attempted) return false; attempted = true; try { /* ... */ } catch { /* ... */ } };
}
```
Seguir: `rota-log.ts` sem imports de supabase/React (testavel por tsx); `deduplicar` com `now` injetavel. Assinaturas completas em 02-RESEARCH.md linhas 354-385. Insert via `(supabase as any).from("rota_acessos").insert(linha)` (import `supabase` de `@/integrations/supabase/client`), sem `.select()`, em `setTimeout(0)` com `.catch(() => {})`.

### `src/components/app-shell.tsx` (data-origem)

Quatro pontos exatos (verificados):
- linha 349: `<aside aria-label="Menu principal">` adicionar `data-origem="menu"`
- linha 530: `<nav className="bottomnav" aria-label="Áreas">` adicionar `data-origem="menu"`
- linha 572: `titulo="Navegar no Nexo"` (BottomSheet): envolver o filho em `<div data-origem="menu">`
- linha 658: `aria-label="Resultados da busca"` (nav) adicionar `data-origem="busca"`
Nao mexer em `TabLink` (linhas 65-109).

### `src/routes/_authenticated.admin.tsx` e `_authenticated.sap.tsx` (guardas)

Admin hoje (linhas 12-15):
```ts
beforeLoad: async () => {
  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  if (!isAdmin) throw redirect({ to: "/" });
},
```
Mudar para `async ({ location }) =>` e chamar `registrarBloqueada(location.pathname)` antes do `throw`. Analog da assinatura: SAP (linha 23) `beforeLoad: async ({ location }) => {`, com os dois pontos de negacao nas linhas 37-38:
```ts
if (destino) throw redirect({ to: "/$clientId/pacientes", params: { clientId: destino } });
throw redirect({ to: "/sem-acesso" });
```
Chamar `registrarBloqueada(location.pathname)` antes de cada `throw`. `registrarBloqueada` nao pode lancar nem aguardar (try/catch interno). Tambem `data-origem="menu"` em `admin.tsx:71` (`<aside aria-label="Menu do admin">`) e `sap.tsx:122` (`<aside ref={menuRef} ... aria-label="Menu do Sistema de Aquisição">`).

### `src/routes/_authenticated.admin.conferencia.tsx`

`component: ConferenciaPage` (linha 31), `function ConferenciaPage()` (linha 211), `useQuery({ queryKey: ["conferencia-ultima"], queryFn: ultimaConferencia, staleTime: 60_000 })` (linha 213). Edicao minima: renomear a funcao existente para `ConferenciaDados`, criar novo `ConferenciaPage` (~20 linhas) com tablist e renderizar `<ConferenciaDados />` ou `<UsoDasTelas />`. Phase 1 mexe no mesmo arquivo; nao tocar no corpo.

### `src/components/uso-das-telas.tsx` (component, leitura)

**Analog:** `src/hooks/use-client-role.ts:11-22`
```ts
const q = useQuery({
  queryKey: ["papel", clientId, user?.id],
  staleTime: 10 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from("client_members").select("role")...;
    if (error) return null;
    ...
  },
});
```
Imports: `useQuery` de `@tanstack/react-query`, `supabase` de `@/integrations/supabase/client`. Usar `(supabase as any).rpc("rota_acessos_resumo", { p_dias, p_equipe, p_incluir_teste })` (tabela fora de `types.ts`). Erro de objeto inexistente (`42P01`, `42883`, `PGRST202`, `PGRST205`) mostra "A tabela do registro ainda não foi criada". Lista de rotas: `Object.values(router.routesById).filter(r => !r.children?.length && rotaRegistravel(r.id))` (esperado 80 + `/sem-acesso`). Tabela simples, sem grafico, texto sem conclusao (D-12, D-13).

### `tests/e2e/rota-log.spec.ts`

**Analog:** `tests/e2e/auth-profile.spec.ts` (linhas 1-16): imports e padrao `mockAccount` + `page.on("request")`:
```ts
import { test, expect } from "@playwright/test";
import { CID, client, mockAccount } from "./fixtures";
test("...", async ({ page, context }) => {
  await mockAccount(context, "anonymous");
  page.on("request", (request) => { /* captura */ });
  await page.goto(`/login?${search}`);
```
`mockAccount(context, "admin" | "viewer" | "anonymous")` (fixtures.ts:6) intercepta `http://localhost:9/**` (Supabase falso) e devolve `[]` com 200 para `/rest/v1/*` desconhecido; todo o resto e abortado por `context.route("**/*")` (fixtures.ts:18-22). Ligar o log com `context.addInitScript(() => localStorage.setItem("nexo:rota-log","1"))` apenas neste spec. Capturar POST a `/rest/v1/rota_acessos`, conferir `postDataJSON()` sem `?`/`#`/`http` e cabecalho `prefer` sem `return=representation`.

### `scripts/test-rota-log.ts`

Padrao dos `scripts/test-*.ts`: `import assert from "node:assert/strict"`, importar o modulo puro por caminho relativo, rodar com `npx tsx`; descoberto automaticamente por `scripts/run-tests.mjs`. Incluir teste que confere cada id de `ROTAS_SO_REDIRECIONAM` em `src/routeTree.gen.ts`.

## Shared Patterns

### RLS / privilegios de tabela nova
**Source:** `20261106130000_resultados_diarios.sql:23-30` (acima). Aplicar em `rota_acessos` e nas funcoes novas (`revoke ... from public, anon`).

### Cron guardado
**Source:** `20261105120000_resultado_pronto.sql:174-184`. Aplicar em `rota_acessos_limpeza` e na correcao de `resultados_diarios`.

### Degradar em silencio
**Source:** `src/lib/deploy-recovery.ts` (try/catch sem propagar) e `src/hooks/use-client-role.ts:18` (`if (error) return null`). Aplicar ao gancho: nunca lancar, nunca `await` no caminho de navegacao.

### Cliente supabase sem tipos
`(supabase as any).from(...)` para tabelas fora de `src/integrations/supabase/types.ts`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/lib/rota-log-instalar.ts` (parte `router.subscribe`/`history.subscribe`/listener de clique) | utility | event-driven | Nenhum uso de `router.subscribe` no repo; usar o exemplo provado em 02-RESEARCH.md (Pattern 1, linhas 369-385) |

## Metadata

**Analog search scope:** `src/main.tsx`, `src/lib`, `src/hooks`, `src/components/app-shell.tsx`, `src/routes/_authenticated.{admin,sap,admin.conferencia}.tsx`, `supabase/migrations`, `scripts`, `tests/e2e`
**Pattern extraction date:** 2026-11-09
