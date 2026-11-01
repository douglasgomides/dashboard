import { LIMITES } from "@/lib/limites";
/**
 * Plano da semana: regras puras (semana, valor em jogo, ordem, textos). Um motor só para o SAP (entrada) e o Nexo
 * (continuidade): o histórico fica na clínica, não no produto. A geração e a conferência ficam em
 * api/_lib/plano-semana.ts; a tela em src/components/plano-semana.tsx.
 */

export type OrigemPlano = "responder" | "recuperar" | "preco" | "anuncio" | "conteudo";
export type EstadoPlano = "proposta" | "feita" | "nao_feita" | "descartada";

/** Taxa padrão de agendamento por ação, usada até a clínica ter histórico suficiente (ver taxaAprendida). */
export const TAXA_PADRAO: Record<"responder" | "recuperar" | "preco", number> = { responder: 0.3, recuperar: 0.15, preco: 0.2 };

export const ROTULO_ORIGEM: Record<OrigemPlano, string> = {
  responder: "Atendimento",
  recuperar: "Recuperação",
  preco: "Preço",
  anuncio: "Anúncios",
  conteudo: "Conteúdo",
};

/** Segunda-feira da semana (horário de Brasília) no formato AAAA-MM-DD. */
export function semanaDe(agora: Date): string {
  const sp = new Date(agora.getTime() - 3 * 3_600_000);
  const dia = sp.getUTCDay();
  const seg = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate() - ((dia + 6) % 7)));
  return seg.toISOString().slice(0, 10);
}

const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

/** Valor em jogo de uma ação com pacientes: n × taxa × ticket. Sem ticket, null (a tela mostra pacientes). */
export function valorEmJogo(n: number, taxa: number, ticket: number | null, aprendida = false): { valor: number | null; calculo: string } {
  const fonte = aprendida ? " (estimativa com o histórico desta clínica)" : " (estimativa padrão até a clínica ter histórico)";
  const base = `${n} paciente(s) × ${Math.round(taxa * 100)}% de chance de agendar${fonte}`;
  if (!ticket || ticket <= 0) return { valor: null, calculo: `${base}. Cadastre o ticket médio para ver em reais.` };
  return { valor: Math.round(n * taxa * ticket), calculo: `${base} × ticket ${brl(ticket)}` };
}

/** Maior valor primeiro; sem valor, por quantidade. No máximo 5 ações. */
export function ordenar<T extends { valor_brl: number | null; n: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => (b.valor_brl ?? -1) - (a.valor_brl ?? -1) || b.n - a.n).slice(0, 5);
}

/** Parte da lista que precisa ter recebido resposta para a ação contar como feita pelos dados. */
export const MINIMO_FEITA: number = LIMITES.amostra.plano.fracaoRespondida;

/**
 * Resultado de uma ação de pacientes: quantos responderam, quantos agendaram, valor gerado. Feita só quando a maior
 * parte da lista (80%) foi atendida; abaixo disso é parcial. Na ação de preço, `respondidas` já vem só com as conversas
 * em que o valor foi de fato apresentado.
 */
export function resultadoConversas(n: number, respondidas: number, agendaram: number, ticket: number | null, origem?: OrigemPlano) {
  const verbo = origem === "preco" ? "receberam o valor" : "receberam resposta";
  return {
    medicao: { n, respondidas, agendaram },
    resultado_brl: ticket ? agendaram * ticket : null,
    resultado_texto: `${respondidas} de ${n} pacientes ${verbo}; ${agendaram} agendaram`,
    feita: n > 0 && respondidas >= Math.ceil(n * MINIMO_FEITA),
  };
}

/** Atendida em parte: alguém recebeu resposta, mas ainda falta a maior parte da lista. */
export function parcial(medicao: Record<string, unknown> | null | undefined): { respondidas: number; n: number } | null {
  const n = Number(medicao?.n ?? 0), r = Number(medicao?.respondidas ?? 0);
  return n > 0 && r > 0 && r < Math.ceil(n * MINIMO_FEITA) ? { respondidas: r, n } : null;
}

/** Dias que uma ação precisa ter para entrar no aprendizado (o paciente leva tempo para agendar). */
export const MATURACAO_DIAS = 14;
/** Pacientes atendidos necessários para trocar a taxa padrão pela da clínica. */
export const MINIMO_ATENDIDOS: number = LIMITES.amostra.crm.atendidosTaxaPropria;

export interface MedicaoHistorico {
  criado_em?: string | null;
  semana?: string | null;
  estado?: string | null;
  medicao?: { n?: number; respondidas?: number; agendaram?: number } | null;
}

/**
 * Taxa aprendida: agendaram ÷ pacientes que receberam resposta, só de ações com alguém atendido, com 14 dias ou mais de
 * acompanhamento, de pelo menos 2 semanas diferentes e com 20 ou mais pacientes atendidos. Quem nunca foi contatado
 * não entra na conta (lista não executada não ensina nada). A taxa da clínica é misturada à padrão com peso de 20
 * pacientes, para um começo ruim não zerar a lista inteira. Sem histórico suficiente, vale a padrão.
 */
export function taxaAprendida(historico: MedicaoHistorico[], padrao: number, agora = Date.now()): { taxa: number; aprendida: boolean } {
  const maduras = historico.filter((h) => h.estado !== "descartada" && Number(h.medicao?.respondidas ?? 0) > 0
    && h.criado_em != null && Date.parse(h.criado_em) <= agora - MATURACAO_DIAS * 86_400_000);
  const atendidos = maduras.reduce((s, h) => s + Number(h.medicao?.respondidas ?? 0), 0);
  const agendaram = maduras.reduce((s, h) => s + Math.min(Number(h.medicao?.agendaram ?? 0), Number(h.medicao?.respondidas ?? 0)), 0);
  const semanas = new Set(maduras.map((h) => h.semana ?? String(h.criado_em).slice(0, 10))).size;
  if (atendidos < MINIMO_ATENDIDOS || semanas < 2) return { taxa: padrao, aprendida: false };
  return { taxa: Math.round(((agendaram + padrao * MINIMO_ATENDIDOS) / (atendidos + MINIMO_ATENDIDOS)) * 1000) / 1000, aprendida: true };
}

/** Estado gravado pela conferência automática. Só mexe no que a equipe não decidiu à mão. */
export function estadoConferido(atual: string, feita: boolean, decididoPelaEquipe: boolean, semanaPassou: boolean): { estado?: EstadoPlano; verificado: boolean } {
  if (feita) return { verificado: true, ...(atual === "proposta" || (atual === "nao_feita" && !decididoPelaEquipe) ? { estado: "feita" as const } : {}) };
  // Antes a conferência marcava feita com 1 paciente atendido; se a evidência não sustenta mais, volta.
  if (atual === "feita" && !decididoPelaEquipe) return { verificado: false, estado: semanaPassou ? "nao_feita" : "proposta" };
  return { verificado: false };
}
