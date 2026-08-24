import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/$clientId/posts")({
  component: PostsRankingPage,
});

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

type Post = NonNullable<Awaited<ReturnType<typeof getRankedPosts>>>[number];

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
      className="rounded-md border px-2 py-1 text-xs"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
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

function PostRow({ post, clientId }: { post: Post; clientId: string }) {
  const queryClient = useQueryClient();

  async function update(fields: Parameters<typeof classifyPost>[1]) {
    await classifyPost(post.id, fields);
    queryClient.invalidateQueries({ queryKey: ["ranked-posts", clientId] });
    queryClient.invalidateQueries({ queryKey: ["next-angles", clientId] });
  }

  return (
    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 pr-3">
        <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? "…" : "") : post.windsor_media_id}
        </a>
        <div className="text-xs" style={{ color: "var(--text-faint)" }}>
          {post.posted_at ? new Date(post.posted_at).toLocaleDateString("pt-BR") : "—"}
        </div>
      </td>
      <td className="py-2 pr-3 text-right text-sm">{fmtNum(post.saved)}</td>
      <td className="py-2 pr-3 text-right text-sm">{fmtNum(post.engagement)}</td>
      <td className="py-2 pr-3 text-right text-sm">{fmtNum(post.reach)}</td>
      <td className="py-2 pr-3">
        <input
          defaultValue={post.tema ?? ""}
          placeholder="tema"
          onBlur={(e) => e.target.value !== (post.tema ?? "") && update({ tema: e.target.value || null })}
          className="w-28 rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </td>
      <td className="py-2 pr-3">
        <ClassifySelect<FunnelStage>
          value={post.funnel_stage}
          options={FUNNEL_STAGES.map((s) => ({ value: s.value, label: s.value }))}
          placeholder="Funil"
          onChange={(v) => update({ funnel_stage: v })}
        />
      </td>
      <td className="py-2 pr-3">
        <ClassifySelect<MethodologyStage>
          value={post.methodology_stage}
          options={METHODOLOGY_STAGES}
          placeholder="Estágio"
          onChange={(v) => update({ methodology_stage: v })}
        />
      </td>
      <td className="py-2">
        <ClassifySelect<ContentFormat>
          value={post.format}
          options={CONTENT_FORMATS}
          placeholder="Formato"
          onChange={(v) => update({ format: v })}
        />
      </td>
    </tr>
  );
}

