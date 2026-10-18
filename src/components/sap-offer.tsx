import { Check } from "lucide-react";
import { SAP_DELIVERABLES, SAP_SESSIONS, SAP_SUPPORT } from "@/lib/sap-offer";

export function SapDeliverables() {
  return (
    <section className="nx-section nx-method sap-offer" id="metodo" aria-labelledby="method-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">O que sua clínica recebe</p><h2 id="method-title">O mapa vira campanhas, atendimento preparado e acompanhamento da decisão.</h2></div>
        <p>A clínica participa das decisões. A Doctor Creator prepara os materiais, executa a parte técnica e treina a equipe. Cada entrega abaixo faz parte do caminho entre atrair um paciente com perfil e acompanhar sua decisão.</p>
      </div>
      <div className="sap-delivery-grid">
        {SAP_DELIVERABLES.map((delivery, index) => (
          <article key={delivery.title}>
            <header><span className="nx-serial">0{index + 1}</span><h3>{delivery.title}</h3></header>
            <div className="sap-delivery-detail"><p>{delivery.purpose}</p>
              <ul>{delivery.items.map(item => <li key={item}>{item}</li>)}</ul></div>
          </article>
        ))}
      </div>
      <div className="sap-cost-note"><strong>Gestão de tráfego incluída. Verba de anúncios paga à parte.</strong><p>O investimento nas plataformas, as licenças de CRM ou secretária de IA, a API do WhatsApp e outras ferramentas são apresentados separadamente na proposta. Páginas, quiz e tecnologia de atendimento seguem o caminho definido para a clínica.</p></div>
    </section>
  );
}

export function SapSupport() {
  return (
    <section className="nx-section sap-support" aria-labelledby="sap-support-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">Método com acompanhamento</p><h2 id="sap-support-title">Você tem uma equipe para fazer o plano sair do papel.</h2></div>
        <p>Em cada sessão, uma parte da aquisição é definida e preparada para uso. Entre os encontros, a Doctor Creator produz os materiais, configura as campanhas e acompanha a execução. Você tem suporte para aplicar o plano e entender os números.</p>
      </div>
      <div className="sap-support-columns">
        <div className="sap-session-list"><h3>6 sessões individuais, com entregas definidas</h3><ol>{SAP_SESSIONS.map(([title, description], index) => <li key={title}><span>0{index + 1}</span><div><h4>{title}</h4><p>{description}</p></div></li>)}</ol><p className="sap-session-duration">Sessões de 90 a 120 minutos, conforme a etapa, com participação do decisor e das pessoas envolvidas na execução.</p></div>
        <div className="sap-support-list"><h3>Também faz parte dos 90 dias</h3>{SAP_SUPPORT.map(([title, description]) => <article key={title}><Check size={16} aria-hidden /><div><h4>{title}</h4><p>{description}</p></div></article>)}</div>
      </div>
      <div className="sap-responsibilities">
        <div><h3>Execução da Doctor Creator</h3><p>Diagnóstico, plano, roteiros, direção da gravação, edição dos criativos, configuração e acompanhamento de campanhas, rastreamento, treino da equipe e leitura do funil.</p></div>
        <div><h3>Participação da sua clínica</h3><p>O decisor participa das sessões e aprova os materiais. O médico grava no próprio celular com nossa direção. A recepção treina, atende e mantém os registros. A clínica libera os acessos e paga a verba de mídia e as licenças contratadas.</p></div>
      </div>
    </section>
  );
}
