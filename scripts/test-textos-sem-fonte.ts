// Textos sem fonte (PR 5 do diagnóstico de medição, 31/10/2026).
// 1. Snapshot dos textos gerados pelo cruzamento (conteúdo x comercial), pelo estoque do CRM, pela
//    regra exibida no Resultado e pela citação da HBR. Mudou um texto de propósito? Rodar com
//    SNAPSHOT_UPDATE=1 e revisar o diff de scripts/fixtures/textos-sem-fonte.snap.json.
// 2. Trava: falha se alguma frase causal sem "pode"/"hipótese" (ou sem fonte citada) sair desses
//    geradores, e se voltar alguma frase removida ("encerre como perdido", "chance de converter"...).
// Rodar: npx tsx scripts/test-textos-sem-fonte.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cruzar, REGRA_CRUZ_CORRELACAO, REGRA_CRUZ_POSTS, type EntradaCruzamento } from "../src/lib/cruzamento";
import { lerVisoes, leituraDoEstoque } from "../src/lib/crm-visoes";
import { montarResultado } from "../src/lib/resultado";
import { BENCHMARKS, CITACAO_HBR_RESPOSTA } from "../src/lib/benchmarks";
import { leads, ig, ads, posts } from "./fixtures/lana-2026-10";

// ---------- Trava de frase causal ----------
// Verbo ou expressão que afirma causa. A frase só passa se marcar a incerteza ("pode", "hipótese"),
// negar a causa ("não prova", "não que", "não dá para saber/medir") ou citar a fonte com ano.
const CAUSAL = /(?<!\p{L})(traz|trazem|trazendo|trouxe|chega pelo|chegam pelo|derruba|derrubam|converte|convertem|causa|causou|gera|geram|gerando|faz (?:subir|cair)|mais chance de|quer dizer que|esfria|esfriam|quase nunca é)(?!\p{L})/iu;
const RESSALVA = /(?<!\p{L})(pode|podem|poderia|hipótese)(?!\p{L})|não prova|não que|não dá para (?:saber|medir)|\([^()]*\b(?:19|20)\d{2}\)/iu;
const PROIBIDAS = [
  /encerr\w* como perdid/i,
  /chance de converter/i,
  /relação real/i,
  /dos 3 dias anteriores/i,
  /trazendo paciente, não só/i,
  /chega pelo anúncio/i,
  /chance de marcar consulta/i,
  /quase nunca é oportunidade/i,
];

const frases = (t: string) => t.split(/(?<=[.!?])\s+|\s+·\s+/).map((s) => s.trim()).filter(Boolean);
function frasesCausaisSemRessalva(textos: string[]): string[] {
  return textos.flatMap(frases).filter((f) => CAUSAL.test(f) && !RESSALVA.test(f));
}

// A trava pega as frases antigas (prova de que ela funciona).
const antigas = [
  "Nos dias em que o perfil teve mais interação, entraram mais leads nos 2 dias seguintes (relação forte). O conteúdo orgânico está trazendo paciente, não só curtida.",
  "Hoje o paciente chega pelo anúncio; o conteúdo está gerando audiência, mas pouco contato.",
  "Pausar o anúncio derruba os leads: não corte verba com base nesta leitura sozinha.",
  "Nesses dias engajamento e lead andaram juntos: são assuntos que atraem e convertem.",
  "Normalmente isso quer dizer que a maior parte dos leads vem de outro lugar.",
  "63% dos brasileiros esperam resposta em até 5 minutos; quem responde em até 1 hora tem ~7x mais chance de converter.",
  "Lead que espera dias esfria: quem responde na primeira hora tem muito mais chance de marcar consulta.",
  "Lead aberto há mais de 30 dias quase nunca é oportunidade viva: trabalhe numa reativação ou encerre como perdido.",
];
assert.equal(frasesCausaisSemRessalva(antigas).length, antigas.length, `a trava deixou passar frase antiga: ${antigas.filter((a) => !frasesCausaisSemRessalva([a]).length).join(" | ")}`);
for (const a of ["O conteúdo orgânico está trazendo paciente, não só curtida.", "quem responde em até 1 hora tem ~7x mais chance de converter.", "encerre como perdido o que não tem chance"])
  assert.ok(PROIBIDAS.some((p) => p.test(a)), `lista de proibidas não pega: ${a}`);
