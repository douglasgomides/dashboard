import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Links do short.gy do cliente (bio, stories, anúncios): cliques e para onde levam.
// Atribuição automática pela bio do Instagram, @ ou nome; o que ficou sem dono aparece no Admin.

const DESTINO = (u: string | null) => {
  if (!u) return "—";
  if (/wa\.me|whatsapp/i.test(u)) return "WhatsApp";
  if (/instagram\.com/i.test(u)) return "Instagram";
  if (/forms|typeform|tally/i.test(u)) return "Formulário";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 30);
  }
};
const COMO: Record<string, string> = { bio: "link da bio", handle: "@ no link", nome: "nome no link", manual: "atribuído à mão" };

export function LinksShortio({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["shortio-links", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shortio_links")
        .select("id, short_url, original_url, titulo, cliques_total, cliques_humanos, atribuicao, criado_em, stats_em")
        .eq("client_id", clientId)
        .order("cliques_total", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) return [];
      return data as any[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!data?.length) return null;
  const total = data.reduce((s, l) => s + (Number(l.cliques_humanos ?? l.cliques_total) || 0), 0);
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Links rastreados">
      <div className="flex items-start gap-3">
        <Link2 size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Links do short.gy ({data.length})</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
            {total.toLocaleString("pt-BR")} cliques de pessoas nos últimos 30 dias (robôs fora). Cada link foi ligado a este cliente pela bio do Instagram, pelo @ ou pelo nome no link.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                  <th className="py-1 pr-3 font-medium">Link</th>
                  <th className="py-1 pr-3 font-medium">Leva para</th>
                  <th className="py-1 pr-3 text-right font-medium">Cliques (30 dias)</th>
                  <th className="py-1 font-medium">Como foi ligado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-3">
                      <a href={l.short_url} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                        {(l.short_url ?? "").replace(/^https?:\/\//, "")}
                      </a>
                      {l.titulo && <div className="text-xs" style={{ color: "var(--text-dim)" }}>{l.titulo}</div>}
                    </td>
                    <td className="py-1.5 pr-3">{DESTINO(l.original_url)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{l.stats_em ? Number(l.cliques_humanos ?? l.cliques_total ?? 0).toLocaleString("pt-BR") : "—"}</td>
                    <td className="py-1.5 text-xs" style={{ color: "var(--text-dim)" }}>{COMO[l.atribuicao] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Admin: links sem cliente, para atribuir à mão. */
export function LinksSemCliente({ clientes }: { clientes: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["shortio-sem-cliente"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("shortio_links").select("id, short_url, original_url, titulo").is("client_id", null).order("criado_em", { ascending: false }).limit(200);
      if (error) return [];
      return data as any[];
    },
    retry: false,
  });
  if (!data?.length) return null;
  async function atribuir(id: string, clientId: string) {
    await (supabase as any).from("shortio_links").update({ client_id: clientId || null, atribuicao: clientId ? "manual" : null, atribuicao_detalhe: clientId ? "atribuído no Admin" : null }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["shortio-sem-cliente"] });
  }
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <h2 className="text-[15px] font-semibold">Links do short.gy sem cliente ({data.length})</h2>
      <p className="text-xs" style={{ color: "var(--text-dim)" }}>Não deu para saber de quem é pela bio, @ ou nome. Escolha o cliente; a escolha não é refeita pelo sync.</p>
      <ul className="mt-2 max-h-96 divide-y overflow-y-auto" style={{ borderColor: "var(--border)" }}>
        {data.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{(l.short_url ?? "").replace(/^https?:\/\//, "")}{l.titulo ? ` · ${l.titulo}` : ""}</div>
              <div className="truncate text-xs" style={{ color: "var(--text-dim)" }} title={String(l.original_url ?? "")}>{l.original_url}</div>
            </div>
            <select defaultValue="" onChange={(e) => atribuir(l.id, e.target.value)} className="rounded border px-2 py-1 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <option value="">Escolher cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
