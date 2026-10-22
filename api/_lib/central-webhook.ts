import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./http-types.js";
import { withApiObservability } from "./observability.js";
import { assinaturaValida, normalizarEventos, segredoIgual } from "./central-meta.js";

export async function handler(req:VercelRequest,res:VercelResponse) {
 if(req.method==="GET") {
  const challenge=req.query["hub.challenge"];
  if(req.query["hub.mode"]!=="subscribe"||!segredoIgual(req.query["hub.verify_token"],process.env.NEXO_META_VERIFY_TOKEN??"")||typeof challenge!=="string"||challenge.length>200) {
   res.status(403).send("Verificação recusada");return;
  }
  res.setHeader("Content-Type","text/plain");res.status(200).send(challenge);return;
 }
 if(req.method!=="POST"){res.setHeader("Allow","GET, POST");res.status(405).send("Método indisponível");return;}
 if(!process.env.NEXO_META_APP_SECRET||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY){res.status(503).send("Configuração pendente");return;}
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>1_048_576){res.status(413).send("Evento muito grande");return;}chunks.push(bytes);}
 const raw=Buffer.concat(chunks);
 if(!assinaturaValida(raw,req.headers["x-hub-signature-256"],process.env.NEXO_META_APP_SECRET)){res.status(401).send("Assinatura inválida");return;}
 let events:ReturnType<typeof normalizarEventos>;
 try{events=normalizarEventos(JSON.parse(raw.toString("utf8")));}catch{res.status(400).send("Evento inválido");return;}
 const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const event of events){
  const {error}=await admin.rpc("central_atendimento_worker",{p_acao:event.entrega?"recibo":"receber",p_dados:event});
  // Não confirmar à Meta um lote que não foi persistido. Repetições são deduplicadas pelo ID externo.
  if(error){res.status(503).send("Não foi possível registrar o lote");return;}
 }
 res.status(200).send("EVENT_RECEIVED");
}
export default withApiObservability(handler,"atendimento/meta-webhook");
