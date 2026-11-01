import type { ContentFormat } from "@/integrations/supabase/types";
import { formatLabel } from "@/lib/methodology";
import { analisarVozDoPaciente } from "@/lib/voz-do-paciente";
import { MIN_POSTS_CONCLUSAO } from "@/lib/metricas";
import { chaveTema } from "@/lib/classificacao-post";
import { LIMITES } from "./limites.js";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PERIODS = [
  { label: "Madrugada (0h–5h)", test: (h: number) => h < 6 },
  { label: "Manhã (6h–11h)", test: (h: number) => h >= 6 && h < 12 },
  { label: "Tarde (12h–17h)", test: (h: number) => h >= 12 && h < 18 },
  { label: "Noite (18h–23h)", test: (h: number) => h >= 18 },
];

export function fmtFormatKey(key: string) {
  return key === "não classificado" ? key : formatLabel(key as ContentFormat);
}

const BRAZIL_TZ = "America/Sao_Paulo";
const brazilTimeParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BRAZIL_TZ,
  weekday: "short",
  hour: "numeric",
  hour12: false,
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// posted_at vem em UTC do banco — bucketar por getUTCDay()/getUTCHours() direto
// dava horário errado pro público (Brasil é UTC-3), deslocando cada post em 3h
// no gráfico de "melhores horários". Sempre converter pro fuso de Brasília antes
// de extrair dia da semana/hora.
export function brazilWeekdayAndHour(iso: string): { weekday: number; hour: number } {
  const parts = brazilTimeParts.formatToParts(new Date(iso));
  const weekdayShort = parts.find((p) => p.type === "weekday")!.value;
  const hourRaw = Number(parts.find((p) => p.type === "hour")!.value);
  return { weekday: WEEKDAY_INDEX[weekdayShort], hour: hourRaw === 24 ? 0 : hourRaw };
}

// Mediana em vez de média em todo este arquivo — testado com dado real
// (reels da Lana Torres) e a média fica 6–10x distorcida por um punhado de
// posts virais, dando a impressão errada de que o post "típico" daquele
// formato/tema performa perto da média geral, quando na real a maioria fica
// bem abaixo. Mediana representa melhor o post típico.
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Taxa de interação do post: engajamento ÷ alcance. "Melhor formato" e "melhor horário" comparam a TAXA, não o
// engajamento absoluto: o absoluto mede alcance (impulsionamento), não a qualidade do conteúdo. Na Doctor Creator
// (out/2026) o estático aparecia "muito acima" com 2.219 de engajamento contra 149 do carrossel, mas o estático
// tinha 14x mais alcance; as taxas eram 4,6% e 4,3% (auditoria de 31/10/2026). Mesma régua no Resultado, no PDF e no
// texto do relatório (relatorio-envio.ts).
export function taxaDoPost(p: { engagement?: number | null; reach?: number | null }): number | null {
  const e = Number(p.engagement);
  const r = Number(p.reach);
  if (p.engagement == null || p.reach == null || !Number.isFinite(e) || !Number.isFinite(r) || r <= 0) return null;
  return e / r;
}

/** Diferença relativa abaixo disso entre melhor e pior formato = taxas parecidas (não há formato "mais forte"). */
export const EMPATE_TAXA = 0.15;

// Mesma lógica do componente InsightDeFormato, reutilizada na tela e no PDF.
// median = taxa mediana (0..1) dos posts do formato.
export function computeFormatInsight(posts: any[]) {
  const groups = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of posts) {
    const t = taxaDoPost(p);
    if (t == null) continue;
    const key = p.format ?? "não classificado";
    const entry = groups.get(key) ?? [];
    entry.push(t);
    groups.set(key, entry);
    all.push(t);
  }
  if (all.length === 0) return null;
  const overallMedian = median(all);
  // "Melhor" e "pior" só entre formatos com amostra mínima (MIN_POSTS_CONCLUSAO posts).
  const ranked = Array.from(groups.entries())
    .filter(([, v]) => v.length >= MIN_POSTS_CONCLUSAO)
    .map(([format, v]) => ({ format, median: median(v), count: v.length }))
    .sort((a, b) => b.median - a.median);
  if (ranked.length < 2) return null;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const bestPct = overallMedian > 0 ? ((best.median - overallMedian) / overallMedian) * 100 : 0;
  const worstPct = overallMedian > 0 ? ((worst.median - overallMedian) / overallMedian) * 100 : 0;
  const empate = best.median > 0 ? (best.median - worst.median) / best.median < EMPATE_TAXA : true;
  return { best, worst, bestPct, worstPct, overallMedian, empate };
}

