import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { ProductBrand } from "@/components/product-brand";
import { ehEnderecoSap } from "@/lib/marca";
import { PRODUCT_COPY } from "@/lib/product-copy";

export const Route = createFileRoute("/conhecer")({ component: ProductPresentation });

function ProductPresentation() {
  const product = ehEnderecoSap() ? "sap" : "nexo";
  const c = PRODUCT_COPY[product];
  return (
    <div className="nx-public">
      <a className="nx-skip" href="#presentation-main">Ir para o conteúdo</a>
      <header className="nx-public-nav">
        <ProductBrand product={product} />
        <nav aria-label="Navegação pública"><a className="nx-nav-method" href="#metodo">Como funciona</a><Link className="nx-button nx-button--outline" to="/login">Acessar {c.name}<ArrowRight size={16} aria-hidden /></Link></nav>
      </header>
      <main id="presentation-main" tabIndex={-1}>
        <section className="nx-hero" aria-labelledby="presentation-title">
          <div><p className="nx-kicker">{c.kicker}</p><h1 id="presentation-title">{c.headline}<br /><em>{c.emphasis}</em></h1><p className="nx-intro">{c.intro}</p><div className="nx-actions"><Link className="nx-button nx-button--primary" to="/login">Entrar no {c.name}<ArrowRight size={16} aria-hidden /></Link><a className="nx-button nx-button--outline" href="#metodo">Conhecer o método</a></div><p className="nx-hero-note">{c.note}</p></div>
          <aside className="nx-preview" aria-label={`Visão da proposta do ${c.name}`}>
            <div className="nx-preview-top"><span>{c.name} / DOCTOR CREATOR</span><span>CONTEXTO → AÇÃO</span></div>
            <h2>{c.previewTitle}</h2>
            <ol>{c.preview.map(([title,description],index)=><li key={title}><span className="nx-serial">0{index+1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
            <div className="nx-preview-delivery"><FileText size={18} aria-hidden /><div><strong>{product==="nexo"?"Conhecimento da clínica, preparado para revisão.":"Cada etapa com responsável e evidência."}</strong><p>{product==="nexo"?"Agentes que apoiam o trabalho de marketing e vendas.":"Método, execução técnica e acompanhamento."}</p></div></div>
            <p className="nx-preview-foot"><ShieldCheck size={14} aria-hidden />Decisões com responsabilidade</p>
          </aside>
        </section>
        <div className="nx-strip"><strong>{product==="nexo"?"Inteligência aplicada à clínica.":"A jornada completa do paciente."}</strong><span>{product==="nexo"?"Conteúdo e anúncios":"Atração e atendimento"}</span><span>{product==="nexo"?"CRM e atendimento":"Consulta e follow-up"}</span><span>{product==="nexo"?"Agentes e conhecimento":"Fidelização e indicações"}</span></div>
        <section className="nx-section" id="metodo" aria-labelledby="method-title"><div className="nx-section-intro"><h2 id="method-title">{c.sectionTitle}</h2><p>{c.sectionIntro}</p></div><div className="nx-editorial">{c.items.map(([title,description],index)=><article key={title}><span className="nx-serial">0{index+1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
        <section className="nx-section nx-section--border" aria-labelledby="delivery-title"><div className="nx-section-intro"><h2 id="delivery-title">{c.deliveryTitle}</h2><p>{c.deliveryIntro}</p></div><ol className="nx-delivery">{c.steps.map(([title,description],index)=><li key={title}><span className="nx-serial">0{index+1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol></section>
        <section className="nx-section nx-section--border" aria-labelledby="faq-title"><div className="nx-section-intro"><h2 id="faq-title">Antes de começar.</h2><p>O que faz parte da experiência e o que depende da sua equipe.</p></div><div className="nx-faq">{c.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section className="nx-final"><div><h2>{c.finalTitle}</h2><p>{c.finalText}</p></div><Link className="nx-button nx-button--primary" to="/login">Acessar {c.name}<ArrowRight size={16} aria-hidden /></Link></section>
      </main>
      <footer className="nx-public-footer"><span>{c.name} · Doctor Creator</span><nav aria-label="Acessos internos"><Link to="/login" search={{acesso:"equipe"}}>Equipe Doctor Creator</Link><Link to="/login" search={{acesso:"admin"}}>Administrativo</Link></nav></footer>
    </div>
  );
}
