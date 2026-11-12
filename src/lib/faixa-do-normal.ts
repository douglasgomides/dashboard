// A faixa do normal (Phase 03.1.1.1, plano 06, D-01 e D-02): o que é um dia "normal" para ESTA clínica, calculado só com os dias
// da própria clínica. A faixa é o dia do meio (mediana) mais ou menos a distância entre o quartil de baixo e o de cima; o dia fora
// dela é "acima" ou "abaixo". D-02: nenhum número de outra clínica entra aqui, e a função nem recebe dado de fora do período.
// Módulo puro: sem React, sem banco, sem rede. Honestidade (D-05): dia sem dado (null) fica de fora da conta e nunca vira zero, e com
// poucos dias medidos não há faixa (null): a tela diz "Falta dado" em vez de inventar um normal. Reaproveitado pela tela de Anúncios.

/** Dias medidos mínimos para saber o que é normal (duas semanas inteiras de pouca coisa não bastam; uma semana é o piso). */
export const MIN_DIAS_DA_FAIXA = 7;

export interface FaixaDoNormal {
  /** O dia do meio dos dias medidos (mediana, sem arredondar). */
  mediana: number;
  /** Limite de baixo: mediana menos a distância entre os quartis, arredondado e nunca abaixo de zero. */
  lo: number;
  /** Limite de cima: mediana mais a distância entre os quartis, arredondado. */
  hi: number;
  /** Quantos dias medidos entraram na conta. */
  dias: number;
}

export type MarcaDoDia = "acima" | "abaixo" | "normal";

const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Quantil por interpolação linear entre os dois vizinhos (a mesma conta do piloto aprovado). `ordenados` vem em ordem crescente. */
function quantil(ordenados: readonly number[], p: number): number {
  const i = (ordenados.length - 1) * p;
  const baixo = Math.floor(i);
  const alto = Math.min(baixo + 1, ordenados.length - 1);
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (i - baixo);
}

/** A mediana dos dias com valor (null e NaN ficam de fora). null sem nenhum dia medido. Serve para o "dia comum" de qualquer série. */
export function medianaDaSerie(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter(comValor).sort((a, b) => a - b);
  return v.length ? quantil(v, 0.5) : null;
}

/**
 * A faixa do normal da série. Dia sem dado (null) não conta. Menos de `minDias` dias medidos devolve null: sem faixa, a tela diz
 * "Falta dado: poucos dias para saber o normal". Os limites são arredondados para o inteiro (conversas, pessoas) e o de baixo
 * nunca fica negativo.
 */
export function faixaDoNormal(valores: readonly (number | null | undefined)[], opcoes: { minDias?: number } = {}): FaixaDoNormal | null {
  const { minDias = MIN_DIAS_DA_FAIXA } = opcoes;
  const medidos = valores.filter(comValor).sort((a, b) => a - b);
  if (medidos.length === 0 || medidos.length < minDias) return null;
  const mediana = quantil(medidos, 0.5);
  const distancia = quantil(medidos, 0.75) - quantil(medidos, 0.25);
  return { mediana, lo: Math.max(0, Math.round(mediana - distancia)), hi: Math.round(mediana + distancia), dias: medidos.length };
}

/**
 * Para cada dia: "acima" (passou do limite de cima), "abaixo" (ficou sob o de baixo) ou "normal". Dia sem dado é null (buraco), e
 * sem faixa nenhum dia é marcado (tudo null): não há normal para comparar.
 */
export function foraDaFaixa(valores: readonly (number | null | undefined)[], faixa: FaixaDoNormal | null): (MarcaDoDia | null)[] {
  return valores.map((v) => {
    if (!faixa || !comValor(v)) return null;
    return v > faixa.hi ? "acima" : v < faixa.lo ? "abaixo" : "normal";
  });
}
