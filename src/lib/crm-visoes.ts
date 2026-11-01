import { LIMITES } from "./limites.js";
// Visões comerciais do CRM (RPC crm_visoes_comerciais, migração 20261016090000). Lógica pura
// (teste: scripts/test-crm-visoes.ts).
//
// - Coorte: os leads que ENTRARAM em cada semana e onde estão hoje (atendidos, agendados, ganhos).
//   Semana recente ainda não teve tempo de andar; a taxa só aparece com 20 leads ou mais na semana.
// - Estoque: leads abertos hoje por etapa e há quanto tempo entraram. Os 30 dias são só uma faixa de
//   idade: não há fonte para dizer que lead aberto há mais tempo está perdido (num cliente, 41% dos ganhos
//   saem depois de 30 dias). Por isso a leitura não manda dar lead como perdido pela idade.
// - Movimentos: mudanças de etapa, agendamentos, ganhos e perdas por semana, do histórico gravado a
//   partir da migração (não existe histórico anterior).

export const AMOSTRA_MIN_COORTE: number = LIMITES.amostra.crm.coortePeriodo;

export interface CoorteBruta { semana: string; leads: number; atendidos: number; agendados: number; ganhos: number; perdidos: number; abertos: number }
export interface EtapaEstoque { etapa: string; funil: string | null; entrada: boolean; consulta: boolean; total: number; ate_3: number; de_4_a_7: number; de_8_a_30: number; mais_30: number }
export interface Movimento { semana: string; mudancas: number; agendaram: number; ganhos: number; perdas: number; reabertos: number; leads_mexidos: number }

export interface VisoesComerciais {
  temCrm: boolean;
  coortes: (CoorteBruta & { taxaAtendimento: number | null; taxaAgendamento: number | null; taxaGanho: number | null; pouca: boolean })[];
  estoque: EtapaEstoque[];
  abertos: number;
  movimentos: Movimento[];
  eventosDesde: string | null;
  resumoEstoque: { abertos: number; parados30: number; naEntrada: number; naEntrada7: number; pctParados: number | null };
}

const n = (v: unknown) => Number(v) || 0;

export function lerVisoes(raw: unknown): VisoesComerciais | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const coortes = ((r.coortes ?? []) as any[]).map((c) => {
    const leads = n(c.leads);
    const pouca = leads < AMOSTRA_MIN_COORTE;
    const tx = (v: number) => (pouca || !leads ? null : v / leads);
    return {
      semana: String(c.semana).slice(0, 10), leads, atendidos: n(c.atendidos), agendados: n(c.agendados), ganhos: n(c.ganhos), perdidos: n(c.perdidos), abertos: n(c.abertos),
      taxaAtendimento: tx(n(c.atendidos)), taxaAgendamento: tx(n(c.agendados)), taxaGanho: tx(n(c.ganhos)), pouca,
    };
  });
  const estoque: EtapaEstoque[] = ((r.estoque ?? []) as any[]).map((e) => ({
    etapa: String(e.etapa ?? "(etapa sem nome)"), funil: e.funil ?? null, entrada: !!e.entrada, consulta: !!e.consulta,
    total: n(e.total), ate_3: n(e.ate_3), de_4_a_7: n(e.de_4_a_7), de_8_a_30: n(e.de_8_a_30), mais_30: n(e.mais_30),
  }));
  const movimentos: Movimento[] = ((r.movimentos ?? []) as any[]).map((m) => ({
    semana: String(m.semana).slice(0, 10), mudancas: n(m.mudancas), agendaram: n(m.agendaram), ganhos: n(m.ganhos), perdas: n(m.perdas), reabertos: n(m.reabertos), leads_mexidos: n(m.leads_mexidos),
  }));
  const abertos = n(r.abertos);
  const parados30 = estoque.reduce((a, e) => a + e.mais_30, 0);
  const entrada = estoque.filter((e) => e.entrada);
  return {
    temCrm: !!r.tem_crm,
    coortes,
    estoque,
    abertos,
    movimentos,
    eventosDesde: r.eventos_desde ? String(r.eventos_desde) : null,
    resumoEstoque: {
      abertos,
      parados30,
      naEntrada: entrada.reduce((a, e) => a + e.total, 0),
      naEntrada7: entrada.reduce((a, e) => a + e.de_8_a_30 + e.mais_30, 0),
      pctParados: abertos ? parados30 / abertos : null,
    },
  };
}

/** Frase principal do estoque, em linguagem simples. */
export function leituraDoEstoque(v: VisoesComerciais): string | null {
  const r = v.resumoEstoque;
  if (!r.abertos) return null;
  const partes: string[] = [];
  if (r.pctParados !== null && r.pctParados >= 0.5)
    partes.push(`${Math.round(r.pctParados * 100)}% dos leads abertos entraram há mais de 30 dias. Lead parado há mais tempo ainda pode fechar: em algumas clínicas boa parte das vendas sai depois de 30 dias. Vale revisar esses leads e tentar uma reativação antes de mudar o status.`);
  if (r.naEntrada7 > 0) partes.push(`${r.naEntrada7.toLocaleString("pt-BR")} lead(s) estão na primeira etapa há mais de 7 dias, sem ninguém ter mexido.`);
  return partes.join(" ") || "O estoque está em ordem: poucos leads parados há muito tempo.";
}
