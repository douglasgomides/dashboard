import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getClient, getMonthlyMetrics, getMetricsTrend, getPostsForAnalytics } from "@/lib/client-data";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/$clientId/")({
  component: MonthlyOverview,
});

const TREND_DAYS = 90;
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PERIODS = [
  { label: "Madrugada (0h–5h)", test: (h: number) => h < 6 },
  { label: "Manhã (6h–11h)", test: (h: number) => h >= 6 && h < 12 },
  { label: "Tarde (12h–17h)", test: (h: number) => h >= 12 && h < 18 },
  { label: "Noite (18h–23h)", test: (h: number) => h >= 18 },
];

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function sum(rows: { [k: string]: any }[], key: string) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function tickDate(d: string) {
  return d.slice(5);
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function SinaisDeInteresse({ reach, contactTaps, newFollowers }: { reach: number; contactTaps: number; newFollowers: number }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Alcance e sinais de interesse do mês</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        A Meta depreciou "visitas ao perfil" na API — não é mais possível montar um funil real com % de conversão
        entre essas etapas. São sinais paralelos, não um funil sequencial.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Alcance
          </div>
          <div className="mt-1 text-xl font-semibold">{reach.toLocaleString("pt-BR")}</div>
        </div>
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Toques em botões de contato
          </div>
          <div className="mt-1 text-xl font-semibold">{contactTaps.toLocaleString("pt-BR")}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            endereço, ligar, e-mail, mensagem
          </div>
        </div>
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Novos seguidores
          </div>
          <div className="mt-1 text-xl font-semibold">{newFollowers.toLocaleString("pt-BR")}</div>
        </div>
      </div>
    </div>
  );
}