// E deixa passar a versão nova.
assert.deepEqual(frasesCausaisSemRessalva(["Hipótese: o conteúdo pode estar ajudando a gerar contato.", CITACAO_HBR_RESPOSTA, "Mostra que as séries andam juntas, não que uma causa a outra."]), []);

// ---------- Entradas sintéticas para cada ramo do cruzamento ----------
let semente = 42;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const DIAS = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i, 12)).toISOString().slice(0, 10));
function entrada(tipo: "organico" | "anuncio" | "nenhum"): EntradaCruzamento {
  semente = { organico: 7, anuncio: 11, nenhum: 13 }[tipo];
  const igD = DIAS.map(() => 500 + Math.round(aleatorio() * 3000));
  const adsD = DIAS.map(() => (tipo === "anuncio" ? 50 + Math.round(aleatorio() * 400) : 200 + Math.round(aleatorio() * 10)));
  const soma = (v: number[], i: number) => v[i] + (v[i - 1] ?? v[i]) + (v[i - 2] ?? v[i]);
  const leadsD = DIAS.map((_, i) =>
    tipo === "organico" ? Math.round(soma(igD, i) / 150) : tipo === "anuncio" ? Math.round(soma(adsD, i) / 20) : 10 + Math.round(aleatorio() * 30));
  return {
    start: DIAS[0], end: DIAS[DIAS.length - 1],
    leadsPorDia: DIAS.map((dia, i) => ({ dia, total: leadsD[i] })),
    diario: DIAS.map((date, i) => ({ date, total_interactions: igD[i] })),
    adsPorDia: DIAS.map((dia, i) => ({ dia, gasto: adsD[i] })),
    posts: [],
  } as EntradaCruzamento;
}
const lana: EntradaCruzamento = {
  start: "2026-09-13", end: "2026-10-12",
  leadsPorDia: leads.map(([dia, total]) => ({ dia, total })),
  diario: ig.map(([date, total_interactions]) => ({ date, total_interactions })),
  adsPorDia: ads.map(([dia, gasto]) => ({ dia, gasto })),
  posts: posts.map(([posted_at, engagement, caption]) => ({ posted_at, engagement, caption })),
} as EntradaCruzamento;

const casos: Record<string, EntradaCruzamento> = {
  organico: entrada("organico"), anuncio: entrada("anuncio"), nenhum: entrada("nenhum"), lana,
  semCrm: { start: DIAS[0], end: DIAS[29], leadsPorDia: [], diario: [], posts: [] } as EntradaCruzamento,
};
const snap: Record<string, unknown> = {};
const todosTextos: string[] = [];
const idsVistos = new Set<string>();
for (const [nome, e] of Object.entries(casos)) {
  const c = cruzar(e);
  snap[`cruzamento.${nome}`] = {
    insights: c.insights.map((i) => ({ id: i.id, titulo: i.titulo, diagnostico: i.diagnostico, evidencia: i.evidencia, risco: i.risco, regra: i.regra, acao: i.acao?.texto })),
    limitacoes: c.limitacoes.map((l) => l.texto),
  };
  for (const i of c.insights) {
    idsVistos.add(i.id);
    assert.ok(i.regra, `${i.id} sem regra`);
    assert.equal(i.regra, i.id === "cruz-posts" ? REGRA_CRUZ_POSTS : REGRA_CRUZ_CORRELACAO, `${i.id}: regra com a janela errada`);
    todosTextos.push(i.titulo, i.diagnostico, i.evidencia, i.risco ?? "", i.regra ?? "", i.acao?.texto ?? "");
  }
  todosTextos.push(...c.limitacoes.map((l) => l.texto));
}
for (const id of ["cruz-organico", "cruz-anuncio", "cruz-nenhum", "cruz-posts"]) assert.ok(idsVistos.has(id), `o teste não cobriu o ramo ${id}`);

// A janela da regra bate com o código: soma do mesmo dia e dos 2 anteriores.
assert.match(REGRA_CRUZ_CORRELACAO, /do mesmo dia e dos 2 dias anteriores/);
assert.match(REGRA_CRUZ_POSTS, /no dia do post e no dia seguinte/);

