import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { GUARDA_SEM_COMPARAR_CLINICAS } from "../../src/lib/leitura/cinco-segundos";
import { abrirVerTudo, conferirCincoSegundos, cortesEm, textoVisivel } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// A Hoje no formato 5 segundos, parte da nota do dia e da prova (Phase 03.1.1.1, plano 02, D-03, CINCO-01): o veredito é o anel da nota
// (0 a 100) com a palavra da faixa e UMA frase; tocar no anel abre o que ajudou (▲), o que puxou para baixo (▼), os sinais sem dado e a
// regra do Nexo; a prova mostra cada etapa do funil contra o período anterior, com "aqui virou" onde o funil passa de crescer para cair;
// o "Ver tudo" ganha a tabela dos números do período. Dados fictícios (os mocks do hoje.spec), só leitura; nenhum número ou nome dos
// pilotos entra aqui.

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="hoje"]';
const hoje = (page: Page) => page.locator(RAIZ);
const anel = (page: Page) => hoje(page).locator("button.nx-nota__anel");
const painel = (page: Page) => hoje(page).locator('[data-peca="nota-fatores"]');
const prova = (page: Page) => hoje(page).locator('[data-peca="etapas-contra-antes"]');
const linhaDaEtapa = (page: Page, nome: string) => prova(page).locator(`[data-etapa="${nome}"] button`);
/** O que o olho lê em cada valor da prova ("▲ 62%", "▼ 50%", "= igual" ou "—"): sem o texto só para leitor de tela. */
const valoresDaProva = (page: Page) =>
  prova(page)
    .locator(".nx-etapas__valor")
    .evaluateAll((els) =>
      els.map((el) => {
        const copia = el.cloneNode(true) as HTMLElement;
        copia.querySelectorAll(".sr-only").forEach((x) => x.remove());
        return (copia.textContent ?? "").replace(/\s+/g, " ").trim();
      }),
    );
const JANELAS_DO_CORTE = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

/** Os mesmos dados realistas do hoje.spec: Instagram, pessoas, anúncios e CRM. */
async function dadosRealistas(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
}

/**
 * Histórico diário que sobe e depois cai (linhas extras só deste spec, por cima do mock padrão): conversas e leads cresceram contra o
 * período anterior, agendaram e fecharam caíram pela metade. A Hoje mostra "aqui virou" entre Virou lead e Agendou.
 */
