import { supabase } from "@/integrations/supabase/client";
import type { LeituraCrmNegocio } from "@/lib/crm-negocio-proprio";
import { ehNegocioProprio } from "@/lib/negocio-proprio";

export async function getCrmNegocioProprio(clientId:string,start:string,end:string):Promise<LeituraCrmNegocio> {
  if(!ehNegocioProprio(clientId)) throw new Error("Esta leitura é exclusiva das contas do próprio negócio.");
  const {data,error}=await supabase.auth.getSession();
  if(error || !data.session?.access_token) throw new Error("Entre novamente para conferir os dados da conta.");
  const response=await fetch("/api/sync/manual",{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(45_000),
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({alvo:"crm_negocio_resumo",client_id:clientId,de:start.slice(0,10),ate:end.slice(0,10)}),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok || !result?.ok || !result.resumo || !result.conversas) throw new Error(result?.error??"Não foi possível conferir os dados comerciais.");
  return {resumo:result.resumo,conversas:result.conversas};
}
