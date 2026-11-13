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

const DIA = 86_400_000;
const dia1 = (i: number) => new Date(Date.now() - (i + 1) * DIA).toISOString().slice(0, 10);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Os 4 dias seguidos de verba baixa do spec (de 9 a 12 dias atrás, contando de ontem como 0). */
const DIAS_BAIXOS = [8, 9, 10, 11];

/**
 * Anúncios do próprio spec: 60 dias de 3 campanhas fictícias. Nos dias normais a verba é de R$ 100 a R$ 160 e as conversas variam de 3 a 6 agora e de 2 a 4 antes
 * (então cada dia tem um custo diferente); em 4 dias seguidos a verba cai para R$ 6 e a única conversa some. O período anterior tem menos conversas por dia
 * (o custo por conversa caiu). Nenhum nome, campanha ou número de cliente real.
 */
async function anunciosDoSpec(context: BrowserContext) {
  const campanhas = [
    { campaign_id: "c1", name: "Primeira consulta fictícia", objective: "MESSAGES" },
    { campaign_id: "c2", name: "Tráfego fictício", objective: "OUTCOME_TRAFFIC" },
  ];
  const dias = Array.from({ length: 60 }, (_, i) => {
    const baixo = DIAS_BAIXOS.includes(i);
    return { dia: dia1(i), gasto: baixo ? 6 : 100 + (i % 7) * 10, conversas: baixo ? 0 : i < 30 ? 3 + (i % 4) : 2 + (i % 3) };
  });
  const linhas = (de: string, ate: string) =>
    dias
      .filter((d) => d.dia >= de && d.dia <= ate)
      .flatMap((d) => [
        { date: d.dia, campaign_id: "c1", spend: d.gasto * 0.7, impressions: 4000, link_clicks: 60, conversations: d.conversas, leads: 0, landing_page_views: 0, reach: 3000, clicks: 70 },
        { date: d.dia, campaign_id: "c2", spend: d.gasto * 0.3, impressions: 3000, link_clicks: 40, conversations: 0, leads: 0, landing_page_views: 0, reach: 2000, clicks: 50 },
      ]);
  const soma = (de: string, ate: string) => dias.filter((d) => d.dia >= de && d.dia <= ate).reduce((t, d) => ({ gasto: t.gasto + d.gasto, conversas: t.conversas + d.conversas }), { gasto: 0, conversas: 0 });
  await context.route("**/rest/v1/meta_ads_daily?**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    return r.fulfill({ json: Number(p.get("offset") ?? 0) ? [] : linhas(de, ate) });
  });
  await context.route("**/rest/v1/meta_ads_campaigns?**", (r) => r.fulfill({ json: campanhas }));
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const t = soma(b.p_start, b.p_end);
    return r.fulfill({ json: [{ gasto: t.gasto, conversas: t.conversas, impressoes: 400000, cliques_link: 6000, campanhas: 2, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: t.conversas ? t.gasto / t.conversas : null }] });
  });
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    return r.fulfill({ json: dias.filter((d) => d.dia >= b.p_start && d.dia <= b.p_end).sort((a, c) => a.dia.localeCompare(c.dia)) });
  });
}

