import { useMemo, useState } from "react";
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
  Lightbulb,
  Quote,
  PlayCircle,
  Timer,
  LayoutGrid,
  List,
  Layers,
  Target,
  Grid3x3,
  Crown,
  Pencil,
  Search,
  ChevronDown,
  ChevronUp,
  Share2,
  Rows3,
  Repeat2 as Repeat2Icon,
  Tags,
} from "lucide-react";
import { classifyPost, getNextAngles, getRankedPosts } from "@/lib/client-data";
import {
  CONTENT_FORMATS,
  FUNNEL_STAGES,
  METHODOLOGY_STAGES,
  formatLabel,
  funnelLabel,
  methodologyLabel,
} from "@/lib/methodology";
import type { ContentFormat, FunnelStage, MethodologyStage } from "@/integrations/supabase/types";
import { fmtNum } from "@/lib/format";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { SyncButton } from "@/components/sync-button";
import { Painel, Selo, Miniatura, BarraFina, Numero, Kpi, IconeFormato, COR_FORMATO } from "@/components/visual";
import {
  computeConceitosVencedores,
  computeConversionByTag,
  computeFormatoPorTema,
  computeReachByFormat,
  computeReachByTema,
  computeRepetirOuRevisar,
  computeRetencaoDeReels,
  computeTopPostsPorTaxaDeSalvamento,
  computeTopReelsPorTaxaDeCompartilhamento,
} from "@/lib/report-metrics";

