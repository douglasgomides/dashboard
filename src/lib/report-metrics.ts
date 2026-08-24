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

// Mesma lógica do componente InsightDeFormato — extraída pra ser reutilizada
// tanto na tela quanto no relatório em PDF, sem duplicar o cálculo.
export function computeFormatInsight(posts: any[]) {
  const groups = new Map<string, { total: number; count: number }>();
  let totalEng = 0;
  let totalCount = 0;
  for (const p of posts) {
    if (p.engagement == null) continue;
    const key = p.format ?? "não classificado";
    const entry = groups.get(key) ?? { total: 0, count: 0 };
    entry.total += p.engagement;
    entry.count += 1;
    groups.set(key, entry);
    totalEng += p.engagement;
    totalCount += 1;
  }
  if (totalCount === 0) return null;
  const overallAvg = totalEng / totalCount;
  const ranked = Array.from(groups.entries())
    .filter(([, v]) => v.count >= 3)
    .map(([format, v]) => ({ format, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => b.avg - a.avg);
  if (ranked.length < 2) return null;
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const bestPct = overallAvg > 0 ? ((best.avg - overallAvg) / overallAvg) * 100 : 0;
  const worstPct = overallAvg > 0 ? ((worst.avg - overallAvg) / overallAvg) * 100 : 0;
  return { best, worst, bestPct, worstPct };
}

// Mesma lógica do componente MelhoresHorarios.
export function computeMelhoresHorarios(posts: any[]) {
  const buckets = new Map<string, { weekday: string; period: string; total: number; count: number }>();
  let totalEng = 0;
  let totalCount = 0;
  for (const p of posts) {
    if (!p.posted_at || p.engagement == null) continue;
    totalEng += p.engagement;
    totalCount += 1;
    const d = new Date(p.posted_at);
    const weekday = WEEKDAYS[d.getUTCDay()];
    const period = PERIODS.find((per) => per.test(d.getUTCHours()))?.label ?? "—";
    const key = `${weekday}__${period}`;
    const entry = buckets.get(key) ?? { weekday, period, total: 0, count: 0 };
    entry.total += p.engagement ?? 0;
    entry.count += 1;
    buckets.set(key, entry);
  }
  const overallAvg = totalCount > 0 ? totalEng / totalCount : 0;
  const ranked = Array.from(buckets.values())
    .filter((b) => b.count >= 2)
    .map((b) => ({ ...b, avg: b.total / b.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);
  return { ranked, overallAvg };
}

// Mesma lógica do componente EngajamentoPorFormato.
export function computeFormatBreakdown(posts: any[]) {
  const groups = new Map<string, { total: number; count: number }>();
  for (const p of posts) {
    const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
    const entry = groups.get(key) ?? { total: 0, count: 0 };
    entry.total += p.engagement ?? 0;
    entry.count += 1;
    groups.set(key, entry);
  }
  return Array.from(groups.entries()).map(([key, v]) => ({
    formato: fmtFormatKey(key),
    count: v.count,
    avgEngagement: v.count > 0 ? Math.round(v.total / v.count) : 0,
  }));
}

export function computeTopPosts(posts: any[], limit = 5) {
  return [...posts]
    .filter((p) => p.saved != null)
    .sort((a, b) => (b.saved ?? 0) - (a.saved ?? 0))
    .slice(0, limit);
}

// Mesma lógica do componente RepetirOuRevisar — por tema, taxa de
// engajamento (engajamento ÷ alcance), mínimo de posts pra entrar na conta.
export function computeRepetirOuRevisar(posts: any[], minPosts = 3) {
  const groups = new Map<string, { tema: string; count: number; totalEng: number; totalReach: number }>();
  for (const p of posts) {
    if (!p.tema || p.engagement == null || p.reach == null) continue;
    const entry = groups.get(p.tema) ?? { tema: p.tema, count: 0, totalEng: 0, totalReach: 0 };
    entry.count += 1;
    entry.totalEng += p.engagement;
    entry.totalReach += p.reach;
    groups.set(p.tema, entry);
  }
  const qualifying = Array.from(groups.values())
    .filter((g) => g.count >= minPosts && g.totalReach > 0)
    .map((g) => ({ ...g, rate: g.totalEng / g.totalReach }));
  if (qualifying.length === 0) return { repetir: [], revisar: [], hasEnough: false };
  const baseline = qualifying.reduce((s, g) => s + g.rate, 0) / qualifying.length;
  return {
    repetir: qualifying.filter((g) => g.rate >= baseline).sort((a, b) => b.rate - a.rate),
    revisar: qualifying.filter((g) => g.rate < baseline).sort((a, b) => a.rate - b.rate),
    hasEnough: true,
  };
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
// maior desvio da média) numa única frase — a mesma lógica que o exemplo de
// referência chamava de "a frase que resume a semana".
export function computeHeadline(posts: any[]) {
  const formatInsight = computeFormatInsight(posts);
  const { ranked: horarios, overallAvg: horaAvg } = computeMelhoresHorarios(posts);
  const top = horarios[0];
  const horaPct = top && horaAvg > 0 ? ((top.avg - horaAvg) / horaAvg) * 100 : 0;

  const candidates: { pct: number; text: string }[] = [];
  if (formatInsight) {
    candidates.push({
      pct: Math.abs(formatInsight.bestPct),
      text: `${fmtFormatKey(formatInsight.best.format)} é o formato que mais engaja nesta conta — ${formatInsight.bestPct.toFixed(0)}% acima da média, com ${formatInsight.best.count} posts no período.`,
    });
  }
  if (top) {
    candidates.push({
      pct: Math.abs(horaPct),
      text: `${top.weekday} à(o) ${top.period.toLowerCase()} é a janela de maior engajamento — ${horaPct >= 0 ? "+" : ""}${horaPct.toFixed(0)}% acima da média, em ${top.count} posts.`,
    });
  }
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.pct - a.pct)[0].text;
}
