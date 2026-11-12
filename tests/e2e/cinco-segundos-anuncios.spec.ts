import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { conferirCincoSegundos, cortesEm, abrirVerTudo, textoVisivel } from "./apoio-cinco-segundos";
import { TELAS_DE_MEDIDA, LIMITE_DE_ALTURA, alturaDaAbaAberta, semRolagemLateral, mockAnuncios } from "./apoio-telas-juntadas";

// Anúncios no formato 5 segundos (Phase 03.1.1.1, plano 09): o veredito do custo por conversa contra o período anterior da própria clínica, com o
// sinal honesto, abre a tela; a régua dos próprios dias é a prova. Dados fictícios (nenhuma campanha, nome ou número de cliente real).

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="anuncios"]';

/** Troca o total do período em ads_resumo (as rotas registradas por último valem primeiro): o gasto e as conversas de agora e de antes. */
async function totaisDoSpec(context: BrowserContext, agora: { gasto: number; conversas: number }, antes: { gasto: number; conversas: number }) {
  const dia1 = (i: number) => new Date(Date.now() - (i + 1) * 86400_000).toISOString().slice(0, 10);
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const anterior = b.p_end < dia1(25);
    const t = anterior ? antes : agora;
    return r.fulfill({ json: [{ gasto: t.gasto, conversas: t.conversas, impressoes: 600000, cliques_link: 6000, campanhas: 3, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: t.gasto / t.conversas }] });
  });
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", variante: "bom" | "suspeito", largura = { width: 1440, height: 900 }) {
  await mockAccount(context, perfil);
  await mockAnuncios(context, variante);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/anuncios?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
}

const veredito = (page: Page) => page.locator(`${RAIZ} [data-peca="veredito"]`);

test("o custo por conversa caiu: o veredito diz Melhorou e mais barato, com o custo de antes", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockAnuncios(context, "bom");
  await totaisDoSpec(context, { gasto: 2400, conversas: 100 }, { gasto: 2900, conversas: 100 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/anuncios?preset=30d`);
  await expect(veredito(page)).toHaveAttribute("data-modo", "veredito");
  // O veredito é o primeiro bloco depois do cabeçalho.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  await expect(veredito(page).locator(".nx-selo")).toContainText("Melhorou");
  await expect(veredito(page).locator(".nx-veredito__frase")).toHaveText(/^R\$\s24 por conversa: 17% mais barato que no período anterior$/);
  await expect(veredito(page).locator(".nx-veredito__apoio")).toContainText(/Antes: R\$\s29,00 por conversa/);
});

test("o custo por conversa subiu: o veredito diz Piorou e mais caro, nunca mais barato", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockAnuncios(context, "bom");
  await totaisDoSpec(context, { gasto: 3000, conversas: 75 }, { gasto: 3000, conversas: 100 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/anuncios?preset=30d`);
  await expect(veredito(page)).toHaveAttribute("data-modo", "veredito");
  await expect(veredito(page).locator(".nx-selo")).toContainText("Piorou");
  await expect(veredito(page).locator(".nx-veredito__frase")).toHaveText(/^R\$\s40 por conversa: 33% mais caro que no período anterior$/);
  expect(await textoVisivel(veredito(page))).not.toMatch(/barato/i);
});

