// Relatório pronto para enviar: 3 versões (WhatsApp, executiva, PDF) para 2 clientes reais,
// últimos 30 dias (14/09 a 13/10/2026). Dados em scripts/dados/relatorio-2026-10-13.ts.
// Rodar: npx tsx scripts/test-relatorio.ts
import { diagnosticarAds, type CampanhaCadastro, type LinhaAds } from "../src/lib/anuncios-objetivo";
import { checarLinguagemCFM, tornarSeguro } from "../src/lib/linguagem-cfm";
import { buildRelatorioEnvio, duvidasRepetidas, LIMITE_WHATSAPP, SECOES, type EnvioInput } from "../src/lib/relatorio-envio";
import { daysBetween } from "../src/lib/hub-conteudo";
import { PERIODO, juliana, lana } from "./dados/relatorio-2026-10-13";

let falhas = 0;
function confere(cond: boolean, msg: string) {
  console.log(`${cond ? "ok   " : "FALHA"} ${msg}`);
  if (!cond) falhas++;
}

// ---------- 1. checarLinguagemCFM: casos de unidade
console.log("=== Linguagem segura (CFM) ===");
const casos: [string, boolean][] = [
  ["Resultado garantido em 30 dias.", false],
  ["Tratamento 100% eficaz.", false],
  ["Esse procedimento cura a flacidez.", false],
  ["Veja o antes e depois da paciente.", false],
  ["Consulta por R$ 350 só esta semana.", false],
  ["Promoção de lipo em outubro.", false],
  ["Se você usa Mounjaro, atenção aos sinais.", false],
  ["Sou o melhor dermatologista da cidade.", false],
  ["Técnica revolucionária e infalível.", false],
  ["Você não vai acreditar no que aconteceu.", false],
  ["Obrigada, @maria.silva, pela pergunta.", false],
  ["R$ 4.200 investidos em anúncios, 120 conversas.", true],
  ["O tema sobre exames foi o mais salvo do mês.", true],
  ["A procura por consulta aumentou; reposição hormonal foi o tema da semana.", true],
  ["De vez em quando vale repetir o tema.", true],
];
for (const [t, esperado] of casos) confere(checarLinguagemCFM(t).ok === esperado, `${esperado ? "passa " : "barra "} "${t}"`);
const r1 = tornarSeguro("Sou o melhor dermatologista da cidade. Atendo às terças.");
confere(r1.texto === "Sou um bom dermatologista da cidade. Atendo às terças.", `reescreve superlativo: "${r1.texto}"`);
const r2 = tornarSeguro("Se você usa Mounjaro, atenção aos sinais.");
confere(r2.texto === "Se você usa medicamento, atenção aos sinais.", `troca remédio: "${r2.texto}"`);
// Mudança intencional: a checagem NUNCA apaga. A frase de risco recebe uma reescrita segura (padrão)
// e fica listada com o original e as palavras marcadas; a equipe pode manter o original.
const r3 = tornarSeguro("Resultado garantido. O post de exames teve 1.375 salvamentos.");
confere(
  r3.texto === "Resultado possível. O post de exames teve 1.375 salvamentos." && r3.alteracoes[0].corrigido === "Resultado possível." && r3.alteracoes[0].trechos.length > 0 && !r3.alteracoes[0].mantido,
  `promessa reescrita, não removida: "${r3.texto}"`,
);
const r3b = tornarSeguro("Resultado garantido. O post de exames teve 1.375 salvamentos.", { manter: ["Resultado garantido."] });
confere(r3b.texto === "Resultado garantido. O post de exames teve 1.375 salvamentos." && r3b.alteracoes[0].mantido, `"manter original" deixa a frase como foi gerada: "${r3b.texto}"`);
const r3c = tornarSeguro("Esse procedimento cura a flacidez.");
confere(r3c.texto === "Esse procedimento melhora a flacidez." && r3c.alteracoes[0].trechos.includes("cura"), `"cura" vira sugestão segura e fica marcado: "${r3c.texto}"`);
for (const [t] of casos) {
  const s = tornarSeguro(t);
  confere(s.texto.trim().length > 0 && checarLinguagemCFM(s.texto).ok, `nunca apaga e a sugestão passa na checagem: "${t}" → "${s.texto}"`);
}
const r4 = tornarSeguro("A Dra. Ana respondeu. Muito bem.");
confere(r4.texto === "A Dra. Ana respondeu. Muito bem.", "não quebra frase em \"Dra.\"");
const sug = checarLinguagemCFM("Promoção de lipo em outubro.");
confere(!sug.ok && sug.achados[0].sugestao === "[oferta omitida] de lipo em outubro.", `texto editado: aponta e sugere, sem mudar (${sug.achados[0]?.sugestao})`);

