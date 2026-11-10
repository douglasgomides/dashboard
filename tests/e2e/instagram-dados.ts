import type { BrowserContext } from "@playwright/test";
import { CID } from "./fixtures";

// Dados fictícios das telas de Marketing/Instagram (Analisar desempenho, Público, Destaques, Publicações e
// Conteúdo × Comercial). Nenhum número aqui é de cliente real.

const DIA = 86_400_000;
const isoDia = (i: number) => new Date(Date.now() - i * DIA).toISOString().slice(0, 10);

function pagina(url: string, linhas: unknown[]) {
  const p = new URL(url).searchParams;
  const off = Number(p.get("offset") ?? 0);
  return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
}

const FORMATOS = ["reels", "carrossel", "estatico"] as const;
const TEMAS = ["Menopausa", "Canetas emagrecedoras", "Tireoide", "Sono"];

export function postsFicticios(n = 45) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    client_id: CID,
    windsor_media_id: `m${i}`,
    caption: `Post de teste ${i}: ${TEMAS[i % 4].toLowerCase()} explicado\nlinha 2`,
    format: FORMATOS[i % 3],
    media_type: FORMATOS[i % 3] === "reels" ? "VIDEO" : FORMATOS[i % 3] === "carrossel" ? "CAROUSEL_ALBUM" : "IMAGE",
    media_product_type: FORMATOS[i % 3] === "reels" ? "REELS" : "FEED",
    tema: i % 5 === 4 ? null : TEMAS[i % 4],
    funnel_stage: (["C0", "C1", "C2", "C3"] as const)[i % 4],
    methodology_stage: null,
    posted_at: new Date(Date.now() - ((i % 28) + 2) * DIA - (i % 4) * 4 * 3_600_000).toISOString(),
    reach: 800 + ((i * 137) % 1900),
    engagement: 40 + ((i * 7) % 30),
    saved: 5 + ((i * 5) % 17),
    likes: 30 + (i % 9),
    comments: 3 + (i % 4),
    shares: 2 + (i % 5),
    views: 1200 + i * 30,
    reel_skip_rate: FORMATOS[i % 3] === "reels" ? 0.35 + (i % 5) * 0.04 : null,
    reel_avg_watch_time_ms: FORMATOS[i % 3] === "reels" ? 4200 + (i % 6) * 500 : null,
    permalink: null,
    thumbnail_url: null,
  }));
}

const par = (chave: string, valor: number) => ({ chave, valor });

export function audienciaFicticia() {
  const mapa = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (h < 6 ? 40 : 120 + Math.round(200 * Math.abs(Math.sin((h + d) / 4))))));
  return {
    gerado_em: new Date().toISOString(),
    periodo: { dias: 30, de: isoDia(30), ate: isoDia(1) },
    seguidores: {
      ok: true,
      dados: {
        faixa_etaria: [par("18-24", 420), par("25-34", 1900), par("35-44", 1600), par("45-54", 700), par("55-64", 220), par("65+", 80)],
        genero: [par("F", 3700), par("M", 1100), par("U", 120)],
        cidades: [par("São Paulo, São Paulo (state)", 1400), par("Campinas, São Paulo (state)", 420), par("Rio de Janeiro, Rio de Janeiro (state)", 380), par("Belo Horizonte, Minas Gerais", 260)],
        paises: [par("BR", 4700), par("PT", 90), par("US", 60)],
      },
    },
    alcancados_no_mes: { ok: true, dados: { faixa_etaria: [par("18-24", 900), par("25-34", 3100), par("35-44", 2200), par("45-54", 800), par("55-64", 200), par("65+", 60)], genero: [], cidades: [], mes: "outubro" } },
    engajados_no_mes: { ok: true, dados: { faixa_etaria: [par("18-24", 40), par("25-34", 210), par("35-44", 160), par("45-54", 50), par("55-64", 12)], genero: [], mes: "outubro" } },
    alcance_por_tipo_de_seguidor: { ok: true, dados: { total: 18_000, seguidores: 6_500, nao_seguidores: 11_500 } },
    visualizacoes_por_tipo_de_seguidor: { ok: true, dados: { total: 52_000, seguidores: 21_000, nao_seguidores: 31_000 } },
    origem: {
      ok: true,
      dados: [
        { conteudo: "Reels", alcance: 12_000, visualizacoes: 34_000, interacoes: 900 },
        { conteudo: "Carrossel", alcance: 4_000, visualizacoes: 11_000, interacoes: 520 },
        { conteudo: "Stories", alcance: 1_500, visualizacoes: 6_000, interacoes: 0 },
      ],
    },
    interacoes: { ok: true, dados: { curtidas: 2400, comentarios: 310, salvamentos: 640, compartilhamentos: 280 } },
    seguiram_e_deixaram: { ok: true, dados: { seguiram: 340, deixaram_de_seguir: 95, saldo: 245 } },
    horarios: { ok: true, dados: { dias: 30, fuso: "America/Sao_Paulo", mapa } },
    stories_ao_vivo: { ok: true, dados: [{ id: "s1", postado_em: new Date(Date.now() - 3 * 3_600_000).toISOString(), permalink: null, thumbnail_url: null, media_type: "IMAGE", alcance: 640, views: 900, respostas: 4, compartilhamentos: 2, interacoes: 12 }] },
  };
}

