import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { abrirVerTudo } from "./apoio-cinco-segundos";

// Seção Resultados no molde novo (Phase 3.1, plano 03): Resultados da clínica abre com o resumo da clínica em 3 linhas
// (a única leitura), até 4 cartões e um gráfico; tudo o mais fica no detalhe recolhido. Pacientes do período e as duas
// telas em construção (O que virou paciente, O que virou venda) abrem com leitura, ou com "Falta dado:" e quem resolve.
// 03.1.1.1 (plano 03): Resultados passou ao formato 5 segundos. O veredito, os anéis, os 3 cartões de dinheiro e as descobertas abrem a tela;
// o resumo da clínica, os 4 cartões de pessoas, o gráfico de contatos e todo o detalhe moram no "Ver tudo", que estes testes abrem antes de ler.

const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
const num = (valor: number | null, extra: Record<string, unknown> = {}) => ({ valor, fonte: "crm", motivo_sem_dado: valor == null ? "Sem dado no CRM." : null, responsavel: "comercial", ...extra });
const pessoa = (i: number) => ({ id: `p${i}`, pessoa: `pp${i}`, nome: `Pessoa fictícia ${i}`, canal: "whatsapp", conversa_id: null, data: dia(i + 1), fonte: "crm", crm: null, leitura: null });
const lista = (n: number) => ({ total: n, itens: Array.from({ length: Math.min(n, 3) }, (_, i) => pessoa(i)) });
const CHAVES = ["mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam", "abordados", "engajaram_instagram"];

async function instagram(context: BrowserContext) {
  const pagina = (url: string, linhas: unknown[]) => {
    const p = new URL(url).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
  };
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      client_id: CID,
      reach: 900 + ((i * 137) % 600),
      new_followers: 8 + (i % 7),
      unfollowers: 3,
      total_interactions: 60 + ((i * 13) % 50),
      saves: 20 + (i % 9),
      profile_links_taps: 4,
      followers_count: 5000 - i * 9,
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const formatos = ["reels", "carrossel", "estatico"];
    const linhas = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      client_id: CID,
      windsor_media_id: `m${i}`,
      caption: `Post de teste ${i}`,
      format: formatos[i % 3],
      posted_at: new Date(Date.now() - ((i % 20) + 2) * 86400000).toISOString(),
      reach: 800 + i * 40,
      engagement: 40 + ((i * 7) % 30),
      saved: 5 + (i % 6),
      permalink: null,
      thumbnail_url: null,
    }));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
}

/** Pessoas, histórico diário e vendas: os mesmos dados de Pacientes do período, que também alimentam os cartões de Resultados. */
async function pessoas(context: BrowserContext) {
  const rpc = (nome: string, json: unknown) => context.route(`**/rest/v1/rpc/${nome}`, (r) => r.fulfill({ json }));
  await rpc("pacientes_periodo", {
    periodo: { de: dia(30), ate: dia(0) }, cliente_de_teste: false, tem_crm: true, tem_conversas: true, tem_leitura_ia: false, tem_funil_prospeccao: false,
    numeros: {
      mandaram_mensagem: num(120), leads_novos: num(80), antigos: num(40), agendaram: num(30), negociacao: num(12), compareceram: num(null),
      fecharam: num(9, { vendas: 9, sem_valor: 0, valor_total: 18000 }), abordados: num(null), engajaram_instagram: num(15),
    },
    listas: Object.fromEntries(CHAVES.map((k) => [k, lista(k === "agendaram" ? 30 : 5)])),
  });
  await rpc("pacientes_vendas", { total: 0, itens: [] });
  await context.route("**/rest/v1/resultados_diarios**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("dia");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 70 }, (_, i) => ({
      dia: dia(i), mandaram_mensagem: 20 + (i % 5), leads_novos: 12, antigos: 8, agendaram: 3 + (i % 3), negociacao: 2, compareceram: null, fecharam: 1,
    }))
      .filter((l) => l.dia >= de && l.dia <= ate)
      .sort((a, b) => a.dia.localeCompare(b.dia));
    return r.fulfill({ json: linhas });
  });
}

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

