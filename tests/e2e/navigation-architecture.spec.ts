import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { CID, mockAccount } from "./fixtures";

const outputs = new URL("../../../../outputs/", import.meta.url).pathname;
for (const width of [375, 1440]) {
  test(`Marketing opens an orientation page and the weekly planner survives refresh and history at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/ideias?preset=7d`);
    if (width === 375) {
      await page.getByRole("navigation", { name: "Áreas", exact: true }).getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("dialog", { name: "Navegar no Nexo" }).getByRole("link", { name: "Visão geral de Marketing", exact: true }).click();
    } else {
      await page.getByRole("navigation", { name: "Análises detalhadas", exact: true }).getByRole("link", { name: "Marketing", exact: true }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/${CID}/marketing\\?preset=7d`));
    await expect(page.getByRole("heading", { name: "Visão geral de Marketing", exact: true })).toBeVisible();
    const main = page.getByRole("main");
    for (const name of ["Analisar os números", "Produzir e planejar conteúdo", "Planejar campanhas e aquisição"])
      await expect(main.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Inteligência Criativa/ })).toHaveCount(0);
    const audit = await new AxeBuilder({ page }).include(".mainwrap").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audit.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await mkdir(outputs, { recursive: true });
    await page.screenshot({ path: `${outputs}marketing-visao-geral-${width}.png` });
    await main.getByRole("link", { name: /^Planejar a semana/ }).click();
    await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
    await expect(page.locator(".workspace-heading h1")).toHaveText("Planejar a semana");
    expect(new URL(page.url()).searchParams.get("visao")).toBe("semana");
    await page.reload();
    await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
    if (width === 1440) {
      const sidebar = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
      await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
      await expect(sidebar.getByRole("link", { name: "Planejar a semana", exact: true })).toHaveAttribute("data-on", "");
      await page.getByRole("combobox", { name: "Período", exact: true }).selectOption("30d");
      await expect.poll(() => new URL(page.url()).searchParams.get("preset")).toBe("30d");
      expect(new URL(page.url()).searchParams.get("visao")).toBe("semana");
      const ads = await sidebar.getByRole("link", { name: "Resultados dos anúncios", exact: true, includeHidden: true }).getAttribute("href");
      expect(new URL(ads!, "http://localhost").searchParams.has("visao")).toBe(false);
    }
    await main.getByRole("button", { name: /^Encontrar ideias/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("visao")).toBe("ideias");
    await expect(page.locator(".workspace-heading h1")).toHaveText("Encontrar ideias");
    await page.goBack();
    await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("visao")).toBe("semana");
    await page.goForward();
    await expect(page.locator(".workspace-heading h1")).toHaveText("Encontrar ideias");
  });
}

test("legacy and invalid content links open scripts and only their own menu item is current", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  for (const suffix of ["", "?visao=invalida"]) {
    await page.goto(`/${CID}/ideias${suffix}`);
    await expect(page.locator(".workspace-heading h1")).toHaveText("Revisar roteiros");
    const nav = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Revisar roteiros", exact: true })).toHaveAttribute("data-on", "");
  }
});

test("task search leads straight to the weekly planner and closes for a different view on the same route", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/ideias?preset=7d`);
  await expect(page.getByRole("button", { name: "Encontrar uma ferramenta", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  await dialog.getByRole("searchbox").fill("calendário");
  await expect(dialog.getByRole("link")).toHaveCount(1);
  await dialog.getByRole("link", { name: /Planejar a semana/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
});

for (const profile of ["admin", "viewer"] as const) {
  test(`commercial results remain restricted and are categorized under Comercial for ${profile}`, async ({ page, context }) => {
    await mockAccount(context, profile);
    await page.goto(`/${CID}/crm-painel`);
    const commercial = page.getByRole("navigation", { name: "Telas de Comercial", exact: true });
    const result = commercial.getByRole("link", { name: "Resultados por origem do CRM", exact: true });
    await expect(result).toHaveCount(profile === "admin" ? 1 : 0);
    if (profile === "admin") {
      await expect(result).toBeVisible();
      await page.getByRole("button", { name: "Equipe e configuração", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Equipe", exact: true }).getByRole("link", { name: "Resultados por origem do CRM", exact: true })).toHaveCount(0);
    }
    await expect(commercial.getByRole("link", { name: "Guia de organização do CRM", exact: true })).toBeVisible();
  });
}
