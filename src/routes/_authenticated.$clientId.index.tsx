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
import { type Metrica } from "@/lib/resultado";
import { useResultado } from "@/hooks/use-resultado";
import { ROTULO_CONFIANCA } from "@/lib/insight";
import { DiagnosticoEstrategico } from "@/components/diagnostico-estrategico";
import {
  InsightCard,
  ListaLimitacoes,
  SeloStatus,
  BotaoAcao,
  OQueE,
  COR_TOM,
} from "@/components/insight-card";
import {
  NextBestActionCard,
  NextBestActionPanel,
  usePainelNBA,
} from "@/components/next-best-action";
import { ResumoDoMes } from "@/components/resumo-do-mes";
import { WorkspaceButton } from "@/components/workspace-ui";
import { RetornoInvestimento } from "@/components/retorno-investimento";
import { AcompanhamentoServico } from "@/components/acompanhamento-servico";
import { QualidadeDados } from "@/components/qualidade-dados";
import { fmtFormatKey } from "@/lib/report-metrics";
import { analyzeGrowth } from "@/lib/hub-conteudo";
import { completeInstagramPeriod } from "@/lib/report-period";
import { Link } from "@tanstack/react-router";
import { SyncButton } from "@/components/sync-button";
import { useAuth } from "@/hooks/use-auth";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";
import {
  brazilWeekdayAndHour,
  computeFormatBreakdown,
  computeFormatInsight,
  median,
} from "@/lib/report-metrics";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import {
  seguidoresNoPeriodo,
  confiancaPorPosts,
  MIN_POSTS_CONCLUSAO,
  ROTULO_AMOSTRA_PEQUENA,
  type DiaSeguidores,
} from "@/lib/metricas";
import {
  Eye,
  Target,
  Activity,
  Bookmark,
  Clock,
  Gauge,
  BarChart3,
  Download,
  Loader2,
  Lightbulb,
  UserPlus,
  MousePointerClick,
  Trophy,
  TrendingDown,
  LineChart as LineIcon,
  ChevronRight,
} from "lucide-react";
import { Painel, BarraFina, Miniatura, Kpi } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/")({
  component: MonthlyOverview,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
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

