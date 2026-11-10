import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Peças de bloco (NxVazio, NxAviso, NxTabela, NxRecolhido) e peças compartilhadas (PhasePlaceholder, QualidadeDados,
// InsightCard, seguidores por semana, posts impulsionados) nas telas que as usam. Dados fictícios, sem rede.
// Rodar em outra porta, ao lado de outro executor: PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test ...

const DIA = 86_400_000;
const isoDia = (i: number) => new Date(Date.now() - (i + 1) * DIA).toISOString().slice(0, 10);
const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

const CAMPANHAS = [
  { campaign_id: "c1", name: "Primeira consulta fictícia", objective: "MESSAGES", spend: 60, conv: 3, imp: 5000, clk: 70 },
  { campaign_id: "c2", name: "Tráfego fictício", objective: "OUTCOME_TRAFFIC", spend: 30, conv: 0, imp: 6000, clk: 120 },
  { campaign_id: "c3", name: "Post do Instagram: Tireoide em foco fictício", objective: "OUTCOME_AWARENESS", spend: 20, conv: 0, imp: 9000, clk: 15 },
];

function pagina(url: string, linhas: unknown[]) {
  const p = new URL(url).searchParams;
  const off = Number(p.get("offset") ?? 0);
  return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
}

/** Anúncios (com uma campanha de post impulsionado) e métricas diárias do Instagram, todos fictícios. */
async function dadosFicticios(context: BrowserContext) {
  const linhasAds = (de: string, ate: string) => {
    const out: Record<string, unknown>[] = [];
    for (let i = 59; i >= 0; i--) {
      const d = isoDia(i);
      if (d < de || d > ate) continue;
      for (const c of CAMPANHAS) out.push({ date: d, campaign_id: c.campaign_id, spend: c.spend, impressions: c.imp, link_clicks: c.clk, conversations: c.conv, leads: 0, landing_page_views: 0, reach: c.imp * 0.7, clicks: c.clk });
    }
    return out;
  };
  await context.route("**/rest/v1/meta_ads_daily?**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    return r.fulfill({ json: Number(p.get("offset") ?? 0) ? [] : linhasAds(de, ate) });
  });
  await context.route("**/rest/v1/meta_ads_campaigns?**", (r) => r.fulfill({ json: CAMPANHAS.map((c) => ({ campaign_id: c.campaign_id, name: c.name, objective: c.objective })) }));
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => r.fulfill({ json: [{ gasto: 3000, conversas: 90, impressoes: 600000, cliques_link: 6000, campanhas: 3, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: 30 }] }));
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const por = new Map<string, { dia: string; gasto: number; conversas: number }>();
    for (const l of linhasAds(b.p_start, b.p_end) as { date: string; spend: number; conversations: number }[]) {
      const x = por.get(l.date) ?? { dia: l.date, gasto: 0, conversas: 0 };
      x.gasto += l.spend;
      x.conversas += l.conversations;
      por.set(l.date, x);
    }
    return r.fulfill({ json: [...por.values()].sort((a, b) => a.dia.localeCompare(b.dia)) });
  });
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => ({
      date: isoDia(i),
      client_id: CID,
      reach: 900 + Math.round(600 * Math.abs(Math.sin(i * 0.7))),
      new_followers: 8 + (i % 7),
      unfollowers: 3 + (i % 3),
      total_interactions: 60 + ((i * 13) % 50),
      likes: 40 + (i % 9),
      comments: 4 + (i % 3),
      saves: 20 + (i % 9),
      shares: 5 + (i % 4),
      profile_links_taps: 4,
      followers_count: 5000 - i * 9,
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("**/rest/v1/instagram_posts**", (r) =>
    r.fulfill({ json: pagina(r.request().url(), [{ id: "p1", client_id: CID, caption: "Tireoide em foco fictício: o que ninguém conta", posted_at: new Date(Date.now() - 40 * DIA).toISOString(), reach: 1200, permalink: null, thumbnail_url: null, format: "reels", media_type: "VIDEO", saved: 12, likes: 30, comments: 3, shares: 2, views: 2000 }]) }),
  );
}

for (const width of [375, 1440]) {
  test(`Automações: tela em construção diz o que falta e quem resolve em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/automacoes`);
    const vazio = page.locator('[data-peca="vazio"]');
    await expect(vazio).toBeVisible();
    await expect(vazio).toContainText("Em construção");
    await expect(vazio).toContainText("O que falta:");
    await expect(vazio).toContainText("Quem resolve: Equipe Doctor Creator");
    // O texto técnico de fase não aparece mais; fica só como atributo.
    await expect(page.getByText("Fase 3")).toHaveCount(0);
    await expect(page.locator("[data-fase]")).toHaveCount(1);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Dados com erro na origem aparecem como avisos nx, crítico e atenção, em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await context.route("**/rest/v1/rpc/qualidade_dados", (r) =>
      r.fulfill({
        json: [
          { id: "q1", fonte: "crm", severidade: "alta", titulo: "Leads sem etapa definida", evidencia: "40 leads sem etapa", causa: "x", correcao: "Definir a etapa de cada lead", responsavel: "comercial", afeta: "O funil fica menor do que é" },
          { id: "q2", fonte: "crm", severidade: "media", titulo: "Leads sem origem", evidencia: "12 leads sem origem", causa: "x", correcao: "Preencher a origem", responsavel: "atendimento", afeta: "A origem dos pacientes fica incompleta" },
        ],
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/crm-painel?preset=30d`);
    const bloco = page.getByRole("region", { name: "Dados do CRM com erro" });
    await expect(bloco).toBeVisible();
    await expect(bloco.locator('[data-peca="aviso"]')).toHaveCount(2);
    await expect(bloco.locator(".nxb-aviso--critico")).toHaveCount(1);
    await expect(bloco.locator(".nxb-aviso--atencao")).toHaveCount(1);
    // O detalhe fica recolhido atrás de "Entender" e abre pelo teclado.
    const mais = bloco.locator("details.nxb-aviso__mais").first();
    await mais.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(mais).toHaveAttribute("open", "");
    await expect(mais).toContainText("Quem corrige: Comercial");
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Seguidores por semana e posts impulsionados sem Recharts em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dadosFicticios(context);
    await page.setViewportSize({ width, height: 900 });

    await page.goto(`/${CID}/conteudo?preset=30d`);
    const semanas = page.locator('section.nx-card[aria-label="Seguidores por semana"]');
    await expect(semanas).toBeVisible();
    await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
    // Com gasto em post impulsionado: barras de seguidores novos e linha de gasto, em SVG nx.
    await expect(semanas.locator(".nx-bl svg")).toBeVisible();
    await expect(semanas.locator('[data-peca="tabela"]')).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    await page.goto(`/${CID}/anuncios?preset=30d`);
    const posts = page.locator('section.nx-card[aria-label="Posts impulsionados"]');
    await expect(posts).toBeVisible();
    await expect(posts.locator('[data-peca="tabela"]')).toBeVisible();
    await expect(posts.locator("table")).toHaveCount(1);
    await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Cartão de análise (InsightCard) usa o desenho nx, sem cartão Tailwind, em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dadosFicticios(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/anuncios?preset=30d`);
    // Os cartões ficam no plano completo, que começa recolhido.
    await page.getByRole("button", { name: /^Ver o plano completo/ }).click();
    const cartao = page.locator('[data-peca="insight"]').first();
    await expect(cartao).toBeVisible();
    await expect(cartao.locator(".nx-card")).toHaveCount(1);
    await expect(cartao.locator(".rounded-xl")).toHaveCount(0);
    await expect(cartao).toContainText("Evidência:");
    await expect(cartao).toContainText("Quem resolve:");
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
