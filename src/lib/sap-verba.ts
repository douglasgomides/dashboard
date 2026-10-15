// SAP · verba de mídia combinada (03.07 seção 5, 05.01, 05.11, 01.02 §1.2). Lógica pura (teste: scripts/test-sap-verba.ts).
// - Verba mensal combinada na Sessão 3, paga pela clínica direto às plataformas, a partir do dia em que os anúncios sobem.
// - Previsto até ontem = verba mensal ÷ 30,4 × dias desde a subida. Gasto real vem da Meta (meta_ads_daily).
// - Verba em dia (condição da garantia): gasto acumulado ≥ 80% do previsto. Abaixo disso, a amostra que faltar conta como
//   "não avaliável" na garantia, e não como "não melhorou".
// - Ritmo da semana (05.11): gasto dos últimos 7 dias dentro de ±20% do previsto.

export interface AvaliacaoVerba {
  previstoMes: number;
  previsto90: number | null; // da subida até o D90
  dias: number; // dias com anúncio até ontem
  previstoAcumulado: number;
  gastoAcumulado: number;
  pctAcumulado: number | null;
  emDia: boolean | null; // null = anúncios ainda não subiram
  semana: { previsto: number; gasto: number; razao: number | null; ok: boolean | null };
  texto: string;
}

const DIA_MES = 30.4;
const entre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function avaliarVerba(args: { verbaMensal: number; subida: string | null; d90: string | null; ontem: string; gastoPorDia: Map<string, number> }): AvaliacaoVerba {
  const porDia = args.verbaMensal / DIA_MES;
  const previsto90 = args.subida && args.d90 ? Math.max(0, entre(args.subida, args.d90) + 1) * porDia : null;
  if (!args.subida || args.subida > args.ontem) {
    return { previstoMes: args.verbaMensal, previsto90, dias: 0, previstoAcumulado: 0, gastoAcumulado: 0, pctAcumulado: null, emDia: null, semana: { previsto: 0, gasto: 0, razao: null, ok: null }, texto: "Anúncios ainda não subiram: a verba começa a contar no dia da subida." };
  }
  const dias = entre(args.subida, args.ontem) + 1;
  let gastoAcumulado = 0;
  let gasto7 = 0;
  const ini7 = new Date(`${args.ontem}T12:00:00Z`);
  ini7.setUTCDate(ini7.getUTCDate() - 6);
  const d7 = ini7.toISOString().slice(0, 10);
  for (const [d, v] of args.gastoPorDia) {
    if (d < args.subida || d > args.ontem) continue;
    gastoAcumulado += v;
    if (d >= d7) gasto7 += v;
  }
  const previstoAcumulado = dias * porDia;
  const pct = previstoAcumulado > 0 ? gastoAcumulado / previstoAcumulado : null;
  const prev7 = Math.min(7, dias) * porDia;
  const razao = prev7 > 0 ? gasto7 / prev7 : null;
  const emDia = pct === null ? null : pct >= 0.8;
  const okSemana = razao === null ? null : razao >= 0.8 && razao <= 1.2;
  const texto = emDia
    ? `Verba em dia: ${brl(gastoAcumulado)} de ${brl(previstoAcumulado)} previstos desde a subida (${Math.round((pct ?? 0) * 100)}%).`
    : `Verba abaixo do combinado: ${brl(gastoAcumulado)} de ${brl(previstoAcumulado)} previstos (${Math.round((pct ?? 0) * 100)}%). KPI sem amostra por falta de verba conta como "não avaliável" na garantia.`;
  return { previstoMes: args.verbaMensal, previsto90, dias, previstoAcumulado, gastoAcumulado, pctAcumulado: pct, emDia, semana: { previsto: prev7, gasto: gasto7, razao, ok: okSemana }, texto };
}
