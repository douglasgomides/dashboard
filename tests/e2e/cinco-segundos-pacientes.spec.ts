import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { conferirCincoSegundos, cortesEm, textoVisivel } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockCrm, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// "Do contato à venda" (aba Funil de Onde os pacientes travam) no formato 5 segundos (Phase 03.1.1.1, plano 05): o veredito da maior perda abre
// a tela e "N pessoas ficaram na mesa" (Virou lead menos Atendido) é o número-chave 1, uma vez só na página visível. Dados fictícios.

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="pacientes"]';
const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
const num = (valor: number | null, extra: Record<string, unknown> = {}) => ({ valor, fonte: "crm", motivo_sem_dado: valor == null ? "Sem dado no CRM." : null, responsavel: "comercial", ...extra });
const pessoa = (chave: string, i: number) => ({ id: `${chave}${i}`, pessoa: `${chave}${i}`, nome: `Pessoa fictícia ${chave}${i}`, canal: "whatsapp", conversa_id: null, data: dia((i % 20) + 1), fonte: "crm", crm: null, leitura: null });
const listaInteira = (chaves: string[]) => ({ total: chaves.length, itens: chaves.map((c, i) => pessoa(c, i)) });
const listaCortada = (total: number) => ({ total, itens: Array.from({ length: 3 }, (_, i) => pessoa("x", i)) });
const CHAVES = ["mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam", "abordados", "engajaram_instagram"];

/**
 * Pacientes do período do próprio spec, com as 3 listas de Atendido inteiras (quem está em atendimento, quem agendou e quem fechou): 100 viraram
 * lead, 75 pessoas diferentes foram atendidas (40 em atendimento, 30 agendaram e 5 dos que fecharam não estavam nas outras duas), então 25
 * ficaram na mesa. 30 agendaram e 10 fecharam: a maior perda é de agendou para fechou. Registrado depois dos mocks compartilhados.
 */
