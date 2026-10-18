// Scope verified against SAP v2: 01.01 (offer), 05.07 (recording), 05.15 (campaign destinations).
// Counts describe the contracted programme, not additional software features.
export const SAP_DELIVERABLES = [
  {
    title: "Diagnóstico da aquisição e plano de 90 dias",
    purpose: "Uma leitura do ponto de partida, com prioridades e metas para orientar a implantação.",
    items: [
      "Raio-X do funil com os números de partida da clínica.",
      "Identificação dos 3 principais pontos de perda de pacientes.",
      "Relatório de diagnóstico e plano de ação com prioridades.",
      "De 3 a 5 metas operacionais para acompanhar até o D90.",
    ],
  },
  {
    title: "Paciente ideal e proposta de valor",
    purpose: "Clareza sobre qual serviço crescer, quem você quer atrair e por que esse paciente escolheria sua clínica.",
    items: [
      "Escolha do serviço prioritário com critérios comerciais e capacidade da clínica.",
      "Perfil do paciente ideal para esse serviço.",
      "Proposta de valor escrita e adaptada para anúncio, WhatsApp e consulta.",
    ],
  },
  {
    title: "18 criativos editados para anúncios",
    purpose: "Da ideia ao anúncio pronto: roteiro, direção da gravação e edição feitos com a Doctor Creator.",
    items: [
      "Pauta e roteiros preparados pela Doctor Creator.",
      "Gravação no celular do médico, dirigida ao vivo por videochamada, de 60 a 90 minutos.",
      "18 criativos editados, com variações de abertura para testar.",
      "Banco de criativos sem rosto e seleção de posts para impulsionamento.",
      "Nova gravação por volta do D45 para atualizar os criativos com os aprendizados das campanhas.",
    ],
  },
  {
    title: "Gestão de tráfego durante o programa",
    purpose: "Sua estratégia colocada no ar e acompanhada por uma equipe, com ajustes semanais.",
    items: [
      "Plano de campanhas para Meta Ads e/ou Google Ads, conforme a estratégia, com públicos, objetivos e distribuição da verba.",
      "Configuração e publicação das campanhas aprovadas.",
      "Acompanhamento e ajustes semanais dos anúncios durante os 90 dias.",
      "Ativação prevista entre D28 e D30, após o treino da recepção e os testes de rastreamento.",
    ],
  },
  {
    title: "Rastreamento e qualificação dos interessados",
    purpose: "Mais clareza sobre a origem dos interessados e o avanço até o agendamento, a consulta e a decisão.",
    items: [
      "Configuração e testes de pixel, API de Conversões, tags, UTMs e eventos, conforme os canais e as permissões disponíveis.",
      "Formulário de filtro, pontuação dos interessados e sequência de nutrição.",
      "Destino da campanha preparado conforme a estratégia: WhatsApp, formulário, página de serviço, página de pré-venda ou quiz.",
      "Rotina para registrar agendamento, comparecimento e decisão no CRM ou controle adotado.",
    ],
  },
  {
    title: "Recepção treinada e atendimento organizado",
    purpose: "Uma recepção preparada para responder, conduzir ao agendamento e acompanhar a presença.",
    items: [
      "Script do primeiro contato ao agendamento e mapa de conversa.",
      "Mensagens e rotina de confirmação, preparação e recuperação de faltas.",
      "Treinamento da recepção com simulações: cerca de 4 a 6 horas, em blocos agendados.",
      "Configuração e testes no atendimento escolhido; secretária de IA configurada e testada quando prevista na proposta.",
    ],
  },
  {
    title: "Roteiro de consulta e cadências de follow-up",
    purpose: "Uma apresentação de valor bem preparada e uma rotina para acompanhar quem ainda está decidindo.",
    items: [
      "Roteiro de comunicação consultiva e simulação de consulta.",
      "Material para apresentar o investimento no tratamento.",
      "Banco de objeções e respostas para dúvidas recorrentes.",
      "Mensagens, prazos e responsáveis pelo follow-up, com registro da decisão do paciente.",
    ],
  },
  {
    title: "Fidelização, indicadores e continuidade",
    purpose: "Relacionamento após a consulta e um plano de continuidade sustentado pelos indicadores da clínica.",
    items: [
      "Mensagens e rotinas de retorno, relacionamento e reativação.",
      "Processo de indicação com registro de origem.",
      "Controle do funil e leitura semanal dos indicadores, com ação para o principal ponto de perda.",
      "Relatório de encerramento D90, comparando o ponto de partida e as metas, e playbook de continuidade.",
    ],
  },
] as const;

export const SAP_SESSIONS = [
  ["Diagnóstico e plano de ação", "Onde a clínica está hoje, os principais pontos de perda e o que mudar primeiro."],
  ["Paciente ideal e proposta de valor", "Qual serviço priorizar, quem atrair e como apresentar o valor da clínica."],
  ["Atração e anúncios", "Como campanhas, criativos, verba e rastreamento se conectam à estratégia."],
  ["Conversa e confirmação", "Como conduzir o primeiro contato, preparar o agendamento e reduzir faltas."],
  ["Consulta e follow-up", "Como apresentar o plano de tratamento e acompanhar a decisão do paciente."],
  ["Fidelização, indicações e controle", "Como manter o relacionamento, acompanhar indicações e ler o funil."],
] as const;

export const SAP_SUPPORT = [
  ["Kickoff com Douglas Gomides", "Conversa inicial de 20 a 30 minutos para alinhar a implantação."],
  ["Levantamento do ponto de partida", "Reunião para coletar os dados da clínica e preparar a comparação com a evolução."],
  ["Reunião semanal em grupo", "De 60 a 90 minutos com Douglas Gomides e as outras clínicas."],
  ["Ajustes na fase de otimização", "Check-ins quinzenais, ajustes de anúncios e auditoria das conversas entre D61 e D89."],
  ["Comunidade e suporte da equipe", "Comunidade de clínicas e suporte em dias úteis durante o programa."],
  ["Plataforma para acompanhar a implantação", "Prioridades, cronograma, responsáveis, materiais e indicadores em um ambiente da clínica."],
] as const;
