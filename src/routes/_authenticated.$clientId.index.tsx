import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
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
import { getClient, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { ResumoDoMes } from "@/components/resumo-do-mes";
import { SyncButton } from "@/components/sync-button";
import { useAuth } from "@/hooks/use-auth";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";
import { brazilWeekdayAndHour, computeFormatBreakdown, computeFormatInsight, fmtFormatKey, median } from "@/lib/report-metrics";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import { UserPlus, Eye, Activity, Bookmark, Trophy, TrendingDown, MousePointerClick, LineChart as LineIcon, Clock, Gauge, BarChart3, Download, Loader2, Lightbulb } from "lucide-react";
import { Painel, Kpi, BarraFina, Miniatura } from "@/components/visual";

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

function sum(rows: { [k: string]: any }[], key: string) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function tickDate(d: string) {
  return d.slice(5);
}

function SinaisDeInteresse({ reach, contactTaps, newFollowers }: { reach: number; contactTaps: number; newFollowers: number }) {
  return (
    <Painel
      icone={MousePointerClick}
      cor="var(--s1)"
      titulo="Alcance e sinais de interesse"
      resumo="Três sinais paralelos, não um funil"
      ajuda="A Meta depreciou “visitas ao perfil” na API, então não dá mais para montar um funil real com % de conversão entre essas etapas. São sinais paralelos, não um funil sequencial."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icone={Eye} cor="var(--s1)" rotulo="Alcance" valor={reach.toLocaleString("pt-BR")} />
        <Kpi icone={MousePointerClick} cor="var(--s2)" rotulo="Toques em contato" valor={contactTaps.toLocaleString("pt-BR")} dica="endereço, ligar, e-mail, mensagem" />
        <Kpi icone={UserPlus} cor="var(--s3)" rotulo="Novos seguidores" valor={newFollowers.toLocaleString("pt-BR")} dica="só últimos 30 dias (limite do Instagram, não do período escolhido)" />
      </div>
    </Painel>
  );
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

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
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

  // Período anterior, do mesmo tamanho, só para mostrar a variação quando houver dado nos dois lados.
  const diasPeriodo = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
  const isoMenosDias = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00Z").getTime() - n * 86400000).toISOString().slice(0, 10);
  const prevEnd = isoMenosDias(start, 1);
  const prevStart = isoMenosDias(start, diasPeriodo);
  const { data: rowsAnterior } = useQuery({
    queryKey: ["monthly-metrics-anterior", clientId, prevStart, prevEnd],
    queryFn: () => getMonthlyMetrics(clientId, prevStart, prevEnd),
  });

  const { data: postsForAnalytics } = useQuery({
    queryKey: ["posts-analytics", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end),
  });

  function handleMonthlyClick(e: any) {
    if (e?.activeLabel) setSelectedDateMonthly(e.activeLabel);
  }
  function handleTrendClick(e: any) {
    if (e?.activeLabel) setSelectedDateTrend(e.activeLabel);
  }

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando métricas…</p>;
  }

  const data = rows ?? [];
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-sm"
        style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--text)" }}
      >
        <p>
          Sem dados sincronizados nesse período. Clique em sincronizar para buscar os números do Instagram, ou escolha
          outro intervalo de datas.
        </p>
        <div className="flex justify-end" style={{ marginTop: 12 }}>
          <SyncButton clientId={clientId} alvo="tudo" />
        </div>
      </div>
    );
  }

  const newFollowers = sum(data, "new_followers");
  const reach = sum(data, "reach");
  const saves = sum(data, "saves");
  const interactions = sum(data, "total_interactions");
  const contactTaps = sum(data, "profile_links_taps");
  const engagementRate = reach > 0 ? ((interactions / reach) * 100).toFixed(1) + "%" : "—";

  // Variação contra o período anterior: só aparece quando o anterior tem dado em pelo menos 80% dos dias
  // do atual. Como o Instagram guarda ~30 dias de histórico diário, na maioria dos casos ela ainda não existe.
  const ant = rowsAnterior ?? [];
  const temAnterior = ant.length >= Math.ceil(data.length * 0.8) && data.length >= 7;
  const variacao = (atual: number, antes: number): { sobe: boolean; texto: string } | null => {
    if (!temAnterior || antes <= 0) return null;
    const p = ((atual - antes) / antes) * 100;
    return { sobe: p >= 0, texto: `${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. período anterior` };
  };
  const vsNovos = variacao(newFollowers, sum(ant, "new_followers"));
  const vsAlcance = variacao(reach, sum(ant, "reach"));
  const vsSalvos = variacao(saves, sum(ant, "saves"));

  // Os números de cima somam só os dias que têm dado. O Instagram entrega cerca de
  // 30 dias de histórico diário, então em 90 dias (ou mais) o total costuma ser o
  // mesmo de 30: não há dia mais antigo para somar. Sem este aviso parece que o
  // cartão travou enquanto o gráfico muda.
  const datasDados = data.map((d) => d.date).sort();
  const primeiroDado = datasDados[0];
  const ultimoDado = datasDados[datasDados.length - 1];
  const diasDoPeriodo = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
  const diasSemDado = Math.max(0, diasDoPeriodo - data.length);
  const dd = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const avisoCobertura =
    diasSemDado >= 3
      ? `Os números acima somam os ${data.length} dias que têm dado (${dd(primeiroDado)} a ${dd(ultimoDado)}), e não os ${diasDoPeriodo} dias do período escolhido. Não há dado diário mais antigo que ${dd(primeiroDado)} para somar, por isso o total não muda quando o período é maior que isso.`
      : null;

  const chartData = data.map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    Interações: d.total_interactions ?? 0,
  }));

  const trendData = data.map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    "Seguidores ganhos": d.new_followers ?? 0,
  }));

  const formatInsight = computeFormatInsight(postsForAnalytics ?? []);
  const trendDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      // Relatório completo: todas as fontes do cliente, com o mesmo período da tela.
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start, end, periodLabel });
    } finally {
      setGeneratingReport(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="tudo" />
      </div>

      <ResumoDoMes
        clientId={clientId}
        start={start}
        end={end}
        periodLabel={periodLabel}
        posts={postsForAnalytics}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icone={UserPlus} cor="var(--s3)" rotulo="Novos seguidores" valor={newFollowers.toLocaleString("pt-BR")} tendencia={vsNovos} dica="só últimos 30 dias (limite do Instagram)" />
        <Kpi icone={Eye} cor="var(--s1)" rotulo="Alcance (soma dos dias)" valor={reach.toLocaleString("pt-BR")} tendencia={vsAlcance} dica="a mesma pessoa pode contar mais de um dia" />
        <Kpi icone={Activity} cor="var(--s2)" rotulo="Taxa de engajamento" valor={engagementRate} dica="interações ÷ alcance" />
        <Kpi icone={Bookmark} cor="var(--s7)" rotulo="Salvamentos" valor={saves.toLocaleString("pt-BR")} tendencia={vsSalvos} />
      </div>
      {avisoCobertura && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs" style={{ color: "var(--text-dim)", flex: "1 1 320px" }}>
            {avisoCobertura}
          </p>
          {isAdmin && <SyncButton clientId={clientId} alvo="historico" />}
        </div>
      )}

      {formatInsight && (
        <div className="grid grid-cols-2 gap-3">
          <Kpi
            icone={Trophy}
            cor="var(--good-text)"
            rotulo="Melhor formato"
            valor={fmtFormatKey(formatInsight.best.format)}
            dica={`${fmtNum(Math.round(formatInsight.best.median))} engaj. (mediana) · ${formatInsight.best.count} posts`}
          />
          <Kpi
            icone={TrendingDown}
            cor="var(--crit)"
            rotulo="Formato mais fraco"
            valor={fmtFormatKey(formatInsight.worst.format)}
            dica={`${fmtNum(Math.round(formatInsight.worst.median))} engaj. (mediana) · ${formatInsight.worst.count} posts`}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleDownloadReport}
        disabled={generatingReport}
        className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {generatingReport ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {generatingReport ? "Gerando PDF…" : "Baixar relatório PDF"}
      </button>

      <SinaisDeInteresse reach={reach} contactTaps={contactTaps} newFollowers={newFollowers} />

      <Painel icone={Gauge} cor="var(--s1)" titulo="Alcance e interações" resumo="Toque num ponto para ver o que foi publicado no dia">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} onClick={handleMonthlyClick} style={{ cursor: "pointer" }}>
            <defs>
              <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" tickFormatter={fmtNum} />
            <Tooltip labelFormatter={tickDate} formatter={(value: number) => fmtNum(value)} />
            <Area type="monotone" dataKey="Alcance" stroke="var(--accent)" fill="url(#reachFill)" />
            <Area type="monotone" dataKey="Interações" stroke="var(--good)" fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
        <DrillDownDoDia date={selectedDateMonthly} posts={postsForAnalytics ?? []} />
      </Painel>

      <Painel
        icone={LineIcon}
        cor="var(--s3)"
        titulo="Tendência geral"
        resumo="Alcance e seguidores ganhos lado a lado"
        ajuda={`${periodLabel}. Alcance e seguidores ganhos lado a lado, para ver o efeito de mudanças ao longo do tempo. Clique em um ponto para ver o que foi publicado naquele dia.`}
      >
        {trendData.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Sem histórico suficiente ainda.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} onClick={handleTrendClick} style={{ cursor: "pointer" }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 10 }} stroke="var(--text-faint)" interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--text-faint)" tickFormatter={fmtNum} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="var(--text-faint)" tickFormatter={fmtNum} />
              <Tooltip labelFormatter={tickDate} formatter={(value: number) => fmtNum(value)} />
              <Line yAxisId="left" type="monotone" dataKey="Alcance" stroke="var(--s1)" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="Seguidores ganhos" stroke="var(--s3)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        <DrillDownDoDia date={selectedDateTrend} posts={postsForAnalytics ?? []} />
      </Painel>

      <InsightDeFormato posts={postsForAnalytics ?? []} periodLabel={periodLabel} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EngajamentoPorFormato posts={postsForAnalytics ?? []} />
        <MelhoresHorarios posts={postsForAnalytics ?? []} periodLabel={periodLabel} />
      </div>
    </div>
  );
}
