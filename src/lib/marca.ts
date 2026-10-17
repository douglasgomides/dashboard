// Nexo e SAP preservam as rotas e identificadores internos existentes.
export const NOME_PRODUTO = "Nexo";

export function ehEnderecoSap(host: string = typeof window === "undefined" ? "" : window.location.hostname): boolean {
  return /^sap\./i.test(host);
}
