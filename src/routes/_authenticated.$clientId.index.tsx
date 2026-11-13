import { Fragment, memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import "@/styles/nexo-resultados.css";
import { useResultado } from "@/hooks/use-resultado";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import { useResultadosDiarios, type CampoDiario } from "@/hooks/use-resultados-diarios";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { NxDescobertas, NxMaisDescobertas, NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxAneis } from "@/components/nx/aneis";
import { NxAgoraContraAntes } from "@/components/nx/agora-contra-antes";
import { BotaoFechamentoDoMes, NxHistoriaDoMes } from "@/components/nx/historia-do-mes";
import { cartoesDoMes, periodoServeParaFechamento, type PostDoMes } from "@/lib/fechamento-do-mes";
import { descobertaDaAcao, fontesDoCliente, montarEntradaDaHoje, type DadosDaEntradaDaHoje } from "@/lib/leitura/entrada-da-hoje";
import { acoesDaHoje, type FonteDoDado } from "@/lib/leitura/fatos-hoje";
import { dePacientesDoPeriodo } from "@/lib/funil-desenhado";
import { analyzeGrowth } from "@/lib/hub-conteudo";
import { statusDoCliente } from "@/lib/saude-fontes";
import { NxAcaoPilula, NxBarras, NxCartaoNumero } from "@/components/nx/cartoes";
import { linhaDaRota } from "@/components/nx/hoje";
import type { DateRangeState } from "@/lib/date-range";
import { useClientRole } from "@/hooks/use-client-role";
import { ehEquipe } from "@/lib/registro-de-telas";
import type { SerieDiaria } from "@/components/nx/linha-de-30-dias";
import { serieContinua } from "@/lib/linha-30-dias";
import { textoDaFrase, visiveisEResto } from "@/lib/leitura/cinco-segundos";
import { cabecaDaSerieDiaria } from "@/lib/leitura/cabeca-do-bloco";
import { descobertasDaLeitura, juntarDescobertas, periodoDoVerTudo } from "@/lib/leitura/leitura-em-descobertas";
import { cabecaDasAnalises, cabecaDasExplicacoes, cabecaDoDinheiro, cabecaDoInstagramDoPeriodo, cabecaDoRetorno } from "@/lib/leitura/ver-tudo-resultados";
import { aneisDeResultados, cartoesDeDinheiro, descobertasDeResultados, linhasAgoraContraAntes, medidasDoInstagram, retornoDaEntrada, vereditoDeResultados, type CartaoDeDinheiro, type ChaveDoFunil, type EntradaCincoResultados, type LinhaDoInstagram } from "@/lib/leitura/cinco-resultados";
import { NxAviso, NxCarregando, NxErro, NxRecolhido } from "@/components/nx/blocos";
import { fatosDeResultadosComAreas, funilDosNumeros, periodosDeComparacao, somaDiaria, somaDiariaComCobertura, variacaoPct } from "@/lib/leitura/fatos-resultados";
import { resumirClinica } from "@/lib/leitura/resumo-clinica";
import { ROTULO_RESPONSAVEL, ROTULO_TOM, type Insight, type Limitacao, type Responsavel, type Tom } from "@/lib/insight";
import { ROTULO_CONFIANCA } from "@/lib/insight";
import type { Resultado, Metrica } from "@/lib/resultado";
import { grauDeCautela, montarDiagnostico, type IdDiag } from "@/lib/diagnostico-estrategico";
import { montarRoi, numerosDisponiveisRoi, situacaoAnuncios, situacaoCrm, NOTA_DEFASAGEM, AVISO_MUDANCA_ROI, type DadosRoi } from "@/lib/roi";
import { ROTULO_SELO, type Selo } from "@/lib/selo";
import { AVISO_CRM_ZERO } from "@/lib/resultado";
import { textoNaoMedido, avisoNaoMedido, avisoAgendouMenosQueFechou, coberturaDoNumero, avisoCrmCompartilhado as avisoCrmDePessoas, type Numero, type PacientesPeriodo } from "@/lib/pacientes";
import { getClient, getRoiPeriodo, getAdsDiagnosticoPorObjetivo, getAdsPorDia, getAdsResumo } from "@/lib/client-data";
import { usePautas } from "@/components/planejador-conteudo";
import { ROTULO_FORMATO } from "@/lib/pauta";
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
import { fmtNum, fmtBRL } from "@/lib/format";
import {
  saldoSeguidores,
  confiancaPorPosts,
  MIN_POSTS_CONCLUSAO,
  ROTULO_AMOSTRA_PEQUENA,
  type DiaSeguidores,
} from "@/lib/metricas";
import {
  Eye,
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
  PieChart,
  CalendarDays,
  MessageCircle,
  ClipboardCheck,
  Wallet,
  Coins,
  Compass,
} from "lucide-react";
import { Miniatura, InfoDica } from "@/components/visual";
import {
  NxCard,
  NxKpi,
  NxTag,
  NxHBar,
  NxListRow,
  NxColunas,
  NxLinhaTempo,
  NxPizza,
  NxMedidor,
  type NxSerie,
  type NxTom,
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

// ---------- Resultados da clínica: molde novo (Phase 3.1, plano 03) ----------
// Topo: o resumo da clínica em 3 linhas (a única leitura da tela), 4 cartões de número e um gráfico. Tudo o que antes
// competia no topo (prioridade recomendada, as 8 respostas, o resumo do período, o que merece atenção) está no detalhe.

const CAMPOS_FUNIL = ["mandaram_mensagem", "agendaram", "fecharam"] as const;
const fmt = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("pt-BR"));
const dd = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const TOM_NX: Record<Tom, NxTom> = { bom: "up", atencao: "or", ruim: "dn" };
const SELO_TOM: Record<Selo["nivel"], NxTom> = { confiavel: "up", parcial: "or", ilegivel: "g" };

/** Quem resolve cada resposta do diagnóstico (a resposta não traz responsável próprio). */
const QUEM_DA_RESPOSTA: Record<IdDiag, Responsavel> = {
  melhorou: "social_media",
  piorou: "social_media",
  oportunidade: "social_media",
  risco: "equipe_hub",
  proxima: "equipe_hub",
  pauta: "social_media",
  campanha: "gestor_trafego",
  faltante: "equipe_hub",
};

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const resultado = useResultado(clientId, start, end);
  const { r, metricas, hoje, fim } = resultado;

  // Pessoas, histórico diário e retorno do investimento: os mesmos dados (e as mesmas chaves de cache) de Pacientes do
  // período e do antigo bloco do retorno. Nada de consulta nova para a leitura.
  const pessoas = usePacientesPeriodo(clientId, start, end);
  const comparacao = periodosDeComparacao(start, end, hoje);
  const diario = useResultadosDiarios(clientId, start, end);
  const diarioAnterior = useResultadosDiarios(clientId, comparacao.anterior.start, comparacao.anterior.end);
  const roi = useQuery({ queryKey: ["roi-periodo", clientId, start, fim], queryFn: () => getRoiPeriodo(clientId, start, fim), staleTime: 5 * 60_000, retry: false });
  // Gasto e custo: a mesma leitura de uma linha (rpc ads_resumo) que a Hoje faz, com as mesmas chaves de cache (consulta compartilhada),
  // e os anúncios por dia com a chave idêntica à de useResultado (nenhuma consulta a mais).
  const adsAtual = useQuery({ queryKey: ["ads-resumo", clientId, start, comparacao.fimFechado], queryFn: () => getAdsResumo(clientId, start, comparacao.fimFechado), staleTime: 5 * 60_000, retry: false });
  const adsAnterior = useQuery({ queryKey: ["ads-resumo", clientId, comparacao.anterior.start, comparacao.anterior.end], queryFn: () => getAdsResumo(clientId, comparacao.anterior.start, comparacao.anterior.end), staleTime: 5 * 60_000, retry: false });
  const adsDia = useQuery({ queryKey: ["ads-dia", clientId, start, fim], queryFn: () => getAdsPorDia(clientId, start, fim), staleTime: 5 * 60_000, retry: false });
  const carregandoFontes = pessoas.isPending || diario.isPending || diarioAnterior.isPending || roi.isPending || adsAtual.isPending || adsAnterior.isPending || adsDia.isPending;
  // O nome da clínica só abre o cartão de abertura do Fechamento do mês: a mesma chave de cache da Hoje e da casca (consulta compartilhada).
  const cliente = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId), staleTime: 5 * 60_000, retry: false });
  // O estado das fontes só entra na EntradaHoje das "3 apostas" (a mesma chave da Hoje e do selo de frescura da casca: consulta compartilhada,
  // uma linha pequena por fonte quando a cache está fria).
  const estadoDasFontes = useQuery({ queryKey: ["client-sync-status", clientId], queryFn: () => statusDoCliente(clientId), staleTime: 60_000, retry: false });
  const fontesDoEstado = useMemo(() => fontesDoCliente(estadoDasFontes.data), [estadoDasFontes.data]);

  const funil = useMemo(() => {
    // Quantos dias de cada número foram medidos no período atual: a soma só entra na comparação com 80% dos dias (a mesma regra
    // de somaDiaria); abaixo disso a tela diz "medido em N de M dias" (D-01) em vez de "Falta dado".
    const comCobertura = somaDiariaComCobertura((diario.data ?? []).filter((l) => l.dia <= comparacao.fimFechado), comparacao.dias, CAMPOS_FUNIL);
    const atual: Record<string, number | null> = {};
    const cobertura: NonNullable<EntradaCincoResultados["cobertura"]> = {};
    for (const k of CAMPOS_FUNIL) {
      const c = comCobertura[k];
      atual[k] = c.completo ? c.valor : null;
      cobertura[k] = { medidos: c.medidos, de: c.de };
    }
    const antes = somaDiaria(diarioAnterior.data ?? [], comparacao.dias, CAMPOS_FUNIL);
    return { funil: funilDosNumeros({ dados: pessoas.data ?? null, somaAtual: atual, somaAntes: antes, coberturaAtual: comCobertura }), atual, antes, cobertura };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pessoas.data, diario.data, diarioAnterior.data, start, end, hoje]);

  // Leitura do período: calculada na hora, no navegador, só do que as telas já carregam (sem consulta nova, sem IA).
  const leitura = useMemo(() => {
    if (!r) return null;
    const feitos = fatosDeResultadosComAreas({ resultado: r, de: start, ate: end, hoje, funil: funil.funil, roi: roi.data ?? null });
    const passos = [feitos.fatos.proximoPasso, ...feitos.fatos.outrosPassos].filter((p) => p != null);
    return { fatos: feitos.fatos, resumo: resumirClinica({ fatos: feitos.fatos, porArea: feitos.porArea, passos }) };
  }, [r, start, end, hoje, funil.funil, roi.data]);

  // Fechamento do mês (D-06): uma história em tela cheia sobre esta mesma tela, sem rota nova. Fica aqui (e não em Resultados) porque, quando o
  // período escolhido não é um mês, o botão leva ao preset de 30 dias e a tela recarrega: o pedido precisa sobreviver a essa troca.
  const navegar = useNavigate();
  const [historia, setHistoria] = useState<"fechada" | "pedida" | "aberta">("fechada");
  const serveParaFechamento = periodoServeParaFechamento(start, end);
  const pronta = !!r && !!leitura && !metricas.isLoading && !carregandoFontes;
  useEffect(() => {
    if (historia === "pedida" && serveParaFechamento && pronta) setHistoria("aberta");
  }, [historia, serveParaFechamento, pronta]);
  const pedirFechamento = useCallback(() => {
    if (serveParaFechamento) {
      setHistoria("aberta");
      return;
    }
    setHistoria("pedida");
    void navegar({ to: "/$clientId", params: { clientId }, search: { preset: "30d" } });
  }, [serveParaFechamento, navegar, clientId]);
  const fecharFechamento = useCallback(() => setHistoria("fechada"), []);

  const cabecalho = {
    tela: "resultados" as const,
    titulo: "Resultados da clínica",
    pergunta: "Como a clínica foi no período?",
    decisao: "D5" as const,
    meta: <span>{formatRangeLabel({ start, end })}</span>,
  };

  if (metricas.isError) {
    return (
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={null} carregando={false} erro="Os indicadores estão indisponíveis." tela="resultados" />}
        leitura={null}
        corpo={<NxErro texto="Não foi possível carregar o resumo. Os indicadores estão indisponíveis no momento." onTentar={() => void metricas.refetch()} />}
      />
    );
  }

  if (metricas.isLoading || !r || !leitura) {
    return <PaginaNexo {...cabecalho} veredito={<NxVeredito veredito={null} carregando tela="resultados" />} leitura={null} corpo={<NxCarregando linhas={4} />} />;
  }

  return (
    <Resultados
      clientId={clientId}
      start={start}
      end={end}
      resultado={resultado}
      cabecalho={cabecalho}
      leitura={leitura}
      carregandoFontes={carregandoFontes}
      pessoas={pessoas.data ?? null}
      roi={roi.data ?? null}
      linhasDia={diario.data ?? []}
      variacoes={{ atual: funil.atual, antes: funil.antes, cobertura: funil.cobertura }}
      comparacao={{ dias: comparacao.dias, fimFechado: comparacao.fimFechado, anterior: comparacao.anterior }}
      ads={{ atual: adsAtual.data ?? null, anterior: adsAnterior.data ?? null, porDia: adsDia.data ?? null }}
      fechamento={{ aberto: historia === "aberta", serve: serveParaFechamento, pedir: pedirFechamento, fechar: fecharFechamento, nome: cliente.data?.name ?? null, funil, fontes: fontesDoEstado }}
    />
  );
}

