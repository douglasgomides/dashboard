/**
 * Audiência do Instagram direto da Meta Graph API, sob demanda (nada é gravado).
 *
 * Cobre as telas Audiência e Top Stories: demografia dos seguidores (faixa etária, gênero, cidade, país),
 * quem a conta alcançou e quem engajou no mês, alcance de seguidores x não seguidores, origem das
 * visualizações por tipo de conteúdo, interações, quem seguiu e deixou de seguir, melhores horários
 * (seguidores online por hora) e os stories no ar agora.
 *
 * Cada bloco é independente: se a Meta recusar um, o bloco volta com `erro` e os outros seguem.
 * Os limites vêm da própria Meta: demografia exige 100+ seguidores, e o intervalo máximo das métricas por
 * período é 30 dias.
 */
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}`;
const DIA = 86400;

export type Par = { chave: string; valor: number };
export type Bloco<T> = { ok: true; dados: T } | { ok: false; erro: string };

export interface StoryAoVivo {
  id: string;
  postado_em: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  alcance: number | null;
  views: number | null;
  respostas: number | null;
  compartilhamentos: number | null;
  interacoes: number | null;
  visitas_ao_perfil: number | null;
  novos_seguidores: number | null;
}

export interface Audiencia {
  gerado_em: string;
  periodo: { dias: number; de: string; ate: string };
  seguidores: Bloco<{ faixa_etaria: Par[]; genero: Par[]; cidades: Par[]; paises: Par[] }>;
  alcancados_no_mes: Bloco<{ faixa_etaria: Par[]; genero: Par[]; cidades: Par[]; mes: string }>;
  engajados_no_mes: Bloco<{ faixa_etaria: Par[]; genero: Par[]; mes: string }>;
  alcance_por_tipo_de_seguidor: Bloco<{ total: number; seguidores: number; nao_seguidores: number }>;
  visualizacoes_por_tipo_de_seguidor: Bloco<{ total: number; seguidores: number; nao_seguidores: number }>;
  origem: Bloco<{ conteudo: string; alcance: number; visualizacoes: number; interacoes: number }[]>;
  interacoes: Bloco<{ curtidas: number; comentarios: number; salvamentos: number; compartilhamentos: number }>;
  seguiram_e_deixaram: Bloco<{ seguiram: number; deixaram_de_seguir: number; saldo: number }>;
  horarios: Bloco<{ dias: number; fuso: string; mapa: number[][] }>;
  stories_ao_vivo: Bloco<StoryAoVivo[]>;
}

export async function g(token: string, path: string, q: Record<string, string | number> = {}): Promise<any> {
  const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])), access_token: token });
  const r = await fetch(`${GRAPH}/${path}?${params.toString()}`, { signal: AbortSignal.timeout(25000) });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = corpo?.error?.message ?? `Meta respondeu ${r.status}`;
    throw new Error(String(msg).slice(0, 220));
  }
  return corpo;
}

async function bloco<T>(fn: () => Promise<T>): Promise<Bloco<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// total_value com breakdown -> lista de pares chave/valor.
function pares(corpo: any): Par[] {
  const res = corpo?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return res
    .map((r: any) => ({ chave: String(r.dimension_values?.[0] ?? "?"), valor: Number(r.value ?? 0) }))
    .filter((p: Par) => Number.isFinite(p.valor));
}

const total = (corpo: any): number => Number(corpo?.data?.[0]?.total_value?.value ?? 0);

async function demografia(token: string, ig: string, metrica: string, breakdown: string, extra: Record<string, string> = {}): Promise<Par[]> {
  const c = await g(token, `${ig}/insights`, { metric: metrica, period: "lifetime", metric_type: "total_value", breakdown, ...extra });
  return pares(c).sort((a, b) => b.valor - a.valor);
}

const FAIXAS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const ordenarFaixas = (p: Par[]) => [...p].sort((a, b) => FAIXAS.indexOf(a.chave) - FAIXAS.indexOf(b.chave));

// Demografia de quem foi alcançado/engajou: a Meta só aceita `this_month` e `prev_month`. No começo do mês
// o mês corrente vem vazio ou ralo, então cai para o mês anterior.
async function demografiaDoMes(token: string, ig: string, metrica: string, breakdown: string): Promise<{ pares: Par[]; mes: string }> {
  for (const mes of ["this_month", "prev_month"]) {
    try {
      const p = await demografia(token, ig, metrica, breakdown, { timeframe: mes });
      if (p.reduce((a, x) => a + x.valor, 0) >= 50) return { pares: p, mes: mes === "this_month" ? "mês atual" : "mês anterior" };
    } catch (e) {
      if (mes === "prev_month") throw e;
    }
  }
  return { pares: [], mes: "sem dado suficiente" };
}

// Os horários chegam no fuso da Califórnia (conferido: o pico de seguidores brasileiros cai na chave 16, que é
// 20h em Brasília). Converte cada (dia, hora) pelo instante UTC real e agrega para Brasília (UTC-3) em
// [dia da semana 0=domingo][hora] = média de seguidores online.
function mapaDeHorarios(valores: { end_time: string; value: Record<string, number> }[]): number[][] {
  const soma = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const cont = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const v of valores) {
    // end_time = fim do dia na Califórnia; o dia dos números é o anterior.
    const fim = Date.parse(v.end_time);
    const inicioDiaLA = fim - DIA * 1000;
    for (const [h, qtd] of Object.entries(v.value ?? {})) {
      const hora = Number(h);
      if (!Number.isInteger(hora) || hora < 0 || hora > 23) continue;
      const instanteUtc = inicioDiaLA + hora * 3600_000;
      const brasilia = new Date(instanteUtc - 3 * 3600_000);
      const dow = brasilia.getUTCDay();
      const hb = brasilia.getUTCHours();
      soma[dow][hb] += Number(qtd);
      cont[dow][hb] += 1;
    }
  }
  return soma.map((linha, d) => linha.map((s, h) => (cont[d][h] ? Math.round(s / cont[d][h]) : 0)));
}

export async function storiesAoVivo(token: string, ig: string): Promise<StoryAoVivo[]> {
  const lista = await g(token, `${ig}/stories`, { fields: "id,media_type,timestamp,permalink,thumbnail_url,media_url", limit: 50 });
  const itens: any[] = (lista?.data ?? []).slice(0, 25);
  const saida: StoryAoVivo[] = [];
  for (let i = 0; i < itens.length; i += 5) {
    const lote = itens.slice(i, i + 5);
    const lidos = await Promise.all(
      lote.map(async (s) => {
        let m: Record<string, number> = {};
        try {
          const ins = await g(token, `${s.id}/insights`, { metric: "reach,replies,shares,total_interactions,profile_visits,follows,views" });
          for (const d of ins?.data ?? []) m[d.name] = Number(d.values?.[0]?.value ?? 0);
        } catch {
          m = {};
        }
        return {
          id: String(s.id),
          postado_em: s.timestamp ?? null,
          permalink: s.permalink ?? null,
          thumbnail_url: s.thumbnail_url ?? s.media_url ?? null,
          media_type: s.media_type ?? null,
          alcance: m.reach ?? null,
          views: m.views ?? null,
          respostas: m.replies ?? null,
          compartilhamentos: m.shares ?? null,
          interacoes: m.total_interactions ?? null,
          visitas_ao_perfil: m.profile_visits ?? null,
          novos_seguidores: m.follows ?? null,
        } as StoryAoVivo;
      }),
    );
    saida.push(...lidos);
  }
  return saida;
}

export async function lerAudiencia(opts: { igId: string; token: string; dias?: number }): Promise<Audiencia> {
  const { igId, token } = opts;
  const dias = Math.min(30, Math.max(7, opts.dias ?? 28));
  const agora = Math.floor(Date.now() / 1000);
  const desde = agora - dias * DIA;
  const periodo = { since: desde, until: agora };
  const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

  const porTipo = async (metrica: string, breakdown: string) => pares(await g(token, `${igId}/insights`, { metric: metrica, period: "day", metric_type: "total_value", breakdown, ...periodo }));
  const tipoDeSeguidor = async (metrica: string) => {
    const p = await porTipo(metrica, "follow_type");
    const f = p.find((x) => x.chave === "FOLLOWER")?.valor ?? 0;
    const n = p.find((x) => x.chave === "NON_FOLLOWER")?.valor ?? 0;
    return { total: f + n + (p.find((x) => x.chave === "UNKNOWN")?.valor ?? 0), seguidores: f, nao_seguidores: n };
  };

  const [seg, alc, eng, alcSeg, visSeg, origem, inter, saldo, hor, stories] = await Promise.all([
    bloco(async () => {
      const [idade, genero, cidades, paises] = await Promise.all([
        demografia(token, igId, "follower_demographics", "age"),
        demografia(token, igId, "follower_demographics", "gender"),
        demografia(token, igId, "follower_demographics", "city"),
        demografia(token, igId, "follower_demographics", "country"),
      ]);
      return { faixa_etaria: ordenarFaixas(idade), genero, cidades: cidades.slice(0, 15), paises: paises.slice(0, 10) };
    }),
    bloco(async () => {
      const [idade, genero, cidades] = await Promise.all([
        demografiaDoMes(token, igId, "reached_audience_demographics", "age"),
        demografiaDoMes(token, igId, "reached_audience_demographics", "gender"),
        demografiaDoMes(token, igId, "reached_audience_demographics", "city"),
      ]);
      return { faixa_etaria: ordenarFaixas(idade.pares), genero: genero.pares, cidades: cidades.pares.slice(0, 15), mes: idade.mes };
    }),
    bloco(async () => {
      const [idade, genero] = await Promise.all([
        demografiaDoMes(token, igId, "engaged_audience_demographics", "age"),
        demografiaDoMes(token, igId, "engaged_audience_demographics", "gender"),
      ]);
      return { faixa_etaria: ordenarFaixas(idade.pares), genero: genero.pares, mes: idade.mes };
    }),
    bloco(() => tipoDeSeguidor("reach")),
    bloco(() => tipoDeSeguidor("views")),
    bloco(async () => {
      const [a, v, i] = await Promise.all([porTipo("reach", "media_product_type"), porTipo("views", "media_product_type"), porTipo("total_interactions", "media_product_type")]);
      // A Meta separa POST e CAROUSEL_CONTAINER em alcance e visualizações, mas junta as interações dos dois em POST.
      // Comparar por tipo daria "1.627% de interações por alcance" no post de imagem. Por isso os dois viram "Feed".
      const unir = (k: string) => (k === "POST" || k === "CAROUSEL_CONTAINER" ? "FEED" : k);
      const agrupar = (p: Par[]) => {
        const m = new Map<string, number>();
        for (const x of p) m.set(unir(x.chave), (m.get(unir(x.chave)) ?? 0) + x.valor);
        return m;
      };
      const [ma, mv, mi] = [agrupar(a), agrupar(v), agrupar(i)];
      const chaves = new Set([...ma.keys(), ...mv.keys(), ...mi.keys()]);
      const rotulo: Record<string, string> = { FEED: "Feed (posts e carrosséis)", REEL: "Reels", STORY: "Stories", AD: "Anúncios", IGTV: "Vídeo longo", LIVE: "Ao vivo" };
      return [...chaves]
        .map((k) => ({
          conteudo: rotulo[k] ?? k,
          alcance: ma.get(k) ?? 0,
          visualizacoes: mv.get(k) ?? 0,
          interacoes: mi.get(k) ?? 0,
        }))
        .sort((x, y) => y.visualizacoes - x.visualizacoes);
    }),
    bloco(async () => {
      const c = await g(token, `${igId}/insights`, { metric: "likes,comments,saves,shares", period: "day", metric_type: "total_value", ...periodo });
      const v = (n: string) => Number((c?.data ?? []).find((d: any) => d.name === n)?.total_value?.value ?? 0);
      return { curtidas: v("likes"), comentarios: v("comments"), salvamentos: v("saves"), compartilhamentos: v("shares") };
    }),
    bloco(async () => {
      const p = await porTipo("follows_and_unfollows", "follow_type");
      const seguiram = p.find((x) => x.chave === "FOLLOWER")?.valor ?? 0;
      const deixaram = p.find((x) => x.chave === "NON_FOLLOWER")?.valor ?? 0;
      return { seguiram, deixaram_de_seguir: deixaram, saldo: seguiram - deixaram };
    }),
    bloco(async () => {
      const c = await g(token, `${igId}/insights`, { metric: "online_followers", period: "lifetime", since: agora - 14 * DIA, until: agora });
      const valores = c?.data?.[0]?.values ?? [];
      if (!valores.length) throw new Error("A Meta não devolveu horários de seguidores online (a conta precisa de 100 seguidores ou mais).");
      return { dias: valores.length, fuso: "Brasília", mapa: mapaDeHorarios(valores) };
    }),
    bloco(() => storiesAoVivo(token, igId)),
  ]);

  return {
    gerado_em: new Date().toISOString(),
    periodo: { dias, de: iso(desde), ate: iso(agora) },
    seguidores: seg,
    alcancados_no_mes: alc,
    engajados_no_mes: eng,
    alcance_por_tipo_de_seguidor: alcSeg,
    visualizacoes_por_tipo_de_seguidor: visSeg,
    origem,
    interacoes: inter,
    seguiram_e_deixaram: saldo,
    horarios: hor,
    stories_ao_vivo: stories,
  };
}
