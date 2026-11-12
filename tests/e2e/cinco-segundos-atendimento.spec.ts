import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { cortesEm, textoVisivel } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, semRolagemLateral } from "./apoio-telas-juntadas";

// Atendimento > Qualidade ("Números do atendimento") no formato 5 segundos (Phase 03.1.1.1, plano 06): o veredito "Chegam N conversas por dia." abre
// a tela e o gráfico de conversas por dia mostra a faixa do normal DESTA clínica, com ▲/▼ escritos nos dias fora dela. Dados fictícios.
// Este spec roda na porta 5199 (o plano 07 roda em paralelo na 5198).

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="atendimento"]';
const dia = (i: number) => new Date(Date.now() - 3 * 3600_000 - i * 86400000).toISOString().slice(0, 10);

/** Conversas fictícias de cada dia (i = quantos dias atrás): perto de 17 por dia, um dia de pico (12 dias atrás) e um dia quase parado (20 dias atrás). */
const PADRAO = [16, 18, 17, 19, 15, 18, 17];
const conversasDoDia = (i: number) => (i === 12 ? 52 : i === 20 ? 3 : PADRAO[i % 7]);

/** WTS do spec: os mesmos dados para qualquer janela pedida (filtra por p_start e p_end), com 70 dias de histórico. */
async function mockWts(context: BrowserContext) {
  const rpc = (nome: string, json: unknown) => context.route(`**/rest/v1/rpc/${nome}`, (r) => r.fulfill({ json }));
  await rpc("wts_resumo", [{ atendimentos: 520, contatos_distintos: 410, espera_mediana_seg: 900, espera_cobertura: 480, atendimento_mediano_seg: 40000, em_andamento: 10, concluidos: 510, sem_roteamento: 20 }]);
  await context.route("**/rest/v1/rpc/wts_volume_diario", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const de = String(b.p_start ?? "0000");
    const ate = String(b.p_end ?? "9999");
    const linhas = Array.from({ length: 70 }, (_, i) => ({ dia: dia(i), atendimentos: conversasDoDia(i), espera_mediana_seg: 600 + (i % 5) * 30 }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b2) => a.dia.localeCompare(b2.dia));
    return r.fulfill({ json: linhas });
  });
  await rpc("wts_por_departamento", [{ departamento: "Comercial", atendimentos: 480, fatia: 92, espera_mediana_seg: 800, atendimento_mediano_seg: 30000 }]);
  await rpc("wts_por_agente", [{ agente: "Atendente fictícia", atendimentos: 300, concluidos: 290, espera_mediana_seg: 700, atendimento_mediano_seg: 30000 }]);
}

/** Alcance diário do Instagram do spec: perto de 1.000, com um dia de pico de 5.000 no mesmo dia do pico de conversas (12 dias atrás). */
async function mockInstagramDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({ date: dia(i), client_id: CID, reach: i === 12 ? 5000 : 900 + ((i * 37) % 200) }))
      .filter((l) => l.date >= de && l.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    const off = Number(p.get("offset") ?? 0);
    return r.fulfill({ json: linhas.slice(off, off + Number(p.get("limit") ?? 1000)) });
  });
}

/** Conversas pelo anúncio do spec: 12 a 14 por dia, com o dia quase parado (20 dias atrás) em 2. */
async function mockAnunciosDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const de = String(b.p_start ?? "0000");
    const ate = String(b.p_end ?? "9999");
    const linhas = Array.from({ length: 70 }, (_, i) => ({ dia: dia(i), gasto: 40, conversas: i === 20 ? 2 : 12 + (i % 3) }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b2) => a.dia.localeCompare(b2.dia));
    return r.fulfill({ json: linhas });
  });
}

/**
 * Histórico diário do spec (quem chamou e quem virou lead): agora 20 chamaram e 6 viraram lead por dia (30 de cada 100); antes 20 e 8 (40 de cada 100),
 * então "Viram lead, de cada 100" cai 10 pontos contra o período anterior da própria clínica.
 */
async function mockHistoricoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      dia: dia(i), mandaram_mensagem: 20, leads_novos: i < 30 ? 6 : 8, antigos: 8, agendaram: 3, negociacao: 2, compareceram: null, fecharam: 1,
    }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", largura: { width: number; height: number }) {
  await mockAccount(context, perfil);
  await mockWts(context);
  await mockInstagramDoSpec(context);
  await mockAnunciosDoSpec(context);
  await mockHistoricoDoSpec(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/atendimento?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
}