/** Taxa (0..1) em % com uma casa: 0,0463 → "4,6%". */
export function fmtTaxaPct(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// Mesma lógica do componente MelhoresHorarios: taxa mediana de interação por dia e faixa de horário.
export function computeMelhoresHorarios(posts: any[]) {
  const buckets = new Map<string, { weekday: string; period: string; values: number[] }>();
  const all: number[] = [];
  for (const p of posts) {
    const t = taxaDoPost(p);
    if (!p.posted_at || t == null) continue;
    all.push(t);
    const { weekday: weekdayIdx, hour } = brazilWeekdayAndHour(p.posted_at);
    const weekday = WEEKDAYS[weekdayIdx];
    const period = PERIODS.find((per) => per.test(hour))?.label ?? "sem horário";
    const key = `${weekday}__${period}`;
    const entry = buckets.get(key) ?? { weekday, period, values: [] };
    entry.values.push(t);
    buckets.set(key, entry);
  }
  const overallMedian = median(all);
  const todos = Array.from(buckets.values()).map((b) => ({ weekday: b.weekday, period: b.period, count: b.values.length, median: median(b.values) }));
  // Ranking só entre horários com amostra mínima; os demais vão para "poucos dados", sem ordem de melhor.
  const ranked = todos.filter((b) => b.count >= MIN_POSTS_CONCLUSAO).sort((a, b) => b.median - a.median).slice(0, 5);
  const poucosDados = todos.filter((b) => b.count < MIN_POSTS_CONCLUSAO).sort((a, b) => b.count - a.count);
  return { ranked, overallMedian, poucosDados };
}

// Mesma lógica do componente EngajamentoPorFormato: taxa mediana por formato; abaixo da amostra mínima o formato
// sai marcado como amostra pequena (a tela não desenha barra para ele).
export function computeFormatBreakdown(posts: any[]) {
  const groups = new Map<string, { taxas: number[]; eng: number[]; n: number }>();
  for (const p of posts) {
    const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
    const entry = groups.get(key) ?? { taxas: [], eng: [], n: 0 };
    entry.n += 1;
    entry.eng.push(p.engagement ?? 0);
    const t = taxaDoPost(p);
    if (t != null) entry.taxas.push(t);
    groups.set(key, entry);
  }
  return Array.from(groups.entries()).map(([key, v]) => ({
    formato: fmtFormatKey(key),
    count: v.n,
    medianEngagement: Math.round(median(v.eng)),
    taxaMediana: v.taxas.length ? median(v.taxas) : null,
    amostraPequena: v.taxas.length < MIN_POSTS_CONCLUSAO,
  }));
}

export function computeTopPosts(posts: any[], limit = 5) {
  return [...posts]
    .filter((p) => p.saved != null)
    .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0))
    .slice(0, limit);
}