function ConversionByTag({ posts }: { posts: Post[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { tema: string; format: string; count: number; totalSaved: number }>();
    for (const p of posts) {
      if (!p.tema) continue;
      const key = `${p.tema}__${p.format ?? "—"}`;
      const entry = map.get(key) ?? { tema: p.tema, format: formatLabel(p.format), count: 0, totalSaved: 0 };
      entry.count += 1;
      entry.totalSaved += p.saved ?? 0;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, avgSaved: e.totalSaved / e.count }))
      .sort((a, b) => b.avgSaved - a.avgSaved);
  }, [posts]);

  if (grouped.length === 0) return null;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">Conversão real por tema/formato</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Proxy de conversão real (salvamentos, não likes) — só aparece depois que os posts são classificados na tabela abaixo.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
            <th className="pb-2">Tema</th>
            <th className="pb-2">Formato</th>
            <th className="pb-2 text-right">Posts</th>
            <th className="pb-2 text-right">Média de salvamentos</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <tr key={`${g.tema}-${g.format}`} className="border-t" style={{ borderColor: "var(--border-soft, var(--border))" }}>
              <td className="py-1.5">{g.tema}</td>
              <td className="py-1.5">{g.format}</td>
              <td className="py-1.5 text-right">{g.count}</td>
              <td className="py-1.5 text-right font-medium">
                {g.avgSaved.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function firstLine(caption: string | null): string | null {
  if (!caption) return null;
  const line = caption.split("\n").find((l) => l.trim().length > 0);
  return line ? line.trim() : null;
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

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Melhores ganchos</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Primeira linha da legenda dos posts com mais engajamento — o padrão de abertura que mais prendeu atenção.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
            <th className="pb-2">Gancho</th>
            <th className="pb-2 text-right">Engajamento</th>
          </tr>
        </thead>
        <tbody>
          {top.map(({ post, gancho }) => (
            <tr key={post.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5">
                <a href={post.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--text)" }}>
                  {gancho}
                </a>
              </td>
              <td className="py-1.5 text-right font-medium">{fmtNum(post.engagement)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopDoMes({ posts }: { posts: Post[] }) {
  const top5 = posts.slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">🏆 Top 5 do mês — considere repetir</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Os posts que mais salvaram no mês. Classifique-os abaixo (tema/funil/estágio) pra virarem sugestão de
        "próximos ângulos" automaticamente.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {top5.map((post, i) => (
          <a
            key={post.id}
            href={post.permalink ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border p-2 text-xs"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <div className="font-mono" style={{ color: "var(--text-faint)" }}>
              #{i + 1}
            </div>
            <div className="mt-1 line-clamp-3">{firstLine(post.caption) ?? post.windsor_media_id}</div>
            <div className="mt-1 font-medium">{fmtNum(post.saved)} salvos</div>
          </a>
        ))}
      </div>
    </div>
  );
}

// Divide os temas classificados em "repetir" (taxa de engajamento acima da
// média entre os temas com volume) e "revisar" (abaixo) — não é opinião,
// é o cálculo dos últimos posts do mês. Precisa de tema classificado na
// tabela abaixo pra ter dado.
function RepetirOuRevisar({ posts }: { posts: Post[] }) {
  const MIN_POSTS = 3;

  const { repetir, revisar, hasEnough } = useMemo(() => {
    const groups = new Map<string, { tema: string; count: number; totalEng: number; totalReach: number }>();
    for (const p of posts) {
      if (!p.tema || p.engagement == null || p.reach == null) continue;
      const entry = groups.get(p.tema) ?? { tema: p.tema, count: 0, totalEng: 0, totalReach: 0 };
      entry.count += 1;
      entry.totalEng += p.engagement;
      entry.totalReach += p.reach;
      groups.set(p.tema, entry);
    }
    const qualifying = Array.from(groups.values())
      .filter((g) => g.count >= MIN_POSTS && g.totalReach > 0)
      .map((g) => ({ ...g, rate: g.totalEng / g.totalReach }));
    if (qualifying.length === 0) return { repetir: [], revisar: [], hasEnough: false };
    const baseline = qualifying.reduce((s, g) => s + g.rate, 0) / qualifying.length;
    return {
      repetir: qualifying.filter((g) => g.rate >= baseline).sort((a, b) => b.rate - a.rate),
      revisar: qualifying.filter((g) => g.rate < baseline).sort((a, b) => a.rate - b.rate),
      hasEnough: true,
    };
  }, [posts]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">O que repetir vs. o que revisar</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Calculado pela taxa de engajamento (engajamento ÷ alcance) dos temas com pelo menos {MIN_POSTS} posts
        classificados neste mês.
      </p>
      {!hasEnough ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Classifique o <strong>tema</strong> de pelo menos {MIN_POSTS} posts do mesmo assunto na tabela abaixo pra
          habilitar esse veredito.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--good)" }}>
              ↑ Repetir
            </h3>
            {repetir.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                Nenhum tema acima da média ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {repetir.map((g) => (
                  <li key={g.tema} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{g.tema}</div>
                    <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--danger)" }}>
              ↓ Revisar ou descontinuar
            </h3>
            {revisar.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-dim)" }}>
                Nenhum tema abaixo da média ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {revisar.map((g) => (
                  <li key={g.tema} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    <div className="font-medium">{g.tema}</div>
                    <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                      {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Mesmo tema pode performar diferente dependendo do formato — cruza os dois
// pra mostrar onde a combinação funciona e onde não funciona. Só aparece
// nas combinações com tema classificado.
function FormatoPorTema({ posts }: { posts: Post[] }) {
  const rows = useMemo(() => {
    const groups = new Map<string, { tema: string; formato: ContentFormat; count: number; totalReach: number; totalEng: number }>();
    for (const p of posts) {
      if (!p.tema || !p.format) continue;
      const key = `${p.tema}__${p.format}`;
      const entry = groups.get(key) ?? { tema: p.tema, formato: p.format, count: 0, totalReach: 0, totalEng: 0 };
      entry.count += 1;
      entry.totalReach += p.reach ?? 0;
      entry.totalEng += p.engagement ?? 0;
      groups.set(key, entry);
    }
    return Array.from(groups.values())
      .map((g) => ({
        ...g,
        avgReach: g.totalReach / g.count,
        engRate: g.totalReach > 0 ? (g.totalEng / g.totalReach) * 100 : 0,
      }))
      .sort((a, b) => b.avgReach - a.avgReach);
  }, [posts]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Tema dentro de cada formato</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        O mesmo tema pode performar muito diferente dependendo do formato.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
            <th className="pb-2">Tema</th>
            <th className="pb-2">Formato</th>
            <th className="pb-2 text-right">Posts</th>
            <th className="pb-2 text-right">Alcance médio</th>
            <th className="pb-2 text-right">Tx. engaj.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.tema}-${r.formato}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1.5">{r.tema}</td>
              <td className="py-1.5">{formatLabel(r.formato)}</td>
              <td className="py-1.5 text-right">{r.count}</td>
              <td className="py-1.5 text-right">{fmtNum(Math.round(r.avgReach))}</td>
              <td className="py-1.5 text-right font-medium">{r.engRate.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortKey = "posted_at" | "reach" | "engagement" | "saved";

// Base completa dos posts do mês — busca por legenda + filtro por tema e
// formato + ordena por qualquer métrica. Não depende de classificação pra
// funcionar (formato já vem pronto), fica mais rico conforme tema é preenchido.
function ExploradorDePosts({ posts }: { posts: Post[] }) {
  const [search, setSearch] = useState("");
  const [temaFilter, setTemaFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("reach");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Explorador de posts</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Todos os posts do mês, filtráveis por tema e formato, ordenáveis por qualquer métrica.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar na legenda..."
          className="min-w-[200px] flex-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
        <select
          value={temaFilter}
          onChange={(e) => setTemaFilter(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="">Todos os temas</option>
          {temas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as ContentFormat | "")}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="">Todos os formatos</option>
          {CONTENT_FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post encontrado com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                <th className="cursor-pointer pb-2" onClick={() => toggleSort("posted_at")}>
                  Data{sortIndicator("posted_at")}
                </th>
                <th className="pb-2">Formato</th>
                <th className="pb-2">Tema</th>
                <th className="pb-2">Legenda</th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("reach")}>
                  Alcance{sortIndicator("reach")}
                </th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("engagement")}>
                  Engaj.{sortIndicator("engagement")}
                </th>
                <th className="cursor-pointer pb-2 text-right" onClick={() => toggleSort("saved")}>
                  Salvos{sortIndicator("saved")}
                </th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 whitespace-nowrap" style={{ color: "var(--text-dim)" }}>
                    {p.posted_at ? new Date(p.posted_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="py-1.5">{p.format ? formatLabel(p.format) : "—"}</td>
                  <td className="py-1.5">{p.tema ?? "—"}</td>
                  <td className="max-w-xs truncate py-1.5">{firstLine(p.caption) ?? p.windsor_media_id}</td>
                  <td className="py-1.5 text-right">{(p.reach ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">{(p.engagement ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">{(p.saved ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 text-right">
                    <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      abrir ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NextAngles({ clientId }: { clientId: string }) {
  const { data: angles, isLoading } = useQuery({
    queryKey: ["next-angles", clientId],
    queryFn: () => getNextAngles(clientId),
  });

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Próximos ângulos</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Sugestão de direção — nunca conteúdo pronto. A produção continua com o médico ou quem ele contratar.
      </p>
      {isLoading && <p className="text-xs" style={{ color: "var(--text-dim)" }}>Calculando…</p>}
      {!isLoading && (angles?.length ?? 0) === 0 && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Classifique alguns posts (tema/funil/estágio) pra a heurística ter o que comparar.
        </p>
      )}
      <ul className="space-y-2">
        {angles?.map((a, i) => (
          <li key={i} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="font-medium">
              {a.tema} · {funnelLabel(a.funnel_stage)} · {methodologyLabel(a.methodology_stage)} · {formatLabel(a.format)}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
              {a.rationale}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PostsRankingPage() {
  const { clientId } = Route.useParams();
  const { start, end } = monthBounds();
  const [formatFilter, setFormatFilter] = useState<ContentFormat | "">("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["ranked-posts", clientId, start, end],
    queryFn: () => getRankedPosts(clientId, start, end),
  });

  if (isLoading) return <p style={{ color: "var(--text-dim)" }}>Carregando posts…</p>;

  const rows = posts ?? [];
  const filteredRows = formatFilter ? rows.filter((p) => p.format === formatFilter) : rows;

  return (
    <div className="space-y-6">
      <TopDoMes posts={rows} />

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Ranking de posts do mês (por salvamentos)</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              Formato:
            </span>
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value as ContentFormat | "")}
              className="rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <option value="">Todos</option>
              {CONTENT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Sem posts sincronizados pra este mês. Rode <code>npm run sync:instagram</code>.
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Nenhum post nesse formato este mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                  <th className="pb-2">Post</th>
                  <th className="pb-2 text-right">Salvos</th>
                  <th className="pb-2 text-right">Engajamento</th>
                  <th className="pb-2 text-right">Alcance</th>
                  <th className="pb-2">Tema</th>
                  <th className="pb-2">Funil</th>
                  <th className="pb-2">Estágio</th>
                  <th className="pb-2">Formato</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((post) => (
                  <PostRow key={post.id} post={post} clientId={clientId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RepetirOuRevisar posts={rows} />
      <ConversionByTag posts={rows} />
      <FormatoPorTema posts={rows} />
      <MelhoresGanchos posts={rows} />
      <NextAngles clientId={clientId} />
      <ExploradorDePosts posts={rows} />
    </div>
  );
}
