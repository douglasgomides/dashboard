import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useRef, useState, type FormEvent } from "react";
import { MessageCircle, RefreshCw, Settings, Send, ArrowLeft, ExternalLink } from "lucide-react";
import { rotuloRelacionamento, type Relacionamento } from "@/lib/relacionamento";
import { canalApi, central, cancelarPreparado, relacionamentos, horarioCentral, NOME_ESTADO, type ConfigCentral, type ConversaCentral, type DetalheCentral, type EstadoAtendimento, type ListaCentral, type MensagemCentral } from "@/lib/central-atendimento";
import "@/styles/crm-kanban.css";
import "@/styles/central-atendimento.css";

export const Route=createFileRoute("/_authenticated/$clientId/central-atendimento")({component:CentralAtendimento});
function CentralAtendimento() {
 const {clientId}=Route.useParams();
 return <CentralDaClinica key={clientId} clientId={clientId}/>;
}
function CentralDaClinica({clientId}:{clientId:string}) {
 const qc=useQueryClient();
 const config=useQuery({queryKey:["central-config",clientId],queryFn:()=>central<ConfigCentral>(clientId,"config"),retry:false});
 const [busca,setBusca]=useState(""),consulta=useDeferredValue(busca);
 const [canal,setCanal]=useState("todos"),[estado,setEstado]=useState("sem_resposta"),[responsavel,setResponsavel]=useState("todos"),[pagina,setPagina]=useState(0);
 const [selecionada,setSelecionada]=useState<ConversaCentral|null>(null),[ajustes,setAjustes]=useState(false),[rascunhos,setRascunhos]=useState<Record<string,string>>({});
 const lista=useQuery({queryKey:["central-lista",clientId,consulta,canal,estado,responsavel,pagina],queryFn:()=>central<ListaCentral>(clientId,"listar",{busca:consulta,canal,estado,responsavel,offset:pagina*40}),enabled:config.data?.pode_atender===true,retry:false,refetchInterval:30_000});
 const idsPessoas=(lista.data?.conversas??[]).flatMap(c=>c.pessoa_id?[c.pessoa_id]:[]);
 // Paciente novo × já é paciente: histórico do CRM e das conversas, sem prontuário. Falha aqui não bloqueia a fila.
 const rel=useQuery({queryKey:["central-relacionamento",clientId,idsPessoas.join(",")],queryFn:()=>relacionamentos(clientId,idsPessoas),enabled:idsPessoas.length>0,retry:false,staleTime:300_000});
 async function atualizar(){await Promise.all([qc.invalidateQueries({queryKey:["central-lista",clientId]}),qc.invalidateQueries({queryKey:["central-config",clientId]}),qc.invalidateQueries({queryKey:["central-detalhe",clientId]})]);}
 function filtrar(fn:()=>void){fn();setPagina(0);}
 if(config.isPending)return <p role="status">Conferindo acesso à central…</p>;
 if(config.isError)return <div role="alert"><p>Não foi possível abrir a central.</p><button className="ws-action" onClick={()=>void config.refetch()}>Tentar novamente</button></div>;
 if(!config.data?.pode_atender)return <section className="crm-box"><h2>Acesso de consulta</h2><p>Para acessar conversas e responder pacientes, solicite à administração da clínica permissão de operação.</p></section>;
 const dados=lista.data;
 // A conversa aberta continua na lista depois de sair do filtro (por exemplo, ao ser respondida).
 const fixa=selecionada&&dados&&!dados.conversas.some(c=>c.id===selecionada.id)?selecionada:null,visiveis=dados?(fixa?[fixa,...dados.conversas]:dados.conversas):[];
 return <div className="central-page">
  <div className="central-heading"><div><h2>Fila e conversas</h2><p>Veja quem espera resposta, distribua as conversas e acompanhe cada contato no CRM.</p></div><button className="ws-action ws-action--secondary" aria-expanded={ajustes} onClick={()=>setAjustes(!ajustes)}><Settings size={16} aria-hidden/> Canais e conexão</button></div>
  <div className="crm-numeros central-numeros" aria-label="Fila da clínica">
   {([['sem_resposta','Esperam resposta'],['abertas','Em aberto'],['sem_responsavel','Sem responsável'],['pendentes','Aguardam retorno']] as const).map(([key,label])=><button key={key} className="crm-box crm-numero" aria-pressed={key==='sem_responsavel'?responsavel===key:estado===(key==='abertas'?'aberta':key==='pendentes'?'pendente':key)} onClick={()=>filtrar(()=>{setEstado(key==='abertas'?'aberta':key==='pendentes'?'pendente':key==='sem_responsavel'?'todas':'sem_resposta');setResponsavel(key==='sem_responsavel'?key:'todos');})}><span>{label}</span><strong>{dados?dados.contadores[key]:"—"}</strong></button>)}
  </div>
  <p className="text-xs">Totais da clínica inteira. “Esperam resposta” considera a última mensagem recebida nas conversas não resolvidas. Atualização a cada 30 segundos; horários de Brasília.</p>
  {ajustes&&<Canais clientId={clientId} config={config.data} onChanged={atualizar}/>}
  <div className="crm-toolbar">
   <label className="crm-field grow">Buscar contato<input type="search" maxLength={100} value={busca} onChange={e=>filtrar(()=>setBusca(e.target.value))}/></label>
   <label className="crm-field">Canal<select value={canal} onChange={e=>filtrar(()=>setCanal(e.target.value))}><option value="todos">Todos os canais</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></select></label>
   <label className="crm-field">Situação<select value={estado} onChange={e=>filtrar(()=>setEstado(e.target.value))}><option value="sem_resposta">Esperam resposta</option><option value="todas">Todas as conversas</option>{Object.entries(NOME_ESTADO).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label>
   <label className="crm-field">Responsável<select value={responsavel} onChange={e=>filtrar(()=>setResponsavel(e.target.value))}><option value="todos">Toda a equipe</option><option value="minhas">Minhas conversas</option><option value="sem_responsavel">Sem responsável</option></select></label>
   <button className="ws-action ws-action--secondary" disabled={lista.isFetching} onClick={()=>void atualizar()}><RefreshCw size={16} aria-hidden/> Atualizar fila</button>
  </div>
  {lista.isError&&<div role="alert" className="crm-box"><p>A fila não foi atualizada. Os últimos dados podem estar desatualizados.</p><button className="crm-link" onClick={()=>void lista.refetch()}>Tentar novamente</button></div>}
  <div className={`central-inbox ${selecionada?'central-inbox--selected':''}`}>
   <section className="crm-box central-list" aria-label="Conversas da fila">
    <h2>{dados?`Conversas nos filtros: ${dados.total_filtradas}`:"Conversas"}</h2>
    {lista.isPending&&<p role="status">Carregando a fila…</p>}
    {dados&&visiveis.length===0&&<div className="central-empty"><MessageCircle aria-hidden/><p>Nenhuma conversa com estes filtros.</p><button className="crm-link" onClick={()=>filtrar(()=>{setBusca('');setCanal('todos');setEstado('todas');setResponsavel('todos');})}>Ver todas as conversas</button><p className="text-xs">As mensagens dos canais oficiais aparecem a partir da conexão. O histórico importado fica disponível para consulta.</p></div>}
    {visiveis.map(c=><button key={c.id} className="central-conversation" aria-pressed={selecionada?.id===c.id} onClick={()=>setSelecionada(c)}><span className="central-conversation-title"><strong>{c.pessoa_nome}</strong><time>{horarioCentral(c.ultima_msg_em)}</time></span><span>{c.canal==='instagram'?'Instagram':'WhatsApp'} · {c.oficial?'Canal oficial':'Histórico importado'}</span><SeloRelacionamento r={c.pessoa_id?rel.data?.[c.pessoa_id]:undefined}/><span className="central-preview">{c.ultima_msg_texto||'Sem texto disponível'}</span><span>{NOME_ESTADO[c.estado]} · {c.responsavel_nome||'Sem responsável'}{c.sem_resposta&&c.estado!=='resolvida'?' · Espera resposta':''}</span>{c===fixa&&<span className="text-xs">Fora deste filtro; fica aqui enquanto estiver aberta</span>}</button>)}
    {dados&&(pagina>0||dados.total_filtradas>40)&&<nav className="central-pages" aria-label="Páginas da fila"><button disabled={pagina===0} className="crm-link" onClick={()=>setPagina(p=>p-1)}>Anteriores</button><span>{pagina*40+1}–{Math.min((pagina+1)*40,dados.total_filtradas)}</span><button disabled={(pagina+1)*40>=dados.total_filtradas} className="crm-link" onClick={()=>setPagina(p=>p+1)}>Mais conversas</button></nav>}
   </section>
   {selecionada?<Conversa key={`${clientId}:${selecionada.id}`} clientId={clientId} inicial={selecionada} relacionamento={selecionada.pessoa_id?rel.data?.[selecionada.pessoa_id]:undefined} config={config.data} texto={rascunhos[selecionada.id]??''} onTexto={v=>setRascunhos(r=>({...r,[selecionada.id]:v}))} onChanged={atualizar} onClose={()=>setSelecionada(null)}/>:<section className="crm-box central-empty" aria-label="Histórico da conversa"><MessageCircle aria-hidden/><h2>Escolha uma conversa</h2><p>O histórico, o responsável e o próximo passo aparecem aqui.</p></section>}
  </div>
 </div>;
}

function Conversa({clientId,inicial,relacionamento,config,texto,onTexto,onChanged,onClose}:{clientId:string;inicial:ConversaCentral;relacionamento?:Relacionamento;config:ConfigCentral;texto:string;onTexto:(v:string)=>void;onChanged:()=>Promise<void>;onClose:()=>void}) {
 const q=useQuery({queryKey:["central-detalhe",clientId,inicial.id],queryFn:()=>central<DetalheCentral>(clientId,"mensagens",{conversa_id:inicial.id}),retry:false,refetchInterval:15_000});
 const [erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[ocupado,setOcupado]=useState(false),[antigas,setAntigas]=useState<MensagemCentral[]>([]),[fimAntigas,setFimAntigas]=useState(false);
 const [observacao,setObservacao]=useState(''),[conferencia,setConferencia]=useState<string|null>(null);
 const pedido=useRef<{id:string;texto:string}|null>(null);
 const d=q.data, bloqueado=!!d?.envios.some(e=>['preparada','enviando','incerta'].includes(e.estado));
 const mensagens=[...new Map([...antigas,...(d?.mensagens??[])].map(m=>[m.id,m])).values()].sort((a,b)=>a.enviada_em.localeCompare(b.enviada_em)||a.id.localeCompare(b.id));
 async function agir(acao:string,dados:Record<string,unknown>={}){
  setErro('');setAviso('');setOcupado(true);
  try{await central(clientId,acao,{conversa_id:inicial.id,versao:d?.versao,...dados});await onChanged();}
  catch(e){setErro((e as Error).message);await q.refetch();}finally{setOcupado(false);}
 }
 async function enviar(e?:FormEvent,retomar?:{id:string;texto:string}) {
  e?.preventDefault();if(ocupado)return;setOcupado(true);setErro('');setAviso('');
  const content=retomar?.texto??texto.trim();
  if(retomar)pedido.current=retomar;else if(pedido.current?.texto!==content)pedido.current={id:crypto.randomUUID(),texto:content};
  try{
   const r=await canalApi<{estado:string}>(clientId,{acao:'enviar',conversa_id:inicial.id,pedido_id:pedido.current!.id,texto:content});
   if(r.estado==='aceita'){onTexto('');pedido.current=null;setAviso('Resposta aceita pelo canal. A entrega depende da confirmação do provedor.');}
   else if(r.estado==='incerta')setAviso('Envio sem confirmação. Confira no aplicativo oficial antes de repetir.');
   else if(r.estado==='falhou'){pedido.current=null;setAviso('O envio falhou. Confira o motivo abaixo.');}
   else setAviso('Há um envio em processamento. Atualize a conversa para conferir o resultado.');
   await onChanged();
  }catch(error){setErro((error as Error).message);await q.refetch();}finally{setOcupado(false);}
 }
 async function anteriores(){
  const first=mensagens[0];if(!first)return;setOcupado(true);setErro('');
  try{const r=await central<DetalheCentral>(clientId,'mensagens',{conversa_id:inicial.id,antes:first.enviada_em,antes_id:first.id});setAntigas(a=>[...r.mensagens,...a]);setFimAntigas(!r.tem_anteriores);}
  catch(e){setErro((e as Error).message);}finally{setOcupado(false);}
 }
 async function descartar(id:string){setOcupado(true);setErro('');try{await cancelarPreparado(clientId,id,observacao);setConferencia(null);setObservacao('');setAviso('Resposta preparada descartada. Nenhuma mensagem foi enviada.');await onChanged();}catch(e){setErro((e as Error).message);await q.refetch();}finally{setOcupado(false);}}
 async function vincular(){setOcupado(true);setErro('');try{await central(clientId,'criar_card',{conversa_id:inicial.id});setAviso('Oportunidade vinculada ao CRM.');await onChanged();}catch(e){setErro((e as Error).message);}finally{setOcupado(false);}}
 return <section className="crm-box central-detail" aria-label={`Conversa com ${inicial.pessoa_nome}`} aria-busy={ocupado}>
  <div className="central-heading"><div><h2>{inicial.pessoa_nome}</h2><p className="text-xs">{inicial.canal==='instagram'?'Instagram':'WhatsApp'} {inicial.telefone_final??''}</p><SeloRelacionamento r={relacionamento} detalhe/></div><button className="crm-link central-back" onClick={onClose}><ArrowLeft size={16} aria-hidden/> Voltar à fila</button></div>
  {q.isPending&&<p role="status">Carregando histórico…</p>}
  {q.isError&&<div role="alert"><p>Não foi possível atualizar a conversa.</p><button className="crm-link" onClick={()=>void q.refetch()}>Tentar novamente</button></div>}
  {erro&&<p role="alert" className="central-error">{erro}</p>}{aviso&&<p role="status" className="central-notice">{aviso}</p>}
  {d&&<>
   <div className="crm-toolbar central-controls"><label className="crm-field">Responsável pela conversa<select disabled={ocupado||q.isError} value={d.responsavel_id??''} onChange={e=>void agir('atribuir',{responsavel_id:e.target.value||null})}><option value="">Sem responsável</option>{config.equipe.map(m=><option value={m.id} key={m.id}>{m.nome}</option>)}</select></label><button className="crm-link" disabled={ocupado||q.isError||d.responsavel_id===config.usuario_id} onClick={()=>void agir('assumir')}>Assumir conversa</button><label className="crm-field">Situação da conversa<select disabled={ocupado||q.isError} value={d.estado} onChange={e=>void agir('estado',{estado:e.target.value as EstadoAtendimento})}>{Object.entries(NOME_ESTADO).map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label></div>
   <div className="central-crm">{d.card_id?<Link to="/$clientId/crm-contatos" params={{clientId}} search={{card:d.card_id}} className="crm-link">Abrir oportunidade no CRM <ExternalLink size={13} aria-hidden/></Link>:config.crm.ativo&&d.pessoa_id?<button className="crm-link" disabled={ocupado||q.isError} onClick={()=>void vincular()}>Acompanhar este contato no CRM</button>:<p className="text-xs">{config.crm.ativo?'Contato ainda sem identificação para criar oportunidade.':'O Kanban será liberado na configuração da clínica piloto.'}</p>}</div>
   <p className="text-xs">{d.oficial?'Histórico recebido a partir da ativação do canal oficial; mensagens anteriores podem não aparecer.':'Histórico importado para consulta. A resposta por aqui exige uma nova conversa recebida no canal oficial conectado.'}</p>
   <div className="central-messages" tabIndex={0} role="region" aria-label="Mensagens da conversa">
    {!fimAntigas&&d.tem_anteriores&&<button className="crm-link" disabled={ocupado} onClick={()=>void anteriores()}>Carregar mensagens anteriores</button>}
    {!mensagens.length&&<p>Não há mensagens disponíveis neste histórico.</p>}
    {mensagens.map(m=><article className={`central-message central-message--${m.direcao}`} key={m.id}><p className="text-xs">{m.direcao==='entrada'?'Contato':m.direcao==='saida'?'Equipe':'Sistema'} · {horarioCentral(m.enviada_em)}</p><p className="central-message-body">{m.texto||'[Mensagem sem texto]'}</p>{m.direcao==='saida'&&<p className="text-xs">{m.tipo==='envio_confirmado_manualmente'?'Confirmada manualmente pela equipe':({enviada:'Enviada',entregue:'Entregue',lida:'Lida',falhou:'Falha na entrega'} as Record<string,string>)[m.entrega??'']??(d.oficial?'Registrada no canal; sem confirmação de entrega':'Mensagem do histórico importado')}</p>}</article>)}
   </div>
   {d.envios.map(envio=><div className="central-notice" key={envio.id}><p>{envio.estado==='incerta'?'Resultado do envio não confirmado':envio.estado==='preparada'?'Resposta preparada, ainda não enviada':envio.estado==='enviando'?'Aguardando confirmação do canal':'Envio com falha'}</p><p className="central-message-body">{envio.texto}</p>{envio.erro&&<p className="text-xs">{envio.erro}</p>}{envio.estado==='preparada'&&<><button className="crm-link" disabled={ocupado||q.isError} onClick={()=>void enviar(undefined,{id:envio.id,texto:envio.texto})}>Retomar envio preparado</button><button className="crm-link" disabled={ocupado||q.isError} onClick={()=>{setConferencia(conferencia===envio.id?null:envio.id);setObservacao('');}}>Descartar resposta preparada</button>{conferencia===envio.id&&<div className="crm-form"><label className="crm-field">Motivo para descartar a resposta<textarea value={observacao} minLength={10} maxLength={500} onChange={e=>setObservacao(e.target.value)}/></label><button className="ws-action ws-action--secondary" disabled={ocupado||observacao.trim().length<10} onClick={()=>void descartar(envio.id)}>Confirmar descarte sem envio</button></div>}</>}{envio.estado==='incerta'&&<><button className="crm-link" onClick={()=>{setConferencia(conferencia===envio.id?null:envio.id);setObservacao('');}}>Registrar conferência no aplicativo</button>{conferencia===envio.id&&<div className="crm-form"><label className="crm-field">Como você conferiu o envio?<textarea value={observacao} minLength={10} maxLength={500} onChange={e=>setObservacao(e.target.value)}/></label><div className="crm-toolbar"><button className="ws-action ws-action--secondary" disabled={ocupado||observacao.trim().length<10} onClick={()=>void agir('conferir_envio',{pedido_id:envio.id,resultado:'confirmada_equipe',observacao})}>Conferi: a mensagem foi enviada</button><button className="ws-action ws-action--secondary" disabled={ocupado||observacao.trim().length<10} onClick={()=>void agir('conferir_envio',{pedido_id:envio.id,resultado:'nao_enviada_equipe',observacao})}>Conferi: não foi enviada</button></div></div>}</>}</div>)}
   {d.oficial?<form className="central-composer" onSubmit={e=>void enviar(e)}><label className="crm-field">Resposta para o contato<textarea value={texto} onChange={e=>onTexto(e.target.value)} maxLength={1000} rows={3} disabled={ocupado||!d.janela_aberta||q.isError} placeholder={d.janela_aberta?'Escreva a resposta da equipe':'Aguarde uma nova mensagem do contato'}/></label><div className="central-heading"><p className="text-xs">{d.janela_aberta?`${texto.length}/1000 · Resposta manual de texto. Anexos devem ser conferidos no aplicativo oficial.`:'Janela de 24 horas encerrada. Aguarde uma nova mensagem do contato para responder por aqui.'}</p><button className="ws-action" type="submit" disabled={ocupado||!d.janela_aberta||!texto.trim()||bloqueado||q.isError}><Send size={16} aria-hidden/> Enviar resposta</button></div></form>:<div className="central-notice"><strong>Consulta de histórico</strong><p>Continue este atendimento pelo aplicativo de origem. Em Canais e conexão, a equipe pode configurar o recebimento oficial de novas conversas.</p></div>}
  </>}
 </section>;
}

function SeloRelacionamento({r,detalhe}:{r?:Relacionamento;detalhe?:boolean}) {
 const x=rotuloRelacionamento(r);if(!x)return null;
 return <span className={`central-relacao central-relacao--${x.tipo}`}>{x.rotulo}{detalhe?<small> · {x.detalhe}</small>:null}</span>;
}
function Canais({clientId,config,onChanged}:{clientId:string;config:ConfigCentral;onChanged:()=>Promise<void>}) {
 const ready=useQuery({queryKey:['central-servidor',clientId],queryFn:()=>canalApi<{configurada:boolean;webhook:string}>(clientId),retry:false});
 const [canal,setCanal]=useState<'whatsapp'|'instagram'>('whatsapp'),[conta,setConta]=useState(''),[waba,setWaba]=useState(''),[token,setToken]=useState(''),[confirmo,setConfirmo]=useState(false),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState(''),[aviso,setAviso]=useState(''),[desligar,setDesligar]=useState<string|null>(null);
 async function conectar(e:FormEvent){e.preventDefault();setOcupado(true);setErro('');setAviso('');try{await canalApi(clientId,{acao:'conectar',canal,conta_externa:conta,...(canal==='whatsapp'?{waba_id:waba}:{}),token});setAviso('Canal configurado. Envie uma mensagem de uma conta de teste autorizada para conferir o recebimento.');setConta('');setWaba('');setConfirmo(false);await onChanged();}catch(e){setErro((e as Error).message);}finally{setToken('');setOcupado(false);}}
 async function desconectar(id:string){setOcupado(true);setErro('');try{await canalApi(clientId,{acao:'desconectar',canal_id:id});setDesligar(null);setAviso('Canal desconectado da central. O histórico foi preservado.');await onChanged();}catch(e){setErro((e as Error).message);}finally{setOcupado(false);}}
 return <section className="crm-box crm-form" aria-label="Configuração dos canais"><h2>Canais e conexão</h2><p>WhatsApp Business pela API oficial e Direct de conta profissional do Instagram. A integração começa pelas duas clínicas piloto.</p>
  {erro&&<p role="alert">{erro}</p>}{aviso&&<p role="status">{aviso}</p>}
  {config.canais.length===0&&<p>Nenhum canal oficial configurado nesta clínica.</p>}
  {config.canais.map(c=><div key={c.id} className="central-channel"><strong>{c.canal==='whatsapp'?'WhatsApp':'Instagram'} · {c.nome}</strong><p>{!c.ativo?'Desconectado':c.ultimo_evento_em?`Recebimento confirmado em ${horarioCentral(c.ultimo_evento_em)}`:'Configurado; aguardando primeiro evento recebido'}</p>{c.ativo&&<button className="crm-link" onClick={()=>setDesligar(c.id)}>Desconectar da central</button>}{desligar===c.id&&<div className="central-notice"><p>Novas mensagens e respostas deste canal deixarão de funcionar na central. O histórico será mantido.</p><button className="crm-link" disabled={ocupado} onClick={()=>void desconectar(c.id)}>Confirmar desconexão</button> <button className="crm-link" onClick={()=>setDesligar(null)}>Cancelar</button></div>}</div>)}
  {ready.isPending&&<p role="status">Conferindo configuração do servidor…</p>}
  {ready.isError&&<p role="alert">Não foi possível conferir a integração. <button className="crm-link" onClick={()=>void ready.refetch()}>Tentar novamente</button></p>}
  {ready.data&&!ready.data.configurada&&<div className="central-notice"><h3>Ativação oficial pendente</h3><p>A equipe Doctor Creator precisa concluir a configuração do aplicativo Meta antes de conectar os canais. A fila, o histórico importado e o vínculo com o CRM já podem ser usados.</p></div>}
  {ready.data?.configurada&&<details><summary>Configuração assistida pela equipe</summary><p className="text-sm">A equipe configura o webhook no aplicativo Meta, concede apenas as permissões de mensagens e valida a conta da clínica. Contas de outras empresas podem precisar de revisão e aprovação da Meta. Esta etapa ainda não usa conexão com um clique.</p><p className="text-xs">Webhook: <code>{ready.data.webhook}</code></p><form className="crm-form" onSubmit={e=>void conectar(e)} autoComplete="off"><label className="crm-field">Canal para conectar<select value={canal} onChange={e=>{setCanal(e.target.value as typeof canal);setToken('');setConta('');setConfirmo(false);}}><option value="whatsapp">WhatsApp Business Cloud API</option><option value="instagram">Instagram profissional · Instagram Login</option></select></label><label className="crm-field">{canal==='whatsapp'?'ID do telefone na Meta':'ID da conta profissional do Instagram'}<input required pattern="[0-9]{4,40}" inputMode="numeric" value={conta} onChange={e=>setConta(e.target.value)}/></label>{canal==='whatsapp'&&<label className="crm-field">ID da conta WhatsApp Business (WABA)<input required pattern="[0-9]{4,40}" inputMode="numeric" value={waba} onChange={e=>setWaba(e.target.value)}/></label>}<label className="crm-field">Token autorizado para mensagens<input type="password" autoComplete="new-password" required minLength={20} maxLength={4096} value={token} onChange={e=>setToken(e.target.value)}/></label><p className="text-xs">O token é enviado ao servidor, protegido com criptografia e não volta para esta tela. {canal==='instagram'?'Requer instagram_business_basic e instagram_business_manage_messages.':'Requer whatsapp_business_messaging e whatsapp_business_management.'}</p><label className="central-check"><input type="checkbox" required checked={confirmo} onChange={e=>setConfirmo(e.target.checked)}/> Confirmei que esta conta pertence à clínica e que tenho autorização para conectar suas mensagens.</label><button className="ws-action" disabled={ocupado||!confirmo} type="submit">Validar e conectar canal</button></form></details>}
 </section>;
}
