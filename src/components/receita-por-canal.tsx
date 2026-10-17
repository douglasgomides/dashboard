import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_ORIGEM_CONV } from "@/components/origem-conversao";

// Receita por canal (Liine D): vendas ganhas no CRM no período e a origem de cada uma, com o grau de certeza
// (registrada no CRM, pela mensagem de entrada, estimada pela IA, desconhecida). Ver receita_por_canal.

type Canal = { canal: string; vendas: number; receita: number; crm: number; texto: number; ia: number };
type Dados = { vendas: number; receita: number; com_conversa: number; por_certeza: Record<string, { vendas: number; receita: number }>; canais: Canal[] };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const CERTEZA: Record<string, string> = { crm: "registrada no CRM", texto: "pela mensagem de entrada", ia: "estimada pela IA", desconhecida: "desconhecida" };

export function ReceitaPorCanal({ clientId, de, ate }: { clientId: string; de: string; ate: string }) {
  const q = useQuery({
    queryKey: ["receita-por-canal", clientId, de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("receita_por_canal", { p_client: clientId, p_de: de, p_ate: ate });
      if (error) return null;
      return (data ?? null) as Dados | null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const d = q.data;
  if (!d || d.vendas === 0) return null;
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  const desconhecida = d.por_certeza.desconhecida?.vendas ?? 0;
  return (
    <div className="rounded-xl border p-3" style={caixa}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Receita por canal</span>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>{d.vendas} vendas ganhas no CRM · {brl(d.receita)} · {d.com_conversa} ligadas a uma conversa</span>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
            <th className="py-1 font-normal">Canal</th><th className="py-1 text-right font-normal">Vendas</th><th className="py-1 text-right font-normal">Receita</th><th className="py-1 text-right font-normal">Como sabemos</th>
          </tr>
        </thead>
        <tbody>
          {d.canais.map((c) => {
            const como = c.canal === "desconhecida" ? "—" : [c.crm && `${c.crm} no CRM`, c.texto && `${c.texto} pela mensagem`, c.ia && `${c.ia} pela IA`].filter(Boolean).join(" · ");
            return (
              <tr key={c.canal} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1">{c.canal === "desconhecida" ? "Origem desconhecida" : ROTULO_ORIGEM_CONV[c.canal] ?? c.canal}</td>
                <td className="py-1 text-right tabular-nums">{c.vendas}</td>
                <td className="py-1 text-right tabular-nums">{brl(c.receita)}</td>
                <td className="py-1 text-right text-xs" style={{ color: "var(--text-dim)" }}>{como}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
        Origem de cada venda, nesta ordem: fonte registrada no CRM, mensagem pronta do link ou anúncio (cadastrada em "De onde vem quem agenda"), origem estimada pela IA na conversa. Mostra de onde a venda veio, não prova que o canal a gerou.
        {desconhecida > 0 && ` ${desconhecida} de ${d.vendas} vendas ainda sem origem (${CERTEZA.desconhecida}): preencher a fonte no CRM ou cadastrar as mensagens de entrada reduz esse número.`}
      </p>
    </div>
  );
}
