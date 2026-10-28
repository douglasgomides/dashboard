import { useQuery } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { Painel } from "@/components/visual";
import { formatRangeLabel } from "@/lib/date-range";
import { getFunisPeriodo, porGrupo, vale } from "@/lib/funis-periodo";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR");

/** Ganho, consulta agendada e perda por funil, só dos leads que entraram no período escolhido. */
export function FunisPeriodo({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const q = useQuery({ queryKey: ["crm-funis-periodo", clientId, start, end], queryFn: () => getFunisPeriodo(clientId, start, end), retry: false });
  if (q.isPending || q.isError || !q.data || !vale(q.data)) return null;
  const grupos = porGrupo(q.data);

  return (
    <Painel
      icone={Workflow}
      titulo="Por funil, no período"
      resumo={`Leads que entraram entre ${formatRangeLabel({ start, end })}`}
      cor="var(--s1)"
      ajuda={
        <>
          Cada funil marca "ganho" num momento diferente: em um funil de consultas, o ganho costuma ser a consulta agendada;
          num de procedimentos, o procedimento agendado. Por isso os ganhos aparecem por funil, com a etapa em que ficam, e
          não somados. Os números contam só os leads que entraram no período escolhido no topo da página. Os grupos são os
          mesmos do CRM (por exemplo, Resgate para a base antiga e Campanhas).
        </>
      }
    >
      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.grupo} className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
              {g.grupo} · {num(g.entraram)} leads · {num(g.ganhos)} ganhos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <caption className="sr-only">Funis do grupo {g.grupo}</caption>
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                    <th className="py-1 pr-2 font-medium">Funil</th>
                    <th className="py-1 pr-2 text-right font-medium">Entraram</th>
                    <th className="py-1 pr-2 text-right font-medium">Consulta agendada</th>
                    <th className="py-1 pr-2 text-right font-medium">Ganhos</th>
                    <th className="py-1 pr-2 font-medium">O ganho fica em</th>
                    <th className="py-1 pr-2 text-right font-medium">Valor ganho</th>
                    <th className="py-1 text-right font-medium">Perdidos</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.funil} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{l.funil}</th>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{num(l.entraram)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{num(l.consultas_agendadas)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{num(l.ganhos)}</td>
                      <td className="py-1.5 pr-2 text-xs" style={{ color: "var(--text-dim)" }}>{l.etapa_do_ganho ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {l.ganhos ? brl(l.valor_ganho) : "—"}
                        {l.ganhos_sem_valor > 0 && <span className="block text-[11px]" style={{ color: "var(--muted)" }}>{num(l.ganhos_sem_valor)} sem valor</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{num(l.perdidos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Painel>
  );
}
