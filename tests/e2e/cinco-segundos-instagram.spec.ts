import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram } from "./instagram-dados";
import { TELAS_DE_MEDIDA, LIMITE_DE_ALTURA, alturaDaAbaAberta, semRolagemLateral } from "./apoio-telas-juntadas";

// Instagram > Desempenho no formato 5 segundos (Phase 03.1.1.1, plano 07): o veredito de alcance e seguidores abre a tela, com 3 números-chave
// contra o período anterior da própria clínica. Dados fictícios (nenhuma legenda, nome ou número de cliente real).

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="conteudo"]';
const DIA = 86_400_000;
// O dia de hoje no fuso de Brasília (o mesmo da tela): perto da meia-noite o dia em UTC já é o seguinte e deslocaria a série.
const HOJE_BR = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const isoDia = (i: number) => new Date(new Date(`${HOJE_BR}T12:00:00Z`).getTime() - i * DIA).toISOString().slice(0, 10);

/**
 * Histórico diário do próprio spec: nos últimos 30 dias o alcance é 2.400 por dia (antes 1.000, então +140%), os seguidores sobem 20 por dia
 * (580 no período), os salvos caem de 40 para 36 por dia (-10%) e os toques no link caem de 5 para 3 por dia.
 */
async function historicoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      date: isoDia(i),
      client_id: CID,
      reach: i < 30 ? 2400 : 1000,
      new_followers: 20,
      unfollowers: 2,
      total_interactions: 60,
      likes: 40,
      comments: 4,
      saves: i < 30 ? 36 : 40,
      shares: 5,
      profile_links_taps: i < 30 ? 3 : 5,
      followers_count: 5000 - i * 20,
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    const off = Number(new URL(r.request().url()).searchParams.get("offset") ?? 0);
    return r.fulfill({ json: linhas.slice(off, off + 1000) });
  });
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockInstagram(context);
  await historicoDoSpec(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/conteudo?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
}

const cartoes = (page: Page) => page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);

test("o veredito abre a tela com alcance e seguidores e os 3 números vêm com ▲▼ contra o período anterior", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 });

  // O veredito é o primeiro bloco depois do cabeçalho: palavra com sinal e UMA frase com os dois números.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-selo")).toContainText("Em alta");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^Alcance subiu 140% e você ganhou 580 seguidores$/);

  // Os 3 números-chave, com o sinal no texto (nunca só a cor) e o selo com a palavra.
  await expect(cartoes(page)).toHaveCount(3);
  const [seg, alc, sal] = [cartoes(page).nth(0), cartoes(page).nth(1), cartoes(page).nth(2)];
  await expect(seg).toContainText("Seguidores");
  await expect(seg.locator(".nx-numero__valor")).toHaveText("5.000");
  await expect(seg).toContainText(/▲ \+580/);
  await expect(seg).toContainText("Em alta");
  await expect(alc).toContainText("Pessoas alcançadas");
  await expect(alc).toContainText(/▲ 140% · vs 30,0 mil antes/);
  await expect(sal).toContainText("Salvos");
  await expect(sal).toContainText(/▼ 10% · vs 1\.200 antes/);
  await expect(sal).toContainText("Em queda");
  // A linha de 30 dias vem do histórico que a tela já tem.
  await expect(alc.locator("svg").first()).toBeVisible();
  // Comparação só com a própria clínica (D-02).
  await expect(page.locator(RAIZ)).not.toContainText(/outras clínicas|carteira/i);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`${perfil}: ${largura.width}x${largura.height} abre com o Ver tudo fechado e dentro de 1,5 tela`, async ({ page, context }) => {
      await abrir(page, context, perfil, largura);
      await expect(cartoes(page)).toHaveCount(3);
      const { altura, janela } = await alturaDaAbaAberta(page, "[data-juntada]");
      console.log(`altura-desempenho perfil=${perfil} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura, `Desempenho ${perfil} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}
