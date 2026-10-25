import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Boxes, CheckCircle2, Info, MessagesSquare, ScanSearch, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getCrmNegocioProprio } from "@/lib/crm-negocio-data";
import { formatRangeLabel } from "@/lib/date-range";
import { Painel, Kpi } from "@/components/visual";
import { SyncButton } from "@/components/sync-button";
import { AtendimentoResumo } from "@/components/atendimento-resumo";

const n = (value: number) => value.toLocaleString("pt-BR");

export function CrmNegocioProprio({clientId,start,end}: {clientId:string;start:string;end:string}) {
  const {isAdmin} = useAuth();
  const q = useQuery({queryKey:["crm-negocio-proprio",clientId,start,end],queryFn:()=>getCrmNegocioProprio(clientId,start,end),staleTime:60_000});
  const resumo=q.data?.resumo;
  if(q.isPending) return <p role="status">Conferindo negócios, origens e conversas…</p>;
  if(q.isError || !resumo) return <div role="alert" className="space-y-2"><p>Não foi possível conferir os dados comerciais. Nenhum resultado foi substituído por zero.</p><button className="btn" disabled={q.isFetching} onClick={()=>void q.refetch()}>Tentar novamente</button></div>;
  const {total:totalConversas,completas,ultimaConferencia:conferencia}=q.data!.conversas;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{background:"var(--surface)",borderColor:"var(--border)"}}>
      <p className="flex max-w-3xl items-start gap-2 text-sm"><Info size={18} className="shrink-0" aria-hidden/>Esta conta acompanha conteúdo, produtos e vendas. Cadastros de materiais, assinaturas e pós-venda aparecem separados para orientar a revisão comercial.</p>
      <SyncButton clientId={clientId} alvo="crm"/>
    </div>
    <Painel icone={Users} titulo="Cadastros do período" resumo={formatRangeLabel({start,end})}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icone={Users} rotulo="Novos cadastros" valor={n(resumo.periodo.novos)} cor="var(--accent)"/>
        <Kpi icone={CheckCircle2} rotulo="Marcados como ganho" valor={n(resumo.periodo.ganhos)} cor="var(--good)"/>
        <Kpi icone={Boxes} rotulo="Marcados como perdido" valor={n(resumo.periodo.perdidos)} cor="var(--s2)"/>
      </div>
      <p className="mt-3 text-xs" style={{color:"var(--text-dim)"}}>Cadastros criados no período, classificados pela situação atual no CRM. “Ganho” é uma marcação da Clint; a confirmação de pagamento e a receita dependem da conciliação com o checkout.</p>
    </Painel>
    <Painel icone={Boxes} titulo="Como a base está organizada" resumo={`${n(resumo.total)} negócios · histórico completo, sem os removidos na origem`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(resumo.grupos).map(([grupo,total])=><Kpi key={grupo} icone={Boxes} rotulo={grupo} valor={n(total)} cor="var(--accent)"/>)}</div>
      <p className="mt-3 text-sm" style={{color:"var(--text-dim)"}}>Base de conteúdo identifica material de isca na etapa inicial do Instagram. Pós-venda inclui compras aprovadas, assinaturas e reembolsos. Os demais registros ficam em revisão comercial; estar aberto ou ter responsável não confirma intenção de compra.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Situação atual de todos os funis da conta</caption><thead><tr className="text-left"><th className="py-2">Funil</th>{["Total","Abertos","Ganhos no CRM","Perdidos"].map(t=><th key={t} className="px-2 text-right">{t}</th>)}</tr></thead><tbody>{resumo.funis.map(f=><tr key={f.nome} className="border-t" style={{borderColor:"var(--border)"}}><th scope="row" className="py-2 text-left font-normal">{f.nome}</th>{[f.total,f.abertos,f.ganhos,f.perdidos].map((v,i)=><td key={i} className="px-2 text-right tabular-nums">{n(v)}</td>)}</tr>)}</tbody></table></div>
    </Painel>
    <Painel icone={ScanSearch} titulo="Qualidade e limites dos dados" resumo="O que está documentado e o que exige confirmação">
      <ul className="list-disc space-y-2 pl-5 text-sm">
        <li><b>{n(resumo.semResponsavel)} negócios abertos sem responsável.</b> O responsável administrativo organiza a revisão; não identifica quem realizou cada atendimento histórico.</li>
        <li><b>{n(resumo.semOrigem)} negócios sem origem documentada.</b> A origem existente é preservada. Um canal identificado pelo funil não comprova campanha, anúncio ou post.</li>
        <li><b>{n(resumo.perdasSemMotivo)} perdas sem motivo registrado.</b> O motivo precisa ser recuperado de evidência ou confirmado pela equipe.</li>
        <li><b>{n(completas)} de {n(totalConversas)} conversas com mensagens conferidas.</b> A leitura cobre as conversas importadas da Clint vinculadas aos negócios desta conta{conferencia ? `; última conferência em ${new Date(conferencia).toLocaleString("pt-BR")}` : ""}. Uma nova conversa ou mensagem pode exigir atualização.</li>
      </ul>
      {isAdmin && <Link to="/$clientId/conversas" params={{clientId}} className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold" style={{color:"var(--accent)"}}><MessagesSquare size={16} aria-hidden/>Ver e atualizar conversas da Clint</Link>}
    </Painel>
    <Painel icone={ScanSearch} titulo="Origens registradas" resumo="Histórico completo · nomes preservados do cadastro">
      <p className="mb-2 text-sm">{n(resumo.total-resumo.semOrigem)} com origem preenchida; {n(resumo.semOrigem)} sem origem documentada.</p>
      <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">{resumo.origens.slice(0,12).map(o=><li key={o.nome} className="flex justify-between gap-4"><span>{o.nome}</span><b className="tabular-nums">{n(o.total)}</b></li>)}</ul>
      {resumo.origens.length>12 && <details className="mt-3"><summary className="min-h-11 cursor-pointer">Ver as demais {resumo.origens.length-12} origens</summary><ul className="space-y-1 text-sm">{resumo.origens.slice(12).map(o=><li key={o.nome}>{o.nome}: {n(o.total)}</li>)}</ul></details>}
    </Painel>
    <AtendimentoResumo clientId={clientId}/>
  </div>;
}
