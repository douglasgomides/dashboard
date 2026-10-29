import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

const roi = { tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda", investido: 6000, investido_aquisicao: 4500, investido_crescimento: 1500, investido_estimado: 0, leads: 240, leads_com_origem: 240, ganhos: 30, ganhos_com_valor: 0, receita: 0, ganho_identificavel: true, crm_compartilhado: false };

for (const width of [375, 1440]) {
  test(`known numbers appear before recommendations even when ROI is incomplete at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await context.route("**/rest/v1/rpc/roi_periodo", r => r.fulfill({ json: roi }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}?preset=7d`);
    const results = page.getByRole("region", { name: "Retorno do investimento", exact: true });
    await expect(results.locator(".ws-metric-value")).toHaveText([/4.500,00/, /1.500,00/, "240", "30"]);
    await expect(results.locator(".ws-metric-value").first()).toBeInViewport();
    await expect(results.getByText(/Não dá pra calcular o retorno porque falta: preencher o valor da venda/)).toBeVisible();
    await expect(results.getByRole("button", { name: /^Não dá pra ler:/ })).toBeVisible();
    const next = page.getByRole("region", { name: "Por onde começar", exact: true });
    expect(await results.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('[aria-label="Por onde começar"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(next).toBeVisible();
    await expect(results.getByRole("list")).toHaveCount(0);
    await results.locator("summary").click();
    await expect(results.getByRole("list", { name: "O que falta para o retorno do investimento" }).locator(":scope > li")).toHaveCount(1);
    await expect(results.getByRole("list", { name: /Como corrigir: Preencher o valor/ })).toContainText("No Kommo");
    const link = results.getByRole("link", { name: /Ver como organizar o CRM/ });
    const target = new URL((await link.getAttribute("href"))!, "http://localhost");
    expect(target.pathname).toBe(`/${CID}/crm-guia`);
    expect(target.searchParams.get("preset")).toBe("personalizado");
    expect(target.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(target.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("missing sources do not become zero and a shared CRM shows its numbers with the warning", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let shared = false;
  await context.route("**/rest/v1/rpc/roi_periodo", r => r.fulfill({ json: shared ? { ...roi, crm_compartilhado: true } : { ...roi, tem_anuncios: false, tem_crm: false } }));
  await page.goto(`/${CID}`);
  const values = page.getByRole("region", { name: "Retorno do investimento", exact: true }).locator(".ws-metric-value");
  await expect(values).toHaveText(["sem dado", "sem dado", "sem dado", "sem dado"]);
  shared = true;
  await page.reload();
  await expect(values).toHaveText([/4.500,00/, /1.500,00/, "240", "30"]);
  await expect(page.getByRole("region", { name: "Retorno do investimento", exact: true }).getByText(/CRM compartilhado com outro cliente: mesmos números/).first()).toBeVisible();
});

test("a failed financial source offers a working retry instead of a blank result or a fabricated zero", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let fail = true;
  await context.route("**/rest/v1/rpc/roi_periodo", r => fail ? r.fulfill({ status: 503, json: { message: "fictional failure" } }) : r.fulfill({ json: roi }));
  await page.goto(`/${CID}`);
  const results = page.getByRole("region", { name: "Retorno do investimento", exact: true });
  await expect(results.getByRole("alert")).toBeVisible();
  await expect(results.locator(".ws-metric-value")).toHaveCount(0);
  fail = false;
  await results.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(results.locator(".ws-metric-value")).toHaveText([/4.500,00/, /1.500,00/, "240", "30"]);
});

test("ROI uses only acquisition spend, shows the chosen cost label, the confidence badge and the lag note", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/roi_periodo", r => r.fulfill({ json: { ...roi, rotulo_custo: "paciente", leads_com_origem: 200, ganhos: 10, ganhos_com_valor: 10, receita: 9000, investido_estimado: 600 } }));
  await page.goto(`/${CID}`);
  const results = page.getByRole("region", { name: "Retorno do investimento", exact: true });
  // (9.000 − 4.500) ÷ 4.500 = +100%. O crescimento (1.500) não entra. Custo = 4.500 ÷ 10.
  await expect(results.locator(".ws-metric-value")).toHaveText([/4.500,00/, /1.500,00/, /9.000,00/, "+100%", /450,00/]);
  await expect(results.getByText("Custo por paciente", { exact: true })).toBeVisible();
  await expect(results.getByText("Venda fechada no período pode ter vindo de contato de períodos anteriores.")).toBeVisible();
  const selo = results.getByRole("button", { name: /^Parcial:.*sem origem/ });
  await expect(selo).toBeVisible();
  await selo.click();
  await expect(results.getByRole("tooltip")).toContainText("sem origem");
  await results.getByRole("button", { name: "Como calculamos: ROI" }).click();
  await expect(results.getByRole("tooltip").last()).toContainText("investimento em aquisição");
});

test("SAP clinic selection opens results while explicit task links remain available", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.goto("/sap");
  await page.getByRole("combobox", { name: "Abrir clínica do programa:", exact: true }).selectOption(CID);
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/painel`));
  await expect(page.getByRole("heading", { name: "Resultados da clínica", exact: true })).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumo do programa", exact: true });
  expect(await summary.locator(".sap-clinic-kpis").evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.sap-clinic-phase')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await summary.getByRole("link", { name: "Ver minhas tarefas", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/?$`));
  await expect(page.getByRole("heading", { name: "Minha semana", exact: true })).toBeVisible();
});

