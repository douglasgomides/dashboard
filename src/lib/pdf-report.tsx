import { Document, Page, Text, View, StyleSheet, Link, pdf } from "@react-pdf/renderer";
import {
  computeCasosDestacados,
  computeFormatBreakdown,
  computeFormatInsight,
  computeHeadline,
  computeMelhoresHorarios,
  computeRepetirOuRevisar,
  computeTopPosts,
  fmtFormatKey,
} from "@/lib/report-metrics";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 46, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  eyebrow: { fontSize: 8, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 8 },
  sectionHint: { fontSize: 8, color: "#888", marginBottom: 8, marginTop: -4 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  kpiCard: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10 },
  kpiLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", marginBottom: 3 },
  kpiValue: { fontSize: 15, fontWeight: 700 },
  headline: {
    borderLeftWidth: 3,
    borderLeftColor: "#b8935a",
    backgroundColor: "#faf6ea",
    borderRadius: 4,
    padding: 12,
    marginTop: 14,
    marginBottom: 4,
    lineHeight: 1.5,
    fontSize: 11,
  },
  highlightBox: {
    borderLeftWidth: 3,
    borderLeftColor: "#999",
    backgroundColor: "#f7f7f7",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    lineHeight: 1.5,
  },
  highlightGood: { borderLeftColor: "#3f8f5f", backgroundColor: "#f1f8f3" },
  highlightWarn: { borderLeftColor: "#b8935a", backgroundColor: "#faf6ea" },
  caseBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  caseLabel: { fontSize: 8, fontWeight: 700, color: "#888", textTransform: "uppercase", marginBottom: 4 },
  caseCaption: { fontSize: 9, fontStyle: "italic", color: "#333", marginBottom: 6, lineHeight: 1.4 },
  caseStats: { fontSize: 8, color: "#666" },
  table: { borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  tableRowHeader: { flexDirection: "row", backgroundColor: "#f4f4f4", borderBottomWidth: 1, borderBottomColor: "#ddd" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee" },
  th: { padding: 6, fontSize: 8, fontWeight: 700, color: "#555" },
  td: { padding: 6, fontSize: 9 },
  colWide: { flex: 3 },
  col: { flex: 1, textAlign: "right" as const },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#aaa",
    textAlign: "center" as const,
  },
  pageNum: { position: "absolute", bottom: 18, right: 32, fontSize: 7, color: "#aaa" },
  methodP: { fontSize: 9, lineHeight: 1.5, marginBottom: 8, color: "#333" },
  methodTitle: { fontSize: 9, fontWeight: 700, marginBottom: 2 },
});

function Footer({ page }: { page: number }) {
  return (
    <>
      <Text style={styles.footer} fixed>
        Doctor Creator Intelligence Hub — relatório gerado a partir de dados medidos, sem conteúdo gerado por IA.
      </Text>
      <Text style={styles.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} fixed />
    </>
  );
}

function caseCaption(p: any) {
  const c = (p.caption ?? "").split("\n").find((l: string) => l.trim().length > 0);
  return c ? c.trim().slice(0, 220) : p.windsor_media_id;
}

interface ReportData {
  clientName: string;
  igHandle?: string | null;
  periodLabel: string;
  kpis: { label: string; value: string; hint?: string }[];
  postsForAnalytics: any[];
  postsDoMes: any[];
  trendDays: number;
}

