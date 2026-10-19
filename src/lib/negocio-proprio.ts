// Contas do próprio negócio da Doctor Creator (Doctor Creator e Douglas Gomides). Não são consultório: ninguém
// precisa de login de "médico" e o funil da Clint é de venda de curso, não de consulta agendada.
// Por isso o painel não cobra "Médico sem login" nem "marcar a etapa de consulta agendada" dessas contas.
export const CLIENTES_NEGOCIO_PROPRIO: ReadonlySet<string> = new Set([
  "0ef2c738-1961-4a90-b347-d1d45ac8098c", // Doctor Creator
  "ba5231d4-a973-47da-9018-82af6c5a5661", // Douglas Gomides
]);

export const ehNegocioProprio = (clientId: string): boolean => CLIENTES_NEGOCIO_PROPRIO.has(clientId);