export const Route = createFileRoute("/_authenticated/$clientId/posts")({
  component: PostsRankingPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

type Post = NonNullable<Awaited<ReturnType<typeof getRankedPosts>>>[number];

const COR_FUNIL: Record<string, string> = {
  C0: "var(--muted)",
  C1: "var(--s1)",
  C2: "var(--warn)",
  C3: "var(--good-text)",
};

function firstLine(caption: string | null): string | null {
  if (!caption) return null;
  const line = caption.split("\n").find((l) => l.trim().length > 0);
  return line ? line.trim() : null;
}

function nPosts(n: number) {
  return `${n} ${n === 1 ? "post" : "posts"}`;
}

function dataCurta(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—";
}

function ClassifySelect<T extends string>({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  placeholder: string;
  onChange: (v: T | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
      className="min-w-0 rounded-md border px-2 py-1.5 text-xs"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Uma linha do ranking: miniatura, a barra de salvamentos relativa ao 1º lugar, os três números com
// ícone e a classificação como selos. Os campos para editar (tema, funil, estágio, formato) ficam
// atrás do lápis, para não ocupar a tela inteira com caixas de seleção.
function PostCard({ post, posicao, maxSalvos, clientId }: { post: Post; posicao: number; maxSalvos: number; clientId: string }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);

  async function update(fields: Parameters<typeof classifyPost>[1]) {
    await classifyPost(post.id, fields);
    queryClient.invalidateQueries({ queryKey: ["ranked-posts", clientId] });
    queryClient.invalidateQueries({ queryKey: ["next-angles", clientId] });
  }

  const titulo = firstLine(post.caption) ?? post.windsor_media_id;
  const semClassificar = !post.tema && !post.funnel_stage && !post.methodology_stage;

  return (
    <li className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <Miniatura url={post.thumbnail_url} formato={post.format} className="h-16 w-16" />
          <span
            className="absolute -left-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
            style={{
              background: posicao <= 3 ? "var(--warn)" : "var(--surface-2)",
              color: posicao <= 3 ? "#1a1a19" : "var(--text-dim)",
              border: "2px solid var(--surface)",
            }}
          >
            {posicao}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium" style={{ color: "var(--text)" }}>
              {titulo}
            </a>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
              style={{ color: editando ? "var(--accent)" : "var(--muted)", background: "var(--surface-2)" }}
              aria-label="Classificar este post"
              aria-expanded={editando}
              title="Classificar (tema, funil, estágio, formato)"
            >
              <Pencil size={14} />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Numero icone={Bookmark} valor={fmtNum(post.saved)} rotulo="Salvos" cor="var(--accent)" />
            <Numero icone={Heart} valor={fmtNum(post.engagement)} rotulo="Engajamento" />
            <Numero icone={Eye} valor={fmtNum(post.reach)} rotulo="Alcance" />
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>
              {dataCurta(post.posted_at)}
            </span>
          </div>
          <div className="mt-2">
            <BarraFina valor={post.saved ?? 0} max={maxSalvos} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {post.format && (
              <Selo cor={COR_FORMATO[post.format]}>
                <IconeFormato formato={post.format} size={12} />
                {formatLabel(post.format)}
              </Selo>
            )}
            {post.tema && <Selo cor="var(--ai)">{post.tema}</Selo>}
            {post.funnel_stage && (
              <Selo cor={COR_FUNIL[post.funnel_stage]} titulo={funnelLabel(post.funnel_stage)}>
                {post.funnel_stage}
              </Selo>
            )}
            {post.methodology_stage && <Selo>{methodologyLabel(post.methodology_stage)}</Selo>}
            {semClassificar && (
              <button type="button" onClick={() => setEditando(true)} className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                + classificar
              </button>
            )}
          </div>
        </div>
      </div>
      {editando && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
          <input
            defaultValue={post.tema ?? ""}
            placeholder="Tema"
            aria-label="Tema"
            onBlur={(e) => e.target.value !== (post.tema ?? "") && update({ tema: e.target.value || null })}
            className="min-w-0 rounded-md border px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          />
          <ClassifySelect<FunnelStage>
            value={post.funnel_stage}
            options={FUNNEL_STAGES.map((s) => ({ value: s.value, label: s.label }))}
            placeholder="Funil"
            onChange={(v) => update({ funnel_stage: v })}
          />
          <ClassifySelect<MethodologyStage>
            value={post.methodology_stage}
            options={METHODOLOGY_STAGES}
            placeholder="Estágio"
            onChange={(v) => update({ methodology_stage: v })}
          />
          <ClassifySelect<ContentFormat> value={post.format} options={CONTENT_FORMATS} placeholder="Formato" onChange={(v) => update({ format: v })} />
        </div>
      )}
    </li>
  );
}

// Resumo do período em quatro números, mais o quanto já está classificado (é o que destrava os painéis de tema).
function ResumoPosts({ posts }: { posts: Post[] }) {
  const total = posts.length;
  const salvos = posts.reduce((a, p) => a + (p.saved ?? 0), 0);
  const engaj = posts.reduce((a, p) => a + (p.engagement ?? 0), 0);
  const classificados = posts.filter((p) => !!p.tema).length;
  const pct = total > 0 ? Math.round((classificados / total) * 100) : 0;
  if (total === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi icone={Layers} rotulo="Posts no período" valor={fmtNum(total)} />
      <Kpi icone={Bookmark} rotulo="Salvamentos" valor={fmtNum(salvos)} cor="var(--s1)" />
      <Kpi icone={Heart} rotulo="Engajamento" valor={fmtNum(engaj)} cor="var(--s2)" />
      <div className="rounded-xl border p-3.5" style={{ background: "var(--surface)", borderColor: "var(--border)" }} title="Posts com tema preenchido. Sem tema, os painéis por assunto ficam vazios.">
        <div className="flex items-center gap-2">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "color-mix(in srgb, var(--ai) 16%, transparent)", color: "var(--ai)" }}>
            <Tags size={15} />
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            Com tema
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums leading-none">
          {pct}% <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>({classificados}/{total})</span>
        </div>
        <div className="mt-2">
          <BarraFina valor={classificados} max={total} cor="var(--ai)" />
        </div>
      </div>
    </div>
  );
}

function TopDoMes({ posts }: { posts: Post[] }) {
  const top5 = posts.slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <Painel
      icone={Trophy}
      cor="var(--warn)"
      titulo="Top 5 do período"
      resumo="Os que mais salvaram. Bons candidatos para repetir."
      ajuda="Os posts que mais salvaram no período selecionado. Classifique-os abaixo (tema, funil e estágio) para virarem sugestão de “próximos ângulos” automaticamente."
    >
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
        {top5.map((post, i) => (
          <a
            key={post.id}
            href={post.permalink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="relative w-40 shrink-0 snap-start overflow-hidden rounded-xl border text-xs sm:w-auto sm:min-w-0"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <div className="relative">
              <Miniatura url={post.thumbnail_url} formato={post.format} className="aspect-square w-full rounded-none" />
              <span
                className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: i === 0 ? "var(--warn)" : "rgba(0,0,0,.65)", color: i === 0 ? "#1a1a19" : "#fff" }}
              >
                {i === 0 ? <Crown size={14} /> : i + 1}
              </span>
              <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(0,0,0,.7)", color: "#fff" }}>
                <Bookmark size={11} /> {fmtNum(post.saved)}
              </span>
            </div>
            <div className="p-2"><div className="line-clamp-2 leading-snug">{firstLine(post.caption) ?? post.windsor_media_id}</div></div>
          </a>
        ))}
      </div>
    </Painel>
  );
}

