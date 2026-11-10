import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";

// Telas Comercial e pacientes no desenho do painel: números em cartões no topo, gráfico principal em SVG, método
// recolhido e nenhuma rolagem lateral. Dados fictícios.

const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
const num = (valor: number | null, extra: Record<string, unknown> = {}) => ({ valor, fonte: "crm", motivo_sem_dado: valor == null ? "Sem dado no CRM." : null, responsavel: "comercial", ...extra });
const pessoa = (i: number) => ({ id: `p${i}`, pessoa: `pp${i}`, nome: `Pessoa fictícia ${i}`, canal: "whatsapp", conversa_id: null, data: dia(i + 1), fonte: "crm", crm: null, leitura: null });
const lista = (n: number) => ({ total: n, itens: Array.from({ length: Math.min(n, 3) }, (_, i) => pessoa(i)) });
const CHAVES = ["mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam", "abordados", "engajaram_instagram"];

async function dados(context: BrowserContext) {
  const rpc = (nome: string, json: unknown) => context.route(`**/rest/v1/rpc/${nome}`, (r) => r.fulfill({ json }));
  await rpc("pacientes_periodo", {
    periodo: { de: dia(30), ate: dia(0) }, cliente_de_teste: false, tem_crm: true, tem_conversas: true, tem_leitura_ia: false, tem_funil_prospeccao: false,
    numeros: { mandaram_mensagem: num(120), leads_novos: num(80), antigos: num(40), agendaram: num(30), negociacao: num(12), compareceram: num(null), fecharam: num(9, { vendas: 9, sem_valor: 0, valor_total: 18000 }), abordados: num(null), engajaram_instagram: num(null) },
    listas: Object.fromEntries(CHAVES.map((k) => [k, lista(k === "agendaram" ? 30 : 5)])),
  });
  await rpc("pacientes_vendas", { total: 0, itens: [] });
  await rpc("crm_metricas_essenciais", [{ total_leads: 500, ganhos: 40, perdidos: 30, consultas_agendadas: 40, em_atendimento: 100, em_atendimento_valor: 20000, novos_7d: 15, fonte_preenchida_pct: 80 }]);
  await rpc("crm_leads_resumo_periodo", [{ novos: 68, ganhos: 4, perdidos: 3, valor: 12000 }]);
  await context.route("**/rest/v1/rpc/crm_funil_por_campo", (r) =>
    r.fulfill({ json: [{ chave: "Instagram", total: 300, ganhos: 30, perdidos: 60, abertos: 210 }, { chave: "Indicação", total: 100, ganhos: 20, perdidos: 10, abertos: 70 }] }),
  );
  await rpc("jornada_resumo", { leads_total: 80, leads_sem_pessoa: 50, pessoas: 200, comentaram: 60, conversaram: 120, viraram_lead: 70, ganhos: 9, receita: 0, comentaram_e_lead: 10, conversaram_e_lead: 50, comentaram_e_conversaram: 20, por_origem: [], posts: [], links: [] });
  await rpc("wts_resumo", [{ atendimentos: 200, contatos_distintos: 150, espera_mediana_seg: 900, espera_cobertura: 180, atendimento_mediano_seg: 40000, em_andamento: 10, concluidos: 190, sem_roteamento: 20 }]);
  await rpc("wts_volume_diario", Array.from({ length: 10 }, (_, i) => ({ dia: dia(9 - i), atendimentos: 10 + i, espera_mediana_seg: 600 + i * 30 })));
  await rpc("wts_por_departamento", [{ departamento: "Comercial", atendimentos: 180, fatia: 90, espera_mediana_seg: 800, atendimento_mediano_seg: 30000 }]);
}

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [375, 1440]) {
  test(`Pacientes: leitura, números em cartões, funil em barras e lista pelo teclado, sem rolagem lateral em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await dados(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/pacientes?preset=30d`);
    // A leitura vem primeiro (molde novo): o que aconteceu com número ao lado, só por regra, sem nome de paciente.
    const leitura = page.getByRole("region", { name: "Leitura do período", exact: true });
    await expect(leitura.getByText("O que aconteceu", { exact: true })).toBeVisible();
    await expect(leitura.locator(".nx-leitura__num").first()).toBeVisible();
    await expect(leitura.getByText("Pessoa fictícia")).toHaveCount(0);
    const numeros = page.locator(".nx-pagina__cartoes");
    await expect(numeros.locator(".nx-kpi")).toHaveCount(4);
    await expect(numeros.locator(".ws-metric-value").first()).toHaveText("120");
    await expect(numeros.locator(".ws-metric-value").first()).toBeVisible();
    // Sem dado aparece como texto, nunca como zero.
    await expect(numeros.getByText("Sem dado", { exact: true })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // O funil e a pizza ficam no detalhe recolhido: um toque abre.
    await page.locator(".nx-pagina__detalhe > details > summary").click();
    await expect(page.getByRole("list", { name: "Pessoas em cada etapa" })).toBeVisible();
    await expect(page.locator(".nx-pizza svg[role=img]")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // O cartão abre a lista de quem são, também pelo teclado.
    const abrir = numeros.getByRole("button", { name: /^Agendaram: 30\. Ver quem são/ });
    await abrir.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Agendaram: 30 pessoas/ })).toBeVisible();
    await expect(abrir).toHaveAttribute("aria-expanded", "true");
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/pacientes-${width}.png`, fullPage: true });
  });

  test(`Funil comercial: período em cartões antes do funil, taxa em meia-lua, método recolhido em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dados(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}/crm-painel?preset=7d`);
    const periodo = page.getByRole("region", { name: "No período selecionado" });
    await expect(periodo.locator(".nx-kpi")).toHaveCount(4);
    await expect(periodo.locator(".ws-metric-value").first()).toHaveText("68");
    await expect(page.locator("#conversao .nx-medidor svg[role=img]")).toHaveAttribute("aria-label", /Taxa de conversão: 57%/);
    await expect(page.getByRole("list", { name: "Leads da base em cada situação" })).toBeVisible();
    // O método fica recolhido, mas um toque abre.
    const metodo = page.locator("#funil-base .cm-metodo");
    await expect(metodo.locator(".cm-metodo__corpo")).toBeHidden();
    await metodo.locator("summary").click();
    await expect(metodo.getByText(/Taxa de conversão = ganhos ÷ \(ganhos \+ perdidos\)/)).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Resultados por origem, Jornada e Atendimento abrem com números e gráfico em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "viewer");
    await dados(context);
    await page.setViewportSize({ width, height: 900 });

    await page.goto(`/${CID}/vendas-kommo`);
    const base = page.getByRole("region", { name: "Números da base" });
    await expect(base.locator(".ws-metric-value")).toHaveText(["400", "50", "70", "280"]);
    await expect(page.getByRole("list", { name: "Leads por origem" })).toBeVisible();
    await expect(page.locator(".nx-pizza svg[role=img]")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    await page.goto(`/${CID}/jornada?preset=30d`);
    await expect(page.getByRole("region", { name: "Números da jornada" }).locator(".ws-metric-value").first()).toHaveText("200");
    // Mais da metade dos leads soltos: aviso crítico curto, sempre visível.
    await expect(page.locator(".cm-aviso--critico").getByText(/% dos leads criados no período não estão ligados/)).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    await page.goto(`/${CID}/atendimento?preset=30d`);
    const atend = page.getByRole("region", { name: "Números do atendimento" });
    await expect(atend.locator(".ws-metric-value")).toHaveText(["200", "15min", "10%", /\d+/]);
    await expect(page.getByRole("slider", { name: /^Atendimentos por dia e espera/ })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