async function funilQueVira(context: BrowserContext) {
  const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => {
      const agora = i < 30;
      return { dia: dia(i), mandaram_mensagem: agora ? 30 : 20, leads_novos: agora ? 20 : 12, antigos: 8, agendaram: agora ? 2 : 4, negociacao: 2, compareceram: null, fecharam: agora ? 1 : 2 };
    })
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`(a) ${perfil} a ${janela.width}x${janela.height}: o anel da nota abre o porquê, a prova mostra as 5 etapas e a Hoje cabe em 1,5 tela`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);

      // O formato 5 segundos inteiro (veredito primeiro, até 3 números, 3 descobertas com Por quê?, Ver tudo fechado, D-02, nada cortado).
      await conferirCincoSegundos(page, RAIZ);

      // O anel: número de 0 a 100 (ou "Falta dado") e a palavra da faixa no selo, sem nenhuma outra nota na tela.
      const numero = hoje(page).locator(".nx-nota__numero");
      if (await numero.count()) {
        const n = Number((await numero.innerText()).trim());
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(100);
        await expect(hoje(page).locator(".nx-veredito .nx-selo__texto")).toHaveText(/^(Ruim|Atenção|Bom|Ótimo)$/);
      } else {
        await expect(hoje(page).locator(".nx-nota__falta")).toHaveText("Falta dado");
        await expect(hoje(page).locator(".nx-veredito .nx-selo__texto")).toHaveText("Falta dado");
      }

      // A prova: as 5 etapas na ordem, com o sentido em texto (▲ ▼ ou "= igual", nunca só a cor) e Atendido listrado "Falta dado".
      await expect(prova(page)).toBeVisible();
      const nomes = await prova(page).locator(".nx-etapas__nome").allInnerTexts();
      expect(nomes.map((t) => t.trim())).toEqual(["Conversou", "Virou lead", "Atendido", "Agendou", "Fechou"]);
      for (const valor of await valoresDaProva(page)) expect(valor).toMatch(/^(▲ \d+%|▼ \d+%|= igual|—)$/);
      await expect(linhaDaEtapa(page, "Atendido").locator("[data-falta]")).toHaveText("Falta dado");
      await expect(linhaDaEtapa(page, "Atendido")).toHaveAttribute("title", /Falta dado: o período anterior de pessoas não é medido/);
      await expect(prova(page).locator('[data-peca="virada"]'), "com os mocks planos o funil não vira").toHaveCount(0);

      // Altura com o "Ver tudo" fechado: no máximo 1,5 vez a janela; nada rola de lado.
      const { altura } = await hoje(page).evaluate((el) => ({ altura: el.getBoundingClientRect().height }));
      console.log(`  Hoje nota+prova (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${LIMITE_DE_ALTURA * janela.height}`);
      expect(altura, `a Hoje mede ${Math.round(altura)} px`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela.height);
      expect(await semRolagemLateral(page)).toBe(true);
    });

    test(`(b) ${perfil} a ${janela.width}x${janela.height}: com o funil que vira, "aqui virou" aparece antes de Agendou e a Hoje continua dentro de 1,5 tela`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosRealistas(context);
      await funilQueVira(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}/hoje?preset=30d`);
      await conferirCincoSegundos(page, RAIZ);

      await expect(prova(page).locator("h2")).toHaveText("Até Virou lead, tudo cresce. Depois, cai.");
      const virada = prova(page).locator('[data-peca="virada"]');
      await expect(virada).toHaveCount(1);
      await expect(virada).toContainText("aqui virou");
      // A linha tracejada vem logo antes da primeira etapa que cai (Agendou) e depois de Atendido.
      const ordem = await prova(page).locator("ul > li").evaluateAll((els) => els.map((e) => e.getAttribute("data-peca") === "virada" ? "virada" : e.getAttribute("data-etapa")));
      expect(ordem).toEqual(["Conversou", "Virou lead", "Atendido", "virada", "Agendou", "Fechou"]);
      // Os valores em texto: as duas primeiras sobem, as duas últimas caem; Atendido segue sem variação.
      const valores = await valoresDaProva(page);
      expect(valores[0]).toMatch(/^▲ \d+%$/);
      expect(valores[1]).toMatch(/^▲ \d+%$/);
      expect(valores[2]).toBe("—");
      expect(valores[3]).toMatch(/^▼ \d+%$/);
      expect(valores[4]).toMatch(/^▼ \d+%$/);

      const { altura } = await hoje(page).evaluate((el) => ({ altura: el.getBoundingClientRect().height }));
      console.log(`  Hoje com virada (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${LIMITE_DE_ALTURA * janela.height}`);
      expect(altura, `a Hoje com a virada mede ${Math.round(altura)} px`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * janela.height);
      expect(await semRolagemLateral(page)).toBe(true);
    });
  }
}

test("(c) o anel lista o que ajudou (▲), o que puxou para baixo (▼) e os sinais sem dado com o motivo, e a regra do Nexo fecha ao tocar de novo", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await funilQueVira(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}/hoje?preset=30d`);

  const botao = anel(page);
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(botao).toHaveAttribute("title", "Toque para ver o que puxou a nota");
  await expect(painel(page)).toBeHidden();
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "true");
  await expect(painel(page)).toBeVisible();

  // ▲ e ▼ em texto; com os mocks que viram, conversas ajudam e fecharam puxam para baixo.
  await expect(painel(page).locator(".nx-nota__titulo--bom")).toHaveText("▲ O que ajudou");
  await expect(painel(page).locator(".nx-nota__titulo--ruim")).toHaveText("▼ O que puxou para baixo");
  await expect(painel(page).locator('.nx-nota__sinal[data-tom="bom"][data-fator="conversas"]')).toBeVisible();
  await expect(painel(page).locator('.nx-nota__sinal[data-tom="ruim"][data-fator="fecharam"]')).toBeVisible();
  // Cada sinal diz "atual contra anterior · ▲/▼ N%" e os pontos (50 = igual).
  for (const linha of await painel(page).locator(".nx-nota__sinal-linha").allInnerTexts()) expect(linha).toMatch(/ contra .* · (▲|▼) \d+%| contra .* · = igual/);
  // O sinal que não tem período anterior medido fica de fora da média, com o motivo, e nunca vira 0.
  const falta = painel(page).locator('[data-peca="nota-falta-dado"]');
  await expect(falta).toBeVisible();
  await expect(falta).toContainText("Leads que foram atendidos");
  await expect(falta).toContainText("Falta dado: O período anterior de pessoas não é medido");
  // As faixas e a regra escrita.
  await expect(painel(page).locator(".nx-nota__faixa")).toHaveText(["0–49 Ruim", "50–69 Atenção", "70–84 Bom", "85–100 Ótimo"]);
  await expect(painel(page).locator(".nx-nota__faixa[data-atual]")).toHaveCount(1);
  await expect(painel(page)).toContainText("Regra do Nexo");
  await expect(painel(page)).toContainText("não garante resultado");
  expect(await cortesEm(page, RAIZ), "nada cortado com o painel aberto").toEqual([]);
  await botao.click();
  await expect(botao).toHaveAttribute("aria-expanded", "false");
  await expect(painel(page)).toBeHidden();
});