function RankingDePosts({
  rows,
  clientId,
  periodLabel,
}: {
  rows: Post[];
  clientId: string;
  periodLabel: string;
}) {
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "">("");
  const [showAll, setShowAll] = useState(false);
  const PAGE = 10;

  const filtered = formatFilter ? rows.filter((p) => p.format === formatFilter) : rows;
  const visiveis = showAll ? filtered : filtered.slice(0, PAGE);
  const maxSalvos = Math.max(1, ...filtered.map((p) => p.saved ?? 0));

  const contagem = (f: ContentFormat) => rows.filter((p) => p.format === f).length;

  return (
    <Painel
      icone={Rows3}
      titulo="Ranking de posts"
      resumo={`${periodLabel}, por salvamentos`}
      ajuda="Ordenado por salvamentos, que indicam interesse real (curtir é fácil, salvar é guardar para depois). Toque no lápis de um post para definir tema, funil, estágio e formato. Isso alimenta os painéis de tema logo abaixo."
    >
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ value: "" as const, label: "Todos", n: rows.length }, ...CONTENT_FORMATS.map((f) => ({ value: f.value, label: f.label, n: contagem(f.value) }))].map((f) => {
          const ativo = formatFilter === f.value;
          return (
            <button
              key={f.value || "todos"}
              type="button"
              onClick={() => {
                setFormatFilter(f.value);
                setShowAll(false);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                borderColor: ativo ? "var(--accent)" : "var(--border)",
                background: ativo ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--surface)",
                color: ativo ? "var(--accent)" : "var(--text-dim)",
              }}
              aria-pressed={ativo}
            >
              {f.value && <IconeFormato formato={f.value} size={13} />}
              {f.label}
              <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                {f.n}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Sem posts sincronizados nesse período. Clique em “Atualizar posts” ou escolha outro intervalo de datas.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post nesse formato no período selecionado.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {visiveis.map((post, i) => (
              <PostCard key={post.id} post={post} posicao={i + 1} maxSalvos={maxSalvos} clientId={clientId} />
            ))}
          </ul>
          {filtered.length > PAGE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAll ? "Mostrar menos" : `Ver todos os ${filtered.length} posts`}
            </button>
          )}
        </>
      )}
    </Painel>
  );
}

function ListaRepetir({ itens, cor, vazio }: { itens: { tema: string; rate: number; count: number }[]; cor: string; vazio: string }) {
  if (itens.length === 0)
    return (
      <p className="text-sm" style={{ color: "var(--text-dim)" }}>
        {vazio}
      </p>
    );
  const max = Math.max(...itens.map((g) => g.rate));
  return (
    <ul className="space-y-2.5">
      {itens.map((g) => (
        <li key={g.tema} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{g.tema}</span>
            <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
              <b style={{ color: "var(--text)" }}>{(g.rate * 100).toFixed(1)}%</b> · {nPosts(g.count)}
            </span>
          </div>
          <BarraFina valor={g.rate} max={max} cor={cor} />
        </li>
      ))}
    </ul>
  );
}

function RepetirOuRevisar({ posts, periodLabel }: { posts: Post[]; periodLabel: string }) {
  const MIN_POSTS = 10;
  const { repetir, revisar, hasEnough } = useMemo(() => computeRepetirOuRevisar(posts, MIN_POSTS), [posts]);

  return (
    <Painel
      icone={Repeat2Icon}
      titulo="O que repetir e o que revisar"
      resumo="Temas acima e abaixo da mediana de engajamento"
      ajuda={`Calculado a partir da mediana da taxa de engajamento dos temas com volume relevante (${MIN_POSTS}+ posts) no período selecionado (${periodLabel}). Não é opinião, é o que os dados mostraram.`}
    >
      {!hasEnough ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Preencha o <strong>tema</strong> de pelo menos {MIN_POSTS} posts do mesmo assunto (lápis no ranking acima) para liberar este painel.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--good-text)" }}>
              <TrendingUp size={14} /> Repetir
            </h3>
            <ListaRepetir itens={repetir} cor="var(--good)" vazio="Nenhum tema acima da mediana ainda." />
          </div>
          <div>
            <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--crit)" }}>
              <TrendingDown size={14} /> Revisar ou descontinuar
            </h3>
            <ListaRepetir itens={revisar} cor="var(--crit)" vazio="Nenhum tema abaixo da mediana ainda." />
          </div>
        </div>
      )}
    </Painel>
  );
}

