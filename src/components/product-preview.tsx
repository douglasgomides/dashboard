import { useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";

const PREVIEWS = {
  nexo: {
    name: "Nexo",
    title: "Veja o que a sua equipe passa a enxergar.",
    description: "A auditoria comercial relaciona as conversas, as objeções e a origem dos agendamentos. O Brand Brain organiza o conhecimento da clínica. Duas visões reais do trabalho que sustenta as decisões.",
    alt: "Auditoria comercial no Nexo: experimento da semana, origem de agendamentos e motivos de perda, com dados fictícios.",
  },
  sap: {
    name: "SAP",
    title: "Você acompanha a implantação. A equipe sabe o que entregar.",
    description: "O SAP leva o plano para a rotina: fases, sessões, materiais e tarefas com responsáveis. A clínica acompanha o avanço, as pendências e o que precisa fazer, sem perder o histórico das decisões.",
    alt: "Tela da agenda do SAP: linha do tempo de 90 dias, progresso e tarefas do programa organizadas por fase.",
  },
} as const;

export function ProductPreview({ product }: { product: keyof typeof PREVIEWS }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"auditoria" | "brain">("auditoria");
  const preview = PREVIEWS[product];
  const brain = product === "nexo" && view === "brain";
  const src = `/product-previews/${brain ? "nexo-brain" : product}.jpg`;
  const alt = brain ? "Brand Brain do Nexo: fontes, propostas de memória e conhecimento aprovado da clínica, com dados fictícios." : preview.alt;
  return (
    <section className="nx-section nx-product-preview" id="ferramenta" aria-labelledby="preview-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">Por dentro do {preview.name}</p><h2 id="preview-title">{preview.title}</h2></div>
        <p>{preview.description}</p>
      </div>
      {product === "nexo" && <div className="nx-preview-picker" role="group" aria-label="Escolha uma tela do Nexo"><button type="button" aria-pressed={!brain} onClick={() => setView("auditoria")}>Auditoria comercial</button><button type="button" aria-pressed={brain} onClick={() => setView("brain")}>Conhecimento da clínica</button></div>}
      <figure>
        <button type="button" className="nx-screen-button" aria-haspopup="dialog" aria-label={`Ampliar a tela do ${preview.name}`} onClick={() => dialog.current?.showModal()}>
          <span className="nx-screen-bar"><span>{preview.name} / Visão demonstrativa</span><span>Ampliar tela <ArrowUpRight size={14} aria-hidden /></span></span>
          <img src={src} width={1440} height={960} loading="lazy" decoding="async" alt={alt} />
        </button>
        <figcaption>Interface real com dados fictícios. {product === "nexo" ? "Visão da equipe Doctor Creator; módulos e acessos seguem a contratação." : "Visão da clínica durante o programa."}</figcaption>
      </figure>
      <dialog ref={dialog} className="nx-preview-dialog" aria-labelledby="preview-dialog-title">
        <div className="nx-preview-dialog-bar"><h3 id="preview-dialog-title">{preview.name} em detalhe</h3><button type="button" aria-label="Fechar prévia" onClick={() => dialog.current?.close()}><X size={21} aria-hidden /></button></div>
        <div className="nx-preview-dialog-scroll" tabIndex={0} role="region" aria-label={`Tela ampliada do ${preview.name}`}><img src={src} width={1440} height={960} alt={alt} /></div>
        <p>Ambiente demonstrativo com dados fictícios.</p>
      </dialog>
    </section>
  );
}
