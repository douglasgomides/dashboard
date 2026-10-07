import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtFormatKey, median } from "@/lib/report-metrics";

export const Route = createFileRoute("/_authenticated/admin/referencia")({
  component: ReferenciaPage,
});

// Referência entre clientes, só para a equipe: mediana de alcance e salvamentos por formato nos últimos 90 dias.
// Cada cliente entra com a PRÓPRIA mediana por formato, e o quadro usa a mediana dessas medianas, para uma conta
// grande (milhares de posts, alcance de centenas de milhares) não decidir sozinha. Nada disso aparece para clientes.
const DIAS = 90;
const MIN_POSTS_CLIENTE = 3;

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");

function ReferenciaPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-referencia", DIAS],
    queryFn: async () => {
      const desde = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10);
      const pagina = 1000;
      const posts: { client_id: string; format: string | null; reach: number | null; saved: number | null }[] = [];
      for (let i = 0; ; i += pagina) {
        const { data, error } = await supabase
          .from("instagram_posts")
          .select("client_id, format, reach, saved")
          .gte("posted_at", desde)
          .order("posted_at", { ascending: false })
          .range(i, i + pagina - 1);
        if (error) throw error;
        posts.push(...(data ?? []));
        if (!data || data.length < pagina) break;
      }
      const { data: clientes } = await supabase.from("clients").select("id, name");
      return { posts, nomes: new Map((clientes ?? []).map((c) => [c.id, c.name])) };
    },
  });

  const quadro = useMemo(() => {
    if (!data) return null;
    const porFormatoECliente = new Map<string, Map<string, { reach: number[]; saved: number[] }>>();
    for (const p of data.posts) {
      if (!p.format) continue;
      const f = porFormatoECliente.get(p.format) ?? new Map();
      const c = f.get(p.client_id) ?? { reach: [], saved: [] };
      if (p.reach != null) c.reach.push(Number(p.reach));
      if (p.saved != null) c.saved.push(Number(p.saved));
      f.set(p.client_id, c);
      porFormatoECliente.set(p.format, f);
    }
    const linhas = [...porFormatoECliente.entries()].map(([formato, porCliente]) => {
      const validos = [...porCliente.entries()].filter(([, v]) => v.reach.length >= MIN_POSTS_CLIENTE);
      return {
        formato,
        clientes: validos.length,
        posts: validos.reduce((a, [, v]) => a + v.reach.length, 0),
        alcance: median(validos.map(([, v]) => median(v.reach))),
        salvos: median(validos.map(([, v]) => median(v.saved))),
      };
    });
    return linhas.filter((l) => l.clientes >= 2).sort((a, b) => b.alcance - a.alcance);
  }, [data]);

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--text-dim)" }}>
        Referência entre clientes, só para a equipe. Últimos {DIAS} dias, mediana por formato. Cada cliente entra com a
        própria mediana (mínimo de {MIN_POSTS_CLIENTE} posts no formato) e só aparecem formatos com 2 clientes ou mais.
        É um termômetro, não uma meta: especialidade, tamanho de conta e anúncio mudam muito o alcance.
      </p>
      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Calculando…</p>
      ) : error || !quadro ? (
        <p style={{ color: "var(--danger)" }}>Não consegui ler os posts agora.</p>
      ) : quadro.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>Ainda não há formato com posts suficientes em 2 clientes.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-4 py-2">Formato</th>
                <th className="px-4 py-2 text-right">Clientes</th>
                <th className="px-4 py-2 text-right">Posts</th>
                <th className="px-4 py-2 text-right">Alcance (mediana entre clientes)</th>
                <th className="px-4 py-2 text-right">Salvamentos (mediana entre clientes)</th>
              </tr>
            </thead>
            <tbody>
              {quadro.map((l) => (
                <tr key={l.formato} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2 font-medium">{fmtFormatKey(l.formato)}</td>
                  <td className="px-4 py-2 text-right">{l.clientes}</td>
                  <td className="px-4 py-2 text-right">{fmtN(l.posts)}</td>
                  <td className="px-4 py-2 text-right">{fmtN(l.alcance)}</td>
                  <td className="px-4 py-2 text-right">{fmtN(l.salvos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
