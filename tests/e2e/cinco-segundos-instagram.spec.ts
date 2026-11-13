import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockInstagram } from "./instagram-dados";
import { conferirCincoSegundos, cortesEm, abrirVerTudo, textoVisivel } from "./apoio-cinco-segundos";
import { TELAS_DE_MEDIDA, LIMITE_DO_DESEMPENHO_COM_TOP5, alturaDaAbaAberta, semRolagemLateral } from "./apoio-telas-juntadas";

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
  // (O cartão não tem mais o ícone do canto, como no piloto: a conferência olha a própria linha de 30 dias.)
  await expect(alc.locator('[data-peca="linha-30-dias"] svg').first()).toBeVisible();
  // Comparação só com a própria clínica (D-02).
  await expect(page.locator(RAIZ)).not.toContainText(/outras clínicas|carteira/i);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`${perfil}: ${largura.width}x${largura.height} abre no formato 5 segundos, com o Ver tudo fechado, dentro do limite próprio (Top 5 à vista) e sem nada cortado`, async ({ page, context }) => {
      await abrir(page, context, perfil, largura);
      await expect(cartoes(page)).toHaveCount(3);
      // Veredito primeiro, no máximo 3 números, de 3 a 5 descobertas (cada uma com UMA ação e "Por quê?" de 2 a 3 barras), Ver tudo fechado, D-02 e nada cortado.
      await conferirCincoSegundos(page, RAIZ);
      const { altura, janela } = await alturaDaAbaAberta(page, "[data-juntada]");
      await page.screenshot({ path: `test-results/redesenho/desempenho-${perfil}-${largura.width}.png`, fullPage: true });
      console.log(`altura-desempenho perfil=${perfil} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      // João 13/11/2026: Top 5 na tela mesmo passando do limite. Esta tela tem um limite próprio em px (medida + 40 px), não 1,5 tela.
      expect(altura, `Desempenho ${perfil} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DO_DESEMPENHO_COM_TOP5[largura.width]);
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

test("nada cortado em 375, 1280 e 1440, com os 5 posts que mais salvaram à vista e também com o Ver tudo aberto", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 375, height: 812 });
  // O Top 5 mora na tela (João 13/11/2026), não no Ver tudo: à vista com o Ver tudo fechado.
  const top5 = page.locator(`${RAIZ} #top5-salvaram`);
  for (const largura of [375, 1280, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await expect(page.locator(`${RAIZ} [data-peca="veredito"]`)).toBeVisible();
    await expect(top5).toBeVisible();
    expect(await cortesEm(page, RAIZ), `cortes a ${largura}px (Ver tudo fechado)`).toEqual([]);
    expect(await semRolagemLateral(page), `rolagem lateral a ${largura}px`).toBe(true);
  }
  // Celular: a fileira do Top 5 rola de lado sozinha (a página não) e a dica de que há mais aparece.
  await page.setViewportSize({ width: 375, height: 812 });
  const fileira = top5.locator(".nx-top5__lista");
  expect(await fileira.evaluate((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "auto")).toBe(true);
  await expect(top5.locator(".nx-top5__dica")).toBeVisible();
  expect(await semRolagemLateral(page)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(top5.locator(".nx-top5__dica")).toBeHidden();
  await abrirVerTudo(page, RAIZ);
  // O Ver tudo não repete os 5 cartões.
  await expect(page.locator(`${RAIZ} details#detalhes-conteudo #top5-salvaram`)).toHaveCount(0);
  for (const largura of [375, 1280, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    expect(await cortesEm(page, RAIZ), `cortes a ${largura}px (Ver tudo aberto)`).toEqual([]);
    expect(await semRolagemLateral(page), `rolagem lateral a ${largura}px (Ver tudo aberto)`).toBe(true);
  }
});

test("as descobertas dizem só números da própria clínica, as ações só navegam e nada é enviado", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const itens = page.locator(`${RAIZ} [data-peca="descoberta"]`);
  await expect(itens).toHaveCount(3);
  // Em ordem de impacto: o que piorou (link da bio, salvos a cada mil) vem antes do que melhorou.
  await expect(itens.nth(0)).toContainText(/Link da bio: 90 toques em 72,0 mil pessoas alcançadas\./);
  await expect(itens.nth(1)).toContainText("De cada mil pessoas alcançadas, 15,0 salvaram. Antes eram 40,0.");
  await expect(itens.nth(2)).toContainText("Estático salva 3,0× mais, mas você postou 20 Reels e 12 estáticos.");
  // As outras 2 moram no começo do Ver tudo, no mesmo desenho das de cima, junto com o que só a leitura do período dizia (quick-ver-tudo).
  await expect(page.locator(`${RAIZ} [data-descoberta-extra^="instagram-"]`)).toHaveCount(2);
  await abrirVerTudo(page, RAIZ);
  await expect(page.locator(`${RAIZ} [data-descoberta-extra="instagram-melhor-horario"]`)).toContainText("é seu melhor horário");
  await expect(page.locator(`${RAIZ} [data-descoberta-extra="instagram-tema-campeao"]`)).toContainText("Sono salva 15 por post, o melhor tema. Foram 12 posts.");
  // O Top 5 fica à vista, entre as descobertas e o Ver tudo (João 13/11/2026), com os 5 maiores salvos em ordem (o carrossel de 8 salvos não
  // está entre eles). Sem medida de quem seguiu, "Falta dado" em cinza, nunca 0.
  const ordemDaPagina = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).map((c) => c.getAttribute("data-peca") ?? c.className));
  const iTop = ordemDaPagina.findIndex((x) => x === "nx-pagina__corpo");
  expect(iTop).toBeGreaterThan(ordemDaPagina.findIndex((x) => x === "descobertas"));
  expect(iTop).toBeLessThan(ordemDaPagina.findIndex((x) => x === "nx-pagina__detalhe"));
  const cartoesDoTop = page.locator(`${RAIZ} #top5-salvaram .nx-top5__item`);
  await expect(cartoesDoTop).toHaveCount(5);
  const salvos = await cartoesDoTop.locator(".nx-top5__salvos b").allInnerTexts();
  expect(salvos).toEqual(["15", "15", "15", "15", "15"]);
  await expect(cartoesDoTop.first().locator(".nx-top5__legenda")).toHaveAttribute("title", /Post fictício/);
  await expect(cartoesDoTop.first().locator(".nx-top5__fmt")).toHaveText("▣ Estático");
  await expect(cartoesDoTop.first().locator(".nx-top5__pos")).toHaveText("#1");
  await expect(cartoesDoTop.first()).toContainText("1,5 mil pessoas alcançadas");
  await expect(cartoesDoTop.first().locator("[data-falta-dado]")).toHaveText("Seguiram: Falta dado");
  await expect(cartoesDoTop.first()).not.toContainText(/\b0 seguiram/);
  await expect(cartoesDoTop.first()).toContainText(/Sono · \d{2}\/\d{2} \S+ 18h/);
  await expect(page.locator(`${RAIZ} #top5-salvaram`).getByRole("link", { name: /Abrir a aba Destaques/ })).toBeVisible();
  await expect(page.locator(`${RAIZ} #top5-salvaram`)).toContainText("Ver todos em Destaques");

  // A ação "Ver posts que mais salvaram" só leva ao Top 5 (à vista, o Ver tudo fica fechado); "Ver mapa de horários" só troca a aba da prova.
  await page.reload();
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Só conta o que acontece depois do clique: as leituras da página (rpc por POST) já aconteceram ao abrir.
  const escritas: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && !r.url().includes("/rest/v1/rota_acessos")) escritas.push(`${r.method()} ${r.url()}`);
  });
  await itens.nth(1).locator("button.nx-acao-pilula__seta").click();
  await expect(page.locator(`${RAIZ} #top5-salvaram`)).toBeInViewport();
  await expect(page.locator(`${RAIZ} details#detalhes-conteudo`)).not.toHaveAttribute("open", /.*/);
  // As ações de navegação levam às abas Posts e Links (só links, nada de POST).
  const acoes = await page.locator(`${RAIZ} [data-peca="descoberta"] a.nx-acao-pilula__seta`).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(acoes.some((h) => /\/posts/.test(h ?? ""))).toBe(true);
  expect(acoes.some((h) => /\/links/.test(h ?? ""))).toBe(true);
  // Nada que compare a clínica com outras, nem na tela inteira com o Ver tudo aberto.
  expect(await textoVisivel(page.locator(RAIZ))).not.toMatch(/outras clínicas|média da carteira|ranking|clínicas parecidas/i);
  expect(escritas).toEqual([]);
});

