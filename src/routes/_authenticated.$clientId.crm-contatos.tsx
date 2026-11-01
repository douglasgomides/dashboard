import { useDeferredValue, useId, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Sparkles, ArrowRight, Undo2 } from "lucide-react";
import { BottomSheet } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { configCrm, operacaoCrm } from "@/lib/crm-operacao-data";
import { ETAPAS_CRM, nomeEtapa, prazoVencido, dataParaInput, inputParaData, type CardCrm, type ContatoCrm, type DetalheCrm, type EtapaCrm, type ListaCrm, type MembroCrm, type EntradaCrm, type RotinaCrm } from "@/lib/crm-kanban";
import "@/styles/crm-kanban.css";
import { mensagemDeErro } from "@/lib/erro-amigavel";

export const Route = createFileRoute("/_authenticated/$clientId/crm-contatos")({ component: KanbanCrm, validateSearch: (search:Record<string,unknown>):{card?:string} => ({card:typeof search.card==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.card)?search.card:undefined}) });
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR",{ day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo" });
const NOMES_ROTINA:Record<RotinaCrm,string>={todas:"Todas as oportunidades",hoje:"Para hoje e atrasadas",atrasadas:"Ações atrasadas",sem_acao:"Sem próximo passo"};

function KanbanCrm() {
 const { clientId } = Route.useParams();
 const {card:cardLink}=Route.useSearch();
 const navigate=Route.useNavigate();
 const qc = useQueryClient();
 const config = useQuery({ queryKey:["crm-operacao-config",clientId],queryFn:()=>configCrm(clientId),retry:false });
 const [busca,setBusca] = useState("");
 const buscaConsulta=useDeferredValue(busca);
 const [rotina,setRotina] = useState<RotinaCrm>("hoje");
 const [responsavel,setResponsavel] = useState("todos");
 const [etapaFiltro,setEtapaFiltro] = useState("todas");
 const [paginas,setPaginas] = useState<Partial<Record<EtapaCrm,number>>>({});
 const [novo,setNovo] = useState(false);
 const [selecionado,setSelecionado] = useState<ContatoCrm|null>(null);
 const [entradaAberta,setEntradaAberta] = useState(false);
 const [aberto,setAberto] = useState<CardCrm|null>(null);
 const [destino,setDestino] = useState<EtapaCrm|null>(null);
 const [arrastando,setArrastando] = useState<CardCrm|null>(null);
 const linkDetalhe=useQuery({queryKey:["crm-operacao-detalhe",clientId,cardLink],queryFn:()=>operacaoCrm<DetalheCrm>(clientId,"detalhe",{id:cardLink}),enabled:config.data?.ativo===true&&!!cardLink,retry:false});
 const cardAberto=aberto??linkDetalhe.data?.card;
 function fecharCard(){setAberto(null);if(cardLink)void navigate({search:(prev:Record<string,unknown>)=>({...prev,card:undefined}),replace:true});}
 const lista = useQuery({
  queryKey:["crm-operacao-lista",clientId,buscaConsulta,rotina,responsavel,etapaFiltro,paginas],
  queryFn:()=>operacaoCrm<ListaCrm>(clientId,"listar",{busca:buscaConsulta,rotina,filtro_responsavel:responsavel,filtro_etapa:etapaFiltro,paginas}),
  enabled:config.data?.ativo===true,retry:false,refetchInterval:30_000,
 });
 const dados = lista.data;
 const editar = config.data?.pode_editar===true;
 const equipe = config.data?.equipe??[];
 function filtrar(mudar:()=>void){mudar();setPaginas({});}
 async function atualizar() {
  await Promise.all([
   qc.invalidateQueries({queryKey:["crm-operacao-lista",clientId]}),
   qc.invalidateQueries({queryKey:["crm-operacao-entrada",clientId]}),
   qc.invalidateQueries({queryKey:["crm-operacao-contatos",clientId]}),
  ]);
 }
 if (config.isPending) return <p role="status">Conferindo acesso ao Kanban…</p>;
 if (config.isError) return <div role="alert"><p>Não foi possível conferir o acesso ao Kanban.</p><button className="ws-action" onClick={()=>void config.refetch()}>Tentar novamente</button></div>;
 if (!config.data?.ativo) return <section className="crm-box"><h2>Kanban em preparação</h2><p>A liberação começa pelas clínicas piloto. Seus resultados atuais continuam disponíveis no Funil comercial.</p></section>;
 return <div className="space-y-4">
  <p className="text-sm">Comece pelas ações de hoje. Organize os contatos aqui e confirme as sugestões da IA antes de avançar.</p>
  <div className="crm-numeros" aria-label="Prioridades do dia">
   {(["hoje","atrasadas","sem_acao"] as const).map(f=><button className="crm-box crm-numero" key={f} aria-pressed={rotina===f} onClick={()=>filtrar(()=>setRotina(f))}>
    <span>{NOMES_ROTINA[f]}</span><strong>{dados?.[f]??"—"}</strong>
   </button>)}
  </div>
  <p className="text-xs">Prioridades da clínica inteira · dia de Brasília. {dados?`${dados.total} oportunidades no total · ${dados.agendados??dados.por_etapa.agendado??0} com horário confirmado pela equipe.`:"Carregando os totais…"} Os filtros abaixo alteram apenas o quadro.</p>
  <section className="crm-box crm-inbox-call" aria-label="Contatos sem oportunidade">
   <div><h2>Contatos sem oportunidade</h2><p className="text-sm">{dados?.entrada_total==null?"Consultando a fila…":`${dados.entrada_total} contatos com conversa importada ainda não têm acompanhamento neste quadro.`}</p><p className="text-xs">Confira a fila para escolher quem acompanhar. Nenhum contato é convertido automaticamente.</p></div>
   <button className="ws-action ws-action--secondary" aria-expanded={entradaAberta} onClick={()=>setEntradaAberta(!entradaAberta)}>{entradaAberta?"Recolher fila":"Ver contatos para acompanhar"}</button>
  </section>
  {entradaAberta&&<FilaEntrada clientId={clientId} editar={editar} onEscolher={c=>{setSelecionado(c);setNovo(true);}}/>}
  <div className="crm-toolbar">
   <label className="crm-field grow">Buscar contato ou responsável<input type="search" value={busca} maxLength={100} onChange={e=>filtrar(()=>setBusca(e.target.value))}/></label>
   <label className="crm-field">Mostrar<select value={rotina} onChange={e=>filtrar(()=>setRotina(e.target.value as RotinaCrm))}>{Object.entries(NOMES_ROTINA).map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
   <label className="crm-field">Filtrar responsável<select value={responsavel} onChange={e=>filtrar(()=>setResponsavel(e.target.value))}>
    <option value="todos">Toda a equipe</option><option value="meus">Minhas oportunidades</option><option value="sem">Sem responsável da equipe</option>{equipe.map(m=><option value={m.id} key={m.id}>{m.nome}</option>)}
   </select></label>
   <label className="crm-field">Filtrar etapa<select value={etapaFiltro} onChange={e=>filtrar(()=>setEtapaFiltro(e.target.value))}><option value="todas">Todas as etapas</option>{ETAPAS_CRM.map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}</select></label>
   <button className="ws-action ws-action--secondary" disabled={lista.isFetching} onClick={()=>void atualizar()}><RefreshCw size={16} aria-hidden/> Atualizar quadro</button>
   {editar&&<button className="ws-action" onClick={()=>{setSelecionado(null);setNovo(true);}}><Plus size={16} aria-hidden/> Nova oportunidade</button>}
  </div>
  <p className="text-xs">Use este quadro para trabalhar os contatos. Consulte os indicadores importados em <Link to="/$clientId/crm-painel" params={{clientId}} className="crm-link">Funil comercial · resultados</Link>. As mudanças aqui ficam no acompanhamento da clínica e não atualizam o WTS, outros CRMs ou a agenda.</p>
  {lista.isPending&&<p role="status">Carregando oportunidades…</p>}
  {lista.isError&&<div role="alert"><p>Não foi possível carregar o quadro. Nenhuma contagem foi substituída por zero.</p><button className="ws-action" onClick={()=>void lista.refetch()}>Tentar novamente</button></div>}
  {dados&&<>
   <div className="crm-toolbar"><p className="text-xs" role="status">{dados.filtradas===0?"Nenhuma oportunidade encontrada.":`${dados.filtradas} oportunidades com estes filtros.`}</p>
    {(rotina!=="todas"||responsavel!=="todos"||etapaFiltro!=="todas"||busca)&&<button className="crm-link" onClick={()=>filtrar(()=>{setRotina("todas");setResponsavel("todos");setEtapaFiltro("todas");setBusca("");})}>Ver todas as oportunidades</button>}
   </div>
   {dados.filtradas===0&&rotina==="hoje"&&<p className="crm-box">Nenhuma ação com prazo até hoje corresponde aos filtros. Confira também os contatos sem oportunidade e os cartões sem próximo passo.</p>}
   <div className="crm-board-scroll" role="region" tabIndex={0} aria-label="Quadro de oportunidades">
    <div className={etapaFiltro==="todas"?"crm-board":"crm-board crm-board-single"}>{ETAPAS_CRM.filter(e=>etapaFiltro==="todas"||e.id===etapaFiltro).map(etapa=>{
     const total=dados.por_etapa[etapa.id]??0,offset=paginas[etapa.id]??0,limite=dados.limite_coluna??12;
     const cards=dados.cards.filter(c=>c.etapa===etapa.id);
     return <section key={etapa.id} className="crm-column" aria-label={etapa.nome}
      onDragOver={e=>{if(editar&&arrastando)e.preventDefault();}}
      onDrop={e=>{e.preventDefault();if(arrastando&&arrastando.etapa!==etapa.id){setAberto(arrastando);setDestino(etapa.id);}setArrastando(null);}}>
      <h2>{etapa.nome}<span aria-label="Total nesta etapa">{total}</span></h2>
      {cards.map(card=><article key={card.id} className="crm-card" draggable={editar} onDragStart={()=>setArrastando(card)} onDragEnd={()=>setArrastando(null)}>
       <button className="crm-card-open" onClick={()=>{setAberto(card);setDestino(null);}} aria-label={`Abrir oportunidade de ${card.titulo}`}>
        <h3>{card.titulo}</h3><p>Origem: {card.origem}</p><p>{card.responsavel||"Sem responsável"}</p><p>{card.proxima_acao||"Definir próxima ação"}</p>
        {card.prazo&&<p className={prazoVencido(card)?"crm-atrasado":""}>{prazoVencido(card)?"Atrasada · ":"Prazo · "}{quando(card.prazo)}</p>}
       </button>
      </article>)}
      {!cards.length&&<p className="crm-empty">{total===0?"Nenhuma oportunidade com estes filtros.":"Esta página ficou vazia. Volte para as oportunidades anteriores."}</p>}
      {total>0&&<p className="text-xs">{cards.length?`${offset+1}–${Math.min(offset+cards.length,total)} de ${total}`:`0 de ${total}`}</p>}
      {(offset>0||total>limite)&&<nav aria-label={`Páginas de ${etapa.nome}`} className="crm-column-pages">
       <button className="crm-link" disabled={offset===0} onClick={()=>setPaginas(p=>({...p,[etapa.id]:Math.max(0,offset-limite)}))} aria-label={`Anteriores em ${etapa.nome}`}>Anteriores</button>
       <button className="crm-link" disabled={offset+limite>=total} onClick={()=>setPaginas(p=>({...p,[etapa.id]:offset+limite}))} aria-label={`Mais em ${etapa.nome}`}>Mais oportunidades</button>
      </nav>}
     </section>;
    })}</div>
   </div>
  </>}
  {novo&&<NovoCard clientId={clientId} equipe={equipe} selecionado={selecionado} onClose={()=>setNovo(false)} onSaved={async()=>{setNovo(false);filtrar(()=>setRotina("todas"));await atualizar();}}/>}
  {cardLink&&linkDetalhe.isPending&&<p role="status">Abrindo oportunidade vinculada…</p>}
  {cardLink&&linkDetalhe.isError&&<div role="alert"><p>A oportunidade vinculada não está disponível nesta clínica.</p><button className="crm-link" onClick={fecharCard}>Fechar aviso</button></div>}
  {cardAberto&&<CardAberto key={cardAberto.id} clientId={clientId} equipe={equipe} inicial={cardAberto} destino={destino} editar={editar} onClose={fecharCard} onSaved={async()=>{setPaginas({});await atualizar();}}/>}
 </div>;
}

function FilaEntrada({clientId,editar,onEscolher}:{clientId:string;editar:boolean;onEscolher:(c:ContatoCrm)=>void}) {
 const [busca,setBusca]=useState("");
 const consulta=useDeferredValue(busca);
 const [pagina,setPagina]=useState(0);
 const q=useQuery({queryKey:["crm-operacao-entrada",clientId,consulta,pagina],queryFn:()=>operacaoCrm<EntradaCrm>(clientId,"entrada",{busca:consulta,offset:pagina*20}),retry:false,refetchInterval:30_000});
 return <section className="crm-box crm-form" aria-label="Fila de contatos para acompanhar">
  <label className="crm-field">Buscar contato na fila<input type="search" maxLength={100} value={busca} onChange={e=>{setBusca(e.target.value);setPagina(0);}}/></label>
  <p className="text-xs">Mais recentes primeiro, pela última mensagem importada. Uma oportunidade existente já retira o contato desta fila, inclusive quando encerrada. Conversas ainda sem contato identificado precisam de conferência da importação.</p>
  {q.isPending&&<p role="status">Buscando contatos sem oportunidade…</p>}
  {q.isError&&<div role="alert"><p>Não foi possível consultar a fila.</p><button className="crm-link" onClick={()=>void q.refetch()}>Tentar novamente</button></div>}
  {q.data&&<>
   <p role="status" className="text-sm">{q.data.total===0?"Nenhum contato sem oportunidade corresponde à busca.":`${q.data.total} contatos aguardam acompanhamento nesta busca.`}</p>
   <ul className="crm-entry-list">{q.data.contatos.map(c=><li key={c.id}><div><strong>{c.nome||"Contato sem nome"} {c.telefone_final}</strong><p className="text-xs">{c.origem}{c.ultima_msg_em?` · Última mensagem ${quando(c.ultima_msg_em)}`:""}</p></div>
    {editar&&<button className="ws-action ws-action--secondary" aria-label={`Acompanhar ${c.nome||"contato sem nome"}`} onClick={()=>onEscolher(c)}>Acompanhar contato</button>}
   </li>)}</ul>
   <nav className="crm-toolbar" aria-label="Páginas dos contatos sem oportunidade"><button className="crm-link" disabled={pagina===0} onClick={()=>setPagina(pagina-1)}>Contatos anteriores na fila</button><button className="crm-link" disabled={(pagina+1)*20>=q.data.total} onClick={()=>setPagina(pagina+1)}>Mais contatos na fila</button></nav>
  </>}
 </section>;
}

function NovoCard({clientId,equipe,selecionado,onClose,onSaved}:{clientId:string;equipe:MembroCrm[];selecionado:ContatoCrm|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [id]=useState(()=>crypto.randomUUID());
 const [busca,setBusca]=useState("");
 const [pagina,setPagina]=useState(0);
 const [contato,setContato]=useState<ContatoCrm|null>(selecionado);
 const [titulo,setTitulo]=useState(selecionado?.nome??"");
 const [origem,setOrigem]=useState("");
 const [responsavel,setResponsavel]=useState("");
 const [proxima,setProxima]=useState("");
 const [prazo,setPrazo]=useState("");
 const [erro,setErro]=useState("");
 const [salvando,setSalvando]=useState(false);
 const contatos=useQuery({queryKey:["crm-operacao-contatos",clientId,busca,pagina],queryFn:()=>operacaoCrm<ContatoCrm[]>(clientId,"contatos",{busca,offset:pagina*20}),retry:false});
 async function salvar(e:FormEvent) {
  e.preventDefault(); if(salvando)return; setSalvando(true);setErro("");
  try { await operacaoCrm(clientId,"criar",{id,pessoa_id:contato?.id,conversa_id:contato?.conversa_id,titulo,origem,responsavel_id:responsavel||null,proxima_acao:proxima,prazo:prazo?inputParaData(prazo):null});await onSaved(); }
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
  <CamposAcao equipe={equipe} responsavel={responsavel} setResponsavel={setResponsavel} proxima={proxima} setProxima={setProxima} prazo={prazo} setPrazo={setPrazo}/>
  {erro&&<p role="alert" className="crm-atrasado">{erro}</p>}
  <button className="ws-action" disabled={salvando||!titulo.trim()}>{salvando?"Salvando…":"Criar oportunidade"}</button>
 </form></BottomSheet>;
}
function CamposAcao(p:{equipe:MembroCrm[];responsavel:string;setResponsavel:(v:string)=>void;proxima:string;setProxima:(v:string)=>void;prazo:string;setPrazo:(v:string)=>void}) {
 return <><label className="crm-field"><span>Responsável</span><select aria-label="Responsável" value={p.responsavel} onChange={e=>p.setResponsavel(e.target.value)}>
 <option value="">Sem responsável</option>
 {p.responsavel&&!p.equipe.some(m=>m.id===p.responsavel)&&<option value={p.responsavel} disabled>Responsável anterior (sem acesso atual)</option>}
 {p.equipe.map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}
 </select></label>
 <label className="crm-field">Próxima ação<textarea value={p.proxima} maxLength={500} rows={2} onChange={e=>p.setProxima(e.target.value)}/></label>
 <label className="crm-field">Prazo da próxima ação<input type="datetime-local" value={p.prazo} onChange={e=>p.setPrazo(e.target.value)}/><small>Horário de Brasília.</small></label></>;
}
function CardAberto({clientId,equipe,inicial,destino,editar,onClose,onSaved}:{clientId:string;equipe:MembroCrm[];inicial:CardCrm;destino:EtapaCrm|null;editar:boolean;onClose:()=>void;onSaved:()=>Promise<void>}) {
 const qc=useQueryClient();
 const q=useQuery({queryKey:["crm-operacao-detalhe",clientId,inicial.id],queryFn:()=>operacaoCrm<DetalheCrm>(clientId,"detalhe",{id:inicial.id}),retry:false});
 const card=q.data?.card??inicial;
 const etapaLabel=useId();
 const [responsavel,setResponsavel]=useState(inicial.responsavel_id??"");
 const [proxima,setProxima]=useState(inicial.proxima_acao);
 const [prazo,setPrazo]=useState(dataParaInput(inicial.prazo));
 const [etapa,setEtapa]=useState<EtapaCrm>(destino??inicial.etapa);
 const [motivo,setMotivo]=useState("");
 const [confirmado,setConfirmado]=useState(false);
 const [ocupado,setOcupado]=useState(false);
 const [formVersao,setFormVersao]=useState(inicial.versao);
 const [verConversa,setVerConversa]=useState(false);
 const mensagens=useQuery({
  queryKey:["crm-operacao-mensagens",clientId,card.conversa_id],
  enabled:verConversa&&!!card.conversa_id,retry:false,
  queryFn:async()=>{
   const {data,error}=await (supabase as any).rpc("ler_mensagens",{p_conversa:card.conversa_id}).order("enviada_em",{ascending:false}).order("id",{ascending:false}).limit(100);
   if(error)throw new Error("Não foi possível abrir a conversa.");
   return (data??[]) as {id:string;direcao:string;texto:string|null;tipo:string|null;enviada_em:string}[];
  },
 });
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
  {card.responsavel&&!card.responsavel_id&&<p className="text-xs">Responsável registrado anteriormente: {card.responsavel}. Selecione uma pessoa da equipe ao salvar o acompanhamento.</p>}
  {card.etapa==="agendado"&&<p className="text-xs">Horário informado pela equipe. Confira a agenda da clínica para data, horário e comparecimento.</p>}
  {card.versao!==formVersao&&<p role="alert">O cartão foi atualizado. <button className="crm-link" onClick={()=>{setResponsavel(card.responsavel_id??"");setProxima(card.proxima_acao);setPrazo(dataParaInput(card.prazo));setEtapa(card.etapa);setFormVersao(card.versao);}}>Carregar versão atual</button></p>}
  <fieldset disabled={!editar||ocupado||!q.data||card.versao!==formVersao} className="crm-form">
   <CamposAcao equipe={equipe} responsavel={responsavel} setResponsavel={setResponsavel} proxima={proxima} setProxima={setProxima} prazo={prazo} setPrazo={setPrazo}/>
   {editar&&<button className="ws-action ws-action--secondary" onClick={()=>void acao("salvar",{responsavel_id:responsavel||null,proxima_acao:proxima,prazo:prazo?inputParaData(prazo):null})}>Salvar acompanhamento</button>}
   {editar&&<section className="crm-box crm-form" aria-label="Movimentar oportunidade">
    <label className="crm-field"><span id={etapaLabel}>Mover para</span><select aria-labelledby={etapaLabel} value={etapa} onChange={e=>{setEtapa(e.target.value as EtapaCrm);setConfirmado(false);}}>{ETAPAS_CRM.map(e=><option value={e.id} key={e.id}>{e.nome}</option>)}</select></label>
    <label className="crm-field">Motivo da mudança<textarea value={motivo} maxLength={500} onChange={e=>setMotivo(e.target.value)} rows={2}/></label>
    {etapa==="agendado"&&<label className="crm-check"><input type="checkbox" checked={confirmado} onChange={e=>setConfirmado(e.target.checked)}/> O horário foi confirmado com a pessoa.</label>}
    <button className="ws-action" disabled={etapa===card.etapa||motivo.trim().length<8||(etapa==="agendado"&&!confirmado)} onClick={()=>void acao("mover",{etapa,motivo,horario_confirmado:confirmado})}><ArrowRight size={16} aria-hidden/> Mover oportunidade</button>
   </section>}
   {editar&&<button className="ws-action ws-action--secondary" disabled={!card.conversa_id||q.data?.ia_disponivel!==true} onClick={()=>void acao("sugerir")}><Sparkles size={16} aria-hidden/> {ocupado?"Processando…":"Analisar conversa com IA"}</button>}
  </fieldset>
  {q.data&&!q.data.ia_disponivel&&<p className="text-xs" role="status">{q.data.ia_motivo||"A conversa precisa ser conferida antes da análise por IA."} A equipe pode manter o acompanhamento manual enquanto isso.</p>}
  {card.conversa_id&&<section className="crm-box crm-form" aria-label="Conversa vinculada">
   <button className="ws-action ws-action--secondary" aria-expanded={verConversa} onClick={()=>setVerConversa(!verConversa)}>{verConversa?"Recolher conversa":"Ver conversa vinculada"}</button>
   {verConversa&&<>
    <p className="text-xs">Últimas 100 mensagens disponíveis. A abertura fica registrada para auditoria. Confira o contexto antes de aprovar uma mudança.</p>
    {mensagens.isPending&&<p role="status">Abrindo conversa…</p>}
    {mensagens.isError&&<p role="alert">{mensagemDeErro(mensagens.error,"a conversa")} <button className="crm-link" onClick={()=>void mensagens.refetch()}>Tentar novamente</button></p>}
    {mensagens.data?.length===0&&<p>Nenhuma mensagem disponível. Confira a importação com a equipe.</p>}
    <ol className="crm-history max-h-80 overflow-y-auto" aria-label="Últimas mensagens da conversa">{mensagens.data?.slice().reverse().map(m=><li key={m.id}><strong>{m.direcao==="entrada"?"Contato":m.direcao==="saida"?"Clínica":"Sistema"}</strong> · {quando(m.enviada_em)}<p className="whitespace-pre-wrap break-words">{m.texto||`Mensagem sem texto (${m.tipo||"mídia"})`}</p></li>)}</ol>
   </>}
  </section>}
  {aviso&&<p role="status">{aviso}</p>}
  {erro&&<p role="alert" className="crm-atrasado">{erro}</p>}
  {sugestoes.map(s=><section className="crm-box crm-form" key={s.id} aria-label="Sugestão da IA">
   <h3>Sugestão: {nomeEtapa(s.etapa)}</h3><p>{s.motivo}</p><blockquote>{s.evidencia}</blockquote><p className="text-xs">Trecho conferido na conversa · {quando(s.criado_em)}. Confira o contexto antes de aprovar.</p>
   {editar&&<div className="crm-toolbar"><button className="ws-action" disabled={ocupado||s.versao!==formVersao||card.versao!==formVersao} onClick={()=>void acao("aprovar",{sugestao_id:s.id})}>Aprovar mudança</button><button className="ws-action ws-action--secondary" disabled={ocupado} onClick={()=>void acao("recusar",{sugestao_id:s.id})}>Recusar sugestão</button></div>}
   {s.versao!==card.versao&&<p>O cartão mudou. Gere uma nova leitura para avançar.</p>}
  </section>)}
  {ultimo&&editar&&<button className="ws-action ws-action--secondary" disabled={ocupado} onClick={()=>void acao("desfazer",{evento_id:ultimo.id})}><Undo2 size={16} aria-hidden/> Desfazer última movimentação</button>}
  <section aria-label="Histórico da oportunidade"><h3 className="font-semibold">Histórico da oportunidade</h3><ol className="crm-history">{q.data?.historico.map(e=><li key={e.id}><strong>{e.origem==="ia_aprovada"?"IA com aprovação da equipe":"Equipe"}</strong> · {quando(e.criado_em)}<p>{e.motivo}</p>{e.antes&&e.antes.etapa!==e.depois.etapa&&<p>{nomeEtapa(e.antes.etapa)} → {nomeEtapa(e.depois.etapa)}</p>}<small>{e.autor_nome||equipe.find(m=>m.id===e.autor)?.nome||"Pessoa da equipe"}</small></li>)}</ol></section>
 </div></BottomSheet>;
}
