import { useState } from "react";
import { ArrowRight } from "lucide-react";

const SCENARIOS = [
  {
    label: "Investimento em marketing",
    question: "Qual origem traz gente que realmente agenda?",
    source: "Origens das conversas + agendamentos identificados",
    reading: "Um canal pode gerar muitas mensagens e poucos agendamentos. Outro pode trazer menos contatos, mas conversas que avançam.",
    decision: "Avaliar a qualidade da procura antes de redistribuir o investimento.",
    evidence: "No Nexo: origem dos agendamentos, anúncios e leitura comercial.",
  },
  {
    label: "Conversão no atendimento",
    question: "Foi o preço ou o atendimento que interrompeu a conversa?",
    source: "Motivo de perda no CRM + leitura das conversas",
    reading: "O CRM registra “preço”, mas a conversa pode mostrar uma dúvida sem resposta ou a ausência de um retorno combinado.",
    decision: "Rever a abordagem da equipe e identificar oportunidades para retomar.",
    evidence: "No Nexo: motivos comparados, objeções e exemplos de atendimento.",
  },
  {
    label: "Evolução da equipe",
    question: "O treinamento está mudando o que acontece na prática?",
    source: "Falhas recorrentes + experimento da semana",
    reading: "Uma falha frequente vira uma ação para testar por sete dias, como conduzir a conversa até uma oferta concreta de horário.",
    decision: "Comparar a frequência da falha antes e durante o teste e decidir o próximo ajuste.",
    evidence: "No Nexo: experimento semanal e auditoria comercial.",
  },
] as const;

export function ProductDecisions() {
  const [selected, setSelected] = useState(0);
  const scenario = SCENARIOS[selected];
  return (
    <div className="nx-decisions">
      <div className="nx-decision-options" role="group" aria-label="Explore uma decisão de negócio">
        {SCENARIOS.map((item, index) => <button type="button" key={item.label} aria-pressed={selected === index} onClick={() => setSelected(index)}><span>0{index + 1}</span>{item.label}<ArrowRight size={17} aria-hidden /></button>)}
      </div>
      <div className="nx-decision-panel" aria-live="polite" aria-atomic="true">
        <p className="nx-eyebrow">Exemplo de análise · situação ilustrativa</p>
        <h3>{scenario.question}</h3>
        <dl><div><dt>O que o Nexo relaciona</dt><dd>{scenario.source}</dd></div><div><dt>O que merece atenção</dt><dd>{scenario.reading}</dd></div></dl>
        <div className="nx-decision-action"><span>Decisão que isso ajuda a tomar</span><p>{scenario.decision}</p></div>
        <p className="nx-decision-evidence">{scenario.evidence}</p>
      </div>
    </div>
  );
}
