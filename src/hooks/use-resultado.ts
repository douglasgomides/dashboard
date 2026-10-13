import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMonthlyMetrics, getPostsForAnalytics, getAdsDiagnosticoPorObjetivo, getAdsPorDia, getWtsResumo, getCrmResumoPeriodo, getCrmLeadsPorDiaPeriodo, getClientFontes } from "@/lib/client-data";
import { getResumoPeriodo } from "@/lib/audiencia";
import { montarResultado } from "@/lib/resultado";

// Leitura do período usada pela Home e por Oportunidades: as duas telas mostram
// exatamente as mesmas recomendações, calculadas uma vez (React Query reaproveita).
export function useResultado(clientId: string, start: string, end: string) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const fim = end > hoje ? hoje : end;
  const diasPeriodo = Math.max(1, Math.round((new Date(fim).getTime() - new Date(start).getTime()) / 86400000) + 1);
  const isoMenosDias = (iso: string, n: number) => new Date(new Date(iso + "T12:00:00Z").getTime() - n * 86400000).toISOString().slice(0, 10);
  const prevEnd = isoMenosDias(start, 1);
  const prevStart = isoMenosDias(start, diasPeriodo);

  const opts = { retry: false, staleTime: 5 * 60_000 } as const;
  const metricas = useQuery({ queryKey: ["monthly-metrics", clientId, start, fim], queryFn: () => getMonthlyMetrics(clientId, start, fim), ...opts });
  const anterior = useQuery({ queryKey: ["monthly-metrics-anterior", clientId, prevStart, prevEnd], queryFn: () => getMonthlyMetrics(clientId, prevStart, prevEnd), ...opts });
  const posts = useQuery({ queryKey: ["posts-analytics", clientId, start, fim], queryFn: () => getPostsForAnalytics(clientId, start, fim), ...opts });
  const periodoIg = useQuery({ queryKey: ["periodo-ig", clientId, start, fim], queryFn: () => getResumoPeriodo(clientId, start, fim), ...opts, staleTime: 20 * 60_000 });
  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId), ...opts });
  const adsDiag = useQuery({ queryKey: ["ads-diag-objetivo", clientId, start, fim], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, start, fim), ...opts });
  const adsDia = useQuery({ queryKey: ["ads-dia", clientId, start, fim], queryFn: () => getAdsPorDia(clientId, start, fim), ...opts });
  const wts = useQuery({ queryKey: ["wts-resumo", clientId, start, fim], queryFn: () => getWtsResumo(clientId, start, fim), ...opts });
  const crm = useQuery({ queryKey: ["crm-resumo", clientId, start, fim], queryFn: () => getCrmResumoPeriodo(clientId, start, fim), ...opts });
  const leadsDia = useQuery({ queryKey: ["crm-leads-dia", clientId, start, fim], queryFn: () => getCrmLeadsPorDiaPeriodo(clientId, start, fim), ...opts });

  const r = useMemo(() => {
    if (!metricas.data) return null;
    return montarResultado({
      start,
      end: fim,
      hoje,
      diario: metricas.data as any[],
      diarioAnterior: (anterior.data as any[]) ?? undefined,
      posts: (posts.data as any[]) ?? [],
      periodoIg: periodoIg.data?.dados ?? null,
      adsDiag: adsDiag.data ?? null,
      adsPorDia: (adsDia.data ?? []).map((a: any) => ({ dia: a.dia, gasto: Number(a.gasto), conversas: Number(a.conversas) })),
      wts: wts.data ?? null,
      crm: crm.data ? { novos: Number(crm.data.novos), ganhos: Number(crm.data.ganhos) } : null,
      leadsPorDia: leadsDia.data?.length ? leadsDia.data.map((l) => ({ dia: l.dia, total: Number(l.total) })) : fontes.data?.tem_crm ? [] : undefined,
      fontes: fontes.data ?? null,
    });
  }, [metricas.data, anterior.data, posts.data, periodoIg.data, adsDiag.data, adsDia.data, wts.data, crm.data, leadsDia.data, fontes.data, start, fim, hoje]);

  return { r, hoje, fim, diasPeriodo, carregando: metricas.isLoading, metricas, anterior, posts, periodoIg, fontes };
}
