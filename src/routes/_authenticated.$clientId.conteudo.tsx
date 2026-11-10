import { useMemo, type CSSProperties } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClientFontes, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { analyzeFollowers, analyzeGrowth, analyzeFormatsAndTemas, fmtDiaBR, type GroupStat } from "@/lib/hub-conteudo";
import { IconeFormato } from "@/components/visual";
import { Users, UserPlus, UserMinus, Scale, TrendingUp, Target, Trophy, Layers, Tag, CalendarDays, LineChart as LineIcon } from "lucide-react";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { SyncButton } from "@/components/sync-button";
import { fmtFracao, MIN_POSTS_CONCLUSAO } from "@/lib/metricas";
import { SeguidoresSemana } from "@/components/seguidores-impulsionados";
import { NxCard, NxKpi, NxTag } from "@/components/nx";
import { IgCabecalho, IgLeitura, IgNota, IgNotas, IgMetodo, IgLinhaSeguidores, IgColunasSaldo, type IgItemLeitura } from "@/components/nx/instagram";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo")({
  component: ConteudoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const ic = (Icon: typeof Users) => <Icon size={17} strokeWidth={1.7} aria-hidden />;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// Só disputa o "1º" quem tem a amostra mínima do painel (8 posts): um post isolado, talvez impulsionado,
// não vira o melhor pilar. Os grupos menores vêm depois, marcados como amostra pequena.
const comAmostra = (r: GroupStat) => r.count >= MIN_POSTS_CONCLUSAO && r.key !== "não classificado";
function ordenarGrupos(todas: GroupStat[]) {
  const rows = [...todas.filter(comAmostra), ...todas.filter((r) => !comAmostra(r))];
  return { rows, melhor: rows.find(comAmostra) ?? null };
}

