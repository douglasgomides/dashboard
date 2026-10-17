import { useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";

const PREVIEWS = {
  nexo: {
    name: "Nexo",
    title: "Conhecimento que dá contexto às decisões.",
    description: "O Brand Brain transforma fontes da clínica em propostas de conhecimento para a equipe revisar. Posicionamento, público e aprendizados organizados para orientar conteúdo, anúncios e atendimento.",
    alt: "Tela do Brand Brain no Nexo: sugestões para revisar, fontes e memória de identidade da clínica.",
  },
  sap: {
    name: "SAP",
    title: "O plano de 90 dias, visível para a clínica.",
    description: "A agenda do programa mostra as fases, os prazos e as tarefas em um só lugar. A clínica acompanha o andamento da implantação e o que precisa acontecer em seguida.",
    alt: "Tela da agenda do SAP: linha do tempo de 90 dias, progresso e tarefas do programa organizadas por fase.",
  },
} as const;

export function ProductPreview({ product }: { product: keyof typeof PREVIEWS }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = PREVIEWS[product];
  const src = `/product-previews/${product}.jpg`;
  return (
    <section className="nx-section nx-product-preview" id="ferramenta" aria-labelledby="preview-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">Por dentro do {preview.name}</p><h2 id="preview-title">{preview.title}</h2></div>
        <p>{preview.description}</p>
      </div>
      <figure>
        <button type="button" className="nx-screen-button" aria-haspopup="dialog" aria-label={`Ampliar a tela do ${preview.name}`} onClick={() => dialog.current?.showModal()}>
          <span className="nx-screen-bar"><span>{preview.name} / Visão demonstrativa</span><span>Ampliar tela <ArrowUpRight size={14} aria-hidden /></span></span>
          <img src={src} width={1440} height={960} loading="lazy" decoding="async" alt={preview.alt} />
        </button>
        <figcaption>Interface real com dados fictícios. {product === "nexo" ? "Visão da equipe Doctor Creator; módulos e acessos seguem a contratação." : "Visão da clínica durante o programa."}</figcaption>
      </figure>
      <dialog ref={dialog} className="nx-preview-dialog" aria-labelledby="preview-dialog-title">
        <div className="nx-preview-dialog-bar"><h3 id="preview-dialog-title">{preview.name} em detalhe</h3><button type="button" aria-label="Fechar prévia" onClick={() => dialog.current?.close()}><X size={21} aria-hidden /></button></div>
        <div className="nx-preview-dialog-scroll" tabIndex={0} role="region" aria-label={`Tela ampliada do ${preview.name}`}><img src={src} width={1440} height={960} alt={preview.alt} /></div>
        <p>Ambiente demonstrativo com dados fictícios.</p>
      </dialog>
    </section>
  );
}
