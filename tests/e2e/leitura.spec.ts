import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Leitura do período no topo de Resultados da clínica (Phase 3.1, tracer): calculada na hora, no navegador, só do que a
// tela já carrega. Três casos, a 1440 e a 375 px: (a) dado em dia, (b) dado do Instagram parado há 10 dias,
// (c) a leitura segue o período escolhido (subtítulo com o período e o anterior de mesmo tamanho).

/** Instagram simulado como em resultados-painel.spec.ts. `diasDeAtraso` apaga os últimos dias (dado parado). */
async function instagram(context: BrowserContext, diasDeAtraso = 0) {
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
    const linhas = Array.from({ length: 60 }, (_, i) => i + diasDeAtraso)
      .map((i) => ({
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

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/** dd/mm do dia "hoje menos n", no fuso de Brasília (a mesma conta da tela: hoje no Brasil é UTC menos 3 horas). */
function ddmm(menosDias: number): string {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const t = new Date(`${hoje}T12:00:00Z`).getTime() - menosDias * 86400000;
  const d = new Date(t).toISOString().slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

// Resultados da clínica lê no modo resumo (D-07): "Resumo da clínica" é a leitura da tela, com o mesmo molde.
const regiao = (page: Page) => page.getByRole("region", { name: "Resumo da clínica", exact: true });

for (const width of [375, 1440]) {
  test.describe(`leitura de Resultados a ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
    });

    test("(a) com dado em dia, no modo resumo: o que aconteceu, um número ao lado, a ação da semana e quem resolve", async ({ page, context }) => {
      await mockAccount(context, "admin");
      await instagram(context);
      await page.goto(`/${CID}?preset=30d`);

      const leitura = regiao(page);
      await expect(leitura).toBeVisible();
      await expect(leitura.getByText("O que aconteceu", { exact: true })).toBeVisible();
      await expect(leitura.locator(".nx-leitura__num").first()).toBeVisible();
      await expect(leitura.getByText("Próximo passo", { exact: true })).toBeVisible();
      await expect(leitura.getByText(/Quem resolve:/).first()).toBeVisible();
      await expect(leitura.getByText(/Falta dado:/)).toHaveCount(0);
      // A leitura fica dentro do molde novo, abaixo da pergunta da tela, antes do conteúdo antigo.
      await expect(page.locator('.nx-pagina[data-tela="resultados"] > .nx-leitura')).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: "Como a clínica foi no período?", exact: true })).toBeVisible();
      expect(await semRolagemLateral(page)).toBe(true);
    });

    test("(b) com o Instagram parado há 10 dias: sem leitura, para consertar e quem resolve", async ({ page, context }) => {
      await mockAccount(context, "admin");
      await instagram(context, 10);
      await page.goto(`/${CID}?preset=30d`);

      const leitura = regiao(page);
      await expect(leitura.getByText(/Falta dado:/)).toBeVisible();
      await expect(leitura.getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
      await expect(leitura.getByText(/Próximo passo para resolver:/)).toBeVisible();
      await expect(leitura.getByText("Quem resolve: Equipe Doctor Creator")).toBeVisible();
      await expect(leitura.getByText("O que aconteceu")).toHaveCount(0);
      expect(await semRolagemLateral(page)).toBe(true);
    });

    test("(c) a leitura segue o período escolhido: 7 dias e o anterior de 7 dias", async ({ page, context }) => {
      await mockAccount(context, "admin");
      await instagram(context);

      await page.goto(`/${CID}?preset=30d`);
      const subtitulo = regiao(page).locator(".nx-leitura__periodo");
      await expect(subtitulo).toHaveText(`${ddmm(29)} a ${ddmm(0)}, comparado com ${ddmm(59)} a ${ddmm(30)}`);

      await page.goto(`/${CID}?preset=7d`);
      await expect(subtitulo).toHaveText(`${ddmm(6)} a ${ddmm(0)}, comparado com ${ddmm(13)} a ${ddmm(7)}`);
      await expect(regiao(page).getByText("O que aconteceu", { exact: true })).toBeVisible();
      expect(await semRolagemLateral(page)).toBe(true);
    });
  });
}
