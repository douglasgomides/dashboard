import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { getAudiencia, fmtN, fmtPct } from "@/lib/audiencia";
import { METRICAS, topN, padroesDoTop, ehReel, ehPostDeFeed, valorDaMetrica, type MetricaTop } from "@/lib/top-conteudo";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
import { Painel, Selo, Miniatura, Numero, IconeFormato, Ajuda } from "@/components/visual";
import { Trophy, Sparkles, Eye, Target, Bookmark, Share2, Heart, MessageCircle, FastForward, Timer, Clock, UserPlus, Reply, Users, Radio, Film, Image as ImageIcon, CircleDot, Lightbulb, ArrowUpDown } from "lucide-react";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/top")({
  component: TopPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
type Aba = "posts" | "reels" | "stories";
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function quando(iso: string | null) {
  if (!iso) return "";
  const { weekday, hour } = brazilWeekdayAndHour(iso);
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${DIAS[weekday]}, ${data}, ${hour}h`;
}
const gancho = (c: string | null | undefined) => (c ?? "").split("\n")[0].trim();

function Padroes({ frases, vazio }: { frases: string[]; vazio: string | null }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Painel
        icone={Lightbulb}
        titulo="O que os melhores têm em comum"
        cor="var(--warn)"
        destaque
        ajuda={<>Só entra o que difere 15 pontos percentuais ou mais do conjunto de todos os posts do período. É um padrão para testar, não uma regra.</>}
      >
        {frases.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, fontSize: 13.5 }}>
            {frases.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note" style={{ margin: 0 }}>{vazio}</p>
        )}
      </Painel>
    </div>
  );
}

function Posicao({ i }: { i: number }) {
  const cor = i === 0 ? "var(--warn)" : i === 1 ? "var(--muted)" : i === 2 ? "var(--s3)" : "var(--text-dim)";
  return (
    <span
      className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor }}
      title={`${i + 1}º lugar`}
    >
      {i < 3 ? <Trophy size={13} aria-hidden /> : null}
      {i < 3 ? <span className="ml-0.5">{i + 1}</span> : i + 1}
    </span>
  );
}

function ListaDePosts({ itens, metrica, reels }: { itens: { p: any; v: number }[]; metrica: MetricaTop; reels: boolean }) {
  const rotulo = METRICAS.find((m) => m.id === metrica)?.rotulo ?? "";
  const fmtV = (v: number) => (metrica === "taxa_salvamento" ? fmtPct(v, 2) : fmtN(v));
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0,1fr)" }}>
      {itens.map(({ p, v }, i) => (
        <div key={p.id} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <Posicao i={i} />
            <Miniatura url={p.thumbnail_url} formato={p.format} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                {gancho(p.caption) || "(sem legenda)"}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {p.format && <IconeFormato formato={p.format} />}
                {p.format && !reels && <Selo>{p.format === "carrossel" ? "Carrossel" : p.format === "estatico" ? "Imagem" : p.format}</Selo>}
                {p.tema && <Selo cor="var(--ai)">{p.tema}</Selo>}
                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  <Clock size={11} aria-hidden />
                  {quando(p.posted_at)}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xl font-semibold tabular-nums leading-none">{fmtV(v)}</div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{rotulo.toLowerCase()}</div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            {p.reach != null && <Numero icone={Target} valor={fmtN(p.reach)} rotulo="Alcance" />}
            {p.saved != null && <Numero icone={Bookmark} valor={fmtN(p.saved)} rotulo="Salvos" />}
            {p.shares != null && <Numero icone={Share2} valor={fmtN(p.shares)} rotulo="Compartilhamentos" />}
            {p.likes != null && <Numero icone={Heart} valor={fmtN(p.likes)} rotulo="Curtidas" />}
            {p.comments != null && <Numero icone={MessageCircle} valor={fmtN(p.comments)} rotulo="Comentários" />}
            {reels && p.views != null && <Numero icone={Eye} valor={fmtN(p.views)} rotulo="Visualizações" />}
            {reels && p.reel_skip_rate != null && <Numero icone={FastForward} valor={fmtPct(Number(p.reel_skip_rate) * (Number(p.reel_skip_rate) <= 1 ? 100 : 1))} rotulo="Pulam" cor="var(--crit)" />}
            {reels && p.reel_avg_watch_time_ms != null && <Numero icone={Timer} valor={`${(Number(p.reel_avg_watch_time_ms) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s`} rotulo="Tempo médio" />}
          </div>
        </div>
      ))}
    </div>
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
        .gte("posted_at", start)
        .lte("posted_at", end + "T23:59:59")
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

  return (
    <div>
      {guardados.data?.indisponivel && (
        <div style={{ marginBottom: 16 }}>
          <Painel
            icone={CircleDot}
            titulo="Ranking de stories em breve"
            resumo="Falta criar a tabela de stories no banco"
            cor="var(--warn)"
            ajuda={<>
              Stories saem do ar em 24 horas e a Meta não guarda o histórico. O Hub passa a guardar cada story todo dia, mas a tabela <code>instagram_stories</code>{" "}
              ainda não existe neste banco: falta aplicar a migração <code>20261007120000_instagram_stories.sql</code>. Depois disso o ranking se forma a partir do primeiro dia.
            </>}
          >
            <Selo cor="var(--warn)">Migração pendente</Selo>
          </Painel>
        </div>
      )}
      {guardados.data && !guardados.data.indisponivel && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label htmlFor="metrica-story" className="sub">Ordenar por</label>
            <select id="metrica-story" value={metrica} onChange={(e) => setMetrica(e.target.value as typeof metrica)} style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}>
              {METRICAS_STORY.map((m) => (
                <option key={m.id} value={m.id}>{m.rotulo}</option>
              ))}
            </select>
            <span className="sub">{guardados.data.linhas.length} stories guardados no período</span>
          </div>
          {top.length === 0 ? (
            <p className="note">Nenhum story guardado neste período ainda. O Hub guarda os que estão no ar a cada atualização do Instagram.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0,1fr)" }}>
              {top.map((s, i) => (
                <div key={s.id} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <Posicao i={i} />
                    <Miniatura url={s.thumbnail_url} formato="stories" className="h-16 w-16" />
                    <div className="min-w-0 flex-1">
                      <a href={s.permalink ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>Story de {quando(s.posted_at)}</a>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xl font-semibold tabular-nums leading-none">{fmtN(Number(s[metrica]))}</div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{METRICAS_STORY.find((m) => m.id === metrica)?.rotulo.toLowerCase()}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                    {s.reach != null && <Numero icone={Target} valor={fmtN(s.reach)} rotulo="Alcance" />}
                    {s.views != null && <Numero icone={Eye} valor={fmtN(s.views)} rotulo="Visualizações" />}
                    {s.replies != null && <Numero icone={Reply} valor={fmtN(s.replies)} rotulo="Respostas" />}
                    {s.shares != null && <Numero icone={Share2} valor={fmtN(s.shares)} rotulo="Compartilhamentos" />}
                    {s.profile_visits != null && <Numero icone={Users} valor={fmtN(s.profile_visits)} rotulo="Visitas ao perfil" />}
                    {s.follows != null && <Numero icone={UserPlus} valor={fmtN(s.follows)} rotulo="Novos seguidores" cor="var(--good-text)" />}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="note" style={{ marginTop: 10 }}>As métricas de um story são lidas enquanto ele está no ar; stories postados há poucas horas podem ter números ainda parciais.</p>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Painel icone={Radio} titulo="Stories no ar agora" resumo="Ao vivo da Meta" cor="var(--crit)" ajuda={<>Lidos ao vivo da Meta, com os números de agora.</>}>
          {aoVivo.isLoading ? (
            <Carregando texto="Lendo da Meta…" />
          ) : !vivos ? (
            <p className="note" style={{ margin: 0 }}>{aoVivo.data?.nada_a_fazer ?? aoVivo.data?.erro ?? "Não foi possível ler os stories agora."}</p>
          ) : !vivos.ok ? (
            <p className="note" style={{ margin: 0 }}>A Meta não devolveu os stories: {vivos.erro}</p>
          ) : vivos.dados.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>Nenhum story no ar neste momento.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {vivos.dados.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Miniatura url={s.thumbnail_url} formato="stories" className="h-14 w-14" />
                  <div className="min-w-0">
                    <a href={s.permalink ?? "#"} target="_blank" rel="noreferrer" className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Story de {quando(s.postado_em)}</a>
                    <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1">
                      <Numero icone={Target} valor={fmtN(s.alcance ?? 0)} rotulo="Alcance" />
                      <Numero icone={Eye} valor={fmtN(s.views ?? 0)} rotulo="Visualizações" />
                      <Numero icone={Reply} valor={fmtN(s.respostas ?? 0)} rotulo="Respostas" />
                      <Numero icone={Share2} valor={fmtN(s.compartilhamentos ?? 0)} rotulo="Compartilhamentos" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Painel>
      </div>
    </div>
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

  const head = (
    <div className="hpagehead">
      <h2>Top conteúdos</h2>
      <div className="flex items-center gap-2">
        <Trophy size={14} aria-hidden style={{ color: "var(--warn)" }} />
        <span>Os 20 melhores do período</span>
        <Ajuda>Os 20 melhores posts, Reels e stories do período ({periodLabel}), na métrica que você escolher, e o que eles têm em comum.</Ajuda>
      </div>
    </div>
  );
  if (fontes.isLoading) return <div>{head}<Carregando /></div>;
  if (fontes.error) return <div>{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div>{head}<SemFonte {...SEM_INSTAGRAM} /></div>;

  return (
    <div>
      {head}
      <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
        {(["posts", "reels", "stories"] as Aba[]).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={aba === x} aria-pressed={aba === x} onClick={() => setAba(x)}>
            {x === "posts" ? <ImageIcon size={14} aria-hidden className="mr-1 inline-block align-[-2px]" /> : x === "reels" ? <Film size={14} aria-hidden className="mr-1 inline-block align-[-2px]" /> : <CircleDot size={14} aria-hidden className="mr-1 inline-block align-[-2px]" />}
            {x === "posts" ? "Top 20 posts" : x === "reels" ? "Top 20 Reels" : "Top 20 stories"}
          </button>
        ))}
      </div>
      {aba === "stories" ? (
        <Stories clientId={clientId} start={start} end={end} />
      ) : posts.isLoading ? (
        <Carregando texto="Lendo os posts…" />
      ) : posts.error ? (
        <ErroCarga texto="Falha ao ler os posts do período." />
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label htmlFor="metrica-top" className="sub">Ordenar por</label>
            <select id="metrica-top" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaTop)} style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}>
              {METRICAS.filter((m) => aba === "reels" || m.id !== "views" || todosDoTipo.some((p) => valorDaMetrica(p, "views") != null)).map((m) => (
                <option key={m.id} value={m.id}>{m.rotulo}</option>
              ))}
            </select>
            <span className="sub">{todosDoTipo.length} {aba === "reels" ? "Reels" : "posts"} no período</span>
          </div>
          {top.length === 0 ? (
            <SemFonte titulo={`Sem ${aba === "reels" ? "Reels" : "posts"} com essa métrica`} texto={`Nenhum ${aba === "reels" ? "Reel" : "post"} do período tem a métrica escolhida. Troque o período no topo ou a métrica.`} />
          ) : (
            <>
              <Padroes frases={padroes.frases} vazio={padroes.motivoVazio} />
              <ListaDePosts itens={top} metrica={metrica} reels={aba === "reels"} />
            </>
          )}
        </>
      )}
    </div>
  );
}
