import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getPatientQuestions } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/duvidas")({
  component: DuvidasPage,
});

type Question = NonNullable<Awaited<ReturnType<typeof getPatientQuestions>>>[number];

function QuestionCard({ q }: { q: Question }) {
  const post = q.instagram_posts;
  return (
    <div className="flex gap-3 rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      {post?.thumbnail_url && (
        <img src={post.thumbnail_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm">{q.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
          {q.author_username && <span>@{q.author_username}</span>}
          {q.commented_at && (
            <>
              <span>·</span>
              <span>{new Date(q.commented_at).toLocaleDateString("pt-BR")}</span>
            </>
          )}
          {post?.tema && (
            <>
              <span>·</span>
              <span>{post.tema}</span>
            </>
          )}
          {post?.permalink && (
            <>
              <span>·</span>
              <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                ver post ↗
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DuvidasPage() {
  const { clientId } = Route.useParams();
  const { data: questions, isLoading } = useQuery({
    queryKey: ["patient-questions", clientId],
    queryFn: () => getPatientQuestions(clientId),
  });

  const [busca, setBusca] = useState("");
  const [temaFilter, setTemaFilter] = useState("");

  const rows = questions ?? [];

  const temas = useMemo(() => {
    const set = new Set<string>();
    for (const q of rows) if (q.instagram_posts?.tema) set.add(q.instagram_posts.tema);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return rows
      .filter((q) => !term || q.text.toLowerCase().includes(term))
      .filter((q) => !temaFilter || q.instagram_posts?.tema === temaFilter);
  }, [rows, busca, temaFilter]);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        Dúvidas reais que pacientes deixaram nos comentários — matéria-prima pra pauta, não conteúdo pronto. A
        detecção de "é pergunta?" é heurística (pontuação/palavra interrogativa); quem decide o que virar conteúdo
        continua sendo o time.
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nas perguntas…"
          className="min-w-[200px] flex-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
        {temas.length > 0 && (
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
        )}
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          {filtered.length} pergunta{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          {rows.length === 0
            ? "Ainda sem comentários sincronizados. O sync de comentários roda no job diário."
            : "Nenhuma pergunta encontrada com esses filtros."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}
