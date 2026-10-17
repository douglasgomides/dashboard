import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Speed-to-lead (Liine C): pacientes sem resposta humana há mais de 30 min, em todas as clínicas (sla_sem_resposta).
// Aviso interno para a equipe agir: nada é enviado a paciente. Os dados são os da última sincronização de cada fonte
// (WTS 1x/dia, Kommo pelo agendamento das 6h), não tempo real; por isso a espera é contada "até agora" e a tela diz isso.

type Linha = { client_id: string; cliente: string; conversa_id: string; pessoa: string; canal: string | null; provider: string | null; desde: string; espera_min: number; em_horario: boolean };

export const duracaoMin = (m: number) => (m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} dias`);

export function SemRespostaAgora() {
  const q = useQuery({
    queryKey: ["sla-sem-resposta"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("sla_sem_resposta", { p_minutos: 30 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Linha[];
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (q.isError || !q.data?.length) return null;
  const porCliente = new Map<string, { nome: string; linhas: Linha[] }>();
  for (const l of q.data) {
    const g = porCliente.get(l.client_id) ?? { nome: l.cliente, linhas: [] };
    g.linhas.push(l);
    porCliente.set(l.client_id, g);
  }
  const grupos = [...porCliente.entries()].sort((a, b) => b[1].linhas.filter((l) => l.em_horario).length - a[1].linhas.filter((l) => l.em_horario).length);
  return (
    <div className="mb-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warn, var(--border))", background: "var(--surface)" }}>
      <strong>Pacientes sem resposta há mais de 30 min (últimas 72 h)</strong>
      <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        Pela última sincronização de cada fonte (não é tempo real). Robô e menu automático não contam como resposta; "ok/obrigada" do paciente não conta como espera. Aviso interno: nada é enviado ao paciente.
      </p>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
            <th className="py-1 font-normal">Clínica</th><th className="py-1 text-right font-normal">Sem resposta</th><th className="py-1 text-right font-normal">Chegaram em horário comercial</th><th className="py-1 text-right font-normal">Maior espera</th><th />
          </tr>
        </thead>
        <tbody>
          {grupos.map(([id, g]) => (
            <tr key={id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1">{g.nome}</td>
              <td className="py-1 text-right tabular-nums">{g.linhas.length}</td>
              <td className="py-1 text-right tabular-nums">{g.linhas.filter((l) => l.em_horario).length}</td>
              <td className="py-1 text-right tabular-nums">{duracaoMin(Math.max(...g.linhas.map((l) => l.espera_min)))}</td>
              <td className="py-1 text-right">
                <Link to="/$clientId/atendimento" params={{ clientId: id }} className="text-xs underline" style={{ color: "var(--accent)" }}>Abrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
