import { ArrowRight } from "lucide-react";
import { commercialUrl } from "@/lib/product-copy";

// Grounded in agentes-catalogo.ts, the agent output schemas and commercial audit.
// Prepared work is reviewed and executed by people; access follows the contract.
const DELIVERIES = [
  {
    front: "Recuperação de pacientes",
    title: "Quem retomar, por quê e o que dizer.",
    context: "Interesse sem agendamento, dúvida sem resposta e conversas que ficaram sem continuidade. O Nexo identifica oportunidades de retomada a partir do histórico disponível.",
    delivery: "Uma lista priorizada, com mensagem individual preparada e o motivo de cada recomendação.",
    action: "A recepção revisa a mensagem, confere o histórico, completa as informações necessárias e envia pelo WhatsApp da clínica. Os registros ajudam a acompanhar respostas e agendamentos.",
  },
  {
    front: "Gestor de anúncios",
    title: "O próximo ajuste dos seus anúncios.",
    context: "Custo em alta, falta de resultado, desgaste do criativo ou oportunidade de ampliar o investimento. A análise compara o desempenho recente das campanhas.",
    delivery: "Recomendações com números, passos de execução e novas copies quando o caso pede. A leitura de origens e agendamentos complementa a decisão sobre a verba.",
    action: "O gestor avalia a recomendação e aplica as mudanças no Gerenciador de Anúncios.",
  },
  {
    front: "Roteirista de conteúdo",
    title: "Conteúdo com roteiro, legenda e chamada.",
    context: "As dúvidas dos pacientes, as objeções do atendimento e os conteúdos anteriores ajudam a definir o que vale explicar. O posicionamento aprovado da clínica orienta a criação.",
    delivery: "Reels cena a cena ou carrosséis slide a slide, com gancho, legenda e chamada. A peça pode ser copiada ou levada ao planejador.",
    action: "Médico e social media revisam o material, produzem e publicam.",
  },
  {
    front: "Estrategista de campanhas",
    title: "Novas estratégias para atrair, reativar e gerar indicações.",
    context: "O agente relaciona o contexto da clínica, as fontes conectadas, as datas relevantes e os registros das estratégias anteriores para preparar novas propostas.",
    delivery: "Propostas de aquisição e relacionamento com público, canal, abordagem, texto preparado, passos de execução e métrica de acompanhamento.",
    action: "A equipe e a clínica escolhem a proposta, executam e registram o resultado para orientar os próximos ajustes.",
  },
  {
    front: "Auditoria comercial",
    title: "Um diagnóstico para treinar o que importa.",
    context: "O CRM pode registrar “preço”, enquanto a conversa revela uma dúvida sem resposta. O Nexo investiga o caminho entre a procura, o atendimento e o agendamento.",
    delivery: "Objeções, falhas recorrentes, origens dos agendamentos e exemplos de atendimento para sustentar a análise.",
    action: "A equipe escolhe o comportamento a melhorar e pode acompanhar um teste de sete dias com a recepção.",
  },
  {
    front: "Brand Brain",
    title: "O conhecimento aprovado da clínica alimenta os agentes.",
    context: "Posicionamento, audiência, argumentos e aprendizados ficam organizados como referência para o marketing e as vendas da clínica.",
    delivery: "Propostas de conhecimento com fonte e histórico de aprovação, reunidas na memória da clínica.",
    action: "A Doctor Creator revisa e aprova os registros. Esse conteúdo serve de referência para os agentes de recuperação, anúncios, conteúdo e campanhas.",
  },
] as const;

export function NexoDeliveries() {
  return (
    <section className="nx-section nexo-offer" id="metodo" aria-labelledby="nexo-offer-title">
      <div className="nx-section-intro">
        <div><p className="nx-kicker">O que o Nexo entrega</p><h2 id="nexo-offer-title">O trabalho que chega preparado para a sua equipe.</h2></div>
        <p>Cinco frentes agênticas trabalham com os dados e o contexto da clínica. A auditoria comercial aprofunda a leitura do atendimento. Você recebe mensagens, recomendações, roteiros e propostas para revisar, colocar em prática e acompanhar.</p>
      </div>
      <div className="nexo-deliveries">
        {DELIVERIES.map(item => (
          <article key={item.front}>
            <header><p className="nx-eyebrow">{item.front}</p><h3>{item.title}</h3></header>
            <div className="nexo-delivery-body"><p>{item.context}</p><dl><div><dt>Você recebe</dt><dd>{item.delivery}</dd></div><div><dt>Na operação</dt><dd>{item.action}</dd></div></dl></div>
          </article>
        ))}
      </div>
      <div className="nexo-offer-close"><p>As rotinas agênticas e as integrações são definidas na implantação, conforme o escopo contratado. Cada pessoa vê as entregas liberadas para o seu perfil.</p><a className="nx-button nx-button--primary" href={commercialUrl("nexo")}>Quero ver essas entregas na minha clínica<ArrowRight size={17} aria-hidden /></a></div>
    </section>
  );
}