test("Marketing sidebar reveals a group's tools on demand and opens the current group", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await page.goto(`/${CID}/marketing?preset=7d`);
  const nav = page.getByRole("navigation", { name: "Telas de Marketing", exact: true });
  const groups = nav.locator("details");
  await expect(groups.locator("summary")).toHaveText([/Resultados/, /Conteúdo/, /Campanhas e anúncios/]);
  await expect(nav.getByRole("link", { name: "Resultados dos anúncios", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toHaveCount(0);
  await nav.locator("summary").filter({ hasText: /^Conteúdo/ }).click();
  await nav.getByRole("link", { name: "Planejar a semana", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${CID}/ideias`));
  expect(new URL(page.url()).searchParams.get("preset")).toBe("7d");
  expect(new URL(page.url()).searchParams.get("visao")).toBe("semana");
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(nav.getByRole("link", { name: "Planejar a semana", exact: true })).toBeVisible();
});

test("mobile product switch remains available to the team even after collapsing the desktop sidebar", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await page.goto(`/${CID}`);
  await page.getByRole("button", { name: "Recolher menu lateral", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("navigation", { name: "Áreas", exact: true }).getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Navegar no Nexo", exact: true });
  const link = menu.getByRole("navigation", { name: "Produto", exact: true }).getByRole("link", { name: "Sistema de Aquisição", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/sap/${CID}/painel`);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/sap/${CID}/painel`));
  await expect(menu).not.toBeVisible();
});

for (const measured of [false, true]) {
  test(`SAP portfolio distinguishes an unavailable commercial source from a measured zero (${measured})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await context.route("**/rest/v1/rpc/sap_tracker_auto", r => r.fulfill({ json: { tem_crm: measured, tem_whatsapp: false, marcos: measured ? ["compareceu", "fechou"] : [], leads: 0, compareceram: 0, fechados: 0, fechados_com_valor: 0, receita: 0 } }));
    await page.goto("/sap");
    const portfolio = page.getByRole("region", { name: "Clínicas e resultados", exact: true });
    const row = portfolio.getByRole("row").filter({ hasText: "Clínica de teste" });
    await expect(row.getByRole("cell").nth(4)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(5)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(6)).toHaveText(measured ? "0" : "sem dado");
    await expect(row.getByRole("cell").nth(7)).toHaveText(measured ? /0,00/ : "sem dado confiável");
    await expect(portfolio.getByText("0 de 1 clínicas com dados disponíveis", { exact: true })).toHaveCount(measured ? 0 : 4);
  });
}

// Dia dentro de qualquer período padrão, nos dois fusos: a data de hoje em UTC já é amanhã em Brasília depois das 21h.
const diaRecente = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
const crmMetrics = { total_leads: 500, ganhos: 40, perdidos: 30, consultas_agendadas: 40, em_atendimento: 100, em_atendimento_valor: 20000, novos_7d: 15, fonte_preenchida_pct: 80 };
const crmPeriod = [{ novos: 68, ganhos: 4, perdidos: 3, valor: 12000 }];

for (const width of [375, 1440]) {
  test(`advertising numbers precede expandable recommendations at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await context.route("**/rest/v1/meta_ads_daily?**", r => r.fulfill({ json: [{ date: diaRecente, campaign_id: "fictional", spend: 6000, impressions: 100000, link_clicks: 300, conversations: 100, leads: 0, landing_page_views: 0, reach: 80000, clicks: 300 }] }));
    await context.route("**/rest/v1/meta_ads_campaigns?**", r => r.fulfill({ json: [{ campaign_id: "fictional", name: "Campanha fictícia", objective: "OUTCOME_ENGAGEMENT" }] }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/anuncios`);
    const numbers = page.getByRole("region", { name: "Indicadores dos anúncios", exact: true });
    await expect(numbers).toBeVisible();
    await expect(numbers.locator(".ws-metric-value").first()).toHaveText(/6.000,00/);
    const recommendations = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Ver recomendações e ações para os anúncios" }) });
    await expect(recommendations).not.toHaveAttribute("open", "");
    expect(await numbers.evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#ag-anuncios')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await recommendations.locator("summary").click();
    await expect(page.locator("#ag-anuncios")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("CRM period numbers appear before funnel diagnostics and remain separate from the full historical base", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/crm_metricas_essenciais", r => r.fulfill({ json: [crmMetrics] }));
  await context.route("**/rest/v1/rpc/crm_leads_resumo_periodo", r => r.fulfill({ json: crmPeriod }));
  await page.goto(`/${CID}/crm-painel?preset=7d`);
  const period = page.getByRole("heading", { name: "No período selecionado", exact: true });
  await expect(period).toBeVisible();
  const history = page.getByRole("heading", { name: "Base geral do CRM · histórico completo", exact: true });
  await expect(history).toBeVisible();
  await expect(page.getByText("Campo de origem preenchido", { exact: true })).toBeVisible();
  await expect(page.getByText("Fonte identificada", { exact: true })).toHaveCount(0);
  expect(await period.evaluate(el => !!(el.compareDocumentPosition([...document.querySelectorAll('h2')].find(h => h.textContent?.includes('Onde o funil quebra'))!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.getByText("68", { exact: true })).toBeVisible();
  await expect(page.getByText("500", { exact: true }).first()).toBeVisible();
});

test("CRM budgets are grouped by procedure type and patient, and the team can correct a procedure type", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await context.route("**/rest/v1/rpc/crm_metricas_essenciais", r => r.fulfill({ json: [crmMetrics] }));
  await context.route("**/rest/v1/rpc/crm_leads_resumo_periodo", r => r.fulfill({ json: crmPeriod }));
  const linha = (tipo: string, itens: number, aprovados: number, valor: number, esfriados: number) => ({ tipo, itens, pessoas: itens, aprovados, pessoas_aprovadas: aprovados, valor_aprovado: valor, aprovados_sem_valor: 0, perdidos: 0, esfriados, em_aberto: itens - aprovados - esfriados });
  await context.route("**/rest/v1/rpc/crm_orcamentos_por_tipo", r => r.fulfill({ json: {
    itens: 120, cards_sem_procedimento: 0, pessoas: 40, pessoas_aprovadas: 35, valor_aprovado: 150000, valor_por_paciente: 4286,
    pessoas_com_consulta: 20, consulta_e_compra: 12, esfriados: 30,
    tipos: [linha("Medicação", 60, 40, 100000, 10), linha("Exame", 40, 10, 30000, 20), linha("Consulta", 20, 20, 20000, 0)],
    procedimentos: [{ procedimento: "Calorimetria fictícia", tipo: "Exame", corrigido: false, itens: 40 }],
  } }));
  const visto: { corrigido?: Record<string, unknown> } = {};
  await context.route("http://localhost:9/rest/v1/crm_procedimento_tipo**", r => { visto.corrigido = r.request().postDataJSON(); return r.fulfill({ status: 201, json: [] }); });
  await page.goto(`/${CID}/crm-painel`);
  const painel = page.getByRole("heading", { name: "Orçamentos por tipo de procedimento", exact: true });
  await expect(painel).toBeVisible();
  await expect(page.getByText("40 pacientes · 120 itens de orçamento", { exact: false })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Medicação", exact: true })).toBeVisible();
  await expect(page.getByText(/São 120 itens de orçamento, mas só 40 pacientes/)).toBeVisible();
  await expect(page.getByText(/Medicação responde por 67% do valor aprovado/)).toBeVisible();
  await page.getByText("Revisar o tipo de cada procedimento (1)").click();
  await page.getByLabel("Tipo de Calorimetria fictícia").selectOption("Consulta");
  await expect.poll(() => visto.corrigido).toMatchObject({ client_id: CID, procedimento: "Calorimetria fictícia", tipo: "Consulta" });
});

test("a doctor sees the budget grouping but not the correction list", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/crm_metricas_essenciais", r => r.fulfill({ json: [crmMetrics] }));
  await context.route("**/rest/v1/rpc/crm_leads_resumo_periodo", r => r.fulfill({ json: crmPeriod }));
  await context.route("**/rest/v1/rpc/crm_orcamentos_por_tipo", r => r.fulfill({ json: { itens: 30, pessoas: 30, tipos: [{ tipo: "Consulta", itens: 30, pessoas: 30, aprovados: 20, perdidos: 5, esfriados: 0, em_aberto: 5, aprovados_sem_valor: 0, valor_aprovado: 20000 }], procedimentos: [{ procedimento: "Consulta fictícia", tipo: "Consulta", corrigido: false, itens: 30 }] } }));
  await page.goto(`/${CID}/crm-painel`);
  await expect(page.getByRole("heading", { name: "Orçamentos por tipo de procedimento", exact: true })).toBeVisible();
  await expect(page.getByText(/Revisar o tipo de cada procedimento/)).toHaveCount(0);
});

test("CRM wins are shown per funnel and period, grouped like the CRM, without summing different win stages", async ({ page, context }) => {
  await mockAccount(context, "admin");
  await context.route("**/rest/v1/rpc/crm_metricas_essenciais", r => r.fulfill({ json: [crmMetrics] }));
  await context.route("**/rest/v1/rpc/crm_leads_resumo_periodo", r => r.fulfill({ json: crmPeriod }));
  const pedidos: Record<string, unknown>[] = [];
  const linha = (grupo: string | null, funil: string, entraram: number, ganhos: number, etapa: string | null) => ({ grupo, funil, entraram, consultas_agendadas: 3, ganhos, ganhos_sem_valor: 1, perdidos: 2, valor_ganho: ganhos * 1000, etapa_do_ganho: etapa });
  await context.route("**/rest/v1/rpc/crm_funis_periodo", r => { pedidos.push(r.request().postDataJSON()); return r.fulfill({ json: [
    linha("Atendimento fictício", "Consultas", 40, 18, "Consulta agendada"),
    linha("Atendimento fictício", "Procedimentos", 20, 17, "Procedimento agendado"),
    linha(null, "Funil avulso", 5, 0, null),
  ] }); });
  await page.goto(`/${CID}/crm-painel`);
  await expect(page.getByRole("heading", { name: "Por funil, no período", exact: true })).toBeVisible();
  await expect(page.getByText("Atendimento fictício · 60 leads · 35 ganhos")).toBeVisible();
  await expect(page.getByText("Outros funis · 5 leads · 0 ganhos")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Procedimento agendado", exact: true })).toBeVisible();
  expect(pedidos[0]).toMatchObject({ p_client_id: CID });
  expect(typeof pedidos[0].p_from).toBe("string");
});

test("CRM period failure keeps the historical base and offers a working retry without displaying zero period counts", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  let fail = true;
  await context.route("**/rest/v1/rpc/crm_metricas_essenciais", r => r.fulfill({ json: [crmMetrics] }));
  await context.route("**/rest/v1/rpc/crm_leads_resumo_periodo", r => fail ? r.fulfill({ status: 503, json: { message: "fictional failure" } }) : r.fulfill({ json: crmPeriod }));
  await page.goto(`/${CID}/crm-painel`);
  const alert = page.getByRole("alert").filter({ hasText: "Não foi possível consultar os números deste período" });
  await expect(alert).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("500", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Leads novos", { exact: true })).toHaveCount(0);
  fail = false;
  await alert.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByText("68", { exact: true })).toBeVisible();
});

for (const source of ["anuncios", "crm-painel", "atendimento"] as const) {
  test(`${source}: a failed primary query is not reported as an empty period and retry recovers`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    let fail = true;
    const path = source === "anuncios" ? "**/rest/v1/meta_ads_daily?**" : `**/rest/v1/rpc/${source === "crm-painel" ? "crm_metricas_essenciais" : "wts_resumo"}`;
    await context.route(path, r => fail ? r.fulfill({ status: 503, json: { message: "fictional failure" } }) : r.fulfill({ json: [] }));
    await page.goto(`/${CID}/${source}`);
    const alert = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: /^Não foi possível carregar os números/ }) });
    await expect(alert).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Nenhum atendimento no período|Ainda sem leads|Sem investimento no período/)).toHaveCount(0);
    fail = false;
    await alert.getByRole("button", { name: "Tentar novamente", exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Não foi possível carregar os números/ })).toHaveCount(0);
  });
}