for (const width of [375, 1440]) {
  test(`Resultados: resumo da clínica em 3 linhas, até 4 cartões e o resto no detalhe, sem rolagem lateral em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await instagram(context);
    await pessoas(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${CID}?preset=30d`);

    // O formato 5 segundos abre a tela: o veredito primeiro, os 3 cartões de dinheiro e o gráfico "você agora contra você antes".
    await expect(page.locator('[data-tela="resultados"] [data-peca="veredito"]')).toBeVisible();
    expect(await page.locator(".nx-pagina__cartoes [data-peca=\"cartao-numero\"]").count()).toBeLessThanOrEqual(3);
    await expect(page.locator(".nx-pagina__principal [data-peca=\"agora-contra-antes\"]")).toBeVisible();

    // O resumo da clínica saiu do "Ver tudo" (quick-ver-tudo, João 13/11/2026): o que só ele dizia virou descoberta, no mesmo desenho das de
    // cima, e a ação da semana é a ação de uma delas, com quem resolve. O período fica uma vez só, no começo do "Ver tudo".
    await abrirVerTudo(page, '[data-tela="resultados"]');
    await expect(page.getByRole("region", { name: "Resumo da clínica", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Leitura do período", exact: true })).toHaveCount(0);
    const proximo = page.locator('[data-tela="resultados"] [data-proximo-passo]');
    await expect(proximo).toHaveCount(1);
    await expect(proximo.locator(".nx-acao-pilula__texto")).toBeVisible();
    await expect(proximo.getByText(/Quem resolve:/)).toHaveCount(1);
    await expect(page.locator('.nx-pagina__detalhe [data-peca="periodo-do-ver-tudo"]')).toContainText("comparado com");

    // O dinheiro e o gráfico de contatos, no começo do "Ver tudo". Chamaram, Agendaram e Fecharam já estão nos anéis do topo.
    await expect(page.locator(".nx-pagina__detalhe .nx-kpi", { hasText: "Chamaram" })).toHaveCount(0);
    await expect(page.locator(".nx-pagina__detalhe .nx-kpi").first()).toContainText(/Faturamento|Investimento/);
    // O nome do bloco fica em cima da frase de resposta; o título do cartão de dentro continua para leitor de tela.
    await expect(page.locator(".nx-pagina__detalhe .nx-bloco-vt__rotulo", { hasText: "Contatos e agendamentos por dia" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contatos e agendamentos por dia" })).toBeAttached();
    // O que brigava pelo topo saiu dele: prioridade recomendada e as 8 respostas só no detalhe.
    await expect(page.getByText("Prioridade recomendada")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Diagnóstico estratégico" })).toHaveCount(0);
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/resultados-${width}.png`, fullPage: true });

    // Detalhe recolhido: o "Ver tudo" já está aberto, e um toque abre cada parte.
    await page.locator("#instagram > summary").click();
    const instagramRegiao = page.getByRole("region", { name: "Resultados do Instagram", exact: true });
    await expect(instagramRegiao.locator(".nx-kpi")).toHaveCount(4);
    await expect(instagramRegiao.locator(".nx-kpi .ws-metric-value").first()).toBeVisible();
    const instagramBloco = page.locator("#instagram");
    await expect(instagramBloco.locator(".nx-linha__svg")).toHaveCount(2);
    await expect(instagramBloco.locator(".nx-colunas")).toBeVisible();
    await expect(instagramBloco.locator(".nx-pizza svg")).toBeVisible();
    await expect(instagramBloco.locator(".nx-medidor svg")).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // O gráfico de linha continua levando aos posts do dia, também pelo teclado.
    const grafico = instagramBloco.getByRole("slider", { name: /^Alcance e interações por dia/ });
    await grafico.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(instagramBloco.getByRole("heading", { name: /^O que aconteceu em/ })).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);

    // As análises de hoje, agora dentro do detalhe: cada uma com evidência e quem resolve.
    await page.locator("#todas-analises > summary").click();
    const analises = page.locator("#todas-analises");
    await expect(analises.getByRole("heading", { name: "Resumo do período" })).toBeVisible();
    await expect(analises.getByRole("heading", { name: "O que fazer nesta semana" })).toBeVisible();
    await expect(analises.getByText(/Quem resolve:/).first()).toBeVisible();
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/resultados-detalhe-${width}.png`, fullPage: true });
  });

  test(`Pacientes do período e as telas em construção abrem com leitura ou "Falta dado:" e quem resolve em ${width}px`, async ({ page, context }) => {
    await mockAccount(context, "admin");
    await instagram(context);
    await pessoas(context);
    await page.setViewportSize({ width, height: 900 });

    // Pacientes (03.1.1.1, plano 05): o veredito abre a tela. A leitura do período saiu do "Ver tudo" (quick-ver-tudo, João 13/11/2026): o que só
    // ela dizia virou descoberta, e o próximo passo dela é a ação de uma descoberta, com quem resolve.
    await page.goto(`/${CID}/pacientes?preset=30d`);
    await expect(page.locator('[data-tela="pacientes"] [data-peca="veredito"]:not([data-modo="carregando"])')).toBeVisible();
    await abrirVerTudo(page, '[data-tela="pacientes"]');
    await expect(page.getByRole("region", { name: "Leitura do período", exact: true })).toHaveCount(0);
    const proximo = page.locator('[data-tela="pacientes"] [data-proximo-passo]');
    await expect(proximo).toHaveCount(1);
    await expect(proximo.locator(".nx-acao-pilula__texto")).toBeVisible();
    await expect(proximo.getByText(/Quem resolve:/)).toHaveCount(1);
    await expect(page.locator('[data-tela="pacientes"] [data-peca="periodo-do-ver-tudo"]')).toContainText("comparado com");
    expect(await semRolagemLateral(page)).toBe(true);
    await page.screenshot({ path: `test-results/redesenho/pacientes-leitura-${width}.png`, fullPage: true });

    // As duas telas em construção: dizem o que falta e quem resolve, sem número inventado.
    for (const [rota, titulo, falta] of [
      ["consultas", "O que virou paciente", "a fonte que mostra quem virou consulta"],
      ["vendas", "O que virou venda", "a fonte que mostra quem virou venda"],
    ] as const) {
      await page.goto(`/${CID}/${rota}?preset=30d`);
      await expect(page.locator(`.nx-pagina[data-tela="${rota}"]`)).toBeVisible();
      await expect(page.getByText("Falta dado: a tela ainda não tem a fonte ligada")).toBeVisible();
      await expect(page.getByText(`O que falta: ${falta}`)).toBeVisible();
      await expect(page.getByText("Quem resolve: Equipe Doctor Creator").first()).toBeVisible();
      await expect(page.getByText("Em construção")).toBeVisible();
      await expect(page.getByText(titulo, { exact: true }).first()).toBeVisible();
      expect(await semRolagemLateral(page)).toBe(true);
      await page.screenshot({ path: `test-results/redesenho/${rota}-${width}.png`, fullPage: true });
    }
  });
}
