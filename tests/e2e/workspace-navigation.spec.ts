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
    "Encontrar ideias",
  );
  const sidebar = page.getByRole("complementary", { name: "Menu principal" });
  // Menu do médico (03.1.1-07, D-01 e D-06, trava em links-do-medico.ts): 6 itens. Encontrar ideias fica fora deles e continua
  // abrindo pelo endereço; nenhum item fica marcado e as telas de Marketing não aparecem mais na barra.
  const areas = sidebar.getByRole("navigation", { name: "Áreas do Nexo" });
  await expect(areas.getByRole("link")).toHaveCount(6);
  await expect(areas.locator("[data-on]")).toHaveCount(0);
  await expect(sidebar.getByRole("navigation", { name: "Telas de Marketing" })).toHaveCount(0);
  await expect(page.locator(".areatabs")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "O que você quer fazer?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toBeFocused();
  await dialog.getByRole("searchbox").fill("funil");
  await dialog.getByRole("link", { name: /Funil comercial/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${CID}/crm-painel\\?preset=7d`));
  await expect(dialog).not.toBeVisible();
  // O título da casca é o da tela juntada (D-01): Funil comercial é a parte No CRM da aba Funil.
  await expect(page.locator(".workspace-heading h1")).toHaveText(
    "Onde os pacientes travam",
  );
});

test("mobile: every screen of the doctor menu is reachable through the Menu sheet, without horizontal overflow", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/ideias?preset=7d`);
  const botaoMenu = page
    .getByRole("navigation", { name: "Áreas", exact: true })
    .getByRole("button", { name: "Menu", exact: true });
  // Encontrar ideias fica fora dos 6 itens: o botão Menu é o lugar marcado da barra de baixo.
  await expect(botaoMenu).toHaveAttribute("data-on", "");
  await botaoMenu.click();
  const menu = page.getByRole("dialog", { name: "Navegar no Nexo" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link")).toHaveText([
    "O que fazer hoje",
    "Resultados da clínica",
    "Onde os pacientes travam",
    "De onde vêm os pacientes",
    "Instagram",
    "Relatório do período",
  ]);
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(botaoMenu).toBeFocused();
  await botaoMenu.click();
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
      name: /Configurar este cliente|Inteligência Criativa|Analisar desempenho|Resultados dos anúncios|Funil comercial/,
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
  // Resultados da clínica (03.1.1): a pergunta da tela é o título da página e as análises detalhadas ficam fechadas.
  await expect(
    page.getByRole("heading", { name: "Como a clínica foi no período?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumo do período", exact: true }),
  ).not.toBeVisible();
  // O menu do médico leva às análises que ficaram em pasta, sem lista de telas por área.
  await expect(
    page.getByRole("navigation", { name: "Áreas do Nexo" }).getByRole("link", { name: "Onde os pacientes travam", exact: true }),
  ).toBeVisible();
  // As análises ficam dentro de Detalhes e, dentro dele, em Todas as análises do período: os dois começam fechados.
  const detalhes = page.locator("details#detalhes-resultados");
  await expect(detalhes).not.toHaveAttribute("open", "");
  await detalhes.locator(":scope > summary").click();
  await expect(detalhes).toHaveAttribute("open", "");
  const analyses = page.locator("details#todas-analises");
  await expect(analyses).not.toHaveAttribute("open", "");
  await analyses.locator(":scope > summary").click();
  await expect(analyses).toHaveAttribute("open", "");
  await expect(
    page.getByRole("heading", { name: "Resumo do período", exact: true }),
  ).toBeVisible();
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
    page.getByRole("alert").filter({ hasText: "Não foi possível carregar o resumo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Áreas do Nexo" }),
  ).toBeVisible();
  broken = false;
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Como a clínica foi no período?", exact: true }),
  ).toBeVisible();
  await expect(page.locator("details#detalhes-resultados")).toBeAttached();
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
  test(`clinic navigation shows the 6 doctor screens and preserves clinic and period at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/ideias?preset=7d`);
    const primary = page.getByRole("navigation", { name: width === 1440 ? "Áreas do Nexo" : "Áreas", exact: true });
    if (width === 1440) {
      await expect(primary.getByRole("link")).toHaveText([
        "O que fazer hoje",
        "Resultados da clínica",
        "Onde os pacientes travam",
        "De onde vêm os pacientes",
        "Instagram",
        "Relatório do período",
      ]);
      // Não há mais grupo de análises detalhadas: as telas antigas moram nas abas das telas juntadas.
      await expect(page.getByRole("navigation", { name: "Análises detalhadas", exact: true })).toHaveCount(0);
      await primary.getByRole("link", { name: "Onde os pacientes travam", exact: true }).click();
    } else {
      await expect(primary.getByRole("link")).toHaveText(["Hoje", "Resultados", "Onde travam", "De onde vêm"]);
      await primary.getByRole("button", { name: "Menu", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Navegar no Nexo" });
      await expect(menu.locator("summary")).toHaveCount(0);
      await menu.getByRole("link", { name: "Onde os pacientes travam", exact: true }).click();
    }
    // Onde os pacientes travam abre na aba Funil (parte Do contato à venda), com a clínica e o período.
    await expect(page).toHaveURL(new RegExp(`/${CID}/pacientes`));
    expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
    await expect(page.locator("[data-juntada]")).toHaveAttribute("data-juntada", "travam");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
