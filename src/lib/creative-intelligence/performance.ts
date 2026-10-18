import { valorDaMetrica, type MetricaTop } from "../top-conteudo";
import type { Objective } from "./contracts";

export interface PerformancePost {
  id: string;
  instagram_account_id: string;
  format: string | null;
  posted_at: string | null;
  funnel_stage?: string | null;
  tema?: string | null;
  reach: number | null;
  saved: number | null;
  shares: number | null;
  views: number | null;
  media_follows?: number | null;
  reel_avg_watch_time_ms?: number | null;
  [key: string]: unknown;
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y),
    m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};
export function objectiveValue(
  p: PerformancePost,
  objective: Objective,
): number | null {
  if (objective === "alcance") return valorDaMetrica(p, "reach");
  if (objective === "salvamento" || objective === "autoridade")
    return valorDaMetrica(p, "taxa_salvamento");
  if (objective === "compartilhamento")
    return p.shares != null && p.reach != null && p.reach > 0
      ? (p.shares / p.reach) * 100
      : null;
  if (objective === "seguidores")
    return p.media_follows != null && p.reach != null && p.reach > 0
      ? (p.media_follows / p.reach) * 100
      : null;
  // Conversão precisa de atribuição verificável, não é deduzida de likes ou alcance.
  return null;
}
export function performanceEvidence(
  post: PerformancePost,
  all: PerformancePost[],
  objective: Objective,
  now = Date.now(),
) {
  const age = post.posted_at
    ? (now - Date.parse(post.posted_at)) / 86_400_000
    : null;
  const value = objectiveValue(post, objective);
  const cohorts = all.filter(
    (p) =>
      p.id !== post.id &&
      p.instagram_account_id === post.instagram_account_id &&
      p.format === post.format &&
      p.posted_at &&
      post.posted_at &&
      Math.abs(Date.parse(p.posted_at) - Date.parse(post.posted_at)) <=
        90 * 86_400_000 &&
      (!post.funnel_stage || p.funnel_stage === post.funnel_stage),
  );
  const values = cohorts
    .map((p) => objectiveValue(p, objective))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const baseline = median(values);
  const relative =
    value !== null && baseline !== null && baseline > 0
      ? value / baseline
      : null;
  const limitations = [
    "Comparação observacional; não demonstra causalidade.",
    "Impulsionamento e tamanho da audiência histórica não foram confirmados.",
    "Métricas atuais não reconstituem o desempenho histórico em D1/D3/D7/D28.",
  ];
  if (age === null || age < 7)
    limitations.push(
      "Publicação ainda sem sete dias completos de exposição, ou data indisponível.",
    );
  if (values.length < 8)
    limitations.push(
      "Menos de oito publicações comparáveis; amostra insuficiente.",
    );
  if (objective === "conversa")
    limitations.push(
      "Conversões comerciais não atribuídas: desempenho comercial indisponível.",
    );
  return {
    objective,
    absolute: {
      reach: post.reach,
      saved: post.saved,
      shares: post.shares,
      views: post.views,
      follows: post.media_follows ?? null,
      avg_watch_time_ms: post.reel_avg_watch_time_ms ?? null,
    },
    value,
    baseline_median: baseline,
    baseline_count: values.length,
    relative_multiple: relative,
    age_days: age,
    paid: "unknown",
    confidence:
      values.length >= 8 && age !== null && age >= 7 && relative !== null
        ? "media"
        : "insuficiente",
    promising:
      values.length >= 8 &&
      age !== null &&
      age >= 7 &&
      relative !== null &&
      relative >= 1.25,
    limitations,
  };
}
export function rankForObjective(
  posts: PerformancePost[],
  objective: Objective,
) {
  return posts
    .map((post) => ({
      post,
      evidence: performanceEvidence(post, posts, objective),
    }))
    .sort(
      (a, b) =>
        (b.evidence.relative_multiple ?? -1) -
          (a.evidence.relative_multiple ?? -1) ||
        (b.evidence.value ?? -1) - (a.evidence.value ?? -1),
    );
}
export const objectiveMetric: Partial<Record<Objective, MetricaTop>> = {
  alcance: "reach",
  salvamento: "taxa_salvamento",
  autoridade: "taxa_salvamento",
};
