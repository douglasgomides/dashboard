import type { AdsPlanilhaLinha } from "@/lib/client-data";

/** Só análises datadas do intervalo. Sem valor é ausência, nunca zero. */
export function resumirPlanilha(linhas: readonly Pick<AdsPlanilhaLinha, "analise_em" | "valor_periodo">[], start: string, end: string, hoje: string) {
  const semanas = new Map<string, number[]>();
  for (const l of linhas) {
    if (l.analise_em < start || l.analise_em > end || l.analise_em > hoje) continue;
    const valores = semanas.get(l.analise_em) ?? [];
    if (l.valor_periodo != null && Number.isFinite(Number(l.valor_periodo))) valores.push(Number(l.valor_periodo));
    semanas.set(l.analise_em, valores);
  }
  const medidas = [...semanas].filter(([, valores]) => valores.length > 0);
  return { gasto: medidas.length ? medidas.reduce((total, [, valores]) => total + valores.reduce((a,b) => a+b,0), 0) : null,
    ultima: medidas.map(([dia]) => dia).sort().at(-1) ?? null, analises: medidas.length, semValor: semanas.size - medidas.length };
}
