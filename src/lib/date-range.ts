import { hojeBrasilia } from "@/lib/status-fonte";

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

/** Calendar validation also rejects partially typed years and rollover dates. */
export function isValidRangeDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 9998) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseDateRangeSearch(search: Record<string, unknown>): DateRangeState {
  const preset = RANGE_PRESETS.find((item) => item.value === search.preset)?.value ?? "30d";
  if (preset !== "personalizado" || !isValidRangeDate(search.from) || !isValidRangeDate(search.to)) return { preset };
  const today = hojeBrasilia();
  const [from, to] = [search.from, search.to].map((day) => day > today ? today : day).sort();
  return { preset, from, to };
}

// Calendar arithmetic uses noon UTC after resolving the business day in Brazil,
// so a browser in another timezone selects the same reporting period.
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Sempre resolve pra um intervalo concreto {start, end} — "personalizado" sem
// from/to ainda preenchidos cai de volta em 30 dias, pra nunca disparar uma
// query com bound indefinido.
export function resolveDateRange(state: DateRangeState, now: Date = new Date()): { start: string; end: string } {
  const dayInBrazil = hojeBrasilia(now);
  const today = new Date(`${dayInBrazil}T12:00:00Z`);
  if (state.preset === "personalizado" && isValidRangeDate(state.from) && isValidRangeDate(state.to)) {
    const [start, end] = [state.from, state.to].map((day) => day > dayInBrazil ? dayInBrazil : day).sort();
    return { start, end };
  }
  if (state.preset === "mes_atual") {
    // Termina hoje, não no último dia do mês: com o fim no futuro, o "período
    // anterior do mesmo tamanho" virava o mês passado INTEIRO contra um mês pela
    // metade, e todo card mostrava queda que não existiu.
    const start = new Date(`${dayInBrazil.slice(0, 7)}-01T12:00:00Z`);
    return { start: toISODate(start), end: toISODate(today) };
  }
  const days = state.preset === "7d" ? 7 : state.preset === "30d" ? 30 : state.preset === "180d" ? 180 : state.preset === "365d" ? 365 : state.preset === "90d" ? 90 : 30;
  // "Últimos N dias" são N dias contando hoje (antes eram N+1: "7 dias" somava 8).
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: toISODate(start), end: toISODate(today) };
}

export function formatRangeLabel(range: { start: string; end: string }): string {
  const fmt = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
  return `${fmt(range.start)} a ${fmt(range.end)}`;
}
