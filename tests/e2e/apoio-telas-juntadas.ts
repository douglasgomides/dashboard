import { expect, type BrowserContext, type Page } from "@playwright/test";
import { CID } from "./fixtures";

// Apoio dos e2e das telas juntadas (Phase 3.1.1, D-04 e MEDV-04): medida da altura da aba aberta e os mocks de Instagram e
// de Pacientes, copiados de resultados-painel.spec.ts (a cópia é de propósito: aquele spec não muda por causa desta fase).

/** Janelas da régua de altura: celular e computador (decisão do planejador para "1,5 altura de tela": 812 no celular). */
export const TELAS_DE_MEDIDA = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const;

/** Altura máxima da aba aberta, em múltiplos da altura da janela (D-04). */
export const LIMITE_DE_ALTURA = 1.5;

/**
 * Instagram > Desempenho, a única exceção à régua de 1,5 tela. João 13/11/2026: Top 5 na tela mesmo passando do limite ("Seus 5 posts
 * que mais salvaram" saiu do "Ver tudo" e mora à vista, entre as descobertas e o "Ver tudo"). O limite desta tela é em px, por largura:
 * a altura medida em 13/11/2026 com o Top 5 à vista e o Ver tudo fechado, na aba Formato (a que a tela abre), mais 40 px de folga.
 * Medida (cinco-segundos-instagram.spec.ts, a maior dos specs que medem esta tela): 1510 px em 375x812 e 1630 px em 1440x900.
 */
export const LIMITE_DO_DESEMPENHO_COM_TOP5: Record<number, number> = { 375: 1510 + 40, 1440: 1630 + 40 };

export const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/**
 * Altura da tela juntada aberta (faixa de abas + corpo da aba), em px, com a altura da janela ao lado.
 * Só mede com a leitura carregada (nenhuma leitura em "carregando" e nenhum NxCarregando dentro do elemento) e falha se
 * houver details aberto dentro dele: a medida não passa à toa com a tela carregando, vazia ou com o detalhe aberto.
 */
export async function alturaDaAbaAberta(page: Page, seletor = "[data-juntada]"): Promise<{ altura: number; janela: number }> {
  const alvo = page.locator(seletor).first();
  await expect(alvo).toBeVisible();
  // O veredito (formato 5 segundos, 03.1.1.1), a leitura ou, nas abas das pastas sem leitura (quick-ver-tudo-abas), o topo das
  // descobertas da aba precisa existir (a tela montou) e já ter saído de "carregando". O topo da aba pode estar vazio (altura 0): conta.
  await expect(alvo.locator('[data-peca="veredito"]:visible, [data-peca="leitura"]:visible, [data-peca="descobertas-da-aba"]').first()).toBeAttached();
  await expect(alvo.locator('[data-peca="veredito"][data-modo="carregando"], [data-peca="leitura"][data-modo="carregando"], [data-peca="descobertas-da-aba"][data-modo="carregando"], [data-peca="carregando"]')).toHaveCount(0);
  expect(await alvo.locator("details[open]").count(), "a medida exige todo details fechado").toBe(0);
  return alvo.evaluate((el) => ({ altura: el.getBoundingClientRect().height, janela: innerHeight }));
}

/**
 * Dia (AAAA-MM-DD) de `i` dias atrás no fuso de Brasília, o mesmo "hoje" do app. Os mocks não podem usar o dia em UTC: entre 21h e 24h de Brasília o
 * dia UTC já é o seguinte e desloca toda janela de período (um spec que passa de manhã falharia à noite).
 */
export const diaBR = (i: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - i * 86400000));
const dia = diaBR;
const num = (valor: number | null, extra: Record<string, unknown> = {}) => ({ valor, fonte: "crm", motivo_sem_dado: valor == null ? "Sem dado no CRM." : null, responsavel: "comercial", ...extra });
const pessoa = (i: number) => ({ id: `p${i}`, pessoa: `pp${i}`, nome: `Pessoa fictícia ${i}`, canal: "whatsapp", conversa_id: null, data: dia(i + 1), fonte: "crm", crm: null, leitura: null });
const lista = (n: number) => ({ total: n, itens: Array.from({ length: Math.min(n, 3) }, (_, i) => pessoa(i)) });
const CHAVES = ["mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam", "abordados", "engajaram_instagram"];