test("an unclassified content topic is labelled clearly and is not used as a topic performance recommendation", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/conteudo_comercial", r => r.fulfill({ json: { dias: [], grade: [], temas: [{ tema: "null", posts: 12, alcance: 1000, conversas: 0, comerciais: 0, pediram_preco: 0, agendaram: 0 }], semanas: [], objecoes: [], assuntos: [], cobertura: { conversas: 0, lidas: 0, sem_texto: 0, com_tema: 0, posts: 12, posts_com_tema: 0 } } }));
  await page.goto(`/${CID}/conteudo-comercial`);
  await expect(page.getByRole("cell", { name: "Sem tema identificado", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "null", exact: true })).toHaveCount(0);
  await expect(page.getByText("Muito post, nenhuma conversa sobre o tema", { exact: true })).toHaveCount(0);
});

test("content × commercial opens with plain-language conclusions and the next action", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  const tema = (t: string, posts: number, conversas: number, agendaram: number) => ({ tema: t, posts, alcance: 1000, conversas, comerciais: conversas, pediram_preco: 0, agendaram });
  await context.route("**/rest/v1/rpc/conteudo_comercial", r => r.fulfill({ json: {
    dias: [], grade: [], semanas: [], assuntos: [],
    efeito_post: { dias_com_post: 12, media_com_post: 6, dias_sem_post: 9, media_sem_post: 4, media_dia_seguinte_com_post: 5, media_dia_seguinte_sem_post: 4 },
    temas: [tema("Menopausa", 1, 12, 6), tema("Canetas", 0, 7, 1), tema("null", 0, 40, 40)],
    objecoes: [{ objecao: "preco", n: 5, agendaram: 2 }],
    cobertura: { conversas: 60, lidas: 60, sem_texto: 0, com_tema: 50, posts: 13, posts_com_tema: 12 },
  } }));
  await page.goto(`/${CID}/conteudo-comercial`);
  const painel = page.locator("section, div").filter({ has: page.getByText("O que os números dizem", { exact: true }) }).last();
  await expect(page.getByText("Dia com post tem 50% mais conversas", { exact: true })).toBeVisible();
  await expect(page.getByText('"Menopausa" é o assunto que mais vira agendamento', { exact: true })).toBeVisible();
  await expect(page.getByText("Pacientes perguntam sobre temas que não tiveram post", { exact: true })).toBeVisible();
  await expect(page.getByText("A objeção mais comum é preço", { exact: true })).toBeVisible();
  await expect(painel.getByText(/null/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/conteudo-comercial-conclusoes.png", fullPage: true });
});

test("content × commercial links buying comments to posts, topics to closed revenue and response time to bookings", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  await context.route("**/rest/v1/rpc/conteudo_comercial", r => r.fulfill({ json: { dias: [], grade: [], temas: [], semanas: [], objecoes: [], assuntos: [], efeito_post: null, cobertura: { conversas: 900, lidas: 900, sem_texto: 0, com_tema: 300, posts: 20, posts_com_tema: 18 } } }));
  await context.route("**/rest/v1/rpc/conteudo_comercial_profundo", r => r.fulfill({ json: {
    posts_compra: [{ post_id: "p1", comentarios: 574, compra: 14, preco: 2, agendar: 6, onde: 0, convenio: 4, contato: 5, permalink: "https://instagram.com/p/ficticio", thumbnail_url: null, legenda: "Post fictício sobre menopausa", tema: "Menopausa", formato: "reels", posted_at: "2026-10-01T12:00:00Z" }],
    comentarios: { total: 2971, compra: 70, posts_com_compra: 32 }, compra_por_formato: [],
    temas_valor: [{ tema: "Catarata", conversas: 60, com_lead: 50, ganhos: 12, perdidos: 8, ganhos_com_valor: 12, receita: 60000 }],
    resposta: [{ faixa: "1_ate_15min", conversas: 400, agendaram: 40 }, { faixa: "3_1_a_4h", conversas: 100, agendaram: 4 }, { faixa: "5_sem_resposta", conversas: 50, agendaram: 1 }],
    resposta_tema: [], cobertura: { conversas: 900, com_lead: 800, com_tema: 300, horario_comercial: 550 },
  } }));
  await page.goto(`/${CID}/conteudo-comercial`);
  await expect(page.getByText("70 comentários pedem preço, horário ou contato", { exact: true })).toBeVisible();
  await expect(page.getByText('"Catarata" é o tema que mais fatura', { exact: true })).toBeVisible();
  await expect(page.getByText("Responder em até 15 min agenda 10%; depois de 1 hora, 4%", { exact: true })).toBeVisible();
  await expect(page.getByText("Post fictício sobre menopausa", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Catarata", exact: true })).toBeVisible();
  await expect(page.getByText("Sem resposta humana", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "test-results/conteudo-comercial-profundo.png", fullPage: true });
});

for (const vision of [false, true]) {
  test(`creative analysis uses configured capability rather than blocking its on-demand restart after an old heartbeat (${vision})`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    const accountId = "44444444-4444-4444-8444-444444444444";
    const postId = "55555555-5555-4555-8555-555555555555";
    await context.route("**/rest/v1/instagram_accounts?**", r => r.fulfill({ json: [{ id: accountId, client_id: CID, active: true, ig_username: "conta_ficticia" }] }));
    await context.route("**/rest/v1/instagram_posts?**", r => {
      const offset = Number(new URL(r.request().url()).searchParams.get("offset") ?? r.request().headers()["range"]?.split("-")[0] ?? 0);
      return r.fulfill({ json: offset > 0 ? [] : [{ id: postId, instagram_account_id: accountId, format: "carrossel", posted_at: new Date().toISOString(), reach: 1000, saved: 30, shares: 10, views: 1500, caption: "Conteúdo fictício para QA" }] });
    });
    await context.route("**/rest/v1/rpc/creative_worker_health", r => r.fulfill({ json: { seen_at: "2020-01-01T00:00:00Z", capabilities: { vision, external_search: false } } }));
    let queued: Record<string, any> | undefined;
    let restarted = false;
    await context.route("**/rest/v1/rpc/creative_enqueue", r => { queued = r.request().postDataJSON(); return r.fulfill({ json: "66666666-6666-4666-8666-666666666666" }); });
    await context.route("**/api/sync/manual", r => { if (r.request().postDataJSON().alvo === "creative_worker") restarted = true; return r.fulfill({ json: { ok: true } }); });
    await page.goto(`/${CID}/inteligencia-criativa`);
    const analyse = page.getByRole("button", { name: "Analisar mídia original", exact: true });
    await expect(analyse).toBeVisible();
    if (!vision) {
      await expect(analyse).toBeDisabled();
    } else {
      await expect(analyse).toBeEnabled();
      await expect(page.getByText(/O processador está sem sinal recente/)).toBeVisible();
      await analyse.click();
      await expect.poll(() => queued?.p_kind).toBe("analyse");
      expect(queued?.p_input).toEqual({ account_id: accountId, post_id: postId });
      await expect.poll(() => restarted).toBe(true);
    }
  });
}

for (const width of [375, 1440]) {
  test(`SAP indicator explanations remain open after clicking instead of closing from the hover/click sequence at ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/sap/${CID}/painel`);
    const summary = page.getByRole("region", { name: "Resumo do programa", exact: true });
    await summary.getByRole("button", { name: "Tempo de 1ª resposta", exact: true }).click();
    await expect(summary.getByRole("tooltip")).toContainText("Quanto tempo a clínica leva para responder");
    await summary.getByRole("button", { name: "Taxa de comparecimento", exact: true }).click();
    await expect(summary.getByRole("tooltip")).toHaveCount(1);
    await expect(summary.getByRole("tooltip")).toContainText("comparecimento");
  });
}