// ---------- Estoque do CRM ----------
const estoque = (pctParados: number, naEntrada7: number) =>
  leituraDoEstoque(lerVisoes({ tem_crm: true, abertos: 100, estoque: [
    { etapa: "Novo", entrada: true, total: 50, de_8_a_30: naEntrada7, mais_30: Math.round(pctParados * 50) },
    { etapa: "Em conversa", total: 50, mais_30: Math.round(pctParados * 50) },
  ] })!);
snap["estoque.muitosParados"] = estoque(0.85, 7);
snap["estoque.poucosParados"] = estoque(0.1, 0);
todosTextos.push(String(snap["estoque.muitosParados"]), String(snap["estoque.poucosParados"]));

// ---------- Resultado: explicação da 1ª resposta e regra do cruzamento ----------
const r = montarResultado({
  start: lana.start, end: lana.end, hoje: "2026-10-14",
  diario: ig.map(([date, total_interactions]) => ({ date, total_interactions })),
  posts: [], adsPorDia: lana.adsPorDia, leadsPorDia: lana.leadsPorDia,
  wts: { atendimentos: 337, espera_mediana_seg: 4978, espera_cobertura: 274 },
  crm: { novos: 1, ganhos: 0 },
  fontes: { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true },
});
const resposta = r.metricas.find((m) => m.id === "resposta");
assert.ok(resposta, "card de 1ª resposta deveria aparecer");
snap["resultado.resposta"] = resposta!.explicacao;
snap["resultado.regrasCruz"] = [...new Set(r.insights.filter((i) => i.id.startsWith("cruz-")).map((i) => i.regra))];
snap["hbr.citacao"] = CITACAO_HBR_RESPOSTA;
snap["hbr.referencia"] = BENCHMARKS.primeiraResposta.referencia;
todosTextos.push(resposta!.explicacao, CITACAO_HBR_RESPOSTA, BENCHMARKS.primeiraResposta.referencia, ...(snap["resultado.regrasCruz"] as string[]));
assert.match(CITACAO_HBR_RESPOSTA, /leads de empresas/);
assert.match(CITACAO_HBR_RESPOSTA, /2011/);
assert.match(CITACAO_HBR_RESPOSTA, /qualificar/);
assert.doesNotMatch(resposta!.explicacao, /converter/);

// ---------- Trava nos textos gerados ----------
const ruins = frasesCausaisSemRessalva(todosTextos);
assert.deepEqual(ruins, [], `frase causal sem "pode"/"hipótese":\n${ruins.join("\n")}`);
for (const t of todosTextos) {
  for (const p of PROIBIDAS) assert.doesNotMatch(t, p, `frase removida voltou: ${t}`);
  assert.ok(!t.includes("—"), `travessão no texto: ${t}`);
}

// ---------- Trava no código: as frases removidas não voltam em nenhum lugar de src/ ----------
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !n.endsWith(".gen.ts") ? [p] : [];
  });
}
const raiz = new URL("..", import.meta.url).pathname;
for (const f of arquivos(join(raiz, "src"))) {
  const s = readFileSync(f, "utf8");
  for (const p of PROIBIDAS) assert.doesNotMatch(s, p, `${f.slice(raiz.length)} tem frase removida (${p})`);
}

// ---------- Snapshot ----------
const arqSnap = join(raiz, "scripts/fixtures/textos-sem-fonte.snap.json");
const atual = JSON.stringify(snap, null, 2) + "\n";
if (process.env.SNAPSHOT_UPDATE === "1" || !existsSync(arqSnap)) {
  writeFileSync(arqSnap, atual);
  console.log(`snapshot gravado em ${arqSnap}`);
} else {
  const salvo = JSON.parse(readFileSync(arqSnap, "utf8"));
  assert.deepEqual(snap, salvo, "texto mudou: revise e rode com SNAPSHOT_UPDATE=1 se a mudança for de propósito");
}
console.log(`ok: ${todosTextos.length} textos conferidos, ${Object.keys(snap).length} entradas de snapshot`);