export async function mockInstagram(context: BrowserContext) {
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
      date: diaBR(i),
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

/**
 * Audiência lida ao vivo da Meta (POST /api/sync/manual, alvo "audiencia"): sem este mock a aba Público abre em erro e a medida
 * de altura mediria a tela vazia. Dados fictícios, só leitura.
 */
export async function mockAudiencia(context: BrowserContext) {
  const par = (chave: string, valor: number) => ({ chave, valor });
  const dados = {
    gerado_em: new Date().toISOString(),
    periodo: { dias: 30, de: dia(30), ate: dia(0) },
    seguidores: {
      ok: true,
      dados: {
        faixa_etaria: [par("13-17", 40), par("18-24", 300), par("25-34", 900), par("35-44", 700), par("45-54", 300), par("55-64", 90), par("65+", 30)],
        genero: [par("F", 1800), par("M", 500), par("U", 60)],
        cidades: [par("São Paulo, São Paulo", 700), par("Campinas, São Paulo", 200), par("Santos, São Paulo", 120)],
        paises: [par("BR", 2300), par("PT", 40)],
      },
    },
    alcancados_no_mes: {
      ok: true,
      dados: {
        mes: "2026-10",
        faixa_etaria: [par("18-24", 800), par("25-34", 2000), par("35-44", 1500), par("45-54", 600), par("55-64", 200)],
        genero: [par("F", 4000), par("M", 1000)],
        cidades: [par("São Paulo, São Paulo", 1500), par("Campinas, São Paulo", 500)],
      },
    },
    engajados_no_mes: {
      ok: true,
      dados: { mes: "2026-10", faixa_etaria: [par("18-24", 80), par("25-34", 200), par("35-44", 150), par("45-54", 60), par("55-64", 20)] },
    },
    alcance_por_tipo_de_seguidor: { ok: true, dados: { total: 9000, seguidores: 3500, nao_seguidores: 5500 } },
    visualizacoes_por_tipo_de_seguidor: { ok: true, dados: { total: 20000, seguidores: 8000, nao_seguidores: 12000 } },
    origem: {
      ok: true,
      dados: [
        { conteudo: "REEL", alcance: 5000, visualizacoes: 12000, interacoes: 600 },
        { conteudo: "POST", alcance: 3000, visualizacoes: 6000, interacoes: 400 },
        { conteudo: "STORY", alcance: 1000, visualizacoes: 2000, interacoes: 100 },
      ],
    },
    interacoes: { ok: true, dados: { curtidas: 900, comentarios: 120, salvamentos: 300, compartilhamentos: 80 } },
    seguiram_e_deixaram: { ok: true, dados: { seguiram: 200, deixaram_de_seguir: 90, saldo: 110 } },
    horarios: { ok: true, dados: { dias: 30, fuso: "America/Sao_Paulo", mapa: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => 50 + ((d * 31 + h * 17) % 90))) } },
    stories_ao_vivo: { ok: true, dados: [] },
  };
  await context.route("**/api/sync/manual", (r) => r.fulfill({ json: { ok: true, dados } }));
}

