import { test, expect, type BrowserContext } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Resultados dos anúncios no molde (03.1.1-04): leitura por regra, 4 números, gráfico do dia, e nos Detalhes o funil, o aviso de rastreio e o
// método recolhido. Nada de rolagem lateral em 375 e 1440.

const dia = (i: number) => new Date(Date.now() - (i + 1) * 86400_000).toISOString().slice(0, 10);
const CAMPANHAS = [
  { campaign_id: "c1", name: "Primeira consulta fictícia", objective: "MESSAGES", spend: 60, conv: 3, imp: 5000, clk: 70 },
  { campaign_id: "c2", name: "Tráfego fictício", objective: "OUTCOME_TRAFFIC", spend: 30, conv: 0, imp: 6000, clk: 120 },
  { campaign_id: "c3", name: "Alcance fictício", objective: "OUTCOME_AWARENESS", spend: 20, conv: 0, imp: 9000, clk: 15 },
];

async function anuncios(context: BrowserContext, suspeito: boolean) {
  const linhas = (de: string, ate: string, fator: number) => {
    const out: Record<string, unknown>[] = [];
    for (let i = 59; i >= 0; i--) {
      const d = dia(i);
      if (d < de || d > ate) continue;
      for (const c of CAMPANHAS) {
        const conv = suspeito ? (c.campaign_id === "c1" && i % 3 === 0 ? 1 : 0) : c.conv;
        out.push({ date: d, campaign_id: c.campaign_id, spend: c.spend * fator, impressions: c.imp, link_clicks: c.clk * (suspeito ? 2 : 1), conversations: conv, leads: 0, landing_page_views: 0, reach: c.imp * 0.7, clicks: c.clk });
      }
    }
    return out;
  };
  await context.route("**/rest/v1/meta_ads_daily?**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    return r.fulfill({ json: Number(p.get("offset") ?? 0) ? [] : linhas(de, ate, 1) });
  });
  await context.route("**/rest/v1/meta_ads_campaigns?**", (r) => r.fulfill({ json: CAMPANHAS.map((c) => ({ campaign_id: c.campaign_id, name: c.name, objective: c.objective })) }));
  // Período anterior com 20% menos conversas e o mesmo gasto: a variação de conversas aparece no cartão.
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const anterior = b.p_end < dia(25);
    return r.fulfill({ json: [{ gasto: 3000, conversas: anterior ? 75 : 90, impressoes: 600000, cliques_link: 6000, campanhas: 3, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: 30 }] });
  });
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const por = new Map<string, { dia: string; gasto: number; conversas: number }>();
    for (const l of linhas(b.p_start, b.p_end, 1) as { date: string; spend: number; conversations: number }[]) {
      const x = por.get(l.date) ?? { dia: l.date, gasto: 0, conversas: 0 };
      x.gasto += l.spend;
      x.conversas += l.conversations;
      por.set(l.date, x);
    }
    return r.fulfill({ json: [...por.values()].sort((a, b) => a.dia.localeCompare(b.dia)) });
  });
}

const semRolagemLateral = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [375, 1440]) {
  test(`Anúncios: números, gráfico do dia e leitura aparecem sem rolagem lateral em ${width}px; o resto está nos Detalhes`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await anuncios(context, false);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/anuncios?preset=30d`);

    // Molde (03.1.1-04): leitura, 4 cartões com ícone redondo, o gráfico do dia e os Detalhes fechados.
    const leitura = page.locator('[data-peca="leitura"]').first();
    await expect(leitura).toBeVisible();
    await expect(leitura).not.toHaveAttribute("data-modo", "carregando");
    await expect(leitura.getByText("O que aconteceu")).toBeVisible();
    const cartoes = page.locator(".nx-pagina__cartoes > .nx-cartao");
    await expect(cartoes).toHaveCount(4);
    await expect(cartoes.first().locator(".nx-numero__valor")).toHaveText(/R\$/);
    // Conversas subiram 20% contra o período anterior: pílula azul-clara com o texto (sem cor de bom ou ruim).
    await expect(cartoes.nth(1).locator(".nx-pilula-variacao")).toContainText("+20%");

    const grafico = page.getByRole("slider", { name: /^Investimento e conversas por dia/ });
    await expect(grafico).toBeVisible();
    await grafico.focus();
    await page.keyboard.press("Home");
    await expect(grafico).toHaveAttribute("aria-valuetext", /Investido .*Conversas/);

    // O funil, o "o que fazer" e o método ficam nos Detalhes, fechados.
    const detalhes = page.locator("details#detalhes-anuncios");
    await expect(detalhes).not.toHaveAttribute("open", "");
    await detalhes.locator(":scope > summary").click();
    await expect(page.getByRole("figure", { name: "Do anúncio à conversa" })).toBeVisible();
    await expect(page.getByRole("region", { name: "O que fazer agora" })).toBeVisible();

    // O método fica recolhido e abre pelo teclado.
    const metodo = page.locator("details.nx-metodo").filter({ hasText: "Como estes números são calculados" });
    await expect(metodo).not.toHaveAttribute("open", "");
    await metodo.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(metodo).toHaveAttribute("open", "");
    await expect(metodo.getByText(/Custo por conversa/).first()).toBeVisible();

    // O botão do "o que fazer" abre o plano completo, que começa recolhido.
    const plano = page.locator("#recomendacoes-anuncios");
    await expect(plano).not.toHaveAttribute("open", "");
    await page.getByRole("button", { name: /^Ver o plano completo/ }).click();
    await expect(plano).toHaveAttribute("open", "");
    expect(await semRolagemLateral(page)).toBe(true);
  });
}

test("Anúncios com rastreio suspeito: a leitura diz \"Sem leitura\" com o próximo passo e o custo por conversa fica marcado como não confiável", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await anuncios(context, true);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/${CID}/anuncios?preset=30d`);
  const leitura = page.locator('[data-peca="leitura"]').first();
  await expect(leitura.getByText(/^Sem leitura: o rastreio das conversas dos anúncios está suspeito/)).toBeVisible();
  await expect(leitura.getByText("Quem resolve: Gestor de tráfego")).toBeVisible();
  const cartoes = page.locator(".nx-pagina__cartoes > .nx-cartao");
  await expect(cartoes.nth(2).locator(".nx-numero__valor")).toHaveText("Não confiável");
  // O aviso longo do rastreio continua inteiro, nos Detalhes.
  const detalhes = page.locator("details#detalhes-anuncios");
  await detalhes.locator(":scope > summary").click();
  const alerta = detalhes.getByRole("alert").filter({ hasText: "As conversas dos anúncios não estão sendo contadas direito" });
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText("Próximo passo:");
  await expect(alerta).toContainText("Quem resolve: Gestor de tráfego");
  // A leitura vem antes dos cartões.
  expect(await leitura.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector(".nx-pagina__cartoes")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await semRolagemLateral(page)).toBe(true);
});
