// Oportunidades: priorização e acompanhamento das ações recomendadas.
//
// A prioridade NUNCA vem de um modelo de linguagem: é uma conta com cinco
// dimensões (0 a 5) e pesos configuráveis, a partir dos campos do Insight, que
// por sua vez vêm de regras determinísticas (src/lib/*). O resultado vai de 0 a 100.
import type { Insight, Responsavel } from "@/lib/insight";

export interface Pesos {
  impacto: number;
  urgencia: number;
  confianca: number;
  facilidade: number;
  alinhamento: number;
}
/** Valores iniciais. Somam 1. Podem ser trocados por cliente (ver `pontuar`). */
export const PESOS_PADRAO: Pesos = { impacto: 0.3, urgencia: 0.25, confianca: 0.2, facilidade: 0.15, alinhamento: 0.1 };

export interface Dimensoes {
  impacto: number;
  urgencia: number;
  confianca: number;
  facilidade: number;
  alinhamento: number;
}

// Facilidade de execução por quem faz: mexer em verba ou postar é rápido;
// conectar fonte ou mudar processo de atendimento leva mais tempo.
const FACILIDADE: Record<Responsavel, number> = {
  gestor_trafego: 4,
  social_media: 4,
  medico: 3,
  atendimento: 3,
  comercial: 3,
  equipe_hub: 2,
};

export function dimensoes(i: Insight, alinhamentoPorArea?: Partial<Record<Insight["area"], number>>): Dimensoes {
  return {
    impacto: i.impacto === "alto" ? 5 : i.impacto === "medio" ? 3 : 1,
    urgencia: i.tom === "ruim" ? 5 : i.tom === "atencao" ? 3 : 1,
    confianca: i.confianca === "alta" ? 5 : i.confianca === "media" ? 3 : 1,
    facilidade: FACILIDADE[i.responsavel] ?? 3,
    alinhamento: alinhamentoPorArea?.[i.area] ?? 3,
  };
}

/** Score de 0 a 100. */
export function pontuar(i: Insight, pesos: Pesos = PESOS_PADRAO, alinhamentoPorArea?: Partial<Record<Insight["area"], number>>): number {
  const d = dimensoes(i, alinhamentoPorArea);
  const total = pesos.impacto + pesos.urgencia + pesos.confianca + pesos.facilidade + pesos.alinhamento || 1;
  const v = (pesos.impacto * d.impacto + pesos.urgencia * d.urgencia + pesos.confianca * d.confianca + pesos.facilidade * d.facilidade + pesos.alinhamento * d.alinhamento) / total;
  return Math.round((v / 5) * 100);
}

export function ordenarPorScore<T extends Insight>(xs: T[], pesos: Pesos = PESOS_PADRAO): T[] {
  return [...xs].sort((a, b) => pontuar(b, pesos) - pontuar(a, pesos));
}

// ---------- estados ----------
export type Status = "nova" | "em_analise" | "em_execucao" | "concluida" | "resultado_avaliado" | "adiada" | "dispensada" | "expirada";

export const ROTULO_STATUS: Record<Status, string> = {
  nova: "Nova",
  em_analise: "Em análise",
  em_execucao: "Em execução",
  concluida: "Concluída",
  resultado_avaliado: "Resultado avaliado",
  adiada: "Adiada",
  dispensada: "Dispensada",
  expirada: "Expirada",
};

/** Transições permitidas. "Resultado avaliado" é separado de "Concluída": só depois de concluir. */
export const TRANSICOES: Record<Status, Status[]> = {
  nova: ["em_analise", "em_execucao", "adiada", "dispensada"],
  em_analise: ["em_execucao", "adiada", "dispensada"],
  em_execucao: ["concluida", "adiada", "dispensada"],
  concluida: ["resultado_avaliado", "em_execucao"],
  resultado_avaliado: [],
  adiada: ["em_analise", "em_execucao", "dispensada"],
  dispensada: ["nova"],
  expirada: ["nova"],
};

export const ABERTOS: Status[] = ["nova", "em_analise", "em_execucao", "adiada"];

export interface EventoHistorico {
  em: string; // ISO
  por: string | null; // e-mail de quem mudou
  de: Status | null;
  para: Status;
  nota?: string;
}

export interface Acompanhamento {
  clientId: string;
  insightId: string;
  titulo: string; // guardado para o histórico continuar legível se o insight sumir
  status: Status;
  responsavel: Responsavel;
  prazo: string | null; // YYYY-MM-DD
  checklist: { texto: string; feito: boolean }[];
  historico: EventoHistorico[];
  feedback: string | null; // a recomendação fez sentido?
  resultado: { avaliacao: "melhorou" | "sem_efeito" | "piorou" | "inconclusivo"; texto: string; em: string } | null;
  criadoEm: string;
  atualizadoEm: string;
}

export function novoAcompanhamento(clientId: string, i: Insight, agora = new Date().toISOString()): Acompanhamento {
  const passos = i.etapas?.length ? i.etapas : i.acao ? [i.acao.texto] : [];
  return {
    clientId,
    insightId: i.id,
    titulo: i.titulo,
    status: "nova",
    responsavel: i.responsavel,
    prazo: null,
    checklist: passos.map((texto) => ({ texto, feito: false })),
    historico: [{ em: agora, por: null, de: null, para: "nova" }],
    feedback: null,
    resultado: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export function mudarStatus(a: Acompanhamento, para: Status, por: string | null, nota?: string, agora = new Date().toISOString()): Acompanhamento {
  if (a.status === para) return a;
  if (!TRANSICOES[a.status].includes(para)) throw new Error(`Não dá para ir de "${ROTULO_STATUS[a.status]}" para "${ROTULO_STATUS[para]}".`);
  return { ...a, status: para, atualizadoEm: agora, historico: [...a.historico, { em: agora, por, de: a.status, para, nota }] };
}

/**
 * Junta os insights do período com o que já está sendo acompanhado.
 * - insight novo sem acompanhamento → status "nova" (não gravado até alguém mexer)
 * - acompanhamento aberto cujo insight não aparece mais no período → "expirada"
 *   (a regra deixou de disparar; o histórico fica)
 */
export function combinar(
  clientId: string,
  insights: Insight[],
  salvos: Acompanhamento[],
  pesos: Pesos = PESOS_PADRAO,
): { insight: Insight | null; acomp: Acompanhamento; score: number | null }[] {
  const porId = new Map(salvos.map((s) => [s.insightId, s]));
  const out: { insight: Insight | null; acomp: Acompanhamento; score: number | null }[] = [];
  for (const i of insights.filter((x) => x.acao)) {
    out.push({ insight: i, acomp: porId.get(i.id) ?? novoAcompanhamento(clientId, i), score: pontuar(i, pesos) });
    porId.delete(i.id);
  }
  for (const s of porId.values()) {
    const acomp = ABERTOS.includes(s.status) ? { ...s, status: "expirada" as Status } : s;
    out.push({ insight: null, acomp, score: null });
  }
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
