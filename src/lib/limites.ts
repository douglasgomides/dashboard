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
  /** Conferência diária: contagem do Nexo contra a contagem do CRM ao vivo. */
  conferenciaCrm: {
    /** Acima desta fatia de diferença entre Nexo e CRM, vira alerta. */
    divergenciaMaxima: 0.03,
    /** Diferenças menores que isto (em leads) nunca alertam: são os leads do dia entre uma sincronização e outra. */
    divergenciaMinimaLeads: 30,
  },
} as const;