test("(d) tocar numa etapa da prova abre uma linha fixa com o número de agora e o do período anterior, e nada é enviado", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosRealistas(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const escritas: string[] = [];
  await page.goto(`/${CID}/hoje?preset=30d`);
  await expect(prova(page)).toBeVisible();
  page.on("request", (req) => {
    if (req.method() !== "GET" && !req.url().includes("/rest/v1/rpc/") && !req.url().includes("/auth/")) escritas.push(`${req.method()} ${req.url()}`);
  });
  const fixo = prova(page).locator('[data-peca="etapas-fixo"]');
  await expect(fixo).toBeHidden();
  await linhaDaEtapa(page, "Conversou").click();
  await expect(linhaDaEtapa(page, "Conversou")).toHaveAttribute("aria-pressed", "true");
  await expect(fixo).toBeVisible();
  await expect(fixo).toHaveText(/^Conversou: [\d.]+ agora · [\d.]+ (mês antes|período anterior)$/);
  await linhaDaEtapa(page, "Atendido").click();
  await expect(fixo).toContainText("Atendido:");
  await expect(fixo).toContainText("Falta dado: o período anterior de pessoas não é medido");
  await linhaDaEtapa(page, "Atendido").click();
  await expect(fixo).toBeHidden();
  await anel(page).click();
  await anel(page).click();
  expect(escritas, "tocar no anel e na prova não envia nem grava nada").toEqual([]);
});

for (const perfil of ["viewer", "admin"] as const) {
  test(`(e) ${perfil}: o Ver tudo ganha a tabela dos números do período, e o texto da Hoje não traz envio nem comparação com outras clínicas (D-02, D-04)`, async ({ page, context }) => {
    await mockAccount(context, perfil);
    await dadosRealistas(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(prova(page)).toBeVisible();
    await anel(page).click();
    await abrirVerTudo(page, RAIZ);

    const tabela = hoje(page).locator('[data-peca="tabela"]');
    await expect(tabela).toBeVisible();
    await expect(tabela.locator("thead th")).toHaveText(["Número", "Agora", "Período anterior", "Mudança"]);
    const rotulos = (await tabela.locator("tbody tr td:first-child").allInnerTexts()).map((t) => t.trim());
    for (const r of ["Virou lead", "Agendou", "Gasto em anúncios", "Conversas pelo anúncio", "Custo por conversa"]) expect(rotulos).toContain(r);
    // Conversas e Fechou já estão nos cartões do topo (número e variação): uma vez só, lá em cima (quick-ver-tudo).
    for (const r of ["Conversas no WhatsApp", "Fechou"]) expect(rotulos).not.toContain(r);
    await expect(hoje(page).locator('.nx-pagina__cartoes [data-peca="cartao-numero"]', { hasText: "Conversas" })).toHaveCount(1);
    await expect(hoje(page).locator('.nx-pagina__cartoes [data-peca="cartao-numero"]', { hasText: "Fecharam" })).toHaveCount(1);
    // A tabela abre com UMA frase (até 90 caracteres, com o número em destaque) e a leitura do período não está mais no "Ver tudo".
    const cabeca = hoje(page).locator('details[id="detalhes-hoje"] [data-peca="cabeca-do-bloco"] .nx-bloco-vt__frase').last();
    await expect(cabeca.locator(".nx-bloco-vt__numero")).toHaveCount(1);
    expect((await cabeca.innerText()).replace(/\s+/g, " ").trim().length).toBeLessThanOrEqual(90);
    await expect(hoje(page).locator('details[id="detalhes-hoje"] [data-peca="leitura"]')).toHaveCount(0);
    // O lado que falta é "Falta dado", nunca 0 (o mock não traz esse número).
    const custo = tabela.locator("tbody tr", { hasText: "Custo por conversa" });
    await expect(custo.locator("td").nth(1)).toHaveText(/^R\$ [\d.]+,\d{2}$/);
    await expect(custo.locator("td").nth(3)).toHaveText(/^(▲|▼) \d+%$|^= igual$/);

    const texto = await textoVisivel(hoje(page));
    // D-02: nada compara a clínica com outras. D-04: nada de envio, teste, Share, PDF nem resumo no WhatsApp.
    expect(texto).not.toMatch(GUARDA_SEM_COMPARAR_CLINICAS);
    expect(texto).not.toMatch(/Enviar teste|Compartilhar|Share|PDF|Toda segunda|resumo autom[aá]tico|Dia: segunda|Pr[ée]via da mensagem/i);
    await expect(hoje(page).getByRole("button", { name: /enviar|compartilhar|pdf|baixar/i })).toHaveCount(0);
  });
}

for (const janela of JANELAS_DO_CORTE) {
  test(`(f) nada cortado na Hoje a ${janela.width}x${janela.height}, com o painel do anel e o Ver tudo abertos`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dadosRealistas(context);
    await funilQueVira(context);
    await page.setViewportSize(janela);
    await page.goto(`/${CID}/hoje?preset=30d`);
    await expect(prova(page)).toBeVisible();
    expect(await cortesEm(page, RAIZ), "nada cortado, tudo fechado").toEqual([]);
    expect(await semRolagemLateral(page)).toBe(true);
    await anel(page).click();
    await linhaDaEtapa(page, "Fechou").click();
    await abrirVerTudo(page, RAIZ);
    expect(await cortesEm(page, RAIZ), "nada cortado, painel e Ver tudo abertos").toEqual([]);
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
