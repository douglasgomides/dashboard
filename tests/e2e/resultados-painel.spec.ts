import { test, expect, type BrowserContext } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Resultados da clínica no desenho do painel da prancha: cartões de número, gráficos em SVG e nenhuma rolagem lateral.

async function instagram(context: BrowserContext) {
  const pagina = (url: string, linhas: unknown[]) => {
    const p = new URL(url).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
  };
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      client_id: CID,
      reach: 900 + ((i * 137) % 600),
      new_followers: 8 + (i % 7),
      unfollowers: 3,
      total_interactions: 60 + ((i * 13) % 50),
      saves: 20 + (i % 9),
      profile_links_taps: 4,
      followers_count: 5000 - i * 9,
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const formatos = ["reels", "carrossel", "estatico"];
    const linhas = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      client_id: CID,
      windsor_media_id: `m${i}`,
      caption: `Post de teste ${i}`,
      format: formatos[i % 3],
      posted_at: new Date(Date.now() - ((i % 20) + 2) * 86400000).toISOString(),
      reach: 800 + i * 40,
      engagement: 40 + ((i * 7) % 30),
      saved: 5 + (i % 6),
      permalink: null,
      thumbnail_url: null,
    }));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
}

const semRolagemLateral = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [375, 1440]) {
  test(`Resultados: cartões e gráficos do painel aparecem sem rolagem lateral em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await instagram(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}?preset=30d`);

    const instagramRegiao = page.getByRole("region", { name: "Resultados do Instagram", exact: true });
    await expect(instagramRegiao.locator(".nx-kpi")).toHaveCount(4);
    await expect(instagramRegiao.locator(".nx-kpi .ws-metric-value").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    await page.getByRole("button", { name: /^Todas as análises do período/ }).click();
    const analises = page.locator("#todas-analises");
    await expect(analises.locator(".nx-linha__svg")).toHaveCount(2);
    await expect(analises.locator(".nx-colunas")).toBeVisible();
    await expect(analises.locator(".nx-pizza svg")).toBeVisible();
    await expect(analises.locator(".nx-medidor svg")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // O gráfico de linha continua levando aos posts do dia, também pelo teclado.
    const grafico = analises.getByRole("slider", { name: /^Alcance e interações por dia/ });
    await grafico.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(analises.getByRole("heading", { name: /^O que aconteceu em/ })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