function TabelaGrupo({ titulo, sub, rows: todas, col, icone, formato }: { titulo: string; sub: string; rows: GroupStat[]; col: string; icone: typeof Layers; formato?: boolean }) {
  const { rows, melhor } = ordenarGrupos(todas);
  const max = Math.max(1, ...rows.map((r) => r.reachMedian));
  return (
    <NxCard
      icone={ic(icone)}
      titulo={titulo}
      subtitulo={sub}
      acao={<IgMetodo rotulo={`Como ler: ${titulo}`}>A barra é o alcance mediano por post (a mediana não deixa um post viral puxar o número). Só disputa o 1º lugar o grupo com {MIN_POSTS_CONCLUSAO} posts ou mais; os menores aparecem depois, marcados como amostra pequena.</IgMetodo>}
    >
      {rows.length === 0 ? (
        <IgNota detalhe={<>Nenhum post do período tem {col.toLowerCase()} informado. A equipe pode classificar na aba Posts; quando a classificação por IA estiver ligada no servidor, ela preenche isso nas próximas atualizações.</>}>
          Sem {col.toLowerCase()} informado neste período.
        </IgNota>
      ) : (
        <ul className="ig-barras">
          {rows.slice(0, 12).map((r, i) => (
            <li key={r.key} className="nx-hb">
              <div className="nx-hb__linha">
                <span className="ig-barras__rotulo">
                  {formato && <IconeFormato formato={r.key} />}
                  <span className="truncate" title={String(r.label ?? "")}>{r.label}</span>
                  {r.key === melhor?.key && (
                    <NxTag tom="up" titulo={`Maior alcance mediano entre os grupos com ${MIN_POSTS_CONCLUSAO} posts ou mais`} icone={<Trophy size={11} aria-hidden />}>
                      1º
                    </NxTag>
                  )}
                  {!comAmostra(r) && r.key !== "não classificado" && (
                    <NxTag tom="g" titulo={`Menos de ${MIN_POSTS_CONCLUSAO} posts: um post fora da curva decide sozinho`}>
                      amostra pequena
                    </NxTag>
                  )}
                </span>
                <em title="Alcance mediano">
                  {fmtN(r.reachMedian)} <small>· {plural(r.count, "post", "posts")}</small>
                </em>
              </div>
              <div className="nx-trk" aria-hidden>
                <i style={{ width: `${Math.max(3, (r.reachMedian / max) * 100)}%`, ["--i" as string]: i } as CSSProperties} />
                <u />
              </div>
              <div className="ig-grupo__extra">
                média {fmtN(r.reachMean)} · {r.savedMean.toLocaleString("pt-BR")} salvos por post
              </div>
            </li>
          ))}
        </ul>
      )}
    </NxCard>
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
  const cresc = useMemo(() => (metrics.data ? analyzeGrowth(metrics.data, start, end) : null), [metrics.data, start, end]);
  const fm = useMemo(() => (posts.data ? analyzeFormatsAndTemas(posts.data) : null), [posts.data]);
  const serie = useMemo(() => (seg ? { datas: seg.points.map((p) => p.date), valores: seg.points.map((p) => p.followers) } : null), [seg]);

  const head = (
    <IgCabecalho
      titulo="O perfil está crescendo, e o que alcança mais gente?"
      pergunta="Seguidores do período, a tendência dos próximos 30 dias e o formato e o tema que mais alcançam."
      periodo={
        <>
          <CalendarDays size={15} aria-hidden /> {periodLabel}
        </>
      }
      metodo={<>Seguidores, projeção de 30 dias e o que o conteúdo do período entregou. Período: {periodLabel}.</>}
      acao={temIg ? <SyncButton clientId={clientId} alvo="posts" /> : undefined}
    />
  );

  if (fontes.isLoading) return <div className="nexo-ig">{head}<Carregando /></div>;
  if (fontes.error) return <div className="nexo-ig">{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div className="nexo-ig">{head}<SemFonte {...SEM_INSTAGRAM} /></div>;
  if (metrics.isLoading || posts.isLoading) return <div className="nexo-ig">{head}<Carregando texto="Carregando conteúdo do período…" /></div>;
  if (metrics.error || posts.error) return <div className="nexo-ig">{head}<ErroCarga texto="Falha ao ler as métricas do Instagram. Tente novamente em instantes." /></div>;

  const melhorTema = fm ? ordenarGrupos(fm.porTema).melhor : null;
  const leitura: IgItemLeitura[] = [];
  if (cresc && cresc.diasMedidos) {
    leitura.push({
      tom: cresc.liquido < 0 ? "atencao" : "bom",
      titulo: `Saldo de ${cresc.liquido >= 0 ? "+" : "−"}${fmtN(Math.abs(cresc.liquido))} seguidores no período`,
      texto: `Entraram ${fmtN(cresc.novos)} e saíram ${fmtN(cresc.saidas)}${cresc.taxaSaida != null ? ` (${fmtFracao(cresc.taxaSaida)} de quem entrou)` : ""}, em ${plural(cresc.diasMedidos, "dia medido", "dias medidos")}.`,
    });
  }
  if (fm?.melhorFormato) {
    leitura.push({
      tom: "bom",
      titulo: `${fm.melhorFormato.label} alcança mais por post`,
      texto: `${fmtN(fm.melhorFormato.reachMedian)} contas por post (mediana), em ${plural(fm.melhorFormato.count, "post", "posts")} de ${fm.melhorFormato.label} no período, com ${fm.melhorFormato.savedMean.toLocaleString("pt-BR")} salvamentos por post em média.`,
      acao: `dê prioridade a ${fm.melhorFormato.label} na produção e confira de novo no próximo período.`,
    });
  }
  if (melhorTema) {
    leitura.push({
      tom: "bom",
      titulo: `“${melhorTema.label}” é o tema que mais alcança`,
      texto: `${fmtN(melhorTema.reachMedian)} contas por post (mediana), em ${plural(melhorTema.count, "post", "posts")} do tema.`,
    });
  }
  if (seg?.projection.ok) {
    leitura.push({
      tom: "neutro",
      titulo: `No ritmo atual, cerca de ${fmtN(seg.projection.projected)} seguidores em ${fmtDiaBR(seg.projection.target)}`,
      texto: `${seg.projection.slopePerDay >= 0 ? "+" : ""}${seg.projection.slopePerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia. É uma estimativa linear, não uma promessa.`,
    });
  }

  const ultimo = seg && seg.points.length ? seg.points[seg.points.length - 1].followers : null;

  return (
    <div className="nexo-ig">
      {head}

      <section className="nx-grade nx-grade--4 ig-kpis" aria-label="Números do período">
        <NxKpi
          i={0}
          icone={ic(Users)}
          rotulo="Seguidores hoje"
          valor={ultimo != null ? fmtN(ultimo) : "sem dado"}
          nota={seg?.lastDate ? `última coleta em ${fmtDiaBR(seg.lastDate)}` : "nenhuma coleta no período"}
        />
        <NxKpi
          i={1}
          icone={ic(TrendingUp)}
          rotulo="Variação no período"
          valor={seg?.delta == null ? "sem dado" : `${seg.delta >= 0 ? "+" : "−"}${fmtN(Math.abs(seg.delta))}`}
          nota={seg?.delta == null ? "precisa de 2 dias com contagem" : `entre ${fmtDiaBR(seg.firstDate!)} e ${fmtDiaBR(seg.lastDate!)}`}
        />
        <NxKpi
          i={2}
          icone={ic(Target)}
          rotulo="Projeção em 30 dias"
          valor={seg?.projection.ok ? fmtN(seg.projection.projected) : "não projetada"}
          nota={
            seg?.projection.ok
              ? `${seg.projection.slopePerDay >= 0 ? "+" : ""}${seg.projection.slopePerDay.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia, até ${fmtDiaBR(seg.projection.target)}`
              : "veja o motivo no gráfico"
          }
        />
        <NxKpi
          i={3}
          icone={ic(Trophy)}
          rotulo="Formato que mais alcança"
          valor={fm?.melhorFormato ? fm.melhorFormato.label : "sem resposta"}
          nota={fm?.melhorFormato ? `${fmtN(fm.melhorFormato.reachMedian)} contas por post (mediana)` : (fm?.melhorFormatoMotivo ?? "sem posts no período")}
        />
      </section>

      <NxCard
        i={4}
        id="evolucao-seguidores"
        icone={ic(LineIcon)}
        titulo="Evolução de seguidores"
        subtitulo="Linha cheia: medido. Tracejada: estimativa"
        acao={<IgMetodo rotulo="Como ler: Evolução de seguidores">Linha contínua é o medido; tracejada é uma estimativa linear, não uma promessa. O eixo começa perto do menor valor do período para a variação aparecer.</IgMetodo>}
      >
        {seg && serie && seg.points.length >= 2 ? (
          <IgLinhaSeguidores
            datas={serie.datas}
            valores={serie.valores}
            projecao={seg.projection.ok ? { data: seg.projection.line[1].date, valor: seg.projection.line[1].followers } : null}
            formatarData={fmtDiaBR}
            formatarValor={fmtN}
            rotulo="Seguidores por dia"
          />
        ) : (
          <p className="note" style={{ margin: 0 }}>
            Sem gráfico: {seg?.points.length ? "só 1 dia tem contagem de seguidores no período." : "nenhum dia do período tem contagem de seguidores."}
          </p>
        )}
        {seg && (
          <IgNotas>
            <IgNota tom={seg.coverage < 0.6 ? "aviso" : "info"}>
              {seg.daysWithData} de {seg.expectedDays} dias com contagem ({Math.round(seg.coverage * 100)}% do período, mínimo 60%)
            </IgNota>
            {!seg.projection.ok && (
              <IgNota
                tom="aviso"
                detalhe={
                  <>
                    {seg.projection.reason} O total de seguidores é gravado todo dia. Os últimos 28 dias foram reconstruídos com o que a Meta informa de quem seguiu e deixou de seguir; o que for mais antigo que{" "}
                    {seg.firstDate ? `${seg.firstDate.slice(8, 10)}/${seg.firstDate.slice(5, 7)}` : "a primeira coleta"} não existe, porque a Meta não guarda o total dos dias passados.
                  </>
                }
              >
                Projeção não calculada
              </IgNota>
            )}
            {seg.projection.ok && seg.gaps.length > 0 && <IgNota tom="aviso">Há dias sem coleta no período: a estimativa usa só os dias com dado</IgNota>}
          </IgNotas>
        )}
      </NxCard>

      <IgLeitura i={5} itens={leitura} vazio="Ainda não há dado suficiente no período para uma leitura. Troque o período no cabeçalho ou confira a coleta." />

      {cresc && cresc.days.length > 0 && (
        <NxCard
          icone={ic(Scale)}
          titulo="Crescimento: bruto × líquido"
          subtitulo="Novos − saíram = o que mudou no total"
          acao={
            <IgMetodo rotulo="Como ler: Crescimento bruto e líquido">
              Bruto é o número que o Instagram mostra em "Seguidores" (novos no período). Líquido desconta quem deixou de seguir ou saiu do Instagram, e é o que de fato mudou no total. A Meta leva cerca de 2 dias para fechar um dia, então os 2 últimos dias ficam de fora das somas e aparecem no gráfico como "em fechamento".
            </IgMetodo>
          }
        >
          <div className="nx-grade nx-grade--3">
            <NxKpi icone={ic(UserPlus)} rotulo="Novos seguidores (bruto)" valor={cresc.diasMedidos ? `+${fmtN(cresc.novos)}` : "sem dado"} nota="igual ao “Seguidores” do Instagram" />
            <NxKpi icone={ic(UserMinus)} rotulo="Deixaram de seguir" valor={cresc.diasMedidos ? `−${fmtN(cresc.saidas)}` : "sem dado"} nota={cresc.taxaSaida != null ? `${fmtFracao(cresc.taxaSaida)} de quem entrou` : "sem saídas medidas no período"} />
            <NxKpi
              icone={ic(Scale)}
              rotulo="Líquido"
              valor={cresc.diasMedidos ? `${cresc.liquido >= 0 ? "+" : "−"}${fmtN(Math.abs(cresc.liquido))}` : "sem dado"}
              nota={cresc.diasMedidos ? `${plural(cresc.diasMedidos, "dia medido", "dias medidos")}` : undefined}
            />
          </div>
          <IgColunasSaldo
            dias={cresc.days.map((d) => ({ data: d.date, cima: d.novos, baixo: d.saidas, aberto: d.aberto }))}
            formatarData={fmtDiaBR}
            rotulo="Novos seguidores e saídas por dia"
          />
          {(cresc.diasAbertos > 0 || cresc.diasSemSaida > 0 || cresc.diasSemGanhos > 0) && (
            <IgNotas>
              {cresc.diasAbertos > 0 && <IgNota tom="aviso">{plural(cresc.diasAbertos, "dia", "dias")} em fechamento, fora das somas</IgNota>}
              {cresc.diasSemSaida > 0 && <IgNota>{plural(cresc.diasSemSaida, "dia", "dias")} sem saída medida, fora das somas</IgNota>}
              {cresc.diasSemGanhos > 0 && <IgNota>{plural(cresc.diasSemGanhos, "dia", "dias")} sem ganhos medidos, fora das somas</IgNota>}
            </IgNotas>
          )}
        </NxCard>
      )}

      <SeguidoresSemana clientId={clientId} start={start} end={end} />

      {fm && fm.total === 0 ? (
        <SemFonte
          titulo="Nenhum post no período"
          texto="Não há posts do Instagram publicados nesse intervalo, então não dá para comparar formatos nem temas. Troque o período no cabeçalho ou confira se a coleta de posts rodou."
          quem="time Doctor Creator (sincronização de posts)."
        />
      ) : (
        fm && (
          <>
            {!fm.melhorFormato && <IgNota detalhe={fm.melhorFormatoMotivo}>Melhor formato: ainda sem resposta</IgNota>}
            <div className="nx-grade nx-grade--2">
              <TabelaGrupo titulo="Posts por formato" sub={`${fm.total} posts no período · alcance mediano por post`} rows={fm.porFormato} col="Formato" icone={Layers} formato />
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
