import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import {
  computeFormatBreakdown,
  computeFormatInsight,
  computeMelhoresHorarios,
  computeTopPosts,
  fmtFormatKey,
} from "@/lib/report-metrics";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  eyebrow: { fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 18 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 8 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10 },
  kpiLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", marginBottom: 3 },
  kpiValue: { fontSize: 15, fontWeight: 700 },
  insightBox: { borderWidth: 1, borderColor: "#e0d4b8", backgroundColor: "#faf6ea", borderRadius: 6, padding: 10, lineHeight: 1.5 },
  table: { borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  tableRowHeader: { flexDirection: "row", backgroundColor: "#f4f4f4", borderBottomWidth: 1, borderBottomColor: "#ddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee" },
  th: { padding: 6, fontSize: 8, fontWeight: 700, color: "#555" },
  td: { padding: 6, fontSize: 9 },
  colWide: { flex: 3 },
  col: { flex: 1, textAlign: "right" as const },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 7, color: "#aaa", textAlign: "center" as const },
});

interface ReportData {
  clientName: string;
  igHandle?: string | null;
  periodLabel: string;
  kpis: { label: string; value: string; hint?: string }[];
  postsForAnalytics: any[];
  postsDoMes: any[];
}

function ClientReportDocument({ clientName, igHandle, periodLabel, kpis, postsForAnalytics, postsDoMes }: ReportData) {
  const insight = computeFormatInsight(postsForAnalytics);
  const { ranked: horarios } = computeMelhoresHorarios(postsForAnalytics);
  const formatos = computeFormatBreakdown(postsForAnalytics).sort((a, b) => b.avgEngagement - a.avgEngagement);
  const topPosts = computeTopPosts(postsDoMes, 5);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>Doctor Creator Intelligence Hub</Text>
        <Text style={styles.title}>{clientName}</Text>
        <Text style={styles.subtitle}>
          {igHandle ? `@${igHandle} · ` : ""}
          {periodLabel}
        </Text>

        <View style={styles.kpiRow}>
          {kpis.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={styles.kpiValue}>{k.value}</Text>
              {k.hint && <Text style={{ fontSize: 7, color: "#999", marginTop: 2 }}>{k.hint}</Text>}
            </View>
          ))}
        </View>

        {insight && (
          <>
            <Text style={styles.sectionTitle}>O que os números dizem</Text>
            <View style={styles.insightBox}>
              <Text>
                Nos últimos 90 dias, {fmtFormatKey(insight.best.format)} foi o formato mais forte — engajamento
                médio de {insight.best.avg.toFixed(0)} ({insight.best.count} posts),{" "}
                {insight.bestPct >= 0 ? "+" : ""}
                {insight.bestPct.toFixed(0)}% acima da média geral da conta.
                {insight.worst.format !== insight.best.format &&
                  ` ${fmtFormatKey(insight.worst.format)} ficou ${Math.abs(insight.worstPct).toFixed(0)}% abaixo (${insight.worst.count} posts) — vale revisar frequência ou abordagem nesse formato.`}
              </Text>
            </View>
          </>
        )}

        {horarios.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Melhores horários pra postar</Text>
            <View style={styles.table}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, styles.colWide]}>Dia</Text>
                <Text style={[styles.th, styles.colWide]}>Período</Text>
                <Text style={[styles.th, styles.col]}>Posts</Text>
                <Text style={[styles.th, styles.col]}>Engaj. médio</Text>
              </View>
              {horarios.map((r) => (
                <View key={`${r.weekday}-${r.period}`} style={styles.tableRow}>
                  <Text style={[styles.td, styles.colWide]}>{r.weekday}</Text>
                  <Text style={[styles.td, styles.colWide]}>{r.period}</Text>
                  <Text style={[styles.td, styles.col]}>{r.count}</Text>
                  <Text style={[styles.td, styles.col]}>{r.avg.toFixed(0)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {formatos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Engajamento médio por formato</Text>
            <View style={styles.table}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, styles.colWide]}>Formato</Text>
                <Text style={[styles.th, styles.col]}>Posts</Text>
                <Text style={[styles.th, styles.col]}>Engaj. médio</Text>
              </View>
              {formatos.map((f) => (
                <View key={f.formato} style={styles.tableRow}>
                  <Text style={[styles.td, styles.colWide]}>{f.formato}</Text>
                  <Text style={[styles.td, styles.col]}>{f.count}</Text>
                  <Text style={[styles.td, styles.col]}>{f.avgEngagement}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {topPosts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top posts do mês (por salvamentos)</Text>
            <View style={styles.table}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, { flex: 5 }]}>Post</Text>
                <Text style={[styles.th, styles.col]}>Alcance</Text>
                <Text style={[styles.th, styles.col]}>Engaj.</Text>
                <Text style={[styles.th, styles.col]}>Salvos</Text>
              </View>
              {topPosts.map((p) => (
                <View key={p.id} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 5 }]}>
                    {(p.caption ?? p.windsor_media_id ?? "").split("\n")[0].slice(0, 70)}
                  </Text>
                  <Text style={[styles.td, styles.col]}>{p.reach ?? 0}</Text>
                  <Text style={[styles.td, styles.col]}>{p.engagement ?? 0}</Text>
                  <Text style={[styles.td, styles.col]}>{p.saved ?? 0}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.footer}>
          Doctor Creator Intelligence Hub — relatório gerado a partir de dados medidos, sem conteúdo gerado por IA.
        </Text>
      </Page>
    </Document>
  );
}

export async function downloadClientReport(data: ReportData) {
  const blob = await pdf(<ClientReportDocument {...data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = data.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  a.href = url;
  a.download = `relatorio-${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