export function comercialFicticio() {
  const dias = Array.from({ length: 30 }, (_, k) => {
    const i = 29 - k;
    const posts = i % 2 === 0 ? 1 : i % 7 === 3 ? 2 : 0;
    return { dia: isoDia(i), posts, alcance: posts * 1400, conversas: 6 + (posts ? 4 : 0) + (i % 3), comerciais: 4 + (i % 3), agendaram: 1 + (i % 3 === 0 ? 2 : 0) };
  });
  const grade = Array.from({ length: 7 * 18 }, (_, k) => ({ dow: k % 7, hora: 6 + Math.floor(k / 7), posts: k % 11 === 0 ? 1 : 0, conversas: (k * 7) % 13, agendaram: k % 5 === 0 ? 1 : 0 }));
  const tema = (t: string, posts: number, conversas: number, agendaram: number) => ({ tema: t, posts, alcance: posts * 1200, conversas, pessoas: conversas - 1, comerciais: conversas, pediram_preco: Math.round(conversas / 4), agendaram, pessoas_agendaram: agendaram });
  return {
    dias,
    grade,
    efeito_post: { dias_com_post: 18, media_com_post: 11, dias_sem_post: 12, media_sem_post: 7, media_dia_seguinte_com_post: 9, media_dia_seguinte_sem_post: 7 },
    temas: [tema("Menopausa", 6, 48, 14), tema("Canetas emagrecedoras", 0, 31, 6), tema("Tireoide", 5, 22, 5), tema("Sono", 4, 0, 0)],
    semanas: [0, 1, 2, 3].map((s) => ({ semana: isoDia(28 - s * 7), c0: 2, c1: 2 + s, c2: 1, c3: s % 2, conversas: 60 + s * 8, agendaram: 10 + s })),
    objecoes: [{ objecao: "preco", n: 22, agendaram: 4, pessoas: 20, pessoas_agendaram: 4 }, { objecao: "convenio", n: 12, agendaram: 2 }, { objecao: "agenda", n: 7, agendaram: 3 }],
    assuntos: [{ assunto: "Valor da consulta", n: 34, agendaram: 6 }, { assunto: "Atende convênio?", n: 19, agendaram: 3 }, { assunto: "Reposição hormonal", n: 15, agendaram: 5 }],
    cobertura: { conversas: 300, pessoas: 260, pessoas_agendaram: 52, lidas: 280, sem_texto: 12, com_tema: 210, posts: 30, posts_com_tema: 26 },
  };
}