test("o veredito abre a tela com as conversas por dia e a faixa do normal desta clínica, com ▲ e ▼ escritos nos dias fora dela", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 });

  // O veredito é o primeiro bloco depois do cabeçalho: "Chegam N conversas por dia." e, em apoio, o normal e quantos dias saíram dele.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^Chegam \d+ conversas por dia\.$/);
  await expect(veredito.locator(".nx-veredito__apoio")).toHaveText(/^Normal: de \d+ a \d+ conversas por dia · .* fora disso\.$/);

  // A faixa do normal vem só dos dias desta clínica, escrita no gráfico; o dia de pico leva ▲ e o dia quase parado leva ▼ (texto, não só cor).
  const faixa = page.locator(`${RAIZ} [data-peca="faixa-do-normal"]`);
  await expect(faixa).toBeVisible();
  await expect(faixa).toContainText(/^normal: \d+-\d+$/);
  const marcas = page.locator(`${RAIZ} .nx-dias__barra[data-marca="acima"] .nx-dias__marca`);
  await expect(marcas.first()).toHaveText("▲");
  await expect(page.locator(`${RAIZ} .nx-dias__barra[data-marca="abaixo"] .nx-dias__marca`).first()).toHaveText("▼");
  // A legenda diz o mesmo com palavras.
  const legenda = page.locator(`${RAIZ} .nx-dias__legenda`);
  await expect(legenda).toContainText("faixa do normal");
  await expect(legenda).toContainText("▲ acima do normal");
  await expect(legenda).toContainText("▼ abaixo do normal");
  await expect(legenda).toContainText("dia normal");
  // O gráfico é um slider de teclado e a dica do dia diz data e valor.
  const slider = page.getByRole("slider", { name: "conversas por dia, com a faixa do normal" });
  await expect(slider).toBeVisible();
  await slider.focus();
  await slider.press("Home");
  await expect(page.locator(`${RAIZ} .nx-dias__dica`)).toHaveText(/^dia \d{2}\/\d{2}: \d+$/);
});

test("tudo o que a tela mostrava mora no Ver tudo, fechado, na mesma ordem, com os mesmos ids", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const verTudo = page.locator(`${RAIZ} details:has(> summary b:text-is("Ver tudo"))`).first();
  await expect(verTudo).toHaveCount(1);
  expect(await verTudo.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await verTudo.locator("> summary").click();
  const regiao = page.getByRole("region", { name: "Números do atendimento", exact: true });
  await expect(regiao.locator(".ws-metric-value")).toHaveText(["520", "15min", "4%", /\d+/]);
  await expect(page.locator(`${RAIZ} #volume`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #por-equipe`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #tempo-fechar`)).toBeVisible();
  const ids = await page.locator(`${RAIZ} #volume, ${RAIZ} #por-equipe, ${RAIZ} #tempo-fechar`).evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(["volume", "por-equipe", "tempo-fechar"]);
  await expect(page.getByRole("slider", { name: /^Atendimentos por dia e espera/ })).toBeVisible();
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`${perfil}: ${largura.width}x${largura.height} abre com o Ver tudo fechado, dentro de 1,5 tela e sem nada cortado`, async ({ page, context }) => {
      await abrir(page, context, perfil, largura);
      // Admin: a tela mora na pasta Atendimento (mede a pasta inteira). Médico por link: mede a página.
      const { altura, janela } = await alturaDaAbaAberta(page, perfil === "admin" ? "[data-juntada]" : ".nx-pagina");
      console.log(`altura-atendimento perfil=${perfil} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura, `Atendimento ${perfil} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await cortesEm(page, RAIZ), "nada pode ficar cortado").toEqual([]);
      expect(await semRolagemLateral(page)).toBe(true);
      const texto = await textoVisivel(page.locator(RAIZ));
      expect(texto).not.toContain("EXEMPLO");
    });
  }
}

const cartoes = (page: Page) => page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);

