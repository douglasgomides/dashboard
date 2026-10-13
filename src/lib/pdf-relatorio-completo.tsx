// Relatório COMPLETO em PDF (versão "detalhada" do Relatório). A página 1 segue a mesma
// estrutura validada do WhatsApp e da versão executiva (relatorio-envio.ts): resumo,
// vitórias, atenção, ações, testes e limitações, com a evidência de cada ponto e a
// checagem antes de enviar. Depois vem o detalhamento: tudo que o dashboard calcula, em um
// documento só. Instagram (evolução, formatos, temas, horários, rankings, reels),
// anúncios (diagnóstico por campanha), WhatsApp, CRM, dúvidas, ideias, ações e a
// mensagem pronta para o cliente. Seções sem fonte saem do PDF e viram aviso.
// Tudo é medido ou calculado por regra, nada é gerado por IA.
import { Document, Link, Page, Path, pdf, Svg, Text, View, Line } from "@react-pdf/renderer";
import {
  computeCasosDestacados,
  computeConceitosVencedores,
  computeFormatBreakdown,
  computeFormatInsight,
  computeHeadline,
  computeMelhoresHorarios,
  computeReachByFormat,
  computeReachByTema,
  computeRepetirOuRevisar,
  computeRetencaoDeReels,
  computeTopPosts,
  computeTopPostsPorTaxaDeSalvamento,
  computeTopReelsPorTaxaDeCompartilhamento,
  fmtFormatKey,
} from "@/lib/report-metrics";
import { analyzeFollowers, buildIdeias, fmtDiaBR } from "@/lib/hub-conteudo";
import { fmtBRL, fmtNum } from "@/lib/format";
import { BarChartBlock, Footer, caseCaption, stripEmoji, styles } from "@/lib/pdf-report";
import type { RelatorioCompletoData } from "@/lib/relatorio-completo";
import { GRUPOS } from "@/lib/anuncios-objetivo";
import { NOTA_ALGORITMO_DUVIDAS, SECOES, duvidasRepetidas, type SecaoId } from "@/lib/relatorio-envio";
import { tornarSeguro } from "@/lib/linguagem-cfm";

const GOLD = "#b8935a";
const GREEN = "#3f8f5f";
const RED = "#b3543f";
const AMBER = "#c58b1f";
const GRAY = "#888888";
const LARGURA = 531; // A4 (595) menos 2 x 32 de margem

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function fmtSeg(sec: number | null | undefined): string {
  const s = num(sec);
  if (s <= 0) return "sem dado";
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1).replace(".", ",")} h`;
}

const pct = (n: number, casas = 1) => `${n.toFixed(casas).replace(".", ",")}%`;

function Titulo({ children, dica }: { children: string; dica?: string }) {
  return (
    <View minPresenceAhead={110}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {dica ? <Text style={styles.sectionHint}>{dica}</Text> : null}
    </View>
  );
}

function Subtitulo({ children }: { children: string }) {
  return (
    <Text minPresenceAhead={80} style={{ fontSize: 8, fontWeight: 700, color: GRAY, marginBottom: 4, marginTop: 6 }}>
      {children.toUpperCase()}
    </Text>
  );
}

function Kpis({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  const linhas: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 4) linhas.push(items.slice(i, i + 4));
  return (
    <View>
      {linhas.map((l, i) => (
        <View key={i} style={[styles.kpiRow, { marginBottom: 6 }]} wrap={false}>
          {l.map((k) => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={styles.kpiValue}>{k.value}</Text>
              {k.hint ? <Text style={{ fontSize: 7, color: "#999", marginTop: 2 }}>{k.hint}</Text> : null}
            </View>
          ))}
          {l.length < 4 ? Array.from({ length: 4 - l.length }).map((_, j) => <View key={`v${j}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

