import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { CID, SID, mockAccount } from "./fixtures";

const date = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const now = `${date}T12:00:00Z`;
for (const width of [375, 1440]) for (const product of ["hub", "sap"] as const) {
  test(`${product} clinic sees numbers, at most three next steps and their delivery at ${width}px`, async ({ page, context }, info) => {
    await mockAccount(context, "viewer");
    const writes: string[] = [];
    await context.route("**/rest/v1/**", async route => {
      const req = route.request(), u = new URL(req.url());
      if (!["HEAD", "GET"].includes(req.method()) && !u.pathname.includes("/rpc/")) writes.push(u.pathname);
      if (u.pathname.endsWith("/sap_clinicas")) return route.fulfill({ json: (req.headers().accept ?? "").includes("vnd.pgrst.object") ? { id: SID, client_id: CID, nome: "Clínica fictícia", d0: date, status: "rodando", consulta_paga: true, sap_pausas: [] } : [{ id: SID, client_id: CID, nome: "Clínica fictícia", d0: date, status: "rodando", sap_pausas: [] }] });
      if (u.pathname.endsWith("/sugestoes_agentes") || u.pathname.endsWith("/campanhas_ideias")) {
        if (req.method() === "HEAD") return route.fulfill({ headers: { "content-range": "*/2", "access-control-expose-headers": "content-range" } });
        if (u.searchParams.get("select") === "criado_em") return route.fulfill({ json: { criado_em: now } });
        return route.fulfill({ json: [] });
      }
      return route.fallback();
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(product === "hub" ? `/${CID}?preset=7d` : `/sap/${CID}/painel`);
    const summary = page.getByRole("region", { name: "Entregas e próximos passos", exact: true });
    await expect(summary.getByRole("heading", { name: "Próximos passos", exact: true })).toBeVisible();
    await expect(summary.locator(".service-followup-grid > div").first().getByRole("listitem")).toHaveCount(3);
    await expect(summary.getByText(/Responsável pelo próximo passo:/)).toHaveCount(3);
    const href = await summary.getByRole("link", { name: "Ver entrega", exact: true }).first().getAttribute("href");
    expect(href).toContain(`${CID}/agentes`); expect(href).toContain("agente=conteudo");
    if (product === "hub") {
      await expect(page.getByRole("navigation", { name: width === 375 ? "Áreas" : "Áreas do Nexo", exact: true }).getByRole("link")).toHaveCount(3);
      const numbers = page.getByRole("region", { name: "Retorno do investimento", exact: true });
      expect(await numbers.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-label="Entregas e próximos passos"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    } else {
      if (width === 375) await page.getByRole("button", { name: "Abrir o menu", exact: true }).click();
      const nav = page.getByRole("navigation", { name: "Áreas do SAP", exact: true });
      await expect(nav.getByRole("link")).toHaveCount(3);
      if (width === 375) await page.keyboard.press("Escape");
    }
    const audit = await new AxeBuilder({ page }).include(".service-followup").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audit.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await mkdir(info.outputDir, { recursive: true });
    await page.screenshot({ path: info.outputPath(`clinica-${product}-${width}.png`), fullPage: true });
    await summary.getByRole("link", { name: "Ver entrega", exact: true }).first().click();
    await expect(page).toHaveURL(/agente=conteudo/);
    await expect(page.getByRole("region", { name: "Área de revisão das entregas" })).toBeVisible();
    expect(writes).toEqual([]);
  });
}

test("one unavailable delivery stays unknown, preserves other fronts, and retries", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let fail = true;
  await context.route("**/rest/v1/sugestoes_agentes?**", async route => {
    if (route.request().method() !== "HEAD") return route.fallback();
    if (fail) return route.fulfill({ status: 503, json: { message: "fictional unavailable source" } });
    return route.fulfill({ headers: { "content-range": "*/1", "access-control-expose-headers": "content-range" } });
  });
  await page.goto(`/${CID}`);
  const summary = page.getByRole("region", { name: "Entregas e próximos passos", exact: true });
  await expect(summary.getByRole("alert")).toContainText("fila pode estar incompleta");
  await expect(summary.getByText(/Nenhum material pendente/)).toHaveCount(0);
  fail = false;
  await summary.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(summary.getByRole("alert")).toHaveCount(0);
  await expect(summary.getByText(/material disponível para revisão/)).toHaveCount(3);
});

for (const source of ["instagram", "anuncios", "crm", "atendimento", "todas"] as const) for (const period of ["7d", "30d"] as const) {
  test(`report downloads a PDF with ${source} sources and ${period}, without external writes`, async ({ page, context }, info) => {
    await mockAccount(context, "viewer");
    const f = { tem_instagram: source === "instagram" || source === "todas", tem_anuncios: source === "anuncios" || source === "todas", tem_crm: source === "crm" || source === "todas", tem_atendimento: source === "atendimento" || source === "todas" };
    const requests: string[] = [];
    await context.route("**/rest/v1/**", async route => {
      const req = route.request(), u = new URL(req.url()), path = u.pathname;
      requests.push(`${req.method()} ${path}`);
      if (path.endsWith("/rpc/client_fontes")) return route.fulfill({ json: [f] });
      if (path.endsWith("/instagram_account_daily_metrics")) {
        const offset = Number(u.searchParams.get("offset") ?? req.headers().range?.split("-")[0] ?? 0);
        return route.fulfill({ json: offset ? [] : [{ date, reach: 1000, new_followers: 20, unfollowers: 2, total_interactions: 100, saves: 10, profile_links_taps: 5, followers_count: 1000 }] });
      }
      if (path.endsWith("/meta_ads_daily")) return route.fulfill({ json: [{ date, campaign_id: "fixture", spend: 100, impressions: 5000, link_clicks: 90, conversations: 10, leads: 0, landing_page_views: 0, reach: 4000, clicks: 100 }] });
      if (path.endsWith("/meta_ads_campaigns")) return route.fulfill({ json: [{ campaign_id: "fixture", name: "Campanha fictícia QA", objective: "OUTCOME_ENGAGEMENT" }] });
      if (path.endsWith("/rpc/crm_leads_resumo_periodo")) return route.fulfill({ json: [{ novos: 20, ganhos: 4, perdidos: 2, valor: 12000 }] });
      if (path.endsWith("/rpc/crm_leads_por_dia_periodo")) return route.fulfill({ json: [{ dia: date, total: 20 }] });
      if (path.endsWith("/rpc/wts_resumo")) return route.fulfill({ json: [{ atendimentos: 30, agentes: 2, contatos: 25, mensagens: 120, abertos: 5, fechados: 25, tempo_medio_atendimento_min: 8, tempo_medio_espera_min: 3 }] });
      if (path.endsWith("/rpc/wts_volume_diario")) return route.fulfill({ json: [{ dia: date, atendimentos: 30 }] });
      return route.fallback();
    });
    await page.goto(`/${CID}/relatorio?preset=${period}`);
    await expect(page.getByRole("tab", { name: "PDF", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "PDF", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar PDF detalhado", exact: true }).click();
    const file = await download;
    const path = info.outputPath(`relatorio-${source}-${period}.pdf`);
    await mkdir(info.outputDir, { recursive: true }); await file.saveAs(path);
    const bytes = await readFile(path); expect(bytes.subarray(0, 5).toString()).toBe("%PDF-"); expect(bytes.length).toBeGreaterThan(4000);
    expect(requests.filter(r => !r.startsWith("GET ") && !r.startsWith("HEAD ") && !r.includes("/rpc/"))).toEqual([]);
    await expect(page.getByRole("button", { name: "Baixar PDF detalhado", exact: true })).toBeEnabled();
  });
}

test("a clinic's first SAP visit puts results before the optional tour", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/sap_clinicas?**", r => r.fulfill({ json: (r.request().headers().accept ?? "").includes("vnd.pgrst.object") ? { id: SID, client_id: CID, d0: date, nome: "QA fictício", status: "rodando", sap_pausas: [] } : [{ id: SID, client_id: CID, d0: date, nome: "QA fictício", status: "rodando", sap_pausas: [] }] }));
  await context.route("**/rest/v1/sap_usuario_pref?**", r => r.fulfill({ json: { tour_visto_em: null } }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/sap/${CID}/painel`);
  await expect(page.getByRole("region", { name: "Primeiro acesso", exact: true })).toHaveCount(0);
  const intro = page.getByRole("button", { name: "Primeiro acesso? Conheça seu programa (2 min)", exact: true });
  await expect(intro).toBeVisible();
  await intro.click();
  await expect(page.getByRole("region", { name: "Primeiro acesso", exact: true })).toBeVisible();
});
