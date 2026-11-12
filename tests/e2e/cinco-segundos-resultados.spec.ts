import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { abrirVerTudo, conferirCincoSegundos, cortesEm } from "./apoio-cinco-segundos";
import { LIMITE_DE_ALTURA, TELAS_DE_MEDIDA, alturaDaAbaAberta, mockAnuncios, mockCrm, mockInstagram, mockPessoas, semRolagemLateral } from "./apoio-telas-juntadas";

// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03): o veredito abre a tela com os 3 anéis (Conversas, Agendaram,
// Fecharam) contra o período anterior da própria clínica; tudo o que a tela mostrava antes mora no "Ver tudo", fechado. Dados fictícios.

test.use({ reducedMotion: "reduce" });

const RAIZ = '[data-tela="resultados"]';
const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);

/**
 * Histórico diário do próprio spec: o período atual (os 29 dias fechados) tem 50% mais conversas, 25% menos agendamentos e metade dos
 * fechados do período anterior (de mesmo tamanho). Registrado depois dos mocks compartilhados, por isso vale no lugar deles.
 */
async function historicoDoSpec(context: BrowserContext) {
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      dia: dia(i), mandaram_mensagem: i < 30 ? 30 : 20, leads_novos: 12, antigos: 8, agendaram: i < 30 ? 3 : 4, negociacao: 2, compareceram: null, fecharam: i < 30 ? 1 : 2,
    }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

async function dadosDoSpec(context: BrowserContext) {
  await mockInstagram(context);
  await mockPessoas(context);
  await mockAnuncios(context, "bom");
  await mockCrm(context);
  await historicoDoSpec(context);
}

const aneis = (page: Page) => page.locator(`${RAIZ} .nx-aneis__anel`);