/** Pessoas, histórico diário e vendas: os mesmos dados de Pacientes do período, que também alimentam os cartões de Resultados. */
export async function mockPessoas(context: BrowserContext) {
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

/**
 * Dados do CRM (Funil comercial, Jornada comercial e Resultados por origem): os mesmos mocks que comercial-painel.spec.ts usa
 * (copiados de propósito), com etapas que passam da base mínima de LIMITES.funil. Dados fictícios, só leitura.
 */
export async function mockCrm(context: BrowserContext) {
  const rpc = (nome: string, json: unknown) => context.route(`**/rest/v1/rpc/${nome}`, (r) => r.fulfill({ json }));
  const contagem = { leads: 200, atendidos: 150, na_entrada: 50, na_entrada_3d: 10, agendados: 60, em_consulta: 60, agendados_provaveis: 60, ganhos_em_etapa_agenda: 2, parece_consulta: 0, ganhos: 25, perdidos: 10, com_origem: 150, origem_eh_funil: 0, com_contato: 180, abertos: 165 };
  await rpc("crm_diagnostico_comercial", { provider: "kommo", periodo: contagem, base: { ...contagem, leads: 500 }, etapas_total: 10, etapas_consulta: 2, etapas_parece_consulta: 0 });
  await rpc("crm_metricas_essenciais", [{ total_leads: 500, ganhos: 40, perdidos: 30, consultas_agendadas: 40, em_atendimento: 100, em_atendimento_valor: 20000, novos_7d: 15, fonte_preenchida_pct: 80 }]);
  await rpc("crm_leads_resumo_periodo", [{ novos: 68, ganhos: 4, perdidos: 3, valor: 12000 }]);
  await rpc("crm_funil_por_campo", [
    { chave: "Instagram", total: 300, ganhos: 30, perdidos: 60, abertos: 210 },
    { chave: "Indicação", total: 100, ganhos: 20, perdidos: 10, abertos: 70 },
    { chave: "Não informado", total: 20, ganhos: 2, perdidos: 0, abertos: 18 },
  ]);
  await rpc("crm_leads_por_etapa", [
    { pipeline: "Funil de pacientes", etapa: "Entrada", total: 120 },
    { pipeline: "Funil de pacientes", etapa: "Consulta agendada", total: 60 },
    { pipeline: "Funil de pacientes", etapa: "Ganho", total: 40 },
  ]);
  await rpc("jornada_funil", {
    alcance: 50000, dias_alcance: 30, interacoes: 2000, dias_interacoes: 30, comentarios: 300, comentaristas: 200, conversas: 120, leads: 100, leads_com_etapa: 90,
    agendados: 30, vendas: 6, receita: 0, dias_periodo: 30,
    fontes: { tem_instagram: true, tem_comentarios: true, tem_whatsapp: true, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "kommo" },
  });
  await rpc("jornada_resumo", {
    leads_total: 80, leads_sem_pessoa: 50, pessoas: 200, comentaram: 60, conversaram: 120, viraram_lead: 70, ganhos: 9, receita: 0,
    comentaram_e_lead: 10, conversaram_e_lead: 50, comentaram_e_conversaram: 20, por_origem: [], posts: [], links: [],
  });
  await rpc("wts_resumo", [{ atendimentos: 200, contatos_distintos: 150, espera_mediana_seg: 900, espera_cobertura: 180, atendimento_mediano_seg: 40000, em_andamento: 10, concluidos: 190, sem_roteamento: 20 }]);
}

/**
 * Anúncios (Resultados dos anúncios): os mesmos mocks de anuncios-painel.spec.ts (copiados de propósito) com duas variantes.
 * "bom": 3 campanhas com rastreio confiável e conversas 20% acima do período anterior. "suspeito": o caso Doctor Creator,
 * 7.391 cliques no link e 29 conversas atribuídas (a leitura tem que dizer "Sem leitura" e mandar para o gestor de tráfego).
 * Dados fictícios, só leitura.
 */
export async function mockAnuncios(context: BrowserContext, variante: "bom" | "suspeito" = "bom") {
  const dia1 = (i: number) => diaBR(i + 1);
  const campanhas = [
    { campaign_id: "c1", name: "Primeira consulta fictícia", objective: "MESSAGES", spend: 60, conv: 3, imp: 5000, clk: 70 },
    { campaign_id: "c2", name: "Tráfego fictício", objective: "OUTCOME_TRAFFIC", spend: 30, conv: 0, imp: 6000, clk: 120 },
    { campaign_id: "c3", name: "Alcance fictício", objective: "OUTCOME_AWARENESS", spend: 20, conv: 0, imp: 9000, clk: 15 },
  ];
  const suspeito = variante === "suspeito";
  const linhas = (de: string, ate: string) => {
    const out: Record<string, unknown>[] = [];
    if (suspeito) {
      // Uma linha só, com os números do caso: o diagnóstico soma 7.391 cliques no link e 29 conversas.
      const d = dia1(5);
      if (d >= de && d <= ate) out.push({ date: d, campaign_id: "c2", spend: 3000, impressions: 400000, link_clicks: 7391, conversations: 29, leads: 0, landing_page_views: 0, reach: 280000, clicks: 9000 });
      return out;
    }
    for (let i = 59; i >= 0; i--) {
      const d = dia1(i);
      if (d < de || d > ate) continue;
      for (const c of campanhas) out.push({ date: d, campaign_id: c.campaign_id, spend: c.spend, impressions: c.imp, link_clicks: c.clk, conversations: c.conv, leads: 0, landing_page_views: 0, reach: c.imp * 0.7, clicks: c.clk });
    }
    return out;
  };
  await context.route("**/rest/v1/meta_ads_daily?**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    return r.fulfill({ json: Number(p.get("offset") ?? 0) ? [] : linhas(de, ate) });
  });
  await context.route("**/rest/v1/meta_ads_campaigns?**", (r) => r.fulfill({ json: campanhas.map((c) => ({ campaign_id: c.campaign_id, name: c.name, objective: c.objective })) }));
  // Período anterior com 20% menos conversas e o mesmo gasto: a variação de conversas aparece no cartão e na leitura.
  await context.route("**/rest/v1/rpc/ads_resumo", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const anterior = b.p_end < dia1(25);
    return r.fulfill({ json: [{ gasto: 3000, conversas: suspeito ? (anterior ? 25 : 29) : anterior ? 75 : 90, impressoes: 600000, cliques_link: suspeito ? 7391 : 6000, campanhas: 3, ctr: 1, cpc: 0.5, cpm: 5, custo_por_conversa: 30 }] });
  });
  await context.route("**/rest/v1/rpc/ads_por_dia", (r) => {
    const b = r.request().postDataJSON() ?? {};
    const por = new Map<string, { dia: string; gasto: number; conversas: number }>();
    for (const l of linhas(b.p_start, b.p_end) as { date: string; spend: number; conversations: number }[]) {
      const x = por.get(l.date) ?? { dia: l.date, gasto: 0, conversas: 0 };
      x.gasto += l.spend;
      x.conversas += l.conversations;
      por.set(l.date, x);
    }
    return r.fulfill({ json: [...por.values()].sort((a, b) => a.dia.localeCompare(b.dia)) });
  });
}

