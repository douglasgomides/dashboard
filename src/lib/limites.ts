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
  /** Conferência diária: contagem do Nexo contra a contagem do CRM ao vivo. */
  conferenciaCrm: {
    /** Acima desta fatia de diferença entre Nexo e CRM, vira alerta. */
    divergenciaMaxima: 0.03,
    /** Diferenças menores que isto (em leads) nunca alertam: são os leads do dia entre uma sincronização e outra. */
    divergenciaMinimaLeads: 30,
  },
} as const;
