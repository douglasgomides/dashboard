// SAP · baseline D0, metas D90 e garantia condicionada. Lógica pura (teste: scripts/test-sap-metas.ts).
//
// Fontes das regras:
// - 03.07 · Plano de Ação e Metas dos 90 Dias: como propor a meta D90 de cada KPI;
// - 01.02 · Política de Garantia Condicionada (critério vigente, provisório, de 10/10/2026):
//   a garantia (+30 dias sem custo) vale quando o Score de Execução é ≥ 80% E pelo menos 2 dos 3 KPIs
//   principais NÃO melhoraram em relação à baseline D0, medidos nas últimas 4 semanas (D62 a D89).
//   KPIs principais: 1ª resposta, comparecimento e conversão da consulta (agendamento no lugar da
//   conversão quando a clínica não tem consulta paga). Amostra mínima: 30 qualificados (agendamento),
//   20 agendamentos (comparecimento), 15 consultas (conversão). Amostra não atingida com a verba
//   reduzida/pausada = "não avaliável"; com a verba em dia = "não melhorou".
import { dataDoDia, type Pausa } from "./sap-cronograma";
import type { TrackerAutoBruto } from "@/lib/sap-auto";
import { montarKpisSap } from "@/lib/sap-auto";

export type KpiPlano = "resposta" | "agendamento" | "comparecimento" | "conversao" | "custo_consulta" | "pensando_cadencia" | "receita_mensal";

export const KPIS_PLANO: { id: KpiPlano; rotulo: string; definicao: string; unidade: "min" | "pct" | "brl" }[] = [
  { id: "resposta", rotulo: "Tempo de 1ª resposta", definicao: "Mediana em horário comercial", unidade: "min" },
  { id: "agendamento", rotulo: "Taxa de agendamento", definicao: "Agendamentos ÷ qualificados", unidade: "pct" },
  { id: "comparecimento", rotulo: "Taxa de comparecimento", definicao: "Realizadas ÷ agendadas", unidade: "pct" },
  { id: "conversao", rotulo: "Conversão da consulta", definicao: "Fechados ÷ realizadas", unidade: "pct" },
  { id: "custo_consulta", rotulo: "Custo por consulta realizada", definicao: "Investimento ÷ consultas realizadas", unidade: "brl" },
  { id: "pensando_cadencia", rotulo: "\"Pensando\" em cadência", definicao: "Com cadência ativa ÷ total de \"pensando\"", unidade: "pct" },
  { id: "receita_mensal", rotulo: "Receita atribuída (por mês)", definicao: "Acompanhada, não é meta", unidade: "brl" },
];

export interface LinhaPlano {
  kpi: KpiPlano;
  baseline: number | null;
  origem: "medido" | "estimado" | null;
  amostra: number | null;
  meta: number | null;
  conta_garantia: boolean;
}

export const JANELA_GARANTIA = { de: 62, ate: 89 } as const;
export const AMOSTRA_MIN = { agendamento: 30, comparecimento: 20, conversao: 15 } as const;

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** Janela da baseline: os 30 dias antes do D0 (ou antes de hoje, se o D0 ainda não chegou ou não existe). */
export function janelaBaseline(d0: string | null, hoje: string): { de: string; ate: string } {
  const fim = d0 && d0 <= hoje ? somarDias(d0, -1) : somarDias(hoje, -1);
  return { de: somarDias(fim, -29), ate: fim };
}

/** Janela da garantia (D62 a D89). Antes do D62, mostra a prévia com as últimas 4 semanas fechadas. */
/** Janela da garantia (D62 a D89). Com pausa de prazo, os dias são empurrados (01.02 §5). */
export function janelaGarantia(d0: string, hoje: string, pausas: Pausa[] = []): { de: string; ate: string; previa: boolean } {
  const de = pausas.length ? dataDoDia(d0, pausas, JANELA_GARANTIA.de, hoje) : somarDias(d0, JANELA_GARANTIA.de);
  const ate = pausas.length ? dataDoDia(d0, pausas, JANELA_GARANTIA.ate, hoje) : somarDias(d0, JANELA_GARANTIA.ate);
  if (hoje > ate) return { de, ate, previa: false };
  const ontem = somarDias(hoje, -1);
  if (hoje <= de) return { de: somarDias(ontem, -27), ate: ontem, previa: true };
  return { de, ate: ontem, previa: true };
}

