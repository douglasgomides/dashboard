import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CAMPOS_DIARIOS = ["mandaram_mensagem", "leads_novos", "antigos", "agendaram", "negociacao", "compareceram", "fecharam"] as const;
export type CampoDiario = (typeof CAMPOS_DIARIOS)[number];
export type LinhaDiaria = { dia: string } & Record<CampoDiario, number | null>;

/** Histórico diário (tabela resultados_diarios). Se a tabela não existir ou estiver vazia, devolve lista vazia e a tela segue sem gráfico. */
export function useResultadosDiarios(clientId: string, start: string, end: string) {
  return useQuery({
    queryKey: ["resultados-diarios", clientId, start, end],
    queryFn: async (): Promise<LinhaDiaria[]> => {
      const { data, error } = await (supabase as any)
        .from("resultados_diarios")
        .select(["dia", ...CAMPOS_DIARIOS].join(","))
        .eq("client_id", clientId)
        .gte("dia", start)
        .lte("dia", end)
        .order("dia", { ascending: true });
      if (error) return [];
      return (data ?? []) as LinhaDiaria[];
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}
