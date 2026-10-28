/**
 * Números por funil no período (RPC crm_funis_periodo). Cada clínica marca "ganho" num ponto diferente de cada funil
 * (Dra. Marcelly: em Consultas o ganho é a consulta agendada, em Procedimentos o procedimento agendado), então a tela
 * mostra o ganho de cada funil separado, com a etapa em que ele costuma ficar, em vez de uma soma única.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LinhaFunil {
  grupo: string | null;
  funil: string;
  entraram: number;
  /** Leads que entraram em lote (planilha importada): não contam como leads que chegaram. */
  importados: number;
  consultas_agendadas: number;
  ganhos: number;
  ganhos_sem_valor: number;
  perdidos: number;
  valor_ganho: number;
  etapa_do_ganho: string | null;
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

export function lerFunis(bruto: unknown): LinhaFunil[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      grupo: typeof x.grupo === "string" && x.grupo.trim() ? x.grupo.trim() : null,
      funil: String(x.funil ?? "?"),
      entraram: n(x.entraram), importados: n(x.importados), consultas_agendadas: n(x.consultas_agendadas), ganhos: n(x.ganhos),
      ganhos_sem_valor: n(x.ganhos_sem_valor), perdidos: n(x.perdidos), valor_ganho: n(x.valor_ganho),
      etapa_do_ganho: typeof x.etapa_do_ganho === "string" ? x.etapa_do_ganho : null,
    };
  });
}

export async function getFunisPeriodo(clientId: string, from: string, to: string): Promise<LinhaFunil[]> {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await cliente.rpc("crm_funis_periodo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return lerFunis(data);
}

/** Agrupa pelos grupos do CRM (Clint), na ordem em que aparecem; funil sem grupo fica em "Outros funis". */
export function porGrupo(linhas: LinhaFunil[]): { grupo: string; linhas: LinhaFunil[]; entraram: number; ganhos: number }[] {
  const mapa = new Map<string, LinhaFunil[]>();
  for (const l of linhas) {
    const g = l.grupo ?? "Outros funis";
    mapa.set(g, [...(mapa.get(g) ?? []), l]);
  }
  return [...mapa.entries()].map(([grupo, ls]) => ({
    grupo, linhas: ls, entraram: ls.reduce((s, l) => s + l.entraram, 0), ganhos: ls.reduce((s, l) => s + l.ganhos, 0),
  }));
}

/** A tela só aparece quando há mais de um funil com movimento: com um funil só, os números do topo já bastam. */
export function vale(linhas: LinhaFunil[]): boolean {
  return linhas.filter((l) => l.entraram > 0).length > 1;
}