/**
 * Links rastreados: 4 links (bio, story, QR code e destaque) com cliques e conversas por link, sem dado pessoal. A tela lê a
 * tabela links_rastreados e a rpc links_funil em páginas (fetchAllRows para quando vem página vazia), então o mock pagina.
 * "vazio" devolve nenhum link criado. Dados fictícios, só leitura.
 */
export async function mockLinks(context: BrowserContext, variante: "com-links" | "vazio" = "com-links") {
  const pagina = (url: string, linhas: unknown[]) => {
    const p = new URL(url).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
  };
  const link = (id: string, slug: string, tipo: string, titulo: string, codigo: string) => ({
    id, slug, short_url: null, tipo, titulo, campanha: null, destino_tipo: "whatsapp", ativo: true, criado_em: "2026-09-01T12:00:00Z", codigo_ref: codigo, mensagem_modelo: `Olá! Vim pelo link (${codigo})`,
  });
  const links = variante === "vazio" ? [] : [
    link("l1", "clinica-bio", "bio", "Bio principal", "R27"),
    link("l2", "clinica-story", "story", "Story de outubro", "R28"),
    link("l3", "clinica-qr", "qr", "QR do consultório", "R29"),
    link("l4", "clinica-destaque", "destaque", "Destaque de preços", "R30"),
  ];
  const funil = variante === "vazio" ? [] : [
    { link_id: "l1", cliques: 300, conversas: 40, provaveis: 2, agendou: 10, vendas: 2, receita: 4000 },
    { link_id: "l2", cliques: 100, conversas: 12, provaveis: 0, agendou: 3, vendas: 0, receita: 0 },
    { link_id: "l3", cliques: 20, conversas: 3, provaveis: 0, agendou: 1, vendas: 0, receita: 0 },
    { link_id: "l4", cliques: 50, conversas: 6, provaveis: 0, agendou: 2, vendas: 1, receita: 1500 },
  ];
  await context.route("**/rest/v1/links_rastreados**", (r) => r.fulfill({ json: pagina(r.request().url(), links) }));
  await context.route("**/rest/v1/rpc/links_funil**", (r) => r.fulfill({ json: pagina(r.request().url(), funil) }));
}
