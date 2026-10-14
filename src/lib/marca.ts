// Marca e endereços. O software é o "Doctor Creator Hub" (para todos os clientes); o Sistema de Aquisição de
// Pacientes é o programa de 90 dias que aparece como uma área dentro dele. O endereço sap.* abre o mesmo
// sistema, com a entrada e a página inicial voltadas ao SAP.
export const NOME_PRODUTO = "Doctor Creator Hub";

export function ehEnderecoSap(host: string = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  return /^sap\./i.test(host);
}
