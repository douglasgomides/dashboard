import { Document, Page, Text, View, StyleSheet, Link, pdf } from "@react-pdf/renderer";
import {
  computeCasosDestacados,
  computeFormatBreakdown,
  computeFormatInsight,
  computeHeadline,
  computeMelhoresHorarios,
  computeReachByFormat,
  computeReachByTema,
  computeRepetirOuRevisar,
  computeTopPosts,
  computeTopPostsPorTaxaDeSalvamento,
  computeTopReelsPorTaxaDeCompartilhamento,
  fmtFormatKey,
} from "@/lib/report-metrics";
import { fmtNum } from "@/lib/format";

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
  table: { borderWidth: 1, borderColor: "#ddd", borderRadius: 4, marginBottom: 4 },
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
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 120, fontSize: 8, color: "#555" },
  barTrack: { flex: 1, height: 10, backgroundColor: "#eee", borderRadius: 3, marginHorizontal: 6 },
  barFill: { height: 10, backgroundColor: "#b8935a", borderRadius: 3 },
  barValue: { width: 55, fontSize: 8, textAlign: "right" as const, fontWeight: 700 },
  verdictCol: { flex: 1 },
  verdictLabel: { fontSize: 9, fontWeight: 700, marginBottom: 6 },
  verdictItem: { borderWidth: 1, borderColor: "#ddd", borderRadius: 4, padding: 6, marginBottom: 4 },
  verdictTema: { fontSize: 9, fontWeight: 700 },
  verdictRate: { fontSize: 8, color: "#666", marginTop: 1 },
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

