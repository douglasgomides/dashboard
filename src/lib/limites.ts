// Todos os limites numéricos das leituras do Nexo (percentuais, dias, minutos) num lugar só.
// Os valores são ponto de partida combinado com a Doctor Creator, não padrão de mercado: ajuste aqui depois de ver
// a carteira. Quem calcula no banco recebe o limite como parâmetro, nunca um número escrito dentro do SQL.

export const LIMITES = {
  /** Retorno do investimento (ROI). */
  roi: {
    /** Fatia mínima dos leads do período com origem preenchida para o ROI aparecer. */
    origemMinima: 0.7,
    /** Fatia mínima das vendas ganhas do período com valor preenchido para o ROI aparecer. */
    valorMinimo: 0.8,
    /** Fatia mínima das vendas ganhas do período com canal conhecido (origem classificada) para o ROI aparecer.
     * Texto de origem que não vira canal (ex.: "Material de isca") e venda sem origem não contam. */
    ganhosComCanalMinimo: 0.7,
    /** Abaixo de tantas vendas vindas de anúncio, o ROI não vira percentual: aparece só a frase em R$. */
    vendasAnuncioMinimas: 5,
    /** A partir de tantas vendas vindas de anúncio, o ROI pode ter confiança alta (Confiável). Abaixo, no máximo Parcial. */
    vendasAnuncioAlta: 15,
  },
  /** Selo de confiança dos números de resultado (Confiável, Parcial, Não dá pra ler). */
  selo: {
    /** Abaixo disto de leads com origem, um número que passou do mínimo fica Parcial em vez de Confiável. */
    origemConfiavel: 0.9,
    /** Abaixo disto de vendas ganhas com valor, o número fica Parcial em vez de Confiável. */
    valorConfiavel: 0.95,
    /** Acima desta fatia do investimento separada por estimativa (sem destino nem meta de otimização), fica Parcial. */
    investimentoEstimadoMaximo: 0,
  },
  /** Fontes preenchidas à mão (planilha semanal do gestor): o dado chega uma vez por semana. */
  planilha: {
    /** Acima de tantos dias sem dado novo, a fonte de planilha conta como parada. Fonte automática: 3 dias. */
    diasParaParada: 10,
  },
  /**
   * Funis (Jornada e Funil comercial): tamanho mínimo da etapa de base para mostrar a passagem em %.
   * Abaixo disso a tela mostra "N de M", sem %. Os mesmos números da amostra do SAP (sap-auto.ts).
   */
  funil: {
    /** Base em leads (ou contatos antes do lead): conversas, entraram, foram atendidos. */
    minLeads: 30,
    /** Base em agendamentos: passagem de agendou para comprou. */
    minAgendamentos: 20,
    /** Base em consultas realizadas: passagem de compareceu para fechou. */
    minConsultas: 15,
  },
  /** Fonte de anúncios automática (Meta): acima de tantos dias sem dado, a conta conta como parada. */
  anuncios: {
    diasSemDadoParaParada: 3,
  },
  /**
   * Amostra mínima de cada leitura (antes espalhada em ~38 constantes pelos arquivos de src/lib; auditoria de
   * 01/11/2026). Os nomes antigos continuam exportados nos arquivos de origem, apontando para cá; o teste
   * scripts/test-tela-honesta.ts falha se aparecer um limite novo fora deste arquivo.
   * Diferenças conhecidas e mantidas até a decisão com a Doctor Creator: a coorte do CRM (crm.coortePeriodo e
   * crm.leadsPeriodo, 20 leads) decide se a leitura usa o período ou a base inteira, enquanto o funil (funil.minLeads,
   * 30) decide se a passagem entre etapas vira %. São perguntas diferentes, por isso os valores não foram igualados.
   * Posts: 5 para a leitura do período (só aponta), 8 para afirmar conclusão de formato ou regra.
   */
  amostra: {
    crm: {
      /** Leads do período para as visões por coorte (crm-visoes.ts). */
      coortePeriodo: 20,
      /** Leads do período para o diagnóstico comercial ler o período; abaixo, usa a base inteira (comercial.ts). */
      leadsPeriodo: 20,
      /** Leads no período para cruzar leads com conteúdo e anúncio (cruzamento.ts). */
      leadsCruzamento: 20,
      /** Leads por origem para entrar no ranking de origens (vendas-origem.ts). */
      leadsRanking: 10,
      /** Leads no período para o relatório comentar o comercial (relatorio-envio.ts). */
      leadsRelatorio: 30,
      /** Cards com procedimento para agrupar orçamentos por tipo (orcamentos-tipo.ts). */
      itensOrcamento: 20,
      /** Pacientes atendidos para trocar a taxa padrão pela da clínica (plano-semana.ts). */
      atendidosTaxaPropria: 20,
    },
    periodo: {
      /** Dias com dado para ler tendência do alcance (leitura-periodo.ts). */
      diasTendencia: 10,
      /** Dias para calcular correlação entre séries (cruzamento.ts). */
      diasCorrelacao: 21,
    },
    conteudo: {
      postsLeitura: 5,
      postsConclusao: 8,
      postsRegras: 8,
      perguntas: 3,
      pessoasIdentificacao: 3,
      postsPorHora: 3,
      topParaPadroes: 8,
      temasRepetir: 3,
      postsAngulo: 5,
      relatorioPostsFormato: 8,
      relatorioPorFormato: 3,
      relatorioPostsTema: 3,
      relatorioPessoasDuvida: 2,
    },
    conversas: {
      esperaMedida: 10,
      diasCruzamento: 5,
      conversasTema: 5,
      ganhosTema: 5,
      comentariosCompra: 20,
      conversasFaixa: 30,
    },
    anuncios: {
      impressoes: 500,
      gasto: 30,
      campanhasRegua: 3,
      impressoesMetade: 1000,
      impressoesTaxa: 1000,
      /** Verba mínima (R$) para uma ação de anúncio ter capacidade. */
      capacidadeReais: 30,
      /** Leads ou conversas atribuídas por campanha (qualidade-leads.ts). */
      leadsPorCampanha: 10,
    },
    benchmark: {
      posts: 3,
      clientes: 3,
    },
    plano: {
      /** Parte da lista que precisa ter recebido resposta para a ação contar como feita pelos dados. */
      fracaoRespondida: 0.8,
    },
  },
  /** Conferência diária: contagem do Nexo contra a contagem do CRM ao vivo. */
  conferenciaCrm: {
    /** Acima desta fatia de diferença entre Nexo e CRM, vira alerta. */
    divergenciaMaxima: 0.03,
    /** Diferenças menores que isto (em leads) nunca alertam: são os leads do dia entre uma sincronização e outra. */
    divergenciaMinimaLeads: 30,
  },
} as const;
