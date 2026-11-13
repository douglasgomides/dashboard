import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes, getPostsForAnalytics, limitesBR } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { getAudiencia, fmtN, fmtPct } from "@/lib/audiencia";
import { METRICAS, DIFERENCA_MINIMA, topN, padroesDoTop, ehReel, ehPostDeFeed, valorDaMetrica, type MetricaTop } from "@/lib/top-conteudo";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
import { lerPeriodo } from "@/lib/leitura-periodo";
import { fatosDoInstagram, fatosSemInstagram } from "@/lib/leitura/fatos-instagram";
import { leituraDaAba } from "@/lib/leitura/leitura-das-abas";
import { cabecaDaDistancia, cabecaDoRestoDaLista, cabecaDosPadroes, cabecaDosStoriesNoAr } from "@/lib/leitura/ver-tudo-top";
import { hojeBrasilia } from "@/lib/status-fonte";
import { temaParaExibir } from "@/lib/texto-que-cabe";
import { Miniatura, IconeFormato } from "@/components/visual";
import { Trophy, Eye, Target, Bookmark, Share2, Heart, MessageCircle, FastForward, Timer, Clock, UserPlus, Reply, Users, Radio, Film, Image as ImageIcon, CircleDot, BarChart3, Layers, ArrowDownToLine } from "lucide-react";
import { NxCard, NxTag, NxListRow, NxColunas } from "@/components/nx";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { NxComecoDosDetalhes, NxDescobertasDaAba } from "@/components/nx/leitura-da-aba";
import { NxAviso, NxCarregando, NxErro, NxRecolhido, NxVazio } from "@/components/nx/blocos";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { IgAbas, IgVitrine } from "@/components/nx/instagram";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";

