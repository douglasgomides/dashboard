import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { REGISTRO_DE_TELAS, SECOES_JUNTADAS } from "../../src/lib/registro-de-telas";
import { GUARDA_DE_NUMERO_DA_HOJE, GUARDA_DE_TEXTO_DA_HOJE } from "../../src/lib/leitura/fatos-hoje";
import { TELAS_DE_MEDIDA, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// O que fazer hoje (Phase 3.1.1, plano 05): a primeira versão da tela Hoje da Phase 9. De 3 a 5 ações da semana por regra fixa
// dos fatos que Resultados da clínica já lê, cada uma com o número, quem resolve e o link para a aba de origem. Os 4 números da
// Phase 9 (Agendaram, Fecharam, Chamaram e Foram) não aparecem. Dados fictícios, só leitura.

test.use({ reducedMotion: "reduce" });

const acoes = (page: Page) => page.locator('[data-tela="hoje"] [data-acao-hoje]');
const ROTAS_DAS_ABAS = new Set(SECOES_JUNTADAS.flatMap((s) => s.abas.flatMap((a) => a.partes.map((p) => p.rota))));

/** Os mesmos dados realistas que alimentam Resultados da clínica: Instagram, pessoas, anúncios e CRM. */
async function dadosRealistas(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
}

/** Instagram simulado como em leitura.spec.ts: `diasDeAtraso` apaga os últimos dias (dado parado). */
async function instagramParado(context: BrowserContext, diasDeAtraso: number, posts: unknown[] = []) {
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
  await context.route("**/rest/v1/instagram_posts**", (r) => r.fulfill({ json: pagina(r.request().url(), posts) }));
}

const rotaDoLink = (href: string) => {
  const sub = new URL(href, "http://x").pathname.replace(`/${CID}`, "").replace(/^\/+/, "");
  return sub ? `/_authenticated/$clientId/${sub}` : "/_authenticated/$clientId/";
};

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`(a)(b) ${perfil} a ${janela.width}x${janela.height}: de 3 a 5 ações com número, quem resolve e seta para a aba de origem`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);

      await expect(acoes(page).first()).toBeVisible();
      await expect(page.getByText("O que fazer esta semana?", { exact: true }).first()).toBeVisible();
      await expect(page.locator('[data-tela="hoje"]').getByRole("img", { name: "Número sem selo de confiança" })).toHaveCount(1);
      const n = await acoes(page).count();
      expect(n, "a Hoje mostra de 3 a 5 ações").toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
      console.log(`  Hoje (${perfil}, ${janela.width}x${janela.height}): ${n} ações`);

      for (let k = 0; k < n; k++) {
        const acao = acoes(page).nth(k);
        await expect(acao.locator("strong").first(), `a ação ${k + 1} tem o número em strong`).toBeVisible();
        await expect(acao.getByText(/Quem resolve:/).first()).toBeVisible();
        const seta = acao.locator("a.nx-acao-pilula__seta");
        await expect(seta).toHaveCount(1);
        const href = (await seta.getAttribute("href"))!;
        const rota = rotaDoLink(href);
        const linha = REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca);
        expect(linha, `a seta da ação ${k + 1} (${href}) tem de abrir uma linha do registro`).toBeTruthy();
        expect(linha!.situacao, `${href} aponta para tela tirada`).not.toBe("tirada");
        expect(linha!.soRedireciona, `${href} só redireciona`).toBeFalsy();
        expect(new URL(href, "http://x").searchParams.get("preset"), "a seta mantém o período").toBe("30d");
      }
      expect(await semRolagemLateral(page)).toBe(true);

      // Clicar na seta da primeira ação abre a aba de origem, com a pasta quando a aba é de tela juntada, mantendo o período.
      const href = (await acoes(page).first().locator("a.nx-acao-pilula__seta").getAttribute("href"))!;
      await acoes(page).first().locator("a.nx-acao-pilula__seta").click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(href, "http://x").pathname);
      expect(new URL(page.url()).searchParams.get("preset")).toBe("30d");
      if (ROTAS_DAS_ABAS.has(rotaDoLink(href))) await expect(page.locator("[data-juntada]")).toBeVisible();
      await expect(page.locator('[data-tela="hoje"]')).toHaveCount(0);
    });
  }
}

