import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { dadosDoPlano } from "./plano-dados";

// Relatórios no desenho do painel da prancha: a tela abre respondendo a pergunta dela (números e leitura), sem rolagem
// lateral, com o método recolhido e os avisos de dado incompleto visíveis. Em 11/11/2026 o João tirou as telas de Plano de
// ação (Plano da semana, Prioridades, Oportunidades e Reuniões): os testes delas saíram junto.

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
}
