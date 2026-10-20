import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

const roi = { tem_anuncios: true, tem_crm: true, investido: 6000, leads: 240, leads_com_origem: 240, ganhos: 30, ganhos_com_valor: 0, receita: 0, ganho_identificavel: true, crm_compartilhado: false };

for (const width of [375, 1440]) {
  test(`known numbers appear before recommendations even when ROI is incomplete at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await context.route("**/rest/v1/rpc/roi_periodo", r => r.fulfill({ json: roi }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}?preset=7d`);
    const results = page.getByRole("region", { name: "Retorno do investimento", exact: true });
    await expect(results.locator(".ws-metric-value")).toHaveText([/6.000,00/, "240", "30", "—"]);
    await expect(results.locator(".ws-metric-value").first()).toBeInViewport();
    const next = page.getByRole("region", { name: "Por onde começar", exact: true });
    expect(await results.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-label="Por onde começar"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(next).toBeVisible();
    await expect(results.getByRole("list")).toHaveCount(0);
    await results.locator("summary").click();
    await expect(results.getByRole("listitem")).toHaveCount(1);
    const link = results.getByRole("link", { name: /Ver como organizar o CRM/ });
    const target = new URL((await link.getAttribute("href"))!, "http://localhost");
    expect(target.pathname).toBe(`/${CID}/crm-guia`);
    expect(target.searchParams.get("preset")).toBe("personalizado");
    expect(target.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(target.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("missing or shared commercial sources do not become zero or another clinic's numbers", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let shared = false;
  await context.route("**/rest/v1/rpc/roi_periodo", r => r.fulfill({ json: shared ? { ...roi, crm_compartilhado: true } : { ...roi, tem_anuncios: false, tem_crm: false } }));
  await page.goto(`/${CID}`);
  const values = page.getByRole("region", { name: "Retorno do investimento", exact: true }).locator(".ws-metric-value");
  await expect(values).toHaveText(["—", "—", "—", "—"]);
  shared = true;
  await page.reload();
  await expect(values).toHaveText([/6.000,00/, "—", "—", "—"]);
});

test("a failed financial source offers a working retry instead of a blank result or a fabricated zero", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let fail = true;
  await context.route("**/rest/v1/rpc/roi_periodo", r => fail ? r.fulfill({ status: 503, json: { message: "fictional failure" } }) : r.fulfill({ json: roi }));
  await page.goto(`/${CID}`);
  const results = page.getByRole("region", { name: "Retorno do investimento", exact: true });
  await expect(results.getByRole("alert")).toBeVisible();
  await expect(results.locator(".ws-metric-value")).toHaveCount(0);
  fail = false;
  await results.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(results.locator(".ws-metric-value")).toHaveText([/6.000,00/, "240", "30", "—"]);
});

test("SAP clinic selection opens results while explicit task links remain available", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.goto("/sap");
  await page.getByRole("combobox", { name: "Abrir clínica do programa:", exact: true }).selectOption(CID);
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/painel`));
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumo do programa", exact: true });
  expect(await summary.locator(".sap-clinic-kpis").evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.sap-clinic-phase')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await summary.getByRole("link", { name: "Ver minhas tarefas", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/?$`));
  await expect(page.getByRole("heading", { name: "Minha semana", exact: true })).toBeVisible();
});

test("Marketing sidebar reveals a group's tools on demand and opens the current group", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/marketing?preset=7d`);
  const nav = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
  const groups = nav.locator("details");
  await expect(groups.locator("summary")).toHaveText([/Resultados/, /Conteúdo/, /Campanhas e anúncios/]);
  await expect(nav.getByRole("link", { name: "Resultados dos anúncios", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toHaveCount(0);
  await nav.locator("summary").filter({ hasText: /^Conteúdo/ }).click();
  await nav.getByRole("link", { name: "Planejar a semana", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${CID}/ideias`));
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  expect(new URL(page.url()).searchParams.get("visao")).toBe("semana");
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toBeVisible();
});

test("mobile product switch remains available to the team even after collapsing the desktop sidebar", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.goto(`/${CID}`);
  await page.getByRole("button", { name: "Recolher menu lateral", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("navigation", { name: "Áreas", exact: true }).getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Navegar no Nexo", exact: true });
  const link = menu.getByRole("navigation", { name: "Produto", exact: true }).getByRole("link", { name: "Sistema de Aquisição", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/sap/${CID}/painel`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/painel`));
  await expect(menu).not.toBeVisible();
});

for (const measured of [false, true]) {
  test(`SAP portfolio distinguishes an unavailable commercial source from a measured zero (${measured})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await context.route("**/rest/v1/rpc/sap_tracker_auto", r => r.fulfill({ json: { tem_crm: measured, tem_whatsapp: false, marcos: measured ? ["compareceu", "fechou"] : [], leads: 0, compareceram: 0, fechados: 0, fechados_com_valor: 0, receita: 0 } }));
    await page.goto("/sap");
    const portfolio = page.getByRole("region", { name: "Clínicas e resultados", exact: true });
    const row = portfolio.getByRole("row").filter({ hasText: "Clínica de teste" });
    await expect(row.getByRole("cell").nth(4)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(5)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(6)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(7)).toHaveText(measured ? /0,00/ : "sem dado confiável");
    await expect(portfolio.getByText("0 de 1 clínicas com dados disponíveis", { exact: true })).toHaveCount(measured ? 0 : 4);
  });
}
