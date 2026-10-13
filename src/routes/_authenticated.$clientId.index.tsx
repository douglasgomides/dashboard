import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getMonthlyMetrics, getPostsForAnalytics, getAdsDiagnosticoPorObjetivo, getAdsPorDia, getWtsResumo, getCrmResumoPeriodo, getCrmLeadsPorDiaPeriodo, getClientFontes } from "@/lib/client-data";
import { montarResultado, type Metrica } from "@/lib/resultado";
import { InsightCard, ListaLimitacoes, SeloStatus, BotaoAcao, OQueE, COR_TOM } from "@/components/insight-card";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { SyncButton } from "@/components/sync-button";
import { useAuth } from "@/hooks/use-auth";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";
import { brazilWeekdayAndHour, computeFormatBreakdown, computeFormatInsight, median } from "@/lib/report-metrics";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import { getResumoPeriodo } from "@/lib/audiencia";
import { Eye, Activity, Bookmark, Clock, Gauge, BarChart3, Download, Loader2, Lightbulb } from "lucide-react";
import { Painel, BarraFina, Miniatura } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/")({
  component: MonthlyOverview,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PERIODS = [
  { label: "Madrugada (0h–5h)", test: (h: number) => h < 6 },
  { label: "Manhã (6h–11h)", test: (h: number) => h >= 6 && h < 12 },
  { label: "Tarde (12h–17h)", test: (h: number) => h >= 12 && h < 18 },
  { label: "Noite (18h–23h)", test: (h: number) => h >= 18 },
];


function tickDate(d: string) {
  return d.slice(5);
}

