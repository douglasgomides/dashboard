import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("./creative-fixture.json", import.meta.url), "utf8")) as typeof import("./creative-fixture.json");

// Todos os provedores e a persistência deste percurso são fictícios. Nenhuma publicação ou conta real é usada.
test("isolated creative analysis remains available while content creation is paused", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const account = fixture.source.account_id, post = "55555555-5555-4555-8555-555555555555";
  const source = { ...fixture.source, post_id: post };
  let analysed = false, adapted = false, planned = false, art = false, approved = false;
  const jobs: { id: string; kind: string; status: string; progress: number; message: string; input: Record<string, any>; output: Record<string, any>; cost_usd: number; reserved_usd: number }[] = [];
  const dispatches: Record<string, any>[] = [];
  await context.route("**/rest/v1/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const reply = (value: unknown) => route.fulfill({ json: value });
    if (path.endsWith("/instagram_accounts")) return reply([{ id: account, client_id: CID, active: true, ig_username: "qa_ficticia" }]);
    if (path.endsWith("/instagram_posts")) {
      if (url.searchParams.get("select") === "caption") return reply({ caption: "Publicação fictícia de QA, não publicar" });
      const offset = Number(url.searchParams.get("offset") ?? req.headers().range?.split("-")[0] ?? 0);
      return reply(offset ? [] : [{ id: post, instagram_account_id: account, format: "carrossel", caption: "Publicação fictícia de QA", posted_at: new Date().toISOString(), reach: 1000, saved: 30, shares: 10, views: 1500 }]);
    }
    if (path.endsWith("/rpc/creative_worker_health")) return reply({ seen_at: "2020-01-01T00:00:00Z", capabilities: { vision: true, external_search: false } });
    if (path.endsWith("/rpc/creative_enqueue")) {
      const body = req.postDataJSON();
      expect(body.p_client_id).toBe(CID); expect(body.p_input.account_id).toBe(account);
      const id = body.p_kind === "analyse" ? fixture.analysis.job_id : fixture.adaptation.job_id;
      jobs.unshift({ id, kind: body.p_kind, input: body.p_input, output: {}, status: "queued", progress: 0, message: "Na fila fictícia", cost_usd: 0, reserved_usd: 0 });
      return reply(id);
    }
    if (path.endsWith("/creative_jobs")) {
      for (const j of jobs) if (j.status === "queued") {
        j.status = "completed"; j.progress = 100; j.message = "Concluído no transporte de teste";
        if (j.kind === "analyse") analysed = true; else adapted = true;
      }
      return reply(jobs);
    }
    if (path.endsWith("/creative_sources")) return reply(analysed ? [source] : []);
    if (path.endsWith("/creative_analyses")) return reply(analysed ? [fixture.analysis] : []);
    if (path.endsWith("/creative_structures")) return reply(analysed ? [fixture.structure] : []);
    if (path.endsWith("/creative_adaptations")) return reply(adapted ? [{ ...fixture.adaptation, pauta_id: planned ? post : null }] : []);
    if (path.endsWith("/rpc/creative_to_pauta")) { expect(req.postDataJSON()).toEqual({ p_client_id: CID, p_adaptation_id: fixture.adaptation.id }); planned = true; return reply(post); }
    return route.fallback();
  });
  await context.route("**/api/sync/manual", async route => {
    const body = route.request().postDataJSON(); expect(body.client_id).toBe(CID);
    if (body.alvo === "creative_worker") { dispatches.push(body); return route.fulfill({ json: { ok: true } }); }
    expect(body.alvo).toBe("creative_arte");
    if (body.acao === "gerar") art = true;
    if (body.acao === "revisar") { expect(body.status).toBe("aprovada"); approved = true; }
    return route.fulfill({ json: { ok: true, geradas: 1, erros: [], artes: art ? [{ id: post, position: 1, status: approved ? "aprovada" : "rascunho", criado_em: new Date().toISOString(), url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=" }] : [] } });
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Analisar mídia original", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ver análise/ })).toBeVisible();
  expect(dispatches[0]).toMatchObject({ alvo: "creative_worker", job_id: fixture.analysis.job_id });
  await page.getByRole("button", { name: /Ver análise/ }).click();
  await expect(page.getByText("Fixture sintética; sem análise", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adaptar esta estrutura", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Biblioteca e adaptações", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Radar de mercado", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Ver análise/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Biblioteca e adaptações", exact: true })).toHaveCount(0);
  expect(jobs).toHaveLength(1); expect(planned || art || approved || adapted).toBe(false);
});

test("a saved creative request stays visible when immediate dispatch fails", async ({ page, context }) => {
  await mockAccount(context, "admin");
  let queued = false;
  await context.route("**/rest/v1/instagram_accounts?**", r => r.fulfill({ json: [{ id: fixture.source.account_id, client_id: CID, active: true, ig_username: "qa_ficticia" }] }));
  await context.route("**/rest/v1/instagram_posts?**", r => {
    const u = new URL(r.request().url()), offset = Number(u.searchParams.get("offset") ?? r.request().headers().range?.split("-")[0] ?? 0);
    return r.fulfill({ json: offset ? [] : [{ id: "55555555-5555-4555-8555-555555555555", instagram_account_id: fixture.source.account_id, format: "carrossel", posted_at: new Date().toISOString(), reach: 1000, saved: 30, shares: 10, caption: "QA fictício" }] });
  });
  await context.route("**/rest/v1/rpc/creative_worker_health", r => r.fulfill({ json: { seen_at: new Date().toISOString(), capabilities: { vision: true } } }));
  await context.route("**/rest/v1/rpc/creative_enqueue", r => { queued = true; return r.fulfill({ json: fixture.analysis.job_id }); });
  await context.route("**/rest/v1/creative_jobs?**", r => r.fulfill({ json: queued ? [{ id: fixture.analysis.job_id, kind: "analyse", status: "queued", progress: 0, message: "Pedido fictício salvo", input: { post_id: "55555555-5555-4555-8555-555555555555" }, output: {}, budget_usd: 2, reserved_usd: 0, cost_usd: 0 }] : [] }));
  await context.route("**/api/sync/manual", r => r.fulfill({ json: { ok: false, erro: "sem_token", agendado: true } }));
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Analisar mídia original", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("O pedido foi salvo na fila");
  await expect(page.getByRole("status").filter({ hasText: "Pedido fictício salvo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeVisible();
  expect(queued).toBe(true);
});

// Existing proposals and cost history must not reopen the paused creation interface.
test("saved adaptations preserve read-only learning and costs without image creation shortcuts", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const writes: string[] = [];
  await context.route("**/rest/v1/**", async route => {
    const req = route.request(), name = new URL(req.url()).pathname.split("/").at(-1)!;
    if (req.method() !== "GET" && name.startsWith("creative_") && name !== "creative_worker_health") writes.push(name);
    const rows: Record<string, unknown> = {
      instagram_accounts: [{ id: fixture.source.account_id, client_id: CID, active: true, ig_username: "qa_ficticia" }], instagram_posts: [],
      creative_sources: [fixture.source], creative_analyses: [fixture.analysis], creative_structures: [fixture.structure],
      creative_adaptations: [fixture.adaptation],
      creative_jobs: [{ id: fixture.adaptation.job_id, kind: "adapt", status: "completed", progress: 100, message: "Proposta existente preservada", input: {}, output: { record_id: fixture.adaptation.id }, budget_usd: 2, cost_usd: 0.01, reserved_usd: 0 }],
      creative_worker_health: { seen_at: new Date().toISOString(), capabilities: { vision: true } },
    };
    if (name in rows) return route.fulfill({ json: rows[name] });
    return route.fallback();
  });
  const mediaRequests: unknown[] = [];
  await context.route("**/api/sync/manual", route => {
    mediaRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, artes: [] } });
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await expect(page.getByRole("button", { name: "Biblioteca e adaptações", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar proposta para revisão", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Aprendizado", exact: true }).click();
  await expect(page.getByRole("heading", { name: fixture.adaptation.document.title, exact: true })).toBeVisible();
  await expect(page.getByText("1. Criar a adaptação", { exact: true })).toHaveCount(0);
  await page.locator(".creative-jobs > summary").click();
  await expect(page.getByText("Proposta existente preservada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir adaptação", exact: true })).toHaveCount(0);
  await expect(page.getByText("Texto adaptado. Abra a proposta para gerar ou baixar as artes.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Arte dos slides", exact: true })).toHaveCount(0);
  expect(mediaRequests).toHaveLength(0); expect(writes).toHaveLength(0);
});