export const Route = createFileRoute("/_authenticated/$clientId/top")({
  component: TopPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
type Aba = "posts" | "reels" | "stories";
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ic = (Icon: typeof Trophy) => <Icon size={17} strokeWidth={1.7} aria-hidden />;
const ia = (Icon: typeof Trophy) => <Icon size={16} strokeWidth={1.8} aria-hidden />;

function quando(iso: string | null) {
  if (!iso) return "";
  const { weekday, hour } = brazilWeekdayAndHour(iso);
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${DIAS[weekday]}, ${data}, ${hour}h`;
}
const gancho = (c: string | null | undefined) => (c ?? "").split("\n")[0].trim();
const nomeFormato = (f: string) => (f === "carrossel" ? "Carrossel" : f === "estatico" ? "Imagem" : f === "reels" ? "Reels" : f);

/** Números de apoio de cada linha (o da métrica escolhida vai no fim, grande). */
function Numeros({ itens }: { itens: [typeof Eye, string, string][] }) {
  return (
    <>
      {itens.map(([Icon, valor, rotulo]) => (
        <span key={rotulo} title={rotulo}>
          <Icon size={13} aria-hidden /> {valor}
          <span className="sr-only"> {rotulo}</span>
        </span>
      ))}
    </>
  );
}

function numerosDoPost(p: any, reels: boolean): [typeof Eye, string, string][] {
  const out: [typeof Eye, string, string][] = [];
  if (p.reach != null) out.push([Target, fmtN(p.reach), "Alcance"]);
  if (p.saved != null) out.push([Bookmark, fmtN(p.saved), "Salvos"]);
  if (p.shares != null) out.push([Share2, fmtN(p.shares), "Compartilhamentos"]);
  if (p.likes != null) out.push([Heart, fmtN(p.likes), "Curtidas"]);
  if (p.comments != null) out.push([MessageCircle, fmtN(p.comments), "Comentários"]);
  if (reels && p.views != null) out.push([Eye, fmtN(p.views), "Visualizações"]);
  if (reels && p.reel_skip_rate != null) out.push([FastForward, fmtPct(Number(p.reel_skip_rate) * (Number(p.reel_skip_rate) <= 1 ? 100 : 1)), "Pulam"]);
  if (reels && p.reel_avg_watch_time_ms != null) out.push([Timer, `${(Number(p.reel_avg_watch_time_ms) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`, "Tempo médio"]);
  return out;
}

function ListaDePosts({ itens, metrica, reels, inicio = 0 }: { itens: { p: any; v: number }[]; metrica: MetricaTop; reels: boolean; inicio?: number }) {
  const rotulo = METRICAS.find((m) => m.id === metrica)?.rotulo ?? "";
  const fmtV = (v: number) => (metrica === "taxa_salvamento" ? fmtPct(v, 2) : fmtN(v));
  return (
    <ol className="nx-lista ig-ranking">
      {itens.map(({ p, v }, k) => (
        <li key={p.id}>
          <NxListRow
            href={p.permalink ?? undefined}
            inicio={
              <span className="ig-ranking__inicio">
                <span className="nx-rank" aria-label={`${inicio + k + 1}º lugar`}>
                  {inicio + k + 1}
                </span>
                <Miniatura url={p.thumbnail_url} formato={p.format} className="h-14 w-14" />
              </span>
            }
            titulo={gancho(p.caption) || "(sem legenda)"}
            sub={
              <>
                {p.format && (
                  <span>
                    <IconeFormato formato={p.format} size={13} /> {reels ? "Reels" : nomeFormato(p.format)}
                  </span>
                )}
                {p.tema && <span className="ig-tema">{temaParaExibir(p.tema)}</span>}
                <span>
                  <Clock size={12} aria-hidden /> {quando(p.posted_at)}
                </span>
                <Numeros itens={numerosDoPost(p, reels)} />
              </>
            }
            fim={
              <span className="ig-num-fim">
                <b>{fmtV(v)}</b>
                <small>{rotulo.toLowerCase()}</small>
              </span>
            }
          />
        </li>
      ))}
    </ol>
  );
}

const METRICAS_STORY = [
  { id: "reach", rotulo: "Alcance" },
  { id: "views", rotulo: "Visualizações" },
  { id: "total_interactions", rotulo: "Interações" },
  { id: "replies", rotulo: "Respostas" },
  { id: "shares", rotulo: "Compartilhamentos" },
  { id: "profile_visits", rotulo: "Visitas ao perfil" },
  { id: "follows", rotulo: "Novos seguidores" },
] as const;
type MetricaStory = (typeof METRICAS_STORY)[number]["id"];

const numerosStory = (s: any): [typeof Eye, string, string][] =>
  [
    s.reach != null && [Target, fmtN(s.reach), "Alcance"],
    s.views != null && [Eye, fmtN(s.views), "Visualizações"],
    s.replies != null && [Reply, fmtN(s.replies), "Respostas"],
    s.shares != null && [Share2, fmtN(s.shares), "Compartilhamentos"],
    s.profile_visits != null && [Users, fmtN(s.profile_visits), "Visitas ao perfil"],
    s.follows != null && [UserPlus, fmtN(s.follows), "Novos seguidores"],
  ].filter(Boolean) as [typeof Eye, string, string][];

function TopPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = hojeBrasilia();
  const [aba, setAba] = useState<Aba>("posts");
  const [metrica, setMetrica] = useState<MetricaTop>("saved");
  const [metricaStory, setMetricaStory] = useState<MetricaStory>("reach");

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const temIg = fontes.data?.tem_instagram === true;
  const posts = useQuery({
    queryKey: ["top-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });
  // Stories: guardados no período e no ar agora. Só buscados quando a aba de stories está aberta.
  const guardados = useQuery({
    queryKey: ["stories-guardados", clientId, start, end],
    enabled: temIg && aba === "stories",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("instagram_stories")
        .select("*")
        .eq("client_id", clientId)
        .gte("posted_at", limitesBR(start, end).desde)
        .lt("posted_at", limitesBR(start, end).antesDe)
        .limit(2000);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205" || /instagram_stories/.test(error.message ?? "")) return { indisponivel: true as const, linhas: [] as any[] };
        throw new Error(error.message);
      }
      return { indisponivel: false as const, linhas: (data ?? []) as any[] };
    },
    retry: false,
  });
  const aoVivo = useQuery({ queryKey: ["audiencia", clientId], queryFn: () => getAudiencia(clientId), staleTime: 20 * 60_000, retry: false, enabled: temIg && aba === "stories" });

  const todosDoTipo = useMemo(() => (posts.data ?? []).filter((p) => (aba === "reels" ? ehReel(p) : ehPostDeFeed(p))), [posts.data, aba]);
  const top = useMemo(() => (aba === "stories" ? [] : topN(posts.data ?? [], aba === "reels" ? "reel" : "post", metrica, 20)), [posts.data, aba, metrica]);
  const padroes = useMemo(() => padroesDoTop(top.map((x) => x.p), todosDoTipo), [top, todosDoTipo]);
  const topStories = useMemo(
    () =>
      (guardados.data?.linhas ?? [])
        .filter((s) => s[metricaStory] != null)
        .sort((a, b) => Number(b[metricaStory]) - Number(a[metricaStory]))
        .slice(0, 20),
    [guardados.data, metricaStory],
  );

  // A leitura é dos posts do período (alcance, formato, dependência de um post). Só regra, sem consulta nova.
  const fatos = useMemo(() => {
    if (!temIg) return fatosSemInstagram("top", { de: start, ate: end }, hoje);
    if (!posts.data) return null;
    return fatosDoInstagram(lerPeriodo({ diario: [], posts: posts.data }), { de: start, ate: end, hoje, posts: posts.data }, "top");
  }, [temIg, posts.data, start, end, hoje]);

  // Contagem em cinza da aba Destaques na pasta do Instagram (D-07): posts e reels em destaque da lista que a tela já carregou
  // (as duas listas, independente da aba escolhida), sem consulta nova. null quando a tela diz que não há dado.
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/top",
    valor: fontes.isLoading ? undefined : !temIg || posts.error ? null : posts.data ? topN(posts.data, "post", metrica, 20).length + topN(posts.data, "reel", metrica, 20).length || null : undefined,
  });

  const rotuloMetrica = METRICAS.find((m) => m.id === metrica)?.rotulo ?? "";
  const rotuloStory = METRICAS_STORY.find((m) => m.id === metricaStory)?.rotulo ?? "";
  const fmtV = (v: number) => (metrica === "taxa_salvamento" ? fmtPct(v, 2) : fmtN(v));
  const nomeTipo = aba === "reels" ? "Reels" : "posts";
  const colunas = useMemo(() => top.slice(0, 10).map((x, i) => ({ rotulo: `${i + 1}º`, valor: x.v, texto: metrica === "taxa_salvamento" ? fmtPct(x.v, 2) : fmtN(x.v) })), [top, metrica]);

  const abas = (
    <IgAbas
      rotulo="Tipo de publicação"
      ativa={aba}
      onTrocar={setAba}
      abas={[
        { id: "posts", rotulo: "Top 20 posts", icone: ia(ImageIcon) },
        { id: "reels", rotulo: "Top 20 Reels", icone: ia(Film) },
        { id: "stories", rotulo: "Top 20 stories", icone: ia(CircleDot) },
      ]}
    />
  );
  const cabecalho = {
    tela: "top" as const,
    titulo: "Encontrar destaques",
    pergunta: "Quais publicações mais se destacaram e por quê?",
    decisao: "D3" as const,
    meta: (
      <>
        <span>{periodLabel}</span>
        {temIg && abas}
      </>
    ),
  };
  const pagina = (corpo: ReactNode, leitura: ReactNode) => (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} leitura={leitura} corpo={corpo} />
    </div>
  );

  // A leitura do período saiu (quick-ver-tudo-abas, João 13/11/2026): no lugar da caixa, até 3 descobertas no topo da aba, com o que ela
  // dizia e a aba ainda não mostra (o pódio é por métrica; o post que mais alcançou e o formato que alcança mais só a leitura dizia).
  const semDescoberta = (carregando: boolean) => <NxDescobertasDaAba itens={[]} carregando={carregando} clientId={clientId} />;
  if (fontes.isLoading) return pagina(<NxCarregando linhas={4} />, semDescoberta(true));
  if (fontes.error) {
    return pagina(
      <NxErro texto="Não consegui verificar as fontes deste cliente. Atualize a página." onTentar={() => void fontes.refetch()} />,
      semDescoberta(false),
    );
  }
  if (!temIg) {
    return pagina(
      <NxVazio titulo="Instagram não conectado" falta="uma conta de Instagram ligada ao Nexo. Sem ela não há posts nem alcance para ranquear" quem="equipe_hub" passo="ligar a conta de Instagram do médico à Business Manager do cliente" />,
      // O aviso acima já diz o que falta e quem resolve: a leitura (portão fechado) não repete.
      semDescoberta(false),
    );
  }
  if (posts.error) {
    return pagina(
      <NxErro texto="Falha ao ler os posts do período." onTentar={() => void posts.refetch()} />,
      semDescoberta(false),
    );
  }
  const carregandoFatos = posts.isLoading || fatos == null;
  // O que a aba já mostra à vista (cartões e pódio): o que a leitura diz com esses números não volta.
  const podio = top.slice(0, 3);
  const textoDoTopo = [
    `${todosDoTipo.length} ${nomeTipo} no período`,
    ...podio.map(({ p, v }) => `${gancho(p.caption)} ${fmtV(v)} ${rotuloMetrica.toLowerCase()}`),
    top.length ? `${fmtV(top[top.length - 1].v)} ${rotuloMetrica.toLowerCase()} do ${top.length}º lugar` : "",
  ];
  const { visiveis, resto } = carregandoFatos ? { visiveis: [], resto: [] } : leituraDaAba({ fatos, textoDoTopo });
  const leitura = <NxDescobertasDaAba itens={visiveis} carregando={carregandoFatos} clientId={clientId} dateRange={dateRangeState} />;
  const comecoDosDetalhes = (filhos: ReactNode) => (
    <NxComecoDosDetalhes fatos={carregandoFatos ? null : fatos} resto={resto} clientId={clientId} dateRange={dateRangeState}>
      {filhos}
    </NxComecoDosDetalhes>
  );

  // ----- Stories -----
  if (aba === "stories") {
    const vivos = aoVivo.data?.dados?.stories_ao_vivo;
    const storiesOk = guardados.data && !guardados.data.indisponivel;
    const cartoesStories = storiesOk
      ? ([
          <NxCartaoNumero key="g" icone={ic(CircleDot)} titulo="Stories guardados" valor={fmtN(guardados.data!.linhas.length)} legenda="no período" />,
          <NxCartaoNumero key="p" semMedida={!topStories[0]} icone={ic(Trophy)} titulo="1º lugar" valor={topStories[0] ? fmtN(Number(topStories[0][metricaStory])) : "Sem dado"} legenda={rotuloStory.toLowerCase()} />,
          <NxCartaoNumero key="v" semMedida={!vivos?.ok} icone={ic(Radio)} titulo="No ar agora" valor={vivos?.ok ? fmtN(vivos.dados.length) : "Sem dado"} legenda="lidos ao vivo da Meta" />,
        ] as unknown as [ReactNode, ReactNode?, ReactNode?, ReactNode?])
      : undefined;
    const corpoStories = (
      <>
        {guardados.isLoading && <NxCarregando texto="Lendo os stories…" />}
        {guardados.error && <NxErro texto="Falha ao ler os stories guardados." onTentar={() => void guardados.refetch()} />}
        {guardados.data?.indisponivel && (
          <NxAviso
            tom="atencao"
            titulo="Ranking de stories em breve: ainda não há stories guardados."
            detalhe="Stories saem do ar em 24 horas e a Meta não guarda o histórico. O Nexo passa a guardar cada story todo dia, mas essa guarda ainda não está ligada neste banco. Depois disso o ranking se forma a partir do primeiro dia."
          />
        )}
        {storiesOk && (
          <NxCard
            icone={ic(CircleDot)}
            titulo={`Top ${topStories.length || 20} stories`}
            subtitulo={`${guardados.data!.linhas.length} stories guardados no período`}
            acao={
              <div className="ig-filtros">
                <label htmlFor="metrica-story">Ordenar por</label>
                <select id="metrica-story" className="ig-select" value={metricaStory} onChange={(e) => setMetricaStory(e.target.value as MetricaStory)}>
                  {METRICAS_STORY.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {topStories.length === 0 ? (
              <NxAviso tom="info" titulo="Nenhum story guardado neste período ainda.">O Nexo guarda os que estão no ar a cada atualização do Instagram.</NxAviso>
            ) : (
              <ol className="nx-lista ig-ranking">
                {topStories.map((s, i) => (
                  <li key={s.id}>
                    <NxListRow
                      href={s.permalink ?? undefined}
                      inicio={
                        <span className="ig-ranking__inicio">
                          <span className="nx-rank" aria-label={`${i + 1}º lugar`}>
                            {i + 1}
                          </span>
                          <Miniatura url={s.thumbnail_url} formato="stories" className="h-14 w-14" />
                        </span>
                      }
                      titulo={`Story de ${quando(s.posted_at)}`}
                      sub={<Numeros itens={numerosStory(s)} />}
                      fim={
                        <span className="ig-num-fim">
                          <b>{fmtN(Number(s[metricaStory]))}</b>
                          <small>{rotuloStory.toLowerCase()}</small>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ol>
            )}
            <NxAviso tom="info" titulo="Números ainda parciais:">as métricas de um story são lidas enquanto ele está no ar; stories postados há poucas horas podem ter números ainda incompletos.</NxAviso>
          </NxCard>
        )}
      </>
    );
    const detalheStories = comecoDosDetalhes(
      <NxBlocoDoVerTudo rotulo="Stories no ar agora" cabeca={aoVivo.isLoading ? { tipo: "falta", motivo: "lendo os stories na Meta" } : cabecaDosStoriesNoAr(vivos ? { ok: vivos.ok, alcances: vivos.ok ? vivos.dados.map((s) => s.alcance) : [] } : null)}>
      <NxCard icone={ic(Radio)} titulo="Stories no ar agora" subtitulo="Ao vivo da Meta, com os números de agora">
        {aoVivo.isLoading ? (
          <NxCarregando texto="Lendo da Meta…" />
        ) : !vivos ? (
          <NxAviso tom="atencao" titulo="Não foi possível ler os stories agora.">{aoVivo.data?.nada_a_fazer ?? aoVivo.data?.erro ?? ""}</NxAviso>
        ) : !vivos.ok ? (
          <NxAviso tom="atencao" titulo="A Meta não devolveu os stories:">{vivos.erro}</NxAviso>
        ) : vivos.dados.length === 0 ? (
          <NxAviso tom="info" titulo="Nenhum story no ar neste momento." />
        ) : (
          <ul className="nx-lista">
            {vivos.dados.map((s) => (
              <li key={s.id}>
                <NxListRow
                  href={s.permalink ?? undefined}
                  inicio={<Miniatura url={s.thumbnail_url} formato="stories" className="h-14 w-14" />}
                  titulo={`Story de ${quando(s.postado_em)}`}
                  sub={
                    <Numeros
                      itens={[
                        [Target, fmtN(s.alcance ?? 0), "Alcance"],
                        [Eye, fmtN(s.views ?? 0), "Visualizações"],
                        [Reply, fmtN(s.respostas ?? 0), "Respostas"],
                        [Share2, fmtN(s.compartilhamentos ?? 0), "Compartilhamentos"],
                      ]}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </NxCard>
      </NxBlocoDoVerTudo>,
    );
    return (
      <div className="nexo-ig">
        <PaginaNexo {...cabecalho} leitura={leitura} cartoes={cartoesStories} corpo={corpoStories} detalhe={detalheStories} />
      </div>
    );
  }

  // ----- Posts e Reels -----
  if (posts.isLoading) return pagina(<NxCarregando texto="Lendo os posts…" linhas={4} />, leitura);
  if (top.length === 0) {
    return pagina(
      <NxVazio titulo={`Sem ${nomeTipo} com essa métrica`} falta={`${aba === "reels" ? "Reels" : "posts"} do período com a métrica escolhida`} quem="equipe_hub" passo="trocar o período no topo ou a métrica" />,
      leitura,
    );
  }

  const cartoes = [
    <NxCartaoNumero key="n" icone={ic(Layers)} titulo={`${aba === "reels" ? "Reels" : "Posts"} no período`} valor={fmtN(todosDoTipo.length)} legenda={`o ranking mostra os ${top.length} melhores`} />,
    <NxCartaoNumero key="1" icone={ic(Trophy)} titulo="1º lugar" valor={fmtV(top[0].v)} legenda={rotuloMetrica.toLowerCase()} />,
    <NxCartaoNumero key="u" icone={ic(ArrowDownToLine)} titulo={`Para entrar no top ${top.length}`} valor={fmtV(top[top.length - 1].v)} legenda={`${rotuloMetrica.toLowerCase()} do ${top.length}º lugar`} />,
  ] as unknown as [ReactNode, ReactNode?, ReactNode?, ReactNode?];

  const lugares = top.map((x) => ({ valor: x.v, texto: fmtV(x.v) }));
  const principal = (
    <NxBlocoDoVerTudo rotulo="Distância entre os primeiros" cabeca={cabecaDaDistancia(lugares.slice(0, colunas.length), rotuloMetrica.toLowerCase())}>
    <NxCard
      nivel={2}
      icone={ic(BarChart3)}
      titulo="Distância entre os primeiros"
      subtitulo={`${rotuloMetrica} do 1º ao ${colunas.length}º lugar`}
    >
      <NxComoCalcula titulo="Como ler: distância entre os primeiros">
        Se o 1º lugar fica muito acima dos outros, foi um post fora da curva; se as colunas são parecidas, o bom resultado se repete e vale olhar o que eles têm em comum.
      </NxComoCalcula>
      <NxColunas dados={colunas} destaque={0} formatarEixo={(n) => (metrica === "taxa_salvamento" ? fmtPct(n, 1) : fmtN(n))} rotulo={`${rotuloMetrica} dos ${colunas.length} primeiros`} />
    </NxCard>
    </NxBlocoDoVerTudo>
  );

  // Régua de 1,5 tela (MEDV-04): o pódio é o trabalho da aba e fica à vista, com o "Ordenar por" no cabeçalho do cartão e a
  // frase "só alcance orgânico" no subtítulo dele; o aviso completo e o gráfico da distância entre os primeiros passam para os Detalhes.
  const corpo = (
    <NxCard
      icone={ic(Trophy)}
      titulo="Pódio"
      subtitulo={`Os 3 ${nomeTipo} com mais ${rotuloMetrica.toLowerCase()} no período. Números só do alcance orgânico.`}
      acao={
        posts.data ? (
          <div className="ig-filtros">
            <label htmlFor="metrica-top">Ordenar por</label>
            <select id="metrica-top" className="ig-select" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaTop)}>
              {METRICAS.filter((m) => aba === "reels" || m.id !== "views" || todosDoTipo.some((p) => valorDaMetrica(p, "views") != null)).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </div>
        ) : undefined
      }
    >
      <IgVitrine
        itens={top.slice(0, 3).map(({ p, v }) => ({
          id: p.id,
          href: p.permalink,
          imagem: <Miniatura url={p.thumbnail_url} formato={p.format} className="w-full" />,
          titulo: gancho(p.caption) || "(sem legenda)",
          valor: fmtV(v),
          rotulo: rotuloMetrica.toLowerCase(),
          extra: (
            <>
              {p.format && <NxTag tom="g">{aba === "reels" ? "Reels" : nomeFormato(p.format)}</NxTag>}
              {p.tema && <NxTag tom="b">{temaParaExibir(p.tema)}</NxTag>}
              <NxTag tom="g">{quando(p.posted_at)}</NxTag>
            </>
          ),
        }))}
      />
    </NxCard>
  );

  // O aviso "Números só do alcance orgânico" saiu (quick-ver-tudo-abas): o pódio já diz isso no subtítulo e o "Como ler esta tela" explica.
  const detalhe = comecoDosDetalhes(
    <>
      {principal}
      <NxBlocoDoVerTudo rotulo="O que os melhores têm em comum" cabeca={cabecaDosPadroes(padroes.frases, padroes.motivoVazio, DIFERENCA_MINIMA)}>
      <NxCard icone={ic(Target)} titulo="O que os melhores têm em comum" subtitulo="Um padrão para testar, não uma regra">
        {padroes.frases.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 15, lineHeight: "22px", fontWeight: 500 }}>
            {padroes.frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <NxAviso tom="info" titulo="Sem padrão claro:">{padroes.motivoVazio}</NxAviso>
        )}
        <NxComoCalcula titulo="Como ler: o que os melhores têm em comum">Só entra o que difere 15 pontos percentuais ou mais do conjunto de todos os posts do período.</NxComoCalcula>
      </NxCard>
      </NxBlocoDoVerTudo>
      {top.length > 3 && (
        <NxBlocoDoVerTudo cabeca={cabecaDoRestoDaLista(lugares, rotuloMetrica.toLowerCase())}>
        <NxRecolhido titulo={`Do 4º ao ${top.length}º lugar`} resumo={`${todosDoTipo.length} ${nomeTipo} no período, por ${rotuloMetrica.toLowerCase()}`}>
          <ListaDePosts itens={top.slice(3)} inicio={3} metrica={metrica} reels={aba === "reels"} />
        </NxRecolhido>
        </NxBlocoDoVerTudo>
      )}
      <NxComoCalcula titulo="Como ler esta tela">
        Os 20 melhores posts, Reels e stories do período ({periodLabel}), na métrica que você escolher, e o que eles têm em comum. Curtidas, comentários, visualizações e alcance de cada post são só do alcance orgânico: o Instagram mostra no post o total com impulsionamento, então um post turbinado aparece com número maior lá do que aqui.
      </NxComoCalcula>
    </>,
  );

  return (
    <div className="nexo-ig">
      <PaginaNexo {...cabecalho} leitura={leitura} cartoes={cartoes} corpo={corpo} detalhe={detalhe} />
    </div>
  );
}