// Taxa (salvamentos ÷ alcance, ou compartilhamentos ÷ alcance) — normaliza
// por quem viu o post, diferente do ranking por número bruto de salvamentos.
function computeTopByRate(posts: any[], numeratorKey: "saved" | "shares", limit: number) {
  return posts
    .filter((p) => p[numeratorKey] != null && p.reach != null && p.reach > 0)
    .map((p) => ({ post: p, rate: p[numeratorKey] / p.reach }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);
}

export function computeTopPostsPorTaxaDeSalvamento(posts: any[], limit = 5) {
  return computeTopByRate(posts, "saved", limit);
}

// Compartilhamentos ÷ alcance em todos os formatos: a Meta preenche shares também em carrossel e post estático
// (Doctor Creator, out/2026: 35 mil compartilhamentos em estáticos, que ficavam fora quando só reels entrava).
export function computeTopPorTaxaDeCompartilhamento(posts: any[], limit = 5) {
  return computeTopByRate(posts, "shares", limit);
}

/** Só reels: mantido para os relatórios em PDF, que têm o título "Reels com maior taxa de compartilhamento". */
export function computeTopReelsPorTaxaDeCompartilhamento(posts: any[], limit = 5) {
  return computeTopByRate(posts.filter((p) => p.format === "reels"), "shares", limit);
}

// Amostra mínima para comparar grupos (tema, formato, tema × formato): com menos de MIN_POSTS_CONCLUSAO
// posts o grupo não entra no ranking; aparece à parte como "poucos dados", sem conclusão.
export function separarAmostra<T extends { count: number }>(grupos: T[]): { conclusivos: T[]; poucos: T[] } {
  return {
    conclusivos: grupos.filter((g) => g.count >= MIN_POSTS_CONCLUSAO),
    poucos: grupos.filter((g) => g.count < MIN_POSTS_CONCLUSAO).sort((a, b) => b.count - a.count),
  };
}

// Alcance (mediana) agrupado só por tema (ignora formato) — base de
// comparação pra decidir se um tema vale ser repetido, independente de
// picos isolados.
export function computeReachByTema(posts: any[]) {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    if (!p.tema || p.reach == null) continue;
    const entry = groups.get(p.tema) ?? [];
    entry.push(p.reach);
    groups.set(p.tema, entry);
  }
  return Array.from(groups.entries())
    .map(([tema, v]) => ({ tema, count: v.length, medianReach: Math.round(median(v)) }))
    .sort((a, b) => b.medianReach - a.medianReach);
}

// Alcance (mediana) agrupado só por formato.
export function computeReachByFormat(posts: any[]) {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
    if (p.reach == null) continue;
    const entry = groups.get(key) ?? [];
    entry.push(p.reach);
    groups.set(key, entry);
  }
  return Array.from(groups.entries())
    .map(([key, v]) => ({ formato: fmtFormatKey(key), count: v.length, medianReach: Math.round(median(v)) }))
    .sort((a, b) => b.medianReach - a.medianReach);
}

// Mesma lógica do componente RepetirOuRevisar — por tema, mediana da taxa de
// engajamento por post (engajamento ÷ alcance de cada post, não soma÷soma —
// um post viral isolado não deve carregar o tema inteiro), mínimo de posts
// pra entrar na conta. A linha de base é a mediana de TODOS os posts do período
// (não a dos temas que passaram: com um tema só, ele era comparado com ele mesmo),
// e só conclui com pelo menos MIN_TEMAS_REPETIR temas com amostra.
export const MIN_TEMAS_REPETIR: number = LIMITES.amostra.conteudo.temasRepetir;
export function computeRepetirOuRevisar(posts: any[], minPosts = MIN_POSTS_CONCLUSAO) {
  const groups = new Map<string, { tema: string; rates: number[] }>();
  const todas: number[] = [];
  for (const p of posts) {
    if (p.engagement == null || p.reach == null || p.reach <= 0) continue;
    todas.push(p.engagement / p.reach);
    const k = chaveTema(p.tema);
    if (!k) continue;
    const entry = groups.get(k) ?? { tema: String(p.tema).trim(), rates: [] as number[] };
    entry.rates.push(p.engagement / p.reach);
    groups.set(k, entry);
  }
  const qualifying = Array.from(groups.values())
    .filter((g) => g.rates.length >= minPosts)
    .map((g) => ({ tema: g.tema, count: g.rates.length, rate: median(g.rates) }));
  const baseline = median(todas);
  if (qualifying.length < MIN_TEMAS_REPETIR) return { repetir: [], revisar: [], hasEnough: false, baseline, temasComAmostra: qualifying.length, totalPosts: todas.length };
  return {
    repetir: qualifying.filter((g) => g.rate >= baseline).sort((a, b) => b.rate - a.rate),
    revisar: qualifying.filter((g) => g.rate < baseline).sort((a, b) => a.rate - b.rate),
    hasEnough: true,
    baseline,
    temasComAmostra: qualifying.length,
    totalPosts: todas.length,
  };
}

