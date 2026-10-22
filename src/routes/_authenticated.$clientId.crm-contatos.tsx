import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Sparkles, ArrowRight, Undo2 } from "lucide-react";
import { BottomSheet } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { configCrm, operacaoCrm } from "@/lib/crm-operacao-data";
import { ETAPAS_CRM, nomeEtapa, prazoVencido, dataParaInput, type CardCrm, type ContatoCrm, type DetalheCrm, type EtapaCrm, type ListaCrm } from "@/lib/crm-kanban";
import "@/styles/crm-kanban.css";

export const Route = createFileRoute("/_authenticated/$clientId/crm-contatos")({ component: KanbanCrm });
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR",{ day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit" });

function KanbanCrm() {
 const { clientId } = Route.useParams();
 const qc = useQueryClient();
 const config = useQuery({ queryKey:["crm-operacao-config",clientId],queryFn:()=>configCrm(clientId),retry:false });
 const [busca,setBusca] = useState("");
 const [offset,setOffset] = useState(0);
 const [novo,setNovo] = useState(false);
 const [aberto,setAberto] = useState<CardCrm|null>(null);
 const [destino,setDestino] = useState<EtapaCrm|null>(null);
 const [arrastando,setArrastando] = useState<CardCrm|null>(null);
 const lista = useQuery({
  queryKey:["crm-operacao-lista",clientId,busca,offset],
  queryFn:()=>operacaoCrm<ListaCrm>(clientId,"listar",{busca,offset}),
  enabled:config.data?.ativo===true,retry:false,
 });
 const dados = lista.data;
 const editar = config.data?.pode_editar===true;
 async function atualizar() { await qc.invalidateQueries({ queryKey:["crm-operacao-lista",clientId] }); }
 if (config.isPending) return <p role="status">Conferindo acesso ao Kanban…</p>;
 if (config.isError) return <div role="alert"><p>Não foi possível conferir o acesso ao Kanban.</p><button className="ws-action" onClick={()=>void config.refetch()}>Tentar novamente</button></div>;
 if (!config.data?.ativo) return <section className="crm-box"><h2>Kanban em preparação</h2><p>A liberação começa pelas clínicas piloto. Seus registros atuais continuam disponíveis no Funil comercial.</p></section>;
 return <div className="space-y-4">
  <p className="text-sm">Organize os contatos e combine o próximo passo. A IA sugere; a equipe confirma.</p>
  <div className="crm-numeros" aria-label="Números do Kanban">
   {[["Oportunidades",dados?.total],["Ações atrasadas",dados?.atrasadas],["Agendados",dados?.por_etapa.agendado??(dados?0:undefined)]].map(([nome,n])=><div className="crm-box" key={nome}><span>{nome}</span><strong>{n??"—"}</strong></div>)}
  </div>
  <div className="crm-toolbar">
   <label className="crm-field grow">Buscar contato ou responsável<input type="search" value={busca} maxLength={100} onChange={e=>{setBusca(e.target.value);setOffset(0);}} /></label>
   <button className="ws-action ws-action--secondary" disabled={lista.isFetching} onClick={()=>void atualizar()}><RefreshCw size={16} aria-hidden/> Atualizar quadro</button>
   {editar&&<button className="ws-action" onClick={()=>setNovo(true)}><Plus size={16} aria-hidden/> Nova oportunidade</button>}
  </div>
  <p className="text-xs">Este quadro registra o acompanhamento da equipe. As etapas importadas do WTS e dos outros CRMs continuam no Funil comercial. O quadro não confirma comparecimento nem pagamento e não envia mensagens.</p>
  {lista.isPending&&<p role="status">Carregando oportunidades…</p>}
  {lista.isError&&<div role="alert"><p>Não foi possível carregar o quadro. Nenhuma contagem foi substituída por zero.</p><button className="ws-action" onClick={()=>void lista.refetch()}>Tentar novamente</button></div>}
  {dados&&<>
   <p className="text-xs" role="status">{dados.filtradas===0?"Nenhuma oportunidade encontrada.":`Mostrando ${offset+1}–${Math.min(offset+50,dados.filtradas)} de ${dados.filtradas} oportunidades`}{busca?" nesta busca.":" no quadro completo, sem filtro de período."}</p>
   <div className="crm-board-scroll" role="region" tabIndex={0} aria-label="Quadro de oportunidades">
    <div className="crm-board">{ETAPAS_CRM.map(etapa=><section key={etapa.id} className="crm-column" aria-label={etapa.nome}
     onDragOver={e=>{if(editar&&arrastando)e.preventDefault();}}
     onDrop={e=>{e.preventDefault();if(arrastando&&arrastando.etapa!==etapa.id){setAberto(arrastando);setDestino(etapa.id);}setArrastando(null);}}>
     <h2>{etapa.nome}<span aria-label="Total nesta etapa">{dados.por_etapa[etapa.id]??0}</span></h2>
     {dados.cards.filter(c=>c.etapa===etapa.id).map(card=><article key={card.id} className="crm-card" draggable={editar} onDragStart={()=>setArrastando(card)} onDragEnd={()=>setArrastando(null)}>
      <button className="crm-card-open" onClick={()=>{setAberto(card);setDestino(null);}} aria-label={`Abrir oportunidade de ${card.titulo}`}>
       <h3>{card.titulo}</h3><p>Origem: {card.origem}</p><p>{card.responsavel||"Sem responsável"}</p><p>{card.proxima_acao||"Definir próxima ação"}</p>
       {card.prazo&&<p className={prazoVencido(card)?"crm-atrasado":""}>{prazoVencido(card)?"Atrasada · ":"Prazo · "}{quando(card.prazo)}</p>}
      </button>
     </article>)}
     {!dados.cards.some(c=>c.etapa===etapa.id)&&<p className="crm-empty">Nenhum cartão nesta página.</p>}
    </section>)}</div>
   </div>
   <nav aria-label="Páginas das oportunidades" className="crm-toolbar">
    <button className="ws-action ws-action--secondary" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Página anterior</button>
    <button className="ws-action ws-action--secondary" disabled={offset+50>=dados.filtradas} onClick={()=>setOffset(offset+50)}>Próxima página</button>
   </nav>
  </>}
  {novo&&<NovoCard clientId={clientId} onClose={()=>setNovo(false)} onSaved={async()=>{setNovo(false);await atualizar();}}/>}
  {aberto&&<CardAberto key={aberto.id} clientId={clientId} inicial={aberto} destino={destino} editar={editar} onClose={()=>setAberto(null)} onSaved={atualizar}/>}
 </div>;
}

