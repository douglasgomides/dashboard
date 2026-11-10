import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram } from "./instagram-dados";

// Telas de Marketing/Instagram no desenho do painel: abrem com os números em cartões, sem rolagem lateral, e o
// "como é calculado" e as partes recolhidas abrem pelo teclado.

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

const TELAS: { rota: string; numeros: string; kpis: number; pergunta: RegExp }[] = [
  { rota: "conteudo", numeros: "Números do período", kpis: 4, pergunta: /^O perfil está crescendo/ },
  { rota: "audiencia", numeros: "Números do público", kpis: 4, pergunta: /^Quem acompanha o perfil/ },
  { rota: "top", numeros: "Números do ranking", kpis: 3, pergunta: /^Quais publicações mais se destacaram/ },
  { rota: "posts", numeros: "Números das publicações", kpis: 4, pergunta: /^O que foi publicado/ },
  { rota: "conteudo-comercial", numeros: "Números do cruzamento", kpis: 4, pergunta: /^O conteúdo está trazendo conversa/ },
];

for (const width of [375, 1440]) {
  for (const t of TELAS) {
    test(`/${t.rota}: cartões de número no topo, sem rolagem lateral e método pelo teclado em ${width}px`, async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockInstagram(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${CID}/${t.rota}?preset=30d`);

      await expect(page.getByRole("heading", { level: 2, name: t.pergunta })).toBeVisible();
      const numeros = page.getByRole("region", { name: t.numeros, exact: true });
      await expect(numeros.locator(".nx-kpi")).toHaveCount(t.kpis);
      await expect(numeros.locator(".nx-kpi .ws-metric-value").first()).toBeVisible();
      // Os números vêm antes de qualquer gráfico ou tabela.
      const topoNumeros = (await numeros.boundingBox())!.y;
      const primeiroCartao = page.locator("main .nx-card").first();
      expect(topoNumeros).toBeLessThan((await primeiroCartao.boundingBox())!.y);
      expect(await semRolagemLateral(page)).toBe(true);

      // "Como ler" recolhido: abre com Enter e mostra o texto.
      const metodo = page.locator("main details.ig-metodo").first();
      await metodo.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(metodo).toHaveAttribute("open", "");
      await expect(metodo.locator(".ig-metodo__corpo")).toBeVisible();
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }

  test(`Público do Instagram: abas trocam pelas setas do teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/audiencia?preset=30d`);
    const abas = page.getByRole("tablist", { name: "Partes do público" });
    await abas.getByRole("tab", { name: "Quem segue" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toHaveAttribute("aria-selected", "true");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Origem das visualizações" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Seguidores online" })).toBeVisible();
    await expect(page.locator(".nx-colunas")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Consultar publicações: mais análises abrem pelo teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/posts?preset=30d`);
    const botao = page.getByRole("button", { name: /^Mais análises dos posts/ });
    await botao.focus();
    await page.keyboard.press("Enter");
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Alcance por tema e por formato" })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
