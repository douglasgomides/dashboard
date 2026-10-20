import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { CID, mockAccount } from "./fixtures";

const outputs = new URL("../../../../outputs/", import.meta.url).pathname;

test("desktop: task search leads to existing tools and preserves clinic and period", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/ideias?preset=7d`);
  await expect(page.locator(".workspace-heading h1")).toHaveText(
    "Revisar roteiros",
  );
  const sidebar = page.getByRole("complementary", { name: "Menu principal" });
  await expect(
    sidebar
      .getByRole("navigation", { name: "Áreas do Nexo" })
      .getByRole("link"),
  ).toHaveCount(3);
  await expect(
    sidebar
      .getByRole("navigation", { name: "Telas de Marketing" })
      .getByRole("link", { includeHidden: true }),
  ).toHaveCount(14);
  await expect(
    sidebar.getByText("Conteúdo", { exact: true }),
  ).toBeVisible();
  await expect(
    sidebar.getByText("Campanhas e anúncios", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".areatabs")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("searchbox").fill("funil");
  await dialog.getByRole("link", { name: /Funil comercial/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${CID}/crm-painel\\?preset=7d`));
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".workspace-heading h1")).toHaveText(
    "Funil comercial",
  );
});

test("mobile: every area is reachable through the menu, without horizontal overflow", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/ideias?preset=7d`);
  await page
    .getByRole("button", { name: "Telas de Marketing", exact: true })
    .click();
  const menu = page.getByRole("dialog", { name: "Navegar no Nexo" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Referências salvas", exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "Relatório do período", exact: true, includeHidden: true }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Telas de Marketing", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("navigation", { name: "Áreas", exact: true })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await menu.locator("summary").filter({ hasText: "Relatórios" }).click();
  await menu
    .getByRole("link", { name: "Relatório do período", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${CID}/relatorio\\?preset=7d`));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("search respects visibility and has keyboard focus and accessible labels", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/client_fontes", (route) =>
    route.fulfill({
      json: [
        {
          tem_instagram: false,
          tem_crm: false,
          tem_anuncios: false,
          tem_atendimento: false,
        },
      ],
    }),
  );
  await page.goto(`/${CID}`);
  await page
    .getByRole("button", { name: /Encontrar uma ferramenta/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  await dialog.getByRole("searchbox").fill("whatsapp");
  await expect(dialog.getByText(/Nenhuma ferramenta encontrada/)).toBeVisible();
  await dialog.getByRole("searchbox").fill("");
  await expect(
    dialog.getByRole("link", {
      name: /Configurar este cliente|Jornada comercial|Inteligência Criativa/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Trocar de clínica", exact: true }),
  ).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(
      () => !!document.activeElement?.closest("dialog[open]"),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("home: detailed analyses remain accessible without competing with the first step", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}`);
  await expect(
    page.getByRole("heading", { name: "O que merece atenção nos resultados", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumo do período", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ver prioridades da equipe/ }),
  ).toBeVisible();
  const analyses = page.getByRole("button", {
    name: /^Todas as análises do período/,
  });
  await expect(analyses).toHaveAttribute("aria-expanded", "false");
  await analyses.click();
  await expect(
    page.getByRole("heading", { name: "Resumo do período", exact: true }),
  ).toBeVisible();
  await expect(analyses).toHaveAttribute("aria-expanded", "true");
});

test("home data failure offers retry and navigation instead of an endless skeleton", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  let broken = true;
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (route) =>
    route.fulfill({
      status: broken ? 503 : 200,
      json: broken ? { message: "fixture outage" } : [],
    }),
  );
  await page.goto(`/${CID}`);
  await expect(
    page.getByRole("heading", { name: "Não foi possível carregar o resumo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Áreas do Nexo" }),
  ).toBeVisible();
  broken = false;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "O que merece atenção nos resultados", exact: true }),
  ).toBeVisible();
});

test("admin: clinic switch is separate from task search and closes with Escape", async ({
  page,
  context,
}) => {
  await mockAccount(context, "admin");
  await page.goto(`/${CID}/ideias`);
  await page
    .getByRole("button", { name: "Trocar de clínica", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Trocar de clínica" });
  await expect(
    dialog.getByRole("textbox", { name: "Buscar clínica" }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: /Clínica de teste/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("SAP admin: setup and detailed tracking are available on demand", async ({
  page,
  context,
}) => {
  await mockAccount(context, "admin");
  await page.goto(`/sap/${CID}/painel`);
  const setup = page.locator("details").filter({
    has: page.locator("summary", {
      hasText: "Configuração do programa e linha do tempo",
    }),
  });
  await expect(setup).not.toHaveAttribute("open", "");
  await setup.locator(":scope > summary").click();
  await expect(setup).toHaveAttribute("open", "");
  await expect(setup.getByText(/Controles da equipe/)).toBeVisible();
  const tracker = page.locator("details").filter({
    has: page.locator("summary", {
      hasText: "Conferir números do funil e registros manuais",
    }),
  });
  await tracker.locator(":scope > summary").click();
  await expect(
    tracker.getByRole("group", { name: "Período dos números" }),
  ).toBeVisible();
});

test("visual evidence: content desktop and mobile menu, including stored collapsed preference", async ({
  page,
  context,
}) => {
  await mockAccount(context, "viewer");
  await mkdir(outputs, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(`/${CID}/ideias`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outputs}nexo-navegacao-desktop.png` });
  await page.getByRole("button", { name: "Recolher menu lateral" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator(".workspace-heading h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Áreas", exact: true })
    .getByRole("button", { name: "Menu", exact: true })
    .click();
  await page.screenshot({ path: `${outputs}nexo-navegacao-mobile.png` });
});

for (const width of [375, 1440]) {
  test(`clinic navigation prioritizes the service and preserves detailed analyses at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/ideias?preset=7d`);
    const primary = page.getByRole("navigation", { name: width === 1440 ? "Áreas do Nexo" : "Áreas", exact: true });
    await expect(primary.getByRole("link")).toHaveText(width === 1440 ? ["Resultados", "Entregas e aprovações", "Relatórios"] : ["Resultados", "Entregas", "Relatórios"]);
    if (width === 1440) {
      const secondary = page.getByRole("navigation", { name: "Análises detalhadas", exact: true });
      await expect(secondary.getByRole("link")).toHaveText(["Marketing", "Comercial"]);
      await secondary.getByRole("link", { name: "Comercial", exact: true }).click();
      await page.getByRole("navigation", { name: "Telas de Comercial", exact: true }).getByRole("link", { name: "Qualidade do atendimento", exact: true }).click();
    } else {
      await primary.getByRole("button", { name: "Menu", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Navegar no Nexo" });
      await expect(menu.locator("summary > span")).toHaveText(["Resultados", "Entregas e aprovações", "Relatórios", "Marketing", "Comercial"]);
      await menu.locator("summary").filter({ hasText: "Comercial" }).click();
      await menu.getByRole("link", { name: "Qualidade do atendimento", exact: true }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/${CID}/atendimento`));
    expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await primary.getByRole("link", { name: width === 1440 ? "Entregas e aprovações" : "Entregas", exact: true }).click();
    await expect(page).toHaveURL(/agentes/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
