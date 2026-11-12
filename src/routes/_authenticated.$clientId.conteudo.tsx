import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClientFontes, getMonthlyMetrics, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { analyzeFollowers, analyzeGrowth, analyzeFormatsAndTemas, fmtDiaBR, type GroupStat } from "@/lib/hub-conteudo";
import { variacoes } from "@/lib/diagnostico-estrategico";
import { lerPeriodo } from "@/lib/leitura-periodo";
import { fatosDoInstagram, fatosSemInstagram } from "@/lib/leitura/fatos-instagram";
import { periodoAnterior } from "@/lib/leitura/tipos";
import { hojeBrasilia } from "@/lib/status-fonte";
import { IconeFormato } from "@/components/visual";
import { Users, UserPlus, UserMinus, Scale, TrendingUp, Trophy, Layers, Tag, Eye, Bookmark, LineChart as LineIcon } from "lucide-react";
import { SyncButton } from "@/components/sync-button";
import { fmtFracao, MIN_POSTS_CONCLUSAO } from "@/lib/metricas";
import { SeguidoresSemana } from "@/components/seguidores-impulsionados";
import { NxCard, NxKpi, NxTag } from "@/components/nx";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { serieContinua } from "@/lib/linha-30-dias";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxAviso, NxCarregando, NxErro, NxRecolhido, NxTabela, NxVazio } from "@/components/nx/blocos";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { IgLinhaSeguidores, IgColunasSaldo } from "@/components/nx/instagram";
import { NxSelo, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxOQueFunciona, type AbaDaProva } from "@/components/nx/o-que-funciona";
import { fraseDoFormato, numerosDoInstagram, vereditoDoInstagram, type EntradaCincoInstagram, type NumeroDoInstagram } from "@/lib/leitura/cinco-instagram";
import { mapaDosPosts, melhorHorario } from "@/lib/mapa-dos-posts";

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

/** Alcance por formato ou por tema: uma tabela com o grupo, os posts, o alcance mediano, a média e os salvos. */
function TabelaGrupo({ titulo, sub, rows: todas, col, icone, formato }: { titulo: string; sub: string; rows: GroupStat[]; col: string; icone: typeof Layers; formato?: boolean }) {
  const { rows, melhor } = ordenarGrupos(todas);
  return (
    <NxCard icone={ic(icone)} titulo={titulo} subtitulo={sub}>
      <NxComoCalcula titulo={`Como ler: ${titulo}`}>
        O alcance mediano é o do post do meio (a mediana não deixa um post viral puxar o número). Só disputa o 1º lugar o grupo com {MIN_POSTS_CONCLUSAO} posts ou mais; os menores aparecem depois, marcados como amostra pequena.
      </NxComoCalcula>
      <NxTabela
        rotulo={`Tabela de ${titulo.toLowerCase()}`}
        colunas={[
          { chave: "grupo", titulo: col },
          { chave: "posts", titulo: "Posts", numerica: true },
          { chave: "mediano", titulo: "Alcance mediano", numerica: true },
          { chave: "media", titulo: "Média", numerica: true },
          { chave: "salvos", titulo: "Salvos por post", numerica: true },
        ]}
        linhas={rows.slice(0, 12).map((r) => ({
          grupo: (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {formato && <IconeFormato formato={r.key} />}
              <span title={String(r.label ?? "")}>{r.label}</span>
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
          ),
          posts: fmtN(r.count),
          mediano: fmtN(r.reachMedian),
          media: fmtN(r.reachMean),
          salvos: r.savedMean.toLocaleString("pt-BR"),
        }))}
        chaveDaLinha={(_, k) => rows[k]?.key ?? k}
        vazio={<p className="nxb-tabela__vazio">Nenhum post do período tem {col.toLowerCase()} informado. A equipe pode classificar na tela Consultar publicações.</p>}
      />
    </NxCard>
  );
}

function ConteudoPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = hojeBrasilia();
  const fim = end > hoje ? hoje : end;
  const anterior = periodoAnterior(start, fim);

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
  // Os mesmos dias do Instagram, só do período anterior: é a base da comparação da leitura. Nada novo é guardado.
  const metricsAnt = useQuery({
    queryKey: ["conteudo-metrics", clientId, anterior.de, anterior.ate],
    queryFn: () => getMonthlyMetrics(clientId, anterior.de, anterior.ate),
    enabled: temIg,
    retry: false,
  });

  const seg = useMemo(() => (metrics.data ? analyzeFollowers(metrics.data, start, end) : null), [metrics.data, start, end]);
  const cresc = useMemo(() => (metrics.data ? analyzeGrowth(metrics.data, start, end) : null), [metrics.data, start, end]);
  const fm = useMemo(() => (posts.data ? analyzeFormatsAndTemas(posts.data) : null), [posts.data]);
  // O mapa de horários dos próprios posts (dia da semana e hora de São Paulo), da lista que a tela já carregou: nenhuma consulta nova.
  const mapa = useMemo(() => mapaDosPosts(posts.data ?? []), [posts.data]);
  const [abaDaProva, setAbaDaProva] = useState<AbaDaProva>("formato");
  // Linha de 30 dias do cartão "Seguidores hoje" (sketch 002): os mesmos pontos de seguidores, sem consulta nova; dia sem contagem é buraco.
  const serieDoCartao = useMemo(() => (seg ? { rotulo: "seguidores", ...serieContinua(seg.points.map((p) => ({ dia: p.date, valor: p.followers }))) } : undefined), [seg]);
  const serie = useMemo(() => (seg ? { datas: seg.points.map((p) => p.date), valores: seg.points.map((p) => p.followers) } : null), [seg]);

  // Contagem em cinza da aba Desempenho na pasta do Instagram (D-07): dias do período com alcance medido, da lista que a tela já
  // carregou (nenhuma consulta nova). Erro ou sem Instagram: null ("—"); carregando: undefined; zero: null (nunca "0").
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/conteudo",
    valor: fontes.isLoading ? undefined : !temIg || metrics.error ? null : metrics.data ? metrics.data.filter((d: { reach?: number | null }) => d.reach != null).length || null : undefined,
  });

  const fatos = useMemo(() => {
    if (!temIg) return fatosSemInstagram("conteudo", { de: start, ate: end }, hoje);
    if (!metrics.data || !posts.data || metricsAnt.isPending) return null;
    const anteriorDias = metricsAnt.data ?? [];
    const leitura = lerPeriodo({ diario: metrics.data, diarioAnterior: anteriorDias, posts: posts.data });
    const comp = variacoes(metrics.data, anteriorDias);
    return fatosDoInstagram(leitura, {
      de: start,
      ate: end,
      hoje,
      posts: posts.data,
      diario: metrics.data,
      anteriorMedido: anteriorDias.some((d) => d.reach != null),
      variacaoLimitada: comp.limitada && comp.motivo ? { motivo: comp.motivo } : null,
      crescimento: cresc ? { novos: cresc.novos, saidas: cresc.saidas, liquido: cresc.liquido, diasMedidos: cresc.diasMedidos } : null,
    });
  }, [temIg, metrics.data, posts.data, metricsAnt.data, metricsAnt.isPending, cresc, start, end, hoje]);

  const cabecalho = {
    tela: "conteudo" as const,
    titulo: "Analisar desempenho",
    pergunta: "O perfil está crescendo e o que alcança mais gente?",
    decisao: "D3" as const,
    meta: <span>{periodLabel}</span>,
    acao: temIg ? <SyncButton clientId={clientId} alvo="posts" /> : undefined,
  };
  // Formato 5 segundos (03.1.1.1): o veredito abre a tela; a leitura de antes, quando existe, mora no "Ver tudo" fechado.
  const pagina = (corpo: ReactNode, leitura: ReactNode, veredito: ReactNode) => (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} veredito={veredito} leitura={leitura} corpo={corpo} />
    </div>
  );
  const carregandoVeredito = <NxVeredito veredito={null} carregando tela="conteudo" />;

  if (fontes.isLoading) return pagina(<NxCarregando linhas={4} />, null, carregandoVeredito);
  if (fontes.error) {
    return pagina(
      <NxErro texto="Não consegui verificar as fontes deste cliente. Atualize a página." onTentar={() => void fontes.refetch()} />,
      null,
      <NxVeredito veredito={null} carregando={false} erro="As fontes não responderam." tela="conteudo" />,
    );
  }
  if (!temIg) {
    return pagina(
      <NxVazio titulo="Instagram não conectado" falta="uma conta de Instagram ligada ao Nexo. Sem ela não há seguidores, posts nem alcance para analisar" quem="equipe_hub" passo="ligar a conta de Instagram do médico à Business Manager do cliente" />,
      <LeituraDaTela fatos={fatos} carregando={false} semSelo />,
      <NxVeredito veredito={vereditoDoInstagram({ diario: [], diarioAnterior: null, formatos: null }, fatos)} carregando={false} tela="conteudo" />,
    );
  }
  if (metrics.isLoading || posts.isLoading) return pagina(<NxCarregando texto="Carregando conteúdo do período…" linhas={4} />, null, carregandoVeredito);
  if (metrics.error || posts.error) {
    return pagina(
      <NxErro texto="Falha ao ler as métricas do Instagram. Tente novamente em instantes." onTentar={() => { void metrics.refetch(); void posts.refetch(); }} />,
      null,
      <NxVeredito veredito={null} carregando={false} erro="O Instagram não respondeu." tela="conteudo" />,
    );
  }

  const ultimo = seg && seg.points.length ? seg.points[seg.points.length - 1].followers : null;
  const melhorFormato = fm?.melhorFormato ?? null;

  const cartoes = [
    <NxCartaoNumero
      key="seg"
      icone={ic(Users)}
      titulo="Seguidores hoje"
      semMedida={ultimo == null}
      valor={ultimo != null ? fmtN(ultimo) : "Sem dado"}
      serie={serieDoCartao}
      legenda={seg?.lastDate ? `última coleta em ${fmtDiaBR(seg.lastDate)}` : "nenhuma coleta no período"}
    />,
    <NxCartaoNumero
      key="var"
      icone={ic(TrendingUp)}
      titulo="Variação no período"
      semMedida={seg?.delta == null}
      valor={seg?.delta == null ? "Sem dado" : `${seg.delta >= 0 ? "+" : "−"}${fmtN(Math.abs(seg.delta))}`}
      legenda={seg?.delta == null ? "precisa de 2 dias com contagem" : `entre ${fmtDiaBR(seg.firstDate!)} e ${fmtDiaBR(seg.lastDate!)}`}
    />,
    <NxCartaoNumero
      key="saldo"
      icone={ic(Scale)}
      titulo="Saldo do período"
      semMedida={!(cresc && cresc.diasMedidos)}
      valor={cresc && cresc.diasMedidos ? `${cresc.liquido >= 0 ? "+" : "−"}${fmtN(Math.abs(cresc.liquido))}` : "Sem dado"}
      legenda={cresc && cresc.diasMedidos ? `entraram ${fmtN(cresc.novos)} e saíram ${fmtN(cresc.saidas)}` : "sem dias medidos no período"}
    />,
    <NxCartaoNumero
      key="formato"
      icone={ic(Trophy)}
      titulo="Formato que mais alcança"
      valor={melhorFormato ? melhorFormato.label : "Sem resposta"}
      legenda={melhorFormato ? `${fmtN(melhorFormato.reachMedian)} contas por post (mediana)` : (fm?.melhorFormatoMotivo ?? "sem posts no período")}
    />,
  ] as const;

  const evolucao = (
    <NxCard
      id="evolucao-seguidores"
      nivel={2}
      icone={ic(LineIcon)}
      titulo="Evolução de seguidores"
      subtitulo="Linha cheia: medido. Tracejada: estimativa, não é promessa"
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
        <NxAviso tom="info" titulo="Sem gráfico:">
          {seg?.points.length ? "só 1 dia tem contagem de seguidores no período." : "nenhum dia do período tem contagem de seguidores."}
        </NxAviso>
      )}
      {/* Só o que pede atenção fica à vista; a cobertura em ordem fica nos Detalhes (régua de 1,5 tela, MEDV-04). */}
      {seg && (seg.coverage < 0.6 || !seg.projection.ok || (seg.projection.ok && seg.gaps.length > 0)) && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {seg.coverage < 0.6 && (
            <NxAviso tom="atencao" titulo={`${seg.daysWithData} de ${seg.expectedDays} dias com contagem`}>
              ({Math.round(seg.coverage * 100)}% do período, mínimo 60%)
            </NxAviso>
          )}
          {!seg.projection.ok && (
            <NxAviso
              tom="atencao"
              titulo="Estimativa não calculada."
              detalhe={
                <>
                  {seg.projection.reason} O total de seguidores é gravado todo dia. Os últimos 28 dias foram reconstruídos com o que a Meta informa de quem seguiu e deixou de seguir; o que for mais antigo que{" "}
                  {seg.firstDate ? `${seg.firstDate.slice(8, 10)}/${seg.firstDate.slice(5, 7)}` : "a primeira coleta"} não existe, porque a Meta não guarda o total dos dias passados.
                </>
              }
            />
          )}
          {seg.projection.ok && seg.gaps.length > 0 && <NxAviso tom="atencao" titulo="Há dias sem coleta no período:">a estimativa usa só os dias com dado.</NxAviso>}
        </div>
      )}
    </NxCard>
  );

  const detalhe = (
    <div style={{ display: "grid", gap: 18 }}>
      {seg && seg.coverage >= 0.6 && (
        <NxCard icone={ic(LineIcon)} titulo="Cobertura da contagem de seguidores" subtitulo="Quantos dias do período têm contagem">
          <NxAviso tom="info" titulo={`${seg.daysWithData} de ${seg.expectedDays} dias com contagem`}>
            ({Math.round(seg.coverage * 100)}% do período, mínimo 60%)
          </NxAviso>
        </NxCard>
      )}
      {cresc && cresc.days.length > 0 && (
        <NxCard icone={ic(Scale)} titulo="Crescimento: bruto × líquido" subtitulo="Novos − saíram = o que mudou no total">
          <NxComoCalcula titulo="Como ler: crescimento bruto e líquido">
            Bruto é o número que o Instagram mostra em "Seguidores" (novos no período). Líquido desconta quem deixou de seguir ou saiu do Instagram, e é o que de fato mudou no total. A Meta leva cerca de 2 dias para fechar um dia, então os 2 últimos dias ficam de fora das somas e aparecem no gráfico como "em fechamento".
          </NxComoCalcula>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <NxKpi icone={ic(UserPlus)} rotulo="Novos seguidores (bruto)" valor={cresc.diasMedidos ? `+${fmtN(cresc.novos)}` : "Sem dado"} nota="igual ao “Seguidores” do Instagram" />
            <NxKpi icone={ic(UserMinus)} rotulo="Deixaram de seguir" valor={cresc.diasMedidos ? `−${fmtN(cresc.saidas)}` : "Sem dado"} nota={cresc.taxaSaida != null ? `${fmtFracao(cresc.taxaSaida)} de quem entrou` : "sem saídas medidas no período"} />
            <NxKpi
              icone={ic(Scale)}
              rotulo="Líquido"
              valor={cresc.diasMedidos ? `${cresc.liquido >= 0 ? "+" : "−"}${fmtN(Math.abs(cresc.liquido))}` : "Sem dado"}
              nota={cresc.diasMedidos ? `${plural(cresc.diasMedidos, "dia medido", "dias medidos")}` : undefined}
            />
          </div>
          <IgColunasSaldo
            dias={cresc.days.map((d) => ({ data: d.date, cima: d.novos, baixo: d.saidas, aberto: d.aberto }))}
            formatarData={fmtDiaBR}
            rotulo="Novos seguidores e saídas por dia"
          />
          {(cresc.diasAbertos > 0 || cresc.diasSemSaida > 0 || cresc.diasSemGanhos > 0) && (
            <div style={{ display: "grid", gap: 8 }}>
              {cresc.diasAbertos > 0 && <NxAviso tom="atencao" titulo={`${plural(cresc.diasAbertos, "dia", "dias")} em fechamento,`}>fora das somas.</NxAviso>}
              {cresc.diasSemSaida > 0 && <NxAviso tom="info" titulo={`${plural(cresc.diasSemSaida, "dia", "dias")} sem saída medida,`}>fora das somas.</NxAviso>}
              {cresc.diasSemGanhos > 0 && <NxAviso tom="info" titulo={`${plural(cresc.diasSemGanhos, "dia", "dias")} sem ganhos medidos,`}>fora das somas.</NxAviso>}
            </div>
          )}
        </NxCard>
      )}

      <SeguidoresSemana clientId={clientId} start={start} end={end} />

      {fm && fm.total === 0 ? (
        <NxVazio titulo="Nenhum post no período" falta="posts do Instagram publicados nesse intervalo, então não dá para comparar formatos nem temas" quem="equipe_hub" passo="trocar o período no cabeçalho ou conferir se a coleta de posts rodou" />
      ) : (
        fm && (
          <>
            {!fm.melhorFormato && <NxAviso tom="info" titulo="Melhor formato: ainda sem resposta." detalhe={fm.melhorFormatoMotivo} />}
            <NxRecolhido titulo="Alcance por formato e por tema" resumo="Duas tabelas com o alcance mediano de cada grupo de posts">
              <div style={{ display: "grid", gap: 18 }}>
                <TabelaGrupo titulo="Posts por formato" sub={`${fm.total} posts no período · alcance mediano por post`} rows={fm.porFormato} col="Formato" icone={Layers} formato />
                <TabelaGrupo
                  titulo="Posts por pilar ou tema"
                  sub={`${fm.comTema} de ${fm.total} posts têm tema classificado${fm.comTema < fm.total ? " (classifique os demais em Consultar publicações)" : ""}`}
                  rows={fm.porTema}
                  col="Tema"
                  icone={Tag}
                />
              </div>
            </NxRecolhido>
          </>
        )
      )}

      <NxComoCalcula titulo="Como ler esta tela">
        Seguidores e o que o conteúdo do período entregou. A leitura do topo usa só regras fixas sobre os números desta tela; nada é guardado e nenhuma previsão entra nela. Período: {periodLabel}.
      </NxComoCalcula>
    </div>
  );

  // Formato 5 segundos (03.1.1.1, plano 07): o veredito de alcance e seguidores abre a tela e os 3 números-chave vêm com a variação contra o
  // período anterior da PRÓPRIA clínica. Tudo o que a aba mostrava antes (cartões, evolução, detalhes e a leitura) mora no "Ver tudo", fechado.
  const entradaCinco: EntradaCincoInstagram = {
    diario: metrics.data ?? [],
    diarioAnterior: metricsAnt.isPending ? null : (metricsAnt.data ?? []),
    posts: posts.data ?? [],
    crescimento: cresc ? { novos: cresc.novos, saidas: cresc.saidas, liquido: cresc.liquido, diasMedidos: cresc.diasMedidos } : null,
    formatos: fm,
  };
  const carregandoFatos = fatos == null;
  const veredito = carregandoFatos ? null : vereditoDoInstagram(entradaCinco, fatos);
  // A prova: formato, horário e tema dos próprios posts. Sem posts no período, o aviso que a tela já tinha.
  const prova =
    fm && fm.total > 0 ? (
      <NxOQueFunciona formatos={fm.porFormato} temas={fm.porTema} mapa={mapa} melhor={melhorHorario(mapa)} fraseFormato={fraseDoFormato(fm)} aba={abaDaProva} aoTrocarAba={setAbaDaProva} />
    ) : (
      <NxVazio titulo="Nenhum post no período" falta="posts do Instagram publicados nesse intervalo, então não dá para comparar formatos, horários nem temas" quem="equipe_hub" passo="trocar o período no cabeçalho ou conferir se a coleta de posts rodou" />
    );
  const ICONE_DO_NUMERO = { seguidores: ic(Users), alcance: ic(Eye), salvos: ic(Bookmark) } as const;
  const cartoesCinco = numerosDoInstagram(entradaCinco).map((n) => <CartaoDeNumeroIg key={n.id} n={n} icone={ICONE_DO_NUMERO[n.id]} />);

  return (
    <div className="nexo-ig">
      <PaginaNexo
        {...cabecalho}
        veredito={<NxVeredito veredito={veredito} carregando={carregandoFatos} tela="conteudo" />}
        leitura={<LeituraDaTela fatos={fatos} carregando={carregandoFatos} semSelo />}
        cartoes={cartoesCinco as unknown as [ReactNode, ReactNode?, ReactNode?]}
        principal={prova}
        resumoDoVerTudo="temas, horários, formatos e a contagem de seguidores"
        detalhe={
          <div style={{ display: "grid", gap: 18 }}>
            <div className="nx-grade nx-grade--4">{cartoes}</div>
            {evolucao}
            {detalhe}
          </div>
        }
      />
    </div>
  );
}

/**
 * Um dos 3 números-chave no formato 5 segundos: o número, a legenda, a variação contra a PRÓPRIA clínica (sinal na pílula) e o selo com a
 * palavra. Sem comparação, o selo "Falta dado" em cinza; sem medida, "Sem dado" e o motivo (nunca 0). Só apresentação.
 */
function CartaoDeNumeroIg({ n, icone }: { n: NumeroDoInstagram; icone: ReactNode }) {
  const semMedida = n.valorTexto == null;
  return (
    <NxCartaoNumero
      icone={icone}
      titulo={n.titulo}
      valor={n.valorTexto}
      legenda={semMedida ? undefined : n.legenda}
      semMedida={semMedida}
      variacao={n.textoDaVariacao ? { texto: n.textoDaVariacao } : null}
      extra={
        semMedida ? (
          <p className="nx-cinco-falta" data-falta-dado>{`Falta dado: ${n.motivo ?? "sem medida neste período"}`}</p>
        ) : n.selo ? (
          <NxSelo tom={n.selo.tom} texto={n.selo.texto} />
        ) : null
      }
      serie={n.serie ?? undefined}
    />
  );
}
