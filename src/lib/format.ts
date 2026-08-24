export function fmtNum(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("pt-BR");
}
