/** Positive money values typed in Brazilian notation; ambiguous/partial text is rejected. */
export function parseTicket(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replaceAll(".", "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Matches parseTicket: do not prefill a decimal dot that is read as a thousands separator. */
export function ticketForInput(value: number | null): string {
  return value !== null && Number.isFinite(value) && value > 0
    ? value.toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "";
}
