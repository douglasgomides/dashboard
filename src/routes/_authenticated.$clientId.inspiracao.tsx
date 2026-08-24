import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listInspirationPosts } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/inspiracao")({
  component: InspiracaoPage,
});

type Post = NonNullable<Awaited<ReturnType<typeof listInspirationPosts>>>[number];

const REPLICABILIDADE_LABEL: Record<string, string> = {
  alta: "Replicabilidade alta",
  media: "Replicabilidade média",
  baixa: "Replicabilidade baixa",
};

const REPLICABILIDADE_COLOR: Record<string, string> = {
  alta: "var(--good)",
  media: "var(--warn)",
  baixa: "var(--danger)",
};

function PostCard({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
          <span
            className="rounded-full px-2 py-0.5 font-mono uppercase tracking-wide"
            style={{
              background: post.grupo === "Cases Doctor" ? "var(--danger-bg)" : "var(--info-bg, var(--accent-soft))",
              color: post.grupo === "Cases Doctor" ? "var(--danger)" : "var(--accent)",
            }}
          >
            {post.grupo}
          </span>
          <span>{post.especialidade}</span>
          <span>·</span>
          <span>{post.formato ?? post.midia}</span>
          {post.metrica_valor != null && (
            <>
              <span>·</span>
              <span>
                <b>{post.metrica_valor.toLocaleString("pt-BR")}</b> {post.metrica_label}
              </span>
            </>
          )}
        </div>
        {post.multiplicador_mediana != null && (
          <div className="shrink-0 text-right">
            <div className="font-mono text-lg font-semibold" style={{ color: "var(--accent)" }}>
              {post.multiplicador_mediana}×
            </div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              a mediana do perfil
            </div>
          </div>
        )}
      </div>

      <h3 className="mt-2 text-sm font-semibold">{post.titulo}</h3>
      {post.fonte_url && (
        <a
          href={post.fonte_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs"
          style={{ color: "var(--accent)" }}
        >
          {post.fonte_handle} ↗
        </a>
      )}
      {post.gancho && (
        <blockquote
          className="mt-2 border-l-2 pl-3 text-sm italic"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          {post.gancho}
        </blockquote>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-xs font-medium"
        style={{ color: "var(--accent)" }}
      >
        {open ? "Ocultar leitura" : "Ver por que funcionou e como adaptar"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {post.estrutura && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Estrutura
              </div>
              <p style={{ color: "var(--text-dim)" }}>{post.estrutura}</p>
            </div>
          )}
          {post.por_que_funcionou && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Por que funcionou
              </div>
              <p style={{ color: "var(--text-dim)" }}>{post.por_que_funcionou}</p>
            </div>
          )}
          {post.como_adaptar && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Como adaptar
              </div>
              <p style={{ color: "var(--text-dim)" }}>{post.como_adaptar}</p>
            </div>
          )}
          {post.replicabilidade && (
            <div
              className="rounded-lg border p-2 text-xs"
              style={{
                borderColor: REPLICABILIDADE_COLOR[post.replicabilidade],
                color: "var(--text)",
              }}
            >
              <b style={{ color: REPLICABILIDADE_COLOR[post.replicabilidade] }}>
                {REPLICABILIDADE_LABEL[post.replicabilidade]}.
              </b>{" "}
              {post.replicabilidade_texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InspiracaoPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["inspiration-posts"],
    queryFn: listInspirationPosts,
  });

  const [grupo, setGrupo] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [midia, setMidia] = useState("");
  const [busca, setBusca] = useState("");

  const especialidades = useMemo(
    () => Array.from(new Set((posts ?? []).map((p) => p.especialidade))).sort(),
    [posts],
  );

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (posts ?? []).filter((p) => {
      if (grupo && p.grupo !== grupo) return false;
      if (especialidade && p.especialidade !== especialidade) return false;
      if (midia && p.midia !== midia) return false;
      if (q) {
        const haystack = `${p.titulo} ${p.gancho} ${p.especialidade} ${p.como_adaptar}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [posts, grupo, especialidade, midia, busca]);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        Banco de referência pra se inspirar — nunca conteúdo pronto. Cada card explica por que o post original
        funcionou e como adaptar a estrutura pra outra especialidade.
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="">Todos os grupos</option>
          <option value="Cases Doctor">Cases Doctor</option>
          <option value="Referências Nacionais">Referências Nacionais</option>
        </select>
        <select
          value={especialidade}
          onChange={(e) => setEspecialidade(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="">Todas as especialidades</option>
          {especialidades.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={midia}
          onChange={(e) => setMidia(e.target.value)}
          className="rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="">Post e reel</option>
          <option value="post">Post</option>
          <option value="reel">Reel</option>
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, gancho, tema…"
          className="min-w-[200px] flex-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          {filtered.length} referência{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
              Nenhuma referência encontrada com esses filtros.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
