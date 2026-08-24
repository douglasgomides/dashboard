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