// Lista compacta de posts, reutilizada no drill-down de dia e na
// justificativa de "melhor horário" — sempre com link pro post real, nunca
// só um número solto.
function PostList({ posts }: { posts: any[] }) {
  return (
    <ul className="space-y-2">
      {posts.map((p) => (
        <li key={p.id}>
          <a
            href={p.permalink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex gap-3 rounded-lg border p-2.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <Miniatura url={p.thumbnail_url} formato={p.format} className="h-12 w-12" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 block font-medium">{(p.caption ?? p.windsor_media_id).split("\n")[0].slice(0, 90)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                <span>{p.posted_at && new Date(p.posted_at).toLocaleDateString("pt-BR")}</span>
                <span className="inline-flex items-center gap-1"><Eye size={12} /> {(p.reach ?? 0).toLocaleString("pt-BR")}</span>
                <span className="inline-flex items-center gap-1"><Activity size={12} /> {(p.engagement ?? 0).toLocaleString("pt-BR")}</span>
                <span className="inline-flex items-center gap-1"><Bookmark size={12} /> {(p.saved ?? 0).toLocaleString("pt-BR")}</span>
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MelhoresHorarios({ posts, periodLabel }: { posts: any[]; periodLabel: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { ranked, overallMedian } = useMemo(() => {
    const buckets = new Map<
      string,
      { weekday: string; period: string; values: number[]; posts: any[] }
    >();
    const allEng: number[] = [];
    for (const p of posts) {
      if (!p.posted_at || p.engagement == null) continue;
      allEng.push(p.engagement);
      const { weekday: weekdayIdx, hour } = brazilWeekdayAndHour(p.posted_at);
      const weekday = WEEKDAYS[weekdayIdx];
      const period = PERIODS.find((per) => per.test(hour))?.label ?? "—";
      const key = `${weekday}__${period}`;
      const entry = buckets.get(key) ?? { weekday, period, values: [], posts: [] };
      entry.values.push(p.engagement);
      entry.posts.push(p);
      buckets.set(key, entry);
    }
    const overallMedian = median(allEng);
    const ranked = Array.from(buckets.entries())
      .filter(([, b]) => b.values.length >= 2)
      .map(([key, b]) => ({
        key,
        weekday: b.weekday,
        period: b.period,
        count: b.values.length,
        median: median(b.values),
        posts: [...b.posts].sort((a, c) => (c.engagement ?? 0) - (a.engagement ?? 0)),
      }))
      .sort((a, b) => b.median - a.median)
      .slice(0, 5);
    return { ranked, overallMedian };
  }, [posts]);

  const maxMediana = Math.max(1, ...ranked.map((r) => r.median));
  return (
    <Painel
      icone={Clock}
      cor="var(--s7)"
      titulo="Melhores horários para postar"
      resumo="Toque numa linha para ver os posts"
      ajuda={`${periodLabel}, por engajamento (mediana; horário de Brasília). Clique numa linha para ver os posts que sustentam o número.`}
    >
      {ranked.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Poucos posts para ranquear com confiança ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {ranked.map((r, idx) => {
            const vsMedian = overallMedian > 0 ? ((r.median - overallMedian) / overallMedian) * 100 : 0;
            const isOpen = expanded === r.key;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.key)}
                  className="block w-full rounded-lg border p-2.5 text-left"
                  style={{ borderColor: isOpen ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: idx === 0 ? "var(--warn)" : "var(--surface-2)", color: idx === 0 ? "#1a1a19" : "var(--text-dim)" }}>
                        {idx + 1}
                      </span>
                      <b className="truncate">{r.weekday}</b>
                      <span className="truncate text-xs" style={{ color: "var(--text-dim)" }}>{r.period}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: vsMedian >= 0 ? "var(--good-text)" : "var(--text-dim)" }}>
                      {vsMedian >= 0 ? "▲ +" : "▼ "}
                      {vsMedian.toFixed(0)}%
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1"><BarraFina valor={r.median} max={maxMediana} cor="var(--s7)" /></span>
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                      <b style={{ color: "var(--text)" }}>{fmtNum(Math.round(r.median))}</b> · {r.count} posts
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 rounded-lg border p-3" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
                    <p className="mb-2 text-xs" style={{ color: "var(--text-faint)" }}>
                      {r.count} post{r.count > 1 ? "s" : ""} em {r.weekday.toLowerCase()}, {r.period.toLowerCase()}: engajamento{" "}
                      {vsMedian >= 0 ? vsMedian.toFixed(0) + "% acima" : Math.abs(vsMedian).toFixed(0) + "% abaixo"} da mediana da conta ({fmtNum(Math.round(overallMedian))}).
                    </p>
                    <PostList posts={r.posts} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}

function EngajamentoPorFormato({ posts }: { posts: any[] }) {
  const data = useMemo(() => {
    return computeFormatBreakdown(posts).map((f) => ({
      formato: f.formato,
      "Engajamento (mediana)": f.medianEngagement,
    }));
  }, [posts]);

  return (
    <Painel icone={BarChart3} cor="var(--s3)" titulo="Engajamento por formato" resumo="Mediana de cada formato">
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Sem posts suficientes ainda.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="formato" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" tickFormatter={fmtNum} />
            <Tooltip formatter={(value: number) => fmtNum(value)} />
            <Bar dataKey="Engajamento (mediana)" fill="var(--s3)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Painel>
  );
}

function fmtFormatLabel(key: string) {
  return key === "não classificado" ? key : formatLabel(key as ContentFormat);
}

// Resumo em texto corrido do que os números dizem — em vez de só mostrar a
// tabela/gráfico crus, nomeia o melhor e o pior formato com os números que
// sustentam a afirmação. Não sugere o que postar, só descreve o que já
// aconteceu.
function InsightDeFormato({ posts, periodLabel }: { posts: any[]; periodLabel: string }) {
  const insight = useMemo(() => computeFormatInsight(posts), [posts]);

  if (!insight) return null;
  const { best, worst, bestPct, worstPct } = insight;

  return (
    <div
      className="flex gap-3 rounded-xl border p-4 text-sm leading-relaxed"
      style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
    >
      <Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
      <span>
      {periodLabel}, <strong>{fmtFormatLabel(best.format)}</strong> foi o formato mais forte —
      engajamento (mediana) de {fmtNum(Math.round(best.median))} ({best.count} posts), {bestPct >= 0 ? "+" : ""}
      {bestPct.toFixed(0)}% acima da mediana geral da conta.
      {worst.format !== best.format && (
        <>
          {" "}
          <strong>{fmtFormatLabel(worst.format)}</strong> ficou {Math.abs(worstPct).toFixed(0)}% abaixo ({worst.count}{" "}
          posts) — vale revisar frequência ou abordagem nesse formato.
        </>
      )}
      </span>
    </div>
  );
}

// Painel de "por que esse alcance": lista os posts publicados no dia
// clicado no gráfico logo acima — fica colado nele, sem precisar rolar.
function DrillDownDoDia({ date, posts }: { date: string | null; posts: any[] }) {
  if (!date) return null;

  const dayPosts = posts
    .filter((p) => p.posted_at && p.posted_at.slice(0, 10) === date)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  return (
    <div
      className="mt-3 rounded-lg border p-3"
      style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        O que aconteceu em {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}
      </h3>
      {dayPosts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post publicado nesse dia — o alcance/interações vieram de posts anteriores continuando a circular.
        </p>
      ) : (
        <PostList posts={dayPosts} />
      )}
    </div>
  );
}

function MetricaCard({ m, clientId }: { m: Metrica; clientId: string }) {
  const c = m.status ? COR_TOM[m.status] : null;
  return (
    <article className="flex flex-col rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderTop: c ? `3px solid ${c.borda}` : undefined }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
          {m.rotulo}
        </h3>
        {m.status ? <SeloStatus tom={m.status} texto={m.selo} /> : <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>sem referência</span>}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums leading-tight">{m.valor}</div>
      {m.statusTexto && (
        <div className="mt-1 text-xs font-medium" style={{ color: c?.cor ?? "var(--text-dim)" }}>
          {m.statusTexto}
        </div>
      )}
      {m.comparacao && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {m.comparacao}
        </div>
      )}
      <div className="mt-2">
        <OQueE>
          {m.explicacao}
          {m.fonte ? <span className="mt-1 block" style={{ color: "var(--text-faint)" }}>Fonte da referência: {m.fonte}</span> : null}
        </OQueE>
      </div>
      {m.rota && m.botao && (
        <div className="mt-auto pt-3">
          <BotaoAcao texto={m.botao} rota={m.rota} clientId={clientId} variante="secundario" />
        </div>
      )}
    </article>
  );
}

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [selectedDateMonthly, setSelectedDateMonthly] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Período anterior com o mesmo número de dias (o fim nunca passa de hoje).
  const fim = end > hoje ? hoje : end;
  const diasPeriodo = Math.max(1, Math.round((new Date(fim).getTime() - new Date(start).getTime()) / 86400000) + 1);
  const isoMenosDias = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00Z").getTime() - n * 86400000).toISOString().slice(0, 10);
  const prevEnd = isoMenosDias(start, 1);
  const prevStart = isoMenosDias(start, diasPeriodo);

  const q = <T,>(key: unknown[], fn: () => Promise<T>, enabled = true) => useQuery({ queryKey: key, queryFn: fn, enabled, retry: false, staleTime: 5 * 60_000 });
  const metricas = q(["monthly-metrics", clientId, start, fim], () => getMonthlyMetrics(clientId, start, fim));
  const anterior = q(["monthly-metrics-anterior", clientId, prevStart, prevEnd], () => getMonthlyMetrics(clientId, prevStart, prevEnd));
  const posts = q(["posts-analytics", clientId, start, fim], () => getPostsForAnalytics(clientId, start, fim));
  const periodoIg = q(["periodo-ig", clientId, start, fim], () => getResumoPeriodo(clientId, start, fim));
  const fontes = q(["fontes", clientId], () => getClientFontes(clientId));
  const adsDiag = q(["ads-diag-objetivo", clientId, start, fim], () => getAdsDiagnosticoPorObjetivo(clientId, start, fim));
  const adsDia = q(["ads-dia", clientId, start, fim], () => getAdsPorDia(clientId, start, fim));
  const wts = q(["wts-resumo", clientId, start, fim], () => getWtsResumo(clientId, start, fim));
  const crm = q(["crm-resumo", clientId, start, fim], () => getCrmResumoPeriodo(clientId, start, fim));
  const leadsDia = q(["crm-leads-dia", clientId, start, fim], () => getCrmLeadsPorDiaPeriodo(clientId, start, fim));

  const r = useMemo(() => {
    if (!metricas.data) return null;
    return montarResultado({
      start,
      end: fim,
      hoje,
      diario: metricas.data as any[],
      diarioAnterior: (anterior.data as any[]) ?? undefined,
      posts: (posts.data as any[]) ?? [],
      periodoIg: periodoIg.data?.dados ?? null,
      adsDiag: adsDiag.data ?? null,
      adsPorDia: (adsDia.data ?? []).map((a: any) => ({ dia: a.dia, gasto: Number(a.gasto), conversas: Number(a.conversas) })),
      wts: wts.data ?? null,
      crm: crm.data ? { novos: Number(crm.data.novos), ganhos: Number(crm.data.ganhos) } : null,
      leadsPorDia: leadsDia.data?.length ? leadsDia.data.map((l) => ({ dia: l.dia, total: Number(l.total) })) : fontes.data?.tem_crm ? [] : undefined,
      fontes: fontes.data ?? null,
    });
  }, [metricas.data, anterior.data, posts.data, periodoIg.data, adsDiag.data, adsDia.data, wts.data, crm.data, leadsDia.data, fontes.data, start, fim, hoje]);

  if (metricas.isLoading || !r) return <p style={{ color: "var(--text-dim)" }}>Lendo os dados do período…</p>;

  const data = metricas.data ?? [];
  const chartData = data.filter((d) => d.reach != null).map((d) => ({ date: d.date, Alcance: d.reach ?? 0, Interações: d.total_interactions ?? 0 }));
  const travando = r.insights.filter((i) => i.tom !== "bom");
  const funcionando = r.insights.filter((i) => i.tom === "bom");
  const outras = r.semana.filter((i) => i !== r.proximaAcao);
  const cv = r.veredito.tom === "neutro" ? null : COR_TOM[r.veredito.tom];

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start, end: fim, periodLabel });
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* Alertas de dado incompleto: em cima, para ninguém tirar conclusão de período pela metade. */}
      {r.cobertura.alertas.length > 0 && (
        <div className="space-y-2" role="status">
          {r.cobertura.alertas.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm" style={{ background: COR_TOM[a.tom].fundo, borderColor: COR_TOM[a.tom].borda }}>
              <span className="mt-0.5 shrink-0" aria-hidden>
                ⚠️
              </span>
              <span style={{ color: "var(--text)" }}>{a.texto}</span>
            </div>
          ))}
          {isAdmin && r.cobertura.diasComDado < r.cobertura.diasPeriodo && (
            <div className="flex justify-end">
              <SyncButton clientId={clientId} alvo="historico" />
            </div>
          )}
        </div>
      )}

      {/* 1 e 2. O que aconteceu e se é bom ou ruim */}
      <section className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: cv ? `5px solid ${cv.borda}` : undefined }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Resumo executivo · {periodLabel}
          </span>
          {r.veredito.tom !== "neutro" && <SeloStatus tom={r.veredito.tom} />}
        </div>
        <h1 className="mt-2 text-lg font-semibold leading-snug sm:text-xl">{r.veredito.titulo}</h1>
        {r.resumo.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {r.resumo.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden style={{ color: "var(--text-faint)" }}>•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. O que fazer agora — logo depois do resumo, antes dos números */}
      {r.proximaAcao?.acao && (
        <section className="rounded-xl border-2 p-4 sm:p-5" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
            Próxima ação recomendada
          </div>
          <p className="mt-1.5 text-base font-semibold leading-snug">{r.proximaAcao.acao.texto}</p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Por quê: {r.proximaAcao.titulo}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-dim)" }}>
            <span>Quem faz: <b style={{ color: "var(--text)" }}>{ROTULO_RESPONSAVEL[r.proximaAcao.responsavel]}</b></span>
            <span>Impacto: <b style={{ color: "var(--text)" }}>{r.proximaAcao.impacto}</b></span>
            <span>Confiança: <b style={{ color: "var(--text)" }}>{r.proximaAcao.confianca}</b></span>
          </div>
          {r.proximaAcao.acao.rota && (
            <div className="mt-3">
              <BotaoAcao texto={r.proximaAcao.acao.botao ?? "Abrir"} rota={r.proximaAcao.acao.rota} clientId={clientId} />
            </div>
          )}
          {outras.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
                Também nesta semana
              </div>
              <ol className="mt-1.5 space-y-1.5 text-sm">
                {outras.map((i, k) => (
                  <li key={i.id} className="flex gap-2">
                    <span className="font-semibold tabular-nums" style={{ color: "var(--text-faint)" }}>
                      {k + 2}.
                    </span>
                    <span>
                      {i.acao!.texto} <span style={{ color: "var(--text-faint)" }}>({ROTULO_RESPONSAVEL[i.responsavel]})</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* Métricas com status */}
      {r.metricas.length > 0 && (
        <Secao numero={1} titulo="Como estão os números">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {r.metricas.map((m) => (
              <MetricaCard key={m.id} m={m} clientId={clientId} />
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            Verde, amarelo e vermelho só aparecem quando existe referência de mercado confiável. Sem referência, compare com o período anterior.
          </p>
        </Secao>
      )}

      {/* 3. Por que aconteceu */}
      {r.insights.length > 0 && (
        <Secao numero={2} titulo="Por que aconteceu">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {travando.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-dim)" }}>
                  O que está travando
                </h3>
                {travando.map((i) => (
                  <InsightCard key={i.id} insight={i} clientId={clientId} />
                ))}
              </div>
            )}
            {funcionando.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-dim)" }}>
                  O que está funcionando
                </h3>
                {funcionando.map((i) => (
                  <InsightCard key={i.id} insight={i} clientId={clientId} />
                ))}
              </div>
            )}
          </div>
        </Secao>
      )}

      {/* 5. O que falta */}
      <ListaLimitacoes itens={r.limitacoes} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoAcao texto="Montar relatório para o cliente" rota="/$clientId/relatorio" clientId={clientId} />
        <button
          type="button"
          onClick={handleDownloadReport}
          disabled={generatingReport}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-60"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {generatingReport ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generatingReport ? "Gerando PDF…" : "Baixar PDF completo do período"}
        </button>
      </div>

      {/* Detalhes para quem quer conferir */}
      <details className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold">
          <BarChart3 size={16} aria-hidden /> Ver gráficos do período
        </summary>
        <div className="mt-4 space-y-4">
          {chartData.length > 0 && (
            <Painel icone={Gauge} cor="var(--s1)" titulo="Alcance e interações por dia" resumo="Toque num dia para ver o que foi publicado">
              <div className="min-w-0">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} onClick={(e: any) => e?.activeLabel && setSelectedDateMonthly(e.activeLabel)} style={{ cursor: "pointer" }}>
                    <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 11 }} stroke="var(--text-faint)" interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" tickFormatter={fmtNum} width={44} />
                    <Tooltip labelFormatter={tickDate} formatter={(value: number) => fmtNum(value)} />
                    <Area type="monotone" dataKey="Alcance" stroke="var(--s1)" fill="var(--s1)" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="Interações" stroke="var(--s3)" fillOpacity={0} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <DrillDownDoDia date={selectedDateMonthly} posts={posts.data ?? []} />
            </Painel>
          )}
          <InsightDeFormato posts={posts.data ?? []} periodLabel={periodLabel} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EngajamentoPorFormato posts={posts.data ?? []} />
            <MelhoresHorarios posts={posts.data ?? []} periodLabel={periodLabel} />
          </div>
        </div>
      </details>

      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="tudo" />
      </div>
    </div>
  );
}
