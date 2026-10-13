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
const r3 = tornarSeguro("Resultado garantido. O post de exames teve 1.375 salvamentos.");
confere(r3.texto === "O post de exames teve 1.375 salvamentos." && r3.alteracoes[0].corrigido === null, `remove promessa: "${r3.texto}"`);
const r4 = tornarSeguro("A Dra. Ana respondeu. Muito bem.");
confere(r4.texto === "A Dra. Ana respondeu. Muito bem.", "não quebra frase em \"Dra.\"");

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
  posts: [["reels", "Exames", 90000, 900], ["reels", "Exames", 80000, 800], ["reels", "Sono", 70000, 10], ["carrossel", "Sono", 900, 1], ["carrossel", "Sono", 800, 1], ["carrossel", "Pele", 700, 1]].map(([format, tema, reach, saved], i) => ({ id: String(i), format, tema, reach, saved, caption: "x" })),
  perguntas: [{ text: "Qual exame pedir para tireoide?", author_username: "a" }],
});
console.log(pouco.checagem.find((k) => k.id === "recomendacao")!.detalhes.filter((d) => d.startsWith("Descartada")).join("\n"));
confere(pouco.descartadas.some((d) => /formato/.test(d.titulo)) && pouco.descartadas.some((d) => /tema/.test(d.titulo)) && pouco.descartadas.some((d) => /perguntou/.test(d.titulo)), "formato (6 posts), tema (2 posts) e dúvida (1 pessoa) descartados");
confere(!pouco.conteudo.acoes.some((a) => /reels|Exames|tireoide/i.test(a.texto)), "nada descartado aparece nas ações");

console.log(`\n${falhas === 0 ? "TUDO OK" : `${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
