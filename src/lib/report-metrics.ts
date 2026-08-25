import type { ContentFormat } from "@/integrations/supabase/types";
import { formatLabel } from "@/lib/methodology";

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

// Mesma lógica do componente InsightDeFormato — extraída pra ser reutilizada
// tanto na tela quanto no relatório em PDF, sem duplicar o cálculo.
export function computeFormatInsight(posts: any[]) {
  const groups = new Map<string, number[]>();
  const allEng: number[] = [];
  for (const p of posts) {
    if (p.engagement == null) continue;
    const key = p.format ?? "não classificado";
    const entry = groups.get(key) ?? [];
    entry.push(p.engagement);
    groups.set(key, entry);
    allEng.push(p.engagement);
  }
  if (allEng.length === 0) return null;
  const overallMedian = median(allEng);
  const ranked = Array.from(groups.entries())
    .filter(([, v]) => v.length >= 3)
    .map(([format, v]) => ({ format, median: median(v), count: v.length }))
    .sort((a, b) => b.median - a.median);
  if (ranked.length < 2) return null;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const bestPct = overallMedian > 0 ? ((best.median - overallMedian) / overallMedian) * 100 : 0;
  const worstPct = overallMedian > 0 ? ((worst.median - overallMedian) / overallMedian) * 100 : 0;
  return { best, worst, bestPct, worstPct };
}

// Mesma lógica do componente MelhoresHorarios.
export function computeMelhoresHorarios(posts: any[]) {
  const buckets = new Map<string, { weekday: string; period: string; values: number[] }>();
  const allEng: number[] = [];
  for (const p of posts) {
    if (!p.posted_at || p.engagement == null) continue;
    allEng.push(p.engagement);
    const d = new Date(p.posted_at);
    const weekday = WEEKDAYS[d.getUTCDay()];
    const period = PERIODS.find((per) => per.test(d.getUTCHours()))?.label ?? "—";
    const key = `${weekday}__${period}`;
    const entry = buckets.get(key) ?? { weekday, period, values: [] };
    entry.values.push(p.engagement);
    buckets.set(key, entry);
  }
  const overallMedian = median(allEng);
  const ranked = Array.from(buckets.values())
    .filter((b) => b.values.length >= 2)
    .map((b) => ({ weekday: b.weekday, period: b.period, count: b.values.length, median: median(b.values) }))
    .sort((a, b) => b.median - a.median)
    .slice(0, 5);
  return { ranked, overallMedian };
}

// Mesma lógica do componente EngajamentoPorFormato.
export function computeFormatBreakdown(posts: any[]) {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
    const entry = groups.get(key) ?? [];
    entry.push(p.engagement ?? 0);
    groups.set(key, entry);
  }
  return Array.from(groups.entries()).map(([key, v]) => ({
    formato: fmtFormatKey(key),
    count: v.length,
    medianEngagement: Math.round(median(v)),
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

export function computeTopReelsPorTaxaDeCompartilhamento(posts: any[], limit = 5) {
  return computeTopByRate(
    posts.filter((p) => p.format === "reels"),
    "shares",
    limit,
  );
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
// pra entrar na conta.
export function computeRepetirOuRevisar(posts: any[], minPosts = 10) {
  const groups = new Map<string, { tema: string; rates: number[] }>();
  for (const p of posts) {
    if (!p.tema || p.engagement == null || p.reach == null || p.reach <= 0) continue;
    const entry = groups.get(p.tema) ?? { tema: p.tema, rates: [] as number[] };
    entry.rates.push(p.engagement / p.reach);
    groups.set(p.tema, entry);
  }
  const qualifying = Array.from(groups.values())
    .filter((g) => g.rates.length >= minPosts)
    .map((g) => ({ tema: g.tema, count: g.rates.length, rate: median(g.rates) }));
  if (qualifying.length === 0) return { repetir: [], revisar: [], hasEnough: false };
  const baseline = median(qualifying.map((g) => g.rate));
  return {
    repetir: qualifying.filter((g) => g.rate >= baseline).sort((a, b) => b.rate - a.rate),
    revisar: qualifying.filter((g) => g.rate < baseline).sort((a, b) => a.rate - b.rate),
    hasEnough: true,
  };
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
