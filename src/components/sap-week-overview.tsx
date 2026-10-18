import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ClipboardList, Target } from "lucide-react";
import { rotuloPrazo, type Tarefa } from "@/lib/sap-tarefas";
import { faseDoDia } from "@/lib/sap-data";

/** Presentation over the same tasks used by the calendar; no new sources or completion rules. */
export function SapWeekOverview({ clientId, day, all, next, missingRole, hoje }: {
  clientId: string; day: number | null; all: { total: number; feitos: number }; next: Tarefa | undefined; missingRole: boolean; hoje: string;
}) {
  const completed = all.total ? Math.round(all.feitos / all.total * 100) : 0;
  return (
    <section className="sap-week-overview" aria-labelledby="sap-week-title">
      <div className="sap-week-heading"><div><p className="sap-eyebrow">Implantação em acompanhamento</p><h2 id="sap-week-title">Sua implantação, com prioridades claras.</h2><p>Veja o que depende de você, as entregas concluídas e onde acompanhar os resultados da clínica.</p></div><Link to="/sap/$clientId/cronograma" params={{ clientId }} className="sap-quiet-link">Ver o plano de 90 dias<ArrowRight size={16} aria-hidden /></Link></div>
      <div className="sap-week-board">
        <div className="sap-next-action"><p className="sap-eyebrow">{next ? "Sua próxima prioridade" : "Suas prioridades"}</p><h3>{next?.nome ?? (missingRole ? "Vincule seu nome a uma responsabilidade da clínica." : "Nenhuma tarefa sua pendente neste momento.")}</h3><p>{next ? `${rotuloPrazo(next.prazo, hoje)} · ${next.pessoa ?? "Responsável a definir"}` : missingRole ? "A coordenação define os responsáveis em Equipe e acessos. Depois, suas tarefas aparecem aqui." : "Consulte o cronograma para ver as próximas etapas e o trabalho de toda a equipe."}</p><a href="#sap-tarefas" className="sap-action-link">{next ? "Abrir orientações da tarefa" : "Consultar minhas tarefas"}<ArrowRight size={16} aria-hidden /></a><span className="sap-action-foot">O avanço é atualizado pelas evidências e conclusões registradas no programa.</span></div>
        <div className="sap-program-progress"><p className="sap-eyebrow">Implantação da clínica</p><div className="sap-progress-number"><strong>{all.feitos}<span> / {all.total}</span></strong><span>entregas concluídas</span></div><div className="sap-progress-track" role="progressbar" aria-label="Entregas concluídas" aria-valuemin={0} aria-valuemax={all.total || 1} aria-valuenow={all.feitos}><span style={{ width: `${completed}%` }} /></div><p>{completed}% das entregas aplicáveis · rotinas semanais acompanhadas à parte</p><div className="sap-progress-phase"><CalendarDays size={17} aria-hidden /><span>{day === null ? "Data de início a definir" : day < 0 ? "Início agendado" : day > 90 ? "Continuidade do programa" : `Dia ${day} de 90 · ${faseDoDia(day)}`}</span></div></div>
      </div>
      <nav className="sap-workspace-shortcuts" aria-label="Acompanhar o programa"><Link to="/sap/$clientId/cronograma" params={{ clientId }}><CalendarDays size={18} aria-hidden /><span><strong>Agenda e entregas</strong><small>O que fazer, quem faz e até quando</small></span><ArrowRight size={16} aria-hidden /></Link><Link to="/sap/$clientId/leitura" params={{ clientId }}><Target size={18} aria-hidden /><span><strong>Números da semana</strong><small>O principal ajuste para a clínica</small></span><ArrowRight size={16} aria-hidden /></Link><Link to="/sap/$clientId/documentos" params={{ clientId }}><ClipboardList size={18} aria-hidden /><span><strong>Plano e materiais</strong><small>Metas, decisões e continuidade</small></span><ArrowRight size={16} aria-hidden /></Link></nav>
    </section>
  );
}