test("os 3 números-chave comparam a clínica com ela mesma e dizem Falta dado quando não dá para comparar", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 });
  await expect(cartoes(page)).toHaveCount(3);
  const [conversas, taxa, pessoas] = [cartoes(page).nth(0), cartoes(page).nth(1), cartoes(page).nth(2)];
  await expect(conversas).toContainText("Conversas");
  await expect(taxa).toContainText("Viram lead, de cada 100");
  await expect(pessoas).toContainText("Pessoas diferentes");
  // Conversas: a soma dos dias fechados contra a do período anterior de mesmo tamanho (os dois do WTS desta clínica).
  await expect(conversas.locator(".nx-numero__valor")).toHaveText(/^\d/);
  await expect(conversas).toContainText(/(▲|▼) \d+% · (melhor|pior) que antes|= igual/);
  // Viram lead de cada 100: 30 agora contra 40 antes, em pontos.
  await expect(taxa.locator(".nx-numero__valor")).toHaveText("30");
  await expect(taxa).toContainText("▼ 10 pontos · pior que antes");
  // Pessoas diferentes: o mesmo contato nas duas janelas do mock, então "igual".
  await expect(pessoas.locator(".nx-numero__valor")).toHaveText("410");
  await expect(pessoas).toContainText("= igual");
  // Nenhum cartão diz "0" no lugar de um dado que falta.
  for (const c of [conversas, taxa, pessoas]) await expect(c.locator(".nx-numero__valor")).not.toHaveText(/^0$/);
});

test("o dia cruzado abre no dia fora do normal de maior alcance e cada dia tocado diz a causa por regra", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 });
  const escritas: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && !r.url().includes("/rest/v1/rota_acessos")) escritas.push(`${r.method()} ${r.url()}`);
  });
  const painel = page.locator(`${RAIZ} [data-peca="dia-cruzado"]`);
  // Abre no pico (12 dias atrás: o dia de maior alcance entre os dias fora do normal): ▲ acima do normal e o Instagram bombou.
  await expect(painel).toBeVisible();
  await expect(painel).toContainText("▲ acima do normal");
  await expect(painel).toContainText("Alcance no Instagram");
  await expect(painel).toContainText("5.000");
  await expect(painel).toContainText(/▲ \d+% vs dia comum/);
  await expect(painel).toContainText("Conversas pelo anúncio");
  await expect(painel).toContainText(/\d+ viraram lead/);
  await expect(painel.locator(".nx-dia-cruzado__causa")).toHaveText("Provável causa: o Instagram bombou nesse dia.");
  await expect(page.locator(`${RAIZ} .nx-dias__barra[data-sel]`)).toHaveCount(1);

  // O dia quase parado: o anúncio quase parou.
  await page.locator(`${RAIZ} .nx-dias__barra[data-marca="abaixo"]`).first().click();
  await expect(painel).toContainText("▼ abaixo do normal");
  await expect(painel.locator(".nx-dia-cruzado__causa")).toHaveText("Provável causa: o anúncio quase parou nesse dia.");

  // Um dia normal.
  await page.locator(`${RAIZ} .nx-dias__barra[data-marca="normal"]`).nth(2).click();
  await expect(painel).toContainText("dentro do normal");
  await expect(painel.locator(".nx-dia-cruzado__causa")).toHaveText("Dia comum.");

  // Tocar de novo no mesmo dia fecha o painel e volta a dica.
  await page.locator(`${RAIZ} .nx-dias__barra[data-marca="normal"]`).nth(2).click();
  await expect(painel).toHaveCount(0);
  await expect(page.locator(`${RAIZ} .nx-dia-cruzado__dica`)).toHaveText("Toque num dia para ver o que aconteceu");

  // Pelo teclado: setas andam, Enter escolhe.
  const slider = page.getByRole("slider", { name: "conversas por dia, com a faixa do normal" });
  await slider.focus();
  await slider.press("Home");
  await slider.press("Enter");
  await expect(painel).toBeVisible();
  expect(escritas).toEqual([]);
});

test("sem o Instagram a linha do alcance diz Falta dado e o Instagram nunca vira causa", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await mockWts(context);
  await mockAnunciosDoSpec(context);
  await mockHistoricoDoSpec(context);
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => r.fulfill({ status: 500, json: { message: "simulated unavailable data source" } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/atendimento?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
  // Sem alcance não há dia inicial: a tela pede o toque.
  await expect(page.locator(`${RAIZ} .nx-dia-cruzado__dica`)).toHaveText("Toque num dia para ver o que aconteceu");
  await page.locator(`${RAIZ} .nx-dias__barra[data-marca="acima"]`).first().click();
  const painel = page.locator(`${RAIZ} [data-peca="dia-cruzado"]`);
  await expect(painel).toBeVisible();
  const alcance = painel.locator(".nx-dia-cruzado__item", { hasText: "Alcance no Instagram" });
  await expect(alcance.locator("[data-falta-dado]")).toContainText("Falta dado");
  await expect(painel.locator(".nx-dia-cruzado__causa")).toHaveText("Sem causa clara nos outros dados.");
  await expect(painel).not.toContainText("Instagram bombou");
});