function ConceitosVencedores({ posts }: { posts: Post[] }) {
  const conceitos = useMemo(() => computeConceitosVencedores(posts, 7), [posts]);
  if (conceitos.length === 0) return null;

  return (
    <Painel
      icone={Crown}
      cor="var(--warn)"
      titulo="Conceitos vencedores"
      resumo="O melhor post de cada tema"
      ajuda="Um post por tema: o de maior taxa de salvamento dele. São os conceitos que já provaram funcionar. As variações de ângulo para testar são produzidas fora do dashboard, a partir daqui."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {conceitos.map(({ tema, post, rate }) => (
          <a
            key={tema}
            href={post.permalink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="flex overflow-hidden rounded-xl border text-sm"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Miniatura url={post.thumbnail_url} formato={post.format} className="h-auto min-h-24 w-24 rounded-none" />
            <div className="min-w-0 p-3">
              <Selo cor="var(--ai)">{tema}</Selo>
              <div className="mt-1.5 line-clamp-2 leading-snug">{firstLine(post.caption) ?? post.windsor_media_id}</div>
              <div className="mt-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--good-text)" }}>
                <Bookmark size={12} /> {(rate * 100).toFixed(1)}% salvam
              </div>
            </div>
          </a>
        ))}
      </div>
    </Painel>
  );
}

function LinhaTaxa({ post, rate, max, cor }: { post: Post; rate: number; max: number; cor: string }) {
  return (
    <li>
      <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex gap-2.5 rounded-lg border p-2" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
        <Miniatura url={post.thumbnail_url} formato={post.format} className="h-12 w-12" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 block text-sm">{firstLine(post.caption) ?? post.windsor_media_id}</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <BarraFina valor={rate} max={max} cor={cor} />
            </span>
            <b className="shrink-0 text-xs tabular-nums">{(rate * 100).toFixed(1)}%</b>
          </span>
        </span>
      </a>
    </li>
  );
}

function TopPorTaxa({ posts }: { posts: Post[] }) {
  const porSalvamento = useMemo(() => computeTopPostsPorTaxaDeSalvamento(posts, 5), [posts]);
  const porCompartilhamento = useMemo(() => computeTopReelsPorTaxaDeCompartilhamento(posts, 5), [posts]);

  if (porSalvamento.length === 0 && porCompartilhamento.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {porSalvamento.length > 0 && (
        <Painel
          icone={Bookmark}
          cor="var(--s1)"
          titulo="Quem mais salva"
          resumo="Posts com maior taxa de salvamento"
          ajuda="Salvamentos ÷ alcance. Normaliza por quem viu, então um post pequeno e bom aparece ao lado de um viral."
        >
          <ul className="space-y-2">
            {porSalvamento.map(({ post, rate }) => (
              <LinhaTaxa key={post.id} post={post} rate={rate} max={porSalvamento[0].rate} cor="var(--s1)" />
            ))}
          </ul>
        </Painel>
      )}
      {porCompartilhamento.length > 0 && (
        <Painel
          icone={Share2}
          cor="var(--s2)"
          titulo="Quem mais circula"
          resumo="Reels com maior taxa de compartilhamento"
          ajuda="Compartilhamentos ÷ alcance. É o sinal mais forte de que o conteúdo circulou sozinho. Só existe para reels, que é onde a Meta preenche esse campo."
        >
          <ul className="space-y-2">
            {porCompartilhamento.map(({ post, rate }) => (
              <LinhaTaxa key={post.id} post={post} rate={rate} max={porCompartilhamento[0].rate} cor="var(--s2)" />
            ))}
          </ul>
        </Painel>
      )}
    </div>
  );
}

