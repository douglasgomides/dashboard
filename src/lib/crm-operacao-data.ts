import { supabase } from "@/integrations/supabase/client";
import type { ConfigCrm } from "./crm-kanban";
export async function operacaoCrm<T>(clientId: string, acao: string, dados: Record<string, unknown> = {}): Promise<T> {
 const { data, error } = await (supabase as any).rpc("crm_operacao", { p_client: clientId, p_acao: acao, p_dados: dados });
 if (error) throw new Error(error.code === "23505" ? "Esta conversa já tem um cartão no Kanban. Procure a oportunidade existente." : error.message);
 return data as T;
}
export const configCrm = (clientId: string) => operacaoCrm<ConfigCrm>(clientId,"config");
