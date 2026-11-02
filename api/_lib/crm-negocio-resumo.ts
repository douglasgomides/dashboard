import type { SupabaseClient } from "@supabase/supabase-js";
import { doCliente } from "./leitura-cliente.js";
import { fetchAllRows } from "../../src/lib/pagination.js";
import { ehNegocioProprio } from "../../src/lib/negocio-proprio.js";
import { resumirNegocio, type RegistroNegocio, type EtapaNegocio, type LeituraCrmNegocio } from "../../src/lib/crm-negocio-proprio.js";

interface Conversa { id: string; mensagens_cobertura: string | null; mensagens_conferidas_em: string | null }

/** Só é chamado depois de validar usuário e vínculo com client_id no handler. Retorna apenas agregados. */
export async function lerResumoCrmNegocio(admin: SupabaseClient, clientId: string, de: string, ate: string): Promise<LeituraCrmNegocio> {
  if (!ehNegocioProprio(clientId)) throw new Error("Conta não habilitada para esta leitura.");
  try {
    const connections = await admin.from("crm_connections").select("id").eq("client_id", clientId).eq("provider","clint").eq("active",true);
    if (connections.error || !connections.data?.length) throw new Error("Conexão indisponível");
    const ids = connections.data.map(c=>String(c.id));
    const [registros, etapas, conversas] = await Promise.all([
      fetchAllRows<RegistroNegocio>((from,to)=>doCliente(admin,"crm_leads",clientId)
        .select("id,pipeline_id,status_id,outcome,source,occurred_at,responsavel:raw_payload->user->>id,motivo_perda:raw_payload->>lost_status_id")
        .eq("provider","clint").in("crm_connection_id",ids).is("removido_na_origem",null)
        .order("id").range(from,to).overrideTypes<RegistroNegocio[],{merge:false}>()),
      fetchAllRows<EtapaNegocio>((from,to)=>admin.from("crm_pipeline_statuses")
        .select("pipeline_id,pipeline_name,status_id,status_name").in("crm_connection_id",ids)
        .order("crm_connection_id").order("pipeline_id").order("status_id").range(from,to).overrideTypes<EtapaNegocio[],{merge:false}>()),
      fetchAllRows<Conversa>((from,to)=>doCliente(admin,"conversas",clientId).select("id,mensagens_cobertura,mensagens_conferidas_em")
        .eq("provider","clint").order("id").range(from,to).overrideTypes<Conversa[],{merge:false}>()),
    ]);
    const desde=de+"T00:00:00-03:00";
    const antesDe=new Date(Date.parse(ate+"T00:00:00-03:00")+86_400_000).toISOString();
    return {
      resumo:resumirNegocio(registros,etapas,desde,antesDe),
      conversas:{
        total:conversas.length,
        completas:conversas.filter(c=>c.mensagens_cobertura==="completa").length,
        ultimaConferencia:conversas.map(c=>c.mensagens_conferidas_em).filter((d):d is string=>!!d).sort().at(-1)??null,
      },
    };
  } catch {
    throw new Error("Não foi possível conferir os dados comerciais. Tente novamente; nenhum resultado foi substituído por zero.");
  }
}