function ConversionByTag({ posts }: { posts: Post[] }) {
  const grouped = useMemo(() => computeConversionByTag(posts), [posts]);
  if (grouped.length === 0) return null;
  const top = grouped.slice(0, 10);
  const max = Math.max(1, ...top.map((g) => g.medianSaved));

  return (
    <Painel
      icone={Target}
      cor="var(--s3)"
      titulo="Conversão real por tema e formato"
      resumo="Salvamentos (mediana) de cada combinação"
      ajuda="Proxy de conversão real: usa salvamentos, não curtidas. Só aparece depois que os posts são classificados no ranking acima."
    >
      <ul className="space-y-2.5">
        {top.map((g) => (
          <li key={`${g.tema}-${g.format}`} className="text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{g.tema}</span>
                <Selo>{g.format}</Selo>
              </span>
              <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                <b style={{ color: "var(--text)" }}>{g.medianSaved.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</b> · {nPosts(g.count)}
              </span>
            </div>
            <BarraFina valor={g.medianSaved} max={max} cor="var(--s3)" />
          </li>
        ))}
      </ul>
    </Painel>
  );
}

function DesempenhoEstrutural({ posts }: { posts: Post[] }) {
  const porTema = useMemo(() => computeReachByTema(posts), [posts]);
  const porFormato = useMemo(() => computeReachByFormat(posts), [posts]);

  if (porTema.length === 0 && porFormato.length === 0) return null;

  return (
    <Painel
      icone={Eye}
      cor="var(--s1)"
      titulo="Alcance por tema e por formato"
      resumo="Mediana, para não se enganar com um post viral"
      ajuda="Alcance (mediana) é a base de comparação. Decide se um formato ou tema vale ser repetido, independente de picos isolados."
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {porTema.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold" style={{ color: "var(--text-dim)" }}>
              Por tema
            </h3>
            <ul className="space-y-2.5">
              {porTema.map((t) => (
                <li key={t.tema} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{t.tema}</span>
                    <b className="shrink-0 text-xs tabular-nums">{fmtNum(t.medianReach)}</b>
                  </div>
                  <BarraFina valor={t.medianReach} max={Math.max(...porTema.map((x) => x.medianReach))} cor="var(--s1)" />
                </li>
              ))}
            </ul>
          </div>
        )}
        {porFormato.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold" style={{ color: "var(--text-dim)" }}>
              Por formato
            </h3>
            <ul className="space-y-2.5">
              {porFormato.map((f) => (
                <li key={f.formato} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <IconeFormato formato={CONTENT_FORMATS.find((c) => c.label === f.formato)?.value} size={13} />
                      {f.formato}
                    </span>
                    <b className="shrink-0 text-xs tabular-nums">{fmtNum(f.medianReach)}</b>
                  </div>
                  <BarraFina valor={f.medianReach} max={Math.max(...porFormato.map((x) => x.medianReach))} cor="var(--s1)" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Painel>
  );
}

// Matriz tema × formato: cada célula é a taxa de engajamento (mediana), com a cor mais forte
// onde a combinação funciona. Substitui a tabela de cinco colunas.
function FormatoPorTema({ posts }: { posts: Post[] }) {
  const rows = useMemo(() => computeFormatoPorTema(posts), [posts]);
  if (rows.length === 0) return null;

  const formatos = CONTENT_FORMATS.filter((f) => rows.some((r) => r.formato === f.value));
  const temas = Array.from(new Set(rows.map((r) => r.tema)));
  const celula = (tema: string, formato: string) => rows.find((r) => r.tema === tema && r.formato === formato);
  const max = Math.max(0.0001, ...rows.map((r) => r.medianEngRate));

  return (
    <Painel
      icone={Grid3x3}
      cor="var(--ai)"
      titulo="Tema dentro de cada formato"
      resumo="Taxa de engajamento: quanto mais escuro, melhor"
      ajuda="O mesmo tema pode performar muito diferente dependendo do formato. Cada célula mostra a taxa de engajamento (mediana), a quantidade de posts e o alcance (mediana). Só aparecem combinações com tema classificado."
    >
      <div className="overflow-x-auto">
        <div className="grid min-w-[420px] gap-1.5" style={{ gridTemplateColumns: `minmax(110px,1.2fr) repeat(${formatos.length}, minmax(86px,1fr))` }}>
          <span />
          {formatos.map((f) => (
            <span key={f.value} className="flex items-center justify-center gap-1.5 pb-1 text-xs font-medium" style={{ color: "var(--text-dim)" }}>
              <IconeFormato formato={f.value} size={13} /> {f.label}
            </span>
          ))}
          {temas.map((t) => (
            <FragmentoLinha key={t} tema={t} formatos={formatos.map((f) => f.value)} celula={celula} max={max} />
          ))}
        </div>
      </div>
    </Painel>
  );
}

function FragmentoLinha({
  tema,
  formatos,
  celula,
  max,
}: {
  tema: string;
  formatos: string[];
  celula: (t: string, f: string) => { count: number; medianReach: number; medianEngRate: number } | undefined;
  max: number;
}) {
  return (
    <>
      <span className="flex items-center truncate pr-1 text-sm font-medium" title={tema}>
        <span className="truncate">{tema}</span>
      </span>
      {formatos.map((f) => {
        const c = celula(tema, f);
        if (!c)
          return (
            <span key={f} className="rounded-md py-2 text-center text-xs" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              —
            </span>
          );
        const forca = Math.round(15 + (c.medianEngRate / max) * 70);
        return (
          <span
            key={f}
            className="rounded-md px-1 py-1.5 text-center"
            style={{ background: `color-mix(in srgb, var(--ai) ${forca}%, var(--surface))` }}
            title={`${nPosts(c.count)} · alcance mediano ${fmtNum(c.medianReach)}`}
          >
            <b className="block text-sm tabular-nums">{c.medianEngRate.toFixed(1)}%</b>
            <span className="block text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
              {nPosts(c.count)}
            </span>
          </span>
        );
      })}
    </>
  );
}

function MelhoresGanchos({ posts }: { posts: Post[] }) {
  const top = useMemo(() => {
    return posts
      .map((p) => ({ post: p, gancho: firstLine(p.caption) }))
      .filter((x): x is { post: Post; gancho: string } => !!x.gancho)
      .sort((a, b) => (b.post.engagement ?? 0) - (a.post.engagement ?? 0))
      .slice(0, 8);
  }, [posts]);

  if (top.length === 0) return null;
  const max = Math.max(1, ...top.map((t) => t.post.engagement ?? 0));

  return (
    <Painel
      icone={Quote}
      cor="var(--s2)"
      titulo="Melhores ganchos"
      resumo="Como abriram os posts que mais engajaram"
      ajuda="Primeira linha da legenda dos posts com mais engajamento. É o padrão de abertura que mais prendeu atenção."
    >
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {top.map(({ post, gancho }) => (
          <li key={post.id}>
            <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl border p-2.5" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Miniatura url={post.thumbnail_url} formato={post.format} className="h-14 w-14" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm italic leading-snug">“{gancho}”</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <BarraFina valor={post.engagement ?? 0} max={max} cor="var(--s2)" />
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums">
                    <Heart size={12} /> {fmtNum(post.engagement)}
                  </span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

function RetencaoDeReels({ posts }: { posts: Post[] }) {
  const r = useMemo(() => computeRetencaoDeReels(posts, 8), [posts]);

  if (r.totalReels === 0) return null;

  // Tem reel, mas sem o dado de retenção: dizer o motivo, senão parece que o número está zerado.
  if (r.withData === 0) {
    return (
      <Painel icone={PlayCircle} cor="var(--s2)" titulo="Retenção dos reels" resumo={`${r.totalReels} reels no período, sem dado de retenção`}>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          O hook rate vem do “skip rate” da Meta, que só chega pela Windsor.ai. Contas sincronizadas direto pela Graph API não recebem esse campo.
        </p>
      </Painel>
    );
  }

  const maxHook = Math.max(1, ...r.melhores.map((m) => m.hookRate));

  return (
    <Painel
      icone={PlayCircle}
      cor="var(--s2)"
      titulo="Retenção dos reels"
      resumo="Quem ficou depois dos 3 primeiros segundos"
      ajuda="Hook rate é quanta gente não pulou nos 3 primeiros segundos: é o gancho fazendo efeito. Body rate e hold rate exigiriam a duração do vídeo, que a Meta não entrega por API. Por isso o tempo assistido aparece em segundos, não em porcentagem."
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Kpi icone={PlayCircle} cor="var(--s2)" rotulo="Hook rate (mediana)" valor={r.medianHookRate != null ? `${r.medianHookRate.toFixed(1)}%` : "—"} />
        <Kpi icone={Timer} cor="var(--s1)" rotulo="Tempo assistido (mediana)" valor={r.medianWatchSeconds != null ? `${r.medianWatchSeconds.toFixed(1)}s` : "—"} />
      </div>

      {r.withData < r.totalReels && (
        <p className="mb-2 text-[11px]" style={{ color: "var(--muted)" }}>
          Baseado em {r.withData} de {r.totalReels} reels. O resto ainda não tem o dado.
        </p>
      )}

      <ul className="space-y-2">
        {r.melhores.map(({ post, hookRate, avgWatchSeconds }) => (
          <li key={post.id}>
            <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl border p-2.5" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Miniatura url={post.thumbnail_url} formato="reels" className="h-12 w-12" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-sm">{firstLine(post.caption) ?? post.windsor_media_id}</span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <BarraFina valor={hookRate} max={maxHook} cor="var(--s2)" />
                  </span>
                  <b className="shrink-0 text-xs tabular-nums">{hookRate.toFixed(1)}%</b>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
                    <Timer size={12} /> {avgWatchSeconds != null ? `${avgWatchSeconds.toFixed(1)}s` : "—"}
                  </span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

function NextAngles({ clientId }: { clientId: string }) {
  const { data: angles, isLoading } = useQuery({
    queryKey: ["next-angles", clientId],
    queryFn: () => getNextAngles(clientId),
  });

  return (
    <Painel
      icone={Lightbulb}
      cor="var(--warn)"
      destaque
      titulo="Próximos ângulos"
      resumo="Direções para testar"
      ajuda="Sugestão de direção, nunca conteúdo pronto. A produção continua com o médico ou quem ele contratar."
    >
      {isLoading && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Calculando…
        </p>
      )}
      {!isLoading && (angles?.length ?? 0) === 0 && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Classifique alguns posts (tema, funil e estágio) para a sugestão ter o que comparar.
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {angles?.map((a, i) => (
          <li key={i} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Selo cor="var(--ai)">
                <Sparkles size={11} /> {a.tema}
              </Selo>
              <Selo cor={COR_FUNIL[a.funnel_stage as string]} titulo={funnelLabel(a.funnel_stage)}>
                {a.funnel_stage}
              </Selo>
              <Selo>{methodologyLabel(a.methodology_stage)}</Selo>
              <Selo cor={COR_FORMATO[a.format as string]}>
                <IconeFormato formato={a.format} size={11} /> {formatLabel(a.format)}
              </Selo>
            </div>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
              {a.rationale}
            </p>
          </li>
        ))}
      </ul>
    </Painel>
  );
}

type SortKey = "posted_at" | "reach" | "engagement" | "saved";

// Base completa dos posts do período: busca por legenda, filtro por tema e formato, ordenação por
// qualquer métrica. Abre em galeria (miniaturas) e troca para tabela quando a pessoa quer comparar números.
function ExploradorDePosts({ posts, periodLabel }: { posts: Post[]; periodLabel: string }) {
  const [search, setSearch] = useState("");
  const [temaFilter, setTemaFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("reach");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modo, setModo] = useState<"galeria" | "tabela">("galeria");
  const [limite, setLimite] = useState(24);

  const temas = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) if (p.tema) set.add(p.tema);
    return Array.from(set).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return posts
      .filter((p) => !term || (p.caption ?? "").toLowerCase().includes(term))
      .filter((p) => !temaFilter || p.tema === temaFilter)
      .filter((p) => !formatFilter || p.format === formatFilter)
      .sort((a, b) => {
        const av = sortKey === "posted_at" ? a.posted_at ?? "" : (a[sortKey] ?? 0);
        const bv = sortKey === "posted_at" ? b.posted_at ?? "" : (b[sortKey] ?? 0);
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [posts, search, temaFilter, formatFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }
  const seta = (key: SortKey) => (sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓");

  const campo = "rounded-md border px-2 py-1.5 text-sm";
  const estiloCampo = { borderColor: "var(--border)", background: "var(--surface-2)" } as const;

  return (
    <Painel
      icone={Search}
      titulo="Explorador de posts"
      resumo={`Todos os posts de ${periodLabel}`}
      ajuda="Todos os posts do período selecionado, filtráveis por tema e formato e ordenáveis por qualquer métrica. Funciona sem classificação (o formato já vem pronto) e fica mais rico conforme o tema é preenchido."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar na legenda…" className={`${campo} min-w-[160px] flex-1`} style={estiloCampo} />
        <select value={temaFilter} onChange={(e) => setTemaFilter(e.target.value)} className={campo} style={estiloCampo} aria-label="Tema">
          <option value="">Todos os temas</option>
          {temas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value as ContentFormat | "")} className={campo} style={estiloCampo} aria-label="Formato">
          <option value="">Todos os formatos</option>
          {CONTENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select value={sortKey} onChange={(e) => { setSortKey(e.target.value as SortKey); setSortDir("desc"); }} className={campo} style={estiloCampo} aria-label="Ordenar por">
          <option value="reach">Mais alcance</option>
          <option value="engagement">Mais engajamento</option>
          <option value="saved">Mais salvos</option>
          <option value="posted_at">Mais recentes</option>
        </select>
        <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }} role="group" aria-label="Modo de exibição">
          {([["galeria", LayoutGrid, "Galeria"], ["tabela", List, "Tabela"]] as const).map(([m, Icon, nome]) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className="flex h-9 w-9 items-center justify-center"
              style={{ background: modo === m ? "var(--accent)" : "var(--surface-2)", color: modo === m ? "var(--accent-ink)" : "var(--text-dim)" }}
              aria-pressed={modo === m}
              aria-label={nome}
              title={nome}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post encontrado com esses filtros.
        </p>
      ) : modo === "galeria" ? (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.slice(0, limite).map((p) => (
              <li key={p.id}>
                <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
                  <div className="relative">
                    <Miniatura url={p.thumbnail_url} formato={p.format} className="aspect-square w-full rounded-none" />
                    {p.format && (
                      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,.65)" }}>
                        <IconeFormato formato={p.format} size={13} />
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-semibold tabular-nums" style={{ background: "linear-gradient(transparent, rgba(0,0,0,.75))", color: "#fff" }}>
                      <span className="inline-flex items-center gap-1"><Eye size={11} /> {fmtNum(p.reach)}</span>
                      <span className="inline-flex items-center gap-1"><Heart size={11} /> {fmtNum(p.engagement)}</span>
                      <span className="inline-flex items-center gap-1"><Bookmark size={11} /> {fmtNum(p.saved)}</span>
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="line-clamp-2 text-xs leading-snug">{firstLine(p.caption) ?? p.windsor_media_id}</div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
                      <span>{dataCurta(p.posted_at)}</span>
                      {p.tema && <span className="truncate" style={{ color: "var(--ai)" }}>{p.tema}</span>}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
          {filtered.length > limite && (
            <button type="button" onClick={() => setLimite((n) => n + 24)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }}>
              <ChevronDown size={14} /> Ver mais ({filtered.length - limite} restantes)
            </button>
          )}
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                <th className="cursor-pointer pb-2" onClick={() => toggleSort("posted_at")}>Data{seta("posted_at")}</th>
                <th className="pb-2">Formato</th>
                <th className="pb-2">Tema</th>
                <th className="pb-2">Legenda</th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("reach")}>Alcance{seta("reach")}</th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("engagement")}>Engaj.{seta("engagement")}</th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("saved")}>Salvos{seta("saved")}</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap py-1.5" style={{ color: "var(--text-dim)" }}>{p.posted_at ? new Date(p.posted_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="py-1.5"><span className="inline-flex items-center gap-1.5"><IconeFormato formato={p.format} />{p.format ? formatLabel(p.format) : "—"}</span></td>
                  <td className="py-1.5">{p.tema ?? "—"}</td>
                  <td className="max-w-xs truncate py-1.5">{firstLine(p.caption) ?? p.windsor_media_id}</td>
                  <td className="py-1.5 text-right">{(p.reach ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">{(p.engagement ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">{(p.saved ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right"><a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>abrir ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}

function PostsRankingPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const { data: posts, isLoading } = useQuery({
    queryKey: ["ranked-posts", clientId, start, end],
    queryFn: () => getRankedPosts(clientId, start, end),
  });

  if (isLoading) return <p style={{ color: "var(--text-dim)" }}>Carregando posts…</p>;

  const rows = posts ?? [];

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="posts" />
      </div>

      <ResumoPosts posts={rows} />
      <TopDoMes posts={rows} />
      <RankingDePosts rows={rows} clientId={clientId} periodLabel={periodLabel} />
      <RepetirOuRevisar posts={rows} periodLabel={periodLabel} />
      <ConceitosVencedores posts={rows} />
      <TopPorTaxa posts={rows} />
      <ConversionByTag posts={rows} />
      <DesempenhoEstrutural posts={rows} />
      <FormatoPorTema posts={rows} />
      <MelhoresGanchos posts={rows} />
      <RetencaoDeReels posts={rows} />
      <NextAngles clientId={clientId} />
      <ExploradorDePosts posts={rows} periodLabel={periodLabel} />
    </div>
  );
}