// A fonte padrão do PDF (Helvetica) não tem glifo pra emoji — em vez de
// deixar renderizar como caractere quebrado, remove antes de exibir.
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function stripEmoji(s: string) {
  return s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

function caseCaption(p: any) {
  const c = (p.caption ?? "").split("\n").find((l: string) => l.trim().length > 0);
  return stripEmoji(c ? c.trim().slice(0, 220) : (p.windsor_media_id ?? ""));
}

function BarChartBlock({ rows, maxValue }: { rows: { label: string; value: number }[]; maxValue: number }) {
  return (
    <View style={{ marginBottom: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{r.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${maxValue > 0 ? Math.max(2, (r.value / maxValue) * 100) : 0}%` }]} />
          </View>
          <Text style={styles.barValue}>{fmtNum(r.value)}</Text>
        </View>
      ))}
    </View>
  );
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
  const { ranked: horarios, overallMedian: horaMedian } = computeMelhoresHorarios(postsForAnalytics);
  const formatos = computeFormatBreakdown(postsForAnalytics).sort((a, b) => b.medianEngagement - a.medianEngagement);
  const topPosts = computeTopPosts(postsDoMes, 5);
  const headline = computeHeadline(postsForAnalytics);
  const { repetir, revisar, hasEnough } = computeRepetirOuRevisar(postsForAnalytics, 10);
  const casos = computeCasosDestacados(postsForAnalytics);
  const temaTags = new Set(postsForAnalytics.map((p) => p.tema).filter(Boolean)).size;
  const reachPorFormato = computeReachByFormat(postsForAnalytics);
  const reachPorTema = computeReachByTema(postsForAnalytics).slice(0, 8);
  const maxReachFormato = Math.max(1, ...reachPorFormato.map((r) => r.medianReach));
  const maxReachTema = Math.max(1, ...reachPorTema.map((r) => r.medianReach));
  const topSalvamento = computeTopPostsPorTaxaDeSalvamento(postsForAnalytics, 5);
  const topCompartilhamento = computeTopReelsPorTaxaDeCompartilhamento(postsForAnalytics, 5);

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
              engajamento (mediana) de {fmtNum(Math.round(insight.best.median))} ({insight.best.count} posts),{" "}
              {insight.bestPct >= 0 ? "+" : ""}
              {insight.bestPct.toFixed(0)}% acima da mediana geral.
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
              — engajamento (mediana) de {fmtNum(Math.round(horarios[0].median))} em {horarios[0].count} posts,{" "}
              {horaMedian > 0 ? (((horarios[0].median - horaMedian) / horaMedian) * 100).toFixed(0) : "0"}% acima da
              mediana da conta.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>O que repetir vs. o que revisar</Text>
        <Text style={styles.sectionHint}>
          Calculado pela taxa de engajamento dos temas com volume relevante (10+ posts) nos últimos {trendDays} dias
          — não é opinião, é o que os dados mostraram.
        </Text>

        {hasEnough ? (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={styles.verdictCol}>
              <Text style={[styles.verdictLabel, { color: "#3f8f5f" }]}>REPETIR</Text>
              {repetir.length === 0 && <Text style={{ fontSize: 8, color: "#888" }}>Nenhum tema acima da mediana.</Text>}
              {repetir.map((g) => (
                <View key={g.tema} style={styles.verdictItem}>
                  <Text style={styles.verdictTema}>{g.tema}</Text>
                  <Text style={styles.verdictRate}>
                    {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.verdictCol}>
              <Text style={[styles.verdictLabel, { color: "#b3543f" }]}>REVISAR OU DESCONTINUAR</Text>
              {revisar.length === 0 && <Text style={{ fontSize: 8, color: "#888" }}>Nenhum tema abaixo da mediana.</Text>}
              {revisar.map((g) => (
                <View key={g.tema} style={styles.verdictItem}>
                  <Text style={styles.verdictTema}>{g.tema}</Text>
                  <Text style={styles.verdictRate}>
                    {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.highlightBox}>
            <Text>
              {temaTags === 0
                ? "Nenhum post recente tem tema classificado ainda — classificando pelo menos 10 posts do mesmo assunto na tabela de ranking, o próximo relatório já traz o que repetir e o que revisar por tema."
                : `Ainda não há temas com volume suficiente (10+ posts) nos últimos ${trendDays} dias pra comparar com confiança.`}
            </Text>
          </View>
        )}

        <Footer page={1} />
      </Page>

      {/* Página 2 — Desempenho estrutural + casos destacados */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Desempenho estrutural</Text>
        <Text style={styles.sectionHint}>
          Alcance (mediana) é a base de comparação — decide se um formato/tema vale ser repetido, independente de
          picos isolados.
        </Text>
        {reachPorFormato.length > 0 && (
          <>
            <Text style={{ fontSize: 8, fontWeight: 700, color: "#888", marginBottom: 4 }}>ALCANCE (MEDIANA) POR FORMATO</Text>
            <BarChartBlock
              rows={reachPorFormato.map((r) => ({ label: r.formato, value: r.medianReach }))}
              maxValue={maxReachFormato}
            />
          </>
        )}
        {reachPorTema.length > 0 && (
          <>
            <Text style={{ fontSize: 8, fontWeight: 700, color: "#888", marginBottom: 4 }}>ALCANCE (MEDIANA) POR TEMA</Text>
            <BarChartBlock
              rows={reachPorTema.map((r) => ({ label: r.tema, value: r.medianReach }))}
              maxValue={maxReachTema}
            />
          </>
        )}

        <Text style={styles.sectionTitle}>Casos destacados do período</Text>
        {casos ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={[styles.caseBox, { flex: 1 }]}>
              <Text style={styles.caseLabel}>Maior alcance</Text>
              <Text style={styles.caseCaption}>"{caseCaption(casos.melhor)}"</Text>
              <Text style={styles.caseStats}>
                {casos.melhor.posted_at && new Date(casos.melhor.posted_at).toLocaleDateString("pt-BR")} · Alcance{" "}
                {fmtNum(casos.melhor.reach)} · Engaj. {fmtNum(casos.melhor.engagement)} · Salvos{" "}
                {fmtNum(casos.melhor.saved)}
              </Text>
              {casos.melhor.permalink && (
                <Link src={casos.melhor.permalink} style={{ fontSize: 8, color: "#b8935a", marginTop: 4 }}>
                  Abrir no Instagram
                </Link>
              )}
            </View>
            <View style={[styles.caseBox, { flex: 1 }]}>
              <Text style={styles.caseLabel}>Menor alcance</Text>
              <Text style={styles.caseCaption}>"{caseCaption(casos.pior)}"</Text>
              <Text style={styles.caseStats}>
                {casos.pior.posted_at && new Date(casos.pior.posted_at).toLocaleDateString("pt-BR")} · Alcance{" "}
                {fmtNum(casos.pior.reach)} · Engaj. {fmtNum(casos.pior.engagement)} · Salvos {fmtNum(casos.pior.saved)}
              </Text>
              {casos.pior.permalink && (
                <Link src={casos.pior.permalink} style={{ fontSize: 8, color: "#b8935a", marginTop: 4 }}>
                  Abrir no Instagram
                </Link>
              )}
            </View>
          </View>
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
                <Text style={[styles.th, styles.col]}>Engaj. (mediana)</Text>
              </View>
              {horarios.map((r) => (
                <View key={`${r.weekday}-${r.period}`} style={styles.tableRow}>
                  <Text style={[styles.td, styles.colWide]}>{r.weekday}</Text>
                  <Text style={[styles.td, styles.colWide]}>{r.period}</Text>
                  <Text style={[styles.td, styles.col]}>{r.count}</Text>
                  <Text style={[styles.td, styles.col]}>{fmtNum(Math.round(r.median))}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {formatos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Engajamento (mediana) por formato</Text>
            <View style={styles.table}>
              <View style={styles.tableRowHeader}>
                <Text style={[styles.th, styles.colWide]}>Formato</Text>
                <Text style={[styles.th, styles.col]}>Posts</Text>
                <Text style={[styles.th, styles.col]}>Engaj. (mediana)</Text>
              </View>
              {formatos.map((f) => (
                <View key={f.formato} style={styles.tableRow}>
                  <Text style={[styles.td, styles.colWide]}>{f.formato}</Text>
                  <Text style={[styles.td, styles.col]}>{f.count}</Text>
                  <Text style={[styles.td, styles.col]}>{fmtNum(f.medianEngagement)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Footer page={2} />
      </Page>

      {/* Página 3 — Rankings por taxa + top posts */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Rankings por taxa</Text>
        <Text style={styles.sectionHint}>
          Normaliza por alcance — compara post pequeno com post viral em pé de igualdade, em vez de premiar só quem
          teve mais alcance.
        </Text>
        {topSalvamento.length > 0 && (
          <>
            <Text style={{ fontSize: 8, fontWeight: 700, color: "#888", marginBottom: 4 }}>
              TOP POSTS — MAIOR TAXA DE SALVAMENTO
            </Text>
            {topSalvamento.map(({ post, rate }) => (
              <View key={post.id} style={[styles.caseBox, { padding: 6, marginBottom: 4 }]}>
                <Text style={{ fontSize: 9 }}>{caseCaption(post).slice(0, 90)}</Text>
                <Text style={{ fontSize: 8, color: "#3f8f5f", fontWeight: 700, marginTop: 2 }}>
                  {(rate * 100).toFixed(1)}% de taxa de salvamento
                </Text>
              </View>
            ))}
          </>
        )}
        {topCompartilhamento.length > 0 && (
          <>
            <Text style={{ fontSize: 8, fontWeight: 700, color: "#888", marginTop: 8, marginBottom: 4 }}>
              TOP REELS — MAIOR TAXA DE COMPARTILHAMENTO
            </Text>
            {topCompartilhamento.map(({ post, rate }) => (
              <View key={post.id} style={[styles.caseBox, { padding: 6, marginBottom: 4 }]}>
                <Text style={{ fontSize: 9 }}>{caseCaption(post).slice(0, 90)}</Text>
                <Text style={{ fontSize: 8, color: "#3f8f5f", fontWeight: 700, marginTop: 2 }}>
                  {(rate * 100).toFixed(1)}% de taxa de compartilhamento
                </Text>
              </View>
            ))}
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
                  <Text style={[styles.td, { flex: 5 }]}>{caseCaption(p).slice(0, 70)}</Text>
                  <Text style={[styles.td, styles.col]}>{fmtNum(p.reach)}</Text>
                  <Text style={[styles.td, styles.col]}>{fmtNum(p.engagement)}</Text>
                  <Text style={[styles.td, styles.col]}>{fmtNum(p.saved)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Footer page={3} />
      </Page>

      {/* Página 4 — Metodologia */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Como este relatório foi feito</Text>
        <Text style={styles.methodTitle}>Fonte dos dados</Text>
        <Text style={styles.methodP}>
          Métricas por post e diárias de conta extraídas diretamente do Instagram profissional do cliente. Este
          relatório usa os últimos {trendDays} dias para os cálculos de formato, horário e tema, e o mês corrente (
          {periodLabel}) para o ranking de top posts.
        </Text>
        <Text style={styles.methodTitle}>O que este relatório NÃO inclui</Text>
        <Text style={styles.methodP}>
          Não há atribuição de conversão em paciente real ou venda — isso depende de conexão de CRM, ainda não
          disponível para todos os clientes. "Seguidores gerados por post individual" também não está aqui: a fonte
          de dados só disponibiliza seguidor ganho por dia da conta inteira, não por post — o mesmo vale para taxa de
          seguidor real por Reels, que exigiria cruzar com export manual do Instagram Insights.
        </Text>
        <Text style={styles.methodTitle}>Por que mediana, não média</Text>
        <Text style={styles.methodP}>
          Todo "engajamento" e "alcance" neste relatório é mediana, não média. Um post viral isolado pode inflar a
          média de um formato/tema inteiro em 6 a 10 vezes, dando a impressão de que o post "típico" performa perto
          da média geral — quando na real a maioria fica bem abaixo. Mediana representa melhor o post típico.
        </Text>
        <Text style={styles.methodTitle}>Limitações</Text>
        <Text style={styles.methodP}>
          "Melhor formato" e "melhor horário" só entram no cálculo com volume mínimo de posts (3 e 2,
          respectivamente); o veredito por tema exige 10+ posts classificados no mesmo assunto — limiares maiores
          evitam tirar conclusão de um post isolado. O veredito por tema também depende de classificação manual
          feita na aba de Ranking; sem isso, essa seção fica vazia por design, não por erro.
        </Text>
        <Text style={styles.methodP}>
          Este relatório não gera conteúdo pronto para publicar — ele mede e aponta direção. A produção continua
          integralmente com o médico ou quem ele contratar.
        </Text>

        <Footer page={4} />
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
