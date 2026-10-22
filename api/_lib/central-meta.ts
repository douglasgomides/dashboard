import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type CanalMeta = "whatsapp" | "instagram";
export interface EventoMeta {
 canal: CanalMeta; conta_externa: string; em: string; mid: string;
 participante?: string; direcao?: "entrada"|"saida"; nome?: string; texto?: string; tipo?: string;
 entrega?: "enviada"|"entregue"|"lida"|"falhou"; pedido_id?: string;
}
const id = (v: unknown): v is string => typeof v === "string" && /^\d{4,40}$/.test(v);
const objeto = (v: unknown): Record<string, any> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {};
const lista = (v: unknown): any[] => Array.isArray(v) ? v : [];
function em(v: unknown, milissegundos = false) {
 const n = Number(v) * (milissegundos ? 1 : 1000);
 if (!Number.isFinite(n) || n < Date.UTC(2010,0,1) || n > Date.now()+300_000) return null;
 return new Date(n).toISOString();
}
export function assinaturaValida(raw: Uint8Array, header: unknown, secret: string) {
 if (!secret || typeof header !== "string" || !/^sha256=[a-f0-9]{64}$/.test(header)) return false;
 return timingSafeEqual(Buffer.from(header.slice(7),"hex"),createHmac("sha256",secret).update(raw).digest());
}
export function segredoIgual(a: unknown,b: string) {
 if (typeof a !== "string" || !b) return false;
 const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y);
}
export function criptografarToken(token: string,chave: string,contexto: string) {
 if (!/^[a-f0-9]{64}$/i.test(chave)) throw new Error("Chave de proteção indisponível");
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(chave,"hex"),iv);
 cipher.setAAD(Buffer.from(contexto));
 const body=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return { v:1,iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64"),body:body.toString("base64") };
}
export function descriptografarToken(valor: unknown,chave: string,contexto: string) {
 const v=objeto(valor);
 if (!/^[a-f0-9]{64}$/i.test(chave) || v.v!==1 || ![v.iv,v.tag,v.body].every(x=>typeof x==="string")) throw new Error("Credencial indisponível");
 const decipher=createDecipheriv("aes-256-gcm",Buffer.from(chave,"hex"),Buffer.from(v.iv,"base64"));
 decipher.setAAD(Buffer.from(contexto));decipher.setAuthTag(Buffer.from(v.tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(v.body,"base64")),decipher.final()]).toString("utf8");
}
/** Normalização limitada a eventos de mensagem; comentários e anúncios não viram atendimento. */
export function normalizarEventos(payload: unknown): EventoMeta[] {
 const root=objeto(payload), out:EventoMeta[]=[];
 for (const entry of lista(root.entry)) {
  if(root.object==="whatsapp_business_account") for(const change of lista(entry.changes)) {
   if(change.field!=="messages") continue;
   const value=objeto(change.value),conta=value.metadata?.phone_number_id;
   if(!id(conta))continue;
   for(const m of lista(value.messages)) {
    const at=em(m.timestamp);if(!at||!id(m.from)||typeof m.id!=="string"||m.id.length>500)continue;
    const name=lista(value.contacts).find(c=>c.wa_id===m.from)?.profile?.name;
    const texto=m.type==="text" && typeof m.text?.body==="string" ? m.text.body : `[${({image:"Imagem",audio:"Áudio",video:"Vídeo",document:"Documento",sticker:"Figurinha",location:"Localização",contacts:"Contato",reaction:"Reação"} as Record<string,string>)[m.type]??"Mensagem não textual"} recebida — confira no WhatsApp]`;
    out.push({canal:"whatsapp",conta_externa:conta,em:at,mid:m.id,participante:m.from,direcao:"entrada",nome:typeof name==="string"?name:undefined,texto:texto.slice(0,12000),tipo:m.type==="text"?"text":"anexo"});
   }
   for(const s of lista(value.statuses)) {
    const at=em(s.timestamp),delivery=({sent:"enviada",delivered:"entregue",read:"lida",failed:"falhou"} as const)[s.status as "sent"];
    if(!at||!delivery||typeof s.id!=="string"||s.id.length>500)continue;
    out.push({canal:"whatsapp",conta_externa:conta,em:at,mid:s.id,entrega:delivery,pedido_id:typeof s.biz_opaque_callback_data==="string"?s.biz_opaque_callback_data:undefined});
   }
  }
  if(root.object==="instagram" && id(entry.id)) for(const m of lista(entry.messaging)) {
   const at=em(m.timestamp,true),msg=objeto(m.message),echo=msg.is_echo===true;
   const participant=echo?m.recipient?.id:m.sender?.id;
   if(!at||!id(participant)||typeof msg.mid!=="string"||msg.mid.length>500)continue;
   if((echo?m.sender?.id:m.recipient?.id)!==entry.id)continue;
   const text=typeof msg.text==="string" ? msg.text : "[Mensagem não textual recebida — confira no Instagram]";
   out.push({canal:"instagram",conta_externa:entry.id,em:at,mid:msg.mid,participante:participant,direcao:echo?"saida":"entrada",texto:text.slice(0,12000),tipo:typeof msg.text==="string"?"text":"anexo"});
  }
 }
 if(out.length>1000)throw new Error("Lote de eventos muito grande");
 return out;
}