// ---------- 2. guarda de comentários
console.log("\n=== Ruído dos comentários ===");
const g = duvidasRepetidas([
  { text: "Como abaixar o cortisol??", author_username: "a" },
  { text: "E como tratar Cortisol alto gente??", author_username: "b" },
  { text: "como tratar cortisol alto?", author_username: "b" }, // mesma pessoa
  { text: "😂😂😂😂 ?", author_username: "c" },
  { text: "@fulana o que seria?", author_username: "d" },
  { text: "Participe do sorteio, link na bio!", author_username: "e" },
  { text: "Qual o magnésio?", author_username: "f" },
]);
confere(g.duvidas.length === 1 && g.duvidas[0].tema === "cortisol" && g.duvidas[0].pessoas === 2, `cortisol por 2 pessoas (a mesma pessoa não conta 2x): ${JSON.stringify(g.duvidas)}`);
confere(g.ruido === 3, `3 comentários de ruído (emoji, @ sem conteúdo, sorteio): ${g.ruido}`);

// ---------- 3. relatório dos 2 clientes reais
type Cliente = typeof lana | typeof juliana;
function entrada(c: Cliente): EnvioInput {
  const { start, end } = PERIODO;
  const meio = "2026-09-28";
  const linhas: LinhaAds[] = c.ads.map(([h, id, , g2, i, lc, cv, ld, lpv]) => ({ date: h === 1 ? start : meio, campaign_id: id, spend: g2, impressions: i, link_clicks: lc, conversations: cv, leads: ld, landing_page_views: lpv }));
  const cad = new Map<string, CampanhaCadastro>();
  for (const [, id, obj] of c.ads) cad.set(id, { campaign_id: id, name: `Campanha ${obj.replace("OUTCOME_", "").toLowerCase()} …${id.slice(-4)}`, objective: obj });
  const dias = daysBetween(start, end);
  return {
    clientName: c.nome,
    periodLabel: PERIODO.label,
    start,
    end,
    hoje: PERIODO.hoje,
    fontes: c.fontes,
    metrics: c.metrics.map(([date, followers_count, reach, new_followers]) => ({ date, followers_count, reach, new_followers })),
    posts: c.posts.map(([format, tema, reach, saved, caption, posted_at], i) => ({ id: String(i), format, tema, reach, saved, caption, posted_at, permalink: null })),
    perguntas: c.perguntas.map(([text, author_username], i) => ({ id: String(i), text, author_username })),
    alcanceUnico: null, // a leitura do alcance único vem da Meta ao vivo; fora do app, cai na soma diária
    ads: { diag: diagnosticarAds(linhas, [...cad.values()], start, end), diasComDado: dias.slice(0, c.adsDias) },
    // Só a QUANTIDADE de dias com registro é real; quais dias, aqui, é ilustrativo.
    wts: c.wts ? { resumo: c.wts, diasComDado: dias.slice(0, c.wts.dias) } : null,
    crm: { resumo: c.crm, diasComDado: dias.slice(0, c.crm.dias) },
  };
}

