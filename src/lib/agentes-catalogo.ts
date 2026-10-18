// Sistema agêntico da Doctor Creator: a lista única dos agentes que trabalham para cada clínica. Usada pela tela
// "Agentes" (Hub e SAP), pela Central de Agentes e pelo agendamento no servidor (api/_lib/agentes.ts).
// Regra de todos: o agente lê, pensa e prepara; uma pessoa aprova e executa. Nenhum agente envia mensagem a paciente,
// publica conteúdo, mexe em anúncio ou orçamento, nem toma decisão clínica.

export type IdAgente = "brain" | "recuperacao" | "anuncios" | "conteudo" | "campanhas";

export interface AgenteCatalogo {
  id: IdAgente;
  fluxo: string; // id do fluxo no motor
  agente: string; // nome técnico do agente no motor
  nome: string;
  papel: string; // em uma frase, como uma pessoa da equipe
  le: string;
  entrega: string;
  frequencia: string;
  intervaloHoras: number; // o agendamento só enfileira se a última rodada tem mais que isso
  modulo: "brand_brain" | "hub"; // clínicas com este módulo ativo ou em beta
  ondeHub: string; // rota relativa ao cliente
  ondeSap: string | null;
  quemAprova: string;
}

export const AGENTES: AgenteCatalogo[] = [
  {
    id: "recuperacao", fluxo: "recuperacao_pacientes", agente: "recuperacao", nome: "Recuperação de pacientes",
    papel: "A secretária que não deixa ninguém esfriar.",
    le: "Conversas lidas pela auditoria: quem teve interesse e não agendou, quem ficou esperando resposta da clínica.",
    entrega: "Lista do dia com a mensagem individual pronta para cada pessoa, no tom da clínica.",
    frequencia: "Todo dia de manhã", intervaloHoras: 20, modulo: "hub", ondeHub: "atendimento", ondeSap: "agentes#ag-recuperacao",
    quemAprova: "Secretária ou atendimento: revisa, envia pelo WhatsApp da clínica e marca o que aconteceu.",
  },
  {
    id: "anuncios", fluxo: "gestor_anuncios", agente: "anuncios", nome: "Gestor de anúncios",
    papel: "O gestor de tráfego que olha a conta todo dia.",
    le: "Investimento, conversas, leads e frequência de cada campanha na Meta (últimos 7 dias contra os 7 anteriores).",
    entrega: "O que pausar, revisar, trocar o criativo ou escalar, com os números e copies novas prontas.",
    frequencia: "Todo dia de manhã", intervaloHoras: 20, modulo: "hub", ondeHub: "anuncios", ondeSap: "midia",
    quemAprova: "Gestor de tráfego: decide e faz a mudança no Gerenciador de Anúncios. O agente não mexe na conta.",
  },
  {
    id: "conteudo", fluxo: "conteudo_semana", agente: "conteudo", nome: "Roteirista de conteúdo",
    papel: "O roteirista que entrega a semana pronta para gravar.",
    le: "Brand Brain, posts que mais funcionaram, dúvidas reais nos comentários e nas conversas, objeções e datas.",
    entrega: "Roteiros de Reels cena a cena, carrosséis slide a slide, legenda e chamada, prontos para copiar ou levar ao planejador.",
    frequencia: "Toda segunda-feira", intervaloHoras: 6 * 24 + 12, modulo: "hub", ondeHub: "ideias", ondeSap: "agentes#ag-conteudo",
    quemAprova: "Social media e médico: revisam, gravam e publicam.",
  },
  {
    id: "campanhas", fluxo: "campanhas_estrategia", agente: "growth", nome: "Estrategista de campanhas",
    papel: "O estrategista de crescimento.",
    le: "Brand Brain, ficha, conversas, CRM, Instagram, anúncios, datas de saúde e o resultado das estratégias anteriores.",
    entrega: "Estratégias, pacotes de cuidado e abordagens com público, texto pronto, passos e métrica.",
    frequencia: "Toda segunda-feira", intervaloHoras: 6 * 24 + 12, modulo: "hub", ondeHub: "campanhas", ondeSap: "midia",
    quemAprova: "Estrategista e clínica: aprovam, executam e registram o resultado, que volta para o agente.",
  },
  {
    id: "brain", fluxo: "brain_carga", agente: "brand", nome: "Brand Brain",
    papel: "A memória da marca.",
    le: "Ficha, sessões, conversas, mensagens, Instagram e banco de anúncios.",
    entrega: "Itens propostos para a memória da clínica (identidade, audiência, comercial, criativa, decisões).",
    frequencia: "Duas vezes por dia", intervaloHoras: 11, modulo: "brand_brain", ondeHub: "/admin/brain", ondeSap: null,
    quemAprova: "Equipe Doctor Creator aprova cada item na tela Brand Brain. Todos os outros agentes usam só o que foi aprovado.",
  },
];

export const AGENTE_POR_FLUXO: Record<string, AgenteCatalogo> = Object.fromEntries(AGENTES.map((a) => [a.fluxo, a]));
