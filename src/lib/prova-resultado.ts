// Prova de resultado por clínica (função prova_resultado no banco): compara as últimas 4 semanas com as 4 anteriores
// em atendimento (tempo de resposta, % em até 5 min), conversão (% das conversas comerciais que agendaram) e custo
// (investimento em anúncio por agendamento). É o número que mostra se o trabalho (equipe + agentes) está funcionando.
// Testes: scripts/test-prova-resultado.ts.

export interface SemanaProva { semana: string; conversas: number; comerciais: number; agendou: number; resposta_mediana_s: number | null; respondidas: number; resp_5min: number; investimento: number }
export interface Bloco { semanas: number; conversas: number; comerciais: number; agendou: number; taxa: number | null; resposta_s: number | null; em5: number | null; investimento: number; custo_agendamento: number | null }

const soma = (xs: SemanaProva[], f: (s: SemanaProva) => number) => xs.reduce((t, s) => t + Number(f(s) ?? 0), 0);

export function bloco(xs: SemanaProva[]): Bloco {
  const comerciais = soma(xs, (s) => s.comerciais), agendou = soma(xs, (s) => s.agendou), respondidas = soma(xs, (s) => s.respondidas);
  // Tempo: média das medianas semanais ponderada pelas respondidas (aproximação honesta da mediana do período).
  const comTempo = xs.filter((s) => s.resposta_mediana_s != null && s.respondidas > 0);
  const pesos = soma(comTempo, (s) => s.respondidas);
  const resposta_s = pesos ? Math.round(soma(comTempo, (s) => Number(s.resposta_mediana_s) * s.respondidas) / pesos) : null;
  const investimento = soma(xs, (s) => s.investimento);
  return {
    semanas: xs.length, conversas: soma(xs, (s) => s.conversas), comerciais, agendou,
    taxa: comerciais >= 10 ? agendou / comerciais : null,
    resposta_s, em5: respondidas >= 10 ? soma(xs, (s) => s.resp_5min) / respondidas : null,
    investimento: Math.round(investimento * 100) / 100,
    custo_agendamento: investimento > 0 && agendou >= 3 ? investimento / agendou : null,
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
