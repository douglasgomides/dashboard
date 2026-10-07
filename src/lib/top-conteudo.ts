// Top 20 de posts e Reels por uma métrica à escolha, e o que o grupo dos melhores tem em comum.
// Lógica pura e determinística: compara o top com TODOS os posts do período e só afirma quando a diferença é clara
// (15 pontos percentuais ou mais) e o grupo tem tamanho mínimo.
import { brazilWeekdayAndHour, median } from "@/lib/report-metrics";
import { DIAS_SEMANA } from "@/lib/audiencia";

export type MetricaTop = "saved" | "reach" | "engagement" | "shares" | "likes" | "comments" | "views" | "taxa_salvamento";
export const METRICAS: { id: MetricaTop; rotulo: string }[] = [
  { id: "saved", rotulo: "Salvamentos" },
  { id: "reach", rotulo: "Alcance" },
  { id: "engagement", rotulo: "Engajamento" },
  { id: "shares", rotulo: "Compartilhamentos" },
  { id: "likes", rotulo: "Curtidas" },
  { id: "comments", rotulo: "Comentários" },
  { id: "views", rotulo: "Visualizações" },
  { id: "taxa_salvamento", rotulo: "Salvamentos por alcance" },
];

export const MIN_TOP_PARA_PADROES = 8;
export const DIFERENCA_MINIMA = 15; // pontos percentuais

export function valorDaMetrica(p: any, m: MetricaTop): number | null {
  if (m === "taxa_salvamento") {
    const r = Number(p.reach), s = Number(p.saved);
    return p.reach != null && p.saved != null && r > 0 ? (s / r) * 100 : null;
  }
  const v = p[m];
  return v == null ? null : Number(v);
}

export function ehReel(p: any) {
  return p.format === "reels";
}
export function ehPostDeFeed(p: any) {
  return p.format !== "reels" && p.format !== "stories";
}

export function topN(posts: any[], tipo: "post" | "reel", metrica: MetricaTop, n = 20) {
  return posts
    .filter((p) => (tipo === "reel" ? ehReel(p) : ehPostDeFeed(p)))
    .map((p) => ({ p, v: valorDaMetrica(p, metrica) }))
    .filter((x): x is { p: any; v: number } => x.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, n);
}

const primeiraLinha = (c: string | null | undefined) => (c ?? "").split("\n")[0].trim();
const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0);
const fmtP = (n: number) => `${Math.round(n)}%`;

function compara(
  frases: string[],
  top: any[],
  todos: any[],
  teste: (p: any) => boolean,
  descricao: (pTop: number, pTodos: number, nTop: number) => string,
) {
  const nTop = top.filter(teste).length;
  const pTop = pct(nTop, top.length);
  const pTodos = pct(todos.filter(teste).length, todos.length);
  if (Math.abs(pTop - pTodos) >= DIFERENCA_MINIMA) frases.push(descricao(pTop, pTodos, nTop));
}