// Lista compacta de posts, reutilizada no drill-down de dia e na
// justificativa de "melhor horário" — sempre com link pro post real, nunca
// só um número solto.
function PostList({ posts }: { posts: any[] }) {
  return (
    <ul className="space-y-2">
      {posts.map((p) => (
        <li
          key={p.id}
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            {(p.caption ?? p.windsor_media_id).split("\n")[0].slice(0, 90)}
          </a>
          <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            {p.posted_at && new Date(p.posted_at).toLocaleDateString("pt-BR")} · Alcance{" "}
            {(p.reach ?? 0).toLocaleString("pt-BR")} · Engajamento {(p.engagement ?? 0).toLocaleString("pt-BR")} ·
            Salvos {(p.saved ?? 0).toLocaleString("pt-BR")}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MelhoresHorarios({ posts }: { posts: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { ranked, overallAvg } = useMemo(() => {
    const buckets = new Map<
      string,
      { weekday: string; period: string; total: number; count: number; posts: any[] }
    >();
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
      const entry = buckets.get(key) ?? { weekday, period, total: 0, count: 0, posts: [] };
      entry.total += p.engagement ?? 0;
      entry.count += 1;
      entry.posts.push(p);
      buckets.set(key, entry);
    }
    const overallAvg = totalCount > 0 ? totalEng / totalCount : 0;
    const ranked = Array.from(buckets.entries())
      .filter(([, b]) => b.count >= 2)
      .map(([key, b]) => ({
        key,
        weekday: b.weekday,
        period: b.period,
        count: b.count,
        avg: b.total / b.count,
        posts: [...b.posts].sort((a, c) => (c.engagement ?? 0) - (a.engagement ?? 0)),
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
    return { ranked, overallAvg };
  }, [posts]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Melhores horários pra postar</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Últimos {TREND_DAYS} dias, por engajamento médio (horário em UTC). Clique numa linha pra ver os posts que
        sustentam o número.
      </p>
      {ranked.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Poucos posts pra ranquear com confiança ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
              <th className="pb-2">Dia</th>
              <th className="pb-2">Período</th>
              <th className="pb-2 text-right">Posts</th>
              <th className="pb-2 text-right">Engajamento médio</th>
              <th className="pb-2 text-right">vs. média da conta</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const vsAvg = overallAvg > 0 ? ((r.avg - overallAvg) / overallAvg) * 100 : 0;
              const isOpen = expanded === r.key;
              return (
                <Fragment key={r.key}>
                  <tr
                    className="cursor-pointer border-t"
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => setExpanded(isOpen ? null : r.key)}
                  >
                    <td className="py-1.5">{r.weekday}</td>
                    <td className="py-1.5">{r.period}</td>
                    <td className="py-1.5 text-right">{r.count}</td>
                    <td className="py-1.5 text-right font-medium">{r.avg.toFixed(0)}</td>
                    <td
                      className="py-1.5 text-right font-medium"
                      style={{ color: vsAvg >= 0 ? "var(--good)" : "var(--text-dim)" }}
                    >
                      {vsAvg >= 0 ? "+" : ""}
                      {vsAvg.toFixed(0)}%
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${r.key}-expanded`}>
                      <td colSpan={5} className="pb-3">
                        <div
                          className="rounded-lg border p-3"
                          style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
                        >
                          <p className="mb-2 text-xs" style={{ color: "var(--text-faint)" }}>
                            {r.count} post{r.count > 1 ? "s" : ""} publicado{r.count > 1 ? "s" : ""} em{" "}
                            {r.weekday.toLowerCase()} à(o) {r.period.toLowerCase()} nos últimos {TREND_DAYS} dias —
                            engajamento médio {vsAvg >= 0 ? vsAvg.toFixed(0) + "% acima" : Math.abs(vsAvg).toFixed(0) + "% abaixo"}{" "}
                            da média geral da conta ({overallAvg.toFixed(0)}).
                          </p>
                          <PostList posts={r.posts} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EngajamentoPorFormato({ posts }: { posts: any[] }) {
  const data = useMemo(() => {
    const groups = new Map<string, { total: number; count: number }>();
    for (const p of posts) {
      const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
      const entry = groups.get(key) ?? { total: 0, count: 0 };
      entry.total += p.engagement ?? 0;
      entry.count += 1;
      groups.set(key, entry);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({
      formato: fmtFormatLabel(key),
      "Engajamento médio": v.count > 0 ? Math.round(v.total / v.count) : 0,
    }));
  }, [posts]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">Engajamento médio por formato</h2>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Sem posts suficientes ainda.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="formato" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <Tooltip />
            <Bar dataKey="Engajamento médio" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function fmtFormatLabel(key: string) {
  return key === "não classificado" ? key : formatLabel(key as ContentFormat);
}

// Resumo em texto corrido do que os números dizem — em vez de só mostrar a
// tabela/gráfico crus, nomeia o melhor e o pior formato com os números que
// sustentam a afirmação. Não sugere o que postar, só descreve o que já
// aconteceu.
function InsightDeFormato({ posts }: { posts: any[] }) {
  const insight = useMemo(() => {
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
  }, [posts]);

  if (!insight) return null;
  const { best, worst, bestPct, worstPct } = insight;

  return (
    <div
      className="rounded-xl border p-4 text-sm leading-relaxed"
      style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
    >
      Nos últimos {TREND_DAYS} dias, <strong>{fmtFormatLabel(best.format)}</strong> foi o formato mais forte —
      engajamento médio de {best.avg.toFixed(0)} ({best.count} posts), {bestPct >= 0 ? "+" : ""}
      {bestPct.toFixed(0)}% acima da média geral da conta.
      {worst.format !== best.format && (
        <>
          {" "}
          <strong>{fmtFormatLabel(worst.format)}</strong> ficou {Math.abs(worstPct).toFixed(0)}% abaixo ({worst.count}{" "}
          posts) — vale revisar frequência ou abordagem nesse formato.
        </>
      )}
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

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const { start, end } = monthBounds();
  const since = daysAgo(TREND_DAYS);
  const [selectedDateMonthly, setSelectedDateMonthly] = useState<string | null>(null);
  const [selectedDateTrend, setSelectedDateTrend] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["monthly-metrics", clientId, start, end],
    queryFn: () => getMonthlyMetrics(clientId, start, end),
  });

  const { data: trend } = useQuery({
    queryKey: ["metrics-trend", clientId, since],
    queryFn: () => getMetricsTrend(clientId, since),
  });

  const { data: postsForAnalytics } = useQuery({
    queryKey: ["posts-analytics", clientId, since],
    queryFn: () => getPostsForAnalytics(clientId, since),
  });

  function handleMonthlyClick(e: any) {
    if (e?.activeLabel) setSelectedDateMonthly(e.activeLabel);
  }
  function handleTrendClick(e: any) {
    if (e?.activeLabel) setSelectedDateTrend(e.activeLabel);
  }

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando métricas do mês…</p>;
  }

  const data = rows ?? [];
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-sm"
        style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--text)" }}
      >
        Sem dados sincronizados pra este mês ainda. Rode <code>npm run sync:instagram</code> depois de
        cadastrar a conta do cliente em <code>instagram_accounts</code>.
      </div>
    );
  }

  const newFollowers = sum(data, "new_followers");
  const reach = sum(data, "reach");
  const saves = sum(data, "saves");
  const interactions = sum(data, "total_interactions");
  const contactTaps = sum(data, "profile_links_taps");
  const engagementRate = reach > 0 ? ((interactions / reach) * 100).toFixed(1) + "%" : "—";

  const chartData = data.map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    Interações: d.total_interactions ?? 0,
  }));

  const trendData = (trend ?? []).map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    "Seguidores ganhos": d.new_followers ?? 0,
  }));

  const postsDoMes = (postsForAnalytics ?? []).filter(
    (p) => p.posted_at && p.posted_at.slice(0, 10) >= start && p.posted_at.slice(0, 10) <= end,
  );

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      const { downloadClientReport } = await import("@/lib/pdf-report");
      await downloadClientReport({
        clientName: client?.name ?? "Cliente",
        igHandle: client?.instagram_handle,
        periodLabel: new Date(start + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        kpis: [
          { label: "Novos seguidores", value: newFollowers.toLocaleString("pt-BR") },
          { label: "Alcance", value: reach.toLocaleString("pt-BR") },
          { label: "Taxa de engajamento", value: engagementRate, hint: "interações ÷ alcance" },
          { label: "Salvamentos", value: saves.toLocaleString("pt-BR") },
        ],
        postsForAnalytics: postsForAnalytics ?? [],
        postsDoMes,
      });
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Novos seguidores" value={newFollowers.toLocaleString("pt-BR")} />
        <KpiCard label="Alcance" value={reach.toLocaleString("pt-BR")} />
        <KpiCard label="Taxa de engajamento" value={engagementRate} hint="interações ÷ alcance" />
        <KpiCard label="Salvamentos" value={saves.toLocaleString("pt-BR")} />
      </div>

      <button
        type="button"
        onClick={handleDownloadReport}
        disabled={generatingReport}
        className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {generatingReport ? "Gerando PDF…" : "Baixar relatório PDF"}
      </button>

      <SinaisDeInteresse reach={reach} contactTaps={contactTaps} newFollowers={newFollowers} />

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Alcance × interações no mês</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Clique em um ponto pra ver o que foi publicado naquele dia.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} onClick={handleMonthlyClick} style={{ cursor: "pointer" }}>
            <defs>
              <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <Tooltip labelFormatter={tickDate} />
            <Area type="monotone" dataKey="Alcance" stroke="var(--accent)" fill="url(#reachFill)" />
            <Area type="monotone" dataKey="Interações" stroke="var(--good)" fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
        <DrillDownDoDia date={selectedDateMonthly} posts={postsForAnalytics ?? []} />
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Tendência geral — últimos {TREND_DAYS} dias</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Alcance e seguidores ganhos lado a lado, pra ver o efeito de mudanças ao longo do tempo. Clique em um
          ponto pra ver o que foi publicado naquele dia.
        </p>
        {trendData.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Sem histórico suficiente ainda.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} onClick={handleTrendClick} style={{ cursor: "pointer" }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 10 }} stroke="var(--text-faint)" interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <Tooltip labelFormatter={tickDate} />
              <Line yAxisId="left" type="monotone" dataKey="Alcance" stroke="var(--accent)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="Seguidores ganhos" stroke="var(--good)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <DrillDownDoDia date={selectedDateTrend} posts={postsForAnalytics ?? []} />
      </div>

      <InsightDeFormato posts={postsForAnalytics ?? []} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EngajamentoPorFormato posts={postsForAnalytics ?? []} />
        <MelhoresHorarios posts={postsForAnalytics ?? []} />
      </div>
    </div>
  );
}