function NovoCard({clientId,onClose,onSaved}:{clientId:string;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [id]=useState(()=>crypto.randomUUID());
 const [busca,setBusca]=useState("");
 const [pagina,setPagina]=useState(0);
 const [contato,setContato]=useState<ContatoCrm|null>(null);
 const [titulo,setTitulo]=useState("");
 const [origem,setOrigem]=useState("");
 const [responsavel,setResponsavel]=useState("");
 const [proxima,setProxima]=useState("");
 const [prazo,setPrazo]=useState("");
 const [erro,setErro]=useState("");
 const [salvando,setSalvando]=useState(false);
 const contatos=useQuery({queryKey:["crm-operacao-contatos",clientId,busca,pagina],queryFn:()=>operacaoCrm<ContatoCrm[]>(clientId,"contatos",{busca,offset:pagina*20}),retry:false});
 async function salvar(e:FormEvent) {
  e.preventDefault(); if(salvando)return; setSalvando(true);setErro("");
  try { await operacaoCrm(clientId,"criar",{id,pessoa_id:contato?.id,conversa_id:contato?.conversa_id,titulo,origem,responsavel,proxima_acao:proxima,prazo:prazo?new Date(prazo).toISOString():null});await onSaved(); }
  catch(e){setErro((e as Error).message);} finally{setSalvando(false);}
 }
 return <BottomSheet aberto onFechar={onClose} titulo="Nova oportunidade"><form onSubmit={salvar} className="crm-form">
  <p>Escolha um contato existente ou cadastre uma oportunidade manual. Nenhum contato é importado para o quadro automaticamente.</p>
  <label className="crm-field">Buscar na base de contatos<input type="search" value={busca} onChange={e=>{setBusca(e.target.value);setPagina(0);}} maxLength={100}/></label>
  {contatos.isPending&&<p role="status">Buscando contatos…</p>}
  {contatos.isError&&<div role="alert"><p>Não foi possível consultar os contatos.</p><button type="button" className="ws-action" onClick={()=>void contatos.refetch()}>Tentar novamente</button></div>}
  <ul className="crm-contacts">{contatos.data?.map(c=><li key={c.id}><button type="button" className="crm-contact" aria-pressed={contato?.id===c.id} onClick={()=>{setContato(c);setTitulo(c.nome||"");}}>
   <span>{c.nome||"Contato sem nome"} {c.telefone_final}</span><small>{c.origem}{c.conversa_id?" · conversa vinculada":""}</small>
  </button></li>)}</ul>
  <div className="crm-toolbar"><button type="button" className="ws-action ws-action--secondary" disabled={pagina===0} onClick={()=>setPagina(pagina-1)}>Contatos anteriores</button><button type="button" className="ws-action ws-action--secondary" disabled={(contatos.data?.length??0)<20} onClick={()=>setPagina(pagina+1)}>Mais contatos</button></div>
  {contato&&<p role="status">Selecionado: {contato.nome||"Contato sem nome"}. <button type="button" className="crm-link" onClick={()=>{setContato(null);setTitulo("");}}>Usar cadastro manual</button></p>}
  <label className="crm-field">Nome do contato ou oportunidade<input required value={titulo} maxLength={160} disabled={!!contato?.nome} onChange={e=>setTitulo(e.target.value)}/></label>
  {!contato&&<label className="crm-field">Origem informada<input value={origem} maxLength={160} placeholder="Se não souber, deixe em branco" onChange={e=>setOrigem(e.target.value)}/></label>}
  <CamposAcao responsavel={responsavel} setResponsavel={setResponsavel} proxima={proxima} setProxima={setProxima} prazo={prazo} setPrazo={setPrazo}/>
  {erro&&<p role="alert" className="crm-atrasado">{erro}</p>}
  <button className="ws-action" disabled={salvando||!titulo.trim()}>{salvando?"Salvando…":"Criar oportunidade"}</button>
 </form></BottomSheet>;
}
function CamposAcao(p:{responsavel:string;setResponsavel:(v:string)=>void;proxima:string;setProxima:(v:string)=>void;prazo:string;setPrazo:(v:string)=>void}) {
 return <><label className="crm-field">Responsável (nome)<input value={p.responsavel} maxLength={100} onChange={e=>p.setResponsavel(e.target.value)}/></label>
 <label className="crm-field">Próxima ação<textarea value={p.proxima} maxLength={500} rows={2} onChange={e=>p.setProxima(e.target.value)}/></label>
 <label className="crm-field">Prazo da próxima ação<input type="datetime-local" value={p.prazo} onChange={e=>p.setPrazo(e.target.value)}/></label></>;
}
function CardAberto({clientId,inicial,destino,editar,onClose,onSaved}:{clientId:string;inicial:CardCrm;destino:EtapaCrm|null;editar:boolean;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const qc=useQueryClient();
 const q=useQuery({queryKey:["crm-operacao-detalhe",clientId,inicial.id],queryFn:()=>operacaoCrm<DetalheCrm>(clientId,"detalhe",{id:inicial.id}),retry:false});
 const card=q.data?.card??inicial;
 const [responsavel,setResponsavel]=useState(inicial.responsavel);
 const [proxima,setProxima]=useState(inicial.proxima_acao);
 const [prazo,setPrazo]=useState(dataParaInput(inicial.prazo));
 const [etapa,setEtapa]=useState<EtapaCrm>(destino??inicial.etapa);
 const [motivo,setMotivo]=useState("");
 const [confirmado,setConfirmado]=useState(false);
 const [ocupado,setOcupado]=useState(false);
 const [formVersao,setFormVersao]=useState(inicial.versao);
 const [aviso,setAviso]=useState("");
 const [erro,setErro]=useState("");
 async function acao(nome:string,dados:Record<string,unknown>={}) {
  if(ocupado||!editar)return;setOcupado(true);setErro("");setAviso("");
  try {
   if(nome==="sugerir") {
    const {data}=await supabase.auth.getSession();
    const resp=await fetch("/api/sync/manual",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token??""}`},body:JSON.stringify({alvo:"resumo_conversa",client_id:clientId,conversa_id:card.conversa_id}),signal:AbortSignal.timeout(90_000)});
    const body=await resp.json().catch(()=>null);
    if(!resp.ok)throw new Error(body?.error??"Não foi possível analisar a conversa.");
   }
   const r=await operacaoCrm<{aviso?:string;versao?:number;etapa?:EtapaCrm}>(clientId,nome,{id:card.id,versao:formVersao,...dados});
   if(r.versao) setFormVersao(r.versao);
   if(r.etapa) {setEtapa(r.etapa);setMotivo("");setConfirmado(false);}
   setAviso(r?.aviso??"Alteração salva.");
   await qc.invalidateQueries({queryKey:["crm-operacao-detalhe",clientId,card.id]});
   await onSaved();
  }catch(e){setErro((e as Error).message);await qc.invalidateQueries({queryKey:["crm-operacao-detalhe",clientId,card.id]});}
  finally{setOcupado(false);}
 }
 const sugestoes=q.data?.sugestoes.filter(s=>s.estado==="pendente")??[];
 const ultimo=q.data?.historico.find(e=>["mover","aprovar"].includes(e.acao)&&e.depois.versao===card.versao);
 return <BottomSheet aberto onFechar={onClose} titulo={card.titulo}><div className="crm-form">
  {q.isPending&&<p role="status">Abrindo histórico…</p>}
  {q.isError&&<p role="alert">Não foi possível abrir os detalhes. <button className="crm-link" onClick={()=>void q.refetch()}>Tentar novamente</button></p>}
  <p>Etapa atual: <strong>{nomeEtapa(card.etapa)}</strong> · Origem: {card.origem}</p>
  {card.versao!==formVersao&&<p role="alert">O cartão foi atualizado. <button className="crm-link" onClick={()=>{setResponsavel(card.responsavel);setProxima(card.proxima_acao);setPrazo(dataParaInput(card.prazo));setEtapa(card.etapa);setFormVersao(card.versao);}}>Carregar versão atual</button></p>}
  <fieldset disabled={!editar||ocupado||!q.data||card.versao!==formVersao} className="crm-form">
   <CamposAcao responsavel={responsavel} setResponsavel={setResponsavel} proxima={proxima} setProxima={setProxima} prazo={prazo} setPrazo={setPrazo}/>
   {editar&&<button className="ws-action ws-action--secondary" onClick={()=>void acao("salvar",{responsavel,proxima_acao:proxima,prazo:prazo?new Date(prazo).toISOString():null})}>Salvar acompanhamento</button>}
   {editar&&<section className="crm-box crm-form" aria-label="Movimentar oportunidade">
    <label className="crm-field">Mover para<select value={etapa} onChange={e=>{setEtapa(e.target.value as EtapaCrm);setConfirmado(false);}}>{ETAPAS_CRM.map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}</select></label>
    <label className="crm-field">Motivo da mudança<textarea value={motivo} maxLength={500} onChange={e=>setMotivo(e.target.value)} rows={2}/></label>
    {etapa==="agendado"&&<label className="crm-check"><input type="checkbox" checked={confirmado} onChange={e=>setConfirmado(e.target.checked)}/> O horário foi confirmado com a pessoa.</label>}
    <button className="ws-action" disabled={etapa===card.etapa||motivo.trim().length<8||(etapa==="agendado"&&!confirmado)} onClick={()=>void acao("mover",{etapa,motivo,horario_confirmado:confirmado})}><ArrowRight size={16} aria-hidden/> Mover oportunidade</button>
   </section>}
   {editar&&<button className="ws-action ws-action--secondary" disabled={!card.conversa_id} onClick={()=>void acao("sugerir")}><Sparkles size={16} aria-hidden/> {ocupado?"Processando…":"Analisar conversa com IA"}</button>}
  </fieldset>
  {!card.conversa_id&&<p className="text-xs">A análise por IA estará disponível para oportunidades criadas a partir de um contato com conversa vinculada.</p>}
  {aviso&&<p role="status">{aviso}</p>}
  {erro&&<p role="alert" className="crm-atrasado">{erro}</p>}
  {sugestoes.map(s=><section className="crm-box crm-form" key={s.id} aria-label="Sugestão da IA">
   <h3>Sugestão: {nomeEtapa(s.etapa)}</h3><p>{s.motivo}</p><blockquote>{s.evidencia}</blockquote><p className="text-xs">Trecho conferido na conversa · {quando(s.criado_em)}. Confira o contexto antes de aprovar.</p>
   {editar&&<div className="crm-toolbar"><button className="ws-action" disabled={ocupado||s.versao!==formVersao||card.versao!==formVersao} onClick={()=>void acao("aprovar",{sugestao_id:s.id})}>Aprovar mudança</button><button className="ws-action ws-action--secondary" disabled={ocupado} onClick={()=>void acao("recusar",{sugestao_id:s.id})}>Recusar sugestão</button></div>}
   {s.versao!==card.versao&&<p>O cartão mudou. Gere uma nova leitura para avançar.</p>}
  </section>)}
  {ultimo&&editar&&<button className="ws-action ws-action--secondary" disabled={ocupado} onClick={()=>void acao("desfazer",{evento_id:ultimo.id})}><Undo2 size={16} aria-hidden/> Desfazer última movimentação</button>}
  <section aria-label="Histórico da oportunidade"><h3 className="font-semibold">Histórico da oportunidade</h3><ol className="crm-history">{q.data?.historico.map(e=><li key={e.id}><strong>{e.origem==="ia_aprovada"?"IA com aprovação da equipe":"Equipe"}</strong> · {quando(e.criado_em)}<p>{e.motivo}</p>{e.antes&&e.antes.etapa!==e.depois.etapa&&<p>{nomeEtapa(e.antes.etapa)} → {nomeEtapa(e.depois.etapa)}</p>}<small>Usuário {e.autor.slice(0,8)}</small></li>)}</ol></section>
 </div></BottomSheet>;
}