export function padroesDoTop(top: any[], todos: any[]): { frases: string[]; motivoVazio: string | null } {
  if (top.length < MIN_TOP_PARA_PADROES) {
    return { frases: [], motivoVazio: `Só há ${top.length} item(ns) neste grupo; para comparar padrões o grupo precisa de ${MIN_TOP_PARA_PADROES} ou mais.` };
  }
  const frases: string[] = [];
  // Formato
  // (a comparação vale quando o CONJUNTO tem mais de um formato, mesmo que o top seja de um só)
  const formatosTodos = new Set(todos.map((p) => p.format ?? "?"));
  const formatos = new Set(top.map((p) => p.format ?? "?"));
  if (formatosTodos.size > 1) {
    for (const f of formatos) {
      compara(frases, top, todos, (p) => (p.format ?? "?") === f, (a, b, n) => `${n} dos ${top.length} melhores (${fmtP(a)}) são ${f === "carrossel" ? "carrosséis" : f === "reels" ? "Reels" : f === "estatico" ? "posts de imagem única" : f}, contra ${fmtP(b)} de todos os posts do período.`);
    }
  }
  // Período do dia
  compara(frases, top, todos, (p) => !!p.posted_at && brazilWeekdayAndHour(p.posted_at).hour >= 18, (a, b, n) => `${n} dos ${top.length} foram publicados depois das 18h (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  compara(frases, top, todos, (p) => !!p.posted_at && brazilWeekdayAndHour(p.posted_at).hour < 12, (a, b, n) => `${n} dos ${top.length} foram publicados antes do meio-dia (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  // Dia da semana mais frequente do top
  const porDia = new Map<number, number>();
  for (const p of top) if (p.posted_at) porDia.set(brazilWeekdayAndHour(p.posted_at).weekday, (porDia.get(brazilWeekdayAndHour(p.posted_at).weekday) ?? 0) + 1);
  const diaTop = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0];
  if (diaTop) {
    const d = diaTop[0];
    compara(frases, top, todos, (p) => !!p.posted_at && brazilWeekdayAndHour(p.posted_at).weekday === d, (a, b, n) => `${n} dos ${top.length} foram publicados em ${DIAS_SEMANA[d].toLowerCase()} (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  }
  // Gancho (primeira linha da legenda)
  compara(frases, top, todos, (p) => primeiraLinha(p.caption).includes("?"), (a, b, n) => `${n} dos ${top.length} abrem a legenda com uma pergunta (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  compara(frases, top, todos, (p) => /^\s*\d/.test(primeiraLinha(p.caption)), (a, b, n) => `${n} dos ${top.length} começam a legenda com um número, como em lista (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  compara(frases, top, todos, (p) => /\b(você|voce|vc|seu|sua)\b/i.test(primeiraLinha(p.caption)), (a, b, n) => `${n} dos ${top.length} falam direto com a pessoa ("você", "seu", "sua") na primeira linha (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  compara(frases, top, todos, (p) => /\b(mito|verdade|erro|cuidado|nunca|pare de)\b/i.test(primeiraLinha(p.caption)), (a, b, n) => `${n} dos ${top.length} abrem com um gancho de alerta ou quebra de mito (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  // Chamada para ação
  compara(frases, top, todos, (p) => /\b(salv(e|a|ar)|compartilh(e|a|ar)|comente|comenta|marque)\b/i.test(p.caption ?? ""), (a, b, n) => `${n} dos ${top.length} pedem salvar, compartilhar ou comentar (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  compara(frases, top, todos, (p) => /\b(agende|agendar|link na bio|whatsapp|chama no direct|marque sua)\b/i.test(p.caption ?? ""), (a, b, n) => `${n} dos ${top.length} convidam para agendar ou chamar (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  // Tamanho da legenda
  const medTop = median(top.map((p) => (p.caption ?? "").length));
  const medTodos = median(todos.map((p) => (p.caption ?? "").length));
  if (medTodos > 0 && (medTop >= medTodos * 1.4 || medTop <= medTodos * 0.6)) {
    frases.push(`A legenda mediana dos melhores tem ${Math.round(medTop).toLocaleString("pt-BR")} caracteres, contra ${Math.round(medTodos).toLocaleString("pt-BR")} de todos os posts.`);
  }
  // Tema (quando classificado)
  const temas = new Map<string, number>();
  for (const p of top) if (p.tema) temas.set(p.tema, (temas.get(p.tema) ?? 0) + 1);
  const temaTop = [...temas.entries()].sort((a, b) => b[1] - a[1])[0];
  if (temaTop) {
    const t = temaTop[0];
    compara(frases, top, todos, (p) => p.tema === t, (a, b, n) => `${n} dos ${top.length} são do tema "${t}" (${fmtP(a)}), contra ${fmtP(b)} de todos.`);
  }
  return {
    frases,
    motivoVazio: frases.length === 0 ? "Os melhores se parecem com o resto dos posts nos critérios medidos (formato, horário, gancho, chamada, tamanho). Sem diferença clara para destacar." : null,
  };
}
