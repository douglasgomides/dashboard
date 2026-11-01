/**
 * O "dia" das métricas diárias do Instagram é o dia da Califórnia (America/Los_Angeles), não o de Brasília.
 *
 * Cuidado com o horário de verão dos EUA: a meia-noite da Califórnia é 07:00 UTC no verão (PDT, UTC-7) e 08:00 UTC
 * no inverno (PST, UTC-8). Por isso NÃO se pode partir da meia-noite de hoje e voltar k×24h: quando o horário muda
 * (1º domingo de novembro e 2º domingo de março), todos os dias do outro lado da mudança ficam com a janela deslocada
 * em 1 hora e a Meta devolve o dia vizinho. Foi o que aconteceu em 01/11/2026: os dias 24 a 30/10 foram gravados com
 * os números de 25 a 31/10. Aqui cada data tem a sua própria meia-noite, calculada com o fuso daquela data, e o dia
 * termina na meia-noite do dia seguinte (o dia da mudança tem 25 ou 23 horas).
 */
export const FUSO_META = "America/Los_Angeles";

const fmtData = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_META, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO_META, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Data (AAAA-MM-DD) na Califórnia do instante dado. */
export const laData = (ms: number): string => fmtData.format(new Date(ms));

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Instante UTC (ms) da meia-noite da Califórnia na data AAAA-MM-DD, com o fuso DAQUELA data.
 * A meia-noite sempre existe na Califórnia (a mudança de horário é às 2h), então um dos dois candidatos bate.
 */
export function laMeiaNoiteMs(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  for (const horas of [7, 8]) {
    const t = Date.UTC(a, m - 1, d, horas);
    if (laData(t) === data && fmtHora.format(new Date(t)) === "00:00") return t;
  }
  throw new Error(`Meia-noite da Califórnia não encontrada para ${data}`);
}

/** Janela de UM dia da Meta, em segundos UTC: do início do dia até 1 segundo antes do dia seguinte. */
export function janelaDoDia(data: string): { data: string; since: number; until: number } {
  const since = Math.floor(laMeiaNoiteMs(data) / 1000);
  const until = Math.floor(laMeiaNoiteMs(somarDias(data, 1)) / 1000) - 1;
  return { data, since, until };
}

/** Data da Califórnia k dias antes de hoje (k=0 é hoje), contando dias de calendário. */
export const laDiasAtras = (k: number, agoraMs = Date.now()): string => somarDias(laData(agoraMs), -k);
