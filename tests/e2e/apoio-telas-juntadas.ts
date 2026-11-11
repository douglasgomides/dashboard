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

export const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/**
 * Altura da tela juntada aberta (faixa de abas + corpo da aba), em px, com a altura da janela ao lado.
 * Só mede com a leitura carregada (nenhuma leitura em "carregando" e nenhum NxCarregando dentro do elemento) e falha se
 * houver details aberto dentro dele: a medida não passa à toa com a tela carregando, vazia ou com o detalhe aberto.
 */
export async function alturaDaAbaAberta(page: Page, seletor = "[data-juntada]"): Promise<{ altura: number; janela: number }> {
  const alvo = page.locator(seletor).first();
  await expect(alvo).toBeVisible();
  // A leitura precisa existir (a tela montou) e já ter saído de "carregando".
  await expect(alvo.locator('[data-peca="leitura"]').first()).toBeVisible();
  await expect(alvo.locator('[data-peca="leitura"][data-modo="carregando"], [data-peca="carregando"]')).toHaveCount(0);
  expect(await alvo.locator("details[open]").count(), "a medida exige todo details fechado").toBe(0);
  return alvo.evaluate((el) => ({ altura: el.getBoundingClientRect().height, janela: innerHeight }));
}

const dia = (i: number) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
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