async function pacientesComAtendidoMedido(context: BrowserContext) {
  const em = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefixo}${i}`);
  const agendaram = em("a", 30);
  const fecharam = [...agendaram.slice(0, 5), ...em("f", 5)];
  const listas = Object.fromEntries(CHAVES.map((k) => [k, listaCortada(5)]));
  listas.negociacao = listaInteira(em("n", 40));
  listas.agendaram = listaInteira(agendaram);
  listas.fecharam = listaInteira(fecharam);
  listas.leads_novos = listaCortada(100);
  await context.route("**/rest/v1/rpc/pacientes_periodo", (r) =>
    r.fulfill({
      json: {
        periodo: { de: dia(30), ate: dia(0) }, cliente_de_teste: false, tem_crm: true, tem_conversas: true, tem_leitura_ia: false, tem_funil_prospeccao: false,
        numeros: {
          mandaram_mensagem: num(500), leads_novos: num(100), antigos: num(40), agendaram: num(30), negociacao: num(40), compareceram: num(null),
          fecharam: num(10, { vendas: 10, sem_valor: 0, valor_total: 20000 }), abordados: num(null), engajaram_instagram: num(15),
        },
        listas,
      },
    }),
  );
}

/**
 * Histórico diário do próprio spec (os 29 dias fechados de cada período): agora 580 conversas, 203 leads, 58 agendaram e 29 fecharam; antes 522,
 * 232, 116 e 58. De cada 100 conversas viram lead 35 (eram 44), de cada 100 leads agendam 29 (eram 50) e de cada 100 agendados fecham 50 (igual).
 */
async function historicoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      dia: dia(i), mandaram_mensagem: i < 30 ? 20 : 18, leads_novos: i < 30 ? 7 : 8, antigos: 8, agendaram: i < 30 ? 2 : 4, negociacao: 2, compareceram: null, fecharam: i < 30 ? 1 : 2,
    }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

async function abrir(page: Page, context: BrowserContext, perfil: "viewer" | "admin", largura: { width: number; height: number }, atendidoMedido: boolean) {
  await mockAccount(context, perfil);
  await mockPessoas(context);
  await mockCrm(context);
  await historicoDoSpec(context);
  if (atendidoMedido) await pacientesComAtendidoMedido(context);
  await page.setViewportSize(largura);
  await page.goto(`/${CID}/pacientes?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="veredito"]:not([data-modo="carregando"])`)).toBeVisible();
}

const cartoes = (page: Page) => page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);

test("o veredito abre a tela com a maior perda e as pessoas na mesa aparecem uma vez só, com os pontos", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 }, true);

  // O veredito é o primeiro bloco depois do cabeçalho: "Maior perda" e UMA frase com a ligação que mais perde.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-selo")).toContainText("Maior perda");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText(/^Aqui você perde mais: só \d+% dos agendados fecham\.$/);

  // "Pessoas na mesa" é o número-chave 1: 100 leads menos 75 atendidos = 25, com a frase e a grade de pontos (cada ponto = 1 lead).
  await expect(cartoes(page)).toHaveCount(3);
  const mesa = cartoes(page).first();
  await expect(mesa).toContainText("Pessoas na mesa");
  await expect(mesa.locator(".nx-numero__valor")).toHaveText("25");
  await expect(mesa).toContainText("pessoas ficaram na mesa");
  await expect(mesa).toContainText("Falta dado · sem período anterior");
  await expect(mesa.locator(".nx-mesa__ponto")).toHaveCount(100);
  await expect(mesa.locator('.nx-mesa__ponto[data-estado="atendido"]')).toHaveCount(75);
  await expect(mesa.locator('.nx-mesa__ponto[data-estado="esperando"]')).toHaveCount(25);
  await expect(mesa.locator(".nx-mesa__pontos")).toHaveAttribute("aria-label", "75 atendidos e 25 esperando, cada ponto = 1 lead");
  await expect(mesa.locator(".nx-mesa__legenda")).toContainText("cada ponto = 1 lead");

  // W-1: a frase aparece uma vez só no texto visível da página.
  const texto = await textoVisivel(page.locator(RAIZ));
  expect((texto.match(/pessoas ficaram na mesa/g) ?? []).length).toBe(1);

  // Uma ação só, que abre uma lista que a tela já tem (nada é enviado).
  const botoes = mesa.getByRole("button");
  await expect(botoes).toHaveCount(1);
  await expect(botoes.first()).toHaveText("Ver quem está esperando");
  const escritas: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && !r.url().includes("/rest/v1/rota_acessos")) escritas.push(`${r.method()} ${r.url()}`);
  });
  await expect(page.locator(`${RAIZ} #lista-aberta`)).toHaveCount(0);
  await botoes.first().click();
  await expect(page.locator(`${RAIZ} #lista-aberta`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #lista-aberta`)).toContainText("Pessoas novas: 100 pessoas");
  expect(escritas).toEqual([]);
});

