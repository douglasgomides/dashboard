import { test, expect } from "@playwright/test";
import { CID, SID, mockAccount } from "./fixtures";

test("tracked links retain custom slugs, both period limits and explicit mutation failures", async ({ page, context }) => {
  await mockAccount(context, "admin");
  let slug = "qa-original", failed = true;
  const bodies: Record<string, unknown>[] = [], periods: Record<string, unknown>[] = [];
  await context.route("**/rest/v1/links_rastreados?**", route => {
    const u = new URL(route.request().url());
    return route.fulfill({ json: Number(u.searchParams.get("offset") ?? 0) ? [] : [{ id: SID, slug, tipo: "bio", titulo: "Link fictício", destino_tipo: "site", ativo: true, criado_em: "2026-10-01T12:00:00Z", codigo_ref: "QA" }] });
  });
  await context.route("**/rest/v1/rpc/links_funil?**", route => {
    periods.push(route.request().postDataJSON());
    return route.fulfill({ json: Number(new URL(route.request().url()).searchParams.get("offset") ?? 0) ? [] : [{ link_id: SID, cliques: 10, conversas: 2, provaveis: 0, agendou: 1, vendas: 1, receita: 100 }] });
  });
  await context.route("**/api/sync/manual", route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (failed) return route.fulfill({ status: 503, json: { error: "Falha fictícia ao salvar" } });
    slug = body.slug ?? slug; return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/${CID}/links?preset=personalizado&from=2026-10-01&to=2026-10-07`);
  await expect(page.getByRole("heading", { name: "Link fictício", exact: true })).toBeVisible();
  expect(periods[0]).toMatchObject({ p_client_id: CID, p_desde: "2026-10-01T00:00:00-03:00", p_antes_de: "2026-10-08T00:00:00-03:00" });
  await page.getByRole("button", { name: "Editar final do link", exact: true }).click();
  await page.getByRole("textbox", { name: "Novo final do link", exact: true }).fill("qa-atualizado");
  await page.getByRole("button", { name: "Salvar final do link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Falha fictícia ao salvar");
  await expect(page.getByRole("textbox", { name: "Novo final do link", exact: true })).toHaveValue("qa-atualizado");
  failed = false;
  await page.getByRole("button", { name: "Salvar final do link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Alteração salva");
  expect(bodies.at(-1)).toMatchObject({ alvo: "link_rastreado", client_id: CID, acao: "renomear", id: SID, slug: "qa-atualizado" });
  await expect(page.locator("article code")).toContainText("qa-atualizado");
  await page.screenshot({ path: test.info().outputPath("auditoria-links-atualizado.png"), fullPage: false });
  failed = true;
  await page.getByRole("button", { name: "Arquivar (o link continua funcionando)", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Falha fictícia ao salvar");
  await expect(page.getByRole("heading", { name: "Link fictício", exact: true })).toBeVisible();
});

test("a failed links funnel stays unavailable and retries instead of showing zero", async ({ page, context }) => {
  await mockAccount(context, "admin"); let fail = true;
  await context.route("**/rest/v1/rpc/links_funil?**", route => route.fulfill(fail ? { status: 503, json: { message: "unavailable" } } : { json: [] }));
  await page.goto(`/${CID}/links`);
  await expect(page.getByRole("alert")).toContainText("Nenhum resultado foi considerado zero");
  await expect(page.getByText("Nenhum link ainda.", { exact: false })).not.toBeVisible();
  fail = false; await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByText("Nenhum link ainda.", { exact: false })).toBeVisible();
});

test("SAP protects a failed access checklist from empty-state edits and recovers", async ({ page, context }) => {
  await mockAccount(context, "admin"); let fail = true, writes = 0;
  await context.route("**/rest/v1/sap_acessos?**", route => route.fulfill(fail ? { status: 503, json: { message: "fictitious read failure" } } : { json: [] }));
  await context.route("**/rest/v1/rpc/sap_salvar_acesso", route => { writes++; return route.fulfill({ json: true }); });
  await page.goto(`/sap/${CID}/onboarding`);
  await expect(page.getByRole("alert")).toContainText("Nenhum item foi considerado vazio ou pendente");
  await expect(page.getByRole("combobox", { name: "Status do item A1", exact: true })).not.toBeVisible();
  expect(writes).toBe(0);
  fail = false;
  await page.getByRole("button", { name: "Tentar carregar os dados novamente", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Status do item A1", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("auditoria-sap-recuperado.png"), fullPage: false });
});

test("failed opportunity history blocks edits and does not invent an empty history", async ({ page, context }) => {
  await mockAccount(context, "admin"); let fail = true;
  await context.route("**/rest/v1/acoes_acompanhamento?**", route => route.fulfill(fail ? { status: 503, json: { message: "fictitious history failure", code: "42501" } } : { json: [] }));
  await page.goto(`/${CID}/oportunidades`);
  await expect(page.getByRole("alert")).toContainText("O acompanhamento não carregou");
  await expect(page.getByRole("tablist", { name: "Filtrar oportunidades", exact: true })).not.toBeVisible();
  fail = false; await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Filtrar oportunidades", exact: true })).toBeVisible();
});

test("opportunities recover from a failed result source instead of an endless skeleton", async ({ page, context }) => {
  await mockAccount(context, "admin"); let fail = true;
  await context.route("**/rest/v1/instagram_account_daily_metrics?**", route => route.fulfill(fail ? { status: 503, json: { message: "fictitious unavailable metrics" } } : { json: [] }));
  await page.goto(`/${CID}/oportunidades`);
  await expect(page.getByRole("alert")).toContainText("As recomendações não puderam ser conferidas");
  fail = false; await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("tablist", { name: "Filtrar oportunidades", exact: true })).toBeVisible();
});

test("SAP session keeps a failed note draft and saves it on explicit retry", async ({ page, context }) => {
  await mockAccount(context, "admin");
  let fail = true, saved = "";
  await context.route("**/rest/v1/sap_sessao_registro?**", route => route.fulfill({ json: saved ? [{ chave: "responsavel_dia_a_dia", texto: saved, feito_em: null }] : [] }));
  await context.route("**/rest/v1/rpc/sap_salvar_sessao", async route => {
    if (fail) return route.fulfill({ status: 503, json: { message: "fictitious save failure" } });
    saved = route.request().postDataJSON().p_texto; return route.fulfill({ json: null });
  });
  await page.goto(`/sap/${CID}/sessao?s=K`);
  await page.getByRole("button", { name: /Bloco 5 ·/ }).click();
  const note = page.getByRole("textbox", { name: "Responsável do dia a dia na clínica (nome e função)", exact: true });
  await note.fill("Responsável fictício de QA");
  await note.press("Tab");
  await expect(page.getByRole("button", { name: "Tentar salvar esta nota", exact: true })).toBeVisible();
  await expect(note).toHaveValue("Responsável fictício de QA");
  fail = false; await page.getByRole("button", { name: "Tentar salvar esta nota", exact: true }).click();
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: /Bloco 5 ·/ }).click();
  await expect(note).toHaveValue("Responsável fictício de QA");
});