/** Baseline medida pelo tracker automático no período (dias = tamanho da janela, para a receita mensal). */
export function baselineDoTracker(t: TrackerAutoBruto, dias: number): LinhaPlano[] {
  const l = montarKpisSap(t);
  const k = (id: string) => l.kpis.find((x) => x.id === id)!;
  const linha = (kpi: KpiPlano, baseline: number | null, amostra: number | null, estimado = false): LinhaPlano => ({
    kpi,
    baseline,
    origem: baseline === null ? null : estimado ? "estimado" : "medido",
    amostra,
    meta: null,
    conta_garantia: false,
  });
  return [
    linha("resposta", k("resposta").valor, t.resposta_conversas || null),
    linha("agendamento", k("agendamento").valor, t.qualificados || null, !!k("agendamento").estimativa),
    linha("comparecimento", k("comparecimento").valor, t.agendados || null),
    linha("conversao", k("conversao").valor, t.compareceram || null),
    linha("custo_consulta", k("custo_consulta").valor, t.compareceram || null),
    linha("pensando_cadencia", null, null),
    linha("receita_mensal", dias > 0 ? (t.receita * 30) / dias : null, t.fechados || null),
  ];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Meta D90 pela regra do 03.07 (ponto médio de cada faixa). */
export function proporMeta(kpi: KpiPlano, baseline: number | null, consultaPaga = true): { meta: number | null; conta_garantia: boolean; nota: string } {
  const principal = kpi === "resposta" || kpi === "comparecimento" || (consultaPaga ? kpi === "conversao" : kpi === "agendamento");
  switch (kpi) {
    case "resposta":
      if (baseline === null) return { meta: 5, conta_garantia: principal, nota: "Sem baseline: meta de referência (até 5 min)." };
      if (baseline <= 5) return { meta: baseline, conta_garantia: false, nota: "Já abaixo de 5 min: a meta é manter e o KPI sai da garantia (ajuste por escrito)." };
      return { meta: Math.max(5, Math.round(baseline / 2)), conta_garantia: principal, nota: "Reduzir à metade (com recepção dedicada ou Quaddro, ir direto para 5 min)." };
    case "agendamento":
      if (baseline === null) return { meta: null, conta_garantia: principal, nota: "Sem baseline: definir na Sessão 2." };
      if (baseline >= 0.5) return { meta: baseline, conta_garantia: false, nota: "Já em 50% ou mais: manter." };
      return { meta: r2(Math.min(0.5, baseline + 0.1)), conta_garantia: principal, nota: "Baseline + 8 a 15 pontos, sem passar de 50%." };
    case "comparecimento":
      if (baseline === null) return { meta: null, conta_garantia: principal, nota: "Sem baseline: definir na Sessão 2." };
      if (baseline >= 0.85) return { meta: baseline, conta_garantia: false, nota: "Já em 85% ou mais: manter." };
      return { meta: r2(Math.min(0.85, baseline + 0.1)), conta_garantia: principal, nota: "Baseline + 8 a 12 pontos, sem passar de 85%." };
    case "conversao":
      if (baseline === null) return { meta: null, conta_garantia: principal, nota: "Sem baseline: definir na Sessão 2." };
      if (baseline >= 0.5) return { meta: baseline, conta_garantia: false, nota: "Já em 50% ou mais: manter." };
      return { meta: r2(Math.min(0.5, baseline + 0.07)), conta_garantia: principal, nota: "Baseline + 5 a 10 pontos, sem passar de 50% (mais cautela em cirurgia)." };
    case "custo_consulta":
      return { meta: null, conta_garantia: false, nota: "A definir no D45, depois de 2 semanas de anúncio com rastreamento." };
    case "pensando_cadencia":
      return { meta: 0.9, conta_garantia: false, nota: "90% ou mais (é processo, a clínica controla)." };
    case "receita_mensal":
      return { meta: null, conta_garantia: false, nota: "Acompanhada, nunca é meta." };
  }
}

export type ResultadoKpi = "melhorou" | "nao_melhorou" | "nao_avaliavel" | "sem_baseline";

export interface AvaliacaoKpi {
  kpi: KpiPlano;
  resultado: ResultadoKpi;
  atual: number | null;
  motivo: string;
}

export function avaliarKpi(args: {
  kpi: KpiPlano;
  baseline: number | null;
  meta: number | null;
  atual: number | null;
  amostra: number; // qualificados (agendamento), agendados (comparecimento), consultas (conversão), conversas (resposta)
  verbaEmDia: boolean;
}): AvaliacaoKpi {
  const { kpi, baseline, meta, atual, amostra, verbaEmDia } = args;
  if (baseline === null) return { kpi, resultado: "sem_baseline", atual, motivo: "Sem baseline D0 registrada." };
  const min = kpi === "agendamento" ? AMOSTRA_MIN.agendamento : kpi === "comparecimento" ? AMOSTRA_MIN.comparecimento : kpi === "conversao" ? AMOSTRA_MIN.conversao : 0;
  if (atual === null || amostra < min) {
    const falta = min ? `amostra de ${amostra} (mínimo ${min})` : "sem dado na janela";
    return verbaEmDia
      ? { kpi, resultado: "nao_melhorou", atual, motivo: `Não melhorou: ${falta} com a verba combinada em dia.` }
      : { kpi, resultado: "nao_avaliavel", atual, motivo: `Não avaliável: ${falta} com a verba reduzida ou pausada.` };
  }
  const pp = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)} p.p.`;
  switch (kpi) {
    case "resposta": {
      const queda = (baseline - atual) / baseline;
      const ok = queda >= 0.2 || atual < 5;
      return { kpi, resultado: ok ? "melhorou" : "nao_melhorou", atual, motivo: ok ? (atual < 5 ? "Abaixo de 5 min." : `Caiu ${Math.round(queda * 100)}% (mínimo 20%).`) : `Caiu ${Math.round(Math.max(0, queda) * 100)}% e segue acima de 5 min.` };
    }
    case "comparecimento": {
      const d = atual - baseline;
      const ok = d >= 0.05 || atual >= 0.8;
      return { kpi, resultado: ok ? "melhorou" : "nao_melhorou", atual, motivo: ok ? (atual >= 0.8 ? "Em 80% ou mais." : `${pp(d)} (mínimo +5).`) : `${pp(d)} e segue abaixo de 80%.` };
    }
    case "conversao":
    case "agendamento": {
      const d = atual - baseline;
      const bateu = meta !== null && atual >= meta;
      const ok = d >= 0.05 || bateu;
      return { kpi, resultado: ok ? "melhorou" : "nao_melhorou", atual, motivo: ok ? (bateu ? "Bateu a meta D90." : `${pp(d)} (mínimo +5).`) : `${pp(d)} e não bateu a meta.` };
    }
    default:
      return { kpi, resultado: "nao_avaliavel", atual, motivo: "Fora da garantia." };
  }
}

export interface Garantia {
  kpis: AvaliacaoKpi[];
  naoMelhoraram: number;
  score: number | null;
  aplica: boolean | null; // null = falta o Score de Execução
  texto: string;
}

export function kpisDaGarantia(consultaPaga: boolean): KpiPlano[] {
  return ["resposta", "comparecimento", consultaPaga ? "conversao" : "agendamento"];
}

export function avaliarGarantia(args: {
  plano: LinhaPlano[];
  atual: TrackerAutoBruto;
  consultaPaga: boolean;
  verbaEmDia: boolean;
  score: number | null;
}): Garantia {
  const l = montarKpisSap(args.atual);
  const valor = (id: string) => l.kpis.find((x) => x.id === id)?.valor ?? null;
  const amostra: Record<string, number> = {
    resposta: args.atual.resposta_conversas,
    agendamento: args.atual.qualificados,
    comparecimento: args.atual.agendados,
    conversao: args.atual.compareceram,
  };
  const principais = kpisDaGarantia(args.consultaPaga);
  const kpis = principais
    .map((id) => args.plano.find((p) => p.kpi === id) ?? { kpi: id, baseline: null, meta: null, conta_garantia: true, origem: null, amostra: null })
    .filter((p) => p.conta_garantia)
    .map((p) => avaliarKpi({ kpi: p.kpi, baseline: p.baseline, meta: p.meta, atual: valor(p.kpi), amostra: amostra[p.kpi] ?? 0, verbaEmDia: args.verbaEmDia }));
  const naoMelhoraram = kpis.filter((k) => k.resultado === "nao_melhorou").length;
  const indicadores = naoMelhoraram >= 2;
  let aplica: boolean | null;
  let texto: string;
  if (args.score === null) {
    aplica = null;
    texto = indicadores
      ? `${naoMelhoraram} dos KPIs principais não melhoraram. A garantia depende do Score de Execução (≥ 80%), ainda não informado.`
      : `${kpis.length - naoMelhoraram} de ${kpis.length} KPIs principais melhoraram ou não entram: a garantia não se aplica pelos indicadores.`;
  } else if (args.score < 80) {
    aplica = false;
    texto = `Score de Execução de ${Math.round(args.score)}% (abaixo de 80%): a garantia não se aplica.`;
  } else {
    aplica = indicadores;
    texto = indicadores
      ? `Execução de ${Math.round(args.score)}% e ${naoMelhoraram} KPIs principais sem melhora: a garantia se aplica (+30 dias sem custo).`
      : `Execução de ${Math.round(args.score)}% e só ${naoMelhoraram} KPI sem melhora: a garantia não se aplica.`;
  }
  return { kpis, naoMelhoraram, score: args.score, aplica, texto };
}

/** Quinzenas do 03.07 (Q1 a Q6), com as datas a partir do D0. */
export function quinzenas(d0: string): { id: string; de: string; ate: string; marco: string | null }[] {
  const q: [string, number, number, string | null][] = [
    ["Q1", 0, 15, "Metas assinadas (D12 a D14)"],
    ["Q2", 16, 30, "Anúncios no ar (D28 a D30)"],
    ["Q3", 31, 45, "Custo por consulta definido (D45)"],
    ["Q4", 46, 60, "Sistema completo rodando (D60)"],
    ["Q5", 61, 75, "Janela da garantia começa (D62)"],
    ["Q6", 76, 90, "Encerramento (D90)"],
  ];
  return q.map(([id, a, b, marco]) => ({ id, de: somarDias(d0, a), ate: somarDias(d0, b), marco }));
}
