// SAP · Plano de Ação e Metas (03.07) e Relatório de Encerramento D90 (08.07) gerados pelo painel. Lógica pura
// (teste: scripts/test-sap-documentos.ts). O texto livre (resumo, aprendizados, recomendação, decisão) é da equipe e fica
// em sap_documento_texto; o resto sai dos dados: plano, tracker, cronograma, execução e garantia.

import { CRONOGRAMA, dataDoDia, type Pausa } from "./sap-cronograma";
import { KPIS_PLANO, type KpiPlano, type LinhaPlano } from "./sap-metas";

export type StatusKpiD90 = "atingida" | "melhorou" | "nao_melhorou" | "sem_dado";
export const ROTULO_STATUS_D90: Record<StatusKpiD90, string> = {
  atingida: "Meta atingida",
  melhorou: "Melhorou, abaixo da meta",
  nao_melhorou: "Não melhorou",
  sem_dado: "Sem dado",
};

const MENOR_MELHOR: KpiPlano[] = ["resposta", "custo_consulta"];

/** Regra do 08.07: meta atingida (igual ou melhor que a meta), melhorou (melhor que a baseline), não melhorou (igual ou pior). */
export function statusKpiD90(kpi: KpiPlano, baseline: number | null, meta: number | null, resultado: number | null): StatusKpiD90 {
  if (resultado === null || baseline === null) return "sem_dado";
  const menor = MENOR_MELHOR.includes(kpi);
  const melhorOuIgual = (a: number, b: number) => (menor ? a <= b : a >= b);
  if (meta !== null && melhorOuIgual(resultado, meta)) return "atingida";
  if (menor ? resultado < baseline : resultado > baseline) return "melhorou";
  return "nao_melhorou";
}

