import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/pagination";
import { getCrmPipelineKanban } from "@/lib/client-data";
import { ehNegocioProprio } from "@/lib/negocio-proprio";
import type { RegistroNegocio } from "@/lib/crm-negocio-proprio";

interface CoberturaConversa { id: string; canal: string | null; mensagens_cobertura: string | null; mensagens_conferidas_em: string | null }

export async function getCrmNegocioProprio(clientId: string) {
  if (!ehNegocioProprio(clientId)) throw new Error("Esta leitura é exclusiva das contas do próprio negócio.");
  // Projeção mínima: nenhum nome, telefone, mensagem ou credencial é necessário para os totais.
  const [registros, etapas, conversas] = await Promise.all([
    fetchAllRows<RegistroNegocio>((from,to) => supabase.from("crm_leads")
      .select("id,pipeline_id,status_id,outcome,source,occurred_at,responsavel:raw_payload->user->>id,motivo_perda:raw_payload->>lost_status_id")
      .eq("client_id",clientId).eq("provider","clint").is("removido_na_origem",null).order("id").range(from,to)),
    getCrmPipelineKanban(clientId),
    fetchAllRows((from,to) => supabase.from("conversas")
      .select("id,canal,mensagens_cobertura,mensagens_conferidas_em")
      .eq("client_id",clientId).eq("provider","clint").order("id").range(from,to).overrideTypes<CoberturaConversa[], { merge: false }>()),
  ]);
  return { registros, etapas, conversas };
}