// "Próximos ângulos": temas cujo post típico (mediana de salvamentos) fica acima do post típico da conta no
// período escolhido. Mediana e mínimo de posts para um post viral não decidir sozinho (a RPC antiga usava média
// com 2 posts e janela fixa de 90 dias: "Suplementos" com 228 de média eram um post com 1 e outro com 455).
export const MIN_POSTS_ANGULO: number = LIMITES.amostra.conteudo.postsAngulo;
export interface AnguloSugerido { tema: string; count: number; medianSaved: number; baseline: number; formato: string | null; formatoCount: number }
export function computeProximosAngulos(posts: any[], limit = 4, minPosts = MIN_POSTS_ANGULO): { angulos: AnguloSugerido[]; baseline: number; temasComAmostra: number } {
  const groups = new Map<string, { tema: string; saved: number[]; formatos: Map<string, number[]> }>();
  const todos: number[] = [];
  for (const p of posts) {
    if (p.saved == null) continue;
    todos.push(Number(p.saved));
    const k = chaveTema(p.tema);
    if (!k) continue;
    const g = groups.get(k) ?? { tema: String(p.tema).trim(), saved: [] as number[], formatos: new Map<string, number[]>() };
    g.saved.push(Number(p.saved));
    if (p.format) g.formatos.set(p.format, [...(g.formatos.get(p.format) ?? []), Number(p.saved)]);
    groups.set(k, g);
  }
  const baseline = median(todos);
  const comAmostra = [...groups.values()].filter((g) => g.saved.length >= minPosts);
  const angulos = comAmostra
    .map((g) => {
      const fmt = [...g.formatos.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => median(b[1]) - median(a[1]) || b[1].length - a[1].length)[0];
      return { tema: g.tema, count: g.saved.length, medianSaved: median(g.saved), baseline, formato: fmt?.[0] ?? null, formatoCount: fmt?.[1].length ?? 0 };
    })
    .filter((a) => a.medianSaved > baseline)
    .sort((a, b) => b.medianSaved - a.medianSaved || b.count - a.count)
    .slice(0, limit);
  return { angulos, baseline, temasComAmostra: comAmostra.length };
}

// Alcance/engajamento de tema dentro de cada formato — mesma lógica do
// componente FormatoPorTema, mediana em vez de média.
export function computeFormatoPorTema(posts: any[]) {
  const groups = new Map<string, { tema: string; formato: ContentFormat; reach: number[]; rates: number[] }>();
  for (const p of posts) {
    if (!p.tema || !p.format) continue;
    const key = `${p.tema}__${p.format}`;
    const entry = groups.get(key) ?? { tema: p.tema, formato: p.format, reach: [] as number[], rates: [] as number[] };
    if (p.reach != null) {
      entry.reach.push(p.reach);
      if (p.engagement != null && p.reach > 0) entry.rates.push(p.engagement / p.reach);
    }
    groups.set(key, entry);
  }
  return Array.from(groups.values())
    .map((g) => ({
      tema: g.tema,
      formato: g.formato,
      count: g.reach.length,
      medianReach: Math.round(median(g.reach)),
      medianEngRate: median(g.rates) * 100,
    }))
    .sort((a, b) => b.medianReach - a.medianReach);
}

// Mediana de salvamentos por tema/formato — mesma lógica do componente
// ConversionByTag.
export function computeConversionByTag(posts: any[]) {
  const groups = new Map<string, { tema: string; format: string; saved: number[] }>();
  for (const p of posts) {
    if (!p.tema) continue;
    const key = `${p.tema}__${p.format ?? "—"}`;
    const entry = groups.get(key) ?? { tema: p.tema, format: formatLabel(p.format), saved: [] as number[] };
    entry.saved.push(p.saved ?? 0);
    groups.set(key, entry);
  }
  return Array.from(groups.values())
    .map((g) => ({ tema: g.tema, format: g.format, count: g.saved.length, medianSaved: median(g.saved) }))
    .sort((a, b) => b.medianSaved - a.medianSaved);
}