test("a ação do melhor horário só troca a aba da prova para Horário", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  // O melhor horário é a 4ª descoberta: mora no Ver tudo, e a ação dela abre a aba Horário.
  await abrirVerTudo(page, RAIZ);
  await page.locator(`${RAIZ} [data-descoberta-extra="instagram-melhor-horario"] button.nx-acao-pilula__seta`).click();
  await expect(prova(page).getByRole("tab", { name: "Horário" })).toHaveAttribute("aria-selected", "true");
  await expect(prova(page).locator('[data-peca="mapa-dos-posts"]')).toBeVisible();
});

/** Limite de altura por aba do O que funciona (px, por largura): medida de 13/11/2026 + 40 px. Horário no celular só fica no log (ver abaixo). */
const LIMITE_DA_ABA: Record<string, Record<number, number>> = {
  Formato: LIMITE_DO_DESEMPENHO_COM_TOP5,
  Tema: { 375: 1550 + 40, 1440: 1656 + 40 },
  Horário: { 1440: 1746 + 40 },
};

for (const largura of TELAS_DE_MEDIDA) {
  test(`${largura.width}x${largura.height}: as 3 abas do O que funciona (Formato, Horário e Tema) também cabem no limite próprio da tela e sem nada cortado`, async ({ page, context }) => {
    await abrir(page, context, "viewer", largura);
    for (const nome of ["Formato", "Horário", "Tema"]) {
      await prova(page).getByRole("tab", { name: nome }).click();
      await expect(prova(page).getByRole("tab", { name: nome })).toHaveAttribute("aria-selected", "true");
      const { altura, janela } = await alturaDaAbaAberta(page, "[data-juntada]");
      console.log(`altura-desempenho-aba aba=${nome} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      // O mapa de horários do celular (7 linhas de células tocáveis) só aparece depois de a pessoa abri-lo: fica medido e à vista no log.
      // João 13/11/2026: Top 5 na tela mesmo passando do limite. Cada aba tem o limite próprio desta tela em px: a altura medida em 13/11/2026
      // com aquela aba aberta mais 40 px (Formato: o mesmo da tela aberta; Tema: 1550 e 1656 px; Horário no computador: 1746 px).
      if (!(nome === "Horário" && largura.width <= 560)) {
        expect(altura, `Desempenho com a aba ${nome} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px`).toBeLessThanOrEqual(LIMITE_DA_ABA[nome][largura.width]);
      }
      expect(await cortesEm(page, RAIZ), `cortes na aba ${nome} a ${largura.width}px`).toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
    }
  });
}