// Gráfico de linha em SVG nativo do PDF. Sem biblioteca: cada ponto vem do dado.
function Linha({ valores, cor = GOLD, altura = 62, rotuloIni, rotuloFim }: { valores: number[]; cor?: string; altura?: number; rotuloIni?: string; rotuloFim?: string }) {
  if (valores.length < 2) {
    return <Text style={{ fontSize: 8, color: GRAY, marginBottom: 6 }}>Dados insuficientes para o gráfico neste período.</Text>;
  }
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const faixa = max - min || 1;
  const x = (i: number) => (i / (valores.length - 1)) * (LARGURA - 4) + 2;
  const y = (v: number) => altura - 4 - ((v - min) / faixa) * (altura - 10);
  const d = valores.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${d} L ${x(valores.length - 1).toFixed(1)} ${altura - 2} L 2 ${altura - 2} Z`;
  return (
    <View style={{ marginBottom: 8 }} wrap={false}>
      <Svg width={LARGURA} height={altura}>
        <Line x1={2} y1={altura - 2} x2={LARGURA - 2} y2={altura - 2} stroke="#dddddd" strokeWidth={0.6} />
        <Path d={area} fill={cor} fillOpacity={0.12} />
        <Path d={d} stroke={cor} strokeWidth={1.4} fill="none" />
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 7, color: GRAY }}>{rotuloIni ?? ""}</Text>
        <Text style={{ fontSize: 7, color: GRAY }}>
          mín {fmtNum(Math.round(Math.min(...valores)))} · máx {fmtNum(Math.round(Math.max(...valores)))}
        </Text>
        <Text style={{ fontSize: 7, color: GRAY }}>{rotuloFim ?? ""}</Text>
      </View>
    </View>
  );
}

type Coluna = { h: string; flex: number; alinhar?: "left" | "right" };
function Tabela({ colunas, linhas }: { colunas: Coluna[]; linhas: (string | { t: string; cor?: string; negrito?: boolean })[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableRowHeader} wrap={false}>
        {colunas.map((c) => (
          <Text key={c.h} style={[styles.th, { flex: c.flex, textAlign: c.alinhar ?? "left" }]}>
            {c.h}
          </Text>
        ))}
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          {l.map((cel, j) => {
            const o = typeof cel === "string" ? { t: cel } : cel;
            return (
              <Text
                key={j}
                style={[
                  styles.td,
                  { flex: colunas[j].flex, textAlign: colunas[j].alinhar ?? "left" },
                  o.cor ? { color: o.cor } : {},
                  o.negrito ? { fontWeight: 700 } : {},
                ]}
              >
                {o.t}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Caixa({ children, tom }: { children: any; tom?: "bom" | "atencao" }) {
  return (
    <View style={[styles.highlightBox, tom === "bom" ? styles.highlightGood : {}, tom === "atencao" ? styles.highlightWarn : {}]} wrap={false}>
      {children}
    </View>
  );
}

function corVeredito(v: string): string {
  const s = (v ?? "").toLowerCase();
  if (s.includes("escalar")) return GREEN;
  if (s.includes("cortar") || s.includes("sem resultado")) return RED;
  if (s.includes("não medido") || s.includes("volume")) return AMBER;
  return GRAY;
}

const rotuloFunil = (f: string | null | undefined) => (f ? f : "Não classificado");

export function RelatorioCompletoDocument(d: RelatorioCompletoData) {
  const metrics = [...d.metrics].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const reach = metrics.reduce((a, m) => a + num(m.reach), 0);
  const novos = metrics.reduce((a, m) => a + num(m.new_followers), 0);
  const saves = metrics.reduce((a, m) => a + num(m.saves), 0);
  const interacoes = metrics.reduce((a, m) => a + num(m.total_interactions), 0);
  const taxaEng = reach > 0 ? (interacoes / reach) * 100 : 0;
  const seguidoresHoje = [...metrics].reverse().find((m) => m.followers_count != null)?.followers_count ?? null;

  const posts = d.posts;
  const temIg = d.fontes.tem_instagram;
  const dias = Math.max(1, Math.round((new Date(d.end).getTime() - new Date(d.start).getTime()) / 86400000) + 1);

  // Restaurados do relatório antigo: "O achado do período" e o insight de formato por engajamento.
  const headline = temIg ? computeHeadline(posts) : null;
  const insight = temIg ? computeFormatInsight(posts) : null;
  // Checagem CFM no PDF: mesma regra do texto (reescrita segura por padrão, nada apagado) e as
  // mesmas escolhas de "manter original" feitas na tela.
  const manter = d.envio.manterOriginal ?? [];
  const seguro = (t: string) => tornarSeguro(t, { manter }).texto || t;
  const { ranked: horarios, overallMedian: horaMediana } = temIg ? computeMelhoresHorarios(posts) : { ranked: [] as any[], overallMedian: 0 };
  const formatos = temIg ? computeFormatBreakdown(posts).sort((a, b) => b.medianEngagement - a.medianEngagement) : [];
  const reachFormato = temIg ? computeReachByFormat(posts) : [];
  const reachTema = temIg ? computeReachByTema(posts).slice(0, 8) : [];
  const { repetir, revisar, hasEnough } = temIg ? computeRepetirOuRevisar(posts, 10) : { repetir: [], revisar: [], hasEnough: false };
  const casos = temIg ? computeCasosDestacados(posts) : null;
  const topSalvos = temIg ? computeTopPosts(posts, 8) : [];
  const topTaxaSalvo = temIg ? computeTopPostsPorTaxaDeSalvamento(posts, 5) : [];
  const topCompart = temIg ? computeTopReelsPorTaxaDeCompartilhamento(posts, 5) : [];
  const retencao = temIg ? computeRetencaoDeReels(posts, 5) : null;
  const conceitos = temIg ? computeConceitosVencedores(posts, 6) : [];
  // Comentário de paciente nunca é citado: só o assunto e quantas pessoas diferentes perguntaram.
  const temasPerfil = posts.map((p: any) => String(p.tema ?? "")).filter(Boolean);
  const duvidas = temIg ? duvidasRepetidas(d.perguntas as any[], 2, temasPerfil).duvidas : [];
  const seg = temIg ? analyzeFollowers(metrics, d.start, d.end) : null;
  // Ideias de conteúdo, inclusive as que saem das dúvidas (restauradas). A regra "pergunta" usa o
  // agrupamento da tela Dúvidas (voz-do-paciente): só assunto perguntado por 2+ pessoas diferentes.
  // O comentário NUNCA é citado no PDF: o "porquê" dessas ideias diz só quantas pessoas e o assunto
  // (a evidência original traz um exemplo do comentário, que fica na tela Dúvidas).
  const ideiasBrutas = temIg ? buildIdeias(posts, d.perguntas as any[]) : null;
  const ideias = ideiasBrutas
    ? {
        ...ideiasBrutas,
        ideias: ideiasBrutas.ideias
          .filter((i) => i.regra !== "pergunta" || (i.pessoas ?? 0) >= 2)
          .map((i) => {
            const porque =
              i.regra === "pergunta" ? `${i.pessoas} pessoas diferentes perguntaram sobre "${i.tema}" nos comentários do período (comentário não citado).` : i.porque;
            return { ...i, acao: seguro(i.acao), porque: seguro(porque) };
          }),
      }
    : null;

  const ads = d.ads;
  const adsRes = ads?.resumo ?? null;
  // Diagnóstico por objetivo: cada campanha comparada só com as do mesmo objetivo.
  const obj = ads?.objetivo ?? null;
  const diag = [...(obj?.campanhas ?? [])].sort((a, b) => b.gasto - a.gasto);
  const diagGrupos = new Map<string, { n: number; gasto: number; conv: number }>();
  for (const r of diag) {
    const g = diagGrupos.get(r.veredito) ?? { n: 0, gasto: 0, conv: 0 };
    g.n += 1;
    g.gasto += r.gasto;
    g.conv += r.conversas;
    diagGrupos.set(r.veredito, g);
  }
  const unidade = (c: (typeof diag)[number]) =>
    c.custoPorResultado == null ? "sem resultado" : GRUPOS[c.grupo].porMil ? `${fmtBRL(c.custoPorResultado)} / mil vezes` : `${fmtBRL(c.custoPorResultado)} / ${GRUPOS[c.grupo].resultado}`;

  const wts = d.wts;
  const wRes = wts?.resumo ?? null;
  const crm = d.crm;
  const cm = crm?.metricas ?? null;

  // KPIs do sumário: Instagram primeiro, depois o que existir de anúncio/WhatsApp/CRM.
  const kpis: { label: string; value: string; hint?: string }[] = [];
  if (temIg) {
    kpis.push({ label: "Novos seguidores", value: fmtNum(novos), hint: "só últimos 30 dias (limite do Instagram)" });
    kpis.push({ label: "Soma dos alcances diários", value: fmtNum(reach), hint: `${metrics.length} dias; a mesma pessoa conta em mais de um dia` });
    kpis.push({ label: "Interações a cada 100 de alcance", value: taxaEng.toFixed(1).replace(".", ","), hint: "curtidas, comentários, salvos e compartilhamentos" });
    kpis.push({ label: "Salvamentos", value: fmtNum(saves) });
  }
  if (obj && obj.gasto > 0) {
    kpis.push({ label: "Investido em anúncios", value: fmtBRL(obj.gasto), hint: `${obj.campanhas.length} campanhas` });
    kpis.push({ label: "Conversas (campanhas de mensagem)", value: fmtNum(obj.conversasMensagem), hint: `Direct e WhatsApp; ${fmtNum(obj.conversas)} somando todas as campanhas` });
    kpis.push({ label: "Custo por conversa", value: obj.custoPorConversaMensagem != null ? fmtBRL(obj.custoPorConversaMensagem) : "sem campanha de mensagem", hint: "só campanhas de mensagem" });
  }
  // Restaurado na página 1: Impressões com o CTR (já em %, como o SQL devolve; ver página de Anúncios).
  if (adsRes && num(adsRes.gasto) > 0) {
    kpis.push({
      label: "Impressões",
      value: fmtNum(num(adsRes.impressoes)),
      hint: adsRes.ctr != null ? `CTR ${num(adsRes.ctr).toFixed(2).replace(".", ",")}% (cliques a cada 100 impressões)` : undefined,
    });
  }
  if (wRes) {
    kpis.push({ label: "Atendimentos no WhatsApp", value: fmtNum(num(wRes.atendimentos)), hint: `${fmtNum(num(wRes.contatos_distintos))} contatos diferentes` });
    kpis.push({ label: "Espera até a 1ª resposta", value: fmtSeg(wRes.espera_mediana_seg), hint: "metade esperou até isso" });
  }
  if (cm) {
    kpis.push({ label: "Leads no CRM", value: fmtNum(num(cm.total_leads)), hint: d.crmNome ? `CRM ${d.crmNome}` : undefined });
    kpis.push({ label: "Ganhos", value: fmtNum(num(cm.ganhos)), hint: `${fmtNum(num(cm.perdidos))} perdidos` });
  }

  // Blocos do "O que aconteceu" do relatório antigo, restaurados dentro da seção certa da página 1.
  // Seção que a equipe desmarcou inteira na tela não ganha os blocos extras também.
  const secaoTirada = (s: SecaoId) => d.envio.conteudoCompleto[s].length > 0 && d.envio.conteudo[s].length === 0;
  const extras: Partial<Record<SecaoId, any[]>> = { resumo: [], vitorias: [] };
  if (!secaoTirada("resumo")) {
    if (headline) {
      extras.resumo!.push(
        <View key="achado" style={styles.headline} wrap={false}>
          <Text style={{ fontWeight: 700, marginBottom: 2 }}>O achado do período</Text>
          <Text>{stripEmoji(seguro(headline)).replace(/\s*[—–]\s*/g, ": ")}</Text>
        </View>,
      );
    }
    if (temIg && topSalvos[0]) {
      extras.resumo!.push(
        <Caixa key="mais-salva" tom="bom">
          <Text>
            <Text style={{ fontWeight: 700 }}>{posts.length} publicações</Text> no período. A mais salva foi "{stripEmoji(seguro(caseCaption(topSalvos[0]).slice(0, 110)))}", com{" "}
            <Text style={{ fontWeight: 700 }}>{fmtNum(topSalvos[0].saved)} salvamentos</Text> e alcance de {fmtNum(topSalvos[0].reach)}.
          </Text>
        </Caixa>,
      );
    }
    if (cm) {
      extras.resumo!.push(
        <Caixa key="crm">
          <Text>
            <Text style={{ fontWeight: 700 }}>{fmtNum(num(cm.total_leads))} leads</Text> no CRM{d.crmNome ? ` ${d.crmNome}` : ""} (histórico da conta): {fmtNum(num(cm.ganhos))} ganhos, {fmtNum(num(cm.perdidos))} perdidos e {fmtNum(num(cm.em_atendimento))} em atendimento.
          </Text>
        </Caixa>,
      );
    }
  }
  if (!secaoTirada("vitorias") && insight) {
    extras.vitorias!.push(
      <Caixa key="formato-engaj">
        <Text>
          <Text style={{ fontWeight: 700 }}>{fmtFormatKey(insight.best.format)}</Text> é o formato mais forte em engajamento: engajamento (mediana) de {fmtNum(Math.round(insight.best.median))} em {insight.best.count} posts,{" "}
          {insight.bestPct >= 0 ? "+" : ""}
          {insight.bestPct.toFixed(0)}% sobre a mediana geral.
          {insight.worst.format !== insight.best.format ? ` ${fmtFormatKey(insight.worst.format)} ficou ${Math.abs(insight.worstPct).toFixed(0)}% abaixo (${insight.worst.count} posts).` : ""}
        </Text>
      </Caixa>,
    );
  }

  return (
    <Document>
      {/* 1. Sumário executivo */}
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>Doctor Creator Intelligence Hub · relatório completo</Text>
        <Text style={styles.title}>{d.clientName}</Text>
        <Text style={styles.subtitle}>
          {d.specialty ? `${d.specialty} · ` : ""}
          {d.igHandle ? `@${d.igHandle} · ` : ""}
          {d.periodLabel}
        </Text>

        <Kpis items={kpis} />

        {SECOES.map((sec) =>
          d.envio.conteudo[sec.id].length > 0 || (extras[sec.id]?.length ?? 0) > 0 ? (
            <View key={sec.id}>
              <Titulo dica={sec.id === "acoes" ? "Só entra recomendação com evidência e amostra mínima; as demais foram descartadas na checagem." : sec.id === "resumo" ? `Período de ${dias} dias. Cada ponto vem de dado medido na fonte.` : undefined}>{sec.titulo}</Titulo>
              {extras[sec.id] ?? null}
              {d.envio.conteudo[sec.id].map((it, i) => (
                <View key={it.id} style={{ marginBottom: 5 }} wrap={false}>
                  <Text style={styles.methodP}>
                    {sec.id === "acoes" ? `${i + 1}. ` : "· "}
                    {stripEmoji(it.texto)}
                  </Text>
                  {it.evidencia && !/^https?:/.test(it.evidencia) ? <Text style={{ fontSize: 8, color: GRAY, marginLeft: 8, lineHeight: 1.35 }}>Evidência: {stripEmoji(it.evidencia)}</Text> : null}
                  {it.evidencia && /^https?:/.test(it.evidencia) ? (
                    <Link src={it.evidencia} style={{ fontSize: 8, color: GOLD, marginLeft: 8 }}>
                      Abrir no Instagram
                    </Link>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null,
        )}

        <Titulo dica="Feita antes de montar o texto. Comentário de paciente nunca é citado.">Checagem antes de enviar</Titulo>
        {d.envio.checagem.map((c) => (
          <Text key={c.id} style={[styles.methodP, { marginBottom: 3 }]}>
            <Text style={{ fontWeight: 700, color: c.status === "ok" ? GREEN : AMBER }}>{c.status === "ok" ? "Passou" : "Atenção"}</Text> · {c.titulo}: {stripEmoji(c.resumo)}
          </Text>
        ))}
        <Footer page={1} />
      </Page>

      {/* 2. Instagram: evolução e audiência */}
      {temIg ? (
        <Page size="A4" style={styles.page} wrap>
          <Titulo dica="Dia a dia da conta. O Instagram só guarda ganho de seguidores dos últimos 30 dias.">Instagram: evolução da conta</Titulo>
          <Subtitulo>Alcance por dia</Subtitulo>
          <Linha valores={metrics.map((m) => num(m.reach))} rotuloIni={metrics[0] ? fmtDiaBR(String(metrics[0].date)) : ""} rotuloFim={metrics.length ? fmtDiaBR(String(metrics[metrics.length - 1].date)) : ""} />
          <Subtitulo>Seguidores ganhos por dia</Subtitulo>
          <Linha valores={metrics.map((m) => num(m.new_followers))} cor={GREEN} rotuloIni={metrics[0] ? fmtDiaBR(String(metrics[0].date)) : ""} rotuloFim={metrics.length ? fmtDiaBR(String(metrics[metrics.length - 1].date)) : ""} />
          <Subtitulo>Interações por dia</Subtitulo>
          <Linha valores={metrics.map((m) => num(m.total_interactions))} cor="#5a7fb8" rotuloIni={metrics[0] ? fmtDiaBR(String(metrics[0].date)) : ""} rotuloFim={metrics.length ? fmtDiaBR(String(metrics[metrics.length - 1].date)) : ""} />

          <Kpis
            items={[
              { label: "Seguidores hoje", value: seguidoresHoje != null ? fmtNum(num(seguidoresHoje)) : "sem dado" },
              { label: "Seguidores ganhos", value: fmtNum(novos), hint: "no período" },
              { label: "Interações", value: fmtNum(interacoes) },
              { label: "Dias com coleta", value: `${metrics.length} de ${dias}` },
            ]}
          />

          {seg ? (
            <Caixa tom={seg.projection.ok ? "bom" : undefined}>
              <Text style={{ fontWeight: 700, marginBottom: 2 }}>Projeção de seguidores (30 dias)</Text>
              {seg.projection.ok ? (
                <Text>
                  Ritmo de {fmtNum(Math.round(seg.projection.slopePerDay))} seguidores por dia. Com esse ritmo, o perfil chega a {fmtNum(Math.round(seg.projection.projected))} em {fmtDiaBR(seg.projection.target)} (regressão linear sobre {seg.daysWithData} dias com contagem).
                </Text>
              ) : (
                <Text>{seg.projection.reason}</Text>
              )}
            </Caixa>
          ) : null}

          {horarios.length > 0 ? (
            <>
              <Titulo>Melhores horários para postar</Titulo>
              <Tabela
                colunas={[
                  { h: "Dia", flex: 2 },
                  { h: "Período", flex: 2 },
                  { h: "Posts", flex: 1, alinhar: "right" },
                  { h: "Engaj. (mediana)", flex: 2, alinhar: "right" },
                  { h: "Sobre a mediana", flex: 2, alinhar: "right" },
                ]}
                linhas={horarios.slice(0, 6).map((r: any) => [
                  r.weekday,
                  r.period,
                  String(r.count),
                  fmtNum(Math.round(r.median)),
                  horaMediana > 0 ? `${r.median >= horaMediana ? "+" : ""}${(((r.median - horaMediana) / horaMediana) * 100).toFixed(0)}%` : "sem base",
                ])}
              />
            </>
          ) : null}
          <Footer page={2} />
        </Page>
      ) : null}

      {/* 3. Instagram: o que performa */}
      {temIg ? (
        <Page size="A4" style={styles.page} wrap>
          <Titulo dica="Alcance e engajamento em mediana: um post viral isolado não distorce a leitura.">Instagram: o que performa</Titulo>

          {formatos.length > 0 ? (
            <>
              <Subtitulo>Engajamento (mediana) por formato</Subtitulo>
              <Tabela
                colunas={[
                  { h: "Formato", flex: 3 },
                  { h: "Posts", flex: 1, alinhar: "right" },
                  { h: "Engaj. (mediana)", flex: 2, alinhar: "right" },
                ]}
                linhas={formatos.map((f) => [f.formato, String(f.count), fmtNum(f.medianEngagement)])}
              />
            </>
          ) : null}

          {reachFormato.length > 0 ? (
            <>
              <Subtitulo>Alcance (mediana) por formato</Subtitulo>
              <BarChartBlock rows={reachFormato.map((r) => ({ label: r.formato, value: r.medianReach }))} maxValue={Math.max(1, ...reachFormato.map((r) => r.medianReach))} />
            </>
          ) : null}
          {reachTema.length > 0 ? (
            <>
              <Subtitulo>Alcance (mediana) por tema</Subtitulo>
              <BarChartBlock rows={reachTema.map((r) => ({ label: r.tema, value: r.medianReach }))} maxValue={Math.max(1, ...reachTema.map((r) => r.medianReach))} />
            </>
          ) : (
            <Caixa>
              <Text>Nenhum post do período tem tema classificado, então a leitura por tema não aparece. Classificar os posts na aba Posts libera este bloco.</Text>
            </Caixa>
          )}

          <Titulo dica="Temas com 10 ou mais posts, comparados pela taxa de engajamento.">O que repetir e o que revisar</Titulo>
          {hasEnough ? (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={styles.verdictCol}>
                <Text style={[styles.verdictLabel, { color: GREEN }]}>REPETIR</Text>
                {repetir.length === 0 ? <Text style={{ fontSize: 8, color: GRAY }}>Nenhum tema acima da mediana.</Text> : null}
                {repetir.map((g: any) => (
                  <View key={g.tema} style={styles.verdictItem} wrap={false}>
                    <Text style={styles.verdictTema}>{g.tema}</Text>
                    <Text style={styles.verdictRate}>
                      {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.verdictCol}>
                <Text style={[styles.verdictLabel, { color: RED }]}>REVISAR OU DESCONTINUAR</Text>
                {revisar.length === 0 ? <Text style={{ fontSize: 8, color: GRAY }}>Nenhum tema abaixo da mediana.</Text> : null}
                {revisar.map((g: any) => (
                  <View key={g.tema} style={styles.verdictItem} wrap={false}>
                    <Text style={styles.verdictTema}>{g.tema}</Text>
                    <Text style={styles.verdictRate}>
                      {(g.rate * 100).toFixed(1)}% engajamento · {g.count} posts
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Caixa>
              <Text>Ainda não há temas com 10 ou mais posts classificados no período para comparar com confiança.</Text>
            </Caixa>
          )}

          {conceitos.length > 0 ? (
            <>
              <Titulo dica="O post de maior taxa de salvamento de cada tema, com a taxa medida.">Conceitos vencedores por tema</Titulo>
              <Tabela
                colunas={[
                  { h: "Tema", flex: 2 },
                  { h: "Post", flex: 5 },
                  { h: "Taxa de salvamento", flex: 2, alinhar: "right" },
                ]}
                linhas={conceitos.map((c: any) => [c.tema, caseCaption(c.post).slice(0, 80), pct(c.rate * 100)])}
              />
            </>
          ) : null}
          <Footer page={3} />
        </Page>
      ) : null}

      {/* 4. Instagram: rankings e casos */}
      {temIg ? (
        <Page size="A4" style={styles.page} wrap>
          <Titulo dica="Ranking por salvamentos, que é a ação que mais pesa para o alcance.">Instagram: posts e reels em destaque</Titulo>
          {topSalvos.length > 0 ? (
            <Tabela
              colunas={[
                { h: "Post", flex: 6 },
                { h: "Formato", flex: 1.6 },
                { h: "Alcance", flex: 1.4, alinhar: "right" },
                { h: "Salvos", flex: 1.2, alinhar: "right" },
                { h: "Engaj.", flex: 1.2, alinhar: "right" },
              ]}
              linhas={topSalvos.map((p: any) => [
                caseCaption(p).slice(0, 75),
                p.format ? fmtFormatKey(p.format) : "n/d",
                fmtNum(p.reach),
                fmtNum(p.saved),
                fmtNum(p.engagement),
              ])}
            />
          ) : (
            <Text style={{ fontSize: 9, color: GRAY }}>Sem posts com salvamentos medidos no período.</Text>
          )}

          {topTaxaSalvo.length > 0 ? (
            <>
              <Subtitulo>Maior taxa de salvamento (normaliza pelo alcance)</Subtitulo>
              {topTaxaSalvo.map(({ post, rate }: any) => (
                <View key={post.id} style={[styles.caseBox, { padding: 6, marginBottom: 4 }]} wrap={false}>
                  <Text style={{ fontSize: 9 }}>{caseCaption(post).slice(0, 100)}</Text>
                  <Text style={{ fontSize: 8, color: GREEN, fontWeight: 700, marginTop: 2 }}>{pct(rate * 100)} de taxa de salvamento</Text>
                </View>
              ))}
            </>
          ) : null}
          {topCompart.length > 0 ? (
            <>
              <Subtitulo>Reels com maior taxa de compartilhamento</Subtitulo>
              {topCompart.map(({ post, rate }: any) => (
                <View key={post.id} style={[styles.caseBox, { padding: 6, marginBottom: 4 }]} wrap={false}>
                  <Text style={{ fontSize: 9 }}>{caseCaption(post).slice(0, 100)}</Text>
                  <Text style={{ fontSize: 8, color: GREEN, fontWeight: 700, marginTop: 2 }}>{pct(rate * 100)} de taxa de compartilhamento</Text>
                </View>
              ))}
            </>
          ) : null}

          {retencao && retencao.withData > 0 ? (
            <>
              <Titulo dica={`${retencao.withData} de ${retencao.totalReels} reels do período têm dado de retenção.`}>Retenção dos reels</Titulo>
              <Kpis
                items={[
                  { label: "Gancho (mediana)", value: retencao.medianHookRate != null ? pct(retencao.medianHookRate, 0) : "sem dado", hint: "quem não pulou o reel" },
                  { label: "Tempo assistido (mediana)", value: retencao.medianWatchSeconds != null ? `${retencao.medianWatchSeconds.toFixed(1).replace(".", ",")} s` : "sem dado" },
                ]}
              />
              <Tabela
                colunas={[
                  { h: "Melhores reels", flex: 6 },
                  { h: "Gancho", flex: 1.4, alinhar: "right" },
                  { h: "Tempo médio", flex: 1.6, alinhar: "right" },
                ]}
                linhas={retencao.melhores.map((r: any) => [
                  caseCaption(r.post).slice(0, 80),
                  pct(r.hookRate, 0),
                  r.avgWatchSeconds != null ? `${r.avgWatchSeconds.toFixed(1).replace(".", ",")} s` : "n/d",
                ])}
              />
            </>
          ) : null}

          <Titulo>Casos destacados do período</Titulo>
          {casos ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { rot: "Maior alcance", p: casos.melhor },
                { rot: "Menor alcance", p: casos.pior },
              ].map(({ rot, p }) => (
                <View key={rot} style={[styles.caseBox, { flex: 1 }]} wrap={false}>
                  <Text style={styles.caseLabel}>{rot}</Text>
                  <Text style={styles.caseCaption}>"{caseCaption(p)}"</Text>
                  <Text style={styles.caseStats}>
                    {p.posted_at ? new Date(p.posted_at).toLocaleDateString("pt-BR") : ""} · Alcance {fmtNum(p.reach)} · Engaj. {fmtNum(p.engagement)} · Salvos {fmtNum(p.saved)}
                  </Text>
                  {p.permalink ? (
                    <Link src={p.permalink} style={{ fontSize: 8, color: GOLD, marginTop: 4 }}>
                      Abrir no Instagram
                    </Link>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 9, color: GRAY }}>Posts insuficientes no período para destacar casos.</Text>
          )}
          <Footer page={4} />
        </Page>
      ) : null}

      {/* 5. Anúncios */}
      {ads && adsRes ? (
        <Page size="A4" style={styles.page} wrap>
          <Titulo dica="Dado direto da conta de anúncio. Conversa iniciada (Direct ou WhatsApp) é o resultado que dá para medir nessas contas.">Anúncios</Titulo>
          <Kpis
            items={[
              { label: "Investido", value: fmtBRL(obj?.gasto ?? num(adsRes.gasto)), hint: `${obj?.campanhas.length ?? adsRes.campanhas} campanhas` },
              { label: "Conversas (campanhas de mensagem)", value: fmtNum(obj?.conversasMensagem ?? 0) },
              { label: "Custo por conversa", value: obj?.custoPorConversaMensagem != null ? fmtBRL(obj.custoPorConversaMensagem) : "sem campanha de mensagem", hint: "só campanhas de mensagem" },
              { label: "Impressões", value: fmtNum(num(adsRes.impressoes)), hint: adsRes.cpm != null ? `${fmtBRL(num(adsRes.cpm))} para aparecer mil vezes` : undefined },
              { label: "Cliques no link", value: fmtNum(num(adsRes.cliques_link)), hint: adsRes.cpc != null ? `${fmtBRL(num(adsRes.cpc))} por clique` : undefined },
              { label: "Cliques a cada 100 impressões", value: adsRes.ctr != null ? num(adsRes.ctr).toFixed(2).replace(".", ",") : "sem dado" },
              { label: "Soma do alcance das campanhas", value: fmtNum(num(adsRes.alcance_somado)), hint: "a mesma pessoa pode contar em mais de uma" },
              { label: "Dias com gasto", value: fmtNum(num(adsRes.dias)) },
            ]}
          />

          <Subtitulo>Investimento por dia</Subtitulo>
          <Linha valores={(ads.porDia ?? []).map((x: any) => num(x.gasto))} rotuloIni={ads.porDia?.[0] ? fmtDiaBR(String(ads.porDia[0].dia).slice(0, 10)) : ""} rotuloFim={ads.porDia?.length ? fmtDiaBR(String(ads.porDia[ads.porDia.length - 1].dia).slice(0, 10)) : ""} />
          <Subtitulo>Conversas por dia</Subtitulo>
          <Linha valores={(ads.porDia ?? []).map((x: any) => num(x.conversas))} cor={GREEN} />

          {obj && obj.grupos.length > 0 ? (
            <>
              <Titulo dica="Cada objetivo tem o seu resultado. A última coluna responde só uma pergunta: quanto custou cada conversa vinda daquele objetivo.">Resultado por objetivo</Titulo>
              <Tabela
                colunas={[
                  { h: "Objetivo", flex: 3 },
                  { h: "Campanhas", flex: 1.3, alinhar: "right" },
                  { h: "Investido", flex: 1.7, alinhar: "right" },
                  { h: "Custo por resultado", flex: 2.4, alinhar: "right" },
                  { h: "Conversas", flex: 1.3, alinhar: "right" },
                  { h: "Custo/conversa", flex: 1.7, alinhar: "right" },
                ]}
                linhas={obj.grupos.map((g) => [
                  GRUPOS[g.grupo].nome,
                  String(g.campanhas),
                  fmtBRL(g.gasto),
                  g.custoPorResultado == null ? "sem resultado" : GRUPOS[g.grupo].porMil ? `${fmtBRL(g.custoPorResultado)} / mil vezes` : `${fmtBRL(g.custoPorResultado)} / ${GRUPOS[g.grupo].resultado}`,
                  fmtNum(g.conversas),
                  g.custoPorConversa != null ? fmtBRL(g.custoPorConversa) : "sem conversa",
                ])}
              />
            </>
          ) : null}
          <Footer page={5} />
        </Page>
      ) : null}

      {/* 6. Anúncios: diagnóstico por campanha */}
      {ads && diag.length > 0 ? (
        <Page size="A4" style={styles.page} wrap>
          <Titulo dica="Cada campanha é comparada só com as campanhas do mesmo objetivo na própria conta (a campanha típica), não com benchmark de mercado. Campanha que rodou pouco fica como volume insuficiente.">Anúncios: diagnóstico por campanha</Titulo>
          <Tabela
            colunas={[
              { h: "Veredito", flex: 3 },
              { h: "Campanhas", flex: 1.4, alinhar: "right" },
              { h: "Investido", flex: 2, alinhar: "right" },
              { h: "Conversas", flex: 1.4, alinhar: "right" },
              { h: "% da verba", flex: 1.4, alinhar: "right" },
            ]}
            linhas={[...diagGrupos.entries()]
              .sort((a, b) => b[1].gasto - a[1].gasto)
              .map(([v, g]) => [
                { t: v, cor: corVeredito(v), negrito: true },
                String(g.n),
                fmtBRL(g.gasto),
                fmtNum(g.conv),
                obj && obj.gasto > 0 ? pct((g.gasto / obj.gasto) * 100, 0) : "n/d",
              ])}
          />
          <Subtitulo>Campanhas com maior investimento</Subtitulo>
          <Tabela
            colunas={[
              { h: "Campanha", flex: 3.2 },
              { h: "Objetivo", flex: 1.4 },
              { h: "Veredito", flex: 1.8 },
              { h: "Investido", flex: 1.5, alinhar: "right" },
              { h: "Custo por resultado", flex: 1.9, alinhar: "right" },
              { h: "Conv.", flex: 0.9, alinhar: "right" },
              { h: "Custo/conv.", flex: 1.4, alinhar: "right" },
              { h: "Freq.*", flex: 0.9, alinhar: "right" },
            ]}
            linhas={diag.slice(0, 18).map((r) => {
              const fq = ads?.frequencia?.[r.campaign_id];
              return [
                // Nome de campanha pode ter termo de risco ("promoção"): marcado, nunca apagado.
                stripEmoji(seguro(String(r.campanha ?? ""))).slice(0, 40),
                GRUPOS[r.grupo].curto,
                { t: r.veredito, cor: corVeredito(r.veredito), negrito: true },
                fmtBRL(r.gasto),
                unidade(r),
                fmtNum(r.conversas),
                r.custoPorConversa != null ? fmtBRL(r.custoPorConversa) : "sem conv.",
                fq != null ? fq.toFixed(1).replace(".", ",") : "n/d",
              ];
            })}
          />
          {diag.length > 18 ? <Text style={{ fontSize: 8, color: GRAY }}>Mostrando as 18 campanhas de maior investimento, de {diag.length} no período.</Text> : null}
          <Text style={{ fontSize: 7.5, color: GRAY, marginTop: 4, lineHeight: 1.4 }}>
            Conv.: conversas iniciadas (Direct ou WhatsApp) da campanha. Custo/conv.: investido ÷ conversas da própria campanha, qualquer que seja o objetivo. *Freq.: quantas vezes, em média, a mesma pessoa viu o anúncio,
            calculada como a média das frequências diárias da campanha no período, não a frequência do período inteiro (que costuma ser maior, porque a mesma pessoa aparece em vários dias).
          </Text>
          <Footer page={6} />
        </Page>
      ) : null}

      {/* 7. WhatsApp e CRM */}
      {(wts && wRes) || (crm && cm) ? (
        <Page size="A4" style={styles.page} wrap>
          {wts && wRes ? (
            <>
              <Titulo dica="Atendimentos do WhatsApp. Tempos em mediana, para um atendimento muito lento não distorcer.">Atendimento no WhatsApp</Titulo>
              <Kpis
                items={[
                  { label: "Atendimentos", value: fmtNum(num(wRes.atendimentos)) },
                  { label: "Contatos diferentes", value: fmtNum(num(wRes.contatos_distintos)) },
                  { label: "Espera até 1ª resposta", value: fmtSeg(wRes.espera_mediana_seg), hint: "mediana" },
                  { label: "Duração do atendimento", value: fmtSeg(wRes.atendimento_mediano_seg), hint: "mediana" },
                  { label: "Concluídos", value: fmtNum(num(wRes.concluidos)) },
                  { label: "Em andamento", value: fmtNum(num(wRes.em_andamento)) },
                ]}
              />
              <Subtitulo>Atendimentos por dia</Subtitulo>
              <Linha valores={wts.volumeDiario.map((v: any) => num(v.atendimentos))} cor="#5a7fb8" />
              {wts.porDepartamento.length > 0 ? (
                <>
                  <Subtitulo>Por departamento</Subtitulo>
                  <Tabela
                    colunas={[
                      { h: "Departamento", flex: 4 },
                      { h: "Atend.", flex: 1.2, alinhar: "right" },
                      { h: "Fatia", flex: 1.2, alinhar: "right" },
                      { h: "Espera", flex: 1.6, alinhar: "right" },
                      { h: "Duração", flex: 1.6, alinhar: "right" },
                    ]}
                    linhas={wts.porDepartamento.map((x: any) => [
                      String(x.departamento ?? "n/d"),
                      fmtNum(num(x.atendimentos)),
                      pct(num(x.fatia), 0),
                      fmtSeg(x.espera_mediana_seg),
                      fmtSeg(x.atendimento_mediano_seg),
                    ])}
                  />
                </>
              ) : null}
              {wts.porAgente.length > 0 ? (
                <>
                  <Subtitulo>Por atendente</Subtitulo>
                  <Tabela
                    colunas={[
                      { h: "Atendente", flex: 4 },
                      { h: "Atend.", flex: 1.2, alinhar: "right" },
                      { h: "Concluídos", flex: 1.6, alinhar: "right" },
                      { h: "Espera", flex: 1.6, alinhar: "right" },
                    ]}
                    linhas={wts.porAgente.slice(0, 10).map((x: any) => [String(x.agente ?? "n/d"), fmtNum(num(x.atendimentos)), fmtNum(num(x.concluidos)), fmtSeg(x.espera_mediana_seg)])}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {crm && cm ? (
            <>
              <Titulo dica="Visão do funil comercial. O CRM mostra o histórico inteiro da conta, não só o período do relatório.">{`Comercial${d.crmNome ? `, CRM ${d.crmNome}` : ""}`}</Titulo>
              <Kpis
                items={[
                  { label: "Leads no CRM", value: fmtNum(num(cm.total_leads)) },
                  { label: "Novos nos últimos 7 dias", value: fmtNum(num(cm.novos_7d)) },
                  { label: "Ganhos", value: fmtNum(num(cm.ganhos)) },
                  { label: "Perdidos", value: fmtNum(num(cm.perdidos)) },
                  { label: "Em atendimento", value: fmtNum(num(cm.em_atendimento)), hint: num(cm.em_atendimento_valor) > 0 ? fmtBRL(num(cm.em_atendimento_valor)) : undefined },
                  { label: "Consultas agendadas", value: fmtNum(num(cm.consultas_agendadas)) },
                  { label: "Leads com origem", value: `${num(cm.fonte_preenchida_pct).toFixed(0)}%`, hint: "preenchimento da fonte do lead" },
                ]}
              />
              {crm.porEtapa.length > 0 ? (
                <>
                  <Subtitulo>Leads por etapa</Subtitulo>
                  <BarChartBlock
                    rows={[...crm.porEtapa].sort((a: any, b: any) => num(b.total) - num(a.total)).slice(0, 10).map((e: any) => ({ label: String(e.etapa).slice(0, 26), value: num(e.total) }))}
                    maxValue={Math.max(1, ...crm.porEtapa.map((e: any) => num(e.total)))}
                  />
                </>
              ) : null}
              {crm.porOrigem.length > 0 ? (
                <>
                  <Subtitulo>Origem dos leads e conversão</Subtitulo>
                  <Tabela
                    colunas={[
                      { h: "Origem", flex: 4 },
                      { h: "Leads", flex: 1.2, alinhar: "right" },
                      { h: "Ganhos", flex: 1.2, alinhar: "right" },
                      { h: "Perdidos", flex: 1.2, alinhar: "right" },
                      { h: "Ganho/lead", flex: 1.4, alinhar: "right" },
                    ]}
                    linhas={[...crm.porOrigem]
                      .sort((a: any, b: any) => num(b.total) - num(a.total))
                      .slice(0, 12)
                      .map((o: any) => [
                        String(o.chave ?? "sem origem"),
                        fmtNum(num(o.total)),
                        fmtNum(num(o.ganhos)),
                        fmtNum(num(o.perdidos)),
                        num(o.total) > 0 ? pct((num(o.ganhos) / num(o.total)) * 100, 1) : "n/d",
                      ])}
                  />
                </>
              ) : null}
              {crm.porDia.length > 1 ? (
                <>
                  <Subtitulo>Novos leads por dia</Subtitulo>
                  <Linha valores={crm.porDia.map((x: any) => num(x.total))} cor={GOLD} />
                </>
              ) : null}
            </>
          ) : null}
          <Footer page={7} />
        </Page>
      ) : null}

      {/* 8. Dúvidas, ideias e mensagem */}
      <Page size="A4" style={styles.page} wrap>
        {temIg ? (
          <>
            <Titulo dica={`${d.perguntas.length} pergunta(s) nos comentários do período. Só entra o assunto perguntado por 2 ou mais pessoas diferentes; emoji, @, link e divulgação são ignorados e nenhum comentário é citado.`}>Dúvidas dos pacientes</Titulo>
            {duvidas.length > 0 ? (
              <Tabela
                colunas={[
                  { h: "Assunto da dúvida", flex: 6 },
                  { h: "Pessoas diferentes", flex: 1.8, alinhar: "right" },
                ]}
                linhas={duvidas.map((c) => {
                  const t = seguro(c.tema);
                  return [t === c.tema ? t : `${t} (termo trocado pela checagem CFM)`, String(c.pessoas)];
                })}
              />
            ) : (
              <Caixa>
                <Text>Nenhum assunto foi perguntado por 2 ou mais pessoas diferentes no período, então não há uma dúvida comum para transformar em conteúdo.</Text>
              </Caixa>
            )}
          </>
        ) : null}

        {ideias ? (
          <>
            <Titulo dica="Ângulos de conteúdo calculados por regra a partir do que já funcionou, cada um com o dado que o sustenta.">Ideias de conteúdo</Titulo>
            {ideias.ideias.length > 0 ? (
              ideias.ideias.map((i) => (
                <View key={i.id} style={[styles.caseBox, { padding: 8, marginBottom: 6 }]} wrap={false}>
                  <Text style={styles.caseLabel}>
                    {i.regra === "pergunta" ? "Dúvida repetida" : i.regra === "tema" ? "Tema que salva acima da média" : "Formato de maior alcance"}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: 700, marginBottom: 3 }}>{stripEmoji(i.acao)}</Text>
                  <Text style={{ fontSize: 8, color: "#555", lineHeight: 1.4 }}>
                    {stripEmoji(i.porque)} · Funil: {rotuloFunil(i.funil)} · Estágio: {rotuloFunil(i.estagio)} · Formato: {i.formato}
                  </Text>
                </View>
              ))
            ) : (
              <Caixa>
                <Text>Nenhuma regra disparou neste período.</Text>
              </Caixa>
            )}
            {ideias.faltas.length > 0 ? (
              <>
                <Subtitulo>O que falta para mais ideias</Subtitulo>
                {ideias.faltas.map((f, i) => (
                  <Text key={i} style={{ fontSize: 8, color: "#666", marginBottom: 3, lineHeight: 1.4 }}>
                    · {stripEmoji(f)}
                  </Text>
                ))}
              </>
            ) : null}
          </>
        ) : null}

        {d.textoCliente.trim() ? (
          <>
            <Titulo dica="Texto pronto para o WhatsApp, como foi editado no dashboard.">Mensagem para o cliente</Titulo>
            {d.textoCliente
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <Text key={i} style={styles.methodP}>
                  {stripEmoji(p).length > 0 ? p : ""}
                </Text>
              ))}
          </>
        ) : null}
        <Footer page={8} />
      </Page>

      {/* 9. Metodologia e o que não entrou */}
      <Page size="A4" style={styles.page} wrap>
        <Titulo>Como este relatório foi feito</Titulo>
        <Text style={styles.methodTitle}>Fontes</Text>
        <Text style={styles.methodP}>
          Instagram: métricas por post e diárias da conta lidas do perfil profissional. Anúncios: direto da conta de anúncio. WhatsApp: sessões de atendimento da plataforma de atendimento. CRM: negociações do CRM do cliente. Período do relatório: {d.periodLabel}.
        </Text>
        <Text style={styles.methodTitle}>Mediana, não média</Text>
        <Text style={styles.methodP}>
          Engajamento e alcance são medianas. Um post viral isolado pode inflar a média de um formato inteiro em 6 a 10 vezes, e a mediana representa melhor o post típico. Tempos de espera e de atendimento também são medianas.
        </Text>
        <Text style={styles.methodTitle}>Limites que valem a pena conhecer</Text>
        <Text style={styles.methodP}>
          O Instagram só informa o ganho diário de seguidores dos últimos 30 dias. Melhor formato exige 3 posts ou mais, e a leitura por tema exige 10 posts classificados no mesmo assunto. O CRM mostra o histórico inteiro da conta, não só o período. A detecção de dúvida nos comentários é uma regra de pontuação e palavra interrogativa, então pode incluir elogios com interrogação.
        </Text>
        <Text style={styles.methodTitle}>Como as dúvidas foram contadas</Text>
        <Text style={styles.methodP}>
          {NOTA_ALGORITMO_DUVIDAS} Neste PDF, a tabela "Dúvidas dos pacientes" usa o agrupamento por palavra-chave do relatório, e as "Ideias de conteúdo" que vêm de dúvidas usam o agrupamento por assunto da tela Dúvidas (só assunto perguntado por 2 ou mais pessoas diferentes).
        </Text>
        <Text style={styles.methodTitle}>Linguagem segura (CFM 2.336/2023)</Text>
        <Text style={styles.methodP}>
          Nenhum ponto é apagado pela checagem. Frase com promessa de resultado, preço, nome de remédio, superlativo, sensacionalismo ou @ de pessoa recebe uma reescrita segura{d.envio.alteracoes.length > 0 ? ` (${d.envio.alteracoes.length} neste relatório${d.envio.alteracoes.some((a) => a.mantido) ? `, ${d.envio.alteracoes.filter((a) => a.mantido).length} mantida(s) como no original por escolha da equipe` : ""})` : " (nenhuma foi necessária neste relatório)"}.
        </Text>
        {d.envio.alteracoes.map((a, i) => (
          <Text key={`cfm${i}`} style={[styles.methodP, { fontSize: 8, color: "#555" }]}>
            · {a.secao}: "{stripEmoji(a.original)}" {a.mantido ? "(mantido como no original)" : `→ "${stripEmoji(a.corrigido)}"`}. Motivo: {a.motivos.join("; ")}.
          </Text>
        ))}
        <Text style={styles.methodTitle}>O que não está neste relatório</Text>
        {d.omitidos.length > 0 ? (
          d.omitidos.map((o, i) => (
            <Text key={i} style={styles.methodP}>
              · {o}. A seção foi omitida por falta de fonte, não por erro.
            </Text>
          ))
        ) : (
          <Text style={styles.methodP}>Todas as fontes do cliente entraram.</Text>
        )}
        {d.envio.omitidos.length > 0 ? (
          <>
            <Text style={[styles.methodP, { fontWeight: 700 }]}>Não incluído por falta de dado:</Text>
            {d.envio.omitidos.map((o, i) => (
              <Text key={`om${i}`} style={styles.methodP}>
                · {stripEmoji(o)}.
              </Text>
            ))}
          </>
        ) : null}
        {d.envio.excluidos.length > 0 ? (
          <>
            <Text style={[styles.methodP, { fontWeight: 700 }]}>Retirado do envio por escolha da equipe:</Text>
            {d.envio.excluidos.map((o, i) => (
              <Text key={`ex${i}`} style={styles.methodP}>
                · {stripEmoji(o)}.
              </Text>
            ))}
          </>
        ) : null}
        {d.falhas.length > 0 ? (
          <>
            <Text style={styles.methodTitle}>Leituras que falharam na geração</Text>
            {d.falhas.map((f, i) => (
              <Text key={i} style={[styles.methodP, { color: RED }]}>
                · {f}
              </Text>
            ))}
          </>
        ) : null}
        <Text style={styles.methodP}>
          Este relatório mede e aponta direção. As ações sugeridas saem de regras sobre os números, não de IA, e a produção de conteúdo continua com o médico ou a equipe que ele contratar.
        </Text>
        <Footer page={9} />
      </Page>
    </Document>
  );
}

export async function downloadRelatorioCompleto(data: RelatorioCompletoData) {
  const blob = await pdf(<RelatorioCompletoDocument {...data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = data.clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  a.href = url;
  a.download = `relatorio-completo-${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