for (const janela of TELAS_DE_MEDIDA) {
  test(`(b) o texto da Hoje não traz os 4 números da Phase 9 (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosRealistas(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(acoes(page).first()).toBeVisible();

    const texto = await page.locator('[data-tela="hoje"]').innerText();
    expect(texto, "texto com Agendaram, Fecharam, Chamaram ou Foram").not.toMatch(GUARDA_DE_TEXTO_DA_HOJE);
    // Números de destaque: o número (em strong) e a legenda de cada ação. A frase da ação pode falar de consulta ("conferir
    // quantas conversas viraram consulta"); o que a guarda barra é o NÚMERO de agendamentos, vendas, consultas ou contatos.
    const destaques = await page.locator('[data-tela="hoje"] [data-acao-hoje] strong, [data-tela="hoje"] [data-numero-de-destaque]').allInnerTexts();
    expect(destaques.length, "há números de destaque para conferir").toBeGreaterThan(0);
    for (const t of destaques) expect(t, "número de destaque de agendamento, venda, consulta ou contato").not.toMatch(GUARDA_DE_NUMERO_DA_HOJE);
  });
}

test("(c) com o Instagram parado há 10 dias: Sem leitura, para consertar e quem resolve, o mesmo motivo de Resultados", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await instagramParado(context, 10);
  await mockPessoas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);

  const leitura = page.locator('[data-tela="hoje"] [data-peca="leitura"]');
  await expect(leitura.getByText(/Sem leitura:/)).toBeVisible();
  await expect(leitura.getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
  await expect(leitura.getByText(/Para consertar:/)).toBeVisible();
  await expect(leitura.getByText("Quem resolve: Equipe Doctor Creator")).toBeVisible();
  await expect(acoes(page)).toHaveCount(0);
  expect(await semRolagemLateral(page)).toBe(true);
  // O mesmo motivo que Resultados da clínica dá para os mesmos dados.
  await page.goto(`/${CID}?preset=30d`);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true }).getByText(/o Instagram está sem dado novo desde \d{2}\/\d{2}/)).toBeVisible();
});

/** Poucos posts, todos do mesmo formato (menos que a amostra mínima de comparação): só rendem fatos de uma ação ou duas. */
const POUCOS_POSTS = Array.from({ length: 6 }, (_, i) => ({
  id: `q${i}`, client_id: CID, windsor_media_id: `n${i}`, caption: `Post de teste ${i}`, format: "reels",
  posted_at: new Date(Date.now() - (i + 3) * 86400000).toISOString(), reach: 800 + i * 40, engagement: 40 + i, saved: 3 + i, permalink: null, thumbnail_url: null,
}));

for (const janela of TELAS_DE_MEDIDA) {
  test(`(d) com poucos dados: só as ações que existem, o aviso com o motivo e nenhuma ação inventada (${janela.width}x${janela.height})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    // Mocks reduzidos: só o Instagram, com 6 posts. Sem anúncios, sem CRM e sem pessoas, a regra só acha 1 ou 2 ações.
    await instagramParado(context, 0, POUCOS_POSTS);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);

    await expect(page.locator('[data-tela="hoje"] [data-peca="leitura"][data-modo="carregando"]')).toHaveCount(0);
    const aviso = page.locator('[data-tela="hoje"]').getByText(/^Poucas ações nesta semana:/);
    await expect(aviso).toBeVisible();
    const n = await acoes(page).count();
    expect(n, "com poucos dados a Hoje mostra de 0 a 2 ações, nunca completa até 3").toBeLessThanOrEqual(2);
    console.log(`  Hoje com poucos dados (${janela.width}x${janela.height}): ${n} ação(ões); aviso: ${await aviso.innerText()}`);
    // O aviso diz o motivo, curto, sem prometer nada.
    expect(await aviso.innerText()).toMatch(/^Poucas ações nesta semana: .{10,}\.$/);
    for (let k = 0; k < n; k++) await expect(acoes(page).nth(k).locator("strong").first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/hoje-poucas-${janela.width}.png`, fullPage: true });
  });
}

test("(d) sem nenhuma ação: o aviso diz o motivo e a tela não inventa ação", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await instagramParado(context, 0, []);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(page.locator('[data-tela="hoje"]').getByText(/^Poucas ações nesta semana:/)).toBeVisible();
  await expect(acoes(page)).toHaveCount(0);
});
