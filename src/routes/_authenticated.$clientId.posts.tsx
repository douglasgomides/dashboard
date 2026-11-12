import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Trophy,
  Bookmark,
  Heart,
  Eye,
  TrendingUp,
  TrendingDown,
  Sparkles,
  PlayCircle,
  Timer,
  Layers,
  Target,
  Grid3x3,
  Crown,
  Search,
  Share2,
  Rows3,
  Repeat2 as Repeat2Icon,
  Tags,
  Quote,
} from "lucide-react";
import { classifyPost, getRankedPosts } from "@/lib/client-data";
import { CONTENT_FORMATS, FUNNEL_STAGES, METHODOLOGY_STAGES, formatLabel, funnelLabel, methodologyLabel } from "@/lib/methodology";
import type { ContentFormat, FunnelStage, MethodologyStage } from "@/integrations/supabase/types";
import { fmtNum } from "@/lib/format";
import { dataDiaMes, numeroCurto, numeroOuSemDado, temaParaExibir } from "@/lib/texto-que-cabe";
import { useMediaQuery } from "@/hooks/use-is-mobile";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { hojeBrasilia } from "@/lib/status-fonte";
import { fatosDePublicacoes } from "@/lib/leitura/fatos-instagram";
import { SyncButton } from "@/components/sync-button";
import { useClientRole } from "@/hooks/use-client-role";
import { MIN_POSTS_CONCLUSAO } from "@/lib/metricas";
import { Miniatura, IconeFormato, InfoDica } from "@/components/visual";
import { NxCard, NxKpi, NxTag, NxHBar, NxListRow } from "@/components/nx";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxAviso, NxCarregando, NxErro, NxRecolhido, NxTabela, NxVazio } from "@/components/nx/blocos";
import { NxComoCalcula } from "@/components/nx/anuncios-graficos";
import { IgAbas, IgVitrine } from "@/components/nx/instagram";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import {
  computeConceitosVencedores,
  computeConversionByTag,
  computeFormatoPorTema,
  computeReachByFormat,
  computeReachByTema,
  separarAmostra,
  computeRepetirOuRevisar,
  computeRetencaoDeReels,
  computeTopPostsPorTaxaDeSalvamento,
  computeTopPorTaxaDeCompartilhamento,
  computeProximosAngulos,
  MIN_POSTS_ANGULO,
  MIN_TEMAS_REPETIR,
} from "@/lib/report-metrics";