type Cabecalho = { tela: "resultados"; titulo: string; pergunta: string; decisao: "D5"; meta: ReactNode };

function Resultados({
  clientId,
  start,
  end,
  resultado,
  cabecalho,
  leitura,
  carregandoFontes,
  pessoas,
  roi,
  linhasDia,
  variacoes,
  comparacao,
  ads,
  fechamento,
}: {
  clientId: string;
  start: string;
  end: string;
  resultado: ReturnType<typeof useResultado>;
  cabecalho: Cabecalho;
  leitura: { fatos: ReturnType<typeof fatosDeResultadosComAreas>["fatos"]; resumo: ReturnType<typeof resumirClinica> };
  carregandoFontes: boolean;
  pessoas: PacientesPeriodo | null;
  roi: DadosRoi | null;
  linhasDia: ({ dia: string } & Record<CampoDiario, number | null>)[];
  variacoes: { atual: Record<string, number | null>; antes: Record<string, number | null>; cobertura?: EntradaCincoResultados["cobertura"] };
  comparacao: { dias: number; fimFechado: string; anterior: { start: string; end: string } };
  /** As linhas cruas do banco (ads_resumo e ads_por_dia): os números chegam como texto ou número, e o que falta chega null. */
  ads: { atual: unknown; anterior: unknown; porDia: unknown };
  /** O Fechamento do mês: se a história está aberta, se o período escolhido já serve, e como pedir e fechar. */
  fechamento: { aberto: boolean; serve: boolean; pedir: () => void; fechar: () => void; nome: string | null; funil: DadosDaEntradaDaHoje["funil"]; fontes: readonly FonteDoDado[] };
}) {
  const { isAdmin } = useAuth();
  const periodLabel = formatRangeLabel({ start, end });
  const [selectedDateMonthly, setSelectedDateMonthly] = useState<string | null>(null);
  const [selectedDateTrend, setSelectedDateTrend] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const { fim, diasPeriodo, metricas, anterior, posts, periodoIg } = resultado;
  const r = resultado.r!;

  // ---------- Instagram: definições ORIGINAIS da tela (inalteradas) ----------
  const data = (metricas.data ?? SEM_POSTS) as any[];
  const ant = (anterior.data ?? SEM_POSTS) as any[];
  const postsData = (posts.data as any[]) ?? SEM_POSTS;
  const semInstagram = data.length === 0;
  // Métricas que a Meta só entrega para até 30 dias (alcance único, salvamentos por data da ação, novos seguidores)
  // só aparecem quando o período é de até 30 dias. Em períodos maiores, a versão "soma dos dias", com rótulo.
  const periodo30 = diasPeriodo <= 30;

  // Tudo o que deriva das linhas do período, calculado uma vez por mudança de dado (não a cada abrir/fechar).
  const k = useMemo(() => {
    const meta = periodo30 ? completeInstagramPeriod(periodoIg.data?.dados, start, fim) : null;
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
    const temAnterior = ant.filter((d) => d.reach != null).length >= Math.ceil(diasReach * 0.8) && diasReach >= 7;
    const variacao = (atual: number, antes: number): { sobe: boolean; percentual: string; contexto: string } | null => {
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

  const sinal = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toLocaleString("pt-BR")}`;
  const formatInsight = useMemo(() => computeFormatInsight(postsData), [postsData]);
  const formatos = useMemo(() => computeFormatBreakdown(postsData), [postsData]);
  const selecionarMensal = useCallback((d: string) => setSelectedDateMonthly(d), []);
  const selecionarTendencia = useCallback((d: string) => setSelectedDateTrend(d), []);

  async function handleDownloadReport() {
    setGeneratingReport(true);
    try {
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start, end: fim, periodLabel });
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

  // ---------- formato 5 segundos (03.1.1.1, D-01): veredito com os 3 anéis ao lado; o topo antigo (4 cartões e o gráfico de contatos) vai para "Ver tudo" ----------
  const cartoesAntigos: ReactNode[] = carregandoFontes ? [<NxCarregando key="c" linhas={2} />] : cartoesDePessoas({ pessoas, roi, variacoes }).filter((c) => c != null);
  const principalAntigo = linhasDia.filter((l) => l.mandaram_mensagem != null || l.agendaram != null);

  // Seguidores novos e salvos a cada mil: dias fechados do Instagram, em janelas do mesmo tamanho (sem consulta nova).
  const instagram = useMemo(
    () => medidasDoInstagram({ metricas: data as LinhaDoInstagram[], anterior: ant as LinhaDoInstagram[], start, end: fim, hoje: resultado.hoje }),
    [data, ant, start, fim, resultado.hoje],
  );
  const numeroDoCartao = (k: ChaveDoFunil) => pessoas?.numeros?.[k]?.valor ?? null;
  const entrada: EntradaCincoResultados = useMemo(
    () => ({
      fatos: leitura.fatos,
      dias: comparacao.dias,
      valores: { mandaram_mensagem: numeroDoCartao("mandaram_mensagem"), agendaram: numeroDoCartao("agendaram"), fecharam: numeroDoCartao("fecharam") },
      atual: variacoes.atual,
      antes: variacoes.antes,
      cobertura: variacoes.cobertura,
      diario: linhasDia,
      ads: ladoDeAnuncios(ads),
      seguidores: instagram.seguidores,
      salvos: instagram.salvos,
      retorno: retornoDaEntrada(roi ? montarRoi(roi) : null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leitura.fatos, comparacao.dias, pessoas, variacoes, linhasDia, ads, instagram, roi],
  );
  const veredito = useMemo(() => vereditoDeResultados(entrada), [entrada]);
  const aneis = useMemo(() => aneisDeResultados(entrada), [entrada]);
  const linhasAgora = useMemo(() => linhasAgoraContraAntes(entrada), [entrada]);
  const dinheiro = useMemo(() => cartoesDeDinheiro(entrada), [entrada]);
  // Descobertas (3 a 5, só com a própria clínica): as 3 primeiras à vista, as outras no começo do "Ver tudo". A ação de conversas muda com o papel.
  const papel = useClientRole(clientId);
  const equipe = !papel.carregando && ehEquipe({ isAdmin, papel: papel.papel });
  const dateRange = clientLayoutRoute.useSearch();
  const descobertas = useMemo(() => descobertasDeResultados(entrada, { equipe }), [entrada, equipe]);
  // A leitura do período (o "Resumo da clínica") saiu do "Ver tudo" (João 13/11/2026): o que ela dizia e o topo (veredito, anéis, cartões de
  // dinheiro, agora contra antes e descobertas) ainda não diz vira descoberta, no mesmo desenho.
  const todasAsDescobertas = useMemo(() => {
    const textoDoTopo = [
      veredito?.tipo === "veredito" ? textoDaFrase(veredito.frase) : "",
      ...aneis.map((a) => `${a.valor ?? ""} ${a.variacao?.texto ?? ""} ${a.somaAtual ?? ""} ${a.somaAntes ?? ""}`),
      ...linhasAgora.map((l) => `${l.frase} ${l.detalhe}`),
      ...dinheiro.map((c) => `${c.valorTexto ?? ""} ${c.textoDaVariacao ?? ""}`),
    ];
    return juntarDescobertas(descobertas.itens, descobertasDaLeitura({ fatos: leitura.fatos, resumo: leitura.resumo, descobertas: descobertas.itens, textoDoTopo }));
  }, [descobertas, leitura.fatos, leitura.resumo, veredito, aneis, linhasAgora, dinheiro]);
  const { visiveis, resto } = visiveisEResto(todasAsDescobertas);
  const avisoDasDescobertas = visiveis.length >= 3 ? null : descobertas.aviso;
  // A linha de 30 dias de cada anel: só os dias fechados, com buraco (nunca zero) onde o dia não veio.
  const series = useMemo(() => {
    const linhas = linhasDia.filter((l) => l.dia <= comparacao.fimFechado);
    const de = (campo: CampoDiario, rotulo: string): SerieDiaria | undefined => {
      const { datas, valores } = serieContinua(linhas.map((l) => ({ dia: l.dia, valor: l[campo] ?? null })));
      return datas.length >= 2 ? { rotulo, datas, valores } : undefined;
    };
    return { mandaram_mensagem: de("mandaram_mensagem", "conversas iniciadas"), agendaram: de("agendaram", "agendaram"), fecharam: de("fecharam", "fecharam") };
  }, [linhasDia, comparacao.fimFechado]);

  // Os cartões do Fechamento do mês: só são montados com a história aberta (Resultados fechada não paga nada a mais).
  // Só usa o que a tela já tem em memória (as mesmas consultas e chaves de cache), nenhuma consulta nova além das duas leituras pequenas acima.
  const cartoesDaHistoria = useMemo(() => {
    if (!fechamento.aberto) return [];
    const temIg = resultado.fontes.data?.tem_instagram === true;
    type LinhaComSeguidores = LinhaDoInstagram & { followers_count?: number | null };
    const [dados, dadosAntes] = [metricas.data as LinhaComSeguidores[] | undefined, anterior.data as LinhaComSeguidores[] | undefined];
    const somaDoAlcance = (linhas: LinhaComSeguidores[] | undefined, de: string, ate: string) =>
      somaDiaria((linhas ?? []).filter((l) => l.date >= de && l.date <= ate).map((l) => ({ dia: l.date, reach: l.reach ?? null })), comparacao.dias, ["reach"]).reach;
    const crescer = (linhas: LinhaComSeguidores[] | undefined, de: string, ate: string) => {
      if (!linhas) return null;
      const c = analyzeGrowth(linhas, de, ate);
      return { novos: c.novos, diasMedidos: c.diasMedidos };
    };
    // As "3 apostas" são as 3 primeiras descobertas da Hoje: a mesma EntradaHoje, a mesma regra, a mesma frase.
    const entradaHoje = montarEntradaDaHoje({
      resultado: r, start, end, hoje: resultado.hoje, funil: fechamento.funil, roi, pessoas, posts: posts.data, metricas: metricas.data, anterior: anterior.data, temIg, fontes: fechamento.fontes,
    });
    const hojeDaClinica = acoesDaHoje(entradaHoje);
    const apostas =
      hojeDaClinica.tipo === "acoes"
        ? visiveisEResto([...(hojeDaClinica.proxima ? [hojeDaClinica.proxima] : []), ...hojeDaClinica.outras].flatMap((a) => descobertaDaAcao(a) ?? [])).visiveis.map((d) => ({ titulo: d.acao.rotulo, motivo: d.frase }))
        : [];
    const totalDeSeguidores = serieContinua((dados ?? []).filter((l) => l.date >= start && l.date <= comparacao.fimFechado).map((l) => ({ dia: l.date, valor: l.followers_count ?? null }))).valores;
    return cartoesDoMes({
      nome: fechamento.nome,
      inicio: start,
      fim: comparacao.fimFechado,
      dias: comparacao.dias,
      anterior: { inicio: comparacao.anterior.start, fim: comparacao.anterior.end },
      conversas: { atual: variacoes.atual.mandaram_mensagem ?? null, antes: variacoes.antes.mandaram_mensagem ?? null, porDia: series.mandaram_mensagem?.valores ?? [] },
      alcance: temIg && dados ? { atual: somaDoAlcance(dados, start, comparacao.fimFechado), antes: somaDoAlcance(dadosAntes, comparacao.anterior.start, comparacao.anterior.end) } : null,
      seguidores: temIg && dados ? { atual: crescer(dados, start, end), antes: crescer(dadosAntes, comparacao.anterior.start, comparacao.anterior.end), total: totalDeSeguidores } : null,
      posts: temIg ? (posts.data as PostDoMes[] | undefined) ?? null : null,
      anuncios: entrada.ads ? { atual: entrada.ads.atual, antes: entrada.ads.anterior, porDia: entrada.ads.porDia } : null,
      funil: { desenhado: pessoas ? dePacientesDoPeriodo({ dados: pessoas, variacao: () => null }) : null, fecharam: { atual: variacoes.atual.fecharam ?? null, antes: variacoes.antes.fecharam ?? null } },
      apostas,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechamento.aberto, fechamento.nome, fechamento.funil, fechamento.fontes, start, end, comparacao, variacoes, series, metricas.data, anterior.data, posts.data, pessoas, roi, entrada.ads]);

  const detalhe = (
    <div className="nexo-results-overview">
      <NxMaisDescobertas itens={resto} clientId={clientId} dateRange={dateRange} />
      {/* Chamaram, Agendaram e Fecharam saíram daqui (quick-ver-tudo): a mudança de cada um já está nos anéis do topo, e as pessoas de cada
          etapa estão em "Onde os pacientes travam". Fica o dinheiro, que o topo não mostra. */}
      {!carregandoFontes && (
        <NxBlocoDoVerTudo rotulo="Faturamento do período" cabeca={cabecaDoDinheiro(dinheiroDoPeriodo({ pessoas, roi }))}>
          <div className="nx-grade nx-grade--2">{cartoesAntigos[3]}</div>
        </NxBlocoDoVerTudo>
      )}
      {principalAntigo.length >= 3 && (
        <NxBlocoDoVerTudo rotulo="Contatos e agendamentos por dia" cabeca={cabecaDaSerieDiaria(principalAntigo.map((l) => ({ dia: l.dia, valor: l.mandaram_mensagem })), "contatos")}>
        <NxCard nivel={2} icone={ic(MessageCircle)} titulo="Contatos e agendamentos por dia" subtitulo={`${periodLabel} · pessoas que chamaram (eixo da esquerda) e agendamentos (eixo da direita)`}>
          <NxLinhaTempo
            rotulo="Pessoas que chamaram e agendamentos por dia"
            datas={principalAntigo.map((l) => l.dia)}
            series={[
              { rotulo: "Chamaram", valores: principalAntigo.map((l) => l.mandaram_mensagem ?? 0), cor: "var(--b1)", area: true },
              { rotulo: "Agendaram", valores: principalAntigo.map((l) => l.agendaram ?? 0), cor: "var(--or)", eixo: "dir" },
            ]}
            formatarData={tickDate}
            formatarValor={(n) => fmt(Math.round(n))}
          />
        </NxCard>
        </NxBlocoDoVerTudo>
      )}
      <AvisosDeDado insights={r.insights} />

      <NxBlocoDoVerTudo cabeca={cabecaDasAnalises({ titulo: r.veredito.titulo, acoesDaSemana: r.semana.length })}>
      <NxRecolhido id="todas-analises" titulo="Todas as análises do período" resumo="O que melhorou e piorou, o que fazer nesta semana, o resumo do período e o que ainda não dá para dizer">
        <AnalisesDoPeriodo clientId={clientId} start={start} fim={fim} r={r} diario={data} diarioAnterior={ant} posts={postsData} />
      </NxRecolhido>
      </NxBlocoDoVerTudo>

      <NxBlocoDoVerTudo
        cabeca={cabecaDoInstagramDoPeriodo({
          alcance: semInstagram ? null : (meta?.alcance_unico ?? reach),
          variacaoPct: meta?.alcance_unico != null || !vsAlcance ? null : (vsAlcance.sobe ? 1 : -1) * Number(vsAlcance.percentual.replace(/\D/g, "")),
          unico: meta?.alcance_unico != null,
        })}
      >
      <NxRecolhido id="instagram" titulo="Resultados do Instagram" resumo={`${periodLabel} · alcance, seguidores, formatos e horários`}>
        <div className="nxr-bloco">
          <NxCard rotulo="Resultados do Instagram" nivel={2} titulo="Resultados do Instagram" subtitulo={`${periodLabel} · Instagram`}>
            {semInstagram ? (
              <div className="nxr-vazio">
                <p>Sem dado do Instagram neste período, por isso os indicadores de alcance, seguidores, engajamento e salvamentos não aparecem.</p>
                <SyncButton clientId={clientId} alvo="tudo" />
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
                <NxKpi i={2} icone={ic(Activity)} rotulo="Taxa de interação" valor={taxaUnica ?? engagementRate} info={info("Taxa de interação", explicacao.engajamento)} />
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

          {!semInstagram && (
            <>
              {/* O aviso de histórico curto fica uma vez só; aqui só o botão de buscar histórico. */}
              {avisoCobertura && isAdmin && (
                <div className="nxr-acoes">
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
                <NxCard icone={ic(Gauge)} titulo="Alcance e interações" subtitulo="Toque num ponto para ver o que foi publicado no dia">
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
                  <DrillDownDoDia date={selectedDateMonthly} posts={postsData} />
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
                    <p className="nxr-apoio">Sem histórico suficiente ainda.</p>
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
                  <DrillDownDoDia date={selectedDateTrend} posts={postsData} />
                </NxCard>
              </div>

              <InsightDeFormato insight={formatInsight} periodLabel={periodLabel} />
              <div className="nx-grade nx-grade--2">
                <EngajamentoPorFormato todos={formatos} />
                <PostsPorFormato todos={formatos} />
              </div>
              <div className="nx-grade nx-grade--2">
                <MelhoresHorarios posts={postsData} periodLabel={periodLabel} />
                <NxCard icone={ic(CalendarDays)} titulo="Dias com dado do Instagram" subtitulo={`${datasDados.length} de ${diasPeriodo} dias do período`}>
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
        </div>
      </NxRecolhido>
      </NxBlocoDoVerTudo>

      {/* "O que os anúncios mostram" saiu daqui (quick-ver-tudo): era a mesma lista de análises de "O que ajuda a explicar o resultado", só as de
          anúncios. Fica o retorno, que só este bloco tem. */}
      <NxBlocoDoVerTudo
        cabeca={(() => {
          const rr = roi ? montarRoi(roi) : null;
          return cabecaDoRetorno({ calculavel: !!rr?.calculavel, roi: rr?.roi ?? null, pendentes: rr?.pendentes ?? 0, motivo: rr?.motivoSemCalculo ?? null });
        })()}
      >
      <NxRecolhido id="anuncios-e-retorno" titulo="Retorno do investimento" resumo="Quanto foi investido, o que voltou e o que falta para o retorno aparecer">
        <div className="nxr-bloco">
          <RetornoNoDetalhe clientId={clientId} start={start} end={fim} dados={roi} isAdmin={isAdmin} />
        </div>
      </NxRecolhido>
      </NxBlocoDoVerTudo>

      <NxBlocoDoVerTudo
        cabeca={cabecaDasExplicacoes({
          total: r.insights.filter((i) => !i.id.startsWith("dado-")).length,
          pedemAtencao: r.insights.filter((i) => !i.id.startsWith("dado-") && i.tom !== "bom").length,
        })}
      >
      <NxRecolhido id="explicar" titulo="O que ajuda a explicar o resultado" resumo={`${r.insights.filter((i) => !i.id.startsWith("dado-")).length} análises, cada uma com a evidência e quem resolve`}>
        <div className="nxr-bloco">
          <AnaliseDeArea insights={r.insights.filter((i) => !i.id.startsWith("dado-"))} titulo="Análises do período" vazio="Ainda não há dado suficiente para explicar o resultado." clientId={clientId} />
          {r.metricas.length > 0 && <IndicadoresDeMercado metricas={r.metricas} clientId={clientId} />}
        </div>
      </NxRecolhido>
      </NxBlocoDoVerTudo>

      <NxRecolhido id="metodo" titulo="Como lemos estes números" resumo="O que ainda não dá para dizer e as regras de leitura">
        <MetodoDosNumeros limitacoes={r.limitacoes} pessoas={pessoas} />
      </NxRecolhido>

      <div className="nxr-acoes">
        <button type="button" onClick={handleDownloadReport} disabled={generatingReport} className="nx-botao disabled:opacity-60">
          {generatingReport ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {generatingReport ? "Gerando PDF…" : "Baixar relatório PDF"}
        </button>
        <SyncButton clientId={clientId} alvo="tudo" />
      </div>
    </div>
  );

  return (
    <>
    <PaginaNexo
      {...cabecalho}
      veredito={
        <NxVeredito
          veredito={veredito}
          carregando={carregandoFontes}
          tela="resultados"
          lado={veredito?.tipo === "veredito" ? <NxAneis aneis={aneis} series={series} rotuloDoAnterior={`${comparacao.dias} dias antes`} /> : undefined}
          acao={veredito?.tipo === "veredito" ? <BotaoFechamentoDoMes aoAbrir={fechamento.pedir} titulo={fechamento.serve ? undefined : "O fechamento usa os últimos 30 dias"} /> : undefined}
        />
      }
      cartoes={carregandoFontes ? undefined : [<CartaoDeDinheiroNx key="r" c={dinheiro[0]} clientId={clientId} />, <CartaoDeDinheiroNx key="g" c={dinheiro[1]} clientId={clientId} />, <CartaoDeDinheiroNx key="p" c={dinheiro[2]} clientId={clientId} />]}
      principal={carregandoFontes ? undefined : <NxAgoraContraAntes linhas={linhasAgora} />}
      descobertas={
        carregandoFontes || veredito?.tipo !== "veredito" ? undefined : (
          <NxDescobertas
            titulo="O que os números dizem"
            apoio={<p className={avisoDasDescobertas ? "nx-cinco-falta" : "nx-cinco-falta nx-resultados-ordem"}>{avisoDasDescobertas ?? "Em ordem de impacto"}</p>}
            itens={visiveis}
            clientId={clientId}
            dateRange={dateRange}
          />
        )
      }
      leitura={null}
      periodoDoVerTudo={carregandoFontes ? null : periodoDoVerTudo(leitura.fatos)}
      semSeloNoVerTudo
      resumoDoVerTudo="faturamento, dia a dia, análises, Instagram e retorno"
      detalhe={detalhe}
    />
    <NxHistoriaDoMes cartoes={cartoesDaHistoria} aberto={fechamento.aberto} aoFechar={fechamento.fechar} />
    </>
  );
}

// ---------- dinheiro e comparação no formato 5 segundos (03.1.1.1) ----------

const numero = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** As linhas cruas de ads_resumo e ads_por_dia viram os lados que a regra espera (texto vazio e ausente viram null, nunca 0). */
function ladoDeAnuncios(ads: { atual: unknown; anterior: unknown; porDia: unknown }): EntradaCincoResultados["ads"] {
  const lado = (l: unknown) => (l && typeof l === "object" ? { gasto: numero((l as Record<string, unknown>).gasto), conversas: numero((l as Record<string, unknown>).conversas) } : null);
  const dias = Array.isArray(ads.porDia) ? (ads.porDia as Record<string, unknown>[]).map((d) => ({ dia: String(d.dia), gasto: numero(d.gasto), conversas: numero(d.conversas) })) : [];
  const atual = lado(ads.atual);
  const anterior = lado(ads.anterior);
  return atual || anterior || dias.length ? { atual, anterior, porDia: dias } : null;
}

/** "Informar valor": leva a equipe ao lugar onde o valor médio da consulta já é editado (link só, sem formulário novo). */
function LinkInformarValor({ clientId }: { clientId: string }) {
  const local = useLocation();
  const periodo = Object.fromEntries(Object.entries(local.search).filter(([k]) => ["preset", "from", "to"].includes(k)));
  return (
    <Link search={{ ...periodo, aba: "conversas" } as any} to="/$clientId/atendimento" params={{ clientId } as any} className="nx-botao">
      Informar valor
    </Link>
  );
}

/** Um dos 3 cartões de dinheiro. Sem medida: "Falta dado" com o motivo; só a equipe vê "Informar valor", o médico vê quem resolve. */
function CartaoDeDinheiroNx({ c, clientId }: { c: CartaoDeDinheiro; clientId: string }) {
  const { isAdmin } = useAuth();
  const papel = useClientRole(clientId);
  const equipe = !papel.carregando && ehEquipe({ isAdmin, papel: papel.papel });
  return (
    <NxCartaoNumero
      icone={ic(c.id === "retorno" ? Wallet : Coins)}
      titulo={c.titulo}
      valor={c.valorTexto}
      legenda={c.legenda}
      semMedida={c.semMedida}
      variacao={c.textoDaVariacao ? { texto: c.textoDaVariacao } : null}
      serie={c.serie ? { ...c.serie, formatar: (n) => fmtBRL(n) } : undefined}
      extra={
        c.semMedida ? (
          <>
            <p className="nx-cinco-falta" data-falta-dado>{`Falta dado: ${c.motivo ?? "sem medida neste período"}`}</p>
            {c.id === "retorno" && (equipe ? c.equipeInformaValor && <LinkInformarValor clientId={clientId} /> : <p className="nx-cinco-falta">{`Quem resolve: ${ROTULO_RESPONSAVEL.equipe_hub}`}</p>)}
          </>
        ) : c.selo && !c.variacao ? (
          // Valor medido, mas sem período anterior para comparar: a falta é dita em cinza (nunca um 0% de mentira).
          <p className="nx-cinco-falta" data-falta-dado>{`${c.selo.texto}`}</p>
        ) : undefined
      }
    />
  );
}

// ---------- cartões do topo ----------

function paraCartao(v: ReturnType<typeof variacaoPct>) {
  return v && v.tom !== "flat" ? { sobe: v.tom === "up", percentual: `${Math.abs(v.pct)}%`, contexto: "vs. período anterior" } : null;
}

function CartaoDePessoas({ i, icone, rotulo, numero, variacao }: { i: number; icone: ReactNode; rotulo: string; numero: Numero | undefined; variacao: ReturnType<typeof variacaoPct> }) {
  const semDado = !numero || numero.valor == null;
  const nota = semDado ? (numero?.motivo_sem_dado ?? "A fonte não respondeu.") : (coberturaDoNumero(numero) ?? undefined);
  return (
    <NxKpi
      i={i}
      icone={icone}
      rotulo={rotulo}
      valor={semDado ? textoNaoMedido(numero) : fmt(numero!.valor)}
      variacao={semDado ? null : paraCartao(variacao)}
      nota={nota}
    />
  );
}

/** Quatro números: chamaram, agendaram, fecharam e o dinheiro (faturamento com valor ou, sem ele, o investimento). */
/** O dinheiro do período para a frase do bloco: o faturamento (só quando a soma não engana) e o investimento em aquisição. */
function dinheiroDoPeriodo({ pessoas, roi }: { pessoas: PacientesPeriodo | null; roi: DadosRoi | null }): { faturamento: { valor: number; vendas: number } | null; investido: number | null } {
  const fecharam = pessoas?.numeros?.fecharam;
  const vendas = Number(fecharam?.vendas ?? 0);
  const semValor = Number(fecharam?.sem_valor ?? 0);
  const comValor = vendas - semValor;
  const ok = fecharam?.valor != null && vendas > 0 && comValor > 0 && semValor * 2 < vendas;
  return { faturamento: ok ? { valor: Number(fecharam?.valor_total ?? 0), vendas } : null, investido: roi ? numerosDisponiveisRoi(roi).investido : null };
}

function cartoesDePessoas({ pessoas, roi, variacoes }: { pessoas: PacientesPeriodo | null; roi: DadosRoi | null; variacoes: { atual: Record<string, number | null>; antes: Record<string, number | null> } }): [ReactNode, ReactNode?, ReactNode?, ReactNode?] {
  const n = pessoas?.numeros;
  const v = (k: string) => variacaoPct(variacoes.atual[k], variacoes.antes[k]);
  const fecharam = n?.fecharam;
  const vendas = Number(fecharam?.vendas ?? 0);
  const semValor = Number(fecharam?.sem_valor ?? 0);
  const comValor = vendas - semValor;
  const investido = roi ? numerosDisponiveisRoi(roi).investido : null;
  // Faturamento só com valor nas vendas (metade ou mais sem valor, a soma engana); senão, o investimento; senão, sem dado.
  const faturamento = fecharam?.valor != null && vendas > 0 && comValor > 0 && semValor * 2 < vendas;
  const dinheiro = faturamento ? (
    <NxKpi i={3} icone={ic(Wallet)} rotulo="Faturamento" valor={fmtBRL(Number(fecharam?.valor_total ?? 0))} nota={`${fmt(vendas)} ${vendas === 1 ? "venda" : "vendas"}, ${fmt(comValor)} com valor`} />
  ) : investido != null && investido > 0 ? (
    <NxKpi i={3} icone={ic(Coins)} rotulo="Investimento" valor={fmtBRL(investido)} nota="em anúncio de aquisição, de mensagem, lead ou conversão" />
  ) : (
    <NxKpi i={3} icone={ic(Wallet)} rotulo="Faturamento" valor="Sem dado" nota={vendas > 0 ? "As vendas do CRM ainda não têm valor preenchido." : "Nenhuma venda com valor neste período."} />
  );
  return [
    <CartaoDePessoas key="c" i={0} icone={ic(MessageCircle)} rotulo="Chamaram" numero={n?.mandaram_mensagem} variacao={v("mandaram_mensagem")} />,
    <CartaoDePessoas key="a" i={1} icone={ic(CalendarDays)} rotulo="Agendaram" numero={n?.agendaram} variacao={v("agendaram")} />,
    <CartaoDePessoas key="f" i={2} icone={ic(ClipboardCheck)} rotulo="Fecharam" numero={n?.fecharam} variacao={v("fecharam")} />,
    dinheiro,
  ];
}

// ---------- detalhe ----------

/** Dado com erro na origem: muda a leitura de tudo, por isso aparece primeiro no detalhe (e a leitura nega, se for grave). */
function AvisosDeDado({ insights }: { insights: Insight[] }) {
  const erros = insights.filter((i) => i.id.startsWith("dado-"));
  if (!erros.length) return null;
  return (
    <div className="nxr-avisos">
      {erros.map((i) => (
        <NxAviso
          key={i.id}
          tom={i.tom === "ruim" ? "critico" : "atencao"}
          titulo={i.titulo}
          detalhe={
            <>
              <p>{i.diagnostico}</p>
              {i.acao?.texto && <p>{`Para consertar: ${i.acao.texto}`}</p>}
              <p>{`Quem resolve: ${ROTULO_RESPONSAVEL[i.responsavel]}`}</p>
            </>
          }
        >
          {i.evidencia}
        </NxAviso>
      ))}
    </div>
  );
}

function LinkDaAcao({ texto, rota, clientId }: { texto: string; rota?: string; clientId: string }) {
  const local = useLocation();
  const periodo = Object.fromEntries(Object.entries(local.search).filter(([k]) => ["preset", "from", "to"].includes(k)));
  if (!rota) return null;
  return (
    <Link search={periodo as any} to={rota as any} params={{ clientId } as any} className="nx-botao">
      {texto}
    </Link>
  );
}

const quem = (q: Responsavel) => `Quem resolve: ${ROTULO_RESPONSAVEL[q]}`;

/** Cada análise em um cartão: título, evidência e quem resolve. */
function AnaliseDeArea({ insights, titulo, vazio, clientId }: { insights: Insight[]; titulo: string; vazio: string; clientId: string }) {
  return (
    <NxCard nivel={3} icone={ic(Lightbulb)} titulo={titulo}>
      {insights.length === 0 ? (
        <p className="nxr-apoio">{vazio}</p>
      ) : (
        <ul className="nx-lista">
          {insights.map((i) => (
            <li key={i.id}>
              <NxListRow
                titulo={i.titulo}
                sub={
                  <>
                    <span>{i.evidencia}</span>
                    {i.diagnostico && <span>{i.diagnostico}</span>}
                    {i.acao?.texto && <span>{`Ação: ${i.acao.texto}`}</span>}
                    <span>{quem(i.responsavel)}</span>
                    <span>{`${ROTULO_CONFIANCA[i.confianca]}${i.motivoConfianca ? `: ${i.motivoConfianca}` : ""}`}</span>
                  </>
                }
                fim={
                  <>
                    <NxTag tom={TOM_NX[i.tom]} seta={i.tom === "bom" ? "cima" : i.tom === "ruim" ? "baixo" : undefined}>
                      {ROTULO_TOM[i.tom]}
                    </NxTag>
                    <LinkDaAcao texto={i.acao?.botao ?? "Abrir"} rota={i.acao?.rota} clientId={clientId} />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </NxCard>
  );
}

function IndicadoresDeMercado({ metricas, clientId }: { metricas: Metrica[]; clientId: string }) {
  return (
    <div className="nxr-bloco">
      <p className="nxr-apoio">
        Bom, na média ou abaixo só aparecem quando existe referência de mercado com metodologia publicada. Sem referência, compare com o período anterior.
      </p>
      <div className="nx-grade nx-grade--3">
        {metricas.map((m, i) => (
          <NxKpi
            key={m.id}
            i={i}
            icone={ic(Gauge)}
            rotulo={m.rotulo}
            valor={m.valor}
            extra={m.status ? <NxTag tom={TOM_NX[m.status]}>{m.selo ?? ROTULO_TOM[m.status]}</NxTag> : <NxTag tom="g">sem referência</NxTag>}
            nota={[m.statusTexto, m.comparacao].filter(Boolean).join(" · ") || undefined}
            info={<InfoDica texto={`${m.explicacao}${m.fonte ? ` Fonte da referência: ${m.fonte}` : ""}`} rotulo={`Sobre ${m.rotulo}`} />}
            titulo={m.rotulo}
          />
        ))}
      </div>
      <div className="nxr-acoes">
        {metricas.map((m) => (m.rota && m.botao ? <LinkDaAcao key={`l-${m.id}`} texto={m.botao} rota={m.rota} clientId={clientId} /> : null))}
      </div>
    </div>
  );
}

/** As 8 respostas do diagnóstico, as ações da semana e o resumo do período: tudo o que antes brigava pelo topo. */
function AnalisesDoPeriodo({
  clientId,
  start,
  fim,
  r,
  diario,
  diarioAnterior,
  posts,
}: {
  clientId: string;
  start: string;
  fim: string;
  r: Resultado;
  diario: any[];
  diarioAnterior: any[];
  posts: any[];
}) {
  // Mesma chave do useResultado: a leitura de anúncios já está em cache.
  const ads = useQuery({ queryKey: ["ads-diag-objetivo", clientId, start, fim], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, fim), retry: false, staleTime: 5 * 60_000 });
  const pautas = usePautas(clientId);
  const respostas = useMemo(() => {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const p = (pautas.q.data?.pautas ?? [])
      .filter((x) => (x.status === "escolhida" || x.status === "nova") && (!x.dia || x.dia >= hoje))
      .sort((a, b) => (a.dia ?? "9999").localeCompare(b.dia ?? "9999"))[0];
    return montarDiagnostico({
      resultado: r,
      diario,
      diarioAnterior,
      posts,
      ads: ads.data ?? null,
      pautaPlanejada: p ? { titulo: p.titulo, formato: ROTULO_FORMATO[p.formato], dia: p.dia } : null,
      problemasAltos: r.insights.filter((i) => i.id.startsWith("dado-") && i.tom === "ruim").map((i) => ({ titulo: i.titulo, correcao: i.acao?.texto ?? "" })),
    });
  }, [r, diario, diarioAnterior, posts, ads.data, pautas.q.data]);
  const cautela = grauDeCautela(respostas);
  const cv = r.veredito.tom === "neutro" ? null : r.veredito.tom;

  return (
    <div className="nxr-bloco">
      <div className="nx-grade nx-grade--2">
        {respostas.map((x) => {
          const rota = !x.rota || !x.rota.startsWith("/") ? undefined : x.rota.startsWith("/$clientId") ? x.rota : `/$clientId${x.rota}`;
          const responsavel = x.id === "proxima" && r.proximaAcao ? r.proximaAcao.responsavel : QUEM_DA_RESPOSTA[x.id];
          return (
            <NxCard key={x.id} nivel={3} icone={ic(Compass)} titulo={x.pergunta}>
              <p className="nxr-texto">{x.resposta ?? "Sem base para responder."}</p>
              {x.evidencia && x.resposta && <p className="nxr-apoio">{x.evidencia}</p>}
              {x.limitada && x.motivoLimite && <p className="nxr-apoio">{`${x.resposta ? "Conclusão limitada: " : ""}${x.motivoLimite}`}</p>}
              <p className="nxr-apoio">{quem(responsavel)}</p>
              {rota && x.resposta && <LinkDaAcao texto="Abrir" rota={rota} clientId={clientId} />}
            </NxCard>
          );
        })}
      </div>
      <p className="nxr-apoio">
        {cautela.semBase + cautela.limitadas === 0 ? "Todas as respostas têm base suficiente." : `${cautela.limitadas} com ressalva e ${cautela.semBase} sem base.`}
      </p>

      <NxCard nivel={3} icone={ic(ClipboardCheck)} titulo="O que fazer nesta semana" subtitulo="As ações de maior prioridade, uma por linha">
        {r.semana.length === 0 ? (
          <p className="nxr-apoio">Os dados deste período ainda não sustentam uma recomendação.</p>
        ) : (
          <ul className="nx-lista">
            {r.semana.map((i) => (
              <li key={i.id}>
                <NxListRow
                  titulo={i.acao?.texto ?? i.titulo}
                  sub={
                    <>
                      <span>{i.titulo}</span>
                      <span>{quem(i.responsavel)}</span>
                    </>
                  }
                  fim={<LinkDaAcao texto={i.acao?.botao ?? "Abrir"} rota={i.acao?.rota} clientId={clientId} />}
                />
              </li>
            ))}
          </ul>
        )}
      </NxCard>

      <NxCard nivel={3} titulo="Resumo do período" acao={cv ? <NxTag tom={TOM_NX[cv]}>{r.veredito.titulo.split(":")[0].replace(/\.$/, "")}</NxTag> : undefined}>
        <p className="nxr-texto">{r.veredito.titulo}</p>
        {r.resumo.length > 0 && (
          <ul className="nxr-lista">
            {r.resumo.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </NxCard>
    </div>
  );
}

/** Retorno do investimento no desenho novo (cartões e etiquetas), com o mesmo cálculo de antes. */
function RetornoNoDetalhe({ clientId, start, end, dados, isAdmin }: { clientId: string; start: string; end: string; dados: DadosRoi | null; isAdmin: boolean }) {
  const periodo = formatRangeLabel({ start, end });
  if (!dados) {
    return (
      <NxCard nivel={3} icone={ic(Coins)} titulo="Retorno do investimento" subtitulo={periodo}>
        <p className="nxr-apoio">Os números comerciais ainda não estão disponíveis para esta clínica.</p>
      </NxCard>
    );
  }
  const r = montarRoi(dados);
  const numeros = numerosDisponiveisRoi(dados);
  const pendentes = r.itens.filter((i) => !i.feito);
  const sem = (v: number | null, f: (x: number) => string) => (v === null ? "sem dado" : f(v));
  return (
    <NxCard nivel={3} icone={ic(Coins)} titulo="Retorno do investimento" subtitulo={periodo}>
      <div className="nxr-selos">
        <NxTag tom={SELO_TOM[r.selo.nivel]} titulo={r.selo.motivo}>{`Retorno: ${ROTULO_SELO[r.selo.nivel]}`}</NxTag>
        <NxTag tom={SELO_TOM[r.seloInvestimento.nivel]} titulo={r.seloInvestimento.motivo}>{`Investimento por objetivo: ${ROTULO_SELO[r.seloInvestimento.nivel]}`}</NxTag>
      </div>
      {r.calculavel ? (
        <div className="nx-grade nx-grade--3">
          <NxKpi icone={ic(Coins)} rotulo="Investimento em aquisição" valor={fmtBRL(r.investido)} nota="mensagens, leads e conversão" />
          <NxKpi icone={ic(Coins)} rotulo="Investimento em crescimento" valor={fmtBRL(r.investidoCrescimento)} nota="seguidores, engajamento e alcance" />
          <NxKpi icone={ic(Wallet)} rotulo="Receita de leads vindos de anúncio" valor={fmtBRL(r.receita)} nota={`${r.ganhos} ${r.ganhos === 1 ? "venda" : "vendas"} · de ${fmtBRL(r.receitaTotal)} no CRM`} />
          <NxKpi icone={ic(Gauge)} rotulo="Retorno" valor={`${r.roi! >= 0 ? "+" : "−"}${Math.abs(Math.round(r.roi! * 100)).toLocaleString("pt-BR")}%`} nota={`cada R$ 1 em aquisição voltou ${fmtBRL(r.retornoPorReal!)}`} />
          <NxKpi icone={ic(Wallet)} rotulo={r.rotuloCusto} valor={fmtBRL(r.custo!)} nota="aquisição ÷ vendas vindas de anúncio" />
        </div>
      ) : (
        <>
          <p className="nxr-texto">{r.motivoSemCalculo}</p>
          {r.fraseVendasAnuncio && <p className="nxr-texto"><b>{r.fraseVendasAnuncio}</b></p>}
          <div className="nx-grade nx-grade--4">
            <NxKpi icone={ic(Coins)} rotulo="Investimento em aquisição" valor={sem(numeros.investido, fmtBRL)} nota={situacaoAnuncios(dados)} />
            <NxKpi icone={ic(Coins)} rotulo="Investimento em crescimento" valor={sem(numeros.investidoCrescimento, fmtBRL)} nota={numeros.investidoCrescimento === null ? situacaoAnuncios(dados) : "seguidores, engajamento e alcance"} />
            <NxKpi icone={ic(UserPlus)} rotulo="Contatos novos no CRM" valor={sem(numeros.leads, (x) => x.toLocaleString("pt-BR"))} nota={situacaoCrm(dados) ?? "Novos contatos no período"} />
            <NxKpi icone={ic(Wallet)} rotulo="Vendas ganhas no CRM" valor={sem(numeros.ganhos, (x) => x.toLocaleString("pt-BR"))} nota={numeros.ganhos === null ? (situacaoCrm(dados) ?? "Etapa de venda não marcada no CRM") : (situacaoCrm(dados) ?? (r.receitaTotal > 0 ? `cards criados no período · ${fmtBRL(r.receitaTotal)}` : "cards criados no período"))} />
          </div>
        </>
      )}
      {r.ganhosTotal > 0 && r.origensReceita.length > 0 && (
        <p className="nxr-apoio">
          <b>{`De onde veio a receita do período (${fmtBRL(r.receitaTotal)}): `}</b>
          {r.origensReceita.map((o) => `${o.origem} ${o.receita > 0 ? fmtBRL(o.receita) : "sem valor"} (${o.ganhos} ${o.ganhos === 1 ? "venda" : "vendas"})`).join(" · ")}. Só a parte de anúncio entra no retorno.
        </p>
      )}
      <NxAviso tom="info" titulo="Como ler:">{NOTA_DEFASAGEM}</NxAviso>
      <NxAviso tom="info" titulo="Mudou em 31/10:">{AVISO_MUDANCA_ROI.replace(/^Mudou em 31\/10:\s*/, "")}</NxAviso>
      {pendentes.length > 0 && (
        <NxRecolhido titulo={`Conferir ${pendentes.length === 1 ? "1 pendência" : `${pendentes.length} pendências`} e o cálculo`} resumo="O que falta para o retorno aparecer, com o passo a passo">
          <ul className="nx-lista">
            {pendentes.map((i) => (
              <li key={i.id}>
                <NxListRow
                  titulo={i.preciso}
                  sub={
                    <>
                      <span>{`Para mostrar ${i.paraMostrar}.`}</span>
                      {i.detalhe && <span>{i.detalhe}</span>}
                      {i.passos.map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                    </>
                  }
                  fim={
                    i.link.soAdmin && !isAdmin ? (
                      <span className="nxr-apoio">A equipe Doctor Creator resolve</span>
                    ) : (
                      <Link to={i.link.to} params={{ clientId }} search={{ preset: "personalizado", from: start, to: end }} className="nx-botao">
                        {i.link.rotulo}
                      </Link>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </NxRecolhido>
      )}
    </NxCard>
  );
}

/** O método e o que ainda não dá para dizer, juntos no fim: nada de aviso solto no meio da tela. */
function MetodoDosNumeros({ limitacoes, pessoas }: { limitacoes: Limitacao[]; pessoas: PacientesPeriodo | null }) {
  const avisos = pessoas ? [avisoAgendouMenosQueFechou(pessoas), avisoNaoMedido(pessoas)].filter(Boolean) : [];
  return (
    <div className="nxr-bloco">
      <NxCard nivel={3} titulo="O que o painel ainda não consegue dizer">
        {limitacoes.length === 0 ? (
          <p className="nxr-apoio">Nada deixou de ser dito por falta de dado neste período.</p>
        ) : (
          <ul className="nx-lista">
            {limitacoes.map((l) => (
              <li key={l.id}>
                <NxListRow titulo={l.texto} sub={<span>{`${quem(l.resolve)}${l.comoResolver ? ` · ${l.comoResolver}` : ""}`}</span>} />
              </li>
            ))}
          </ul>
        )}
      </NxCard>
      <NxCard nivel={3} titulo="Como lemos os números de pessoas">
        <p className="nxr-apoio">
          Os cartões do topo contam pessoas diferentes no período. A variação (&quot;vs. período anterior&quot;) soma os dias de cada período, que têm o mesmo tamanho, por isso a
          soma pode ficar um pouco acima do número do cartão. Número que a fonte não mede aparece como &quot;Sem dado&quot;, nunca como zero.
        </p>
        {avisos.map((a) => (
          <NxAviso key={a} tom="atencao" titulo="Atenção:">{a}</NxAviso>
        ))}
        <NxAviso tom="info" titulo="Contatos novos:">{AVISO_CRM_ZERO}</NxAviso>
        {pessoas && avisoCrmDePessoas(pessoas) && <NxAviso tom="critico" titulo="CRM compartilhado:">{avisoCrmDePessoas(pessoas)}</NxAviso>}
      </NxCard>
    </div>
  );
}
