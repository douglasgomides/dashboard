import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leitura de uma tabela de atendimento/CRM dentro da regra por médico (crm_filtro_cliente).
 *
 * Contas divididas entre médicos são gravadas inteiras em cada cliente; o service role ignora RLS, então a leitura
 * direta da tabela por client_id traz os pacientes dos outros médicos. As funções <tabela>_do_cliente(p_client)
 * (migrações 20261102160000/170000/230000) devolvem só o que é do cliente e, sem regra, as mesmas linhas da tabela.
 * Devolve o construtor do PostgREST: encadeie select/filtros/ordem/range como em admin.from(tabela).
 */
export type TabelaDoCliente =
  | "conversas"
  | "conversas_resumos"
  | "conversas_tema"
  | "conversas_origem_anuncio"
  | "mensagens"
  | "crm_leads"
  | "crm_lead_eventos"
  | "toques"
  | "pessoas"
  | "wts_sessoes";

// Mesmo tipo de admin.from(tabela).select(): a função devolve um conjunto de linhas da tabela (setof).
type LeituraDoCliente = ReturnType<ReturnType<SupabaseClient<any, any, any>["from"]>["select"]>;

export function doCliente(admin: SupabaseClient<any, any, any>, tabela: TabelaDoCliente, clientId: string, opcoes?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): LeituraDoCliente {
  return admin.rpc(`${tabela}_do_cliente`, { p_client: clientId }, opcoes) as unknown as LeituraDoCliente;
}

/** O cliente tem regra por médico? (fontes sem leitura por cliente, como crm_raw_events, ficam de fora quando tem) */
export async function temRegraMedico(admin: SupabaseClient<any, any, any>, clientId: string): Promise<boolean> {
  const { count, error } = await admin.from("crm_filtro_cliente").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  if (error) throw new Error("Não foi possível conferir a regra por médico do cliente");
  return (count ?? 0) > 0;
}
