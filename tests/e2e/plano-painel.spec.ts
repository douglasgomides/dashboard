import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { dadosDoPlano, RESULTADO_REUNIAO } from "./plano-dados";

// Plano de ação e Relatórios no desenho do painel da prancha: cada tela abre respondendo a pergunta dela
// (números e leitura no relatório; contadores e o que fazer agora nas telas de ação), sem rolagem lateral,
// com o método recolhido e os avisos de dado incompleto visíveis.

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [375, 1440]) {
  test(`Relatório: números com variação, gráfico do dia e o que aconteceu / o que fazer em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosDoPlano(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/relatorio?preset=30d`);

    const numeros = page.locator("#rel-numeros");
    await expect(numeros.locator(".nx-kpi").first()).toBeVisible();
    expect(await numeros.locator(".nx-kpi").count()).toBeGreaterThanOrEqual(4);
    await expect(numeros.locator(".nx-kpi .nx-tag").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "O que aconteceu", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "O que fazer", exact: true })).toBeVisible();
    // Dado incompleto continua à vista, curto.
    await expect(page.getByText(/^Dados incompletos: \d+ pontos? para ler com cuidado$/)).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // O gráfico leva ao dia pelo teclado.
    const grafico = page.getByRole("slider", { name: /^Alcance e interações por dia/ });
    await grafico.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page.locator(".pl-dia")).toContainText("alcance");

    // As versões para enviar continuam no lugar de sempre, e o ajuste do texto abre pelo teclado.
    await expect(page.getByRole("tab", { name: "PDF", exact: true })).toBeVisible();
    const ajustar = page.locator("summary").filter({ hasText: "Ajustar o texto" });
    await ajustar.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("radiogroup", { name: "Tom do texto" })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Plano da semana: contadores no topo e as ações em linhas com chips em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosDoPlano(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/plano`);

    await expect(page.getByRole("list", { name: "Números do plano" }).locator(".pl-contador")).toHaveCount(4);
    const atual = page.locator("#plano-atual");
    await expect(atual.locator(".pl-linha")).toHaveCount(3);
    await expect(atual.locator(".pl-linha").first()).toContainText("Responder 12 pacientes");
    await expect(atual.locator(".pl-linha").first()).toContainText("Parcial: 4 de 12");
    // O cálculo fica recolhido e abre pelo teclado.
    const detalhe = atual.locator(".pl-linha").first().locator("summary");
    await detalhe.focus();
    await page.keyboard.press("Enter");
    await expect(atual.getByText("Como calculamos: 12 pacientes × 30% × R$ 1.500")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Semana passada/ })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Prioridades e oportunidades: contadores e lista priorizada em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosDoPlano(context);
    await page.setViewportSize({ width, height: 900 });

    await page.goto(`/${CID}/proximas-acoes?preset=30d`);
    await expect(page.getByRole("list", { name: "Ações abertas por prioridade" }).locator(".pl-contador")).toHaveCount(4);
    await expect(page.locator("#pa-lista .pl-linha").first()).toBeVisible();
    await expect(page.locator("#pa-lista .pl-linha").first().locator(".nx-tag").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    await page.goto(`/${CID}/oportunidades?preset=30d`);
    await expect(page.getByRole("tablist", { name: "Filtrar oportunidades", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "Oportunidades por andamento" }).locator(".pl-contador")).toHaveCount(4);
    const primeira = page.locator("#op-lista .pl-linha").first();
    await expect(primeira).toBeVisible();
    await primeira.getByRole("button", { name: "Entender e agir" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Reuniões: a reunião processada abre no resumo e nas entregas da semana em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosDoPlano(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/reunioes`);
    await page.getByRole("button", { name: /Reunião semanal/ }).click();
    await expect(page.getByText(RESULTADO_REUNIAO.resumo, { exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "O que saiu da reunião" }).locator(".pl-contador")).toHaveCount(4);
    await expect(page.locator(".pl-linha").filter({ hasText: "Roteiro de Reels: sintomas da menopausa" })).toBeVisible();
    await expect(page.getByLabel("Notas")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
