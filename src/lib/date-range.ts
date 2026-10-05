export type RangePreset = "mes_atual" | "7d" | "30d" | "90d" | "180d" | "365d" | "personalizado";

export interface DateRangeState {
  preset: RangePreset;
  from?: string;
  to?: string;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "mes_atual", label: "Este mês" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "180d", label: "Últimos 6 meses" },
  { value: "365d", label: "Último ano" },
  { value: "personalizado", label: "Personalizado" },
];

// Data local (não UTC): toISOString() virava o "hoje" para amanhã a partir das 21h no
// Brasil, deslocando o período inteiro um dia à noite.
function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

// Sempre resolve pra um intervalo concreto {start, end} — "personalizado" sem
// from/to ainda preenchidos cai de volta em 90 dias, pra nunca disparar uma
// query com bound indefinido.
export function resolveDateRange(state: DateRangeState): { start: string; end: string } {
  const today = new Date();
  if (state.preset === "personalizado" && state.from && state.to) {
    return { start: state.from, end: state.to };
  }
  if (state.preset === "mes_atual") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: toISODate(start), end: toISODate(end) };
  }
  const days = state.preset === "7d" ? 7 : state.preset === "30d" ? 30 : state.preset === "180d" ? 180 : state.preset === "365d" ? 365 : 90;
  // "Últimos N dias" são N dias contando hoje (antes eram N+1: "7 dias" somava 8).
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { start: toISODate(start), end: toISODate(today) };
}

export function formatRangeLabel(range: { start: string; end: string }): string {
  const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
  return `${fmt(range.start)} a ${fmt(range.end)}`;
}