export function comercialProfundoFicticio() {
  return {
    posts_compra: [
      { post_id: "p1", comentarios: 574, compra: 14, preco: 2, agendar: 6, onde: 0, convenio: 4, contato: 5, permalink: "https://instagram.com/p/ficticio", thumbnail_url: null, legenda: "Post fictício sobre menopausa", tema: "Menopausa", formato: "reels", posted_at: new Date(Date.now() - 6 * DIA).toISOString() },
      { post_id: "p2", comentarios: 210, compra: 9, preco: 4, agendar: 2, onde: 1, convenio: 1, contato: 1, permalink: null, thumbnail_url: null, legenda: "Carrossel fictício sobre tireoide", tema: "Tireoide", formato: "carrossel", posted_at: new Date(Date.now() - 12 * DIA).toISOString() },
    ],
    comentarios: { total: 2971, compra: 70, posts_com_compra: 32 },
    compra_por_formato: [{ formato: "reels", posts: 10, compra: 50, comentarios: 2000 }, { formato: "carrossel", posts: 8, compra: 20, comentarios: 971 }],
    temas_valor: [{ tema: "Catarata", conversas: 60, com_lead: 50, ganhos: 12, perdidos: 8, ganhos_com_valor: 12, receita: 60000 }, { tema: "Menopausa", conversas: 48, com_lead: 40, ganhos: 7, perdidos: 9, ganhos_com_valor: 6, receita: 21000 }],
    resposta: [{ faixa: "1_ate_15min", conversas: 400, agendaram: 40 }, { faixa: "2_15_a_60min", conversas: 120, agendaram: 9 }, { faixa: "3_1_a_4h", conversas: 100, agendaram: 4 }, { faixa: "5_sem_resposta", conversas: 50, agendaram: 1 }],
    resposta_tema: [],
    cobertura: { conversas: 900, com_lead: 800, com_tema: 300, horario_comercial: 550 },
  };
}

/** Liga o Supabase falso e a API de audiência com os dados fictícios. Chamar depois de mockAccount. */
export async function mockInstagram(context: BrowserContext) {
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => ({
      date: isoDia(i),
      client_id: CID,
      reach: 900 + Math.round(600 * Math.abs(Math.sin(i * 0.7))),
      new_followers: 8 + (i % 7),
      unfollowers: 3 + (i % 3),
      total_interactions: 60 + ((i * 13) % 50),
      likes: 40 + (i % 9),
      comments: 4 + (i % 3),
      saves: 20 + (i % 9),
      shares: 5 + (i % 4),
      profile_links_taps: 4,
      followers_count: 5000 - i * 9 + Math.round(8 * Math.sin(i)),
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  // O banco devolve os posts do ranking já ordenados por salvamentos.
  const posts = postsFicticios().sort((a, b) => b.saved - a.saved);
  await context.route("**/rest/v1/instagram_posts**", (r) => r.fulfill({ json: pagina(r.request().url(), posts) }));
  await context.route("**/rest/v1/instagram_stories**", (r) =>
    r.fulfill({
      json: pagina(
        r.request().url(),
        Array.from({ length: 6 }, (_, i) => ({ id: `st${i}`, client_id: CID, posted_at: new Date(Date.now() - (i + 1) * DIA).toISOString(), permalink: null, thumbnail_url: null, reach: 500 + i * 70, views: 700 + i * 90, total_interactions: 10 + i, replies: i, shares: 1 + (i % 3), profile_visits: 8 + i, follows: i % 3 })),
      ),
    }),
  );
  await context.route("**/api/sync/manual", (r) => r.fulfill({ json: { ok: true, dados: audienciaFicticia() } }));
  await context.route("**/rest/v1/rpc/conteudo_comercial", (r) => r.fulfill({ json: comercialFicticio() }));
  await context.route("**/rest/v1/rpc/conteudo_comercial_profundo", (r) => r.fulfill({ json: comercialProfundoFicticio() }));
}
