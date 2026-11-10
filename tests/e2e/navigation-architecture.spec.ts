import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";

for (const width of [375, 1440]) {
  test(`Marketing antigo leva a Analisar desempenho com o período e o planejador da semana sobrevive a refresh e histórico at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await page.setViewportSize({ width, height: 1000 });
    // /marketing só redireciona desde 06/11 (D-05): o endereço antigo cai em /conteudo com o mesmo período.
    await page.goto(`/${CID}/marketing?preset=7d`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/${CID}/conteudo`);
    expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await expect(page.locator(".workspace-heading h1")).toHaveText("Analisar desempenho");
    await page.goto(`/${CID}/ideias?preset=7d`);
    const main = page.getByRole("main");
    await expect(page.locator(".workspace-heading h1")).toHaveText("Revisar roteiros");
    const audit = await new AxeBuilder({ page }).include(".mainwrap").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audit.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await main.getByRole("button", { name: /^Planejar a semana/ }).click();
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
  await expect(page.getByRole("button", { name: /^Encontrar uma ferramenta/ }).filter({visible:true})).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  // O papel do viewer chega depois da primeira pintura; repete o atalho só enquanto o diálogo do médico não abriu.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
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
    // O papel do viewer chega por uma leitura própria de client_members (client_id e user_id). Enquanto ela não volta, o menu ainda
    // mostra as telas de equipe; só depois dela o menu chega ao estado final. O teste espera esse estado antes de afirmar.
    const papelCarregado = profile === "viewer"
      ? page.waitForResponse((r) => new URL(r.url()).pathname === "/rest/v1/client_members" && r.url().includes("client_id=eq.") && r.url().includes("user_id=eq."))
      : Promise.resolve();
    await page.goto(`/${CID}/crm-painel`);
    await papelCarregado;
    if (profile === "admin") {
      // A equipe não tem mais as abas de Comercial na barra (Phase 3, MENU-02): a tela restrita abre pela busca, na área Comercial.
      await expect(page.getByRole("navigation", { name: "Menu da equipe" }).first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Telas de Comercial", exact: true })).toHaveCount(0);
      await page.getByRole("complementary", { name: "Menu principal" }).getByRole("button", { name: "Buscar tela" }).click();
      const busca = page.getByRole("dialog", { name: "Buscar tela" });
      await busca.getByRole("searchbox").fill("origem do CRM");
      const resultados = busca.getByRole("navigation", { name: "Resultados da busca" });
      const result = resultados.getByRole("link", { name: /Resultados por origem do CRM/ });
      await expect(result).toHaveCount(1);
      await expect(result.locator(".nx-resultado-apoio")).toContainText("Comercial");
      await busca.getByRole("searchbox").fill("Guia de organização do CRM");
      await expect(resultados.getByRole("link", { name: /Guia de organização do CRM/ })).toHaveCount(1);
      return;
    }
    const commercial = page.getByRole("navigation", { name: "Telas de Comercial", exact: true });
    const result = commercial.getByRole("link", { name: "Resultados por origem do CRM", exact: true });
    await expect(result).toHaveCount(0);
    // Estado final: o guia é tela de equipe (src/lib/nav.ts); o viewer, com o papel já carregado, não o vê.
    await expect(commercial.getByRole("link", { name: "Guia de organização do CRM", exact: true })).toHaveCount(0);
  });
}
