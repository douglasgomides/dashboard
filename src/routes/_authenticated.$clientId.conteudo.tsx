import { useMemo } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getClientFontes, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { analyzeFollowers, analyzeFormatsAndTemas, fmtDiaBR, type GroupStat } from "@/lib/hub-conteudo";
import { Painel, Kpi, Selo, BarraFina, Ajuda, IconeFormato, COR_FORMATO } from "@/components/visual";
import { Users, TrendingUp, Target, CalendarCheck, LineChart as LineIcon, Trophy, Layers, Tag, Bookmark, FileText, AlertTriangle, Info } from "lucide-react";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { SyncButton } from "@/components/sync-button";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo")({
  component: ConteudoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

function TabelaGrupo({ titulo, sub, rows, col, icone }: { titulo: string; sub: string; rows: GroupStat[]; col: string; icone: typeof Layers }) {
  const max = Math.max(1, ...rows.map((r) => r.reachMedian));
  const melhor = rows.length > 0 ? rows[0].key : null;
  return (
    <Painel icone={icone} titulo={titulo} resumo={sub}>
      {rows.length === 0 ? (
        <div className="flex items-start gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
          <span>Sem {col.toLowerCase()} informado neste período.</span>
          <Ajuda>Nenhum post do período tem {col.toLowerCase()} informado. A equipe pode classificar na aba Posts; quando a classificação por IA estiver ligada no servidor, ela preenche isso nas próximas atualizações.</Ajuda>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.slice(0, 12).map((r) => (
            <div key={r.key}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                  {titulo.includes("formato") && <IconeFormato formato={r.key} />}
                  <span className="truncate">{r.label}</span>
                  {r.key === melhor && <Selo cor="var(--good-text)" titulo="Maior alcance mediano"><Trophy size={11} aria-hidden /> 1º</Selo>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums" title="Alcance mediano">{fmtN(r.reachMedian)}</span>
              </div>
              <BarraFina valor={r.reachMedian} max={max} cor={titulo.includes("formato") ? COR_FORMATO[r.key] ?? "var(--accent)" : "var(--accent)"} />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Selo titulo="Posts no período"><FileText size={11} aria-hidden /> {r.count} posts</Selo>
                <Selo titulo="Alcance médio"><Target size={11} aria-hidden /> média {fmtN(r.reachMean)}</Selo>
                <Selo titulo="Salvos médios por post" cor="var(--s7)"><Bookmark size={11} aria-hidden /> {r.savedMean.toLocaleString("pt-BR")} salvos</Selo>
              </div>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

function ConteudoPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const temIg = fontes.data?.tem_instagram === true;
  const metrics = useQuery({
    queryKey: ["conteudo-metrics", clientId, start, end],
    queryFn: () => getMonthlyMetrics(clientId, start, end),
    enabled: temIg,
  });
  const posts = useQuery({
    queryKey: ["conteudo-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });

  const seg = useMemo(() => (metrics.data ? analyzeFollowers(metrics.data, start, end) : null), [metrics.data, start, end]);
  const fm = useMemo(() => (posts.data ? analyzeFormatsAndTemas(posts.data) : null), [posts.data]);

  const head = (
    <div className="hpagehead">
      <h2>Conteúdo</h2>
      <div className="flex items-center gap-2">
        <Users size={14} aria-hidden style={{ color: "var(--accent)" }} />
        <span>{periodLabel}</span>
        <Ajuda>Seguidores, projeção de 30 dias e o que o conteúdo do período entregou. Período: {periodLabel}.</Ajuda>
      </div>
      {temIg && (
        <div className="flex justify-end" style={{ marginTop: 8 }}>
          <SyncButton clientId={clientId} alvo="posts" />
        </div>
      )}
    </div>
  );

  if (fontes.isLoading) return <div>{head}<Carregando /></div>;
  if (fontes.error) return <div>{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) {
    return (
      <div>
        {head}
        <SemFonte {...SEM_INSTAGRAM} />
      </div>
    );
  }
  if (metrics.isLoading || posts.isLoading) return <div>{head}<Carregando texto="Carregando conteúdo do período…" /></div>;
  if (metrics.error || posts.error) return <div>{head}<ErroCarga texto="Falha ao ler as métricas do Instagram. Tente novamente em instantes." /></div>;

  const chartData: { date: string; Seguidores?: number; Projeção?: number }[] = [];
  if (seg) {
    for (const p of seg.points) chartData.push({ date: p.date, Seguidores: p.followers });
    if (seg.projection.ok) {
      chartData[chartData.length - 1].Projeção = chartData[chartData.length - 1].Seguidores;
      chartData.push({ date: seg.projection.line[1].date, Projeção: seg.projection.line[1].followers });
    }
  }

  return (
    <div>
      {head}

      <div className="hgrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Kpi
          icone={Users}
          rotulo="Seguidores hoje"
          valor={seg && seg.points.length ? fmtN(seg.points[seg.points.length - 1].followers) : "sem dado"}
          dica={seg?.lastDate ? `última coleta em ${fmtDiaBR(seg.lastDate)}` : "nenhuma coleta no período"}
        />
        <Kpi
          icone={TrendingUp}
          rotulo="Variação no período"
          cor={seg?.delta != null && seg.delta < 0 ? "var(--crit)" : "var(--good-text)"}
          valor={seg?.delta == null ? "sem dado" : `${seg.delta >= 0 ? "+" : "-"}${fmtN(Math.abs(seg.delta))}`}
          dica={seg?.delta == null ? "precisa de 2 dias com contagem" : `entre ${fmtDiaBR(seg.firstDate!)} e ${fmtDiaBR(seg.lastDate!)}`}
        />
        <Kpi
          icone={Target}
          rotulo="Projeção em 30 dias"
          cor="var(--ai)"
          valor={seg?.projection.ok ? fmtN(seg.projection.projected) : "não projetada"}
          dica={
            seg?.projection.ok
              ? `${seg.projection.slopePerDay >= 0 ? "+" : ""}${seg.projection.slopePerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia, até ${fmtDiaBR(seg.projection.target)}`
              : "veja o motivo abaixo"
          }
        />
        <Kpi
          icone={CalendarCheck}
          rotulo="Dias com contagem"
          cor="var(--s2)"
          valor={seg ? `${seg.daysWithData} de ${seg.expectedDays}` : "-"}
          dica={seg ? `${Math.round(seg.coverage * 100)}% do período (mínimo 60%)` : undefined}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
      <Painel icone={LineIcon} titulo="Evolução de seguidores" resumo="Linha cheia: medido. Tracejada: estimativa" ajuda={<>Linha contínua é o medido; tracejada é uma estimativa linear, não uma promessa.</>}>
        {seg && seg.points.length >= 2 ? (
          <div style={{ width: "100%", height: 260, marginTop: 10 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDiaBR} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={24} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted)" }} width={56} tickFormatter={(v) => fmtN(v)} />
                <Tooltip
                  labelFormatter={(l) => fmtDiaBR(String(l))}
                  formatter={(v) => fmtN(Number(v))}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="Seguidores" stroke="var(--accent)" strokeWidth={2} dot={seg.points.length < 15} connectNulls />
                <Line type="linear" dataKey="Projeção" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="note" style={{ margin: 0 }}>
            Sem gráfico: {seg?.points.length ? "só 1 dia tem contagem de seguidores no período." : "nenhum dia do período tem contagem de seguidores."}
          </p>
        )}
        {seg && !seg.projection.ok && (
          <div className="mt-2 flex items-start gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
            <span className="flex-1">{seg.projection.reason}</span>
            <Ajuda>{seg.projection.reason} O total de seguidores é gravado todo dia. Os últimos 28 dias foram reconstruídos com o que a Meta informa de quem seguiu e deixou de seguir; o que for mais antigo que {seg.firstDate ? `${seg.firstDate.slice(8, 10)}/${seg.firstDate.slice(5, 7)}` : "a primeira coleta"} não existe, porque a Meta não guarda o total dos dias passados.</Ajuda>
          </div>
        )}
        {seg && seg.projection.ok && seg.gaps.length > 0 && (
          <div className="mt-2"><Selo cor="var(--warn)" titulo="A estimativa usa só os dias com dado"><AlertTriangle size={11} aria-hidden /> Há dias sem coleta no período</Selo></div>
        )}
      </Painel>
      </div>

      {fm && fm.total === 0 ? (
        <SemFonte
          titulo="Nenhum post no período"
          texto="Não há posts do Instagram publicados nesse intervalo, então não dá para comparar formatos nem temas. Troque o período no cabeçalho ou confira se a coleta de posts rodou."
          quem="time Doctor Creator (sincronização de posts)."
        />
      ) : (
        fm && (
          <>
            <div style={{ marginBottom: 16 }}>
              {fm.melhorFormato ? (
                <Painel
                  icone={Trophy}
                  cor="var(--good-text)"
                  destaque
                  titulo={`${fm.melhorFormato.label} alcança mais por post`}
                  resumo="Melhor formato por alcance"
                  ajuda={<>Base: {fm.melhorFormato.count} posts de {fm.melhorFormato.label} no período, com média de {fm.melhorFormato.savedMean.toLocaleString("pt-BR")} salvamentos por post. Usamos a mediana para um post viral não puxar o número.</>}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <IconeFormato formato={fm.melhorFormato.key} size={20} />
                    <span className="text-2xl font-semibold tabular-nums">{fmtN(fm.melhorFormato.reachMedian)}</span>
                    <span className="text-xs" style={{ color: "var(--text-dim)" }}>contas, mediana por post</span>
                    <Selo titulo="Posts na base"><FileText size={11} aria-hidden /> {fm.melhorFormato.count} posts</Selo>
                    <Selo cor="var(--s7)" titulo="Salvamentos médios por post"><Bookmark size={11} aria-hidden /> {fm.melhorFormato.savedMean.toLocaleString("pt-BR")} salvos</Selo>
                  </div>
                </Painel>
              ) : (
                <Painel icone={Info} cor="var(--muted)" titulo="Melhor formato: ainda sem resposta" resumo="Melhor formato por alcance" ajuda={<>{fm.melhorFormatoMotivo}</>}>
                  <p className="note" style={{ margin: 0 }}>{fm.melhorFormatoMotivo}</p>
                </Painel>
              )}
            </div>
            <div className="hgrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
              <TabelaGrupo
                titulo="Posts por formato"
                sub={`${fm.total} posts no período`}
                rows={fm.porFormato}
                col="Formato"
                icone={Layers}
              />
              <TabelaGrupo
                titulo="Posts por pilar / tema"
                sub={`${fm.comTema} de ${fm.total} posts têm tema classificado${fm.comTema < fm.total ? " (classifique os demais na aba Posts)" : ""}`}
                rows={fm.porTema}
                col="Tema"
                icone={Tag}
              />
            </div>
          </>
        )
      )}
    </div>
  );
}
