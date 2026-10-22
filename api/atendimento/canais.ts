import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { withApiObservability } from "../_lib/observability.js";
import { criptografarToken, descriptografarToken, ErroMeta, MetaOficial } from "../_lib/central-meta.js";

const uuid=z.string().uuid(),id=z.string().regex(/^\d{4,40}$/);
const schema=z.discriminatedUnion("acao",[
 z.object({acao:z.literal("conectar"),client_id:uuid,canal:z.enum(["instagram","whatsapp"]),conta_externa:id,waba_id:id.optional(),token:z.string().min(20).max(4096)}).strict(),
 z.object({acao:z.literal("desconectar"),client_id:uuid,canal_id:uuid}).strict(),
 z.object({acao:z.literal("enviar"),client_id:uuid,conversa_id:uuid,pedido_id:uuid,texto:z.string().trim().min(1).max(1000)}).strict(),
]);
export const centralConfigurada = (env:NodeJS.ProcessEnv=process.env) => !!(env.NEXO_META_APP_ID && env.NEXO_META_APP_SECRET && env.NEXO_META_VERIFY_TOKEN && /^[a-f0-9]{64}$/i.test(env.NEXO_CHANNELS_ENCRYPTION_KEY??""));
async function worker(admin:SupabaseClient,acao:string,dados:Record<string,unknown>) {
 const {data,error}=await admin.rpc("central_atendimento_worker",{p_acao:acao,p_dados:dados});
 if(error)throw new Error("Não foi possível registrar a operação da central. Atualize e confira o resultado antes de repetir.");
 return data as Record<string,any>;
}
export function criarHandlerCanais(meta=new MetaOficial()) {
 return async function handler(req:VercelRequest,res:VercelResponse) {
  if(!["GET","POST"].includes(req.method??"")){res.setHeader("Allow","GET, POST");res.status(405).json({error:"Método indisponível"});return;}
  const parsed=req.method==="POST"?schema.safeParse(req.body):z.object({client_id:uuid}).safeParse({client_id:req.query.client_id});
  if(!parsed.success){res.status(400).json({error:"Confira os dados da solicitação"});return;}
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key){res.status(503).json({error:"Central temporariamente indisponível"});return;}
  const bearer=req.headers.authorization;
  if(typeof bearer!=="string"||!bearer.startsWith("Bearer ")){res.status(401).json({error:"Entre novamente para continuar"});return;}
  const opts={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,key,opts);
  const {data:auth,error:authError}=await admin.auth.getUser(bearer.slice(7));
  if(authError||!auth.user){res.status(401).json({error:"Entre novamente para continuar"});return;}
  const user=createClient(url,process.env.VITE_SUPABASE_PUBLISHABLE_KEY||key,{...opts,global:{headers:{Authorization:bearer}}});
  const client=parsed.data.client_id;
  const {data:config,error:accessError}=await user.rpc("central_atendimento",{p_client_id:client,p_acao:"config",p_dados:{}});
  if(accessError||config?.pode_atender!==true){res.status(403).json({error:"Seu acesso não permite operar esta central"});return;}
  if(req.method==="GET"){res.status(200).json({configurada:centralConfigurada(),webhook:"https://dash.doctorcreator.com.br/api/atendimento/meta-webhook"});return;}
  const body=schema.parse(req.body),base={client_id:client,autor:auth.user.id};
  if(body.acao==="desconectar") {
   await worker(admin,"desconectar",{...base,canal_id:body.canal_id});
   res.status(200).json({ok:true});return;
  }
  if(!centralConfigurada()){res.status(503).json({error:"A configuração do aplicativo Meta está pendente. O histórico e a fila continuam disponíveis."});return;}
  const encryption=process.env.NEXO_CHANNELS_ENCRYPTION_KEY!;
  if(body.acao==="conectar") {
   try {
    const nome=await meta.validar(body.canal,body.conta_externa,body.waba_id,body.token);
    const context=`${client}:${body.canal}:${body.conta_externa}`;
    const stored=await worker(admin,"salvar_canal",{...base,canal:body.canal,conta_externa:body.conta_externa,nome,credencial:criptografarToken(body.token,encryption,context)});
    await meta.assinar(body.canal,body.conta_externa,body.waba_id,body.token);
    await worker(admin,"ativar_canal",{...base,canal_id:stored.id});
    res.status(200).json({ok:true,mensagem:"Canal configurado. Aguardando a primeira mensagem recebida."});
   } catch(e) {res.status(422).json({error:e instanceof ErroMeta?e.message:"A conexão não foi concluída. Confira os IDs, o token, as permissões e o webhook do aplicativo Meta."});}
   return;
  }
  // A preparação é autenticada como usuário. Apenas o servidor reivindica e envia uma vez.
  const {error:prepareError}=await user.rpc("central_atendimento",{p_client_id:client,p_acao:"preparar_envio",p_dados:{conversa_id:body.conversa_id,pedido_id:body.pedido_id,texto:body.texto}});
  if(prepareError){res.status(409).json({error:prepareError.message});return;}
  const claim=await worker(admin,"reivindicar_envio",{...base,pedido_id:body.pedido_id});
  if(claim.estado!=="enviando"||!claim.credencial){res.status(200).json({ok:claim.estado==="aceita",estado:claim.estado});return;}
  let outcome:Record<string,unknown>;
  try {
   const token=descriptografarToken(claim.credencial,encryption,`${client}:${claim.canal}:${claim.conta_externa}`);
   const mid=await meta.enviar(claim.canal,claim.conta_externa,claim.destinatario,claim.texto,body.pedido_id,token);
   outcome={estado:"aceita",mid};
  }catch(e){outcome={estado:e instanceof ErroMeta&&e.incerto?"incerta":"falhou",erro:e instanceof ErroMeta?e.message:"Credencial indisponível. Reconecte o canal antes de responder."};}
  const result=await worker(admin,"concluir_envio",{pedido_id:body.pedido_id,...outcome});
  res.status(200).json({ok:result.estado==="aceita",estado:result.estado});
 };
}
export default withApiObservability(criarHandlerCanais(),"atendimento/canais");
