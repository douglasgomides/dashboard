import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Check, ChartNoAxesCombined, Layers, ScanLine } from "lucide-react";
import { ProductBrand } from "@/components/product-brand";
import { ProductPreview } from "@/components/product-preview";
import { ProductDecisions } from "@/components/product-decisions";
import { ehEnderecoSap } from "@/lib/marca";
import { PRODUCT_COPY, commercialUrl } from "@/lib/product-copy";
import "@/landing.css";

export const Route = createFileRoute("/conhecer")({ component: ProductPresentation });

function ProductPresentation() {
  const product = ehEnderecoSap() ? "sap" : "nexo";
  const sap = product === "sap";
  const c = PRODUCT_COPY[product];
  const contact = commercialUrl(product);
  return (
    <div className={`nx-public nx-landing nx-landing--${product}`}>
      <a className="nx-skip" href="#presentation-main">Ir para o conteúdo</a>
      <header className="nx-public-nav">
        <ProductBrand product={product} />
        <nav aria-label="Navegação pública"><a className="nx-nav-method" href="#metodo">{sap ? "A implantação" : "O que você descobre"}</a><a className="nx-nav-method" href="#ferramenta">Por dentro</a><Link className="nx-button nx-button--outline" to="/login">Acessar {c.name}<ArrowRight size={15} aria-hidden /></Link></nav>
      </header>
      <main id="presentation-main" tabIndex={-1}>
        <section className="nx-hero" aria-labelledby="presentation-title">
          <div className="nx-hero-copy"><p className="nx-kicker">{c.kicker}</p><h1 id="presentation-title">{c.headline}<br /><em>{c.emphasis}</em></h1><p className="nx-intro">{c.intro}</p><div className="nx-actions"><a className="nx-button nx-button--primary" href={contact}>{c.cta}<ArrowRight size={17} aria-hidden /></a><a className="nx-text-link" href="#metodo">{sap ? "Ver o que está incluído" : "Explorar as possibilidades"}<ArrowDown size={15} aria-hidden /></a></div><p className="nx-hero-note">{c.note}</p></div>
          {sap ? <ProgramCover /> : <IntelligenceCover />}
        </section>
        <div className="nx-value-strip" aria-label={sap ? "Estrutura do programa" : "Áreas de inteligência"}>
          {sap ? <><span><b>90 dias</b> de implantação assistida</span><span><b>6 sessões</b> individuais + kickoff</span><span><b>Do anúncio à indicação</b> uma jornada conectada</span></> : <><span><ChartNoAxesCombined size={17} aria-hidden /><b>Marketing</b> com leitura comercial</span><span><ScanLine size={17} aria-hidden /><b>Atendimento</b> com evidências</span><span><Layers size={17} aria-hidden /><b>Equipe</b> com prioridades</span></>}
        </div>
        <section className="nx-section nx-problem" aria-labelledby="problem-title">
          <div className="nx-section-intro"><div><p className="nx-kicker">{sap ? "O caminho do paciente" : "O ponto cego da operação"}</p><h2 id="problem-title">{c.problemTitle}</h2></div><p>{c.problemIntro}</p></div>
          <div className="nx-question-grid">{c.problems.map(([statement, question], index) => <article key={statement}><span className="nx-serial">0{index + 1}</span><p>{statement}</p><h3>{question}</h3></article>)}</div>
        </section>
        <section className="nx-section nx-method" id="metodo" aria-labelledby="method-title">
          <div className="nx-section-intro"><div><p className="nx-kicker">{sap ? "A entrega" : "Da informação à decisão"}</p><h2 id="method-title">{c.sectionTitle}</h2></div><p>{c.sectionIntro}</p></div>
          {sap ? <div className="nx-deliverables">{c.items.map(([title, description], index) => <article key={title}><span className="nx-serial">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div><Check size={18} aria-hidden /></article>)}</div> : <><ProductDecisions /><div className="nx-capabilities">{c.items.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div></>}
        </section>
        <ProductPreview product={product} />
        <section className="nx-intelligence" aria-labelledby="delivery-title"><div className="nx-section">
          <div className="nx-section-intro"><div><p className="nx-kicker">{sap ? "Da estratégia à rotina" : "Inteligência agêntica aplicada"}</p><h2 id="delivery-title">{c.deliveryTitle}</h2></div><p>{c.deliveryIntro}</p></div>
          <ol className="nx-delivery">{c.steps.map(([title, description], index) => <li key={title}><span className="nx-serial">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
          <p className="nx-intelligence-note">{sap ? "A inteligência apoia a organização e a conferência de etapas. A Doctor Creator conduz a implantação; sua clínica participa das decisões e do atendimento." : "Análises com fontes e contexto. Propostas revisadas pela equipe. A disponibilidade depende dos módulos e das integrações da clínica."}</p>
        </div></section>
        <section className="nx-section nx-fit" aria-labelledby="fit-title"><div><p className="nx-kicker">Para o seu momento</p><h2 id="fit-title">{sap ? "Para quem quer construir uma aquisição que a equipe consegue executar." : "Para quem já investe em marketing e precisa saber o que fazer a seguir."}</h2></div><div><p>{sap ? "Você tem um serviço que quer crescer, capacidade para atender e uma equipe para participar. O SAP organiza o processo, entrega os materiais e acompanha a implantação com você." : "Se sua clínica tem conteúdo, anúncios, CRM ou atendimento gerando dados, existe uma oportunidade de usá-los melhor. O Nexo ajuda decisores e equipes a estudar a operação e definir prioridades com fundamento."}</p><ul>{(sap ? ["Decisor envolvido na estratégia", "Recepção disponível para treinamento", "Investimento em mídia e rotina de registros"] : ["Decisões de marketing e investimento", "Melhoria do atendimento e da conversão", "Aprendizados para conteúdo e equipe"]).map(item => <li key={item}><Check size={16} aria-hidden />{item}</li>)}</ul><a href={contact} className="nx-text-link">Conversar sobre minha clínica<ArrowRight size={16} aria-hidden /></a></div></section>
        <section className="nx-product-bridge"><div className="nx-section"><p className="nx-eyebrow">Duas soluções Doctor Creator</p><h2>{sap ? "A aquisição começa com estrutura. Evolui com inteligência." : "Precisa organizar a aquisição antes de analisar a operação?"}</h2><p>{sap ? "O SAP coloca o caminho de aquisição em prática. O Nexo pode dar continuidade ao estudo dos dados e às decisões de marketing e vendas da clínica, em uma contratação própria." : "O SAP é a implantação assistida de 90 dias para conectar atração, atendimento, consulta e relacionamento. O Nexo é a inteligência para estudar os dados e orientar a evolução."}</p><a className="nx-text-link" href={sap ? "https://nexo.doctorcreator.com.br/conhecer" : "https://sap.doctorcreator.com.br/conhecer"}>Conhecer o {sap ? "Nexo" : "SAP"}<ArrowRight size={16} aria-hidden /></a></div></section>
        <section className="nx-section nx-faq-section" aria-labelledby="faq-title"><div><p className="nx-kicker">Perguntas frequentes</p><h2 id="faq-title">Uma decisão bem informada começa aqui.</h2></div><div className="nx-faq">{c.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section className="nx-final"><div><p className="nx-eyebrow">{c.name} / Doctor Creator</p><h2>{c.finalTitle}</h2><p>{c.finalText}</p><a className="nx-button nx-button--primary" href={contact}>{c.cta}<ArrowRight size={17} aria-hidden /></a><small>Converse com nossa equipe pelo WhatsApp sobre o momento da sua clínica.</small></div><span className="nx-final-monogram" aria-hidden>{sap ? "S" : "N"}</span></section>
        <section className="nx-section nx-customer-access" aria-labelledby="customer-access-title"><div><p className="nx-kicker">Já é cliente?</p><h2 id="customer-access-title">Seu trabalho continua aqui.</h2><p>Acesse a plataforma contratada com seu usuário individual.</p></div><nav aria-label="Acesso às plataformas"><a href="https://nexo.doctorcreator.com.br/login"><span><strong>Nexo</strong><small>Inteligência de marketing e vendas</small></span><span>Entrar no Nexo<ArrowRight size={16} aria-hidden /></span></a><a href="https://sap.doctorcreator.com.br/login"><span><strong>SAP</strong><small>Sistema de Aquisição de Pacientes</small></span><span>Entrar no SAP<ArrowRight size={16} aria-hidden /></span></a></nav></section>
      </main>
      <footer className="nx-public-footer"><span>{c.name} · Doctor Creator</span><nav aria-label="Acessos internos"><a href="https://doctorcreator.com.br/privacidade/">Privacidade</a><Link to="/login" search={{ acesso: "equipe" }}>Equipe Doctor Creator</Link><Link to="/login" search={{ acesso: "admin" }}>Administrativo</Link></nav></footer>
    </div>
  );
}

function IntelligenceCover() {
  return <aside className="nx-intelligence-cover" aria-label="Demonstração da inteligência comercial do Nexo"><div className="nx-cover-heading"><span>NEXO / INTELIGÊNCIA COMERCIAL</span><span>POR DENTRO DA PLATAFORMA</span></div><div className="nx-hero-screen"><img src="/product-previews/nexo.jpg" width={1440} height={960} fetchPriority="high" alt="Demonstração da auditoria comercial: origem dos agendamentos e experimento de melhoria do atendimento." /></div><div className="nx-hero-insight"><span>Da conversa ao próximo ajuste</span><p>O que o paciente diz vira evidência para melhorar a operação.</p><a className="nx-text-link" href="#ferramenta">Explorar a tela real<ArrowRight size={15} aria-hidden /></a></div><div className="nx-cover-footer"><span>Interface real · dados fictícios</span><span>Visão da equipe Doctor Creator</span></div></aside>;
}

function ProgramCover() {
  return <aside className="nx-program-cover" aria-label="Visão do programa de implantação"><div className="nx-cover-heading"><span>DOCTOR CREATOR / SAP</span><span>IMPLANTAÇÃO ASSISTIDA</span></div><p className="nx-program-number">90<span>dias para estruturar<br />a sua aquisição</span></p><div className="nx-program-journey">{["Atrair", "Qualificar", "Agendar e confirmar", "Conduzir a consulta", "Acompanhar a decisão", "Fidelizar e gerar indicações"].map((step, index) => <div key={step}><span>0{index + 1}</span><p>{step}</p></div>)}</div><div className="nx-program-foot"><b>Método + execução + equipe preparada</b><span>Um plano. Responsáveis. Acompanhamento.</span></div></aside>;
}
