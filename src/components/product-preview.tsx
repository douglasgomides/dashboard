import { useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";

const PREVIEWS = {
  nexo: {
    name: "Nexo",
    title: "Da conversa analisada ao ajuste que sua equipe vai testar.",
    description: "Na auditoria, a equipe examina objeções, interrupções do atendimento e oportunidades de retomada. No conhecimento da clínica, revisa as informações que servem de referência para conteúdo, anúncios e atendimento.",
    audience: "Visão da equipe Doctor Creator; módulos e acessos seguem a contratação.",
    screens: [
      { file: "nexo", label: "Auditoria comercial", outcome: "Encontre o que interrompe o agendamento.", detail: "Origens, objeções e falhas recorrentes do atendimento reunidas para orientar o próximo ajuste da equipe.", alt: "Auditoria comercial do Nexo com funil de conversas, origem dos agendamentos e experimento da semana. Dados fictícios." },
      { file: "nexo-brain", label: "Conhecimento da clínica", outcome: "Mantenha a proposta de valor da clínica como referência para a equipe.", detail: "O Brand Brain reúne fontes e propostas de conhecimento sobre a clínica, com revisão e aprovação da equipe.", alt: "Brand Brain do Nexo com fontes, propostas de conhecimento e informações aprovadas da clínica. Dados fictícios." },
    ],
  },
  sap: {
    name: "SAP",
    title: "Veja o plano da sua clínica ganhando forma.",
    description: "Você acompanha o que já foi entregue, o que depende da clínica e como os indicadores evoluem. O SAP dá visibilidade ao caminho dos 90 dias e aos ajustes combinados com a equipe.",
    audience: "Visão da clínica durante o programa.",
    screens: [
      { file: "sap", label: "Evolução da clínica", outcome: "Compare a operação com o ponto de partida.", detail: "Indicadores do período, referências iniciais e próxima reunião para acompanhar a implantação com dados registrados.", alt: "Visão geral do SAP com indicadores de atendimento e conversão comparados ao ponto de partida, fase do programa e próxima reunião. Dados fictícios." },
      { file: "sap-semana", label: "Prioridades da semana", outcome: "Saiba o que a clínica precisa entregar agora.", detail: "Próxima tarefa, responsável e prazo aparecem junto do progresso das entregas e dos materiais de apoio.", alt: "Minha semana no SAP com próxima prioridade, responsável, progresso das entregas e atalhos para agenda, indicadores e materiais. Dados fictícios." },
      { file: "sap-cronograma", label: "Agenda e entregas", outcome: "Acompanhe cada etapa dos 90 dias.", detail: "Cronograma por fase com responsáveis, prazos e registros de conclusão para manter a implantação organizada.", alt: "Cronograma real do SAP com linha do tempo de 90 dias, fases, responsáveis, prazos e entregas do programa. Dados fictícios." },
    ],
  },
} as const;

export function ProductPreview({ product }: { product: keyof typeof PREVIEWS }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(0);
  const preview = PREVIEWS[product];
  const screen = preview.screens[selected] ?? preview.screens[0];
  const src = `/product-previews/${screen.file}.jpg`;
  return (
    <section className="nx-section nx-product-preview" id="ferramenta" aria-labelledby="preview-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">Por dentro do {preview.name}</p><h2 id="preview-title">{preview.title}</h2></div>
        <p>{preview.description}</p>
      </div>
      <div className="nx-preview-picker" role="group" aria-label={`Escolha uma tela do ${preview.name}`}>
        {preview.screens.map((item, index) => <button type="button" key={item.file} aria-pressed={selected === index} onClick={() => setSelected(index)}><span>0{index + 1}</span>{item.label}</button>)}
      </div>
      <figure>
        <button type="button" className="nx-screen-button" aria-haspopup="dialog" aria-label={`Ampliar a tela do ${preview.name}`} onClick={() => dialog.current?.showModal()}>
          <span className="nx-screen-bar"><span>{preview.name} / {screen.label}</span><span>Ampliar tela <ArrowUpRight size={14} aria-hidden /></span></span>
          <img src={src} width={1440} height={960} loading="lazy" decoding="async" alt={screen.alt} />
        </button>
        <figcaption>Interface real com dados fictícios. {preview.audience}</figcaption>
      </figure>
      <div className="nx-preview-value" aria-live="polite" aria-atomic="true"><h3>{screen.outcome}</h3><p>{screen.detail}</p></div>
      <dialog ref={dialog} className="nx-preview-dialog" aria-labelledby="preview-dialog-title">
        <div className="nx-preview-dialog-bar"><h3 id="preview-dialog-title">{preview.name} / {screen.label}</h3><button type="button" aria-label="Fechar prévia" onClick={() => dialog.current?.close()}><X size={21} aria-hidden /></button></div>
        <div className="nx-preview-dialog-scroll" tabIndex={0} role="region" aria-label={`Tela ampliada do ${preview.name}`}><img src={src} width={1440} height={960} alt={screen.alt} /></div>
        <p>Interface real com dados fictícios. {preview.audience}</p>
      </dialog>
    </section>
  );
}