/** Resultados diários do spec: 20 pessoas mandaram mensagem por dia e 3 agendaram (15 de cada 100), então o gargalo é depois do anúncio. */
async function historicoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({ dia: dia1(i), mandaram_mensagem: 20, leads_novos: 12, antigos: 8, agendaram: 3, negociacao: 2, compareceram: null, fecharam: 1 }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

type Variante = "bom" | "suspeito" | "rico";

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", variante: Variante, largura = { width: 1440, height: 900 }) {
  await mockAccount(context, perfil);
  await historicoDoSpec(context);
  if (variante === "rico") await anunciosDoSpec(context);
  else await mockAnuncios(context, variante);
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
    for (const variante of ["bom", "rico", "suspeito"] as const) {
      test(`${perfil}: ${variante} a ${largura.width}x${largura.height} abre com o veredito, o Ver tudo fechado, dentro de 1,5 tela e sem nada cortado`, async ({ page, context }) => {
        await abrir(page, context, perfil, variante, largura);
        if (variante !== "suspeito") await expect(page.locator(`${RAIZ} [data-peca="regua-dos-dias"]`)).toBeVisible();
        // Veredito primeiro, no máximo 3 números, de 3 a 5 descobertas (cada uma com UMA ação e "Por quê?" de 2 a 3 barras), Ver tudo fechado, D-02 e nada cortado.
        await conferirCincoSegundos(page, RAIZ);
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

// ---------------------------------------------------------------- 3 números-chave e descobertas

const cartoes = (page: Page) => page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);
const descobertas = (page: Page) => page.locator(`${RAIZ} [data-peca="descoberta"]`);

test("os 3 números-chave: investido com os dias de verba baixa, conversas fora do normal e o custo com a melhor semana", async ({ page, context }) => {
  await abrir(page, context, "viewer", "rico");
  await expect(cartoes(page)).toHaveCount(3);
  const [inv, conv, custo] = [cartoes(page).nth(0), cartoes(page).nth(1), cartoes(page).nth(2)];
  await expect(inv).toContainText("Investido");
  await expect(inv).toContainText("4 dias com verba baixa");
  // O sinal vai escrito (▲ ▼ =), junto do número de antes da própria clínica.
  await expect(inv).toContainText(/[▲▼=] .*vs R\$\s.* antes/);
  await expect(conv).toContainText("Conversas pelo anúncio");
  await expect(conv.locator(".nx-selo")).toContainText("Fora do normal");
  await expect(conv).toContainText(/▲ \d+% · vs \d+ antes/);
  await expect(custo).toContainText("Custo por conversa");
  await expect(custo).toContainText(/Melhor semana: R\$\s[\d.,]+ \(7 dias até \d\d\/\d\d\)/);
  await expect(custo).toContainText(/▼ \d+% mais barato · vs R\$\s[\d.,]+ antes/);
  // A linha de 30 dias do custo é a média de 7 dias; o 4º número (Cliques no link) mora no Ver tudo.
  await expect(custo.getByRole("slider")).toHaveAttribute("aria-label", /custo por conversa, média de 7 dias/);
  await expect(page.locator(`${RAIZ} .nx-pagina__cartoes`, { hasText: "Cliques no link" })).toHaveCount(0);
  await abrirVerTudo(page, RAIZ);
  await expect(page.locator(`${RAIZ} .nx-cartao`, { hasText: "Cliques no link" })).toBeVisible();
});

test("a descoberta dos dias de verba baixa compara com os dias normais da própria clínica, mostra a faixa do normal e nunca estima conversa perdida", async ({ page, context }) => {
  await abrir(page, context, "viewer", "rico");
  const baixa = descobertas(page).filter({ has: page.locator(".nx-descoberta__frase", { hasText: "dias com verba baixa" }) });
  await expect(baixa).toHaveCount(1);
  const de = ddmm(dia1(Math.max(...DIAS_BAIXOS)));
  const ate = ddmm(dia1(Math.min(...DIAS_BAIXOS)));
  await expect(baixa.locator(".nx-descoberta__frase")).toHaveText(`4 dias com verba baixa (${de} a ${ate}): R$ 6,00 por dia.`);
  await expect(baixa.locator(".nx-selo")).toContainText("Fora do normal");
  await expect(baixa).toContainText("Gestor de tráfego");
  // O "Por quê?" abre as barras (verba, conversas e custo de dia baixo contra dia normal) e a faixa do normal com os dias baixos marcados.
  await baixa.getByRole("button", { name: "Por quê?" }).click();
  await expect(baixa.locator(".nx-barras__item")).toHaveCount(3);
  await expect(baixa.locator(".nx-barras__item", { hasText: "Custo nos dias baixos" })).toContainText("Falta dado");
  const faixa = baixa.locator('[data-peca="dias-com-faixa"][data-compacto]');
  await expect(faixa).toBeVisible();
  await expect(faixa.locator('[data-peca="faixa-do-normal"]')).toHaveCount(1);
  await expect(faixa.locator(".nx-dias__barra[data-destaque]")).toHaveCount(4);
  // Nenhuma frase da tela estima conversa perdida ou promete resultado (D-05).
  expect(await textoVisivel(page.locator(RAIZ))).not.toMatch(/a menos nesses|cerca de|estimativa|vai (render|fechar)|projeção/i);
  expect(await cortesEm(page, RAIZ)).toEqual([]);
});

test("a ação 'Ver plano de verba' só abre o plano dentro da tela e não grava nem envia nada", async ({ page, context }) => {
  const escritas: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (r.method() !== "GET" && r.method() !== "HEAD" && !pathname.includes("/rpc/") && !pathname.startsWith("/auth/")) escritas.push(`${r.method()} ${pathname}`);
  });
  await abrir(page, context, "viewer", "rico");
  const acao = descobertas(page).locator("button.nx-acao-pilula__seta").first();
  const baixa = descobertas(page).filter({ hasText: "dias com verba baixa" });
  await baixa.locator("button.nx-acao-pilula__seta").click();
  await expect(page.locator("details#detalhes-anuncios")).toHaveAttribute("open", "");
  await expect(page.locator("details#recomendacoes-anuncios")).toHaveAttribute("open", "");
  expect(await acao.count()).toBe(1);
  // Nenhum botão da tela promete enviar: o rótulo é de navegação.
  expect(await textoVisivel(page.locator(RAIZ))).not.toMatch(/Avisar a equipe|Pedir à equipe|Enviar/i);
  expect(escritas, "a ação não grava nada").toEqual([]);
});

test("o gargalo depois do anúncio leva o médico ao funil e a equipe ao Atendimento, sem estimar nada", async ({ page, context }) => {
  await abrir(page, context, "viewer", "rico");
  const gargalo = descobertas(page).filter({ hasText: "O gargalo é depois" });
  await expect(gargalo).toHaveCount(1);
  await expect(gargalo.locator(".nx-descoberta__frase")).toHaveText("O anúncio traz conversa. O gargalo é depois: de cada 100 conversas, 15 agendaram.");
  await expect(gargalo.locator("a.nx-acao-pilula__seta")).toHaveAttribute("href", /\/pacientes/);
  await expect(gargalo).toContainText("Ver o funil");
  await gargalo.getByRole("button", { name: "Por quê?" }).click();
  await expect(gargalo.locator(".nx-barras__item")).toHaveCount(3);
  await expect(gargalo.locator(".nx-barras__item", { hasText: "Do anúncio que viraram consulta" })).toContainText("Falta dado");
});

test("a equipe vê 'Ver atendimento' no gargalo depois do anúncio", async ({ page, context }) => {
  await abrir(page, context, "admin", "rico");
  const gargalo = descobertas(page).filter({ hasText: "O gargalo é depois" });
  await expect(gargalo).toHaveCount(1);
  await expect(gargalo.locator("a.nx-acao-pilula__seta")).toHaveAttribute("href", /\/atendimento/);
  await expect(gargalo).toContainText("Ver atendimento");
});

test("rastreio suspeito: nenhuma descoberta e o custo por conversa continua 'Não confiável'", async ({ page, context }) => {
  await abrir(page, context, "viewer", "suspeito");
  await expect(descobertas(page)).toHaveCount(0);
  await expect(cartoes(page).nth(2).locator(".nx-numero__valor")).toHaveText("Não confiável");
  await expect(cartoes(page).nth(2)).not.toContainText("mais barato");
  await expect(cartoes(page).nth(2)).not.toContainText("mais caro");
});
