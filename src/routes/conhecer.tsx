import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Check, ChartNoAxesCombined, Layers, ScanLine } from "lucide-react";
import { ProductBrand } from "@/components/product-brand";
import { ProductPreview } from "@/components/product-preview";
import { SapDeliverables, SapSupport } from "@/components/sap-offer";
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
          <div className="nx-hero-copy"><p className="nx-kicker">{c.kicker}</p><h1 id="presentation-title">{c.headline}<br /><em>{c.emphasis}</em></h1><p className="nx-intro">{c.intro}</p><div className="nx-actions"><a className="nx-button nx-button--primary" href={contact}>{c.cta}<ArrowRight size={17} aria-hidden /></a><a className="nx-text-link" href="#metodo">{sap ? "Ver o que está incluído" : "Ver as decisões na prática"}<ArrowDown size={15} aria-hidden /></a></div><p className="nx-hero-note">{c.note}</p></div>
          {sap ? <ProgramCover /> : <IntelligenceCover />}
        </section>
        <div className="nx-value-strip" aria-label={sap ? "Estrutura do programa" : "Áreas de inteligência"}>
          {sap ? <><span><b>90 dias</b> de implantação assistida</span><span><b>6 sessões</b> individuais + kickoff</span><span><b>18 criativos</b> editados para anúncios</span></> : <><span><ChartNoAxesCombined size={17} aria-hidden /><b>Investimento</b> com análise da procura</span><span><ScanLine size={17} aria-hidden /><b>Gargalos</b> investigados nas conversas</span><span><Layers size={17} aria-hidden /><b>Equipe</b> com um próximo passo</span></>}
        </div>
        <section className="nx-section nx-problem" aria-labelledby="problem-title">
          <div className="nx-section-intro"><div><p className="nx-kicker">{sap ? "Antes do próximo investimento" : "Quando os números não explicam o resultado"}</p><h2 id="problem-title">{c.problemTitle}</h2></div><p>{c.problemIntro}</p></div>
          <div className="nx-question-grid">{c.problems.map(([statement, question], index) => <article key={statement}><span className="nx-serial">0{index + 1}</span><p>{statement}</p><h3>{question}</h3></article>)}</div>
        </section>
        <section className="nx-intelligence" aria-labelledby="delivery-title"><div className="nx-section">
          <div className="nx-section-intro"><div><p className="nx-kicker">{sap ? "O mapa da implantação" : "O mapa da próxima decisão"}</p><h2 id="delivery-title">{c.deliveryTitle}</h2></div><p>{c.deliveryIntro}</p></div>
          <ol className="nx-delivery">{c.steps.map(([title, description], index) => <li key={title}><span className="nx-serial">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
          <p className="nx-intelligence-note">{sap ? "Um método testado pela Doctor Creator, aplicado à realidade da sua clínica. A equipe conduz a implantação e os ajustes; o decisor e a recepção participam das etapas combinadas." : "A inteligência agêntica prepara análises e propostas a partir das fontes disponíveis. A Doctor Creator revisa as evidências e orienta a ação com a equipe. As conexões e os módulos são definidos na implantação."}</p>
        </div></section>
        {sap ? <><SapDeliverables /><SapSupport /></> : <section className="nx-section nx-method" id="metodo" aria-labelledby="method-title">
          <div className="nx-section-intro"><div><p className="nx-kicker">Como isso se aplica à sua clínica</p><h2 id="method-title">{c.sectionTitle}</h2></div><p>{c.sectionIntro}</p></div>
          <ProductDecisions /><div className="nx-capabilities">{PRODUCT_COPY.nexo.items.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div>
        </section>}
        <ProductPreview product={product} />
        <section className="nx-section nx-fit" aria-labelledby="fit-title"><div><p className="nx-kicker">Para o seu momento</p><h2 id="fit-title">{sap ? "Para quem quer crescer e precisa saber como começar." : "Para quem já investe e precisa decidir o que vai fazer a clínica avançar."}</h2></div><div><p>{sap ? "O SAP faz sentido quando existe um tratamento ou serviço que você quer crescer, capacidade de agenda e uma equipe para participar. Começamos pela sua realidade para definir o plano, executar as etapas e medir a evolução." : "Você já tem campanhas, conteúdo, CRM ou atendimento em operação, mas os relatórios não deixam claro onde mexer. O Nexo conecta as fontes disponíveis para estudar o crescimento pelo caminho real do paciente e orientar os próximos ajustes."}</p><ul>{(sap ? ["Decisor envolvido na estratégia", "Recepção disponível para treinamento", "Investimento em mídia e rotina de registros"] : ["Decisões de marketing e investimento", "Melhoria do atendimento e da conversão", "Aprendizados para conteúdo e equipe"]).map(item => <li key={item}><Check size={16} aria-hidden />{item}</li>)}</ul><a href={contact} className="nx-text-link">Conversar sobre minha clínica<ArrowRight size={16} aria-hidden /></a></div></section>
        <section className="nx-product-bridge"><div className="nx-section"><p className="nx-eyebrow">Duas soluções Doctor Creator</p><h2>{sap ? "Implante o caminho com o SAP. Aprofunde as decisões com o Nexo." : "Sua clínica precisa primeiro colocar a aquisição em prática?"}</h2><p>{sap ? "O SAP implanta o processo de aquisição ao longo de 90 dias. O Nexo pode dar continuidade à leitura de marketing e vendas: estudar o que funciona, investigar gargalos e orientar os ajustes. A contratação e o acesso ao Nexo são próprios." : "O SAP prepara e implanta campanhas, atendimento, consulta e relacionamento em 90 dias. O Nexo aprofunda a análise de marketing e vendas das clínicas que já têm uma operação. Cada produto tem contratação e acesso próprios."}</p><a className="nx-text-link" href={sap ? "https://nexo.doctorcreator.com.br/conhecer" : "https://sap.doctorcreator.com.br/conhecer"}>Conhecer o {sap ? "Nexo" : "SAP"}<ArrowRight size={16} aria-hidden /></a></div></section>
        <section className="nx-section nx-faq-section" aria-labelledby="faq-title"><div><p className="nx-kicker">Perguntas frequentes</p><h2 id="faq-title">O que está envolvido na sua decisão.</h2></div><div className="nx-faq">{c.faq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
        <section className="nx-final"><div><p className="nx-eyebrow">{c.name} / Doctor Creator</p><h2>{c.finalTitle}</h2><p>{c.finalText}</p><a className="nx-button nx-button--primary" href={contact}>{c.cta}<ArrowRight size={17} aria-hidden /></a><small>Converse com nossa equipe pelo WhatsApp sobre o momento da sua clínica.</small></div><span className="nx-final-monogram" aria-hidden>{sap ? "S" : "N"}</span></section>
        <section className="nx-section nx-customer-access" aria-labelledby="customer-access-title"><div><p className="nx-kicker">Já é cliente?</p><h2 id="customer-access-title">Acesse o ambiente da sua clínica.</h2><p>Acesse a plataforma contratada com seu usuário individual.</p></div><nav aria-label="Acesso às plataformas"><a href="https://nexo.doctorcreator.com.br/login"><span><strong>Nexo</strong><small>Inteligência de marketing e vendas</small></span><span>Entrar no Nexo<ArrowRight size={16} aria-hidden /></span></a><a href="https://sap.doctorcreator.com.br/login"><span><strong>SAP</strong><small>Sistema de Aquisição de Pacientes</small></span><span>Entrar no SAP<ArrowRight size={16} aria-hidden /></span></a></nav></section>
      </main>
      <footer className="nx-public-footer"><span>{c.name} · Doctor Creator</span><nav aria-label="Acessos internos"><a href="https://doctorcreator.com.br/privacidade/">Privacidade</a><Link to="/login" search={{ acesso: "equipe" }}>Equipe Doctor Creator</Link><Link to="/login" search={{ acesso: "admin" }}>Administrativo</Link></nav></footer>
    </div>
  );
}

function IntelligenceCover() {
  return <aside className="nx-intelligence-cover" aria-label="Demonstração da inteligência comercial do Nexo"><div className="nx-cover-heading"><span>NEXO / INTELIGÊNCIA COMERCIAL</span><span>POR DENTRO DA PLATAFORMA</span></div><div className="nx-hero-screen"><img src="/product-previews/nexo.jpg" width={1440} height={960} fetchPriority="high" alt="Demonstração da auditoria comercial: origem dos agendamentos e experimento de melhoria do atendimento." /></div><div className="nx-hero-insight"><span>Uma situação que o Nexo ajuda a investigar</span><p>O CRM diz “preço”. A conversa pode mostrar uma dúvida que ficou sem resposta.</p><a className="nx-text-link" href="#ferramenta">Ver a análise por dentro<ArrowRight size={15} aria-hidden /></a></div><div className="nx-cover-footer"><span>Interface real · dados fictícios</span><span>Visão da equipe Doctor Creator</span></div></aside>;
}

function ProgramCover() {
  return <aside className="nx-intelligence-cover nx-sap-cover" aria-label="Demonstração da plataforma SAP"><div className="nx-cover-heading"><span>SAP / AQUISIÇÃO DE PACIENTES</span><span>DOCTOR CREATOR</span></div><a className="nx-hero-screen" href="#ferramenta" aria-label="Explorar as telas do SAP"><img src="/product-previews/sap.jpg" width={1440} height={960} fetchPriority="high" alt="Plataforma SAP: indicadores da clínica comparados ao ponto de partida, fase da implantação e próxima reunião. Dados fictícios." /></a><div className="nx-hero-insight"><span>Um plano que você consegue acompanhar</span><p>Você vê o que foi implantado, o que mudou nos indicadores e o que precisa de ajuste.</p><a className="nx-text-link" href="#ferramenta">Ver como acompanhar a implantação<ArrowRight size={15} aria-hidden /></a></div><div className="nx-cover-footer"><span>Interface real · dados fictícios</span><span>Visão da clínica</span></div></aside>;
}
