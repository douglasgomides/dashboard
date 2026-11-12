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

/** Dia (em Brasília) `d` dias atrás, na hora cheia `h` de Brasília (UTC-3, sem horário de verão). */
const quando = (d: number, h: number) => new Date(new Date(`${isoDia(d)}T00:00:00Z`).getTime() + (h + 3) * 3_600_000).toISOString();
const post = (id: string, format: string, tema: string | null, d: number, h: number, reach: number, saved: number) => ({
  id, client_id: CID, windsor_media_id: id, caption: `Post fictício ${id}`, format, media_type: "IMAGE", media_product_type: "FEED", tema, funnel_stage: null, methodology_stage: null,
  posted_at: quando(d, h), reach, engagement: 50, saved, likes: 30, comments: 3, shares: 2, views: 1000, reel_skip_rate: null, reel_avg_watch_time_ms: null, permalink: null, thumbnail_url: null,
});

/**
 * Posts do próprio spec. Reels: 20 posts às 12h, 10 de Menopausa e 10 de Canetas emagrecedoras, 5 salvos cada. Estático: 12 posts às 18h, todos de
 * Sono, 15 salvos cada (então estático salva 3,0× mais, mas você postou 20 Reels e 12 estáticos). Carrossel: 3 posts de Tireoide, um deles às 7h de
 * uma segunda-feira com 90 mil de alcance (o maior de todos, mas um post só: nunca ganha o ★).
 */
function postsDoSpec() {
  const reels = Array.from({ length: 20 }, (_, i) => post(`r${i}`, "reels", i < 10 ? "Menopausa" : "Canetas emagrecedoras", i + 1, 12, 1000, 5));
  const estaticos = Array.from({ length: 12 }, (_, i) => post(`e${i}`, "estatico", "Sono", i + 1, 18, 1500, 15));
  const carrosseis = [post("c0", "carrossel", "Tireoide", 5, 7, 90_000, 8), post("c1", "carrossel", "Tireoide", 2, 22, 700, 4), post("c2", "carrossel", "Tireoide", 3, 22, 700, 4)];
  return [...reels, ...estaticos, ...carrosseis];
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockInstagram(context);
  await historicoDoSpec(context);
  const posts = postsDoSpec();
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return r.fulfill({ json: posts.slice(off, off + Number(p.get("limit") ?? 1000)) });
  });
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

const prova = (page: Page) => page.locator(`${RAIZ} #o-que-funciona`);

test("O que funciona: Formato mostra salvos e quanto você postou, e as 3 abas trocam pelas setas do teclado", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const card = prova(page);
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "O que funciona no seu Instagram" })).toBeVisible();
  const abas = card.getByRole("tab");
  await expect(abas).toHaveText(["Formato", "Horário", "Tema"]);
  await expect(abas.nth(0)).toHaveAttribute("aria-selected", "true");

  // Formato: salvos por post ao lado de quantos posts de cada formato, e a frase do descompasso (só os formatos com 8 posts ou mais).
  await expect(card.getByText("Salvos por post", { exact: true }).first()).toBeVisible();
  await expect(card.getByText("Quantos você postou", { exact: true })).toBeVisible();
  await expect(card).toContainText("20 posts");
  await expect(card).toContainText("12 posts");
  await expect(card.locator(".nx-funciona__frase")).toHaveText("Estático salva 3,0× mais, mas você postou 20 Reels e 12 estáticos.");

  // Setas do teclado: Formato -> Horário -> Tema -> Formato.
  await abas.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(abas.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(card.locator('[data-peca="mapa-dos-posts"]')).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(abas.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(card).toContainText("Número da direita: salvos por post, em média.");
  await page.keyboard.press("ArrowRight");
  await expect(abas.nth(0)).toHaveAttribute("aria-selected", "true");
});

test("Horário: só uma célula com 2 posts ou mais ganha o ★, e um post solto de alcance enorme não", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const card = prova(page);
  await card.getByRole("tab", { name: "Horário" }).click();
  const mapa = card.locator('[data-peca="mapa-dos-posts"]');
  await expect(mapa).toBeVisible();

  // Só as horas com post viram coluna: 7h, 12h, 18h e 22h.
  await expect(mapa.locator(".nx-mapa-posts__hora")).toHaveText(["7h", "12h", "18h", "22h"]);
  const celulas = mapa.locator("button.nx-mapa-posts__celula");
  expect(await celulas.count()).toBeGreaterThan(5);
  // Exatamente um ★ e ele fica numa célula com pelo menos 2 posts.
  const estrelas = mapa.locator(".nx-mapa-posts__estrela");
  await expect(estrelas).toHaveCount(1);
  const dona = mapa.locator("button.nx-mapa-posts__celula[data-melhor]");
  await expect(dona).toHaveCount(1);
  expect(Number(await dona.getAttribute("data-posts"))).toBeGreaterThanOrEqual(2);
  await expect(dona).toHaveAttribute("aria-label", /melhor horário/);
  // A célula do post solto (7h, 90 mil) existe, é a mais forte e NÃO tem estrela nem a palavra "melhor".
  const solta = mapa.locator('button.nx-mapa-posts__celula[data-posts="1"][aria-label*="90,0 mil"]');
  await expect(solta).toHaveCount(1);
  await expect(solta).not.toHaveAttribute("data-melhor", /.*/);
  await expect(solta.locator(".nx-mapa-posts__estrela")).toHaveCount(0);
  await expect(solta).toHaveAttribute("aria-label", /pouco para comparar/);
  expect(await solta.getAttribute("aria-label")).not.toMatch(/melhor/);
  // Toda célula com 1 post tem a borda tracejada e nenhuma tem ★.
  for (const c of await celulas.evaluateAll((els) => els.map((e) => ({ posts: Number(e.getAttribute("data-posts")), estrela: !!e.querySelector(".nx-mapa-posts__estrela"), poucos: e.hasAttribute("data-poucos") })))) {
    if (c.posts < 2) {
      expect(c.estrela).toBe(false);
      expect(c.poucos).toBe(true);
    }
  }

  // A frase de baixo começa pelo melhor horário e, ao tocar numa célula, compara com ele (só os próprios posts).
  const frase = mapa.locator('[data-peca="frase-do-horario"]');
  await expect(frase).toContainText("é seu melhor horário");
  await celulas.first().click();
  await expect(celulas.first()).toHaveAttribute("aria-pressed", "true");
  await expect(frase).not.toContainText("é seu melhor horário");
  await solta.click();
  await expect(frase).toContainText("só 1 post, pouco para comparar");
});