test("advertising summary and period comparison retain conversions attributed without new spend or impressions", async ({ page, context }) => {
  await mockAccount(context, "viewer");
  const date = diaRecente;
  await context.route("**/rest/v1/meta_ads_daily?**", r => r.fulfill({ json: [
    { date, campaign_id: "delivery", spend: 100, impressions: 1000, link_clicks: 100, conversations: 18, leads: 0, landing_page_views: 0 },
    { date, campaign_id: "late-attribution", spend: 0, impressions: 0, link_clicks: 0, conversations: 1, leads: 0, landing_page_views: 0 },
  ] }));
  await context.route("**/rest/v1/meta_ads_campaigns?**", r => r.fulfill({ json: [
    { campaign_id: "delivery", name: "Veiculação fictícia", objective: "MESSAGES" },
    { campaign_id: "late-attribution", name: "Atribuição posterior fictícia", objective: "MESSAGES" },
  ] }));
  await context.route("**/rest/v1/rpc/ads_resumo", r => r.fulfill({ json: [{ gasto: 100, impressoes: 1000, cliques_link: 100, conversas: 19, campanhas: 2, ctr: 10, cpc: 1, cpm: 100, custo_por_conversa: 100 / 19 }] }));
  await page.goto(`/${CID}/anuncios`);
  const numbers = page.getByRole("region", { name: "Indicadores dos anúncios", exact: true });
  await expect(numbers.locator(".ws-metric-value").nth(1)).toHaveText("19");
  const comparison = page.getByRole("region", { name: "Este período e o anterior", exact: true });
  await expect(comparison.getByRole("row").filter({ hasText: "Conversas iniciadas" }).getByRole("cell").nth(1)).toHaveText("19");
  await expect(comparison.getByRole("row").filter({ hasText: "Campanhas com registros" }).getByRole("cell").nth(1)).toHaveText("2");
});
