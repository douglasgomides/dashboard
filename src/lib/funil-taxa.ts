// Passagem entre etapas de um funil sem taxa falsa.
// 1) Com a etapa de base pequena demais, a passagem vira "N de M", sem %.
// 2) Agendados que são só os ganhos (ninguém do período numa etapa de consulta) não medem agendamento.

import { LIMITES } from "./limites";

/** Unidade da etapa usada como base (denominador) da passagem. */
export type BaseFunil = "leads" | "agendamentos" | "consultas";

export function minimoDaBase(base: BaseFunil): number {
  if (base === "agendamentos") return LIMITES.funil.minAgendamentos;
  if (base === "consultas") return LIMITES.funil.minConsultas;
  return LIMITES.funil.minLeads;
}

export interface Passagem {
  /** Fração 0..1, só quando a base tem o mínimo. */
  taxa: number | null;
  /** "N de M" quando a base é pequena demais para %. */
  fracao: { n: number; m: number } | null;
}

/** Passagem de `n` sobre `m`. Sem base (m <= 0) não há passagem. */
export function passagem(n: number | null | undefined, m: number | null | undefined, base: BaseFunil): Passagem {
  if (n == null || m == null || !(m > 0)) return { taxa: null, fracao: null };
  if (m < minimoDaBase(base)) return { taxa: null, fracao: { n, m } };
  return { taxa: n / m, fracao: null };
}

export const fmtNdeM = (f: { n: number; m: number }) => `${f.n.toLocaleString("pt-BR")} de ${f.m.toLocaleString("pt-BR")}`;

/**
 * Os agendados vêm só dos ganhos: a contagem de agendados é "está numa etapa de consulta OU ganhou".
 * Se ela não passa dos ganhos, ninguém está numa etapa de consulta e o número é a venda repetida.
 */
export function agendadosSaoGanhos(agendados: number | null | undefined, ganhos: number | null | undefined): boolean {
  return agendados != null && ganhos != null && ganhos > 0 && agendados <= ganhos;
}

export function avisoAgendadosSaoGanhos(agendados: number, ganhos: number): string {
  const fmt = (x: number) => x.toLocaleString("pt-BR");
  return `Não medido: os ${fmt(agendados)} agendados do período são os mesmos ${fmt(ganhos)} ganhos. Ninguém do período está numa etapa de consulta agendada, então o CRM não mostra quem agendou e não fechou.`;
}

/** Aviso de tela da mudança de 31/10. */
export const AVISO_MUDANCA_FUNIL =
  "Mudou em 31/10: a % entre etapas só aparece com pelo menos 30 leads, 20 agendamentos ou 15 consultas na etapa de base. Abaixo disso mostramos “N de M”. Quando os agendados são os próprios ganhos, a etapa aparece como não medida.";
