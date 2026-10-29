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
} as const;