function ClientReportDocument({
  clientName,
  igHandle,
  periodLabel,
  kpis,
  postsForAnalytics,
  postsDoMes,
  trendDays,
}: ReportData) {
  const insight = computeFormatInsight(postsForAnalytics);
  const { ranked: horarios, overallAvg: horaAvg } = computeMelhoresHorarios(postsForAnalytics);
  const formatos = computeFormatBreakdown(postsForAnalytics).sort((a, b) => b.avgEngagement - a.avgEngagement);
  const topPosts = computeTopPosts(postsDoMes, 5);
  const headline = computeHeadline(postsForAnalytics);
  const { repetir, revisar, hasEnough } = computeRepetirOuRevisar(postsDoMes);
  const casos = computeCasosDestacados(postsForAnalytics);
  const temaTags = new Set(postsDoMes.map((p) => p.tema).filter(Boolean)).size;

  return (
    <Document>
      {/* Página 1 — Sumário executivo */}
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

        {headline && (
          <View style={styles.headline}>
            <Text style={{ fontWeight: 700, marginBottom: 2 }}>O achado do período</Text>
            <Text>{headline}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>O que os números dizem</Text>
        <Text style={styles.sectionHint}>Últimos {trendDays} dias — cada ponto abaixo vem de dado medido, não de opinião.</Text>

        {insight && (
          <View style={[styles.highlightBox, styles.highlightGood]}>
            <Text>
              <Text style={{ fontWeight: 700 }}>{fmtFormatKey(insight.best.format)}</Text> é o formato mais forte —
              engajamento médio de {insight.best.avg.toFixed(0)} ({insight.best.count} posts),{" "}
              {insight.bestPct >= 0 ? "+" : ""}
              {insight.bestPct.toFixed(0)}% acima da média geral.
              {insight.worst.format !== insight.best.format &&
                ` ${fmtFormatKey(insight.worst.format)} ficou ${Math.abs(insight.worstPct).toFixed(0)}% abaixo (${insight.worst.count} posts) — vale revisar frequência ou abordagem nesse formato.`}
            </Text>
          </View>
        )}

        {horarios.length > 0 && (
          <View style={styles.highlightBox}>
            <Text>
              O melhor momento pra postar é{" "}
              <Text style={{ fontWeight: 700 }}>
                {horarios[0].weekday} à(o) {horarios[0].period.toLowerCase()}
              </Text>{" "}
              — engajamento médio de {horarios[0].avg.toFixed(0)} em {horarios[0].count} posts,{" "}
              {horaAvg > 0 ? (((horarios[0].avg - horaAvg) / horaAvg) * 100).toFixed(0) : "0"}% acima da média da
              conta.
            </Text>
          </View>
        )}

        {hasEnough ? (
          <View style={[styles.highlightBox, repetir.length > 0 ? styles.highlightGood : styles.highlightWarn]}>
            <Text>
              Entre os temas classificados este mês, {repetir.length > 0 && repetir[0] ? <Text style={{ fontWeight: 700 }}>{repetir[0].tema}</Text> : "nenhum tema"}
              {repetir.length > 0 ? ` performa acima da média (${(repetir[0].rate * 100).toFixed(1)}% de engajamento).` : "."}
              {revisar.length > 0 &&
                ` ${revisar[0].tema} está abaixo (${(revisar[0].rate * 100).toFixed(1)}%) — candidato a revisão.`}
            </Text>
          </View>
        ) : (
          <View style={styles.highlightBox}>
            <Text>
              {temaTags === 0
                ? "Nenhum post deste mês tem tema classificado ainda — classificando pelo menos 3 posts do mesmo assunto na tabela de ranking, o próximo relatório já traz o que repetir e o que revisar por tema."
                : "Ainda não há temas com posts suficientes classificados este mês pra comparar com confiança."}
            </Text>
          </View>
        )}

        <Footer page={1} />
      </Page>

      {/* Página 2 — Casos destacados + detalhamento */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Casos destacados do período</Text>
        {casos ? (
          <>
            <View style={styles.caseBox}>
              <Text style={styles.caseLabel}>Maior alcance</Text>
              <Text style={styles.caseCaption}>"{caseCaption(casos.melhor)}"</Text>
              <Text style={styles.caseStats}>
                {casos.melhor.posted_at && new Date(casos.melhor.posted_at).toLocaleDateString("pt-BR")} · Alcance{" "}
                {(casos.melhor.reach ?? 0).toLocaleString("pt-BR")} · Engajamento{" "}
                {(casos.melhor.engagement ?? 0).toLocaleString("pt-BR")} · Salvos{" "}
                {(casos.melhor.saved ?? 0).toLocaleString("pt-BR")}
              </Text>
              {casos.melhor.permalink && (
                <Link src={casos.melhor.permalink} style={{ fontSize: 8, color: "#b8935a", marginTop: 4 }}>
                  Abrir no Instagram
                </Link>
              )}
            </View>
            <View style={styles.caseBox}>
              <Text style={styles.caseLabel}>Menor alcance</Text>
              <Text style={styles.caseCaption}>"{caseCaption(casos.pior)}"</Text>
              <Text style={styles.caseStats}>
                {casos.pior.posted_at && new Date(casos.pior.posted_at).toLocaleDateString("pt-BR")} · Alcance{" "}
                {(casos.pior.reach ?? 0).toLocaleString("pt-BR")} · Engajamento{" "}
                {(casos.pior.engagement ?? 0).toLocaleString("pt-BR")} · Salvos{" "}
                {(casos.pior.saved ?? 0).toLocaleString("pt-BR")}
              </Text>
              {casos.pior.permalink && (
                <Link src={casos.pior.permalink} style={{ fontSize: 8, color: "#b8935a", marginTop: 4 }}>
                  Abrir no Instagram
                </Link>
              )}
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 9, color: "#888" }}>Posts insuficientes no período pra destacar casos.</Text>
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

        <Footer page={2} />
      </Page>

      {/* Página 3 — Top posts + metodologia */}
      <Page size="A4" style={styles.page}>
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
                  <Text style={[styles.td, { flex: 5 }]}>{caseCaption(p).slice(0, 70)}</Text>
                  <Text style={[styles.td, styles.col]}>{p.reach ?? 0}</Text>
                  <Text style={[styles.td, styles.col]}>{p.engagement ?? 0}</Text>
                  <Text style={[styles.td, styles.col]}>{p.saved ?? 0}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Como este relatório foi feito</Text>
        <Text style={styles.methodTitle}>Fonte dos dados</Text>
        <Text style={styles.methodP}>
          Métricas por post e diárias de conta extraídas da API da Windsor.ai (conectada ao Instagram profissional
          do cliente). Este relatório usa os últimos {trendDays} dias para os cálculos de formato e horário, e o mês
          corrente ({periodLabel}) para o ranking de top posts.
        </Text>
        <Text style={styles.methodTitle}>O que este relatório NÃO inclui</Text>
        <Text style={styles.methodP}>
          Não há atribuição de conversão em paciente real ou venda — isso depende de conexão de CRM, ainda não
          disponível para todos os clientes. "Seguidores gerados por post individual" também não está aqui: a
          Windsor só disponibiliza seguidor ganho por dia da conta inteira, não por post — o mesmo vale para taxa de
          seguidor real por Reels, que exigiria cruzar com export manual do Instagram Insights.
        </Text>
        <Text style={styles.methodTitle}>Limitações</Text>
        <Text style={styles.methodP}>
          "Melhor formato" e "melhor horário" só entram no cálculo com volume mínimo de posts (3 e 2,
          respectivamente) — evita tirar conclusão de um post isolado. O veredito por tema depende de classificação
          manual feita na aba de Ranking; sem isso, essa seção fica vazia por design, não por erro.
        </Text>
        <Text style={styles.methodP}>
          Este relatório não gera conteúdo pronto para publicar — ele mede e aponta direção. A produção continua
          integralmente com o médico ou quem ele contratar.
        </Text>

        <Footer page={3} />
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
