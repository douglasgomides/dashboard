import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("./creative-fixture.json", import.meta.url), "utf8")) as typeof import("./creative-fixture.json");

// Todos os provedores e a persistência deste percurso são fictícios. Nenhuma publicação ou conta real é usada.
test("isolated creative flow: queue, partial analysis, adaptation, image approval, planner and reload", async ({ page, context }) => {
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
    return route.fulfill({ json: { ok: true, geradas: 1, erros: [], artes: art ? [{ id: post, position: 1, status: approved ? "aprovada" : "rascunho", criado_em: new Date().toISOString(), url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1sAAAAASUVORK5CYII=" }] : [] } });
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Analisar mídia original", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ver análise/ })).toBeVisible();
  expect(dispatches[0]).toMatchObject({ alvo: "creative_worker", job_id: fixture.analysis.job_id });
  await page.getByRole("button", { name: /Ver análise/ }).click();
  await expect(page.getByText("Fixture sintética; sem análise", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Adaptar esta estrutura", exact: true }).click();
  await page.getByRole("textbox", { name: "Novo tema", exact: true }).fill("QA fictício — organização de conteúdo");
  const create = page.getByRole("button", { name: "Criar proposta para revisão", exact: true });
  await expect(create).toBeDisabled();
  await page.getByRole("checkbox", { name: /Entendo que a análise de origem é parcial/ }).check();
  await create.click();
  await expect(page.getByRole("heading", { name: fixture.adaptation.document.title, exact: true })).toBeVisible();
  expect(dispatches[1]).toMatchObject({ alvo: "creative_worker", job_id: fixture.adaptation.job_id });
  const images = page.getByRole("region", { name: "Arte dos slides", exact: true });
  await images.getByRole("button", { name: "Gerar arte dos 1 slides", exact: true }).click();
  await expect(images.getByRole("img", { name: "Arte do slide 1", exact: true })).toBeVisible();
  await images.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(images.getByText("Slide 1 · aprovada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enviar como pauta", exact: true }).click();
  await expect(page.getByRole("button", { name: "Já está no planejador", exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
  await expect(page.getByRole("button", { name: "Já está no planejador", exact: true })).toBeDisabled();
  await expect(images.getByText("Slide 1 · aprovada", { exact: true })).toBeVisible();
  expect(jobs).toHaveLength(2); expect(planned && approved).toBe(true);
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

test("carousel resumes only missing slides in small batches and downloads the complete post", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const units = Array.from({ length: 14 }, (_, i) => ({ ...fixture.adaptation.document.units[0], position: i + 1 }));
  const adaptation = { ...fixture.adaptation, document: { ...fixture.adaptation.document, title: "QA pacote completo fictício", units } };
  const arts = new Set([1]);
  const batches: number[][] = [];
  let fail = true;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh1sAAAAASUVORK5CYII=";
  await context.route("**/rest/v1/**", async route => {
    const url = new URL(route.request().url()), name = url.pathname.split("/").at(-1);
    const rows: Record<string, unknown> = {
      instagram_accounts: [{ id: fixture.source.account_id, client_id: CID, active: true, ig_username: "qa_ficticia" }],
      instagram_posts: [], creative_sources: [fixture.source], creative_analyses: [fixture.analysis], creative_structures: [fixture.structure],
      creative_adaptations: [adaptation], creative_jobs: [],
      creative_worker_health: { seen_at: new Date().toISOString(), capabilities: { vision: true } },
    };
    if (name! in rows) return route.fulfill({ json: rows[name!] });
    return route.fallback();
  });
  await context.route("**/api/sync/manual", route => {
    const body = route.request().postDataJSON();
    if (body.acao === "gerar") {
      batches.push(body.slides);
      expect(body.slides.length).toBeLessThanOrEqual(4);
      expect(body.slides).not.toContain(1);
      for (const p of body.slides) if (!(fail && p === 3)) arts.add(p);
      if (fail) { fail = false; return route.fulfill({ json: { ok: true, geradas: 3, erros: ["Slide 3: indisponível no teste"] } }); }
      return route.fulfill({ json: { ok: true, geradas: body.slides.length, erros: [] } });
    }
    return route.fulfill({ json: { ok: true, artes: [...arts].map(position => ({ id: `qa-${position}`, position, status: "rascunho", criado_em: new Date().toISOString(), url: `data:image/png;base64,${png}` })) } });
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
  const panel = page.getByRole("region", { name: "Arte dos slides", exact: true });
  await expect(panel.getByRole("status").first()).toContainText("1 de 14 artes prontas");
  const download = panel.getByRole("button", { name: "Baixar post (artes + legenda)", exact: true });
  await expect(download).toBeDisabled();
  await panel.getByRole("button", { name: "Gerar 13 arte(s) que faltam", exact: true }).click();
  await expect(panel.getByRole("status").first()).toContainText("4 de 14 artes prontas");
  await expect(panel.getByText(/indisponível no teste/)).toBeVisible();
  await panel.getByRole("button", { name: "Gerar 10 arte(s) que faltam", exact: true }).click();
  await expect(panel.getByRole("status").first()).toContainText("14 de 14 artes prontas");
  expect(batches).toEqual([[2, 3, 4, 5], [3, 6, 7, 8], [9, 10, 11, 12], [13, 14]]);
  await expect(download).toBeEnabled();
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("post-adaptado.zip");
  const { readFile } = await import("node:fs/promises");
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(await readFile((await file.path())!));
  expect(Object.keys(files).filter(n => n.endsWith(".png"))).toHaveLength(14);
  expect(strFromU8(files["legenda.txt"])).toContain(adaptation.document.caption);
  expect(strFromU8(files["revisao.txt"])).toContain("Revise todas as artes");
  await page.reload();
  await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
  await expect(panel.getByRole("status").first()).toContainText("14 de 14 artes prontas");
});

test("queued adaptation shows its real state and opens the new result instead of the previously selected one", async ({ page, context }) => {
  await mockAccount(context, "admin");
  let queued = false, complete = false;
  const previous = { ...fixture.adaptation, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", document: { ...fixture.adaptation.document, title: "Proposta anterior fictícia" } };
  const latest = { ...fixture.adaptation, document: { ...fixture.adaptation.document, title: "Novo tema adaptado fictício" } };
  await context.route("**/rest/v1/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (name === "creative_enqueue") { queued = true; return route.fulfill({ json: latest.job_id }); }
    const rows: Record<string, unknown> = {
      instagram_accounts: [{ id: fixture.source.account_id, client_id: CID, active: true, ig_username: "qa_ficticia" }], instagram_posts: [],
      creative_sources: [fixture.source], creative_analyses: [fixture.analysis], creative_structures: [fixture.structure],
      creative_adaptations: complete ? [latest, previous] : [previous],
      creative_jobs: queued ? [{ id: latest.job_id, kind: "adapt", status: complete ? "completed" : "queued", progress: complete ? 100 : 0, message: complete ? "Concluído" : "Preparando adaptação", input: {}, output: complete ? { record_id: latest.id } : {}, budget_usd: 2, cost_usd: 0, reserved_usd: 0 }] : [],
      creative_worker_health: { seen_at: new Date().toISOString(), capabilities: { vision: true } },
    };
    if (name in rows) return route.fulfill({ json: rows[name] });
    return route.fallback();
  });
  await context.route("**/api/sync/manual", route => route.fulfill({ json: { ok: true, artes: [] } }));
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Biblioteca e adaptações", exact: true }).click();
  await page.getByRole("combobox", { name: "Adaptação para comparar", exact: true }).selectOption(previous.id);
  await page.getByRole("textbox", { name: "Novo tema", exact: true }).fill("Tema fictício de teste");
  await page.getByRole("checkbox", { name: /Entendo que a análise de origem é parcial/ }).check();
  await page.getByRole("button", { name: "Criar proposta para revisão", exact: true }).click();
  await expect(page.getByText("Adaptação · Aguardando início", { exact: true })).toBeVisible();
  await expect(page.getByText("Adaptação · 0%", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aguardando nova adaptação…", exact: true })).toBeDisabled();
  complete = true;
  await expect(page.getByRole("heading", { name: latest.document.title, exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Adaptação para comparar", exact: true })).toHaveValue(latest.id);
  await page.getByRole("heading", { name: "Laboratório de adaptação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir adaptação", exact: true })).toBeVisible();
});
