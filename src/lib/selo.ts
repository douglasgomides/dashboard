// Selo de confiança de cada número de resultado: Confiável, Parcial ou Não dá pra ler, sempre com o motivo.
// As regras de cada número ficam aqui (e os limites em src/lib/limites.ts), para todas as telas lerem igual.

export type NivelSelo = "confiavel" | "parcial" | "ilegivel";

export interface Selo {
  nivel: NivelSelo;
  /** Por que o número tem este selo, em português simples. Vai no tooltip. */
  motivo: string;
}

export const ROTULO_SELO: Record<NivelSelo, string> = {
  confiavel: "Confiável",
  parcial: "Parcial",
  ilegivel: "Não dá pra ler",
};

export const COR_SELO: Record<NivelSelo, string> = {
  confiavel: "var(--good)",
  parcial: "var(--warn)",
  ilegivel: "var(--muted)",
};

/** O pior selo de uma lista: um número feito de partes vale o que vale a parte mais fraca. */
export function piorSelo(selos: Selo[]): Selo {
  const ordem: NivelSelo[] = ["ilegivel", "parcial", "confiavel"];
  for (const nivel of ordem) {
    const s = selos.filter((x) => x.nivel === nivel);
    if (s.length) return { nivel, motivo: s.map((x) => x.motivo).join(" ") };
  }
  return { nivel: "confiavel", motivo: "Todos os dados necessários estão preenchidos." };
}
