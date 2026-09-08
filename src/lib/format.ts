export function fmtNum(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR");
}

export function fmtBRL(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
