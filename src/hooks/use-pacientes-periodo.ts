import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ajustarNumeros, type PacientesPeriodo } from "@/lib/pacientes";

// Pacientes do período (RPC pacientes_periodo), com a mesma chave de cache em todas as telas: a Jornada usa os mesmos
// números de pessoas novas e de agendados da tela Pacientes, sem uma segunda consulta.
export async function lerPacientesPeriodo(clientId: string, de: string, ate: string): Promise<PacientesPeriodo> {
  const { data, error } = await (supabase as any).rpc("pacientes_periodo", { p_client: clientId, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return ajustarNumeros(data as PacientesPeriodo);
}

export function usePacientesPeriodo(clientId: string, start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: ["pacientes-periodo", clientId, start, end],
    queryFn: () => lerPacientesPeriodo(clientId, start, end),
    staleTime: 5 * 60_000,
    enabled,
  });
}