for (const c of [juliana, lana]) {
  const r = buildRelatorioEnvio(entrada(c));
  console.log(`\n\n################ ${c.nome} ################`);
  console.log("\n--- Checagem antes de enviar ---");
  for (const k of r.checagem) {
    console.log(`[${k.status === "ok" ? "OK" : "ATENÇÃO"}] ${k.titulo}: ${k.resumo}`);
    for (const d of k.detalhes) console.log(`     · ${d}`);
  }
  console.log(`\n--- 1. WhatsApp (${r.whatsapp.length} caracteres) ---\n${r.whatsapp}`);
  console.log(`\n--- 2. Executiva ---\n${r.executiva}`);
  console.log("\n--- 3. PDF (página 1, estrutura) ---");
  for (const s of SECOES) {
    console.log(`\n## ${s.titulo}`);
    for (const i of r.conteudo[s.id]) console.log(`- ${i.texto}${i.evidencia ? `\n    evidência: ${i.evidencia}` : ""}`);
    if (r.conteudo[s.id].length === 0) console.log("(nada nesta seção)");
  }
  console.log("");
  confere(r.whatsapp.length <= LIMITE_WHATSAPP, `WhatsApp com até ${LIMITE_WHATSAPP} caracteres (${r.whatsapp.length})`);
  confere(checarLinguagemCFM(r.whatsapp).ok && checarLinguagemCFM(r.executiva).ok, "WhatsApp e executiva passam na checagem CFM");
  const pontos = r.executiva.split("\n").filter((l) => l.startsWith("• ") && !r.conteudo.testes.some((t) => l === `• ${t.curto}`)).length;
  const decisoes = r.executiva.split("\n").filter((l) => /^\d\. /.test(l)).length;
  confere(pontos >= 5 && pontos <= 8 && decisoes === 3, `executiva com ${pontos} pontos e ${decisoes} decisões`);
  confere(!/[—–]/.test(r.whatsapp + r.executiva), "sem travessão");
  const emojis = (r.whatsapp.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  confere(emojis <= 3, `emojis com parcimônia no WhatsApp (${emojis})`);
  confere(!/mediana|\bCTR\b|\bCPM\b|\btaxa\b/i.test(r.whatsapp + r.executiva), "sem jargão (mediana, CTR, CPM, taxa)");
  for (const p of c.perguntas) {
    const trecho = String(p[0]).slice(0, 25);
    if (trecho.length >= 20 && (r.whatsapp + r.executiva).includes(trecho)) confere(false, `comentário citado: ${trecho}`);
  }
  confere(r.insights.every((i) => i.evidencia.trim().length > 0), "toda recomendação tem evidência");
}

// ---------- 4. recomendação sem amostra mínima sai (caso sintético)
console.log("\n=== Recomendação sem amostra mínima ===");
const pouco = buildRelatorioEnvio({
  ...entrada(lana),
  posts: [["reels", "Exames", 90000, 900], ["reels", "Exames", 80000, 800], ["reels", "Sono", 70000, 10], ["carrossel", "Sono", 900, 1], ["carrossel", "Sono", 800, 1], ["carrossel", "Pele", 700, 1]].map(([format, tema, reach, saved], i) => ({ id: String(i), format, tema, reach, saved, caption: "x", engagement: Math.round(Number(reach) * (format === "reels" ? 0.06 : 0.02)) })),
  perguntas: [{ text: "Qual exame pedir para tireoide?", author_username: "a" }],
});
console.log(pouco.checagem.find((k) => k.id === "recomendacao")!.detalhes.filter((d) => d.startsWith("Descartada")).join("\n"));
confere(pouco.descartadas.some((d) => /formato/.test(d.titulo)) && pouco.descartadas.some((d) => /tema/.test(d.titulo)) && pouco.descartadas.some((d) => /perguntou/.test(d.titulo)), "formato (6 posts), tema (2 posts) e dúvida (1 pessoa) descartados");
confere(!pouco.conteudo.acoes.some((a) => /reels|Exames|tireoide/i.test(a.texto)), "nada descartado aparece nas ações");
confere(pouco.omitidos.some((o) => /recomendação .*perguntou.*amostra pequena/.test(o)), "recomendação descartada aparece em \"Não incluído por falta de dado\"");

// ---------- 5. "Não incluído por falta de dado": os casos do relatório antigo continuam avisados
console.log("\n=== Não incluído por falta de dado ===");
const semDado = buildRelatorioEnvio({
  ...entrada(lana),
  metrics: [{ date: PERIODO.start, followers_count: 100, reach: null, new_followers: 1 }], // 1 dia de seguidores, sem alcance
  posts: [{ id: "1", format: "reels", tema: "X", reach: null, saved: 1, caption: "x" }], // nenhum post com alcance
  perguntas: [],
});
console.log(semDado.omitidos.map((o) => `  · ${o}`).join("\n"));
confere(semDado.omitidos.some((o) => o.startsWith("seguidores (menos de 2 dias")), "seguidores com menos de 2 dias");
confere(semDado.omitidos.some((o) => o.startsWith("post destaque (nenhum post com alcance")), "post destaque sem alcance");
confere(semDado.omitidos.some((o) => o.startsWith("alcance (nenhum dia")), "alcance sem coleta");
confere(semDado.omitidos.some((o) => o.startsWith("atendimento (WhatsApp de atendimento não conectado")), "WhatsApp não conectado (caso antigo)");
const semAcoes = buildRelatorioEnvio({ ...entrada(lana), posts: [], perguntas: [], ads: null, crm: null, fontes: { ...lana.fontes, tem_anuncios: false, tem_crm: false } });
confere(semAcoes.omitidos.some((o) => o.startsWith("ações recomendadas (sem dado")), "ações sem dado");
confere(semAcoes.omitidos.some((o) => o.startsWith("anúncios (conta de anúncios não conectada")) && semAcoes.omitidos.some((o) => o.startsWith("CRM (não conectado")), "anúncios e CRM não conectados");

// ---------- 6. "O que entra no texto": a escolha vale para WhatsApp, executiva e PDF (conteudo)
console.log("\n=== O que entra no texto ===");
const cheio = buildRelatorioEnvio(entrada(lana));
const semAcoesTexto = buildRelatorioEnvio({ ...entrada(lana), excluir: ["secao:acoes", "resumo:alcance"] });
confere(cheio.whatsapp.includes("*Ações recomendadas*") && !semAcoesTexto.whatsapp.includes("*Ações recomendadas*"), "seção desmarcada sai do WhatsApp");
confere(!/^\d\. Aprovar:/m.test(semAcoesTexto.executiva) && /^\d\. Aprovar:/m.test(cheio.executiva), "seção desmarcada sai das decisões da executiva");
confere(semAcoesTexto.conteudo.acoes.length === 0 && semAcoesTexto.conteudoCompleto.acoes.length > 0, "seção desmarcada sai do conteúdo do PDF (e continua no conteúdo completo)");
confere(!semAcoesTexto.conteudo.resumo.some((i) => i.id === "alcance") && !/alcances diários/.test(semAcoesTexto.whatsapp), "bloco desmarcado (alcance) sai das versões");
confere(semAcoesTexto.excluidos.length === 2, `exclusões registradas para o PDF: ${semAcoesTexto.excluidos.join(" | ")}`);
confere(cheio.blocos.length === SECOES.reduce((a, s) => a + cheio.conteudoCompleto[s.id].length, 0), `${cheio.blocos.length} blocos para escolher`);

// ---------- 7. CFM no relatório: item nunca some (post destaque com "cura" na legenda)
console.log("\n=== CFM não apaga item ===");
const postsCura = entrada(lana).posts.map((p: any, i: number) => (i === 0 ? { ...p, reach: 9_999_999, caption: "Isso cura a enxaqueca de vez" } : p));
const comCura = buildRelatorioEnvio({ ...entrada(lana), posts: postsCura });
const top = comCura.conteudo.vitorias.find((i) => i.id === "post-top");
confere(!!top && /melhora a enxaqueca/.test(top.texto), `post destaque continua, com sugestão segura: ${top?.texto}`);
const alt = comCura.alteracoes.find((a) => a.original.includes("cura a enxaqueca"));
confere(!!alt && alt.trechos.includes("cura") && !alt.mantido, `palavra marcada e listada na checagem: ${alt?.trechos.join(", ")}`);
const mantido = buildRelatorioEnvio({ ...entrada(lana), posts: postsCura, manterOriginal: alt ? [alt.original] : [] });
confere(mantido.conteudo.vitorias.some((i) => i.id === "post-top" && i.texto.includes("cura a enxaqueca")) && mantido.alteracoes.some((a) => a.mantido), "\"Manter original\" volta o texto gerado");

// ---------- 8. PDF: renderiza em Node e confere o que foi restaurado
await (async () => {
  console.log("\n=== PDF completo (render em Node) ===");
  const React = (await import("react")).default;
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { RelatorioCompletoDocument } = await import("../src/lib/pdf-relatorio-completo");
  const e = entrada(lana);
  // Engajamento/interações sintéticos (o arquivo de dados não guarda): só para o PDF ter achado e formato.
  const posts = e.posts.map((p: any, i: number) => ({ ...p, engagement: Math.round(Number(p.reach) * (p.format === "estatico" ? 0.06 : 0.03)) + i % 7, posted_at: `${p.posted_at}T12:00:00Z` }));
  const envio = buildRelatorioEnvio({ ...e, posts, excluir: ["testes:teste-tema"] });
  const diag = e.ads!.diag;
  const dados: any = {
    clientName: lana.nome,
    igHandle: "exemplo",
    specialty: "Ginecologia",
    periodLabel: PERIODO.label,
    start: PERIODO.start,
    end: PERIODO.end,
    fontes: lana.fontes,
    crmNome: "Kommo",
    textoCliente: envio.whatsapp,
    metrics: e.metrics,
    posts,
    perguntas: e.perguntas,
    ads: {
      resumo: { gasto: diag.gasto, campanhas: diag.campanhas.length, conversas: diag.conversas, custo_por_conversa: null, impressoes: diag.impressoes, cliques_link: diag.cliquesLink, ctr: 1.23, cpm: 10, cpc: 1, alcance_somado: 1000, dias: 30 },
      porDia: [],
      porObjetivo: [],
      objetivo: diag,
      diasComDado: e.ads!.diasComDado,
      frequencia: Object.fromEntries(diag.campanhas.map((c, i) => [c.campaign_id, 1 + (i % 5) / 10])),
    },
    wts: null,
    crm: {
      resumo: { novos: 120, ganhos: 9, perdidos: 48 },
      pessoas: null,
      vendas: { vendas_no_periodo: 7, vendas_coorte: 9, fechados_sem_resultado: 0, ultima_venda: PERIODO.end, eventos_desde: "2020-01-01", planilha_ultimo: null, pessoas_novas: 120, pessoas_novas_com_origem: 84, por_origem: [{ origem: "Instagram", pessoas: 60, vendas: 4 }, { origem: "Anúncio", pessoas: 24, vendas: 2 }, { origem: "Não informado", pessoas: 36, vendas: 1 }] },
      porDia: [],
      porEtapaHistorico: [{ etapa: "Contato inicial", total: 900 }],
    },
    omitidos: ["WhatsApp de atendimento (não conectado)"],
    falhas: [],
    envio,
  };
  const buf = await renderToBuffer(React.createElement(RelatorioCompletoDocument, dados) as any);
  confere(buf.length > 10_000 && buf.subarray(0, 5).toString() === "%PDF-", `PDF gerado (${Math.round(buf.length / 1024)} KB)`);
  // Para abrir o PDF: RELATORIO_PDF_OUT=/caminho/relatorio.pdf npx tsx scripts/test-relatorio.ts
  if (process.env.RELATORIO_PDF_OUT) (await import("node:fs")).writeFileSync(process.env.RELATORIO_PDF_OUT, buf);
  const { execFileSync } = await import("node:child_process");
  let texto = "";
  try {
    texto = execFileSync("pdftotext", ["-layout", "-", "-"], { input: buf }).toString();
  } catch {
    console.log("(pdftotext não disponível: conferência do texto do PDF pulada)");
  }
  if (texto) {
    const plano = texto.replace(/\s+/g, " ");
    for (const [rot, re] of [
      ["O achado do período", /O achado do período/],
      ["insight de formato por taxa de interação", /taxa de interação/],
      // Rótulo de KPI e de caixa saem em maiúsculas no PDF.
      ["Impressões e CTR na página 1", /Impressões[\s\S]{0,400}CTR 1,23%/i],
      ["coluna Conv.", /Conv\./],
      ["coluna Custo/conv.", /Custo\/conv\./],
      ["coluna Freq. com nota", /Freq\.\*[\s\S]*média das frequências diárias/],
      ["ideias que vêm de dúvidas", /Dúvida repetida[\s\S]{0,300}pessoas diferentes perguntaram sobre/i],
      ["6 seções", /Resumo do período[\s\S]*Principais vitórias[\s\S]*Ações recomendadas/],
      ["diagnóstico por objetivo", /Resultado por objetivo/],
      ["vendas do período na página 1", /7 vendas fechadas no período/],
      ["comercial do período, sem histórico misturado", /De onde vieram os contatos novos[\s\S]*Histórico total do CRM/i],
      ["origem com a mesma régua do ROI", /70%/],
      ["nota dos algoritmos de dúvida", /Como as dúvidas foram contadas/],
      ["Não incluído por falta de dado", /Não incluído por falta de dado/],
      ["exclusão registrada", /Retirado do envio por escolha da equipe/],
    ] as [string, RegExp][]) confere(re.test(plano), `PDF: ${rot}`);
    for (const p of lana.perguntas) {
      const trecho = String(p[0]).replace(/\s+/g, " ").slice(0, 30);
      if (trecho.length >= 25 && plano.includes(trecho)) confere(false, `PDF cita comentário: ${trecho}`);
    }
    confere(!/@x\b/.test(plano), "PDF sem @ de quem comentou");
  }
})();

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
