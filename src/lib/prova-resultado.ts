// Prova de resultado por clínica (função prova_resultado no banco): compara as últimas 4 semanas com as 4 anteriores
// em atendimento (tempo de resposta, % em até 5 min), conversão (% das conversas comerciais que agendaram) e custo
// (investimento em anúncio por agendamento). É o número que mostra se o trabalho (equipe + agentes) está funcionando.
// "agendou" conta só conversas comerciais que agendaram (subconjunto de "comerciais", migração 20261101100000).
// Se mesmo assim vier agendou > comerciais, é erro de dado: a taxa não é exibida (erro_dado = true).
// Testes: scripts/test-prova-resultado.ts.

export interface SemanaProva { semana: string; conversas: number; comerciais: number; agendou: number; resposta_mediana_s: number | null; respondidas: number; resp_5min: number; investimento: number }
export interface Bloco { semanas: number; conversas: number; comerciais: number; agendou: number; taxa: number | null; resposta_s: number | null; em5: number | null; investimento: number; custo_agendamento: number | null; erro_dado: boolean }

const soma = (xs: SemanaProva[], f: (s: SemanaProva) => number) => xs.reduce((t, s) => t + Number(f(s) ?? 0), 0);

/** Data em que "agendou" passou a ser só das conversas de venda (aviso na tela e docs/notas-de-versao.md). */
export const MUDOU_AGENDOU_EM = "31/10";

/** Taxa numerador/denominador. Numerador maior que o denominador é erro de dado: devolve null, nunca mais de 100%. */
export function taxaContida(numerador: number, denominador: number, minimo = 10): { taxa: number | null; erro_dado: boolean } {
  if (numerador > denominador) return { taxa: null, erro_dado: true };
  return { taxa: denominador >= minimo ? numerador / denominador : null, erro_dado: false };
}

/** Semana com mais agendamentos que conversas de venda (dado inconsistente). */
export const semanaInconsistente = (s: SemanaProva) => Number(s.agendou) > Number(s.comerciais);

export function bloco(xs: SemanaProva[]): Bloco {
  const comerciais = soma(xs, (s) => s.comerciais), agendou = soma(xs, (s) => s.agendou), respondidas = soma(xs, (s) => s.respondidas);
  // Tempo: média das medianas semanais ponderada pelas respondidas (aproximação honesta da mediana do período).
  const comTempo = xs.filter((s) => s.resposta_mediana_s != null && s.respondidas > 0);
  const pesos = soma(comTempo, (s) => s.respondidas);
  const resposta_s = pesos ? Math.round(soma(comTempo, (s) => Number(s.resposta_mediana_s) * s.respondidas) / pesos) : null;
  const investimento = soma(xs, (s) => s.investimento);
  // Qualquer semana com agendou > comerciais contamina o bloco: sem taxa e sem custo, com erro de dado.
  const erro_dado = xs.some(semanaInconsistente);
  const t = taxaContida(agendou, comerciais);
  return {
    semanas: xs.length, conversas: soma(xs, (s) => s.conversas), comerciais, agendou,
    taxa: erro_dado ? null : t.taxa, erro_dado: erro_dado || t.erro_dado,
    resposta_s, em5: respondidas >= 10 ? soma(xs, (s) => s.resp_5min) / respondidas : null,
    investimento: Math.round(investimento * 100) / 100,
    custo_agendamento: !erro_dado && investimento > 0 && agendou >= 3 ? investimento / agendou : null,
  };
}

/** Últimas 4 semanas completas contra as 4 anteriores (a semana corrente, incompleta, fica fora). */
export function compararPeriodos(linhas: SemanaProva[], hojeIso: string, n = 4): { atual: Bloco; anterior: Bloco } {
  const segunda = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const corrente = segunda(new Date(hojeIso));
  const completas = [...linhas].filter((s) => s.semana < corrente).sort((a, b) => a.semana.localeCompare(b.semana));
  return { atual: bloco(completas.slice(-n)), anterior: bloco(completas.slice(-2 * n, -n)) };
}

export type Direcao = "melhor" | "pior" | "igual" | "sem_dado";
/** Direção da mudança (para tempo e custo, menor é melhor). Mudança menor que 10% é "igual". */
export function direcao(atual: number | null, anterior: number | null, menorMelhor = false): Direcao {
  if (atual == null || anterior == null || anterior === 0) return "sem_dado";
  const v = (atual - anterior) / Math.abs(anterior);
  if (Math.abs(v) < 0.1) return "igual";
  return (v < 0) === menorMelhor ? "melhor" : "pior";
}

export function duracaoCurta(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${(s / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${(s / 86_400).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
}
