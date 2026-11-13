import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NxCard, NxKpi, NxListRow } from "@/components/nx/base";
import { NxTabela } from "@/components/nx/blocos";
import { NxCabecaDoBloco } from "@/components/nx/cabeca-do-bloco";
import type { CabecaDoBloco } from "@/lib/leitura/cabeca-do-bloco";

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

export function LinksShortio({ clientId, cabeca }: { clientId: string; cabeca?: (e: { links: number; cliques: number | null }) => CabecaDoBloco }) {
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
  const linhas = data.map((l) => ({
    link: (
      <>
        <a href={l.short_url} target="_blank" rel="noreferrer" style={{ color: "var(--b1)", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {(l.short_url ?? "").replace(/^https?:\/\//, "")}
        </a>
        {l.titulo && <div style={{ fontSize: 13, color: "var(--muted-ink)" }}>{l.titulo}</div>}
      </>
    ),
    destino: DESTINO(l.original_url),
    cliques: l.stats_em ? Number(l.cliques_humanos ?? l.cliques_total ?? 0).toLocaleString("pt-BR") : "—",
    como: COMO[l.atribuicao] ?? "—",
  }));
  return (
    <NxCard rotulo="Links rastreados" titulo={`Links do short.gy (${data.length})`} subtitulo="Cada link foi ligado a este cliente pela bio do Instagram, pelo @ ou pelo nome no link.">
      {cabeca && <NxCabecaDoBloco cabeca={cabeca({ links: data.length, cliques: data.some((l) => l.stats_em) ? total : null })} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <NxKpi icone={<Link2 size={18} />} rotulo="Cliques de pessoas (30 dias)" valor={total.toLocaleString("pt-BR")} nota="Robôs fora" />
      </div>
      <NxTabela
        rotulo="Links do short.gy deste cliente"
        colunas={[
          { chave: "link", titulo: "Link" },
          { chave: "destino", titulo: "Leva para" },
          { chave: "cliques", titulo: "Cliques (30 dias)", numerica: true },
          { chave: "como", titulo: "Como foi ligado" },
        ]}
        linhas={linhas}
        chaveDaLinha={(_, k) => data[k].id}
      />
    </NxCard>
  );
}

/** Admin: links sem cliente, para atribuir à mão. */
export function LinksSemCliente({ clientes }: { clientes: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [todos, setTodos] = useState(false);
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
    <NxCard rotulo="Links do short.gy sem cliente" titulo={`Links do short.gy sem cliente (${data.length})`} subtitulo="Não deu para saber de quem é pela bio, @ ou nome. Escolha o cliente; a escolha não é refeita pelo sync.">
      <ul className="nx-lista" style={{ maxHeight: 384, overflowY: "auto" }}>
        {data.slice(0, todos ? data.length : 5).map((l) => (
          <li key={l.id}>
            <NxListRow
              titulo={`${(l.short_url ?? "").replace(/^https?:\/\//, "")}${l.titulo ? ` · ${l.titulo}` : ""}`}
              sub={<span title={String(l.original_url ?? "")}>{l.original_url}</span>}
              fim={
                <select defaultValue="" aria-label="Escolher cliente" onChange={(e) => atribuir(l.id, e.target.value)} style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--line-2)", padding: "0 10px", fontSize: 14, background: "var(--white)", color: "var(--text)" }}>
                  <option value="">Escolher cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              }
            />
          </li>
        ))}
      </ul>
      {data.length > 5 && (
        <div>
          <button type="button" className="nx-botao" onClick={() => setTodos(!todos)}>
            {todos ? "Mostrar só os 5 primeiros" : `Ver todos (${data.length})`}
          </button>
        </div>
      )}
    </NxCard>
  );
}
