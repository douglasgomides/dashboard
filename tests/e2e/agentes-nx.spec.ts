import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Painéis de agente, planejador da semana e estratégias no desenho nx (Phase 3.1, plano 06, TELA-03): as 5 telas do
// Nexo que mostravam o desenho antigo. Aqui só se confere o desenho e o que ele promete (vazio com "Quem resolve:",
// viewer sem botão de executar, nenhuma rolagem lateral); o fluxo dos agentes é do agents-workspace.spec.ts.

const NOW = new Date().toISOString();
const ideia = {
  id: "55555555-5555-4555-8555-555555555555", client_id: CID, tipo: "pacote", titulo: "Programa de retorno em 6 meses", publico: "Pacientes que consultaram há mais de 5 meses",
  oferta: "Consulta de retorno com revisão do plano", canal: "WhatsApp", mensagem: "Olá [nome], vamos revisar o seu plano?", porque: "Poucos pacientes voltam depois da primeira consulta.",
  evidencias: ["12 de 40 pacientes voltaram"], brain: [], passos: ["Separar a lista de pacientes", "Enviar a mensagem pela secretária"], metrica: "retornos agendados",
  esforco: "baixo", prazo_dias: 14, estado: "proposta", resultado: null, criado_em: NOW,
};

/** Consultas vazias (o padrão do mockAccount) com a cobertura das fontes da recuperação respondendo, e a estratégia quando pedida. */
async function mockPaineis(context: BrowserContext, profile: "admin" | "viewer", opcoes: { comEstrategia?: boolean } = {}) {
  await mockAccount(context, profile);
  await context.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rest/v1/rpc/operacao_fontes") return route.fulfill({ json: { apto: true, limite_horas: 24, fontes: [] } });
    if (path === "/rest/v1/cliente_modulos") return route.fulfill({ json: [{ modulo: "hub", status: "ativo" }, { modulo: "brand_brain", status: "ativo" }] });
    if (opcoes.comEstrategia && path === "/rest/v1/campanhas_ideias" && route.request().method() === "GET" && !(route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object")) return route.fulfill({ json: [ideia] });
    return route.fallback();
  });
}

/** Gasto mínimo para a tela de anúncios abrir (sem gasto ela mostra só o aviso e não monta o painel de recomendações). */
async function mockGasto(context: BrowserContext) {
  const dia = (i: number) => new Date(Date.now() - (i + 1) * 86400_000).toISOString().slice(0, 10);
  const linhas = (de: string, ate: string) => Array.from({ length: 30 }, (_, i) => dia(i)).filter((d) => d >= de && d <= ate)
    .map((date) => ({ date, campaign_id: "c1", spend: 20, impressions: 2000, link_clicks: 30, conversations: 1, leads: 0, landing_page_views: 0, reach: 1500, clicks: 40 }));
  await context.route("**/rest/v1/meta_ads_daily?**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    return r.fulfill({ json: Number(p.get("offset") ?? 0) ? [] : linhas(de, ate) });
  });
  await context.route("**/rest/v1/meta_ads_campaigns?**", (r) => r.fulfill({ json: [{ campaign_id: "c1", name: "Primeira consulta fictícia", objective: "MESSAGES" }] }));
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => r.fulfill({ json: [{ gasto: 600, conversas: 30, impressoes: 60000, cliques_link: 900, campanhas: 1, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: 20 }] }));
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    return r.fulfill({ json: linhas(b.p_start, b.p_end).map((l) => ({ dia: l.date, gasto: l.spend, conversas: l.conversations })) });
  });
}

/** Nenhum cartão Tailwind nem ws-panel dentro das peças dos agentes, e nenhuma rolagem lateral. */
async function conferirDesenho(page: Page) {
  await expect(page.locator('[data-peca="agentes"]').first()).toBeVisible();
  await expect(page.locator('[data-peca="agentes"] .rounded-xl.border, [data-peca="agentes"] .ws-panel')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

const TELAS: { nome: string; caminho: string; abrir?: (page: Page) => Promise<void>; planejador?: boolean }[] = [
  { nome: "Agentes e entregas", caminho: `/${CID}/agentes` },
  { nome: "Resultados dos anúncios", caminho: `/${CID}/anuncios`, abrir: async (page) => { await page.getByText("Ver recomendações e ações para os anúncios").click(); } },
  { nome: "Qualidade do atendimento", caminho: `/${CID}/atendimento` },
  { nome: "Ideias (roteiros)", caminho: `/${CID}/ideias?visao=roteiros` },
  { nome: "Ideias (semana)", caminho: `/${CID}/ideias?visao=semana`, planejador: true },
  { nome: "Estratégias e campanhas", caminho: `/${CID}/campanhas` },
];

for (const width of [375, 1440]) {
  test(`as 5 telas mostram os painéis nx, com vazio que diz quem resolve, em ${width}px`, async ({ page, context }) => {
    await mockPaineis(context, "admin");
    await mockGasto(context);
    await page.setViewportSize({ width, height: 900 });
    for (const tela of TELAS) {
      await page.goto(tela.caminho);
      if (tela.abrir) await tela.abrir(page);
      if (tela.planejador) await expect(page.getByRole("region", { name: "Planejador da semana", exact: true })).toBeVisible();
      await conferirDesenho(page);
      // As consultas voltam vazias: o painel diz o que falta e quem resolve, e não mostra número inventado.
      await expect(page.getByText("Quem resolve:").first(), tela.nome).toBeVisible();
    }
  });
}

test("viewer não vê botão de executar nem de decidir nos painéis", async ({ page, context }) => {
  await mockPaineis(context, "viewer", { comEstrategia: true });
  await page.goto(`/${CID}/agentes?agente=campanhas`);
  const entregas = page.getByRole("region", { name: "Área de revisão das entregas" });
  await expect(entregas.getByText(ideia.titulo, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar estratégias" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gerar novas estratégias" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preparar roteiros agora" })).toHaveCount(0);
  await expect(entregas.getByLabel("Estado da estratégia")).toHaveCount(0);
  await expect(entregas.getByText("Proposta", { exact: true })).toBeVisible();
  await page.goto(`/${CID}/ideias?visao=roteiros`);
  await expect(page.getByRole("button", { name: "Levar ao planejador" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Feito" })).toHaveCount(0);
});

test("admin vê o estado da estratégia e o botão de gerar, com o detalhe recolhido", async ({ page, context }) => {
  await mockPaineis(context, "admin", { comEstrategia: true });
  await page.goto(`/${CID}/campanhas`);
  await expect(page.getByLabel("Estado da estratégia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar novas estratégias" })).toBeVisible();
  await expect(page.getByText(ideia.passos[0], { exact: true })).toBeHidden();
  await page.getByText("Evidências, passos e mensagem", { exact: true }).click();
  await expect(page.getByText(ideia.passos[0], { exact: true })).toBeVisible();
});
