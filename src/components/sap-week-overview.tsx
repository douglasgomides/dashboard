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
      <div className="sap-week-heading"><div><p className="sap-eyebrow">Seu programa em movimento</p><h2 id="sap-week-title">O próximo passo, no lugar certo.</h2><p>Prioridades da semana, avanço da implantação e os caminhos para acompanhar a clínica.</p></div><Link to="/sap/$clientId/cronograma" params={{ clientId }} className="sap-quiet-link">Ver toda a jornada<ArrowRight size={16} aria-hidden /></Link></div>
      <div className="sap-week-board">
        <div className="sap-next-action"><p className="sap-eyebrow">{next ? "Sua próxima prioridade" : "Suas prioridades"}</p><h3>{next?.nome ?? (missingRole ? "Defina seu papel na clínica para acompanhar suas tarefas." : "Nenhuma tarefa pendente para agora.")}</h3><p>{next ? `${rotuloPrazo(next.prazo, hoje)} · ${next.pessoa ?? "Responsável a definir"}` : "As tarefas e os responsáveis são organizados a partir do cronograma do programa."}</p><a href="#sap-tarefas" className="sap-action-link">{next ? "Ver tarefa e orientações" : "Consultar minhas tarefas"}<ArrowRight size={16} aria-hidden /></a><span className="sap-action-foot">As conclusões automáticas e manuais seguem os registros do programa.</span></div>
        <div className="sap-program-progress"><p className="sap-eyebrow">Implantação da clínica</p><div className="sap-progress-number"><strong>{all.feitos}<span> / {all.total}</span></strong><span>entregas concluídas</span></div><div className="sap-progress-track" role="progressbar" aria-label="Entregas concluídas" aria-valuemin={0} aria-valuemax={all.total || 1} aria-valuenow={all.feitos}><span style={{ width: `${completed}%` }} /></div><p>{completed}% das entregas aplicáveis · rotinas semanais acompanhadas à parte</p><div className="sap-progress-phase"><CalendarDays size={17} aria-hidden /><span>{day === null ? "Data de início a definir" : day < 0 ? "Início agendado" : day > 90 ? "Continuidade do programa" : `Dia ${day} de 90 · ${faseDoDia(day)}`}</span></div></div>
      </div>
      <nav className="sap-workspace-shortcuts" aria-label="Acompanhar o programa"><Link to="/sap/$clientId/cronograma" params={{ clientId }}><CalendarDays size={18} aria-hidden /><span><strong>Agenda e entregas</strong><small>Etapas, responsáveis e prazos</small></span><ArrowRight size={16} aria-hidden /></Link><Link to="/sap/$clientId/leitura" params={{ clientId }}><Target size={18} aria-hidden /><span><strong>Números da semana</strong><small>Entender o que precisa melhorar</small></span><ArrowRight size={16} aria-hidden /></Link><Link to="/sap/$clientId/documentos" params={{ clientId }}><ClipboardList size={18} aria-hidden /><span><strong>Plano e materiais</strong><small>Decisões e próximos passos</small></span><ArrowRight size={16} aria-hidden /></Link></nav>
    </section>
  );
}