// Alcance e seguidores ficam só no cartão principal (um número de alcance por tela); aqui, o sinal de interesse.
function SinaisDeInteresse({ contactTaps }: { contactTaps: number }) {
  return (
    <Painel
      icone={MousePointerClick}
      cor="var(--s1)"
      titulo="Sinais de interesse"
      resumo="Toques nos botões de contato do perfil"
      ajuda="A Meta depreciou “visitas ao perfil” na API, então não dá mais para montar um funil real com % de conversão entre alcance, visita e contato. O alcance e os seguidores estão no cartão do topo."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          icone={MousePointerClick}
          cor="var(--s2)"
          rotulo="Toques em contato"
          valor={contactTaps.toLocaleString("pt-BR")}
          info="Endereço, ligar, e-mail e mensagem, somados de cada dia do período."
        />
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
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
            }}
          >
            <Miniatura
              url={p.thumbnail_url}
              formato={p.format}
              className="h-12 w-12"
            />
            <span className="min-w-0 flex-1">
              <span
                className="line-clamp-1 block font-medium"
                title={String(
                  (p.caption ?? p.windsor_media_id)
                    .split("\n")[0]
                    .slice(0, 90) ?? "",
                )}
              >
                {(p.caption ?? p.windsor_media_id).split("\n")[0].slice(0, 90)}
              </span>
              <span
                className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums"
                style={{ color: "var(--text-dim)" }}
              >
                <span>
                  {p.posted_at &&
                    new Date(p.posted_at).toLocaleDateString("pt-BR")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Eye size={12} /> {(p.reach ?? 0).toLocaleString("pt-BR")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Activity size={12} />{" "}
                  {(p.engagement ?? 0).toLocaleString("pt-BR")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bookmark size={12} />{" "}
                  {(p.saved ?? 0).toLocaleString("pt-BR")}
                </span>
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MelhoresHorarios({
  posts,
  periodLabel,
}: {
  posts: any[];
  periodLabel: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { ranked, overallMedian, poucosDados } = useMemo(() => {
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
      const entry = buckets.get(key) ?? {
        weekday,
        period,
        values: [],
        posts: [],
      };
      entry.values.push(p.engagement);
      entry.posts.push(p);
      buckets.set(key, entry);
    }
    const overallMedian = median(allEng);
    // Ranking só entre horários com amostra mínima (MIN_POSTS_CONCLUSAO); os outros vão para "poucos dados".
    const poucosDados = Array.from(buckets.values())
      .filter((b) => b.values.length < MIN_POSTS_CONCLUSAO)
      .map((b) => ({
        weekday: b.weekday,
        period: b.period,
        count: b.values.length,
        median: median(b.values),
      }))
      .sort((a, b) => b.count - a.count);
    const ranked = Array.from(buckets.entries())
      .filter(([, b]) => b.values.length >= MIN_POSTS_CONCLUSAO)
      .map(([key, b]) => ({
        key,
        weekday: b.weekday,
        period: b.period,
        count: b.values.length,
        median: median(b.values),
        posts: [...b.posts].sort(
          (a, c) => (c.engagement ?? 0) - (a.engagement ?? 0),
        ),
      }))
      .sort((a, b) => b.median - a.median)
      .slice(0, 5);
    return { ranked, overallMedian, poucosDados };
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
          Nenhum horário tem {MIN_POSTS_CONCLUSAO} posts ou mais no período, por
          isso nenhum é chamado de melhor. Os horários com menos posts estão
          abaixo.
        </p>
      ) : (
        <ul className="space-y-2">
          {ranked.map((r, idx) => {
            const vsMedian =
              overallMedian > 0
                ? ((r.median - overallMedian) / overallMedian) * 100
                : 0;
            const isOpen = expanded === r.key;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.key)}
                  className="block w-full rounded-lg border p-2.5 text-left"
                  style={{
                    borderColor: isOpen ? "var(--accent)" : "var(--border)",
                    background: "var(--surface)",
                  }}
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{
                          background:
                            idx === 0 ? "var(--warn)" : "var(--surface-2)",
                          color: idx === 0 ? "#1a1a19" : "var(--text-dim)",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <b className="truncate" title={String(r.weekday ?? "")}>
                        {r.weekday}
                      </b>
                      <span
                        className="truncate text-xs"
                        style={{ color: "var(--text-dim)" }}
                        title={String(r.period ?? "")}
                      >
                        {r.period}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold tabular-nums"
                      style={{
                        color:
                          vsMedian >= 0
                            ? "var(--good-text)"
                            : "var(--text-dim)",
                      }}
                    >
                      {vsMedian >= 0 ? "▲ +" : "▼ "}
                      {vsMedian.toFixed(0)}%
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <BarraFina
                        valor={r.median}
                        max={maxMediana}
                        cor="var(--s7)"
                      />
                    </span>
                    <span
                      className="shrink-0 text-xs tabular-nums"
                      style={{ color: "var(--text-dim)" }}
                    >
                      <b style={{ color: "var(--text)" }}>
                        {fmtNum(Math.round(r.median))}
                      </b>{" "}
                      · {r.count} posts
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="mt-2 rounded-lg border p-3"
                    style={{
                      background: "var(--accent-soft)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <p
                      className="mb-2 text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {r.count} post{r.count > 1 ? "s" : ""} em{" "}
                      {r.weekday.toLowerCase()}, {r.period.toLowerCase()}:
                      engajamento{" "}
                      {vsMedian >= 0
                        ? vsMedian.toFixed(0) + "% acima"
                        : Math.abs(vsMedian).toFixed(0) + "% abaixo"}{" "}
                      da mediana da conta ({fmtNum(Math.round(overallMedian))}).
                    </p>
                    <PostList posts={r.posts} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {poucosDados.length > 0 && (
        <div className="mt-4">
          <p
            className="mb-1.5 text-xs font-semibold"
            style={{ color: "var(--ink-2)" }}
          >
            Poucos dados ({ROTULO_AMOSTRA_PEQUENA}: menos de{" "}
            {MIN_POSTS_CONCLUSAO} posts, sem ranking)
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {poucosDados.map((b) => (
              <li
                key={`${b.weekday}-${b.period}`}
                className="rounded-full border px-2.5 py-0.5 text-xs"
                style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}
              >
                {b.weekday} · {b.period.toLowerCase()} · {b.count}{" "}
                {b.count === 1 ? "post" : "posts"} ·{" "}
                {fmtNum(Math.round(b.median))} engaj.
              </li>
            ))}
          </ul>
        </div>
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
    <Painel
      icone={BarChart3}
      cor="var(--s3)"
      titulo="Engajamento por formato"
      resumo="Mediana de cada formato"
    >
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Sem posts suficientes ainda.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="formato"
              tick={{ fontSize: 11 }}
              stroke="var(--text-faint)"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--text-faint)"
              tickFormatter={fmtNum}
            />
            <Tooltip formatter={(value: number) => fmtNum(value)} />
            <Bar
              dataKey="Engajamento (mediana)"
              fill="var(--s3)"
              radius={[4, 4, 0, 0]}
            />
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
function InsightDeFormato({
  posts,
  periodLabel,
}: {
  posts: any[];
  periodLabel: string;
}) {
  const insight = useMemo(() => computeFormatInsight(posts), [posts]);

  if (!insight) return null;
  const { best, worst, bestPct, worstPct } = insight;

  return (
    <div
      className="flex gap-3 rounded-xl border p-4 text-sm leading-relaxed"
      style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
    >
      <Lightbulb
        size={18}
        aria-hidden
        className="mt-0.5 shrink-0"
        style={{ color: "var(--warn)" }}
      />
      <span>
        {periodLabel}, <strong>{fmtFormatLabel(best.format)}</strong> foi o
        formato mais forte — engajamento (mediana) de{" "}
        {fmtNum(Math.round(best.median))} ({best.count} posts),{" "}
        {bestPct >= 0 ? "+" : ""}
        {bestPct.toFixed(0)}% acima da mediana geral da conta.
        {worst.format !== best.format && (
          <>
            {" "}
            <strong>{fmtFormatLabel(worst.format)}</strong> ficou{" "}
            {Math.abs(worstPct).toFixed(0)}% abaixo ({worst.count} posts) — vale
            revisar frequência ou abordagem nesse formato.
          </>
        )}
      </span>
    </div>
  );
}

// Painel de "por que esse alcance": lista os posts publicados no dia
// clicado no gráfico logo acima — fica colado nele, sem precisar rolar.
function DrillDownDoDia({
  date,
  posts,
}: {
  date: string | null;
  posts: any[];
}) {
  if (!date) return null;

  const dayPosts = posts
    .filter((p) => p.posted_at && p.posted_at.slice(0, 10) === date)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  return (
    <div
      className="mt-3 rounded-lg border p-3"
      style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
    >
      <h3
        className="mb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-faint)" }}
      >
        O que aconteceu em{" "}
        {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}
      </h3>
      {dayPosts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhuma publicação identificada nesta data. O alcance e as interações
          podem incluir conteúdos anteriores que continuaram a circular.
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
    <article
      className="flex flex-col rounded-xl border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        borderTop: c ? `3px solid ${c.borda}` : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--text-dim)" }}
        >
          {m.rotulo}
        </h3>
        {m.status ? (
          <SeloStatus tom={m.status} texto={m.selo} />
        ) : (
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            sem referência
          </span>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums leading-tight">
        {m.valor}
      </div>
      {m.statusTexto && (
        <div
          className="mt-1 text-xs font-medium"
          style={{ color: c?.cor ?? "var(--text-dim)" }}
        >
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
          {m.fonte ? (
            <span className="mt-1 block" style={{ color: "var(--text-faint)" }}>
              Fonte da referência: {m.fonte}
            </span>
          ) : null}
        </OQueE>
      </div>
      {m.rota && m.botao && (
        <div className="mt-auto pt-3">
          <BotaoAcao
            texto={m.botao}
            rota={m.rota}
            clientId={clientId}
            variante="secundario"
          />
        </div>
      )}
    </article>
  );
}

function Secao({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}
        >
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
  const [selectedDateMonthly, setSelectedDateMonthly] = useState<string | null>(
    null,
  );
  const [selectedDateTrend, setSelectedDateTrend] = useState<string | null>(
    null,
  );
  const [generatingReport, setGeneratingReport] = useState(false);
  const [analisesAbertas, setAnalisesAbertas] = useState(false);
  const painel = usePainelNBA();

  const {
    r,
    hoje,
    fim,
    diasPeriodo,
    metricas,
    anterior,
    posts,
    periodoIg,
    fontes,
  } = useResultado(clientId, start, end);
  void hoje;

  if (metricas.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border p-5 space-y-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h2 className="font-semibold">Não foi possível carregar o resumo</h2>
        <p className="text-sm">
          Os indicadores estão indisponíveis no momento. Você pode tentar
          novamente ou continuar pelas outras ferramentas do menu.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void metricas.refetch()}
          disabled={metricas.isFetching}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (metricas.isLoading || !r) {
    return (
      <div
        className="mx-auto w-full max-w-5xl space-y-4"
        aria-busy="true"
        aria-label="Carregando"
      >
        {[120, 96, 220].map((h, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl"
            style={{ height: h, background: "var(--surface-2)" }}
          />
        ))}
      </div>
    );
  }

  // ---------- KPIs executivos: definições ORIGINAIS da tela (inalteradas) ----------
  const data = metricas.data ?? [];
  const ant = anterior.data ?? [];
  const semInstagram = data.length === 0;
  const newFollowers = sum(data, "new_followers");
  const cresc = analyzeGrowth(
    data as {
      date: string;
      new_followers?: number | null;
      unfollowers?: number | null;
    }[],
    start,
    fim,
  );
  // Métricas que a Meta só entrega para até 30 dias (alcance único, salvamentos por data da ação, novos seguidores)
  // só aparecem quando o período é de até 30 dias. Em períodos maiores, a versão "soma dos dias", com rótulo.
  const periodo30 = diasPeriodo <= 30;
  const meta = periodo30
    ? completeInstagramPeriod(periodoIg.data?.dados, start, fim)
    : null;
  const saldoTotal = seguidoresNoPeriodo(data as DiaSeguidores[], start, fim);
  const taxaUnica =
    meta?.alcance_unico && meta.interacoes != null
      ? ((meta.interacoes / meta.alcance_unico) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%"
      : null;
  const sinal = (n: number) =>
    `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("pt-BR")}`;
  // Bruto, saídas e líquido com a MESMA cobertura (dias fechados que têm os dois números). O bruto de
  // todos os dias continua informado, com a sua própria cobertura, para não sumir com dado.
  const novosKpi = cresc.diasMedidos ? cresc.novos : newFollowers;
  const dicaSeguidores = cresc.diasMedidos
    ? `bruto em ${cresc.diasMedidos} dias com ganhos e saídas medidos · saíram ${cresc.saidas.toLocaleString("pt-BR")} · líquido ${sinal(cresc.liquido)}${newFollowers !== cresc.novos ? ` · somando também dias sem saída medida: ${newFollowers.toLocaleString("pt-BR")}` : ""}`
    : "bruto de todos os dias com dado · saídas ainda não medidas neste período";
  const reach = sum(data, "reach");
  const saves = sum(data, "saves");
  const interactions = sum(data, "total_interactions");
  const contactTaps = sum(data, "profile_links_taps");
  const engagementRate =
    reach > 0 ? ((interactions / reach) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%" : "—";
  // Comparação com o período anterior: só com 80%+ dos dias com alcance dos dois lados e 7+ dias.
  const diasReach = data.filter((d) => d.reach != null).length;
  const temAnterior =
    ant.filter((d) => d.reach != null).length >= Math.ceil(diasReach * 0.8) &&
    diasReach >= 7;
  const variacao = (
    atual: number,
    antes: number,
  ): { sobe: boolean; texto: string } | null => {
    if (!temAnterior || antes <= 0) return null;
    const p = ((atual - antes) / antes) * 100;
    return {
      sobe: p >= 0,
      texto: `${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. período anterior`,
    };
  };
  const vsNovos = variacao(newFollowers, sum(ant, "new_followers"));
  const vsAlcance = variacao(reach, sum(ant, "reach"));
  const vsSalvos = variacao(saves, sum(ant, "saves"));
  const dd = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const datasDados = data
    .filter((d) => d.reach != null)
    .map((d) => d.date)
    .sort();
  const diasSemDado = Math.max(0, diasPeriodo - datasDados.length);
  const avisoCobertura =
    diasSemDado >= 3 && datasDados.length
      ? `Os números somam os ${datasDados.length} dias que têm dado (${dd(datasDados[0])} a ${dd(datasDados[datasDados.length - 1])}), e não os ${diasPeriodo} dias do período escolhido. Não há dado diário mais antigo que ${dd(datasDados[0])} para somar, por isso o total não muda quando o período é maior que isso.`
      : null;

  const chartData = data
    .filter((d) => d.reach != null)
    .map((d) => ({
      date: d.date,
      Alcance: d.reach ?? 0,
      Interações: d.total_interactions ?? 0,
    }));
  const trendData = data
    .filter((d) => d.reach != null)
    .map((d) => ({
      date: d.date,
      Alcance: d.reach ?? 0,
      "Seguidores ganhos": d.new_followers ?? 0,
    }));
  const formatInsight = computeFormatInsight(posts.data ?? []);

  const oportunidades = r.semana.length
    ? r.semana
    : r.insights.filter((i) => i.acao).slice(0, 3);
  const principal = r.proximaAcao ?? oportunidades[0] ?? null;
  const outras = oportunidades.filter((i) => i !== principal).slice(0, 2);
  const cv = r.veredito.tom === "neutro" ? null : COR_TOM[r.veredito.tom];
  const alertasCriticos = r.cobertura.alertas;

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      const { gerarEBaixarRelatorioCompleto } =
        await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({
        clientId,
        start,
        end: fim,
        periodLabel,
      });
    } finally {
      setGeneratingReport(false);
    }
  }

  function abrirAnalises() {
    setAnalisesAbertas(true);
    requestAnimationFrame(() =>
      document
        .getElementById("todas-analises")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const explicacao = {
    seguidores:
      "Fonte: Instagram (métrica diária “seguidores ganhos”). Fórmula: soma dos novos seguidores de cada dia do período, sem descontar quem saiu (igual ao número do Instagram). Limitação: quem saiu só é medido nos dias já fechados (a Meta leva cerca de 2 dias para fechar o dia).",
    alcance:
      meta?.alcance_unico != null
        ? `Fonte: Instagram, “Contas alcançadas” do período (${dd(meta.de)} a ${dd(meta.ate)}${meta.recortado ? ", últimos 30 dias do período" : ""}). Conta pessoas únicas. Limitação: a Meta só calcula para até 30 dias; a soma dos alcances diários (${reach.toLocaleString("pt-BR")}) é maior porque repete pessoas.`
        : "Fonte: Instagram, alcance de cada dia. Fórmula: soma dos alcances diários. Limitação: a mesma pessoa conta de novo em cada dia em que viu o perfil, por isso passa do “Contas alcançadas” do Instagram.",
    engajamento: taxaUnica
      ? "Fórmula da casa (a Meta não publica taxa): interações ÷ alcance único do período × 100. Interações = curtidas, comentários, salvamentos e compartilhamentos. Referência de mercado: mLabs Brasil ~4,5% (2025)."
      : "Fórmula da casa (a Meta não publica taxa): interações ÷ soma dos alcances diários × 100. Fica menor que a taxa sobre o alcance único. Referência de mercado: mLabs Brasil ~4,5% (2025), calculada sobre alcance único.",
    salvamentos:
      meta?.salvamentos != null
        ? `Fonte: Instagram, salvamentos por data da ação (${dd(meta.de)} a ${dd(meta.ate)}), igual ao Instagram. Salvar indica que o conteúdo foi útil a ponto de querer rever.`
        : "Fonte: Instagram, soma dos salvamentos de cada dia. Salvar indica que o conteúdo foi útil a ponto de querer rever.",
  };

  return (
    <div className="nexo-results-overview mx-auto w-full max-w-5xl space-y-6">
      {/* Dado com erro na origem: muda a leitura de tudo abaixo, por isso vem antes. */}
      <QualidadeDados clientId={clientId} compacto />

      <RetornoInvestimento clientId={clientId} start={start} end={fim} />
      <section className="space-y-4" aria-label="Resultados do Instagram">
        <header className="ws-section-heading">
          <div>
            <h2>Resultados do Instagram</h2>
            <p>
              {periodLabel} · Fonte: Instagram. Consulte a definição de cada indicador no ícone de informação.
            </p>
          </div>
        </header>
        {semInstagram ? (
          <div
            className="rounded-xl border p-5 text-sm"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
            }}
          >
            <p style={{ color: "var(--ink)" }}>
              Sem dado do Instagram neste período, por isso os indicadores de
              alcance, seguidores, engajamento e salvamentos não aparecem.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SyncButton clientId={clientId} alvo="tudo" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {periodo30 ? (
              <Kpi
                icone={UserPlus}
                cor="var(--s3)"
                rotulo="Novos seguidores (bruto)"
                valor={novosKpi.toLocaleString("pt-BR")}
                tendencia={cresc.diasMedidos ? undefined : vsNovos}
                dica={dicaSeguidores}
                info={`${dicaSeguidores}. ${explicacao.seguidores}`}
              />
            ) : (
              <Kpi
                icone={UserPlus}
                cor="var(--s3)"
                rotulo="Seguidores: saldo no período"
                valor={
                  saldoTotal.saldoTotal != null
                    ? sinal(saldoTotal.saldoTotal)
                    : "—"
                }
                dica={
                  saldoTotal.saldoTotal != null
                    ? "variação do total de seguidores do primeiro ao último dia com dado"
                    : "sem o total de seguidores no começo e no fim do período"
                }
                info="Total de seguidores no último dia com dado menos o total no primeiro. Novos seguidores e saídas só aparecem em períodos de até 30 dias: o Instagram não entrega esses números para trás."
              />
            )}
            {meta?.alcance_unico != null ? (
              <Kpi
                icone={Eye}
                cor="var(--s1)"
                rotulo="Alcance (contas únicas)"
                valor={meta.alcance_unico.toLocaleString("pt-BR")}
                dica={`igual ao “Contas alcançadas” do Instagram, ${dd(meta.de)} a ${dd(meta.ate)}`}
                info={explicacao.alcance}
              />
            ) : (
              <Kpi
                icone={Eye}
                cor="var(--s1)"
                rotulo="Alcance (soma dos dias)"
                valor={reach.toLocaleString("pt-BR")}
                tendencia={vsAlcance}
                dica="a mesma pessoa conta em cada dia em que viu o perfil"
                info={explicacao.alcance}
              />
            )}
            <Kpi
              icone={Activity}
              cor="var(--s2)"
              rotulo="Taxa de engajamento"
              valor={taxaUnica ?? engagementRate}
              dica={
                taxaUnica
                  ? "interações ÷ alcance único"
                  : "interações ÷ soma dos alcances diários"
              }
              info={explicacao.engajamento}
            />
            <Kpi
              icone={Bookmark}
              cor="var(--s7)"
              rotulo="Salvamentos"
              valor={(meta?.salvamentos ?? saves).toLocaleString("pt-BR")}
              tendencia={meta?.salvamentos != null ? undefined : vsSalvos}
              dica={
                meta?.salvamentos != null
                  ? `por data da ação, igual ao Instagram (${dd(meta.de)} a ${dd(meta.ate)})`
                  : "soma dos salvamentos de cada dia"
              }
              info={explicacao.salvamentos}
            />
          </div>
        )}

        <WorkspaceButton variant="secondary" onClick={abrirAnalises}>
          Ver todas as análises do período{" "}
          <ChevronRight size={16} aria-hidden />
        </WorkspaceButton>
      </section>

      <AcompanhamentoServico clientId={clientId} produto="hub" />

      {/* Avisos que mudam a leitura dos números ficam sempre visíveis. */}
      {alertasCriticos.length > 0 && (
        <div className="space-y-2" role="status">
          {alertasCriticos.map((a, i) => (
            <p
              key={i}
              className="rounded-lg border px-3 py-2 text-sm"
              style={{
                background: COR_TOM[a.tom].fundo,
                borderColor: COR_TOM[a.tom].borda,
                color: "var(--ink)",
              }}
            >
              {a.texto}
            </p>
          ))}
        </div>
      )}


      {/* ===== CAMADA 1: primeira dobra ===== */}
      <section className="space-y-4" aria-label="Por onde começar">
        <header className="ws-section-heading">
          <div>
            <h2>O que merece atenção nos resultados</h2>
            <p>A equipe Doctor Creator confere estes sinais e define a ação. As entregas para revisão estão no acompanhamento acima.</p>
          </div>
        </header>
        {principal ? (
          <NextBestActionCard
            insight={principal}
            destaque
            onAbrir={() => painel.abrir(principal)}
          />
        ) : (
          <div className="ws-priority ws-priority-empty">
            <span className="ws-priority-symbol" aria-hidden>
              <Target size={24} />
            </span>
            <h3>Sem recomendação para este período</h3>
            <p>
              Os dados deste período ainda não sustentam uma recomendação.
              Confira as fontes e consulte as prioridades identificadas para a
              equipe.
            </p>
            <Link
              to="/$clientId/proximas-acoes"
              params={{ clientId }}
              search={dateRangeState}
              className="ws-action ws-action--primary"
            >
              Ver prioridades da equipe <ChevronRight size={18} aria-hidden />
            </Link>
          </div>
        )}

        <div className="ws-workflow-foot">
          {principal && (
            <Link
              to="/$clientId/proximas-acoes"
              params={{ clientId }}
              search={dateRangeState}
            >
              Ver prioridades da equipe <ChevronRight size={16} aria-hidden />
            </Link>
          )}
          <Link
            to="/$clientId/ideias"
            params={{ clientId }}
            search={dateRangeState}
          >
            Preparar os próximos conteúdos{" "}
            <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      </section>

      {/* ===== CAMADAS 2 e 3: todas as análises (nada removido; só recolhido) ===== */}
      <section
        id="todas-analises"
        className="rounded-xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setAnalisesAbertas(!analisesAbertas)}
          aria-expanded={analisesAbertas}
          className="flex min-h-[56px] w-full items-center justify-between gap-2 px-4 text-left sm:px-5"
        >
          <span>
            <span className="block text-[18px] font-semibold">
              Todas as análises do período
            </span>
            <span className="block text-sm" style={{ color: "var(--muted)" }}>
              O que aconteceu, por que, sinais de interesse, gráficos, formatos,
              horários e limitações
            </span>
          </span>
          <ChevronRight
            size={20}
            aria-hidden
            style={{ transform: analisesAbertas ? "rotate(90deg)" : undefined }}
          />
        </button>
        {analisesAbertas && (
          <div
            className="space-y-6 border-t px-4 pb-5 pt-5 sm:px-5"
            style={{ borderColor: "var(--border)" }}
          >
            <DiagnosticoEstrategico
              clientId={clientId}
              start={start}
              fim={fim}
              resultado={r}
              diario={(metricas.data as any[]) ?? []}
              diarioAnterior={(anterior.data as any[]) ?? undefined}
              posts={(posts.data as any[]) ?? []}
            />

            {/* ===== Segunda dobra ===== */}
            {outras.length > 0 && (
              <section className="space-y-3" aria-labelledby="outras-op">
                <h2 id="outras-op" className="text-[18px] font-semibold">
                  Outras oportunidades
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {outras.map((i) => (
                    <NextBestActionCard
                      key={i.id}
                      insight={i}
                      onAbrir={() => painel.abrir(i)}
                    />
                  ))}
                </div>
                <Link
                  to="/$clientId/oportunidades"
                  params={{ clientId }}
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  Ver todas as oportunidades (
                  {r.insights.filter((i) => i.acao).length}){" "}
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </section>
            )}

            <section className="space-y-3" aria-labelledby="resumo-exec">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="resumo-exec" className="text-[18px] font-semibold">
                  Resumo do período
                </h2>
                {r.veredito.tom !== "neutro" && (
                  <SeloStatus
                    tom={r.veredito.tom}
                    texto={r.veredito.titulo.split(":")[0].replace(/\.$/, "")}
                  />
                )}
              </div>
              <div
                className="rounded-xl border p-4 sm:p-5"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderLeft: cv ? `4px solid ${cv.borda}` : undefined,
                }}
              >
                <p
                  className="text-[15px] font-semibold"
                  style={{ color: "var(--ink)" }}
                >
                  {r.veredito.titulo}
                </p>
                {r.resumo.length > 0 && (
                  <ul
                    className="mt-2 space-y-1 text-[15px] leading-relaxed"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {r.resumo.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <BotaoAcao
                  texto="Analisar conteúdo e audiência"
                  rota="/$clientId/conteudo"
                  clientId={clientId}
                  variante="secundario"
                />
                <BotaoAcao
                  texto={
                    fontes.data?.tem_crm
                      ? "Analisar o funil comercial"
                      : "Ver anúncios"
                  }
                  rota={
                    fontes.data?.tem_crm
                      ? "/$clientId/crm-painel"
                      : "/$clientId/anuncios"
                  }
                  clientId={clientId}
                  variante="secundario"
                />
                <BotaoAcao
                  texto="Preparar relatório"
                  rota="/$clientId/relatorio"
                  clientId={clientId}
                  variante="secundario"
                />
              </div>
            </section>

            <ResumoDoMes
              clientId={clientId}
              start={start}
              end={fim}
              periodLabel={periodLabel}
              posts={posts.data}
            />

            {r.insights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[18px] font-semibold">
                  O que ajuda a explicar o resultado
                </h3>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {r.insights.map((i) => (
                    <InsightCard key={i.id} insight={i} clientId={clientId} />
                  ))}
                </div>
              </div>
            )}

            {r.metricas.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[18px] font-semibold">
                  Indicadores com referência de mercado
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {r.metricas.map((m) => (
                    <MetricaCard key={m.id} m={m} clientId={clientId} />
                  ))}
                </div>
                <p className="text-[13px]" style={{ color: "var(--muted)" }}>
                  Bom, na média ou abaixo só aparecem quando existe referência
                  de mercado com metodologia publicada. Sem referência, compare
                  com o período anterior.
                </p>
              </div>
            )}

            {!semInstagram && (
              <>
                <SinaisDeInteresse contactTaps={contactTaps} />

                {/* O aviso de histórico curto fica uma vez só, na faixa do topo; aqui só o botão de buscar histórico. */}
                {avisoCobertura && isAdmin && (
                  <div className="flex justify-end">
                    <SyncButton clientId={clientId} alvo="historico" />
                  </div>
                )}

                {formatInsight && (
                  <div className="grid grid-cols-2 gap-3">
                    <Kpi
                      icone={Trophy}
                      cor="var(--good-text)"
                      rotulo="Melhor formato"
                      valor={fmtFormatKey(formatInsight.best.format)}
                      dica={`${fmtNum(Math.round(formatInsight.best.median))} engaj. (mediana) · ${formatInsight.best.count} posts · ${ROTULO_CONFIANCA[confiancaPorPosts(formatInsight.best.count)].toLowerCase()}`}
                    />
                    <Kpi
                      icone={TrendingDown}
                      cor="var(--crit)"
                      rotulo="Formato mais fraco"
                      valor={fmtFormatKey(formatInsight.worst.format)}
                      dica={`${fmtNum(Math.round(formatInsight.worst.median))} engaj. (mediana) · ${formatInsight.worst.count} posts · ${ROTULO_CONFIANCA[confiancaPorPosts(formatInsight.worst.count)].toLowerCase()}`}
                    />
                  </div>
                )}

                <Painel
                  icone={Gauge}
                  cor="var(--s1)"
                  titulo="Alcance e interações"
                  resumo="Toque num ponto para ver o que foi publicado no dia"
                >
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart
                        data={chartData}
                        onClick={(e: any) =>
                          e?.activeLabel &&
                          setSelectedDateMonthly(e.activeLabel)
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <defs>
                          <linearGradient
                            id="reachFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="var(--accent)"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="100%"
                              stopColor="var(--accent)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="date"
                          tickFormatter={tickDate}
                          tick={{ fontSize: 12 }}
                          stroke="var(--muted)"
                          interval="preserveStartEnd"
                          minTickGap={24}
                        />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          stroke="var(--muted)"
                          tickFormatter={fmtNum}
                          width={48}
                        />
                        <Tooltip
                          labelFormatter={tickDate}
                          formatter={(value: number) => fmtNum(value)}
                        />
                        <Area
                          type="monotone"
                          dataKey="Alcance"
                          stroke="var(--accent)"
                          fill="url(#reachFill)"
                        />
                        <Area
                          type="monotone"
                          dataKey="Interações"
                          stroke="var(--good)"
                          fillOpacity={0}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <DrillDownDoDia
                    date={selectedDateMonthly}
                    posts={posts.data ?? []}
                  />
                </Painel>

                <Painel
                  icone={LineIcon}
                  cor="var(--s3)"
                  titulo="Tendência geral"
                  resumo="Alcance e seguidores ganhos lado a lado"
                  ajuda={`${periodLabel}. Alcance e seguidores ganhos lado a lado, para ver o efeito de mudanças ao longo do tempo. Clique em um ponto para ver o que foi publicado naquele dia.`}
                >
                  {trendData.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                      Sem histórico suficiente ainda.
                    </p>
                  ) : (
                    <div className="min-w-0">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={trendData}
                          onClick={(e: any) =>
                            e?.activeLabel &&
                            setSelectedDateTrend(e.activeLabel)
                          }
                          style={{ cursor: "pointer" }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--grid)"
                          />
                          <XAxis
                            dataKey="date"
                            tickFormatter={tickDate}
                            tick={{ fontSize: 12 }}
                            stroke="var(--muted)"
                            interval="preserveStartEnd"
                            minTickGap={24}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 12 }}
                            stroke="var(--muted)"
                            tickFormatter={fmtNum}
                            width={48}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 12 }}
                            stroke="var(--muted)"
                            tickFormatter={fmtNum}
                            width={40}
                          />
                          <Tooltip
                            labelFormatter={tickDate}
                            formatter={(value: number) => fmtNum(value)}
                          />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="Alcance"
                            stroke="var(--s1)"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="Seguidores ganhos"
                            stroke="var(--s3)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <DrillDownDoDia
                    date={selectedDateTrend}
                    posts={posts.data ?? []}
                  />
                </Painel>

                <InsightDeFormato
                  posts={posts.data ?? []}
                  periodLabel={periodLabel}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <EngajamentoPorFormato posts={posts.data ?? []} />
                  <MelhoresHorarios
                    posts={posts.data ?? []}
                    periodLabel={periodLabel}
                  />
                </div>
              </>
            )}

            <ListaLimitacoes itens={r.limitacoes} />

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={generatingReport}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-60"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                }}
              >
                {generatingReport ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {generatingReport ? "Gerando PDF…" : "Baixar relatório PDF"}
              </button>
              <SyncButton clientId={clientId} alvo="tudo" />
            </div>
          </div>
        )}
      </section>

      <NextBestActionPanel
        insight={painel.aberto}
        clientId={clientId}
        onFechar={painel.fechar}
      />
    </div>
  );
}