test("sem a medida de Atendido o cartão diz Falta dado com o motivo e não desenha ponto nem zero", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 }, false);
  await expect(cartoes(page)).toHaveCount(3);
  const mesa = cartoes(page).first();
  await expect(mesa).toContainText("Pessoas na mesa");
  await expect(mesa).toContainText(/Falta dado: .*atendido/i);
  await expect(mesa.locator(".nx-mesa__ponto")).toHaveCount(0);
  await expect(mesa.getByRole("button")).toHaveCount(0);
  const texto = await textoVisivel(page.locator(RAIZ));
  expect(texto).not.toMatch(/pessoas ficaram na mesa/);
  await expect(mesa.locator(".nx-numero__valor")).not.toHaveText(/^0$/);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const largura of TELAS_DE_MEDIDA) {
    test(`${perfil}: ${largura.width}x${largura.height} abre no formato 5 segundos, com o Ver tudo fechado, dentro de 1,5 tela e sem nada cortado`, async ({ page, context }) => {
      await abrir(page, context, perfil, largura, true);
      // Veredito primeiro, no máximo 3 números, de 3 a 5 descobertas (cada uma com UMA ação e "Por quê?" de 2 a 3 barras), Ver tudo fechado, D-02 e nada cortado.
      await conferirCincoSegundos(page, RAIZ);
      const { altura, janela } = await alturaDaAbaAberta(page, "[data-juntada]");
      console.log(`altura-funil perfil=${perfil} largura=${largura.width} altura=${Math.round(altura)} janela=${janela} razao=${(altura / janela).toFixed(2)}`);
      expect(altura, `Funil ${perfil} a ${largura.width}px: ${Math.round(altura)} px de ${janela} px (${(altura / janela).toFixed(2)}x)`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}

test("nada cortado em 375, 1280 e 1440 e sem rolagem lateral", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 375, height: 812 }, true);
  for (const largura of [375, 1280, 1440]) {
    await page.setViewportSize({ width: largura, height: 900 });
    await expect(page.locator(`${RAIZ} [data-peca="veredito"]`)).toBeVisible();
    expect(await cortesEm(page, RAIZ), `cortes a ${largura}px`).toEqual([]);
    expect(await semRolagemLateral(page), `rolagem lateral a ${largura}px`).toBe(true);
  }
});

test("as descobertas dizem a conta de cada 100, o Por quê? mostra 2 a 3 barras e nada é enviado ao clicar", async ({ page, context }) => {
  await abrir(page, context, "viewer", { width: 1440, height: 900 }, true);
  const escritas: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && !r.url().includes("/rest/v1/rota_acessos")) escritas.push(`${r.method()} ${r.url()}`);
  });
  const itens = page.locator(`${RAIZ} [data-peca="descoberta"]`);
  expect(await itens.count()).toBeGreaterThanOrEqual(3);
  // De cada 100 leads agendam 29 (eram 50) e de cada 100 conversas viram lead 35 (eram 44): contas só desta clínica, contra o período anterior dela.
  await expect(itens.filter({ hasText: "De cada 100 leads, 29 agendam. Antes eram 50." })).toHaveCount(1);
  await expect(itens.filter({ hasText: "Das conversas, 35 de cada 100 viram lead. Antes eram 44." })).toHaveCount(1);
  await expect(itens.filter({ hasText: /Entre Agendou e Fechou, \d+% passam\./ })).toHaveCount(1);
  // Cada "Por quê?" abre de 2 a 3 barras; as ações só abrem uma lista da tela ou levam ao funil.
  for (let k = 0; k < (await itens.count()); k++) {
    const d = itens.nth(k);
    await d.locator("button.nx-descoberta__porque-botao").click();
    const barras = await d.locator(".nx-barras__item").count();
    expect(barras).toBeGreaterThanOrEqual(2);
    expect(barras).toBeLessThanOrEqual(3);
  }
  const acaoAgendou = itens.filter({ hasText: "De cada 100 leads" }).locator("button.nx-acao-pilula__seta");
  await acaoAgendou.click();
  await expect(page.locator(`${RAIZ} #lista-aberta`)).toBeVisible();
  await expect(page.locator(`${RAIZ} #lista-aberta`)).toContainText("Agendaram");
  expect(escritas).toEqual([]);
});

test("o funil desenhado continua sendo a prova: a gaveta abre numa etapa e o Esc fecha", async ({ page, context }) => {
  await abrir(page, context, "admin", { width: 1440, height: 900 }, true);
  await expect(page.locator(`${RAIZ} [data-peca="funil-desenhado"]`)).toBeVisible();
  const etapas = page.locator(`${RAIZ} .nx-funil-d__etapa`);
  await expect(etapas).toHaveCount(5);
  await etapas.nth(2).click();
  const gaveta = page.locator(`${RAIZ} dialog.nx-funil-d__gaveta`);
  await expect(gaveta).toBeVisible();
  await expect(gaveta).toContainText("Atendido");
  await page.keyboard.press("Escape");
  await expect(gaveta).toBeHidden();
});