test("rastreio suspeito: o veredito diz Falta dado e manda para o Gestor de tráfego, sem culpar a campanha", async ({ page, context }) => {
  await abrir(page, context, "viewer", "suspeito");
  await expect(veredito(page)).toHaveAttribute("data-modo", "sem-leitura");
  await expect(veredito(page).getByText(/^Falta dado: o rastreio das conversas dos anúncios está suspeito/)).toBeVisible();
  await expect(veredito(page).getByText("Quem resolve: Gestor de tráfego")).toBeVisible();
  expect(await textoVisivel(veredito(page))).not.toMatch(/não convert|não rende|campanhas? ruins?|não funciona/i);
  // O aviso do rastreio fica à vista (honestidade primeiro), sem abrir o "Ver tudo", e a régua do custo não aparece (o custo não é confiável).
  await expect(page.locator(RAIZ).getByRole("alert").filter({ hasText: "As conversas dos anúncios não estão sendo contadas direito" })).toBeVisible();
  await expect(page.locator(`${RAIZ} [data-peca="regua-dos-dias"]`)).toHaveCount(0);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    for (const variante of ["bom", "suspeito"] as const) {
      test(`${perfil}: ${variante} a ${largura.width}x${largura.height} abre com o veredito, o Ver tudo fechado, dentro de 1,5 tela e sem nada cortado`, async ({ page, context }) => {
        await abrir(page, context, perfil, variante, largura);
        if (variante === "bom") await expect(page.locator(`${RAIZ} [data-peca="regua-dos-dias"]`)).toBeVisible();
        await conferirCincoSegundos(page, RAIZ, { minDescobertas: 0 });
        const { altura, janela } = await alturaDaAbaAberta(page, "[data-juntada]");
        await page.screenshot({ path: `test-results/redesenho/anuncios-${perfil}-${variante}-${largura.width}.png`, fullPage: true });
        console.log(`altura-anuncios perfil=${perfil} variante=${variante} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
        expect(altura, `Anúncios ${perfil} ${variante} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
        expect(await semRolagemLateral(page)).toBe(true);
      });
    }
  }
}

test("a régua dos próprios dias: tocar num ponto escreve a frase do dia e as pontas dizem mais barato e mais caro", async ({ page, context }) => {
  await abrir(page, context, "viewer", "bom");
  const regua = page.locator(`${RAIZ} [data-peca="regua-dos-dias"]`);
  await expect(regua).toBeVisible();
  await expect(regua.getByRole("heading", { level: 3 })).toContainText(/\d+ de \d+ dias saíram mais baratos que o seu custo de antes/);
  await expect(regua).toContainText("◀ mais barato");
  await expect(regua).toContainText("mais caro ▶");
  await expect(regua.locator(".nx-regua__antes-rotulo")).toContainText(/^antes R\$/);
  await expect(regua.locator(".nx-regua__agora-rotulo")).toContainText(/^Agora · R\$/);
  const pontos = regua.locator("button.nx-regua__ponto");
  expect(await pontos.count()).toBeGreaterThanOrEqual(5);
  // Os pontos de dias com o mesmo custo ficam um sobre o outro (só no mock): o teclado escolhe o primeiro sem depender de onde cai o toque.
  await pontos.first().focus();
  await page.keyboard.press("Enter");
  await expect(pontos.first()).toHaveAttribute("aria-pressed", "true");
  await expect(regua.locator(".nx-regua__leitura")).toContainText(/por conversa · (mais barato|mais caro|igual ao custo de) .*· 1º dia mais barato de \d+/);
  // Teclado: um só ponto entra na ordem de Tab; as setas andam entre os pontos.
  expect(await regua.locator('button.nx-regua__ponto[tabindex="0"]').count()).toBe(1);
  await page.keyboard.press("ArrowRight");
  await expect(pontos.nth(1)).toBeFocused();
  // As listas dos próprios dias (5 mais baratos, 3 mais caros), só desta clínica.
  await expect(regua.getByRole("heading", { level: 4 })).toHaveText("Seus dias mais baratos e mais caros");
  expect(await regua.locator(".nx-regua__linha").count()).toBe(8);
  expect(await cortesEm(page, RAIZ)).toEqual([]);
});

test("Ver tudo guarda o que a tela tinha antes: gráfico por dia, campanhas e o 4º número", async ({ page, context }) => {
  await abrir(page, context, "viewer", "bom");
  await abrirVerTudo(page, RAIZ);
  await expect(page.getByRole("slider", { name: /^Investimento e conversas por dia/ })).toBeVisible();
  await expect(page.locator(`${RAIZ} .nx-cartao`, { hasText: "Cliques no link" })).toBeVisible();
  await expect(page.getByRole("figure", { name: "Do anúncio à conversa" })).toBeVisible();
});
