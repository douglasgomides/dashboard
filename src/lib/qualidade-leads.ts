import { LIMITES } from "./limites.js";
// Leitura de "O anúncio trouxe lead bom ou só volume?" (qualidade_leads_campanha, banco).
//
// Auditoria de 30/10/2026: na Dra. Marcella, 14 conversas da Meta eram repartidas entre 680 conversas novas e a tabela
// mostrava "0,9 pessoa avançou", "R$ 330 por lead que avançou" e pintava de verde o "melhor". Agora:
//   - contagem é de pessoas: número inteiro (a estimativa por horário é arredondada);
//   - custo por lead que avançou, "nenhum avançou" e a cor de melhor só aparecem com amostra mínima por campanha;
//   - abaixo disso, a linha diz "amostra pequena".

export const AMOSTRA_MINIMA: number = LIMITES.amostra.anuncios.leadsPorCampanha; // leads ou conversas atribuídas por campanha

export interface LinhaQualidade {
  campaign_id: string;
  gasto: number;
  avancaram: number;
  agendaram: number;
  ganhos: number;
}

export type CustoQualidade =
  | { tipo: "amostra_pequena" }
  | { tipo: "nenhum_avancou" }
  | { tipo: "custo"; valor: number; melhor: boolean };

/** Pessoas inteiras: a estimativa por horário reparte conversas e gera frações. */
export const pessoas = (v: number) => Math.round(Number(v) || 0);

/** Custo por lead que avançou de cada campanha, com a regra de amostra mínima. */
export function custosQualidade<L extends LinhaQualidade>(linhas: L[], base: (l: L) => number): Map<string, CustoQualidade> {
  const custo = (l: L) => (pessoas(l.avancaram) > 0 && l.gasto > 0 ? l.gasto / pessoas(l.avancaram) : null);
  const comAmostra = linhas.filter((l) => pessoas(base(l)) >= AMOSTRA_MINIMA);
  const candidatos = comAmostra.map(custo).filter((v): v is number => v != null);
  // Cor de "melhor" só quando há pelo menos duas campanhas comparáveis.
  const melhor = candidatos.length >= 2 ? Math.min(...candidatos) : null;
  const out = new Map<string, CustoQualidade>();
  for (const l of linhas) {
    if (pessoas(base(l)) < AMOSTRA_MINIMA) out.set(l.campaign_id, { tipo: "amostra_pequena" });
    else if (pessoas(l.avancaram) === 0) out.set(l.campaign_id, { tipo: "nenhum_avancou" });
    else {
      const v = custo(l)!;
      out.set(l.campaign_id, { tipo: "custo", valor: v, melhor: melhor != null && v === melhor });
    }
  }
  return out;
}