export function fmtKpi(kpi: KpiPlano, v: number | null): string {
  if (v === null) return "—";
  const u = KPIS_PLANO.find((k) => k.id === kpi)?.unidade;
  if (u === "pct") return `${Math.round(v * 100)}%`;
  if (u === "min") return `${String(Math.round(v * 10) / 10).replace(".", ",")} min`;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function variacaoKpi(kpi: KpiPlano, baseline: number | null, resultado: number | null): string {
  if (baseline === null || resultado === null) return "—";
  const u = KPIS_PLANO.find((k) => k.id === kpi)?.unidade;
  const d = resultado - baseline;
  if (u === "pct") return `${d >= 0 ? "+" : ""}${Math.round(d * 100)} pontos`;
  if (u === "min") return d <= 0 ? `${fmtKpi(kpi, -d)} mais rápido` : `${fmtKpi(kpi, d)} mais lento`;
  return d <= 0 ? `${fmtKpi(kpi, -d)} menor` : `${fmtKpi(kpi, d)} maior`;
}

export interface LinhaKpiD90 { kpi: KpiPlano; rotulo: string; definicao: string; baseline: number | null; origem: string | null; meta: number | null; resultado: number | null; status: StatusKpiD90; variacao: string; garantia: boolean }

/** Tabela da seção 2 do 08.07 (e seção 1 do 03.07, sem resultado). Só KPIs com baseline ou meta no plano. */
export function linhasKpis(plano: LinhaPlano[], resultado: (k: KpiPlano) => number | null): LinhaKpiD90[] {
  return KPIS_PLANO.filter((k) => k.id !== "receita_mensal")
    .map((k) => {
      const p = plano.find((x) => x.kpi === k.id);
      const r = resultado(k.id);
      return {
        kpi: k.id, rotulo: k.rotulo, definicao: k.definicao, baseline: p?.baseline ?? null, origem: p?.origem ?? null, meta: p?.meta ?? null,
        resultado: r, status: statusKpiD90(k.id, p?.baseline ?? null, p?.meta ?? null, r), variacao: variacaoKpi(k.id, p?.baseline ?? null, r), garantia: !!p?.conta_garantia,
      };
    })
    .filter((l) => l.baseline !== null || l.meta !== null);
}

export interface QuinzenaPlano { id: string; de: string; ate: string; clinica: string[]; dc: string[]; marco: string | null }

/** Plano por quinzena (03.07 seção 3), montado do Cronograma Mestre: o que a clínica faz (itens com a clínica) e o que a DC entrega. */
export function planoPorQuinzena(d0: string, pausas: Pausa[], hoje: string): QuinzenaPlano[] {
  const q: [string, number, number, string | null][] = [
    ["Q1", 0, 15, "Metas assinadas"],
    ["Q2", 16, 30, "Anúncios no ar (D28 a D30)"],
    ["Q3", 31, 45, "Custo por consulta definido (D45)"],
    ["Q4", 46, 60, "D60: sistema completo rodando"],
    ["Q5", 61, 75, null],
    ["Q6", 76, 90, "D90: encerramento"],
  ];
  return q.map(([id, a, b, marco]) => {
    const itens = CRONOGRAMA.filter((i) => i.tipo !== "Recorrente" && i.alvo >= a && i.alvo <= b && i.n !== 1);
    return {
      id, de: dataDoDia(d0, pausas, a, hoje), ate: dataDoDia(d0, pausas, b, hoje), marco,
      clinica: itens.filter((i) => i.clinica).map((i) => i.nome),
      dc: itens.filter((i) => !i.clinica).map((i) => i.nome),
    };
  });
}

/** Riscos padrão do 03.07 (seção 4). */
export const RISCOS_PADRAO: { risco: string; sinal: string; acao: string; quem: string }[] = [
  { risco: "Recepção não liberada para o treino", sinal: "Treino remarcado mais de 1 vez", acao: "Anúncios não sobem até o treino; prazo do D60 é reavaliado e registrado", quem: "Coordenador + decisor" },
  { risco: "Gravação ruim ou atrasada", sinal: "Material inutilizável ou sem data até D22", acao: "Campanha começa com o banco de criativos sem rosto e impulsionamento; nova gravação dirigida em até 7 dias", quem: "Gestor de Tráfego" },
  { risco: "Conta de anúncio bloqueada ou peça reprovada", sinal: "Aviso no Gerenciador", acao: "Editar, pedir revisão humana, nunca usar conta reserva", quem: "Gestor de Tráfego" },
  { risco: "Rastreamento não fecha (fonte de dados restrita na Meta)", sinal: "Eventos de fundo de funil limitados", acao: "Otimizar pelo evento permitido mais alto e medir o resto no painel com UTM e ID do lead", quem: "Gestor de Tráfego" },
  { risco: "CRM não atualizado pela clínica", sinal: "2 semanas sem lançamento", acao: "Check-in extra; o item conta contra o Score de Execução", quem: "Coordenador" },
  { risco: "Decisor ausente nas sessões", sinal: "Sessão sem decisor", acao: "Remarcar o trecho de decisão em até 2 dias úteis", quem: "Coordenador" },
];

/** Seções de texto livre de cada documento, com o que escrever (o painel não inventa número nem resultado). */
export const SECOES_TEXTO = {
  plano: [
    { id: "paciente_atual", titulo: "Paciente ideal: atual", dica: "Quem é, o que procura, como chega, ticket típico hoje." },
    { id: "paciente_desejado", titulo: "Paciente ideal: desejado", dica: "Quem é, o que procura, como chega, ticket típico desejado." },
    { id: "fora_do_foco", titulo: "Fora do foco nos 90 dias", dica: "O que a clínica não vai fazer agora (serviços, canais)." },
    { id: "combinados", titulo: "Combinados", dica: "Verba de mídia por mês a partir do D28, ferramenta de atendimento, horários liberados para treino e auditoria." },
    { id: "riscos_extra", titulo: "Riscos específicos desta clínica", dica: "Férias, mudanças de equipe, agenda do médico." },
  ],
  d90: [
    { id: "resumo", titulo: "1. Resumo executivo", dica: "Escreva por último: de onde a clínica saiu, onde chegou, o maior aprendizado e a recomendação. Número ruim com o mesmo destaque do bom." },
    { id: "funcionou", titulo: "5. O que funcionou", dica: "O quê, por quê e a evidência." },
    { id: "nao_funcionou", titulo: "5. O que não funcionou", dica: "Causa provável, o que foi feito e o dono daqui para frente. Sem culpar a clínica nem a DC." },
    { id: "aprendizados", titulo: "8. Aprendizados", dica: "3 a 4 frases do Condutor." },
    { id: "recomendacao", titulo: "9. Recomendação para os próximos 90 dias", dica: "Prioridade, ação, KPI-alvo, meta sugerida para o D180 e dono." },
    { id: "manutencao", titulo: "10. Proposta de manutenção e decisão", dica: "Valor, o que inclui e o que não inclui (08.06). Decisão da clínica: manutenção ou seguir com o playbook, e a data." },
    { id: "depoimento", titulo: "11. Depoimento e case", dica: "O que a clínica autorizou por escrito e por quanto tempo. Nunca dado de paciente, resultado de tratamento ou antes e depois." },
  ],
} as const;
