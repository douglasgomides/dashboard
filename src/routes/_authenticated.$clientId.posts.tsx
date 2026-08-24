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
      <td className="py-2 pr-3 text-right text-sm">{post.saved ?? 0}</td>
      <td className="py-2 pr-3 text-right text-sm">{post.engagement ?? 0}</td>
      <td className="py-2 pr-3 text-right text-sm">{post.reach ?? 0}</td>
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
              <td className="py-1.5 text-right font-medium">{g.avgSaved.toFixed(1)}</td>
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
              <td className="py-1.5 text-right font-medium">{post.engagement ?? 0}</td>
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
            <div className="mt-1 font-medium">{post.saved ?? 0} salvos</div>
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
      <MelhoresGanchos posts={rows} />
      <NextAngles clientId={clientId} />
    </div>
  );
}