// Um post representante por tema (o de maior taxa de salvamento daquele
// tema), ranqueados — "conceitos que já provaram funcionar", cada um com o
// post real que embasa. Não gera variação nenhuma: é o dado, ponto final;
// a produção de variações de ângulo continua fora do dashboard.
export function computeConceitosVencedores(posts: any[], limit = 7) {
  const bestByTema = new Map<string, { post: any; rate: number }>();
  for (const p of posts) {
    if (!p.tema || p.saved == null || p.reach == null || p.reach <= 0) continue;
    const rate = p.saved / p.reach;
    const current = bestByTema.get(p.tema);
    if (!current || rate > current.rate) bestByTema.set(p.tema, { post: p, rate });
  }
  return Array.from(bestByTema.entries())
    .map(([tema, v]) => ({ tema, post: v.post, rate: v.rate }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);
}

// DETECÇÃO ORIGINAL (477eb43), restaurada sem mudança: é o agrupamento que a tela Dúvidas e a regra
// "pergunta repetida" das Ideias usavam. "count" = comentários (a mesma pessoa pode contar 2 vezes).
// A versão com a triagem nova (conta pessoas) está logo abaixo, em computeDuvidasFrequentesTriagem.
//
// Agrupa comentários-pergunta parecidos (mesmo assunto, fraseado diferente)
// por sobreposição de palavras-chave — sem IA, só interseção de conjuntos.
// Transforma uma lista crua de comentários num ranking real de "dúvidas mais
// repetidas", rastreável até os comentários originais que compõem cada grupo.
const DUVIDAS_STOPWORDS = new Set([
  "para",
  "como",
  "esse",
  "essa",
  "isso",
  "aquele",
  "aquela",
  "muito",
  "muita",
  "sobre",
  "onde",
  "quando",
  "quanto",
  "quanta",
  "quais",
  "qual",
  "quem",
  "porque",
  "tem",
  "tenho",
  "pode",
  "posso",
  "poderia",
  "gostaria",
  "queria",
  "ainda",
  "voce",
  "vc",
  "você",
  "estou",
  "estar",
  "fazer",
  "faz",
  "vai",
  "algum",
  "alguma",
  "outro",
  "outra",
]);

function duvidaNormalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function significantWords(text: string): Set<string> {
  const words = duvidaNormalize(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !DUVIDAS_STOPWORDS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function computeDuvidasFrequentes<T extends { id: string; text: string; like_count: number | null }>(
  questions: T[],
  { threshold = 0.4, minSize = 2 } = {},
) {
  const clusters: { words: Set<string>; items: T[] }[] = [];
  for (const q of questions) {
    const words = significantWords(q.text);
    if (words.size === 0) continue;
    let best: { cluster: (typeof clusters)[number]; sim: number } | null = null;
    for (const c of clusters) {
      const sim = jaccard(words, c.words);
      if (sim >= threshold && (!best || sim > best.sim)) best = { cluster: c, sim };
    }
    // Compara sempre contra as palavras do primeiro item do grupo (não cresce
    // o conjunto a cada novo membro) — evita "arrastar" o grupo pra um
    // assunto diferente conforme mais comentários entram.
    if (best) {
      best.cluster.items.push(q);
    } else {
      clusters.push({ words, items: [q] });
    }
  }
  return clusters
    .filter((c) => c.items.length >= minSize)
    .map((c) => ({
      count: c.items.length,
      representative: [...c.items].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))[0],
      items: c.items,
    }))
    .sort((a, b) => b.count - a.count);
}

// TRIAGEM NOVA: ranking das "dúvidas mais repetidas" contando pessoas (antes era computeDuvidasFrequentes).
// Antes de agrupar, passa pela triagem da voz do paciente (lib/voz-do-paciente.ts): sai spam, piada,
// desabafo, conversa entre seguidores, só @, resposta do perfil e de outros profissionais, e a mesma
// pessoa repetindo. "count" é o número de pessoas diferentes; pedidos de dose/remédio ficam de fora
// (não são dúvida para virar conteúdo). Rastreável até os comentários originais de cada grupo.
export function computeDuvidasFrequentesTriagem<T extends { id: string; text: string; like_count: number | null; author_username?: string | null; instagram_post_id?: string | null }>(
  questions: T[],
  { threshold = 0.34, minSize = 2, donos = [] as string[] } = {},
) {
  const r = analisarVozDoPaciente(questions, { donos, minPessoas: minSize, limiarSimilaridade: threshold });
  return r.grupos.map((g) => ({
    count: g.pessoas,
    rotulo: g.rotulo,
    representative: [...g.itens].sort((a, b) => (b.comentario.like_count ?? 0) - (a.comentario.like_count ?? 0))[0].comentario,
    items: g.itens.map((i) => i.comentario),
  }));
}

// O post de maior e o de menor alcance no período — pra virar caso
// destacado no relatório, com link e legenda reais (nunca inventados).
export function computeCasosDestacados(posts: any[]) {
  const withReach = posts.filter((p) => p.reach != null && p.reach > 0);
  if (withReach.length < 2) return null;
  const sorted = [...withReach].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
  return { melhor: sorted[0], pior: sorted[sorted.length - 1] };
}

// Sintetiza o achado mais forte do período (formato ou horário, o que tiver
// maior desvio da mediana) numa única frase — a mesma lógica que o exemplo
// de referência chamava de "a frase que resume a semana".
export function computeHeadline(posts: any[]) {
  const formatInsight = computeFormatInsight(posts);
  const { ranked: horarios, overallMedian: horaMedian } = computeMelhoresHorarios(posts);
  const top = horarios[0];
  const horaPct = top && horaMedian > 0 ? ((top.median - horaMedian) / horaMedian) * 100 : 0;

  const candidates: { pct: number; text: string }[] = [];
  if (formatInsight) {
    candidates.push({
      pct: Math.abs(formatInsight.bestPct),
      text: `${fmtFormatKey(formatInsight.best.format)} é o formato que mais engaja nesta conta — ${formatInsight.bestPct.toFixed(0)}% acima da mediana, com ${formatInsight.best.count} posts no período.`,
    });
  }
  if (top) {
    candidates.push({
      pct: Math.abs(horaPct),
      text: `${top.weekday} à(o) ${top.period.toLowerCase()} é a janela de maior engajamento — ${horaPct >= 0 ? "+" : ""}${horaPct.toFixed(0)}% acima da mediana, em ${top.count} posts.`,
    });
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.pct - a.pct)[0].text;
}

// Retenção de reels.
//
// O time pediu "hook rate, body rate e hold rate". Das três, só o hook rate
// é derivável de dado real hoje:
//
//   hook rate = (1 - skip rate) × 100, onde skip rate é a fração de views
//   que abandonou o reel nos 3 primeiros segundos (métrica da Meta, via
//   Windsor). Atenção: a Windsor devolve FRAÇÃO (0.515 = 51,5%), apesar de
//   declarar o campo como PERCENT — conferido contra a conta do Douglas.
//
// Body rate e hold rate no sentido estrito (quanto do vídeo a pessoa
// assistiu) exigem a DURAÇÃO do vídeo, e nem a Windsor nem a Graph API
// entregam esse campo. O tempo médio assistido sozinho não vira taxa — um
// reel de 15s e um de 90s com o mesmo tempo médio têm retenção
// completamente diferente. Então o tempo médio é mostrado como segundos
// absolutos, e não como percentual inventado.
export function computeRetencaoDeReels(posts: any[], limit = 10) {
  const reels = posts.filter((p) => p.format === "reels" && p.reel_skip_rate != null);

  const ranked = reels
    .map((p) => ({
      post: p,
      hookRate: (1 - Number(p.reel_skip_rate)) * 100,
      avgWatchSeconds: p.reel_avg_watch_time_ms != null ? Number(p.reel_avg_watch_time_ms) / 1000 : null,
    }))
    .sort((a, b) => b.hookRate - a.hookRate);

  // Média PONDERADA por views: é a que se compara com o número agregado do Instagram. A mediana (por reel) fica ao lado
  // porque um reel viral não deve decidir sozinho; as duas diferem quando os reels têm views muito desiguais.
  const ponderada = (valor: (r: (typeof ranked)[number]) => number | null) => {
    let soma = 0;
    let pesos = 0;
    for (const r of ranked) {
      const v = valor(r);
      const w = Number(r.post.views ?? 0);
      if (v == null || !(w > 0)) continue;
      soma += v * w;
      pesos += w;
    }
    return pesos > 0 ? soma / pesos : null;
  };
  const hookRates = ranked.map((r) => r.hookRate);
  const watchSeconds = ranked.map((r) => r.avgWatchSeconds).filter((v): v is number => v != null);

  return {
    // Quantos reels do período têm o dado. Quando é 0, a tela diz por quê em
    // vez de mostrar um gráfico vazio.
    withData: reels.length,
    totalReels: posts.filter((p) => p.format === "reels").length,
    medianHookRate: hookRates.length > 0 ? median(hookRates) : null,
    medianWatchSeconds: watchSeconds.length > 0 ? median(watchSeconds) : null,
    weightedHookRate: ponderada((r) => r.hookRate),
    weightedWatchSeconds: ponderada((r) => r.avgWatchSeconds),
    melhores: ranked.slice(0, limit),
    piores: ranked.slice(-limit).reverse(),
  };
}