export const Route = createFileRoute("/_authenticated/$clientId/posts")({
  component: PostsRankingPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

type Post = NonNullable<Awaited<ReturnType<typeof getRankedPosts>>>[number];

const ic = (Icon: typeof Trophy) => <Icon size={17} strokeWidth={1.7} aria-hidden />;

function firstLine(caption: string | null): string | null {
  if (!caption) return null;
  const line = caption.split("\n").find((l) => l.trim().length > 0);
  return line ? line.trim() : null;
}
const tituloDoPost = (p: Post) => firstLine(p.caption) ?? p.windsor_media_id;
const nPosts = (n: number) => `${n} ${n === 1 ? "post" : "posts"}`;
/** Tema com acento para mostrar; o valor do banco segue nas chaves, no filtro e nos agrupamentos. */
const tm = (t: string | null) => temaParaExibir(t) ?? t ?? "";
const inteiroOuSemDado = (n: number | null | undefined) => (n == null ? "sem dado" : fmtNum(n));

/** Chip de uma linha: o texto corta com reticências dentro do cartão e o texto inteiro vai no title. */
function Chip({ tom = "g", texto, icone, titulo }: { tom?: "g" | "b"; texto: string; icone?: ReactNode; titulo?: string }) {
  return (
    <NxTag tom={tom} icone={icone} titulo={titulo ?? texto}>
      <span className="ig-chip__texto">{texto}</span>
    </NxTag>
  );
}
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Cartão com o "como ler" recolhido: o que antes era Painel de visual.tsx. */
function Bloco({ icone, titulo, resumo, ajuda, children }: { icone: Parameters<typeof ic>[0]; titulo: string; resumo?: ReactNode; ajuda?: ReactNode; children: ReactNode }) {
  return (
    <NxCard icone={ic(icone)} titulo={titulo} subtitulo={resumo}>
      {ajuda && <NxComoCalcula titulo={`Como ler: ${titulo}`}>{ajuda}</NxComoCalcula>}
      {children}
    </NxCard>
  );
}

function Seletor<T extends string>({ valor, opcoes, rotulo, aoMudar }: { valor: T | null; opcoes: { value: T; label: string }[]; rotulo: string; aoMudar: (v: T | null) => void }) {
  return (
    <select className="ig-select" value={valor ?? ""} onChange={(e) => aoMudar((e.target.value || null) as T | null)} aria-label={rotulo}>
      <option value="">{rotulo}</option>
      {opcoes.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Os campos para classificar um post (tema, funil, estágio, formato): só abre quando a pessoa pede. */
function Classificador({ post, clientId, aoFechar }: { post: Post; clientId: string; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  async function update(fields: Parameters<typeof classifyPost>[1]) {
    setErro(null);
    try {
      await classifyPost(post.id, fields);
      await queryClient.invalidateQueries({ queryKey: ["ranked-posts", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["next-angles", clientId] });
    } catch {
      setErro("Não foi possível salvar a classificação. Tente novamente.");
    }
  }
  return (
    <NxCard titulo={`Classificar: ${tituloDoPost(post)}`} subtitulo="Tema, funil, estágio e formato. Isso alimenta as análises por assunto" acao={<button type="button" className="nx-botao" onClick={aoFechar}>Fechar</button>}>
      <div className="ig-filtros">
        <input className="ig-select" defaultValue={post.tema ?? ""} placeholder="Tema" aria-label="Tema" onBlur={(e) => e.target.value !== (post.tema ?? "") && update({ tema: e.target.value || null })} />
        <Seletor<FunnelStage> valor={post.funnel_stage} opcoes={FUNNEL_STAGES.map((s) => ({ value: s.value, label: s.label }))} rotulo="Funil" aoMudar={(v) => update({ funnel_stage: v })} />
        <Seletor<MethodologyStage> valor={post.methodology_stage} opcoes={METHODOLOGY_STAGES} rotulo="Estágio" aoMudar={(v) => update({ methodology_stage: v })} />
        <Seletor<ContentFormat> valor={post.format} opcoes={CONTENT_FORMATS} rotulo="Formato" aoMudar={(v) => update({ format: v })} />
      </div>
      {erro && <NxAviso tom="critico" titulo={erro} />}
    </NxCard>
  );
}

/** Resumo do período em quatro números, mais o quanto já está classificado (é o que destrava as análises de tema). */
function cartoesDoResumo(posts: Post[]) {
  const total = posts.length;
  const salvos = posts.reduce((a, p) => a + (p.saved ?? 0), 0);
  const engaj = posts.reduce((a, p) => a + (p.engagement ?? 0), 0);
  const classificados = posts.filter((p) => !!p.tema).length;
  const pct = total > 0 ? Math.round((classificados / total) * 100) : 0;
  return [
    <NxCartaoNumero key="n" icone={ic(Layers)} titulo="Posts no período" valor={fmtNum(total)} legenda="publicados no período escolhido" />,
    <NxCartaoNumero
      key="s"
      icone={ic(Bookmark)}
      titulo="Salvamentos acumulados"
      valor={fmtNum(salvos)}
      legenda="soma dos posts do período, desde a publicação até hoje"
      info={<InfoDica rotulo="Sobre Salvamentos acumulados" texto="Soma dos posts publicados no período, desde a publicação até hoje (não é o mesmo que os salvamentos do período na Visão geral)." />}
    />,
    <NxCartaoNumero key="e" icone={ic(Heart)} titulo="Engajamento acumulado" valor={fmtNum(engaj)} legenda="desde a publicação até hoje" />,
    <NxCartaoNumero
      key="t"
      icone={ic(Tags)}
      titulo="Posts com tema"
      valor={`${pct}%`}
      legenda={`${classificados} de ${total}. Sem tema, as análises por assunto ficam vazias`}
      extra={
        <div className="nx-trk" aria-hidden>
          <i style={{ width: `${Math.max(3, pct)}%` }} />
          <u />
        </div>
      }
    />,
  ] as unknown as [ReactNode, ReactNode?, ReactNode?, ReactNode?];
}

function TopDoMes({ posts }: { posts: Post[] }) {
  const top5 = posts.slice(0, 5);
  if (top5.length === 0) return null;
  return (
    <Bloco icone={Trophy} titulo="Top 5 do período" resumo="Os que mais salvaram. Bons candidatos para repetir." ajuda="Os posts que mais salvaram no período selecionado. Classifique-os no ranking abaixo (tema, funil e estágio) para virarem sugestão de próximos ângulos automaticamente.">
      <IgVitrine
        itens={top5.map((post) => ({
          id: post.id,
          href: post.permalink,
          imagem: <Miniatura url={post.thumbnail_url} formato={post.format} className="w-full" />,
          titulo: tituloDoPost(post),
          dica: tituloDoPost(post),
          valor: fmtNum(post.saved),
          rotulo: "salvamentos",
          extra: (
            <>
              {post.format && <Chip tom="g" texto={formatLabel(post.format)} />}
              {post.tema && <Chip tom="b" texto={tm(post.tema)} />}
            </>
          ),
        }))}
      />
    </Bloco>
  );
}

/** Miniatura, legenda em até 2 linhas e, embaixo, a data (dd/mm, numa linha) com o formato. */
const CELULA_POST = (p: Post) => (
  <span className="ig-post-celula">
    <Miniatura url={p.thumbnail_url} formato={p.format} className="h-12 w-12" />
    <span className="ig-post-celula__texto">
      {p.permalink ? (
        <a className="ig-post-celula__legenda" href={p.permalink} target="_blank" rel="noreferrer" title={p.caption ?? tituloDoPost(p)}>
          {tituloDoPost(p)}
        </a>
      ) : (
        <span className="ig-post-celula__legenda" title={p.caption ?? tituloDoPost(p)}>
          {tituloDoPost(p)}
        </span>
      )}
      <small className="ig-post-celula__meta">
        <span className="ig-post-celula__data">{dataDiaMes(p.posted_at)}</span>
        {p.format && <Chip tom="g" icone={<IconeFormato formato={p.format} size={12} />} texto={formatLabel(p.format)} />}
      </small>
    </span>
  </span>
);

/** Chips do tema e do funil, um sobre o outro, cada um numa linha só. */
const TEMA_E_FUNIL = (p: Post) => (
  <span className="ig-tema-funil">
    {p.tema ? <Chip tom="b" texto={tm(p.tema)} /> : <span>Sem tema</span>}
    {p.funnel_stage ? <Chip tom="g" texto={`${p.funnel_stage}${p.methodology_stage ? ` · ${methodologyLabel(p.methodology_stage)}` : ""}`} titulo={funnelLabel(p.funnel_stage)} /> : <span>Sem dado</span>}
  </span>
);

function RankingDePosts({ rows, clientId, periodLabel }: { rows: Post[]; clientId: string; periodLabel: string }) {
  const { podeEditar } = useClientRole(clientId);
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "todos">("todos");
  const [showAll, setShowAll] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const PAGE = 10;
  const filtered = formatFilter === "todos" ? rows : rows.filter((p) => p.format === formatFilter);
  const visiveis = showAll ? filtered : filtered.slice(0, PAGE);
  const contagem = (f: ContentFormat) => rows.filter((p) => p.format === f).length;
  const postEditado = rows.find((p) => p.id === editando) ?? null;

  const celular = useMediaQuery("(max-width: 560px)");

  const colunas = [
    { chave: "pos", titulo: "#", numerica: true },
    { chave: "post", titulo: "Post" },
    { chave: "tema", titulo: "Tema e funil" },
    { chave: "salvos", titulo: "Salvos", numerica: true },
    { chave: "engaj", titulo: "Engajamento", numerica: true },
    { chave: "alcance", titulo: "Alcance", numerica: true },
    ...(podeEditar ? [{ chave: "editar", titulo: "Classificar" }] : []),
  ];
  const botaoClassificar = (p: Post) => (
    <button type="button" className="nx-botao" onClick={() => setEditando(editando === p.id ? null : p.id)} aria-expanded={editando === p.id} aria-label={`Classificar ${tituloDoPost(p)}`}>
      Classificar
    </button>
  );

  return (
    <Bloco icone={Rows3} titulo="Ranking de posts" resumo={`${periodLabel}, por salvamentos`} ajuda="Ordenado por salvamentos, que indicam interesse real (curtir é fácil, salvar é guardar para depois). Use Classificar para definir tema, funil, estágio e formato de um post. Isso alimenta as análises por tema.">
      <IgAbas
        rotulo="Formato dos posts"
        ativa={formatFilter}
        onTrocar={(id) => {
          setFormatFilter(id as ContentFormat | "todos");
          setShowAll(false);
        }}
        abas={[
          { id: "todos", rotulo: `Todos ${rows.length}` },
          ...CONTENT_FORMATS.map((f) => ({ id: f.value as string, rotulo: `${f.label} ${contagem(f.value)}`, icone: <IconeFormato formato={f.value} size={13} /> })),
        ]}
      />
      {rows.length === 0 ? (
        <NxVazio titulo="Sem posts neste período" falta="posts do Instagram sincronizados nesse intervalo" quem="equipe_hub" passo="clicar em Atualizar posts ou escolher outro intervalo de datas" />
      ) : filtered.length === 0 ? (
        <NxAviso tom="info" titulo="Nenhum post nesse formato no período selecionado." />
      ) : (
        <>
          {celular ? (
            <ol className="ig-ranking-cartoes" aria-label="Ranking de posts por salvamentos">
              {visiveis.map((p, i) => (
                <li key={p.id} className="ig-ranking-cartao">
                  <div className="ig-ranking-cartao__topo">
                    <b className="ig-ranking-cartao__pos" aria-label={`${i + 1}º lugar`}>
                      {i + 1}
                    </b>
                    {CELULA_POST(p)}
                  </div>
                  {TEMA_E_FUNIL(p)}
                  <dl className="ig-ranking-cartao__nums">
                    <div>
                      <dt>Salvos</dt>
                      <dd>{numeroOuSemDado(p.saved)}</dd>
                    </div>
                    <div>
                      <dt>Engajamento</dt>
                      <dd>{numeroOuSemDado(p.engagement)}</dd>
                    </div>
                    <div>
                      <dt>Alcance</dt>
                      <dd>{numeroOuSemDado(p.reach)}</dd>
                    </div>
                  </dl>
                  {podeEditar && botaoClassificar(p)}
                </li>
              ))}
            </ol>
          ) : (
            <div className="ig-ranking-tabela">
              <NxTabela
                rotulo="Ranking de posts por salvamentos"
                colunas={colunas}
                chaveDaLinha={(_, k) => visiveis[k].id}
                linhas={visiveis.map((p, i) => ({
                  pos: i + 1,
                  post: CELULA_POST(p),
                  tema: TEMA_E_FUNIL(p),
                  salvos: numeroOuSemDado(p.saved),
                  engaj: numeroOuSemDado(p.engagement),
                  alcance: numeroOuSemDado(p.reach),
                  editar: botaoClassificar(p),
                }))}
              />
            </div>
          )}
          {filtered.length > PAGE && (
            <button type="button" className="nx-botao" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Mostrar menos" : `Ver todos os ${filtered.length} posts`}
            </button>
          )}
          {podeEditar && postEditado && <Classificador key={postEditado.id} post={postEditado} clientId={clientId} aoFechar={() => setEditando(null)} />}
        </>
      )}
    </Bloco>
  );
}

function ListaRepetir({ itens, vazio }: { itens: { tema: string; rate: number; count: number }[]; vazio: string }) {
  if (itens.length === 0) return <NxAviso tom="info" titulo={vazio} />;
  const max = Math.max(...itens.map((g) => g.rate));
  return (
    <ul className="ig-barras">
      {itens.map((g, i) => (
        <li key={g.tema}>
          <NxHBar rotulo={tm(g.tema)} valor={<>{pct1(g.rate)} <small>· {nPosts(g.count)}</small></>} pct={(g.rate / max) * 100} i={i} />
        </li>
      ))}
    </ul>
  );
}

function RepetirOuRevisar({ posts, periodLabel }: { posts: Post[]; periodLabel: string }) {
  const { repetir, revisar, hasEnough, baseline, temasComAmostra } = useMemo(() => computeRepetirOuRevisar(posts, MIN_POSTS_CONCLUSAO), [posts]);
  return (
    <Bloco
      icone={Repeat2Icon}
      titulo="O que repetir e o que revisar"
      resumo={`Temas acima e abaixo do post típico da conta (${pct1(baseline)} de engajamento)`}
      ajuda={`Cada tema com ${MIN_POSTS_CONCLUSAO} posts ou mais é comparado com a mediana da taxa de engajamento (engajamento ÷ alcance) de todos os posts do período (${periodLabel}). Só aparece com ${MIN_TEMAS_REPETIR} temas ou mais com amostra, para ter com o que comparar.`}
    >
      {!hasEnough ? (
        <NxAviso
          tom="info"
          titulo={
            temasComAmostra === 0
              ? `Nenhum tema tem ${MIN_POSTS_CONCLUSAO} posts ou mais no período.`
              : `Só ${temasComAmostra} ${temasComAmostra === 1 ? "tema tem" : "temas têm"} ${MIN_POSTS_CONCLUSAO} posts ou mais no período.`
          }
        >
          {temasComAmostra === 0 ? "Com menos posts, um post fora da curva decide sozinho." : `É preciso pelo menos ${MIN_TEMAS_REPETIR} para comparar sem enganar.`}
        </NxAviso>
      ) : (
        <div className="nx-grade nx-grade--2">
          <div>
            <h4 className="ig-sub"><TrendingUp size={14} aria-hidden /> Repetir</h4>
            <ListaRepetir itens={repetir} vazio="Nenhum tema acima do post típico da conta." />
          </div>
          <div>
            <h4 className="ig-sub"><TrendingDown size={14} aria-hidden /> Revisar ou descontinuar</h4>
            <ListaRepetir itens={revisar} vazio="Nenhum tema abaixo do post típico da conta." />
          </div>
        </div>
      )}
    </Bloco>
  );
}

function ConceitosVencedores({ posts }: { posts: Post[] }) {
  const conceitos = useMemo(() => computeConceitosVencedores(posts, 7), [posts]);
  if (conceitos.length === 0) return null;
  return (
    <Bloco icone={Crown} titulo="Conceitos vencedores" resumo="O melhor post de cada tema" ajuda="Um post por tema: o de maior taxa de salvamento dele. São os conceitos que já provaram funcionar. As variações de ângulo para testar são produzidas fora do dashboard, a partir daqui.">
      <ul className="nx-lista ig-ranking">
        {conceitos.map(({ tema, post, rate }) => (
          <li key={tema}>
            <NxListRow
              href={post.permalink ?? undefined}
              inicio={<Miniatura url={post.thumbnail_url} formato={post.format} className="h-14 w-14" />}
              titulo={tituloDoPost(post) ?? "Post"}
              sub={<NxTag tom="b">{tm(tema)}</NxTag>}
              fim={
                <span className="ig-num-fim">
                  <b>{pct1(rate)}</b>
                  <small>salvam</small>
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function ListaPorTaxa({ itens }: { itens: { post: Post; rate: number }[] }) {
  return (
    <ul className="nx-lista ig-ranking">
      {itens.map(({ post, rate }) => (
        <li key={post.id}>
          <NxListRow
            href={post.permalink ?? undefined}
            inicio={<Miniatura url={post.thumbnail_url} formato={post.format} className="h-12 w-12" />}
            titulo={tituloDoPost(post) ?? "Post"}
            fim={
              <span className="ig-num-fim">
                <b>{pct1(rate)}</b>
              </span>
            }
          />
        </li>
      ))}
    </ul>
  );
}

function TopPorTaxa({ posts }: { posts: Post[] }) {
  const porSalvamento = useMemo(() => computeTopPostsPorTaxaDeSalvamento(posts, 5), [posts]);
  const porCompartilhamento = useMemo(() => computeTopPorTaxaDeCompartilhamento(posts, 5), [posts]);
  if (porSalvamento.length === 0 && porCompartilhamento.length === 0) return null;
  return (
    <div className="nx-grade nx-grade--2">
      {porSalvamento.length > 0 && (
        <Bloco icone={Bookmark} titulo="Quem mais salva" resumo="Posts com maior taxa de salvamento" ajuda="Salvamentos ÷ alcance. Normaliza por quem viu, então um post pequeno e bom aparece ao lado de um viral.">
          <ListaPorTaxa itens={porSalvamento} />
        </Bloco>
      )}
      {porCompartilhamento.length > 0 && (
        <Bloco icone={Share2} titulo="Quem mais circula" resumo="Posts com maior taxa de compartilhamento" ajuda="Compartilhamentos ÷ alcance, em todos os formatos (Reels, carrossel e post estático). É o sinal mais forte de que o conteúdo circulou sozinho.">
          <ListaPorTaxa itens={porCompartilhamento} />
        </Bloco>
      )}
    </div>
  );
}

/** Grupos abaixo da amostra mínima: aparecem, mas sem ranking nem barra. */
function PoucosDados({ itens }: { itens: { rotulo: string; count: number }[] }) {
  if (!itens.length) return null;
  return (
    <NxAviso tom="info" titulo={`Poucos dados para comparar (menos de ${MIN_POSTS_CONCLUSAO} posts):`}>
      {itens.map((i) => `${i.rotulo} (${i.count})`).join(", ")}.
    </NxAviso>
  );
}

const SEM_AMOSTRA = `Nenhum grupo tem ${MIN_POSTS_CONCLUSAO} posts ou mais no período. Aumente o período ou classifique mais posts para comparar com segurança.`;

function ConversionByTag({ posts }: { posts: Post[] }) {
  const grouped = useMemo(() => computeConversionByTag(posts), [posts]);
  if (grouped.length === 0) return null;
  const { conclusivos, poucos } = separarAmostra(grouped);
  const top = conclusivos.slice(0, 10);
  const max = Math.max(1, ...top.map((g) => g.medianSaved));
  return (
    <Bloco
      icone={Target}
      titulo="Salvamentos por tema e formato"
      resumo="Salvamentos do post típico (mediana) de cada combinação"
      ajuda={`Mostra salvamentos, não conversas nem vendas. Quanto do conteúdo vira conversa e agendamento está em Conteúdo × Comercial. Só entra no ranking a combinação com ${MIN_POSTS_CONCLUSAO} posts ou mais; as outras aparecem à parte, sem conclusão.`}
    >
      {top.length === 0 && <NxAviso tom="info" titulo={SEM_AMOSTRA} />}
      <ul className="ig-barras">
        {top.map((g, i) => (
          <li key={`${g.tema}-${g.format}`}>
            <NxHBar rotulo={`${tm(g.tema)} · ${g.format}`} valor={<>{g.medianSaved.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} <small>· {nPosts(g.count)}</small></>} pct={(g.medianSaved / max) * 100} i={i} />
          </li>
        ))}
      </ul>
      <PoucosDados itens={poucos.map((g) => ({ rotulo: `${tm(g.tema)} · ${g.format}`, count: g.count }))} />
    </Bloco>
  );
}

function DesempenhoEstrutural({ posts }: { posts: Post[] }) {
  const temaTodos = useMemo(() => computeReachByTema(posts), [posts]);
  const formatoTodos = useMemo(() => computeReachByFormat(posts), [posts]);
  const { conclusivos: porTema, poucos: temaPoucos } = separarAmostra(temaTodos);
  const { conclusivos: porFormato, poucos: formatoPoucos } = separarAmostra(formatoTodos);
  if (temaTodos.length === 0 && formatoTodos.length === 0) return null;
  const maxTema = Math.max(1, ...porTema.map((x) => x.medianReach));
  const maxFormato = Math.max(1, ...porFormato.map((x) => x.medianReach));
  return (
    <Bloco
      icone={Eye}
      titulo="Alcance por tema e por formato"
      resumo="Mediana, para não se enganar com um post viral"
      ajuda={`Alcance (mediana) é a base de comparação. Decide se um formato ou tema vale ser repetido, independente de picos isolados. Só entra na comparação o grupo com ${MIN_POSTS_CONCLUSAO} posts ou mais.`}
    >
      {porTema.length === 0 && porFormato.length === 0 && <NxAviso tom="info" titulo={SEM_AMOSTRA} />}
      <div className="nx-grade nx-grade--2">
        {porTema.length > 0 && (
          <div>
            <h4 className="ig-sub">Por tema</h4>
            <ul className="ig-barras">
              {porTema.map((t, i) => (
                <li key={t.tema}>
                  <NxHBar rotulo={tm(t.tema)} valor={<>{fmtNum(t.medianReach)} <small>· {nPosts(t.count)}</small></>} pct={(t.medianReach / maxTema) * 100} i={i} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {porFormato.length > 0 && (
          <div>
            <h4 className="ig-sub">Por formato</h4>
            <ul className="ig-barras">
              {porFormato.map((f, i) => (
                <li key={f.formato}>
                  <NxHBar
                    icone={<IconeFormato formato={CONTENT_FORMATS.find((c) => c.label === f.formato)?.value} size={13} />}
                    rotulo={f.formato}
                    valor={<>{fmtNum(f.medianReach)} <small>· {nPosts(f.count)}</small></>}
                    pct={(f.medianReach / maxFormato) * 100}
                    i={i}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <PoucosDados itens={[...temaPoucos.map((t) => ({ rotulo: tm(t.tema), count: t.count })), ...formatoPoucos.map((f) => ({ rotulo: f.formato, count: f.count }))]} />
    </Bloco>
  );
}

// Matriz tema × formato: cada célula é a taxa de engajamento (mediana), com a cor mais forte onde a combinação funciona.
function FormatoPorTema({ posts }: { posts: Post[] }) {
  const rows = useMemo(() => computeFormatoPorTema(posts), [posts]);
  if (rows.length === 0) return null;
  const formatos = CONTENT_FORMATS.filter((f) => rows.some((r) => r.formato === f.value));
  const temas = Array.from(new Set(rows.map((r) => r.tema)));
  const celula = (tema: string, formato: string) => rows.find((r) => r.tema === tema && r.formato === formato);
  const max = Math.max(0.0001, ...rows.map((r) => r.medianEngRate));
  return (
    <Bloco
      icone={Grid3x3}
      titulo="Tema dentro de cada formato"
      resumo="Taxa de engajamento: quanto mais escuro, melhor"
      ajuda={`O mesmo tema pode performar muito diferente dependendo do formato. Cada célula mostra a taxa de engajamento (mediana), a quantidade de posts e o alcance (mediana). Célula sem cor: menos de ${MIN_POSTS_CONCLUSAO} posts, sem conclusão. Só aparecem combinações com tema classificado.`}
    >
      <NxTabela
        rotulo="Taxa de engajamento por tema e formato"
        colunas={[{ chave: "tema", titulo: "Tema" }, ...formatos.map((f) => ({ chave: f.value, titulo: f.label, numerica: true }))]}
        chaveDaLinha={(_, k) => temas[k]}
        linhas={temas.map((t) => ({
          tema: tm(t),
          ...Object.fromEntries(
            formatos.map((f) => {
              const c = celula(t, f.value);
              if (!c) return [f.value, "Sem dado"];
              const pouco = c.count < MIN_POSTS_CONCLUSAO;
              const forca = Math.round(15 + (c.medianEngRate / max) * 70);
              return [
                f.value,
                <span
                  key={f.value}
                  className="ig-celula"
                  style={pouco ? undefined : { background: `color-mix(in srgb, var(--b1) ${forca}%, var(--b6))`, color: forca > 55 ? "var(--white)" : "var(--text)" }}
                  title={`${nPosts(c.count)} · alcance mediano ${fmtNum(c.medianReach)}${pouco ? ` · poucos dados (menos de ${MIN_POSTS_CONCLUSAO} posts)` : ""}`}
                >
                  {c.medianEngRate.toFixed(1)}% <small>{nPosts(c.count)}</small>
                </span>,
              ];
            }),
          ),
        }))}
      />
    </Bloco>
  );
}

function MelhoresGanchos({ posts }: { posts: Post[] }) {
  const top = useMemo(
    () =>
      posts
        .map((p) => ({ post: p, gancho: firstLine(p.caption) }))
        .filter((x): x is { post: Post; gancho: string } => !!x.gancho)
        .sort((a, b) => (b.post.engagement ?? 0) - (a.post.engagement ?? 0))
        .slice(0, 8),
    [posts],
  );
  if (top.length === 0) return null;
  return (
    <Bloco icone={Quote} titulo="Melhores ganchos" resumo="Como abriram os posts que mais engajaram" ajuda="Primeira linha da legenda dos posts com mais engajamento. É o padrão de abertura que mais prendeu atenção.">
      <ul className="nx-lista ig-ranking">
        {top.map(({ post, gancho }) => (
          <li key={post.id}>
            <NxListRow
              href={post.permalink ?? undefined}
              inicio={<Miniatura url={post.thumbnail_url} formato={post.format} className="h-12 w-12" />}
              titulo={`“${gancho}”`}
              fim={
                <span className="ig-num-fim">
                  <b>{fmtNum(post.engagement)}</b>
                  <small>engajamento</small>
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function RetencaoDeReels({ posts }: { posts: Post[] }) {
  const r = useMemo(() => computeRetencaoDeReels(posts, 8), [posts]);
  if (r.totalReels === 0) return null;
  // Tem reel, mas sem o dado de retenção: dizer o motivo, senão parece que o número está zerado.
  if (r.withData === 0) {
    return (
      <Bloco icone={PlayCircle} titulo="Retenção dos reels" resumo={`${r.totalReels} reels no período, sem dado de retenção`}>
        <NxAviso tom="info" titulo="Sem dado de retenção:">o hook rate vem do “skip rate” da Meta, que só chega pela Windsor.ai. Contas sincronizadas direto pela Graph API não recebem esse campo.</NxAviso>
      </Bloco>
    );
  }
  return (
    <Bloco
      icone={PlayCircle}
      titulo="Retenção dos reels"
      resumo="Quem ficou depois dos 3 primeiros segundos"
      ajuda="Hook rate é quanta gente não pulou nos 3 primeiros segundos: é o gancho fazendo efeito. Body rate e hold rate exigiriam a duração do vídeo, que a Meta não entrega por API. Por isso o tempo assistido aparece em segundos, não em porcentagem."
    >
      <div className="nx-grade nx-grade--2">
        <NxKpi icone={ic(PlayCircle)} rotulo="Hook rate (mediana)" valor={r.medianHookRate != null ? `${r.medianHookRate.toFixed(1)}%` : "Sem dado"} nota={r.weightedHookRate != null ? `ponderado por views: ${r.weightedHookRate.toFixed(1)}%` : undefined} />
        <NxKpi icone={ic(Timer)} rotulo="Tempo assistido (mediana)" valor={r.medianWatchSeconds != null ? `${r.medianWatchSeconds.toFixed(1)}s` : "Sem dado"} nota={r.weightedWatchSeconds != null ? `ponderado por views: ${r.weightedWatchSeconds.toFixed(1)}s` : undefined} />
      </div>
      {r.withData < r.totalReels && <NxAviso tom="info" titulo={`Baseado em ${r.withData} de ${r.totalReels} reels.`}>O resto ainda não tem o dado.</NxAviso>}
      <ul className="nx-lista ig-ranking">
        {r.melhores.map(({ post, hookRate, avgWatchSeconds }) => (
          <li key={post.id}>
            <NxListRow
              href={post.permalink ?? undefined}
              inicio={<Miniatura url={post.thumbnail_url} formato="reels" className="h-12 w-12" />}
              titulo={tituloDoPost(post) ?? "Reel"}
              sub={<span><Timer size={12} aria-hidden /> {avgWatchSeconds != null ? `${avgWatchSeconds.toFixed(1)}s assistidos` : "Sem dado de tempo"}</span>}
              fim={
                <span className="ig-num-fim">
                  <b>{hookRate.toFixed(1)}%</b>
                  <small>não pularam</small>
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function NextAngles({ posts, periodLabel }: { posts: Post[]; periodLabel: string }) {
  const { angulos, baseline, temasComAmostra } = useMemo(() => computeProximosAngulos(posts), [posts]);
  const fmtSalvos = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <Bloco
      icone={Sparkles}
      titulo="Próximos ângulos"
      resumo="Temas que salvam mais que o post típico da conta: direções para testar"
      ajuda={`Temas com ${MIN_POSTS_ANGULO} posts ou mais no período (${periodLabel}) cujo post típico (mediana) foi mais salvo que o post típico da conta. Sugestão de direção, nunca conteúdo pronto.`}
    >
      {angulos.length === 0 ? (
        <NxAviso
          tom="info"
          titulo={
            temasComAmostra === 0
              ? `Poucos dados: nenhum tema tem ${MIN_POSTS_ANGULO} posts ou mais neste período. Aumente o período no topo da tela.`
              : `Poucos dados: nenhum dos ${temasComAmostra} temas com ${MIN_POSTS_ANGULO} posts ou mais ficou acima do post típico da conta (${fmtSalvos(baseline)} salvamentos).`
          }
        />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {angulos.map((a) => (
            <li key={a.tema} className="ig-angulo">
              <b>
                {tm(a.tema)}
                {a.formato && (
                  <>
                    {" "}
                    <NxTag tom="b" icone={<IconeFormato formato={a.formato} size={12} />}>
                      {formatLabel(a.formato as Post["format"])}
                    </NxTag>
                  </>
                )}
              </b>
              <span>{`${nPosts(a.count)} no período. O post típico do tema teve ${fmtSalvos(a.medianSaved)} salvamentos, contra ${fmtSalvos(a.baseline)} do post típico da conta.${a.formato ? ` Dentro do tema, ${formatLabel(a.formato as Post["format"]).toLowerCase()} foi o formato mais salvo (${nPosts(a.formatoCount)}).` : ""}`}</span>
              <span>
                <b>Próximo passo:</b> teste outro ângulo, caso ou pergunta do mesmo tema.
              </span>
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

type SortKey = "posted_at" | "reach" | "engagement" | "saved";

// Base completa dos posts do período: busca por legenda, filtro por tema e formato, ordenação por qualquer métrica.
// Abre em galeria (miniaturas) e troca para tabela quando a pessoa quer comparar números.
function ExploradorDePosts({ posts, periodLabel }: { posts: Post[]; periodLabel: string }) {
  const [search, setSearch] = useState("");
  const [temaFilter, setTemaFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("reach");
  const [modo, setModo] = useState<"galeria" | "tabela">("galeria");
  const [limite, setLimite] = useState(12);

  const temas = useMemo(() => Array.from(new Set(posts.filter((p) => p.tema).map((p) => p.tema as string))).sort(), [posts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return posts
      .filter((p) => !term || (p.caption ?? "").toLowerCase().includes(term))
      .filter((p) => !temaFilter || p.tema === temaFilter)
      .filter((p) => !formatFilter || p.format === formatFilter)
      .sort((a, b) => {
        const av = sortKey === "posted_at" ? a.posted_at ?? "" : (a[sortKey] ?? 0);
        const bv = sortKey === "posted_at" ? b.posted_at ?? "" : (b[sortKey] ?? 0);
        return av > bv ? -1 : av < bv ? 1 : 0;
      });
  }, [posts, search, temaFilter, formatFilter, sortKey]);

  return (
    <Bloco icone={Search} titulo="Explorador de posts" resumo={`Todos os posts de ${periodLabel}`} ajuda="Todos os posts do período selecionado, filtráveis por tema e formato e ordenáveis por qualquer métrica. Funciona sem classificação (o formato já vem pronto) e fica mais rico conforme o tema é preenchido.">
      <div className="ig-filtros">
        <input className="ig-select" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na legenda…" aria-label="Buscar na legenda" />
        <select className="ig-select" value={temaFilter} onChange={(e) => setTemaFilter(e.target.value)} aria-label="Tema">
          <option value="">Todos os temas</option>
          {temas.map((t) => (
            <option key={t} value={t}>
              {tm(t)}
            </option>
          ))}
        </select>
        <select className="ig-select" value={formatFilter} onChange={(e) => setFormatFilter(e.target.value as ContentFormat | "")} aria-label="Formato">
          <option value="">Todos os formatos</option>
          {CONTENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select className="ig-select" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Ordenar por">
          <option value="reach">Mais alcance</option>
          <option value="engagement">Mais engajamento</option>
          <option value="saved">Mais salvos</option>
          <option value="posted_at">Mais recentes</option>
        </select>
        <select className="ig-select" value={modo} onChange={(e) => setModo(e.target.value as "galeria" | "tabela")} aria-label="Modo de exibição">
          <option value="galeria">Galeria</option>
          <option value="tabela">Tabela</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <NxAviso tom="info" titulo="Nenhum post encontrado com esses filtros." />
      ) : modo === "galeria" ? (
        <>
          <ul className="ig-galeria">
            {filtered.slice(0, limite).map((p) => (
              <li key={p.id}>
                <a href={p.permalink ?? undefined} target="_blank" rel="noreferrer" className="ig-galeria__item">
                  <span className="ig-galeria__img">
                    <Miniatura url={p.thumbnail_url} formato={p.format} className="aspect-square w-full" />
                    <span className="ig-galeria__nums">
                      <span aria-label={`Alcance: ${inteiroOuSemDado(p.reach)}`} title={`Alcance: ${inteiroOuSemDado(p.reach)}`}><Eye size={12} aria-hidden /> {numeroCurto(p.reach)}</span>
                      <span aria-label={`Engajamento: ${inteiroOuSemDado(p.engagement)}`} title={`Engajamento: ${inteiroOuSemDado(p.engagement)}`}><Heart size={12} aria-hidden /> {numeroCurto(p.engagement)}</span>
                      <span aria-label={`Salvamentos: ${inteiroOuSemDado(p.saved)}`} title={`Salvamentos: ${inteiroOuSemDado(p.saved)}`}><Bookmark size={12} aria-hidden /> {numeroCurto(p.saved)}</span>
                    </span>
                  </span>
                  <span className="ig-galeria__texto" title={tituloDoPost(p) ?? undefined}>{tituloDoPost(p)}</span>
                  <span className="ig-galeria__rodape">
                    <span className="ig-galeria__data">{dataDiaMes(p.posted_at)}</span>
                    {p.tema && <Chip tom="b" texto={tm(p.tema)} />}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {filtered.length > limite && (
            <button type="button" className="nx-botao" onClick={() => setLimite((n) => n + 12)}>
              Ver mais ({filtered.length - limite} restantes)
            </button>
          )}
        </>
      ) : (
        <NxTabela
          rotulo="Todos os posts do período"
          colunas={[
            { chave: "data", titulo: "Data" },
            { chave: "formato", titulo: "Formato" },
            { chave: "tema", titulo: "Tema" },
            { chave: "legenda", titulo: "Legenda" },
            { chave: "alcance", titulo: "Alcance", numerica: true },
            { chave: "engaj", titulo: "Engajamento", numerica: true },
            { chave: "salvos", titulo: "Salvos", numerica: true },
            { chave: "abrir", titulo: "Post" },
          ]}
          chaveDaLinha={(_, k) => filtered[k].id}
          linhas={filtered.map((p) => ({
            data: <span className="ig-data-linha">{dataDiaMes(p.posted_at)}</span>,
            formato: p.format ? <span className="ig-post-celula"><IconeFormato formato={p.format} />{formatLabel(p.format)}</span> : "Sem dado",
            tema: p.tema ? <Chip tom="b" texto={tm(p.tema)} /> : "Sem tema",
            legenda: <span className="ig-post-celula__legenda" title={p.caption ?? tituloDoPost(p)}>{tituloDoPost(p)}</span>,
            alcance: numeroOuSemDado(p.reach),
            engaj: numeroOuSemDado(p.engagement),
            salvos: numeroOuSemDado(p.saved),
            abrir: p.permalink ? <a href={p.permalink} target="_blank" rel="noreferrer">abrir ↗</a> : "Sem link",
          }))}
        />
      )}
    </Bloco>
  );
}

function PostsRankingPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });
  const hoje = hojeBrasilia();

  const { data: posts, isLoading, error, refetch } = useQuery({
    queryKey: ["ranked-posts", clientId, start, end],
    queryFn: () => getRankedPosts(clientId, start, end),
  });

  // A leitura é dos posts que a tela já carregou: só regra, sem consulta nova.
  const fatos = useMemo(() => (posts ? fatosDePublicacoes({ de: start, ate: end, hoje, posts }) : null), [posts, start, end, hoje]);

  // Contagem em cinza da aba Posts na pasta do Instagram (D-07): o total que a tela já carregou, sem consulta nova.
  usePublicarContagem({ clientId, de: start, ate: end, rota: "/_authenticated/$clientId/posts", valor: error ? null : posts ? posts.length || null : undefined });

  const cabecalho = {
    tela: "posts" as const,
    titulo: "Consultar publicações",
    pergunta: "O que foi publicado e como cada post foi?",
    decisao: "D3" as const,
    meta: <span>{periodLabel}</span>,
    acao: <SyncButton clientId={clientId} alvo="posts" />,
  };

  if (isLoading) return <div className="nexo-ig"><PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={null} carregando semSelo />} corpo={<NxCarregando texto="Carregando posts…" linhas={4} />} /></div>;
  if (error) {
    return (
      <div className="nexo-ig">
        <PaginaNexo
          {...cabecalho}
          leitura={<LeituraDaTela fatos={null} carregando={false} erro="Os posts não carregaram." semSelo />}
          corpo={<NxErro texto="Não foi possível ler os posts deste período. Tente novamente em instantes." onTentar={() => void refetch()} />}
        />
      </div>
    );
  }

  const rows = posts ?? [];

  return (
    <div className="nexo-ig">
      <PaginaNexo
        {...cabecalho}
        leitura={<LeituraDaTela fatos={fatos} carregando={fatos == null} semSelo />}
        cartoes={rows.length > 0 ? cartoesDoResumo(rows) : undefined}
        corpo={
          rows.length > 0 ? (
            <>
              <TopDoMes posts={rows} />
            </>
          ) : (
            <NxVazio titulo="Sem posts neste período" falta="posts do Instagram sincronizados nesse intervalo" quem="equipe_hub" passo="clicar em Atualizar posts ou escolher outro intervalo de datas" />
          )
        }
        detalhe={
          rows.length > 0 ? (
            <div style={{ display: "grid", gap: 18 }}>
              <NxRecolhido titulo="Ranking de posts" resumo="Todos os posts do período por salvamentos, com filtro por formato e a classificação de tema, funil e estágio">
                <RankingDePosts rows={rows} clientId={clientId} periodLabel={periodLabel} />
              </NxRecolhido>
              <NxRecolhido titulo="Mais análises dos posts" resumo="Próximos ângulos, o que repetir, conceitos vencedores, quem mais salva e circula, tema × formato, ganchos e retenção dos Reels">
                <div style={{ display: "grid", gap: 18 }}>
                  <NextAngles posts={rows} periodLabel={periodLabel} />
                  <RepetirOuRevisar posts={rows} periodLabel={periodLabel} />
                  <ConceitosVencedores posts={rows} />
                  <TopPorTaxa posts={rows} />
                  <div className="nx-grade nx-grade--2">
                    <ConversionByTag posts={rows} />
                    <MelhoresGanchos posts={rows} />
                  </div>
                  <DesempenhoEstrutural posts={rows} />
                  <FormatoPorTema posts={rows} />
                  <RetencaoDeReels posts={rows} />
                </div>
              </NxRecolhido>
              <NxRecolhido titulo="Explorador de posts" resumo="Todos os posts do período, com busca, filtros e ordenação">
                <ExploradorDePosts posts={rows} periodLabel={periodLabel} />
              </NxRecolhido>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
