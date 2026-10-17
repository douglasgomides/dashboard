import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Reasons Not Booked (Liine A): motivo de perda REGISTRADO no CRM (sap_sinais_auto → motivos por categoria) lado a lado
// com o motivo DEDUZIDO pela IA nas conversas (objeções que o paciente declarou). As falhas da clínica só aparecem
// na leitura por IA: o CRM não registra "a clínica demorou".

const CATEGORIAS = ["Preço", "Tempo para decidir", "Medo ou insegurança", "Cônjuge ou família", "Comparando com outro profissional", "Sem indicação clínica", "Outro"] as const;
/** Objeção lida pela IA → categoria do SAP usada nos motivos do CRM. */
const DA_OBJECAO: Record<string, (typeof CATEGORIAS)[number]> = { preco: "Preço", adiamento: "Tempo para decidir", medo: "Medo ou insegurança" };

type Sinais = { perdidos_com_motivo: number; motivos: { categoria: string; total: number; sugeridos: number }[] } | null;

export function MotivosComparados({ clientId, de, ate, objecoes, lidas }: { clientId: string; de: string; ate: string; objecoes: Record<string, number>; lidas: number }) {
  const q = useQuery({
    queryKey: ["motivos-crm", clientId, de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("sap_sinais_auto", { p_client_id: clientId, p_from: de, p_to: ate });
      if (error) return null;
      return (data ?? null) as Sinais;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const crm = new Map((q.data?.motivos ?? []).map((m) => [m.categoria, m.total]));
  const ia = new Map<string, number>();
  for (const [k, n] of Object.entries(objecoes)) {
    const c = DA_OBJECAO[k] ?? "Outro";
    ia.set(c, (ia.get(c) ?? 0) + n);
  }
  const totalCrm = q.data?.perdidos_com_motivo ?? 0;
  if (!totalCrm && !ia.size) return null;
  const linhas = CATEGORIAS.filter((c) => crm.get(c) || ia.get(c));
  const totalIa = [...ia.values()].reduce((a, b) => a + b, 0);
  const pct = (n: number | undefined, t: number) => (n && t ? `${Math.round((100 * n) / t)}%` : "—");
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Por que não fechou: registrado × deduzido</span>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
            <th className="py-1 font-normal">Motivo</th>
            <th className="py-1 text-right font-normal">Registrado no CRM ({totalCrm} perdidos)</th>
            <th className="py-1 text-right font-normal">Dito na conversa (IA, {lidas} lidas)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1">{c}</td>
              <td className="py-1 text-right tabular-nums">{crm.get(c) ? `${crm.get(c)} · ${pct(crm.get(c), totalCrm)}` : "—"}</td>
              <td className="py-1 text-right tabular-nums">{ia.get(c) ? `${ia.get(c)} · ${pct(ia.get(c), totalIa)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        Registrado = motivo de perda marcado pela equipe no CRM (categoria sugerida pelo nome quando não foi definida). Dito na conversa = objeção que o paciente declarou, lida pela IA; convênio, distância, agenda e desconfiança entram em "Outro". Quando as duas colunas discordam muito, ou o CRM está sendo preenchido no automático, ou a conversa mostra um motivo que a equipe não percebe.
        {!totalCrm && " Este CRM não tem motivo de perda registrado no período."}
      </p>
    </div>
  );
}
