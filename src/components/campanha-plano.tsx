import { BotaoCopiar } from "./botao-copiar";
import { campaignStrategyText, type CampaignStrategy } from "@/lib/campanha-estrategia";

export function CampaignPlan({ plan }: { plan: CampaignStrategy }) {
  return <div className="space-y-5" aria-label="Plano integrado da campanha">
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
      <h4 className="font-semibold">Direção da campanha</h4>
      <p className="mt-2 text-xs">Iniciar o teste exige preparo aprovado, agenda disponível e equipe responsável confirmada. Janelas, metas e recursos são propostas para revisão.</p>
      <p className="mt-2 text-sm"><b>Diagnóstico:</b> {plan.diagnostico}</p>
      <p className="mt-2 text-sm"><b>Hipótese a testar:</b> {plan.hipotese}</p>
      <p className="mt-2 text-sm"><b>Objetivo:</b> {plan.objetivo}</p>
      <p className="mt-2 text-sm"><b>Posicionamento:</b> {plan.posicionamento}</p>
      <p className="mt-2 text-sm"><b>Oferta para revisão:</b> {plan.oferta}</p>
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {([["Estratégia online", plan.online], ["Estratégia presencial", plan.presencial]] as const).map(([title, actions]) => <section key={title} aria-label={title} className="min-w-0 space-y-3">
        <h4 className="font-semibold">{title}</h4>
        {actions.map((a, n) => <div key={n} className="space-y-2 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <h5 className="font-semibold">{a.acao}</h5>
          <p><b>Canal:</b> {a.canal}</p><p><b>Público:</b> {a.publico}</p>
          <p><b>Entrega:</b> {a.entrega}</p><p><b>Responsável a atribuir:</b> {a.responsavel}</p><p><b>Quando:</b> {a.quando}</p>
          <p><b>Mensagem para revisão:</b> {a.mensagem}</p><p><b>Próximo passo:</b> {a.proximo_passo}</p><p><b>Como rastrear:</b> {a.rastreio}</p>
          {a.dependencias.length > 0 && <p><b>Antes de executar:</b> {a.dependencias.join("; ")}</p>}
        </div>)}
      </section>)}
    </div>
    <section aria-label="Da captação à continuidade"><h4 className="font-semibold">Da captação à continuidade</h4><ol className="mt-2 space-y-2">{plan.jornada.map((j) => <li key={j.etapa} className="rounded-lg p-3 text-sm" style={{ background: "var(--surface-2)" }}><b>{({captacao:"Captação",atendimento:"Atendimento",agendamento:"Agendamento",consulta:"Consulta",continuidade:"Continuidade"})[j.etapa]}:</b> {j.conduta}<p className="mt-1">Responsável a atribuir: {j.responsavel} · Registro: {j.registro}</p></li>)}</ol></section>
    <section aria-label="Sequência de execução"><h4 className="font-semibold">Sequência de execução</h4><ol className="mt-2 space-y-2">{plan.fases.map((f,n) => <li key={n} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}><b>{f.fase} · {f.periodo}</b><p>{f.entrega}</p><p className="mt-1"><b>Avançar quando:</b> {f.criterio_avanco}</p></li>)}</ol></section>
    <section aria-label="Recursos e orçamento"><h4 className="font-semibold">Recursos e orçamento a aprovar</h4>{plan.recursos.map((r,n) => <p key={n} className="mt-2 text-sm"><b>{r.item}:</b> {r.valor_estimado === null ? "Valor a levantar" : `Estimativa: ${r.valor_estimado.toLocaleString("pt-BR", {style:"currency",currency:"BRL"})}`} · {r.responsavel}<br />{r.confirmacao}</p>)}</section>
    <section aria-label="Medição e ajustes"><h4 className="font-semibold">Como medir e quando ajustar</h4>{plan.medicao.map((m,n) => <div key={n} className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor:"var(--border)" }}><b>{m.indicador}</b><p>Fórmula: {m.formula}</p><p>Fonte: {m.fonte} · Frequência: {m.frequencia}</p><p className="mt-1"><b>Regra de decisão:</b> {m.regra_decisao}</p></div>)}</section>
    <section><h4 className="font-semibold">O que confirmar antes de começar</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{[...plan.lacunas,...plan.riscos].map((v,n) => <li key={n}>{v}</li>)}</ul></section>
    <p className="text-xs" style={{ color:"var(--muted)" }}>Proposta para revisão da equipe. Papéis, prazos, custos e metas exigem confirmação. Aprovar o plano não publica anúncios, envia mensagens ou cria condutas clínicas.</p>
    <BotaoCopiar texto={campaignStrategyText(plan)} rotulo="Copiar plano completo" />
  </div>;
}
