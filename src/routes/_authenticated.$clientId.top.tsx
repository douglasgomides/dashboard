import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { getAudiencia, fmtN, fmtPct } from "@/lib/audiencia";
import { METRICAS, topN, padroesDoTop, ehReel, ehPostDeFeed, valorDaMetrica, type MetricaTop } from "@/lib/top-conteudo";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
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

function Miniatura({ url }: { url: string | null }) {
  const [erro, setErro] = useState(false);
  if (!url || erro) return <div style={{ width: 64, height: 64, borderRadius: 8, background: "var(--surface-2)", flex: "none" }} />;
  return <img src={url} alt="" loading="lazy" onError={() => setErro(true)} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", flex: "none" }} />;
}

function Padroes({ frases, vazio }: { frases: string[]; vazio: string | null }) {
  return (
    <div className="card" style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
      <h2>O que os melhores têm em comum</h2>
      {frases.length > 0 ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13.5 }}>
          {frases.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="note" style={{ marginTop: 6 }}>{vazio}</p>
      )}
      <p className="note" style={{ marginTop: 8 }}>Só entra o que difere 15 pontos percentuais ou mais do conjunto de todos os posts do período. É um padrão para testar, não uma regra.</p>
    </div>
  );
}

function ListaDePosts({ itens, metrica, reels }: { itens: { p: any; v: number }[]; metrica: MetricaTop; reels: boolean }) {
  const rotulo = METRICAS.find((m) => m.id === metrica)?.rotulo ?? "";
  const fmtV = (v: number) => (metrica === "taxa_salvamento" ? fmtPct(v, 2) : fmtN(v));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {itens.map(({ p, v }, i) => (
        <div key={p.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
          <span style={{ fontFamily: "var(--mono, monospace)", color: "var(--muted)", width: 26, textAlign: "right", flex: "none" }}>#{i + 1}</span>
          <Miniatura url={p.thumbnail_url} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {gancho(p.caption) || "(sem legenda)"}
            </a>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {quando(p.posted_at)}
              {p.format && !reels ? ` · ${p.format === "carrossel" ? "Carrossel" : p.format === "estatico" ? "Imagem" : p.format}` : ""}
              {p.tema ? ` · ${p.tema}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
              {p.reach != null && <span>alcance {fmtN(p.reach)}</span>}
              {p.saved != null && <span>salvos {fmtN(p.saved)}</span>}
              {p.shares != null && <span>compart. {fmtN(p.shares)}</span>}
              {p.likes != null && <span>curtidas {fmtN(p.likes)}</span>}
              {p.comments != null && <span>coment. {fmtN(p.comments)}</span>}
              {reels && p.views != null && <span>views {fmtN(p.views)}</span>}
              {reels && p.reel_skip_rate != null && <span>pulam {fmtPct(Number(p.reel_skip_rate) * (Number(p.reel_skip_rate) <= 1 ? 100 : 1))}</span>}
              {reels && p.reel_avg_watch_time_ms != null && <span>tempo médio {(Number(p.reel_avg_watch_time_ms) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}s</span>}
            </div>
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{fmtV(v)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{rotulo.toLowerCase()}</div>
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
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Ranking de stories ainda não disponível</h2>
          <p className="note txt" style={{ marginTop: 6 }}>
            Stories saem do ar em 24 horas e a Meta não guarda o histórico. O Hub passa a guardar cada story todo dia, mas a tabela <code>instagram_stories</code>{" "}
            ainda não existe neste banco: falta aplicar a migração <code>20261007120000_instagram_stories.sql</code>. Depois disso o ranking se forma a partir do primeiro dia.
          </p>
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
            <div style={{ display: "grid", gap: 8 }}>
              {top.map((s, i) => (
                <div key={s.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
                  <span style={{ fontFamily: "var(--mono, monospace)", color: "var(--muted)", width: 26, textAlign: "right", flex: "none" }}>#{i + 1}</span>
                  <Miniatura url={s.thumbnail_url} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <a href={s.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>Story de {quando(s.posted_at)}</a>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                      {s.reach != null && <span>alcance {fmtN(s.reach)}</span>}
                      {s.views != null && <span>views {fmtN(s.views)}</span>}
                      {s.replies != null && <span>respostas {fmtN(s.replies)}</span>}
                      {s.shares != null && <span>compart. {fmtN(s.shares)}</span>}
                      {s.profile_visits != null && <span>visitas ao perfil {fmtN(s.profile_visits)}</span>}
                      {s.follows != null && <span>novos seguidores {fmtN(s.follows)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 20, fontWeight: 650 }}>{fmtN(Number(s[metrica]))}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{METRICAS_STORY.find((m) => m.id === metrica)?.rotulo.toLowerCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="note" style={{ marginTop: 10 }}>As métricas de um story são lidas enquanto ele está no ar; stories postados há poucas horas podem ter números ainda parciais.</p>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Stories no ar agora</h2>
        <p className="sub">Lidos ao vivo da Meta, com os números de agora.</p>
        {aoVivo.isLoading ? (
          <Carregando texto="Lendo da Meta…" />
        ) : !vivos ? (
          <p className="note" style={{ marginTop: 8 }}>{aoVivo.data?.nada_a_fazer ?? aoVivo.data?.erro ?? "Não foi possível ler os stories agora."}</p>
        ) : !vivos.ok ? (
          <p className="note" style={{ marginTop: 8 }}>A Meta não devolveu os stories: {vivos.erro}</p>
        ) : vivos.dados.length === 0 ? (
          <p className="note" style={{ marginTop: 8 }}>Nenhum story no ar neste momento.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {vivos.dados.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Miniatura url={s.thumbnail_url} />
                <div style={{ fontSize: 13 }}>
                  <a href={s.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600 }}>Story de {quando(s.postado_em)}</a>
                  <div style={{ color: "var(--ink-2)", fontSize: 12 }}>
                    alcance {fmtN(s.alcance ?? 0)} · views {fmtN(s.views ?? 0)} · respostas {fmtN(s.respostas ?? 0)} · compart. {fmtN(s.compartilhamentos ?? 0)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
      <p>Os 20 melhores posts, Reels e stories do período ({periodLabel}), na métrica que você escolher, e o que eles têm em comum.</p>
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