test("Resultados abre com o veredito e os 3 anéis, e cada anel abre e fecha a própria área", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosDoSpec(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(aneis(page)).toHaveCount(3);

  // O veredito é o primeiro bloco depois do cabeçalho, com a palavra e UMA frase com o número.
  const ordem = await page.locator(RAIZ).evaluate((el) => Array.from(el.children).slice(0, 2).map((c) => ({ tag: c.tagName.toLowerCase(), peca: c.getAttribute("data-peca") })));
  expect(ordem[0].tag).toBe("header");
  expect(ordem[1].peca).toBe("veredito");
  const veredito = page.locator(`${RAIZ} [data-peca="veredito"]`);
  await expect(veredito).toHaveAttribute("data-modo", "veredito");
  await expect(veredito.locator(".nx-veredito__texto .nx-selo")).toContainText("Atenção");
  await expect(veredito.locator(".nx-veredito__frase")).toHaveText("Chegaram 50% mais conversas, mas fecharam só 29 contra 58.");
  // Os anéis estão dentro do veredito, na ordem do funil, cada um com o selo da própria etapa contra o período anterior.
  await expect(veredito.locator(".nx-aneis__anel")).toHaveCount(3);
  await expect(aneis(page).nth(0)).toContainText("Conversas");
  await expect(aneis(page).nth(0)).toContainText("Em alta");
  await expect(aneis(page).nth(1)).toContainText("Agendaram");
  await expect(aneis(page).nth(1)).toContainText("Em queda");
  await expect(aneis(page).nth(2)).toContainText("Fecharam");
  await expect(aneis(page).nth(2)).toContainText("Em queda");
  // O número do centro é o mesmo do cartão de pessoas (120 pessoas no mock), e a passagem entre os anéis aparece com o texto.
  await expect(aneis(page).nth(0).locator(".nx-aneis__valor")).toHaveText("120");
  await expect(page.locator(`${RAIZ} .nx-aneis__passagem-texto`).first()).toContainText("seguem");

  // Tocar num anel abre UMA área com a linha de 30 dias e as barras "agora" e "antes"; tocar de novo fecha.
  const detalhe = page.locator(`${RAIZ} [data-peca="anel-detalhe"]`);
  await expect(detalhe).toBeHidden();
  await aneis(page).nth(0).click();
  await expect(aneis(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(detalhe).toBeVisible();
  await expect(detalhe.locator('[data-peca="linha-30-dias"]')).toBeVisible();
  await expect(detalhe.locator(".nx-barras__item")).toHaveCount(2);
  await aneis(page).nth(2).click();
  await expect(aneis(page).nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(detalhe).toContainText("Fecharam: 29 agora, 58 antes");
  await aneis(page).nth(2).click();
  await expect(detalhe).toBeHidden();

  // Tudo o que a tela mostrava mora no "Ver tudo": os 4 cartões de pessoas, o gráfico de contatos e a leitura.
  const verTudo = page.locator(`${RAIZ} details:has(> summary b:text-is("Ver tudo"))`);
  await expect(verTudo).toHaveCount(1);
  expect(await verTudo.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await abrirVerTudo(page, RAIZ);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true })).toBeVisible();
  await expect(page.locator(`${RAIZ} .nx-pagina__detalhe .nx-kpi .ws-metric-value`).first()).toHaveText("120");
  await expect(page.locator(`${RAIZ} .nx-pagina__detalhe #todas-analises`)).toHaveCount(1);
});

// Retorno sem o valor das vendas preenchido no CRM (o mesmo caso de numbers-first.spec.ts): falta o valor médio da consulta.
const ROI_SEM_VALOR = { tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda", investido: 6000, investido_aquisicao: 4500, investido_crescimento: 1500, investido_estimado: 0, leads: 240, leads_com_origem: 240, ganhos: 30, ganhos_com_valor: 0, receita: 0, ganho_identificavel: true, crm_compartilhado: false };

test("Resultados: 3 cartões de dinheiro e a clínica contra ela mesma, sem nunca virar 0 nem comparar clínicas", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosDoSpec(context);
  await context.route("**/rest/v1/rpc/roi_periodo", (r) => r.fulfill({ json: ROI_SEM_VALOR }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(aneis(page)).toHaveCount(3);

  // Os 3 cartões de dinheiro, em ordem; o retorno sem o valor da consulta diz "Falta dado" com o motivo (nunca 0).
  const cartoes = page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);
  await expect(cartoes).toHaveCount(3);
  await expect(cartoes.nth(0)).toContainText("Retorno em R$");
  await expect(cartoes.nth(0)).toContainText("Falta dado: precisa do valor médio da consulta");
  await expect(cartoes.nth(0)).not.toContainText("R$ 0");
  await expect(cartoes.nth(1)).toContainText("Gasto em anúncios");
  await expect(cartoes.nth(1)).toContainText("R$ 3.000");
  await expect(cartoes.nth(1)).toContainText("gasto igual ao de antes");
  await expect(cartoes.nth(2)).toContainText("Anúncio por paciente fechado");
  await expect(cartoes.nth(2)).toContainText("R$ 103");
  await expect(cartoes.nth(2)).toContainText("100% · mais caro que antes");
  // Só a equipe vê "Informar valor", e ele leva a onde o ticket já é editado (Atendimento, aba de conversas).
  const informar = cartoes.nth(0).getByRole("link", { name: "Informar valor" });
  await expect(informar).toBeVisible();
  const alvo = new URL((await informar.getAttribute("href"))!, "http://localhost");
  expect(alvo.pathname).toBe(`/${CID}/atendimento`);
  expect(alvo.searchParams.get("aba")).toBe("conversas");

  // "Você agora contra você antes": 4 linhas, bolinha cinza e azul, só números desta clínica.
  const secao = page.locator(`${RAIZ} [data-peca="agora-contra-antes"]`);
  await expect(secao.getByRole("heading", { name: "Você agora contra você antes" })).toBeVisible();
  await expect(secao).toContainText("Bolinha cinza = antes · azul = agora · direita = melhor");
  await expect(secao).toContainText("Só números desta clínica.");
  await expect(secao.locator(".nx-agora-antes__linha")).toHaveCount(4);
  await expect(secao.locator(".nx-agora-antes__linha").nth(0)).toContainText("50% a mais que antes");
  await expect(secao.locator(".nx-agora-antes__linha").nth(1)).toContainText("17% mais barato que antes");
  await expect(secao.getByRole("button", { name: /^Antes: / }).first()).toBeVisible();
  await secao.getByRole("button", { name: /^Agora: / }).first().click();
  await expect(secao.getByRole("status")).toContainText("Agora: 870");
  // O texto à vista nunca compara a clínica com outras (D-02).
  expect(await page.locator(RAIZ).innerText()).not.toMatch(/outras cl[ií]nicas|m[ée]dia da carteira|ranking|melhor que \d+ de \d+/i);
});

test("Resultados: o médico não vê Informar valor, vê quem resolve; sem anúncios o gasto diz Falta dado em vez de 0", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await dadosDoSpec(context);
  await context.route("**/rest/v1/rpc/roi_periodo", (r) => r.fulfill({ json: ROI_SEM_VALOR }));
  // Sem anúncios no período: nenhuma linha de gasto (lista vazia) e o resumo sem linha.
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => r.fulfill({ json: [] }));
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => r.fulfill({ json: [] }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  const cartoes = page.locator(`${RAIZ} .nx-pagina__cartoes [data-peca="cartao-numero"]`);
  await expect(cartoes).toHaveCount(3);
  await expect(cartoes.nth(0).getByRole("link", { name: "Informar valor" })).toHaveCount(0);
  await expect(cartoes.nth(0)).toContainText("Quem resolve: Equipe Doctor Creator");
  await expect(cartoes.nth(1)).toContainText("Falta dado: a conta de anúncios não respondeu neste período");
  await expect(cartoes.nth(1)).not.toContainText("R$ 0");
  await expect(cartoes.nth(2)).toContainText("Falta dado: falta o gasto em anúncios");
  // A linha de custo por conversa fica cinza, sem bolinha e sem número inventado.
  const custo = page.locator(`${RAIZ} .nx-agora-antes__linha[data-falta-dado]`).first();
  await expect(custo).toContainText("Custo por conversa");
  await expect(custo).toContainText("Falta dado: faltam o gasto e as conversas dos anúncios");
  await expect(custo.getByRole("button")).toHaveCount(0);
});

for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`${perfil} a ${janela.width}x${janela.height}: Resultados com Ver tudo fechado cabe em ${LIMITE_DE_ALTURA} vez a janela, sem rolar de lado e sem nada cortado`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosDoSpec(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}?preset=30d`);
      await expect(aneis(page)).toHaveCount(3);

      if (perfil === "admin") await page.screenshot({ path: `test-results/redesenho/resultados-5s-${janela.width}.png`, fullPage: true });
      const { altura, janela: altJanela } = await alturaDaAbaAberta(page, RAIZ);
      console.log(`  Resultados (${perfil}, ${janela.width}x${janela.height}): ${Math.round(altura)} px de ${altJanela} (${(altura / altJanela).toFixed(2)}x)`);
      expect(altura, `Resultados mede ${Math.round(altura)} px; o limite é ${LIMITE_DE_ALTURA} x ${altJanela}`).toBeLessThanOrEqual(LIMITE_DE_ALTURA * altJanela);
      expect(await semRolagemLateral(page)).toBe(true);
      expect(await cortesEm(page, RAIZ), "nada pode ficar cortado").toEqual([]);
    });
  }
}

// O formato 5 segundos (03.1.1.1, D-01, D-02, D-08): a mesma conferência de toda tela convertida, para o médico e para a equipe, no celular e no computador.
for (const perfil of ["viewer", "admin"] as const) {
  for (const janela of TELAS_DE_MEDIDA) {
    test(`${perfil} a ${janela.width}x${janela.height}: veredito, até 3 números, de 3 a 5 descobertas, Ver tudo fechado, sem comparar clínicas e nada cortado`, async ({ page, context }) => {
      await mockAccount(context, perfil);
      await dadosDoSpec(context);
      await page.setViewportSize(janela);
      await page.goto(`/${CID}?preset=30d`);
      await expect(aneis(page)).toHaveCount(3);
      await expect(page.locator(`${RAIZ} [data-peca="descoberta"]`).first()).toBeVisible();

      await conferirCincoSegundos(page, RAIZ);
      expect(await semRolagemLateral(page)).toBe(true);
      // A ação de conversas muda com o papel: a equipe vai para Atendimento, o médico para o funil. As duas só navegam.
      const acoes = await page.locator(`${RAIZ} [data-peca="descoberta"] a.nx-acao-pilula__seta`).evaluateAll((els) => els.map((el) => new URL((el as HTMLAnchorElement).href).pathname));
      expect(acoes).toContain(`/${CID}/anuncios`);
      expect(acoes).toContain(`/${CID}/pacientes`);
      expect(acoes.includes(`/${CID}/atendimento`)).toBe(perfil === "admin");
    });
  }
}

test("Resultados: nenhuma descoberta manda nada (só navega) e o Ver tudo guarda todo o conteúdo de antes", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await dadosDoSpec(context);
  const escritas: string[] = [];
  page.on("request", (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return;
    // A regra é sobre ESCREVER pelo botão: POST, PATCH ou DELETE em tabela de /rest/v1 (rpc é leitura; o log por rota não conta; /api/sync/manual
    // é leitura de fontes que a própria tela já faz ao abrir, antes de qualquer clique).
    const url = new URL(req.url());
    if (url.pathname.startsWith("/rest/v1/") && !url.pathname.startsWith("/rest/v1/rpc/") && url.pathname !== "/rest/v1/rota_acessos") escritas.push(`${req.method()} ${url.pathname}`);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/${CID}?preset=30d`);
  await expect(page.locator(`${RAIZ} [data-peca="descoberta"]`).first()).toBeVisible();
  for (const botao of await page.locator(`${RAIZ} button.nx-descoberta__porque-botao`).all()) await botao.click();
  for (const anel of await aneis(page).all()) await anel.click();

  // Ver tudo: a leitura, as análises, o Instagram, os anúncios e retorno, o método e o botão do relatório, todos com os mesmos ids de antes.
  await abrirVerTudo(page, RAIZ);
  for (const id of ["todas-analises", "instagram", "anuncios-e-retorno", "explicar", "metodo"]) await expect(page.locator(`${RAIZ} .nx-pagina__detalhe #${id}`), `#${id} continua na tela`).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Baixar relatório PDF/ })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true })).toBeVisible();
  expect(escritas, "nada é gravado nem enviado").toEqual([]);
});
