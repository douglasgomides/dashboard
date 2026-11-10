import { memo, useCallback, useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import "@/styles/nexo-resultados.css";
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
import { RetornoInvestimento } from "@/components/retorno-investimento";
import { AcompanhamentoServico } from "@/components/acompanhamento-servico";
import { QualidadeDados } from "@/components/qualidade-dados";
import { fmtFormatKey } from "@/lib/report-metrics";
import { completeInstagramPeriod } from "@/lib/report-period";
import { SyncButton } from "@/components/sync-button";
import { useAuth } from "@/hooks/use-auth";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";
import {
  brazilWeekdayAndHour,
  computeFormatBreakdown,
  computeFormatInsight,
  fmtTaxaPct,
  median,
  taxaDoPost,
} from "@/lib/report-metrics";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";
import {
  saldoSeguidores,
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
  Trophy,
  TrendingDown,
  LineChart as LineIcon,
  ChevronRight,
  PieChart,
  CalendarDays,
} from "lucide-react";
import { Miniatura, InfoDica } from "@/components/visual";
import {
  NxCard,
  NxSectionHeader,
  NxKpi,
  NxTag,
  NxHBar,
  NxListRow,
  NxColunas,
  NxLinhaTempo,
  NxPizza,
  NxMedidor,
  type NxSerie,
} from "@/components/nx";

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

const SEM_POSTS: any[] = [];

function sum(rows: { [k: string]: any }[], key: string) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function tickDate(d: string) {
  return d.slice(5);
}

// Ícones dos números no tamanho do ladrilho da prancha (17 px, traço 1,7).
const ic = (Icon: typeof Eye) => <Icon size={17} strokeWidth={1.7} aria-hidden />;

// Lista compacta de posts, reutilizada no drill-down de dia e na
// justificativa de "melhor horário" — sempre com link pro post real, nunca
// só um número solto.
const PostList = memo(function PostList({ posts }: { posts: any[] }) {
  return (
    <ul className="nx-lista">
      {posts.map((p) => {
        const titulo = String((p.caption ?? p.windsor_media_id).split("\n")[0].slice(0, 90) ?? "");
        return (
          <li key={p.id}>
            <NxListRow
              href={p.permalink ?? "#"}
              inicio={<Miniatura url={p.thumbnail_url} formato={p.format} className="h-12 w-12" />}
              titulo={titulo}
              sub={
                <>
                  <span>{p.posted_at && new Date(p.posted_at).toLocaleDateString("pt-BR")}</span>
                  <span>
                    <Eye size={12} aria-label="Alcance" /> {(p.reach ?? 0).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    <Activity size={12} aria-label="Interações" /> {(p.engagement ?? 0).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    <Bookmark size={12} aria-label="Salvamentos" /> {(p.saved ?? 0).toLocaleString("pt-BR")}
                  </span>
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
});

const MelhoresHorarios = memo(function MelhoresHorarios({
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
    // Taxa de interação (interações ÷ alcance) e não engajamento absoluto: o absoluto mede alcance.
    for (const p of posts) {
      const taxa = taxaDoPost(p);
      if (!p.posted_at || taxa == null) continue;
      allEng.push(taxa);
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
      entry.values.push(taxa);
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
          (a, c) => (taxaDoPost(c) ?? 0) - (taxaDoPost(a) ?? 0),
        ),
      }))
      .sort((a, b) => b.median - a.median)
      .slice(0, 5);
    return { ranked, overallMedian, poucosDados };
  }, [posts]);

  const maxMediana = Math.max(0.0001, ...ranked.map((r) => r.median));
  return (
    <NxCard
      icone={ic(Clock)}
      titulo="Melhores horários para postar"
      subtitulo="Toque numa linha para ver os posts"
      acao={
        <InfoDica
          rotulo="Como ler este painel"
          texto={`${periodLabel}, pela taxa de interação do post típico (interações ÷ alcance, mediana; horário de Brasília). A taxa não depende de quanto alcance ou anúncio o post recebeu. Clique numa linha para ver os posts que sustentam o número.`}
        />
      }
    >
      {ranked.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum horário tem {MIN_POSTS_CONCLUSAO} posts ou mais no período, por
          isso nenhum é chamado de melhor. Os horários com menos posts estão
          abaixo.
        </p>
      ) : (
        <ul className="nx-hbars">
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
                  className={`nx-row nx-horario${isOpen ? " nx-row--ativa" : ""}`}
                  aria-expanded={isOpen}
                >
                  <span className="nx-row__corpo">
                    <NxHBar
                      i={idx}
                      pct={(r.median / maxMediana) * 100}
                      rotulo={
                        <>
                          <span className={`nx-rank${idx === 0 ? " nx-rank--1" : ""}`}>{idx + 1}</span>
                          <b className="truncate font-medium" title={String(r.weekday ?? "")}>
                            {r.weekday}
                          </b>
                          <span className="truncate text-xs" style={{ color: "var(--muted)" }} title={String(r.period ?? "")}>
                            {r.period}
                          </span>
                        </>
                      }
                      valor={
                        <>
                          <b style={{ color: "var(--text)", fontWeight: 500 }}>{fmtTaxaPct(r.median)}</b> · {r.count} posts{" "}
                          <NxTag tom={vsMedian >= 0 ? "up" : "g"} seta={vsMedian >= 0 ? "cima" : "baixo"}>
                            {vsMedian >= 0 ? "+" : ""}
                            {vsMedian.toFixed(0)}%
                          </NxTag>
                        </>
                      }
                    />
                  </span>
                </button>
                {isOpen && (
                  <div className="nx-abre">
                    <p
                      className="mb-2 text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {r.count} post{r.count > 1 ? "s" : ""} em{" "}
                      {r.weekday.toLowerCase()}, {r.period.toLowerCase()}:
                      taxa de interação de {fmtTaxaPct(r.median)}, contra{" "}
                      {fmtTaxaPct(overallMedian)} da conta.
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
        <div>
          <p
            className="mb-2 text-xs font-medium"
            style={{ color: "var(--ink-2)" }}
          >
            Poucos dados ({ROTULO_AMOSTRA_PEQUENA}: menos de{" "}
            {MIN_POSTS_CONCLUSAO} posts, sem ranking)
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {poucosDados.map((b) => (
              <li key={`${b.weekday}-${b.period}`}>
                <NxTag tom="gl">
                  {b.weekday} · {b.period.toLowerCase()} · {b.count}{" "}
                  {b.count === 1 ? "post" : "posts"} ·{" "}
                  {fmtTaxaPct(b.median)} de taxa
                </NxTag>
              </li>
            ))}
          </ul>
        </div>
      )}
    </NxCard>
  );
});

const fmtPctEixo = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const EngajamentoPorFormato = memo(function EngajamentoPorFormato({ todos }: { todos: ReturnType<typeof computeFormatBreakdown> }) {
  const { data, poucos, melhor } = useMemo(() => {
    const data = todos
      .filter((f) => !f.amostraPequena && f.taxaMediana != null)
      .map((f) => {
        const valor = Math.round((f.taxaMediana ?? 0) * 1000) / 10;
        return {
          rotulo: f.formato,
          valor,
          texto: `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
        };
      });
    let melhor = 0;
    data.forEach((d, i) => {
      if (d.valor > data[melhor].valor) melhor = i;
    });
    return { data, poucos: todos.filter((f) => f.amostraPequena), melhor };
  }, [todos]);

  return (
    <NxCard
      icone={ic(BarChart3)}
      titulo="Taxa de interação por formato"
      subtitulo="Interações ÷ alcance, post típico de cada formato"
      acao={
        <InfoDica
          rotulo="Como ler este painel"
          texto={`Compara a taxa (interações ÷ alcance) e não o engajamento total, para um formato que recebeu mais alcance ou anúncio não parecer melhor só por isso. Formato com menos de ${MIN_POSTS_CONCLUSAO} posts no período não ganha barra.`}
        />
      }
    >
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum formato tem {MIN_POSTS_CONCLUSAO} posts ou mais com alcance no
          período.
        </p>
      ) : (
        <NxColunas
          dados={data}
          destaque={melhor}
          formatarEixo={fmtPctEixo}
          rotulo="Taxa de interação (mediana) por formato"
        />
      )}
      {poucos.length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          {ROTULO_AMOSTRA_PEQUENA[0].toUpperCase() + ROTULO_AMOSTRA_PEQUENA.slice(1)}, sem barra:{" "}
          {poucos.map((f) => `${f.formato} (${f.count} ${f.count === 1 ? "post" : "posts"})`).join(", ")}.
        </p>
      )}
    </NxCard>
  );
});

// Quantos posts de cada formato o período teve: a contagem que sustenta as taxas ao lado.
const PostsPorFormato = memo(function PostsPorFormato({ todos }: { todos: ReturnType<typeof computeFormatBreakdown> }) {
  const fatias = useMemo(
    () => [...todos].sort((a, b) => b.count - a.count).map((f) => ({ rotulo: `${f.formato} (${f.count})`, valor: f.count })),
    [todos],
  );
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  return (
    <NxCard icone={ic(PieChart)} titulo="Posts por formato" subtitulo={`${total.toLocaleString("pt-BR")} ${total === 1 ? "post publicado" : "posts publicados"} no período`}>
      {total === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post publicado no período.
        </p>
      ) : (
        <NxPizza fatias={fatias} rotulo="Posts por formato" />
      )}
    </NxCard>
  );
});

function fmtFormatLabel(key: string) {
  return key === "não classificado" ? key : formatLabel(key as ContentFormat);
}

// Resumo em texto corrido do que os números dizem — em vez de só mostrar a
// tabela/gráfico crus, nomeia o melhor e o pior formato com os números que
// sustentam a afirmação. Não sugere o que postar, só descreve o que já
// aconteceu.
function InsightDeFormato({
  insight,
  periodLabel,
}: {
  insight: ReturnType<typeof computeFormatInsight>;
  periodLabel: string;
}) {
  if (!insight) return null;
  const { best, worst, empate, overallMedian } = insight;

  return (
    <div className="nx-aviso nx-sobe">
      <span className="nx-tile nx-tile--suave" aria-hidden>
        <Lightbulb size={17} strokeWidth={1.7} />
      </span>
      {empate ? (
        <span>
          {periodLabel}, os formatos tiveram taxa de interação parecida:{" "}
          <strong>{fmtFormatLabel(best.format)}</strong> com{" "}
          {fmtTaxaPct(best.median)} ({best.count} posts) e{" "}
          <strong>{fmtFormatLabel(worst.format)}</strong> com{" "}
          {fmtTaxaPct(worst.median)} ({worst.count} posts). Se um formato
          parece engajar mais, é porque alcançou mais gente, não porque o
          conteúdo prende mais.
        </span>
      ) : (
        <span>
          {periodLabel}, <strong>{fmtFormatLabel(best.format)}</strong> teve a
          maior taxa de interação (interações ÷ alcance, mediana):{" "}
          {fmtTaxaPct(best.median)} em {best.count} posts, contra{" "}
          {fmtTaxaPct(overallMedian)} da conta.
          {worst.format !== best.format && (
            <>
              {" "}
              <strong>{fmtFormatLabel(worst.format)}</strong> ficou com{" "}
              {fmtTaxaPct(worst.median)} ({worst.count} posts): vale testar
              outra abordagem nesse formato antes de deixar de usá-lo.
            </>
          )}
        </span>
      )}
    </div>
  );
}

// Painel de "por que esse alcance": lista os posts publicados no dia
// clicado no gráfico logo acima — fica colado nele, sem precisar rolar.
const DrillDownDoDia = memo(function DrillDownDoDia({
  date,
  posts,
}: {
  date: string | null;
  posts: any[];
}) {
  const dayPosts = useMemo(
    () =>
      date
        ? posts
            .filter((p) => p.posted_at && p.posted_at.slice(0, 10) === date)
            .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
        : SEM_POSTS,
    [date, posts],
  );
  if (!date) return null;

  return (
    <div className="nx-abre">
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
});

function MetricaCard({ m, clientId, i }: { m: Metrica; clientId: string; i: number }) {
  const c = m.status ? COR_TOM[m.status] : null;
  return (
    <article
      className="nx-kpi nx-sobe nx-metrica"
      style={{ ["--i" as string]: i, borderTop: c ? `3px solid ${c.borda}` : undefined }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="nx-kpi__rotulo text-[15px] font-medium leading-5">
          {m.rotulo}
        </h3>
        {m.status ? (
          <SeloStatus tom={m.status} texto={m.selo} />
        ) : (
          <NxTag tom="g">sem referência</NxTag>
        )}
      </div>
      <div>
        <div className="nx-metrica__valor">{m.valor}</div>
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
      </div>
      <div>
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
        <div className="mt-auto">
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

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const resultado = useResultado(clientId, start, end);
  const { r, metricas } = resultado;

  if (metricas.isError) {
    return (
      <div
        role="alert"
        className="nx-card space-y-3"
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
        className="w-full space-y-4"
        aria-busy="true"
        aria-label="Carregando"
      >
        {[120, 96, 220].map((h, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[18px]"
            style={{ height: h, background: "var(--surface-2)" }}
          />
        ))}
      </div>
    );
  }

  return <Resultados clientId={clientId} start={start} end={end} resultado={resultado} />;
}

function Resultados({
  clientId,
  start,
  end,
  resultado,
}: {
  clientId: string;
  start: string;
  end: string;
  resultado: ReturnType<typeof useResultado>;
}) {
  const { isAdmin } = useAuth();
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
    hoje,
    fim,
    diasPeriodo,
    metricas,
    anterior,
    posts,
    periodoIg,
  } = resultado;
  const r = resultado.r!;
  void hoje;

  // ---------- KPIs executivos: definições ORIGINAIS da tela (inalteradas) ----------
  const data = (metricas.data ?? SEM_POSTS) as any[];
  const ant = (anterior.data ?? SEM_POSTS) as any[];
  const postsData = (posts.data as any[]) ?? SEM_POSTS;
  const semInstagram = data.length === 0;
  // Métricas que a Meta só entrega para até 30 dias (alcance único, salvamentos por data da ação, novos seguidores)
  // só aparecem quando o período é de até 30 dias. Em períodos maiores, a versão "soma dos dias", com rótulo.
  const periodo30 = diasPeriodo <= 30;

  // Tudo o que deriva das linhas do período, calculado uma vez por mudança de dado (não a cada abrir/fechar).
  const k = useMemo(() => {
    const meta = periodo30
      ? completeInstagramPeriod(periodoIg.data?.dados, start, fim)
      : null;
    // Seguidores: um número só, o saldo líquido (mesma régua do cartão do resumo, do PDF e do WhatsApp).
    const saldo = saldoSeguidores(data as DiaSeguidores[], start, fim);
    const taxaUnica =
      meta?.alcance_unico && meta.interacoes != null
        ? ((meta.interacoes / meta.alcance_unico) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%"
        : null;
    const reach = sum(data, "reach");
    const saves = sum(data, "saves");
    const interactions = sum(data, "total_interactions");
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
    ): { sobe: boolean; percentual: string; contexto: string } | null => {
      if (!temAnterior || antes <= 0) return null;
      const p = ((atual - antes) / antes) * 100;
      return {
        sobe: p >= 0,
        percentual: `${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
        contexto: "vs. período anterior",
      };
    };
    const vsAlcance = variacao(reach, sum(ant, "reach"));
    const vsSalvos = variacao(saves, sum(ant, "saves"));
    const comDado = data.filter((d) => d.reach != null);
    const datasDados = comDado.map((d) => d.date).sort();
    const diasSemDado = Math.max(0, diasPeriodo - datasDados.length);
    const avisoCobertura =
      diasSemDado >= 3 && datasDados.length
        ? `Os números somam os ${datasDados.length} dias que têm dado (${dd(datasDados[0])} a ${dd(datasDados[datasDados.length - 1])}), e não os ${diasPeriodo} dias do período escolhido. Não há dado diário mais antigo que ${dd(datasDados[0])} para somar, por isso o total não muda quando o período é maior que isso.`
        : null;
    // Séries dos dois gráficos (os mesmos dias com alcance de antes).
    const datas = comDado.map((d) => d.date as string);
    const serieAlcance: NxSerie[] = [
      { rotulo: "Alcance", valores: comDado.map((d) => d.reach ?? 0), cor: "var(--b1)", area: true },
      { rotulo: "Interações", valores: comDado.map((d) => d.total_interactions ?? 0), cor: "var(--b3)" },
    ];
    const serieTendencia: NxSerie[] = [
      { rotulo: "Alcance", valores: serieAlcance[0].valores, cor: "var(--b2)" },
      { rotulo: "Seguidores ganhos", valores: comDado.map((d) => d.new_followers ?? 0), cor: "var(--b3)", eixo: "dir" },
    ];
    return { meta, saldo, taxaUnica, reach, saves, engagementRate, vsAlcance, vsSalvos, datasDados, diasSemDado, avisoCobertura, datas, serieAlcance, serieTendencia };
  }, [periodo30, periodoIg.data, start, fim, data, ant, diasPeriodo]);
  const { meta, saldo, taxaUnica, reach, saves, engagementRate, vsAlcance, vsSalvos, datasDados, diasSemDado, avisoCobertura } = k;

  const sinal = (n: number) =>
    `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("pt-BR")}`;
  const formatInsight = useMemo(() => computeFormatInsight(postsData), [postsData]);
  const formatos = useMemo(() => computeFormatBreakdown(postsData), [postsData]);

  const oportunidades = r.semana.length
    ? r.semana
    : r.insights.filter((i) => i.acao).slice(0, 3);
  const principal = r.proximaAcao ?? oportunidades[0] ?? null;
  const outras = oportunidades.filter((i) => i !== principal).slice(0, 2);
  const cv = r.veredito.tom === "neutro" ? null : COR_TOM[r.veredito.tom];
  const alertasCriticos = r.cobertura.alertas;
  const selecionarMensal = useCallback((d: string) => setSelectedDateMonthly(d), []);
  const selecionarTendencia = useCallback((d: string) => setSelectedDateTrend(d), []);

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

  const explicacao = {
    seguidores:
      "Fonte: Instagram (total de seguidores de cada dia; sem ele, seguidores ganhos e perdidos de cada dia). É o mesmo número do relatório em PDF e do texto do WhatsApp. Limitação: a Meta leva cerca de 2 dias para fechar o dia, então os últimos dias ainda podem mudar.",
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
  const info = (rotulo: string, texto: string) => <InfoDica texto={texto} rotulo={`Sobre ${rotulo}`} />;
  const rotuloAlcance = meta?.alcance_unico != null ? "Alcance (contas únicas)" : "Alcance (soma dos dias)";
  const dicaFormato = (f: { median: number; count: number }) =>
    `${fmtTaxaPct(f.median)} de taxa de interação (mediana) · ${f.count} posts · ${ROTULO_CONFIANCA[confiancaPorPosts(f.count)].toLowerCase()}`;
  const pctCobertura = diasPeriodo > 0 ? Math.round((datasDados.length / diasPeriodo) * 100) : 0;

  return (
    <div className="nexo-results-overview w-full space-y-[18px]">
      {/* Dado com erro na origem: muda a leitura de tudo abaixo, por isso vem antes. */}
      <QualidadeDados clientId={clientId} compacto />

      <RetornoInvestimento clientId={clientId} start={start} end={fim} />

      <NxCard
        rotulo="Resultados do Instagram"
        nivel={2}
        titulo="Resultados do Instagram"
        subtitulo={`${periodLabel} · Instagram`}
      >
        {semInstagram ? (
          <div className="nx-vazio text-sm">
            <p style={{ color: "var(--ink)" }}>
              Sem dado do Instagram neste período, por isso os indicadores de
              alcance, seguidores, engajamento e salvamentos não aparecem.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SyncButton clientId={clientId} alvo="tudo" />
            </div>
          </div>
        ) : (
          <div className="nx-grade nx-grade--4">
            <NxKpi
              i={0}
              icone={ic(UserPlus)}
              rotulo="Seguidores: saldo no período"
              valor={saldo.saldo != null ? sinal(saldo.saldo) : "sem dado"}
              info={info("Seguidores: saldo no período", `${saldo.detalhe} ${explicacao.seguidores}`)}
            />
            <NxKpi
              i={1}
              icone={ic(Eye)}
              rotulo={rotuloAlcance}
              valor={(meta?.alcance_unico ?? reach).toLocaleString("pt-BR")}
              variacao={meta?.alcance_unico != null ? undefined : vsAlcance}
              info={info(rotuloAlcance, explicacao.alcance)}
            />
            <NxKpi
              i={2}
              icone={ic(Activity)}
              rotulo="Taxa de interação"
              valor={taxaUnica ?? engagementRate}
              info={info("Taxa de interação", explicacao.engajamento)}
            />
            <NxKpi
              i={3}
              icone={ic(Bookmark)}
              rotulo="Salvamentos"
              valor={(meta?.salvamentos ?? saves).toLocaleString("pt-BR")}
              variacao={meta?.salvamentos != null ? undefined : vsSalvos}
              info={info("Salvamentos", explicacao.salvamentos)}
            />
          </div>
        )}
      </NxCard>

      <AcompanhamentoServico clientId={clientId} produto="hub" />

      {/* Avisos que mudam a leitura dos números ficam sempre visíveis. */}
      {alertasCriticos.length > 0 && (
        <div className="space-y-2" role="status">
          {alertasCriticos.map((a, i) => (
            <p
              key={i}
              className="nx-alerta text-sm"
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
        <NxSectionHeader
          titulo="O que merece atenção nos resultados"
          subtitulo="A equipe Doctor Creator confere estes sinais e define a ação. As entregas para revisão estão no acompanhamento acima."
        />
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
          </div>
        )}
      </section>

      {/* ===== CAMADAS 2 e 3: todas as análises (nada removido; só recolhido) ===== */}
      <section id="todas-analises" className="nx-card nx-card--plano nx-analises">
        <button
          type="button"
          onClick={() => setAnalisesAbertas(!analisesAbertas)}
          aria-expanded={analisesAbertas}
          className="nx-analises__botao"
        >
          <span className="nx-tile" aria-hidden>
            {ic(LineIcon)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] font-medium leading-6">
              Todas as análises do período
            </span>
            <span className="block text-sm" style={{ color: "var(--muted)" }}>
              O que aconteceu, por que, sinais de interesse, gráficos, formatos,
              horários e limitações
            </span>
          </span>
          <span className="nx-sq" aria-hidden>
            <ChevronRight
              size={20}
              style={{ transform: analisesAbertas ? "rotate(90deg)" : undefined }}
            />
          </span>
        </button>
        {analisesAbertas && (
          <div className="nx-analises__corpo">
            <DiagnosticoEstrategico
              clientId={clientId}
              start={start}
              fim={fim}
              resultado={r}
              diario={(metricas.data as any[]) ?? []}
              diarioAnterior={(anterior.data as any[]) ?? undefined}
              posts={postsData}
            />

            {/* ===== Segunda dobra ===== */}
            {outras.length > 0 && (
              <section className="space-y-3" aria-labelledby="outras-op">
                <NxSectionHeader nivel={2} id="outras-op" titulo="Outras oportunidades" />
                <div className="nx-grade nx-grade--2">
                  {outras.map((i) => (
                    <NextBestActionCard
                      key={i.id}
                      insight={i}
                      onAbrir={() => painel.abrir(i)}
                    />
                  ))}
                </div>
              </section>
            )}

            <NxCard
              id="resumo-exec"
              nivel={2}
              titulo="Resumo do período"
              acao={
                r.veredito.tom !== "neutro" ? (
                  <SeloStatus
                    tom={r.veredito.tom}
                    texto={r.veredito.titulo.split(":")[0].replace(/\.$/, "")}
                  />
                ) : undefined
              }
            >
              <div
                className="nx-veredito"
                style={{ borderLeftColor: cv ? cv.borda : undefined }}
              >
                <p
                  className="text-[15px] font-medium"
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
            </NxCard>

            <ResumoDoMes
              clientId={clientId}
              start={start}
              end={fim}
              periodLabel={periodLabel}
              posts={posts.data}
            />

            {r.insights.length > 0 && (
              <div className="space-y-3">
                <NxSectionHeader nivel={3} titulo="O que ajuda a explicar o resultado" />
                <div className="nx-grade nx-grade--2">
                  {r.insights.map((i) => (
                    <InsightCard key={i.id} insight={i} clientId={clientId} />
                  ))}
                </div>
              </div>
            )}

            {r.metricas.length > 0 && (
              <div className="space-y-3">
                <NxSectionHeader
                  nivel={3}
                  titulo="Indicadores com referência de mercado"
                  subtitulo="Bom, na média ou abaixo só aparecem quando existe referência de mercado com metodologia publicada. Sem referência, compare com o período anterior."
                />
                <div className="nx-grade nx-grade--3">
                  {r.metricas.map((m, i) => (
                    <MetricaCard key={m.id} m={m} clientId={clientId} i={i} />
                  ))}
                </div>
              </div>
            )}

            {!semInstagram && (
              <>
                {/* O aviso de histórico curto fica uma vez só, na faixa do topo; aqui só o botão de buscar histórico. */}
                {avisoCobertura && isAdmin && (
                  <div className="flex justify-end">
                    <SyncButton clientId={clientId} alvo="historico" />
                  </div>
                )}

                {formatInsight && !formatInsight.empate && (
                  <div className="nx-grade nx-grade--2">
                    <NxKpi
                      i={0}
                      icone={ic(Trophy)}
                      rotulo="Melhor formato"
                      valor={fmtFormatKey(formatInsight.best.format)}
                      titulo={dicaFormato(formatInsight.best)}
                      nota={dicaFormato(formatInsight.best)}
                    />
                    <NxKpi
                      i={1}
                      icone={ic(TrendingDown)}
                      rotulo="Formato mais fraco"
                      valor={fmtFormatKey(formatInsight.worst.format)}
                      titulo={dicaFormato(formatInsight.worst)}
                      nota={dicaFormato(formatInsight.worst)}
                    />
                  </div>
                )}

                <div className="nx-grade nx-grade--2">
                  <NxCard
                    icone={ic(Gauge)}
                    titulo="Alcance e interações"
                    subtitulo="Toque num ponto para ver o que foi publicado no dia"
                  >
                    <NxLinhaTempo
                      datas={k.datas}
                      series={k.serieAlcance}
                      selecionado={selectedDateMonthly}
                      onSelecionar={selecionarMensal}
                      formatarData={tickDate}
                      formatarValor={fmtNum}
                      rotulo="Alcance e interações por dia"
                      altura={220}
                    />
                    <DrillDownDoDia
                      date={selectedDateMonthly}
                      posts={postsData}
                    />
                  </NxCard>

                  <NxCard
                    icone={ic(LineIcon)}
                    titulo="Tendência geral"
                    subtitulo="Alcance e seguidores ganhos lado a lado"
                    acao={
                      <InfoDica
                        rotulo="Como ler este painel"
                        texto={`${periodLabel}. Alcance e seguidores ganhos lado a lado, para ver o efeito de mudanças ao longo do tempo. Clique em um ponto para ver o que foi publicado naquele dia.`}
                      />
                    }
                  >
                    {k.datas.length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                        Sem histórico suficiente ainda.
                      </p>
                    ) : (
                      <NxLinhaTempo
                        datas={k.datas}
                        series={k.serieTendencia}
                        selecionado={selectedDateTrend}
                        onSelecionar={selecionarTendencia}
                        formatarData={tickDate}
                        formatarValor={fmtNum}
                        rotulo="Alcance e seguidores ganhos por dia"
                        altura={220}
                      />
                    )}
                    <DrillDownDoDia
                      date={selectedDateTrend}
                      posts={postsData}
                    />
                  </NxCard>
                </div>

                <InsightDeFormato
                  insight={formatInsight}
                  periodLabel={periodLabel}
                />
                <div className="nx-grade nx-grade--2">
                  <EngajamentoPorFormato todos={formatos} />
                  <PostsPorFormato todos={formatos} />
                </div>
                <div className="nx-grade nx-grade--2">
                  <MelhoresHorarios
                    posts={postsData}
                    periodLabel={periodLabel}
                  />
                  <NxCard
                    icone={ic(CalendarDays)}
                    titulo="Dias com dado do Instagram"
                    subtitulo={`${datasDados.length} de ${diasPeriodo} dias do período`}
                  >
                    <NxMedidor
                      rotulo="Dias do período com dado do Instagram"
                      centro={`${pctCobertura}%`}
                      legendaCentro="dos dias com dado"
                      segmentos={[
                        { rotulo: `Com dado (${datasDados.length})`, valor: datasDados.length, cor: "var(--b2)" },
                        { rotulo: `Sem dado (${diasSemDado})`, valor: diasSemDado, cor: "var(--line-2)" },
                      ]}
                    />
                  </NxCard>
                </div>
              </>
            )}

            <ListaLimitacoes itens={r.limitacoes} />

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={handleDownloadReport}
                disabled={generatingReport}
                className="nx-botao disabled:opacity-60"
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

function dd(iso: string) {
  return iso.slice(8, 10) + "/" + iso.slice(5, 7);
}