export class ErroMeta extends Error {
 constructor(public incerto: boolean,public codigo?: number) {super(incerto?"O canal não confirmou o resultado. Confira no aplicativo antes de repetir.":`O canal recusou a solicitação${codigo?` (código ${codigo})`:""}. Confira permissões, token e conta na Meta.`);}
}
export class MetaOficial {
 constructor(private transport:typeof fetch=fetch,private version=process.env.META_GRAPH_API_VERSION||"v23.0") {
  if(!/^v\d{2}\.0$/.test(version))throw new Error("Versão da API inválida");
 }
 async requisitar(canal:CanalMeta,path:string,token:string,method:"GET"|"POST"="GET",body?:unknown,query?:Record<string,string>) {
  if(!/^(me|\d{4,40})(\/[a-z_]+)?$/.test(path))throw new Error("Caminho Meta inválido");
  const url=new URL(`https://${canal==="instagram"?"graph.instagram.com":"graph.facebook.com"}/${this.version}/${path}`);
  for(const [k,v] of Object.entries(query??{}))url.searchParams.set(k,v);
  let response:Response;
  try {response=await this.transport(url,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),redirect:"error",signal:AbortSignal.timeout(12_000)});}
  catch {throw new ErroMeta(method==="POST");}
  let json:Record<string,any>;
  try {json=objeto(await response.json());}catch{throw new ErroMeta(method==="POST");}
  if(!response.ok||json.error)throw new ErroMeta(method==="POST"&&response.status>=500,typeof json.error?.code==="number"?json.error.code:undefined);
  return json;
 }
 async validar(canal:CanalMeta,conta:string,waba:string|undefined,token:string) {
  if(!id(conta)||canal==="whatsapp"&&!id(waba))throw new Error("Confira os IDs da conta Meta");
  if(canal==="instagram") {
   const me=await this.requisitar(canal,"me",token,"GET",undefined,{fields:"user_id,username"});
   if(String(me.user_id)!==conta)throw new Error("O token não pertence à conta do Instagram informada");
   return typeof me.username==="string"?`@${me.username}`:"Instagram profissional";
  }
  // O ID do telefone deve pertencer à WABA informada, inclusive após a primeira página.
  let after:string|undefined;
  for(let page=0;page<20;page++) {
   const result=await this.requisitar(canal,`${waba}/phone_numbers`,token,"GET",undefined,{fields:"id,verified_name",limit:"100",...(after?{after}:{})});
   const phone=lista(result.data).find(p=>String(p.id)===conta);
   if(phone)return typeof phone.verified_name==="string"?phone.verified_name:"WhatsApp oficial";
   after=result.paging?.cursors?.after;
   if(!result.paging?.next||typeof after!=="string")break;
  }
  throw new Error("O telefone não pertence à conta WhatsApp Business informada");
 }
 async assinar(canal:CanalMeta,conta:string,waba:string|undefined,token:string) {
  const r=await this.requisitar(canal,canal==="instagram"?"me/subscribed_apps":`${waba}/subscribed_apps`,token,"POST",canal==="instagram"?{subscribed_fields:"messages"}:{});
  if(r.success!==true)throw new Error("A Meta não confirmou a assinatura de mensagens");
 }
 async enviar(canal:CanalMeta,conta:string,destinatario:string,texto:string,pedido:string,token:string) {
  if(!id(conta)||!id(destinatario)||!texto.trim()||texto.length>1000)throw new Error("Resposta inválida");
  const body=canal==="whatsapp"?{messaging_product:"whatsapp",recipient_type:"individual",to:destinatario,type:"text",text:{body:texto,preview_url:false},biz_opaque_callback_data:pedido}:{recipient:{id:destinatario},message:{text:texto}};
  const r=await this.requisitar(canal,`${conta}/messages`,token,"POST",body);
  const mid=canal==="whatsapp"?r.messages?.[0]?.id:r.message_id;
  if(typeof mid!=="string"||!mid||mid.length>500)throw new ErroMeta(true);
  return mid;
 }
}
