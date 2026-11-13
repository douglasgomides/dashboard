// Última clínica aberta naquele navegador (Phase 3, D-02): "Clínica" na casca /admin leva a ela.
// Só o id fica guardado, validado como UUID na leitura e na escrita (T-03-13): valor estranho no armazenamento nunca vira
// link. Armazenamento indisponível (modo privado, cota cheia) não derruba nada: lê null e grava em silêncio.

export const CHAVE_ULTIMA_CLINICA = "nexo:ultima-clinica";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ArmazenamentoSimples = Pick<Storage, "getItem" | "setItem">;

function armazenamentoPadrao(): ArmazenamentoSimples | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function lerUltimaClinica(armazenamento: ArmazenamentoSimples | null = armazenamentoPadrao()): string | null {
  try {
    const valor = armazenamento?.getItem(CHAVE_ULTIMA_CLINICA) ?? null;
    return valor && UUID.test(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function gravarUltimaClinica(id: string, armazenamento: ArmazenamentoSimples | null = armazenamentoPadrao()): void {
  try {
    if (UUID.test(id)) armazenamento?.setItem(CHAVE_ULTIMA_CLINICA, id);
  } catch {
    /* sem storage */
  }
}
