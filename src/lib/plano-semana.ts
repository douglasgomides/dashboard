/**
 * Plano da semana: regras puras (semana, valor em jogo, ordem, textos). Um motor só para o SAP (entrada) e o Nexo
 * (continuidade): o histórico fica na clínica, não no produto. A geração e a conferência ficam em
 * api/_lib/plano-semana.ts; a tela em src/components/plano-semana.tsx.
 */

export type OrigemPlano = "responder" | "recuperar" | "preco" | "anuncio" | "conteudo";
export type EstadoPlano = "proposta" | "feita" | "nao_feita" | "descartada";

/** Taxa padrão de agendamento por ação, usada até a clínica ter 20+ pacientes medidos (aí vale a aprendida). */
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
export function valorEmJogo(n: number, taxa: number, ticket: number | null): { valor: number | null; calculo: string } {
  const aprendida = Object.values(TAXA_PADRAO).includes(taxa) ? " (padrão até a clínica ter histórico)" : " (aprendida nesta clínica)";
  const base = `${n} paciente(s) × ${Math.round(taxa * 100)}% de chance de agendar${aprendida}`;
  if (!ticket || ticket <= 0) return { valor: null, calculo: `${base}. Cadastre o ticket médio para ver em reais.` };
  return { valor: Math.round(n * taxa * ticket), calculo: `${base} × ticket ${brl(ticket)}` };
}

/** Maior valor primeiro; sem valor, por quantidade. No máximo 5 ações. */
export function ordenar<T extends { valor_brl: number | null; n: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => (b.valor_brl ?? -1) - (a.valor_brl ?? -1) || b.n - a.n).slice(0, 5);
}

/** Resultado de uma ação de pacientes: quantos responderam, quantos agendaram, valor gerado. */
export function resultadoConversas(n: number, respondidas: number, agendaram: number, ticket: number | null) {
  return {
    medicao: { n, respondidas, agendaram },
    resultado_brl: ticket ? agendaram * ticket : null,
    resultado_texto: `${respondidas} de ${n} pacientes receberam resposta; ${agendaram} agendaram`,
    feita: respondidas > 0,
  };
}

/** Taxa aprendida: com 20+ pacientes medidos, agendaram/total; senão a padrão. */
export function taxaAprendida(medicoes: { n?: number; agendaram?: number }[], padrao: number): number {
  const n = medicoes.reduce((s, m) => s + (m.n ?? 0), 0);
  const a = medicoes.reduce((s, m) => s + (m.agendaram ?? 0), 0);
  return n >= 20 ? Math.round((a / n) * 1000) / 1000 : padrao;
}
