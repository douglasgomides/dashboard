import { supabase } from "@/integrations/supabase/client";
import type { ConfigCrm, MembroCrm } from "./crm-kanban";
import type { Relacionamento } from "./relacionamento";
export type EstadoAtendimento="aberta"|"pendente"|"resolvida";
export interface CanalAtendimento {id:string;canal:"instagram"|"whatsapp";nome:string;ativo:boolean;ultimo_evento_em:string|null}
export interface ConfigCentral {pode_atender:boolean;usuario_id:string;equipe:MembroCrm[];crm:ConfigCrm;canais:CanalAtendimento[]}
export interface ConversaCentral {id:string;pessoa_id:string|null;pessoa_nome:string;telefone_final:string|null;canal:string;provider:string;ultima_msg_em:string|null;ultima_msg_texto:string|null;sem_resposta:boolean;estado:EstadoAtendimento;responsavel_id:string|null;responsavel_nome:string|null;versao:number;oficial:boolean}
export interface ListaCentral {contadores:{total:number;abertas:number;sem_resposta:number;sem_responsavel:number;pendentes:number};total_filtradas:number;conversas:ConversaCentral[]}
export interface MensagemCentral {id:string;direcao:"entrada"|"saida"|"sistema";autor:string|null;texto:string|null;tipo:string;enviada_em:string;entrega:string|null}
export interface EnvioCentral {id:string;estado:string;erro:string|null;texto:string;criado_em:string}
export interface DetalheCentral {conversa_id:string;pessoa_id:string|null;card_id:string|null;provider:string;canal:string;oficial:boolean;estado:EstadoAtendimento;versao:number;responsavel_id:string|null;janela_aberta:boolean;mensagens:MensagemCentral[];tem_anteriores:boolean;envios:EnvioCentral[]}
export async function central<T>(client:string,acao:string,dados:Record<string,unknown>={}):Promise<T> {
 const {data,error}=await (supabase as any).rpc("central_atendimento",{p_client_id:client,p_acao:acao,p_dados:dados});
 if(error)throw new Error(error.message);return data as T;
}
export async function canalApi<T>(client:string,body?:Record<string,unknown>):Promise<T> {
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error("Entre novamente para continuar");
 let r:Response;
 try {r=await fetch(body?"/api/atendimento/canais":`/api/atendimento/canais?client_id=${encodeURIComponent(client)}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:body?JSON.stringify({...body,client_id:client}):undefined,signal:AbortSignal.timeout(35_000)});}
 catch{throw new Error("A central não confirmou o resultado. Atualize a conversa e confira no canal antes de repetir.");}
 const json=await r.json().catch(()=>({error:"Não foi possível confirmar a operação. Atualize e confira o resultado."}));
 if(!r.ok)throw new Error(json.error||"Não foi possível concluir a operação");return json as T;
}
export const horarioCentral=(iso:string|null)=>iso?new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"}):"Sem mensagem";
export const NOME_ESTADO:Record<EstadoAtendimento,string>={aberta:"Em aberto",pendente:"Aguardando retorno",resolvida:"Resolvida"};
export async function cancelarPreparado(clientId:string,pedido:string,observacao:string) {
 const {error}=await (supabase as any).rpc("central_cancelar_preparado",{p_client_id:clientId,p_pedido_id:pedido,p_observacao:observacao});
 if(error)throw new Error(error.message);
}
export async function relacionamentos(client:string,pessoas:string[]):Promise<Record<string,Relacionamento>> {
 if(!pessoas.length)return {};
 const {data,error}=await (supabase as any).rpc("relacionamento_pessoas",{p_client:client,p_pessoas:[...new Set(pessoas)].slice(0,100)});
 if(error)throw new Error(error.message);
 return Object.fromEntries(((data??[]) as Relacionamento[]).map(r=>[r.pessoa_id,r]));
}
