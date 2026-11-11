import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram } from "./instagram-dados";

// Telas de Marketing/Instagram no molde novo (Phase 3.1, plano 05): cada uma abre com o cabeçalho, a leitura do período no
// topo (o que aconteceu com o número ao lado, ou "Sem leitura:" com quem resolve), até 4 cartões, um gráfico e o resto em
// Detalhes. Sem Recharts, sem tabela fora de NxTabela e sem rolagem lateral, em 375 e 1440 px.

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

const TELAS: { rota: string; cartoes: number; pergunta: RegExp }[] = [
  { rota: "conteudo", cartoes: 4, pergunta: /^O perfil está crescendo/ },
  { rota: "audiencia", cartoes: 4, pergunta: /^Quem acompanha o perfil/ },
  { rota: "top", cartoes: 3, pergunta: /^Quais publicações mais se destacaram/ },
  { rota: "posts", cartoes: 4, pergunta: /^O que foi publicado/ },
  { rota: "conteudo-comercial", cartoes: 4, pergunta: /^O conteúdo está trazendo conversa/ },
];

for (const width of [375, 1440]) {
  for (const t of TELAS) {
    test(`/${t.rota}: leitura no topo, até 4 cartões, sem Recharts nem tabela crua e sem rolagem lateral em ${width}px`, async ({ page, context }) => {
      await mockAccount(context, "admin");
      await mockInstagram(context);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${CID}/${t.rota}?preset=30d`);

      await expect(page.getByRole("heading", { level: 1, name: t.pergunta })).toBeVisible();

      // A leitura do período é a primeira coisa depois do cabeçalho: "O que aconteceu" com o número ao lado,
      // ou "Sem leitura:" com o motivo e quem resolve.
      const leitura = page.getByRole("region", { name: "Leitura do período", exact: true });
      await expect(leitura).toBeVisible();
      await expect(leitura.getByText("O que aconteceu", { exact: true }).or(leitura.getByText(/^Sem leitura:/))).toBeVisible();
      await expect(leitura.locator(".nx-leitura__num").first().or(leitura.getByText(/^Sem leitura:/))).toBeVisible();
      await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();

      // Cartões: até 4, depois da leitura.
      const cartoes = page.locator(".nx-pagina__cartoes > *");
      expect(await cartoes.count()).toBeGreaterThan(0);
      expect(await cartoes.count()).toBeLessThanOrEqual(4);
      // As 4 telas do Instagram desenham NxCartaoNumero (03.1.1, D-07); Conteúdo × Comercial segue com NxKpi.
      await expect(page.locator(".nx-pagina__cartoes :is(.nx-kpi, .nx-cartao)")).toHaveCount(t.cartoes);
      await expect(page.locator(".nx-pagina__cartoes :is(.nx-kpi .ws-metric-value, .nx-cartao .nx-numero__valor)").first()).toBeVisible();
      expect((await leitura.boundingBox())!.y).toBeLessThan((await cartoes.first().boundingBox())!.y);

      // Nenhum gráfico do Recharts e nenhuma tabela fora da peça NxTabela.
      await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
      expect(await page.locator("table").evaluateAll((ts) => ts.filter((x) => !x.closest('[data-peca="tabela"]')).length)).toBe(0);
      expect(await semRolagemLateral(page)).toBe(true);

      await page.screenshot({ path: `test-results/redesenho/instagram-${t.rota}-${width}.png`, fullPage: true });

      // Detalhes abre pelo teclado.
      const detalhes = page.locator(".nx-pagina__detalhe > details").first();
      if (await detalhes.count()) {
        await detalhes.locator("summary").first().focus();
        await page.keyboard.press("Enter");
        await expect(detalhes).toHaveAttribute("open", "");
        expect(await semRolagemLateral(page)).toBe(true);
      }
    });
  }

  test(`Analisar desempenho: sem projeção nos cartões nem na leitura em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/conteudo?preset=30d`);
    await expect(page.getByRole("region", { name: "Leitura do período", exact: true })).toBeVisible();
    await expect(page.locator(".nx-pagina__cartoes").getByText("Projeção em 30 dias")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Leitura do período", exact: true }).getByText(/projeção|ritmo atual|previsão/i)).toHaveCount(0);
  });

  test(`Conteúdo × Comercial: a origem por post é "não medida" e nenhum post "trouxe" contatos em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/conteudo-comercial?preset=30d`);
    // Aviso fixo na página, com quem resolve.
    const aviso = page.locator('[data-peca="aviso"]').filter({ hasText: "Sem leitura: origem por post não medida" });
    await expect(aviso).toBeVisible();
    await expect(aviso.getByText(/Quem resolve: Equipe Doctor Creator/)).toBeVisible();
    // E o último item de "Ver mais" da leitura, também com a equipe da Doctor Creator.
    const leitura = page.getByRole("region", { name: "Leitura do período", exact: true });
    await leitura.locator("summary", { hasText: /^Ver mais/ }).click();
    await expect(leitura.getByText(/origem por post não medida/)).toBeVisible();
    await expect(leitura.getByText(/Quem resolve: Equipe Doctor Creator/).last()).toBeVisible();
    const texto = await page.locator("main").innerText();
    expect(texto).not.toMatch(/trouxe\s+\d+\s*%/i);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Público do Instagram: abas trocam pelas setas do teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/audiencia?preset=30d`);
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    const abas = page.getByRole("tablist", { name: "Partes do público" });
    await abas.getByRole("tab", { name: "Quem segue" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toHaveAttribute("aria-selected", "true");
    await expect(abas.getByRole("tab", { name: "Alcance e origem" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Origem das visualizações" })).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: "Seguidores online" })).toBeVisible();
    await expect(page.locator(".nx-colunas").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Consultar publicações: mais análises abrem pelo teclado em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await mockInstagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/posts?preset=30d`);
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    const resumo = page.locator("summary", { hasText: /^Mais análises dos posts/ });
    await resumo.focus();
    await page.keyboard.press("Enter");
    await expect(resumo.locator("..")).toHaveAttribute("open", "");
    await expect(page.getByRole("heading", { name: "Alcance por tema e por formato" })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
