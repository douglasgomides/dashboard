// "Resultados por origem do CRM" (vendas-kommo): resumo em frases e contas de cada linha.
//
// Auditoria de 30/10/2026:
//   - o resumo escolhia "Não informado" como a fonte que mais converte (Doctor Creator: 182 de 388 = 47%). Origem
//     desconhecida não entra no ranking, e o resumo abre com quantos ganhos estão sem origem; acima da metade, diz
//     que ainda não dá para comparar origens;
//   - "Em andamento" era total menos ganhos menos perdidos e somava os cards fechados na origem sem resultado.
import { fmtTaxa } from "@/lib/metricas";
import { LIMITES } from "@/lib/limites";

export const NAO_INFORMADO = "Não informado";
export const MIN_LEADS_RANKING: number = LIMITES.amostra.crm.leadsRanking;
export const MAX_GANHOS_SEM_ORIGEM = 0.5;

export type FunilRow = { chave: string; total: number; ganhos: number; perdidos: number; abertos?: number | null };

/** Cards abertos da linha. Banco sem a coluna: a conta antiga (total menos ganhos e perdidos). */
export function abertosDaLinha(r: FunilRow): number {
  if (r.abertos != null && Number.isFinite(Number(r.abertos))) return Number(r.abertos);
  return r.total - r.ganhos - r.perdidos;
}

/** Fechados na origem sem resultado: nem aberto, nem ganho, nem perdido. */
export function fechadosDaLinha(r: FunilRow): number {
  if (r.abertos == null || !Number.isFinite(Number(r.abertos))) return 0;
  return Math.max(0, r.total - r.ganhos - r.perdidos - Number(r.abertos));
}

/** Todas as linhas são "Não informado": o campo não existe ou não é preenchido no CRM. */
export function soNaoInformado(rows: FunilRow[]): boolean {
  return rows.length > 0 && rows.every((r) => r.chave === NAO_INFORMADO);
}

const int = (v: number) => v.toLocaleString("pt-BR");

/** Resumo em frases: volume, quanto já fechou, quanto dos ganhos está sem origem e qual origem converte mais. */
export function resumoVendas(rows: FunilRow[], total: number): string[] {
  const ganhos = rows.reduce((s, r) => s + r.ganhos, 0);
  const perdidos = rows.reduce((s, r) => s + r.perdidos, 0);
  const abertos = rows.reduce((s, r) => s + abertosDaLinha(r), 0);
  const fechados = rows.reduce((s, r) => s + fechadosDaLinha(r), 0);
  const ganhosSemOrigem = rows.filter((r) => r.chave === NAO_INFORMADO).reduce((s, r) => s + r.ganhos, 0);
  const comOrigem = rows.filter((r) => r.chave !== NAO_INFORMADO);
  const comVolume = comOrigem.filter((r) => r.total >= MIN_LEADS_RANKING);
  const melhor = [...comVolume].sort((a, b) => b.ganhos / b.total - a.ganhos / a.total)[0];
  const maior = [...comOrigem].sort((a, b) => b.total - a.total)[0];
  const pct = (a: number, b: number) => fmtTaxa(a, b);
  const fracSemOrigem = ganhos > 0 ? ganhosSemOrigem / ganhos : 0;
  const frases = [
    `${int(total)} leads no CRM: ${int(ganhos)} ganhos (${pct(ganhos, total)}), ${int(perdidos)} perdidos e ${int(abertos)} ainda em aberto${fechados > 0 ? `; ${int(fechados)} foram fechados no CRM sem dizer se ganharam ou perderam` : ""}.`,
  ];
  if (ganhos > 0) frases.push(`${pct(ganhosSemOrigem, ganhos)} dos ganhos (${int(ganhosSemOrigem)} de ${int(ganhos)}) não têm origem registrada.`);
  if (ganhos > 0 && fracSemOrigem > MAX_GANHOS_SEM_ORIGEM) {
    frases.push("Com mais da metade dos ganhos sem origem, ainda não dá para comparar as origens. Preencher a origem do lead no CRM é o primeiro passo (veja o Guia do CRM).");
    if (maior) frases.push(`Entre os leads com origem, a que mais traz é “${maior.chave}” (${pct(maior.total, total)} do total).`);
    return frases;
  }
  if (maior) frases.push(`A origem que mais traz leads é “${maior.chave}” (${pct(maior.total, total)} do total).`);
  frases.push(
    melhor && melhor.ganhos > 0
      ? `A origem com maior taxa de status ganho é “${melhor.chave}”: ${pct(melhor.ganhos, melhor.total)} dos leads têm esse status. Confirme o significado da etapa antes de interpretar como venda.`
      : `Nenhuma origem com ${MIN_LEADS_RANKING} ou mais leads tem status ganho registrado ainda: confira se o ganho está sendo registrado no CRM.`,
  );
  return frases;
}
