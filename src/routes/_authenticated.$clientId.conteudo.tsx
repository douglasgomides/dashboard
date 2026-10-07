import { useMemo } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getClientFontes, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { analyzeFollowers, analyzeFormatsAndTemas, fmtDiaBR, type GroupStat } from "@/lib/hub-conteudo";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { SyncButton } from "@/components/sync-button";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo")({
  component: ConteudoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

function TabelaGrupo({ titulo, sub, rows, col }: { titulo: string; sub: string; rows: GroupStat[]; col: string }) {
  const max = Math.max(1, ...rows.map((r) => r.reachMedian));
  return (
    <div className="card">
      <h2>{titulo}</h2>
      <p className="sub">{sub}</p>
      {rows.length === 0 ? (
        <p className="note">Nenhum post do período tem {col.toLowerCase()} informado. A equipe pode classificar na aba Posts; quando a classificação por IA estiver ligada no servidor, ela preenche isso nas próximas atualizações.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table className="t">
            <thead>
              <tr>
                <th>{col}</th>
                <th>Posts</th>
                <th>Alcance mediano</th>
                <th>Alcance médio</th>
                <th>Salvos médios</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.key}>
                  <td className="l">
                    {r.label}
                    <span
                      aria-hidden
                      style={{
                        display: "block",
                        height: 4,
                        marginTop: 4,
                        borderRadius: 2,
                        width: `${Math.max(3, (r.reachMedian / max) * 100)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </td>
                  <td>{r.count}</td>
                  <td>{fmtN(r.reachMedian)}</td>
                  <td>{fmtN(r.reachMean)}</td>
                  <td>{r.savedMean.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
      <p>Seguidores, projeção de 30 dias e o que o conteúdo do período entregou. Período: {periodLabel}.</p>
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
        <div className="card kpi">
          <span className="l">Seguidores hoje</span>
          <span className="v">{seg && seg.points.length ? fmtN(seg.points[seg.points.length - 1].followers) : "sem dado"}</span>
          <small>{seg?.lastDate ? `última coleta em ${fmtDiaBR(seg.lastDate)}` : "nenhuma coleta no período"}</small>
        </div>
        <div className="card kpi">
          <span className="l">Variação no período</span>
          <span className="v">
            {seg?.delta == null ? "sem dado" : `${seg.delta >= 0 ? "+" : "-"}${fmtN(Math.abs(seg.delta))}`}
          </span>
          <small>{seg?.delta == null ? "precisa de 2 dias com contagem" : `entre ${fmtDiaBR(seg.firstDate!)} e ${fmtDiaBR(seg.lastDate!)}`}</small>
        </div>
        <div className="card kpi">
          <span className="l">Projeção em 30 dias</span>
          <span className="v">{seg?.projection.ok ? fmtN(seg.projection.projected) : "não projetada"}</span>
          <small>
            {seg?.projection.ok
              ? `${seg.projection.slopePerDay >= 0 ? "+" : ""}${seg.projection.slopePerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia, até ${fmtDiaBR(seg.projection.target)}`
              : "veja o motivo abaixo"}
          </small>
        </div>
        <div className="card kpi">
          <span className="l">Dias com contagem</span>
          <span className="v">{seg ? `${seg.daysWithData} de ${seg.expectedDays}` : "-"}</span>
          <small>{seg ? `${Math.round(seg.coverage * 100)}% do período (mínimo 60%)` : ""}</small>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Evolução de seguidores</h2>
        <p className="sub">Linha contínua é o medido; tracejada é uma estimativa linear, não uma promessa.</p>
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
          <p className="note" style={{ marginTop: 10 }}>
            Sem gráfico: {seg?.points.length ? "só 1 dia tem contagem de seguidores no período." : "nenhum dia do período tem contagem de seguidores."}
          </p>
        )}
        {seg && !seg.projection.ok && (
          <div className="note">
            <i />
            <span>{seg.projection.reason} O total de seguidores é gravado todo dia. Os últimos 28 dias foram reconstruídos com o que a Meta informa de quem seguiu e deixou de seguir; o que for mais antigo que {seg.firstDate ? `${seg.firstDate.slice(8, 10)}/${seg.firstDate.slice(5, 7)}` : "a primeira coleta"} não existe, porque a Meta não guarda o total dos dias passados.</span>
          </div>
        )}
        {seg && seg.projection.ok && seg.gaps.length > 0 && (
          <p className="note">Atenção: há dias sem coleta no período, a estimativa usa só os dias com dado.</p>
        )}
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
            <div className="insight">
              <span className="tag">
                <b /> Melhor formato por alcance
              </span>
              {fm.melhorFormato ? (
                <>
                  <h2>
                    {fm.melhorFormato.label} alcança mais por post: mediana de {fmtN(fm.melhorFormato.reachMedian)} contas
                  </h2>
                  <p className="why">
                    Base: {fm.melhorFormato.count} posts de {fm.melhorFormato.label} no período, com média de{" "}
                    {fm.melhorFormato.savedMean.toLocaleString("pt-BR")} salvamentos por post. Usamos a mediana para um post viral não puxar o número.
                  </p>
                </>
              ) : (
                <>
                  <h2>Ainda não dá para apontar o melhor formato</h2>
                  <p className="why">{fm.melhorFormatoMotivo}</p>
                </>
              )}
            </div>
            <div className="hgrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
              <TabelaGrupo
                titulo="Posts por formato"
                sub={`${fm.total} posts no período`}
                rows={fm.porFormato}
                col="Formato"
              />
              <TabelaGrupo
                titulo="Posts por pilar / tema"
                sub={`${fm.comTema} de ${fm.total} posts têm tema classificado${fm.comTema < fm.total ? " (classifique os demais na aba Posts)" : ""}`}
                rows={fm.porTema}
                col="Tema"
              />
            </div>
          </>
        )
      )}
    </div>
  );
}
