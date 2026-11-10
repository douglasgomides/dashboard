import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes, getPostsForAnalytics, limitesBR } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { getAudiencia, fmtN, fmtPct } from "@/lib/audiencia";
import { METRICAS, topN, padroesDoTop, ehReel, ehPostDeFeed, valorDaMetrica, type MetricaTop } from "@/lib/top-conteudo";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
import { Miniatura, IconeFormato } from "@/components/visual";
import { Trophy, Eye, Target, Bookmark, Share2, Heart, MessageCircle, FastForward, Timer, Clock, UserPlus, Reply, Users, Radio, Film, Image as ImageIcon, CircleDot, BarChart3, Layers, ArrowDownToLine } from "lucide-react";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";
import { NxCard, NxKpi, NxTag, NxListRow, NxColunas } from "@/components/nx";
import { IgCabecalho, IgLeitura, IgNota, IgNotas, IgAbas, IgVitrine, IgMetodo } from "@/components/nx/instagram";

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
                {p.tema && <span className="ig-tema">{p.tema}</span>}
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

function Stories({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const [metrica, setMetrica] = useState<(typeof METRICAS_STORY)[number]["id"]>("reach");
  const guardados = useQuery({
    queryKey: ["stories-guardados", clientId, start, end],
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
  const aoVivo = useQuery({ queryKey: ["audiencia", clientId], queryFn: () => getAudiencia(clientId), staleTime: 20 * 60_000, retry: false });

  const top = useMemo(
    () =>
      (guardados.data?.linhas ?? [])
        .filter((s) => s[metrica] != null)
        .sort((a, b) => Number(b[metrica]) - Number(a[metrica]))
        .slice(0, 20),
    [guardados.data, metrica],
  );
  const vivos = aoVivo.data?.dados?.stories_ao_vivo;
  const rotuloMetrica = METRICAS_STORY.find((m) => m.id === metrica)?.rotulo ?? "";

  const numerosStory = (s: any): [typeof Eye, string, string][] =>
    [
      s.reach != null && [Target, fmtN(s.reach), "Alcance"],
      s.views != null && [Eye, fmtN(s.views), "Visualizações"],
      s.replies != null && [Reply, fmtN(s.replies), "Respostas"],
      s.shares != null && [Share2, fmtN(s.shares), "Compartilhamentos"],
      s.profile_visits != null && [Users, fmtN(s.profile_visits), "Visitas ao perfil"],
      s.follows != null && [UserPlus, fmtN(s.follows), "Novos seguidores"],
    ].filter(Boolean) as [typeof Eye, string, string][];

  return (
    <>
      {guardados.data?.indisponivel && (
        <IgNota
          tom="aviso"
          detalhe={
            <>
              Stories saem do ar em 24 horas e a Meta não guarda o histórico. O Nexo passa a guardar cada story todo dia, mas a tabela <code>instagram_stories</code> ainda não existe neste banco: falta aplicar a migração{" "}
              <code>20261007120000_instagram_stories.sql</code>. Depois disso o ranking se forma a partir do primeiro dia.
            </>
          }
        >
          Ranking de stories em breve: migração pendente
        </IgNota>
      )}
      {guardados.data && !guardados.data.indisponivel && (
        <>
          <section className="nx-grade nx-grade--3 ig-kpis" aria-label="Números dos stories">
            <NxKpi i={0} icone={ic(CircleDot)} rotulo="Stories guardados" valor={fmtN(guardados.data.linhas.length)} nota="no período" />
            <NxKpi i={1} icone={ic(Trophy)} rotulo="1º lugar" valor={top[0] ? fmtN(Number(top[0][metrica])) : "sem dado"} nota={rotuloMetrica.toLowerCase()} />
            <NxKpi i={2} icone={ic(Radio)} rotulo="No ar agora" valor={vivos?.ok ? fmtN(vivos.dados.length) : "sem dado"} nota="lidos ao vivo da Meta" />
          </section>
          <NxCard
            icone={ic(CircleDot)}
            titulo={`Top ${top.length || 20} stories`}
            subtitulo={`${guardados.data.linhas.length} stories guardados no período`}
            acao={
              <div className="ig-filtros">
                <label htmlFor="metrica-story">Ordenar por</label>
                <select id="metrica-story" className="ig-select" value={metrica} onChange={(e) => setMetrica(e.target.value as typeof metrica)}>
                  {METRICAS_STORY.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {top.length === 0 ? (
              <IgNota>Nenhum story guardado neste período ainda. O Nexo guarda os que estão no ar a cada atualização do Instagram.</IgNota>
            ) : (
              <ol className="nx-lista ig-ranking">
                {top.map((s, i) => (
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
                          <b>{fmtN(Number(s[metrica]))}</b>
                          <small>{rotuloMetrica.toLowerCase()}</small>
                        </span>
                      }
                    />
                  </li>
                ))}
              </ol>
            )}
            <IgNota>As métricas de um story são lidas enquanto ele está no ar; stories postados há poucas horas podem ter números ainda parciais.</IgNota>
          </NxCard>
        </>
      )}

      <NxCard icone={ic(Radio)} titulo="Stories no ar agora" subtitulo="Ao vivo da Meta, com os números de agora">
        {aoVivo.isLoading ? (
          <Carregando texto="Lendo da Meta…" />
        ) : !vivos ? (
          <IgNota tom="aviso">{aoVivo.data?.nada_a_fazer ?? aoVivo.data?.erro ?? "Não foi possível ler os stories agora."}</IgNota>
        ) : !vivos.ok ? (
          <IgNota tom="aviso">A Meta não devolveu os stories: {vivos.erro}</IgNota>
        ) : vivos.dados.length === 0 ? (
          <IgNota>Nenhum story no ar neste momento.</IgNota>
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
    </>
  );
}

function TopPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const [aba, setAba] = useState<Aba>("posts");
  const [metrica, setMetrica] = useState<MetricaTop>("saved");

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const temIg = fontes.data?.tem_instagram === true;
  const posts = useQuery({
    queryKey: ["top-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });

  const todosDoTipo = useMemo(() => (posts.data ?? []).filter((p) => (aba === "reels" ? ehReel(p) : ehPostDeFeed(p))), [posts.data, aba]);
  const top = useMemo(() => (aba === "stories" ? [] : topN(posts.data ?? [], aba === "reels" ? "reel" : "post", metrica, 20)), [posts.data, aba, metrica]);
  const padroes = useMemo(() => padroesDoTop(top.map((x) => x.p), todosDoTipo), [top, todosDoTipo]);

  const rotuloMetrica = METRICAS.find((m) => m.id === metrica)?.rotulo ?? "";
  const fmtV = (v: number) => (metrica === "taxa_salvamento" ? fmtPct(v, 2) : fmtN(v));
  const nomeTipo = aba === "reels" ? "Reels" : "posts";
  const colunas = useMemo(() => top.slice(0, 10).map((x, i) => ({ rotulo: `${i + 1}º`, valor: x.v, texto: metrica === "taxa_salvamento" ? fmtPct(x.v, 2) : fmtN(x.v) })), [top, metrica]);

  const head = (
    <IgCabecalho
      titulo="Quais publicações mais se destacaram, e por quê?"
      pergunta="Os 20 melhores do período na métrica que você escolher, e o que eles têm em comum."
      metodo={
        <>
          Os 20 melhores posts, Reels e stories do período ({periodLabel}), na métrica que você escolher, e o que eles têm em comum. Curtidas, comentários, visualizações e alcance de cada post são só do alcance orgânico: o Instagram mostra no post o total com impulsionamento, então um post turbinado aparece com número maior lá do que aqui.
        </>
      }
    />
  );
  if (fontes.isLoading) return <div className="nexo-ig">{head}<Carregando /></div>;
  if (fontes.error) return <div className="nexo-ig">{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div className="nexo-ig">{head}<SemFonte {...SEM_INSTAGRAM} /></div>;

  return (
    <div className="nexo-ig">
      {head}
      <div className="ig-barra-acoes">
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
        {aba !== "stories" && posts.data && (
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
        )}
      </div>
      <IgNotas>
        <IgNota detalhe="O Instagram mostra no post o total com impulsionamento; aqui entram só os números orgânicos, então um post turbinado aparece com número maior lá do que aqui." rotuloDetalhe="O que muda?">
          Números só do alcance orgânico
        </IgNota>
      </IgNotas>
      <div role="tabpanel" className="nexo-ig">
        {aba === "stories" ? (
          <Stories clientId={clientId} start={start} end={end} />
        ) : posts.isLoading ? (
          <Carregando texto="Lendo os posts…" />
        ) : posts.error ? (
          <ErroCarga texto="Falha ao ler os posts do período." />
        ) : top.length === 0 ? (
          <SemFonte titulo={`Sem ${nomeTipo} com essa métrica`} texto={`Nenhum ${aba === "reels" ? "Reel" : "post"} do período tem a métrica escolhida. Troque o período no topo ou a métrica.`} />
        ) : (
          <>
            <section className="nx-grade nx-grade--3 ig-kpis" aria-label="Números do ranking">
              <NxKpi i={0} icone={ic(Layers)} rotulo={`${aba === "reels" ? "Reels" : "Posts"} no período`} valor={fmtN(todosDoTipo.length)} nota={`o ranking mostra os ${top.length} melhores`} />
              <NxKpi i={1} icone={ic(Trophy)} rotulo="1º lugar" valor={fmtV(top[0].v)} nota={rotuloMetrica.toLowerCase()} />
              <NxKpi i={2} icone={ic(ArrowDownToLine)} rotulo={`Para entrar no top ${top.length}`} valor={fmtV(top[top.length - 1].v)} nota={`${rotuloMetrica.toLowerCase()} do ${top.length}º lugar`} />
            </section>

            <NxCard icone={ic(Trophy)} titulo="Pódio" subtitulo={`Os 3 ${nomeTipo} com mais ${rotuloMetrica.toLowerCase()} no período`}>
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
                      {p.tema && <NxTag tom="b">{p.tema}</NxTag>}
                      <NxTag tom="g">{quando(p.posted_at)}</NxTag>
                    </>
                  ),
                }))}
              />
            </NxCard>

            <div className="nx-grade nx-grade--2">
              <NxCard
                icone={ic(BarChart3)}
                titulo="Distância entre os primeiros"
                subtitulo={`${rotuloMetrica} do 1º ao ${colunas.length}º lugar`}
                acao={<IgMetodo rotulo="Como ler: distância entre os primeiros">Se o 1º lugar fica muito acima dos outros, foi um post fora da curva; se as colunas são parecidas, o bom resultado se repete e vale olhar o que eles têm em comum.</IgMetodo>}
              >
                <NxColunas dados={colunas} destaque={0} formatarEixo={(n) => (metrica === "taxa_salvamento" ? fmtPct(n, 1) : fmtN(n))} rotulo={`${rotuloMetrica} dos ${colunas.length} primeiros`} />
              </NxCard>
              <IgLeitura
                titulo="O que os melhores têm em comum"
                metodo="Só entra o que difere 15 pontos percentuais ou mais do conjunto de todos os posts do período. É um padrão para testar, não uma regra."
                itens={padroes.frases.map((f) => ({ texto: f, chave: f }))}
                vazio={padroes.motivoVazio}
              />
            </div>

            {top.length > 3 && (
              <NxCard icone={ic(Trophy)} titulo={`Do 4º ao ${top.length}º lugar`} subtitulo={`${todosDoTipo.length} ${nomeTipo} no período, por ${rotuloMetrica.toLowerCase()}`}>
                <ListaDePosts itens={top.slice(3)} inicio={3} metrica={metrica} reels={aba === "reels"} />
              </NxCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
