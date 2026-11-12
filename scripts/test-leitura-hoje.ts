// Ações da tela "O que fazer hoje" (Phase 3.1.1, plano 05): regra fixa sobre os fatos das leituras, sem IA e sem banco.
// Confere os casos do plano: portão negado, 3 a 5 ações com a fixture da Lana, ordem do Próximo e das outras, destino de
// cada ação, as exclusões da Phase 9 (ids e chaves), poucas ações, repetidas, determinismo e a saudação.
// Rodar: npx tsx scripts/test-leitura-hoje.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diagnosticarAds } from "../src/lib/anuncios-objetivo";
import { montarResultado } from "../src/lib/resultado";
import { avaliarRastreio } from "../src/lib/rastreio-anuncios";
import { REGISTRO_DE_TELAS } from "../src/lib/registro-de-telas";
import type { Insight } from "../src/lib/insight";
import { fatosDeResultadosComAreas } from "../src/lib/leitura/fatos-resultados";
import { fatosDePublicacoes } from "../src/lib/leitura/fatos-instagram";
import { resumirClinica } from "../src/lib/leitura/resumo-clinica";
import { checarTextoDaLeitura, montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import type { Fato, FatosDaTela, PassoFato, TomFato } from "../src/lib/leitura/tipos";
import {
  CHAVES_EXCLUIDAS_DA_HOJE,
  EXCLUIDOS_DA_HOJE,
  FAMILIA_DO_FATO,
  GUARDA_DE_NUMERO_DA_HOJE,
  GUARDA_DE_TEXTO_DA_HOJE,
  JARGAO_DA_HOJE,
  MAXIMO_POR_AREA,
  MAX_CARACTERES_DA_LEGENDA,
  MAX_CARACTERES_DA_MANCHETE,
  PREFIXOS_EXCLUIDOS_DA_HOJE,
  ROTA_DA_AREA,
  VERSAO_REGRAS_HOJE,
  acoesDaHoje,
  avisoDePoucasAcoes,
  checarTextoDaHoje,
  nomeDaSaudacao,
  saudacaoDaHora,
  type AcaoDaHoje,
  type AreaDaHoje,
  type EntradaHoje,
  type HojeDaClinica,
} from "../src/lib/leitura/fatos-hoje";
import { leads, ig, ads, posts, adsCampanhas } from "./fixtures/lana-2026-10";

const C = "/_authenticated/$clientId";
assert.equal(VERSAO_REGRAS_HOJE, 3);

// ---------- fixture da Lana (a mesma de test-leitura-resultados.ts) ----------
const START = "2026-09-13", END = "2026-10-12", HOJE = "2026-10-14";
const alcance: Record<string, number> = { "2026-09-13":61623,"2026-09-14":58056,"2026-09-15":67139,"2026-09-16":53382,"2026-09-17":47272,"2026-09-18":42881,"2026-09-19":39477,"2026-09-20":37724,"2026-09-21":30967,"2026-09-22":30734,"2026-09-23":35195,"2026-09-24":42662,"2026-09-25":95179,"2026-09-26":81621,"2026-09-27":67709,"2026-09-28":91403,"2026-09-29":132261,"2026-09-30":84931,"2026-10-01":52075,"2026-10-02":37995,"2026-10-03":36884,"2026-10-04":62354,"2026-10-05":32303,"2026-10-06":36768,"2026-10-07":33028,"2026-10-08":47120,"2026-10-09":39077,"2026-10-10":29260,"2026-10-11":30235,"2026-10-12":32332 };
const diag = diagnosticarAds(
  adsCampanhas.map(([h, id, , g, i, lc, cv, ld, lpv]) => ({ date: h === 1 ? START : END, campaign_id: id, spend: g, impressions: i, link_clicks: lc, conversations: cv, leads: ld, landing_page_views: lpv })),
  [...new Map(adsCampanhas.map(([, id, obj]) => [id, { campaign_id: id, name: `${obj} …${id.slice(-4)}`, objective: obj }])).values()],
  START, END,
);
const lana = montarResultado({
  start: START, end: END, hoje: HOJE,
  diario: ig.map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date], new_followers: 180, followers_count: 128000 })),
  posts: posts.map(([posted_at, engagement, caption]) => ({ posted_at, engagement, caption, format: "reels" })),
  adsDiag: diag, adsPorDia: ads.map(([dia, gasto]) => ({ dia, gasto })),
  wts: { atendimentos: 640, espera_mediana_seg: 47 * 60, sem_roteamento: 20 },
  crm: { novos: 978, ganhos: 9 }, leadsPorDia: leads.map(([dia, total]) => ({ dia, total })),
  fontes: { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true },
});
const FUNIL = { atual: { mandaram_mensagem: 978, agendaram: 120, fecharam: 9 }, anterior: { mandaram_mensagem: 800, agendaram: 150, fecharam: 12 } };
const deLana = (extra: Partial<Parameters<typeof fatosDeResultadosComAreas>[0]> = {}) =>
  fatosDeResultadosComAreas({ resultado: lana, de: START, ate: END, hoje: HOJE, funil: FUNIL, ...extra });
const entradaDaLana = (extra: Partial<EntradaHoje> = {}): EntradaHoje => {
  const { fatos, porArea } = deLana();
  return { fatos, porArea, insights: lana.insights, limitacoes: lana.limitacoes, ...extra };
};

// ---------- ajudantes de fixture sintética ----------
const base: FatosDaTela = deLana().fatos;
const fato = (id: string, tom: TomFato, peso: 1 | 2 | 3, extra: Partial<Fato> = {}): Fato => ({
  id, tom, peso, frase: `O alcance do grupo ${id} mudou no período.`, numeros: [{ chave: "evidencia", exibicao: `alcance de ${id}: 1.200` }], ...extra,
});
const passo = (id: string, extra: Partial<PassoFato> = {}): PassoFato => ({ verbo: "revisar", texto: `os posts do grupo ${id}`, quem: "social_media", fatoId: id, ...extra });
const tela = (fatos: Fato[], passos: PassoFato[], extra: Partial<FatosDaTela> = {}): FatosDaTela => ({
  ...base, portao: { ok: true }, fatos, proximoPasso: passos[0] ?? null, outrosPassos: passos.slice(1), ...extra,
});
const semAreas = (fatos: Fato[]) => ({ resumo: fatos, conteudo: [], anuncios: [], comercial: [], ideias: [] });
/** Espalha os fatos pelas áreas do resultado (resumo, conteudo, anuncios, comercial): a Hoje lê a área pela aba de destino. */
const emAreas = (mapa: Record<string, "resumo" | "conteudo" | "anuncios" | "comercial">, fatos: Fato[]) => ({
  resumo: fatos.filter((f) => mapa[f.id] === "resumo"),
  conteudo: fatos.filter((f) => mapa[f.id] === "conteudo"),
  anuncios: fatos.filter((f) => mapa[f.id] === "anuncios"),
  comercial: fatos.filter((f) => mapa[f.id] === "comercial"),
  ideias: [],
});
const sintetica = (fatos: Fato[], passos: PassoFato[], extra: Partial<EntradaHoje> = {}): EntradaHoje => ({
  fatos: tela(fatos, passos), porArea: semAreas(fatos), insights: [], ...extra,
});
const acoes = (h: HojeDaClinica): AcaoDaHoje[] => {
  assert.equal(h.tipo, "acoes");
  return h.tipo === "acoes" ? [...(h.proxima ? [h.proxima] : []), ...h.outras] : [];
};
const ids = (h: HojeDaClinica) => acoes(h).map((a) => a.id);
const rotaDoRegistro = (rota: string) => REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca);

// ---------- portão negado: o mesmo motivo, passo e quem do resumo da clínica ----------
const negado = deLana({ rastreio: avaliarRastreio({ cliquesLink: 7391, conversas: 29 }) });
assert.ok(!negado.fatos.portao.ok);
const hNegado = acoesDaHoje({ fatos: negado.fatos, porArea: negado.porArea, insights: lana.insights });
assert.equal(hNegado.tipo, "sem_leitura");
const textoNegado = montarTexto(negado.fatos);
if (hNegado.tipo === "sem_leitura" && textoNegado.tipo === "sem_leitura") {
  assert.equal(hNegado.motivo, textoNegado.motivo, "mesmo motivo de montarTexto");
  assert.deepEqual(hNegado.passo, textoNegado.passo, "mesmo passo e mesmo responsável");
  assert.equal(hNegado.passo.quem, "gestor_trafego");
  const resumoNegado = resumirClinica({ fatos: negado.fatos, porArea: negado.porArea, passos: [] });
  assert.equal(resumoNegado.tipo, "sem_leitura");
  if (resumoNegado.tipo === "sem_leitura") assert.equal(hNegado.motivo, resumoNegado.motivo, "o mesmo motivo do resumo de Resultados da clínica");
  assert.deepEqual(checarTextoDaLeitura(hNegado.motivo), []);
}

// ---------- Lana: de 3 a 5 ações, cada uma com número, quem resolve, frase limpa e destino vivo ----------
const hLana = acoesDaHoje(entradaDaLana());
const listaLana = acoes(hLana);
assert.ok(listaLana.length >= 3 && listaLana.length <= 5, `a Lana tem de 3 a 5 ações (tem ${listaLana.length})`);
for (const area of ["instagram", "anuncios", "comercial", "resultados"] as AreaDaHoje[])
  assert.ok(listaLana.filter((a) => a.areaHoje === area).length <= MAXIMO_POR_AREA, `a Lana tem mais de ${MAXIMO_POR_AREA} ações em ${area}`);
for (const a of listaLana) {
  assert.ok(a.numero.exibicao.length > 0, `${a.id}: sem número ao lado`);
  assert.ok(a.rotuloQuem.length > 0 && a.quem, `${a.id}: sem quem resolve`);
  assert.deepEqual(checarTextoDaLeitura(a.frase), [], `${a.id}: frase reprovada pelo filtro de linguagem`);
  assert.deepEqual(checarTextoDaLeitura(a.legenda ?? ""), [], `${a.id}: legenda reprovada`);
  assert.ok(!GUARDA_DE_TEXTO_DA_HOJE.test(`${a.frase} ${a.legenda ?? ""} ${a.numero.exibicao}`), `${a.id}: texto dos 4 números da Phase 9`);
  assert.ok(!GUARDA_DE_NUMERO_DA_HOJE.test(`${a.legenda ?? ""} ${a.numero.exibicao}`), `${a.id}: número de destaque de agendamento, venda, consulta ou contato`);
  // Manchete: até 40 caracteres, leiga, sem jargão em nenhum texto que o médico lê; o técnico fica em numerosTecnicos.
  assert.ok(a.destaque.length <= MAX_CARACTERES_DA_MANCHETE, `${a.id}: manchete com mais de 40 caracteres (${a.destaque})`);
  assert.deepEqual(checarTextoDaHoje(a.destaque, MAX_CARACTERES_DA_MANCHETE), [], `${a.id}: manchete reprovada`);
  for (const texto of [a.destaque, a.frase, a.legenda ?? "", a.contexto, a.outroNumero?.exibicao ?? ""]) assert.ok(!JARGAO_DA_HOJE.test(texto), `${a.id}: jargão em "${texto}"`);
  assert.match(a.contexto, /^\d+ dias?( · .+)?$/, `${a.id}: contexto "N dias"`);
  const linha = rotaDoRegistro(a.rota);
  assert.ok(linha, `${a.id}: a rota ${a.rota} não é linha do registro`);
  assert.notEqual(linha!.situacao, "tirada", `${a.id}: aponta para tela tirada em 11/11/2026`);
  assert.ok(!linha!.soRedireciona, `${a.id}: aponta para rota que só redireciona`);
}
assert.equal(new Set(listaLana.map((a) => a.id)).size, listaLana.length, "sem fato repetido");
assert.equal(new Set(listaLana.map((a) => a.frase)).size, listaLana.length, "sem frase repetida");
for (const id of EXCLUIDOS_DA_HOJE) assert.ok(!ids(hLana).includes(id), `a Lana mostrou o fato excluído ${id}`);
for (const a of listaLana) for (const p of PREFIXOS_EXCLUIDOS_DA_HOJE) assert.ok(!a.id.startsWith(p), `${a.id}: prefixo excluído`);
// O Próximo é a "Ação da semana" do resumo da clínica para os mesmos dados.
const { fatos: fatosLana, porArea: areasLana } = deLana();
const resumoLana = resumirClinica({ fatos: fatosLana, porArea: areasLana, passos: [fatosLana.proximoPasso, ...fatosLana.outrosPassos].filter((p) => p != null) });
assert.equal(resumoLana.tipo, "resumo");
if (resumoLana.tipo === "resumo" && hLana.tipo === "acoes") assert.equal(hLana.proxima?.frase, resumoLana.acao?.frase, "o Próximo é a Ação da semana de Resultados");
console.log(`  Lana: ${listaLana.length} ações:`, listaLana.map((a) => `${a.id} -> ${a.rota.replace(C, "")}`).join(" | "));

// ---------- 6 passos válidos: Próximo + 4, na ordem peso, tom, fonte e ordem ----------
const seis = [
  fato("a", "ruim", 1), fato("b", "bom", 3), fato("c", "atencao", 2),
  fato("d", "ruim", 2), fato("e", "bom", 1), fato("f", "atencao", 3),
];
// Com o limite de 2 por área, os 6 fatos se espalham por Resultados, Instagram, Anúncios e Comercial: a ordem por peso e tom é a mesma.
const areasDosSeis = { a: "resumo", b: "conteudo", c: "anuncios", d: "comercial", e: "resumo", f: "conteudo" } as const;
const hSeis = acoesDaHoje({ ...sintetica(seis, seis.map((f) => passo(f.id))), porArea: emAreas(areasDosSeis, seis) });
assert.equal(hSeis.tipo, "acoes");
if (hSeis.tipo === "acoes") {
  assert.equal(hSeis.proxima?.id, "a", "o Próximo é a Ação da semana (o primeiro passo), mesmo com peso menor");
  assert.equal(hSeis.outras.length, 4, "Próximo mais 4 outras: 5 no total");
  assert.deepEqual(hSeis.outras.map((a) => a.id), ["f", "b", "d", "c"], "peso decrescente, depois ruim, atenção, bom; a de peso 1 fica de fora");
  assert.equal(hSeis.aviso, null, "com 3 ou mais ações não há aviso");
}
// Os 6 fatos na mesma área: só 2 entram (o Próximo conta), as outras vagas ficam vazias e o aviso fala de poucas ações.
const hMesmaArea = acoesDaHoje(sintetica(seis, seis.map((f) => passo(f.id))));
assert.deepEqual(ids(hMesmaArea), ["a", "f"], "no máximo 2 por área: a Ação da semana e a de maior peso");
assert.ok(acoes(hMesmaArea).every((a) => a.areaHoje === "resultados"));
if (hMesmaArea.tipo === "acoes") assert.equal(hMesmaArea.aviso, "Poucas ações nesta semana: as leituras deste período pediram só 2 ações.");

// Empate de peso e tom: vale a ordem das fontes (Resultados antes de Pacientes, publicações e Desempenho) e a ordem dentro de cada uma.
const empate = acoesDaHoje({
  ...sintetica([fato("r1", "ruim", 2), fato("r2", "ruim", 2)], [passo("r1"), passo("r2")]),
  extras: [
    { tela: "pacientes", rota: `${C}/pacientes`, fatos: tela([fato("p1", "ruim", 2)], [passo("p1")], { tela: "pacientes" }) },
    { tela: "posts", rota: `${C}/posts`, fatos: tela([fato("g1", "ruim", 2), fato("g2", "ruim", 2)], [passo("g1"), passo("g2")], { tela: "posts" }) },
    { tela: "conteudo", rota: `${C}/conteudo`, fatos: tela([fato("d1", "ruim", 2)], [passo("d1")], { tela: "conteudo" }) },
  ],
});
assert.deepEqual(ids(empate), ["r1", "r2", "p1", "g1", "g2"], "empate: Resultados, Pacientes, publicações, Desempenho, cada uma na própria ordem; no máximo 5");
const destinos = new Map(acoes(empate).map((a) => [a.id, a.rota]));
assert.equal(destinos.get("p1"), `${C}/pacientes`, "o fato de Pacientes vai para /pacientes");
assert.equal(destinos.get("g1"), `${C}/posts`, "o fato de publicações vai para /posts");

// Próximo excluído (Ação da semana de um fato dos 4 números): vale o primeiro passo válido.
const proximoExcluido = acoesDaHoje(sintetica([fato("agendaram", "ruim", 3), fato("x", "atencao", 2), fato("y", "ruim", 2)], [passo("agendaram"), passo("x"), passo("y")]));
assert.deepEqual(ids(proximoExcluido), ["y", "x"], "sem a excluída, o primeiro válido (por peso e tom) vira o Próximo");

// O Próximo é a Ação da semana mesmo quando outra fonte traz o mesmo fato com peso maior (id repetido entre Resultados e Desempenho).
const repetidoEntreFontes = acoesDaHoje({
  ...sintetica([fato("topo", "ruim", 3), fato("fm", "bom", 1)], [passo("topo"), passo("fm", { texto: "o formato de Resultados" })]),
  extras: [{ tela: "conteudo", rota: `${C}/conteudo`, fatos: tela([fato("fm", "bom", 3)], [passo("fm", { texto: "o formato do Desempenho" })], { tela: "conteudo" }) }],
});
assert.deepEqual(ids(repetidoEntreFontes), ["topo", "fm"], "o mesmo fato em duas fontes vira uma ação só");
// Quando a Ação da semana é a segunda do resumo (a primeira não entra), ela ainda é o Próximo.
const daSemanaNaoPrimeira = acoesDaHoje(sintetica([fato("agendaram", "ruim", 3), fato("sem", "bom", 1), fato("alto", "ruim", 3)], [passo("agendaram"), passo("sem"), passo("alto")]));
assert.deepEqual(ids(daSemanaNaoPrimeira), ["alto", "sem"], "sem a primeira (excluída) a Hoje parte do melhor colocado");

// ---------- destino de cada ação ----------
const insight = (id: string, rota: string | undefined, area: Insight["area"] = "conteudo"): Insight => ({
  id, area, tom: "ruim", titulo: `O alcance do grupo ${id} mudou no período.`, diagnostico: "Mudou.", evidencia: `alcance de ${id}: 1.200`,
  confianca: "alta", impacto: "alto", acao: { texto: `Revisar os posts do grupo ${id}.`, rota }, responsavel: "social_media",
});
const rotaDe = (rota: string | undefined, area: Insight["area"] = "conteudo") => {
  const f = fato("i", "ruim", 3);
  const h = acoesDaHoje({
    fatos: tela([f], [passo("i")]),
    porArea: { ...semAreas([]), [area]: [f] },
    insights: [insight("i", rota, area)],
  });
  return acoes(h)[0]?.rota;
};
assert.equal(rotaDe("/$clientId/posts"), `${C}/posts`);
assert.equal(rotaDe("posts"), `${C}/posts`, "rota sem a pasta");
assert.equal(rotaDe("/$clientId/conversas"), `${C}/atendimento`, "conversas só redireciona para atendimento");
assert.equal(rotaDe("/$clientId/crm-painel", "comercial"), `${C}/crm-painel`);
assert.equal(rotaDe("/$clientId/agentes", "comercial"), ROTA_DA_AREA.comercial, "agentes foi tirada em 11/11/2026: vale a aba da área");
assert.equal(rotaDe(undefined, "anuncios"), ROTA_DA_AREA.anuncios, "sem destino, vale a aba da área");
assert.equal(rotaDe("/$clientId/inexistente", "ideias"), ROTA_DA_AREA.ideias, "destino que não existe também cai na aba da área");
assert.equal(rotaDe("/$clientId/ideias", "ideias"), `${C}/ideias`, "/ideias abre Encontrar ideias");
for (const [area, rota] of Object.entries(ROTA_DA_AREA)) {
  const linha = rotaDoRegistro(rota);
  assert.ok(linha && linha.situacao !== "tirada" && !linha.soRedireciona, `ROTA_DA_AREA.${area} (${rota}) tem de ser tela viva ou escondida do registro`);
}

// ---------- exclusões da Phase 9: ids, prefixos e chaves ----------
for (const id of [...EXCLUIDOS_DA_HOJE, "mudou-0", "mudou-7", "sem-medida-agendaram", "sem-medida-compareceram", "comercial:performance:agendamento", "comercial:operacao:parados"]) {
  const h = acoesDaHoje(sintetica([fato(id, "ruim", 3), fato("ok", "atencao", 1)], [passo(id), passo("ok")]));
  assert.deepEqual(ids(h), ["ok"], `o fato ${id} nunca vira ação`);
}
for (const chave of CHAVES_EXCLUIDAS_DA_HOJE) {
  const h = acoesDaHoje(sintetica([fato("n", "ruim", 3, { numeros: [{ chave, exibicao: "alcance de 12" }] }), fato("ok", "atencao", 1)], [passo("n"), passo("ok")]));
  assert.deepEqual(ids(h), ["ok"], `fato com número de chave ${chave} nunca vira ação`);
}
for (const id of ["leads", "entraram", "atendidos", "agendaram", "compraram", "maior-perda"]) assert.ok(EXCLUIDOS_DA_HOJE.includes(id), `${id} fica na lista literal`);
assert.ok(EXCLUIDOS_DA_HOJE.length >= 6);
// Um insight excluído também não entra pelo caminho dos insights (sem passo na lista).
const viaInsight = acoesDaHoje({ fatos: tela([], []), porArea: semAreas([]), insights: [insight("leads", "/$clientId/crm-painel", "comercial"), insight("cruz-posts", "/$clientId/posts"), insight("ok-i", "/$clientId/posts")] });
assert.deepEqual(ids(viaInsight), ["ok-i"], "insight com id excluído não vira ação");

// Guarda de texto: frase, legenda e número que falam dos 4 números.
const porTexto = (extraFato: Partial<Fato>, extraPasso: Partial<PassoFato> = {}) =>
  ids(acoesDaHoje(sintetica([fato("t", "ruim", 3, extraFato), fato("ok", "atencao", 1)], [passo("t", extraPasso), passo("ok")])));
assert.deepEqual(porTexto({ frase: "Muitas pessoas agendaram no período." }), ["ok"], "legenda com 'agendaram'");
assert.deepEqual(porTexto({ frase: "Quem chamaram a clínica caiu." }), ["ok"], "legenda com 'chamaram'");
assert.deepEqual(porTexto({}, { texto: "quem fecharam neste mês" }), ["ok"], "frase da ação com 'fecharam'");
assert.deepEqual(porTexto({ numeros: [{ chave: "evidencia", exibicao: "120 compareceram" }] }), ["ok"], "número com 'compareceram'");
assert.deepEqual(porTexto({ frase: "Quem foi à consulta mudou no período." }), ["ok"], "legenda com 'foram à consulta' (guarda de número)");
assert.deepEqual(porTexto({ numeros: [{ chave: "evidencia", exibicao: "30 agendamentos" }] }), ["ok"], "número de agendamentos");
assert.deepEqual(porTexto({ numeros: [{ chave: "evidencia", exibicao: "9 vendas" }] }), ["ok"], "número de vendas");
assert.deepEqual(porTexto({ numeros: [{ chave: "evidencia", exibicao: "12 comparecimentos" }] }), ["ok"], "número de comparecimentos");
assert.deepEqual(porTexto({ numeros: [{ chave: "evidencia", exibicao: "50 contatos novos" }] }), ["ok"], "número de contatos novos");
assert.deepEqual(porTexto({ frase: "Os novos contatos do período mudaram." }), ["ok"], "legenda com novos contatos");
assert.deepEqual(porTexto({}), ["t", "ok"], "sanidade: o fato do teste passa quando o texto é limpo");
assert.ok(GUARDA_DE_TEXTO_DA_HOJE.test("Os pacientes foram à consulta.") && GUARDA_DE_TEXTO_DA_HOJE.test("Quem Fecharam"), "a guarda de texto reconhece as frases");
assert.ok(GUARDA_DE_NUMERO_DA_HOJE.test("9 vendas") && !GUARDA_DE_NUMERO_DA_HOJE.test("alcance de 12.000"), "a guarda de número reconhece os números");

// ---------- nunca inventa ----------
const semNumero = acoesDaHoje(sintetica([fato("s", "ruim", 3, { numeros: [] }), fato("ok", "atencao", 1)], [passo("s"), passo("ok")]));
assert.deepEqual(ids(semNumero), ["ok"], "ação sem número ao lado não entra");
const semFato = acoesDaHoje(sintetica([fato("ok", "atencao", 1)], [passo("fantasma"), passo("ok")]));
assert.deepEqual(ids(semFato), ["ok"], "passo de um fato que não existe não entra");
const semFatoId = acoesDaHoje(sintetica([fato("ok", "atencao", 1)], [{ verbo: "revisar", texto: "algo sem origem", quem: "equipe_hub" }, passo("ok")]));
assert.deepEqual(ids(semFatoId), ["ok"], "passo sem fatoId não entra");
const neutro = acoesDaHoje(sintetica([fato("n", "neutro", 3), fato("ok", "atencao", 1)], [passo("n"), passo("ok")]));
assert.deepEqual(ids(neutro), ["ok"], "fato neutro não é conclusão e não vira ação");

// Insight com evidência longa demais para virar um número só (mais de 220 caracteres): sem número, a ação não entra.
const evidenciaLonga = `Reels: alcance mediano 1.340, salvamento 0,5% (10 posts) · ${"Carrossel: alcance mediano 1.380, salvamento 0,5% (10 posts) · ".repeat(4)}`;
const comEvidenciaLonga = acoesDaHoje({ fatos: tela([], []), porArea: semAreas([]), insights: [{ ...insight("ev", "/$clientId/posts"), evidencia: evidenciaLonga }] });
assert.deepEqual(ids(comEvidenciaLonga), [], "evidência longa demais não vira número: a Hoje não inventa um trecho dela");

// ---------- repetidas viram uma ----------
const mesmaFrase = acoesDaHoje(sintetica([fato("m1", "ruim", 3), fato("m2", "atencao", 2)], [passo("m1", { texto: "os posts do mesmo grupo" }), passo("m2", { texto: "os posts do mesmo grupo" })]));
assert.deepEqual(ids(mesmaFrase), ["m1"], "mesma frase: fica a melhor colocada");
const mesmoFato = acoesDaHoje(sintetica([fato("u", "ruim", 3)], [passo("u", { texto: "os posts de um jeito" }), passo("u", { texto: "os posts de outro jeito" })]));
assert.deepEqual(ids(mesmoFato), ["u"], "mesmo fato: uma ação só");

// ---------- poucas ações, com o motivo ----------
const duas = [fato("a", "ruim", 3), fato("b", "atencao", 2)];
const hDuas = acoesDaHoje(sintetica(duas, duas.map((f) => passo(f.id))));
assert.equal(hDuas.tipo, "acoes");
if (hDuas.tipo === "acoes") {
  assert.equal(hDuas.proxima?.id, "a");
  assert.equal(hDuas.outras.length, 1);
  assert.equal(hDuas.aviso, "Poucas ações nesta semana: as leituras deste período pediram só 2 ações.");
  assert.deepEqual(checarTextoDaLeitura(hDuas.aviso ?? ""), []);
}
const fontes = [{ fonte: "Instagram", tom: "atencao" as const, ate: "2026-10-01" }, { fonte: "CRM", tom: "bom" as const, ate: "2026-10-13" }];
const comFonteAtrasada = acoesDaHoje(sintetica(duas, duas.map((f) => passo(f.id)), { fontes }));
if (comFonteAtrasada.tipo === "acoes") assert.equal(comFonteAtrasada.aviso, "Poucas ações nesta semana: o Instagram está sem dado novo desde 01/10.");
const pior = acoesDaHoje(sintetica(duas, duas.map((f) => passo(f.id)), { fontes: [{ fonte: "CRM", tom: "atencao", ate: "2026-10-05" }, { fonte: "WhatsApp", tom: "ruim", ate: "2026-10-02" }] }));
if (pior.tipo === "acoes") assert.equal(pior.aviso, "Poucas ações nesta semana: o WhatsApp está sem dado novo desde 02/10.", "a pior fonte (ruim antes de atenção)");
const comExcluida = acoesDaHoje(sintetica([fato("a", "ruim", 3), fato("leads", "ruim", 3)], [passo("a"), passo("leads")]));
if (comExcluida.tipo === "acoes") {
  assert.deepEqual(ids(comExcluida), ["a"]);
  assert.equal(comExcluida.aviso, "Poucas ações nesta semana: as outras ações dependem de números que ainda não têm selo.");
}
const uma = acoesDaHoje(sintetica([fato("a", "ruim", 3)], [passo("a")]));
if (uma.tipo === "acoes") assert.equal(uma.aviso, "Poucas ações nesta semana: as leituras deste período pediram só 1 ação.");
const nenhuma = acoesDaHoje(sintetica([], []));
assert.equal(nenhuma.tipo, "acoes");
if (nenhuma.tipo === "acoes") {
  assert.equal(nenhuma.proxima, null);
  assert.deepEqual(nenhuma.outras, []);
  assert.equal(nenhuma.aviso, "Poucas ações nesta semana: as leituras deste período não pediram nenhuma ação.");
}
assert.equal(avisoDePoucasAcoes(3), null);
assert.equal(avisoDePoucasAcoes(5), null);
assert.ok(avisoDePoucasAcoes(2)?.startsWith("Poucas ações nesta semana:"));
assert.match(avisoDePoucasAcoes(0, { fontes: [{ fonte: "anúncios", tom: "ruim", ate: null }] }) ?? "", /os anúncios está sem dado novo\.$/);
// Fonte com portão negado nos extras não gera ação.
const extraNegado = acoesDaHoje({
  ...sintetica([fato("a", "ruim", 3)], [passo("a")]),
  extras: [{ tela: "posts", rota: `${C}/posts`, fatos: tela([fato("g", "ruim", 3)], [passo("g")], { tela: "posts", portao: { ok: false, codigo: "sem_dado", motivo: "sem dado", passo: { verbo: "conferir", texto: "a fonte", quem: "equipe_hub" } } }) }],
});
assert.deepEqual(ids(extraNegado), ["a"], "extra com o portão negado não gera ação");

// ---------- manchete: curta, leiga, e o número técnico inteiro fica em numerosTecnicos ----------
const TECNICO = "Reels: alcance mediano 1.340, salvamento 0,5% (10 posts) · Carrossel: alcance mediano 1.380, salvamento 0,5% (10 posts) · Estático: alcance mediano 1.100, salvamento 0,4% (10 posts)";
const unica = (f: Fato, p: Partial<PassoFato> = {}): AcaoDaHoje | undefined => acoes(acoesDaHoje(sintetica([f], [passo(f.id, p)])))[0];

// (b) o número é técnico e longo: vale a manchete que a regra escreveu.
const comManchete = unica(fato("fmt", "bom", 2, { manchete: "Post de foto alcançou mais", frase: "Estático é o formato que mais leva o perfil a gente nova.", numeros: [{ chave: "evidencia", exibicao: TECNICO }] }));
assert.ok(comManchete, "o fato com manchete e número técnico vira ação");
assert.equal(comManchete!.destaque, "Post de foto alcançou mais");
assert.equal(comManchete!.destaqueEhNumero, false);
assert.deepEqual(comManchete!.numerosTecnicos, [TECNICO], "a string técnica inteira vai para o Ver números");
assert.equal(comManchete!.legenda, "Estático é o formato que mais leva o perfil a gente nova.");
assert.equal(comManchete!.contexto, "30 dias", "sem número leigo sobrando, o contexto é só os dias");
for (const texto of [comManchete!.destaque, comManchete!.frase, comManchete!.legenda ?? "", comManchete!.contexto]) assert.ok(!/mediano|salvamento \d/i.test(texto), `jargão em "${texto}"`);

// (a) um número curto e leigo ganha da manchete.
const numeroCurto = unica(fato("curto", "ruim", 2, { manchete: "Uma manchete que não deve valer", numeros: [{ chave: "posts", exibicao: "30 de 30 posts" }, { chave: "evidencia", exibicao: TECNICO }] }));
assert.equal(numeroCurto!.destaque, "30 de 30 posts");
assert.equal(numeroCurto!.destaqueEhNumero, true);
assert.deepEqual(numeroCurto!.numerosTecnicos, [TECNICO]);
// O número curto mas com jargão ("alcance mediano 1.340") não vira destaque: vai para numerosTecnicos e vale a primeira oração da frase.
const curtoComJargao = unica(fato("jg", "ruim", 2, { frase: "Estático leva longe, Carrossel faz guardar.", numeros: [{ chave: "evidencia", exibicao: "alcance mediano 1.340" }] }));
assert.equal(curtoComJargao!.destaque, "Estático leva longe", "(c) a primeira oração da frase do fato");
assert.equal(curtoComJargao!.destaqueEhNumero, false);
assert.equal(curtoComJargao!.legenda, "Estático leva longe, Carrossel faz guardar.", "a legenda é a frase inteira");
assert.deepEqual(curtoComJargao!.numerosTecnicos, ["alcance mediano 1.340"]);
// (c) sem separador na frase e curta: a própria frase vira a manchete e não há legenda.
const fraseCurta = unica(fato("fc", "ruim", 2, { frase: "O Instagram parou de postar.", numeros: [{ chave: "evidencia", exibicao: TECNICO }] }));
assert.equal(fraseCurta!.destaque, "O Instagram parou de postar");
assert.equal(fraseCurta!.legenda, null);
// (d) número longo, sem manchete e frase longa sem separador: não vira ação (a regra nunca corta no meio de uma palavra).
assert.equal(unica(fato("longa", "ruim", 3, { frase: "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe.", numeros: [{ chave: "evidencia", exibicao: TECNICO }] })), undefined);
assert.equal(unica(fato("longa2", "ruim", 3, { manchete: "Uma manchete bem comprida que passa de quarenta caracteres", frase: "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe.", numeros: [{ chave: "evidencia", exibicao: TECNICO }] })), undefined, "manchete com mais de 40 caracteres não vale");
assert.equal(unica(fato("jm", "ruim", 3, { manchete: "Reels: alcance mediano alto", numeros: [{ chave: "evidencia", exibicao: TECNICO }], frase: "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe." })), undefined, "manchete com jargão não vale");
// (a2) último recurso: nem número curto, nem manchete, nem oração curta; um trecho inteiro do número que começa por algarismo vale.
// É o que mantém a Ação da semana de Resultados na Hoje ("640 atendimentos; espera mediana …"). O número inteiro vai para o Ver números.
const comTrecho = unica(fato("tr", "ruim", 3, { frase: "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe.", numeros: [{ chave: "evidencia", exibicao: "640 atendimentos; espera mediana até a 1ª resposta 47 min; 3% sem equipe" }] }));
assert.equal(comTrecho!.destaque, "640 atendimentos");
assert.equal(comTrecho!.destaqueEhNumero, true);
assert.deepEqual(comTrecho!.numerosTecnicos, ["640 atendimentos; espera mediana até a 1ª resposta 47 min; 3% sem equipe"]);
assert.equal(unica(fato("tr2", "ruim", 3, { frase: "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe.", numeros: [{ chave: "evidencia", exibicao: "LINK_CLICKS …0169: R$ 365,00 · outra campanha parecida" }] })), undefined, "trecho que não começa por algarismo não vale");
// Jargão e siglas na frase da ação ou do fato: a ação não entra.
for (const texto of ["o salvamento 0,5% dos posts", "o CPC das campanhas", "a CTR do anúncio", "o CPM do anúncio", "o alcance mediano dos posts"])
  assert.equal(unica(fato("j1", "ruim", 3), { texto }), undefined, `frase da ação com jargão: ${texto}`);
assert.equal(unica(fato("j2", "ruim", 3, { frase: "O alcance mediano caiu no período." })), undefined, "frase do fato com jargão");
assert.ok(JARGAO_DA_HOJE.test("alcance mediano 1.340") && JARGAO_DA_HOJE.test("Medianas") && JARGAO_DA_HOJE.test("salvamento 0,5%") && JARGAO_DA_HOJE.test("taxa de salvamento") && JARGAO_DA_HOJE.test("o CTR"));
assert.ok(!JARGAO_DA_HOJE.test("Post de foto alcançou mais") && !JARGAO_DA_HOJE.test("salvamentos por pessoa") && !JARGAO_DA_HOJE.test("immediato"), "o jargão é palavra inteira");
assert.deepEqual(checarTextoDaHoje("Post de foto alcançou mais", MAX_CARACTERES_DA_MANCHETE), []);
assert.ok(checarTextoDaHoje("Uma manchete bem comprida que passa de quarenta caracteres", MAX_CARACTERES_DA_MANCHETE).some((p) => p.includes("40")));
assert.ok(checarTextoDaHoje("30 agendamentos").length > 0 && checarTextoDaHoje("Quem fecharam").length > 0 && checarTextoDaHoje("mediano").length > 0, "as 2 guardas da Phase 9 e o jargão entram na checagem");

// Contexto: "{N} dias" e, se sobra um número leigo e curto, "30 dias · 10 posts"; o terceiro número vira o outroNumero.
const comContexto = unica(fato("ctx", "ruim", 2, { numeros: [{ chave: "a", exibicao: "30 de 30 posts" }, { chave: "b", exibicao: "10 posts" }, { chave: "c", exibicao: "R$ 1.000 investidos" }] }));
assert.equal(comContexto!.contexto, "30 dias · 10 posts");
assert.equal(comContexto!.outroNumero?.exibicao, "R$ 1.000 investidos");
assert.deepEqual(comContexto!.numerosTecnicos, []);
// Os 4 números da Phase 9 não voltam por um caminho novo: número que bate na guarda nunca entra em destaque, contexto ou Ver números.
const comGuarda = unica(fato("g9", "ruim", 2, { numeros: [{ chave: "a", exibicao: "30 de 30 posts" }, { chave: "b", exibicao: "12 agendamentos" }, { chave: "c", exibicao: "9 vendas" }] }));
assert.equal(comGuarda!.contexto, "30 dias");
assert.equal(comGuarda!.outroNumero, undefined);
assert.deepEqual(comGuarda!.numerosTecnicos, []);

// ---------- área: pela aba final da ação ----------
const ABAS_POR_AREA: [string, AreaDaHoje][] = [
  ["conteudo", "instagram"], ["top", "instagram"], ["posts", "instagram"], ["audiencia", "instagram"], ["ideias", "instagram"], ["conteudo-comercial", "instagram"],
  ["anuncios", "anuncios"], ["campanhas", "anuncios"], ["links", "anuncios"],
  ["pacientes", "comercial"], ["consultas", "comercial"], ["vendas", "comercial"], ["crm-painel", "comercial"], ["jornada", "comercial"],
  ["vendas-kommo", "comercial"], ["atendimento", "comercial"], ["central-atendimento", "comercial"], ["crm-contatos", "comercial"],
];
for (const [aba, esperada] of ABAS_POR_AREA) {
  const f = fato("ab", "ruim", 3);
  const h = acoesDaHoje({ fatos: tela([f], [passo("ab")]), porArea: semAreas([f]), insights: [insight("ab", `/$clientId/${aba}`, "conteudo")] });
  const a = acoes(h)[0];
  // A aba só vale quando é linha viva do registro; as outras caem na aba da área (e a área sai da Area do fato).
  if (a && a.rota === `${C}/${aba}`) assert.equal(a.areaHoje, esperada, `a aba ${aba} é da área ${esperada}`);
}
const emResultados = acoes(acoesDaHoje({ fatos: tela([fato("rz", "ruim", 3)], [passo("rz")]), porArea: semAreas([fato("rz", "ruim", 3)]), insights: [] }))[0];
assert.equal(emResultados.areaHoje, "resultados", "o subcaminho vazio é Resultados");
const porAreaDoFato = (area: "conteudo" | "ideias" | "anuncios" | "comercial") => {
  const f = fato("pa", "ruim", 3);
  const h = acoesDaHoje({ fatos: tela([f], [passo("pa")]), porArea: { ...semAreas([]), [area]: [f] }, insights: [insight("pa", "/$clientId/agentes", area)] });
  return acoes(h)[0].areaHoje; // destino que saiu do registro: vale a aba da área do fato
};
assert.equal(porAreaDoFato("conteudo"), "instagram");
assert.equal(porAreaDoFato("ideias"), "instagram");
assert.equal(porAreaDoFato("anuncios"), "anuncios");
assert.equal(porAreaDoFato("comercial"), "comercial");

// Preenchimento: 4 de Instagram com peso 3, 1 de Anúncios e 1 de Resultados com peso 1 dão 2 de Instagram, depois Anúncios e Resultados.
const doInsta = ["i1", "i2", "i3", "i4"].map((id) => fato(id, "ruim", 3));
const outros = [fato("an", "atencao", 1), fato("rs", "atencao", 1)];
const preenche = acoesDaHoje({
  ...sintetica([...doInsta, ...outros], [...doInsta, ...outros].map((f) => passo(f.id))),
  porArea: emAreas({ i1: "conteudo", i2: "conteudo", i3: "conteudo", i4: "conteudo", an: "anuncios", rs: "resumo" }, [...doInsta, ...outros]),
});
assert.deepEqual(ids(preenche), ["i1", "i2", "an", "rs"], "2 de Instagram; as vagas que sobram vão para Anúncios e Resultados");
assert.deepEqual(acoes(preenche).map((a) => a.areaHoje), ["instagram", "instagram", "anuncios", "resultados"]);

// ---------- família: o mesmo achado com ids diferentes é uma ação só ----------
assert.deepEqual([FAMILIA_DO_FATO.formato, FAMILIA_DO_FATO["formato-melhor-taxa"], FAMILIA_DO_FATO["formato-sem-comparacao"]], ["formato", "formato", "formato"]);
const fmt = fato("formato", "bom", 2, { manchete: "Post de foto alcançou mais", numeros: [{ chave: "evidencia", exibicao: TECNICO }] });
const fmtTaxa = fato("formato-melhor-taxa", "bom", 3, { manchete: "Post de foto foi mais salvo", numeros: [{ chave: "taxa", exibicao: "5,8% contra 5,1% (10 e 10 posts)" }] });
const daFamilia = acoesDaHoje({
  ...sintetica([fmt], [passo("formato", { texto: "os posts de foto" })]),
  porArea: emAreas({ formato: "conteudo" }, [fmt]),
  extras: [{ tela: "posts", rota: `${C}/posts`, fatos: tela([fmtTaxa], [passo("formato-melhor-taxa", { texto: "o formato Imagem nos próximos posts" })], { tela: "posts" }) }],
});
assert.deepEqual(ids(daFamilia), ["formato"], "formato e formato-melhor-taxa são uma família só, e fica o Próximo (a Ação da semana)");
assert.equal(acoes(daFamilia)[0].familia, "formato");

// ---------- o caso do print: Instagram repetido e tarefa da equipe ----------
const print = [
  fato("formato", "bom", 3, { manchete: "Post de foto alcançou mais", numeros: [{ chave: "evidencia", exibicao: TECNICO }] }),
  fato("ig2", "ruim", 3), fato("ig3", "ruim", 3), fato("ig4", "atencao", 3), fato("anun", "atencao", 2), fato("resu", "atencao", 1),
];
const extraPrint = [
  fato("formato-melhor-taxa", "bom", 3, { manchete: "Post de foto foi mais salvo", numeros: [{ chave: "taxa", exibicao: "5,8% contra 5,1% (10 e 10 posts)" }] }),
  fato("posts-sem-tema", "atencao", 3),
];
const doPrint = acoesDaHoje({
  ...sintetica(print, print.map((f) => passo(f.id))),
  porArea: emAreas({ formato: "conteudo", ig2: "conteudo", ig3: "conteudo", ig4: "conteudo", anun: "anuncios", resu: "resumo" }, print),
  extras: [{ tela: "posts", rota: `${C}/posts`, fatos: tela(extraPrint, [passo("formato-melhor-taxa"), passo("posts-sem-tema", { soEquipe: true })], { tela: "posts" }) }],
});
assert.equal(doPrint.tipo, "acoes");
if (doPrint.tipo === "acoes") {
  assert.equal(doPrint.proxima?.id, "formato", "o Próximo é o formato de Instagram");
  assert.equal(acoes(doPrint).filter((a) => a.areaHoje === "instagram").length, MAXIMO_POR_AREA, "2 de Instagram ao todo, contando o Próximo");
  assert.ok(acoes(doPrint).some((a) => a.areaHoje === "anuncios") && acoes(doPrint).some((a) => a.areaHoje === "resultados"), "as vagas que sobram vão para Anúncios e Resultados");
  assert.ok(!ids(doPrint).includes("formato-melhor-taxa"), "nenhum cartão da família formato");
  assert.ok(!ids(doPrint).includes("posts-sem-tema"));
  assert.deepEqual(doPrint.paraEquipe.map((a) => a.id), ["posts-sem-tema"], "posts-sem-tema só em paraEquipe");
  assert.equal(new Set(acoes(doPrint).map((a) => a.familia)).size, acoes(doPrint).length, "nenhuma família repetida");
}

// ---------- determinismo ----------
assert.deepEqual(acoesDaHoje(entradaDaLana()), acoesDaHoje(entradaDaLana()), "mesma entrada, mesma saída");
assert.deepEqual(acoesDaHoje(sintetica(seis, seis.map((f) => passo(f.id)))), acoesDaHoje(sintetica(seis, seis.map((f) => passo(f.id)))));
// Toda frase de ação passa no filtro de linguagem, inclusive as do aviso (a regra reaproveita montarTexto).
if (hLana.tipo === "acoes") {
  assert.deepEqual(problemasDoTexto({ tipo: "resumo", aconteceu: null, preocupa: null, acao: hLana.proxima ? { frase: hLana.proxima.frase, verbo: hLana.proxima.verbo, quem: hLana.proxima.quem, rotuloQuem: hLana.proxima.rotuloQuem } : null, semAcaoMotivo: hLana.aviso }), []);
}

// ---------- saudação ----------
for (const [hora, esperado] of [[0, "Boa noite"], [4, "Boa noite"], [5, "Bom dia"], [11, "Bom dia"], [12, "Boa tarde"], [17, "Boa tarde"], [18, "Boa noite"], [23, "Boa noite"]] as const)
  assert.equal(saudacaoDaHora(hora), esperado, `${hora} h`);
// O nome só aparece quando clients.name já começa por título de médico (palavra inteira); nome de clínica nunca é usado nem cortado.
assert.equal(nomeDaSaudacao("Dra. Lana Ribeiro"), "Dra. Lana");
assert.equal(nomeDaSaudacao("Dr. João Pedro Alves"), "Dr. João");
assert.equal(nomeDaSaudacao("dra Lana"), "dra Lana", "título como foi escrito, sem diferença de maiúscula");
assert.equal(nomeDaSaudacao("  Doutora   Ana Maria "), "Doutora Ana");
assert.equal(nomeDaSaudacao("Doutor Pedro"), "Doutor Pedro");
for (const nome of ["Clínica de teste", "Clínica de Dermatologia Avançada e Estética Integrada Ltda", "  Clínica   Boa Vida  Ltda ", "Lana", "Drauzio Varella", "Dra.", "Dr", "Dra.Lana", "", "   ", null, undefined])
  assert.equal(nomeDaSaudacao(nome), null, `nomeDaSaudacao(${JSON.stringify(nome)}) tem de ser null`);

// ---------- "Para a equipe": o passo soEquipe nunca chega ao médico ----------
const comEquipe = acoesDaHoje(sintetica(
  [fato("a", "ruim", 3), fato("eq", "atencao", 3), fato("b", "bom", 2)],
  [passo("a"), passo("eq", { texto: "o tema dos posts sem classificação", soEquipe: true }), passo("b")],
));
assert.equal(comEquipe.tipo, "acoes");
if (comEquipe.tipo === "acoes") {
  assert.ok(!ids(comEquipe).includes("eq"), "a ação da equipe não está em proxima nem em outras");
  assert.deepEqual(comEquipe.paraEquipe.map((a) => a.id), ["eq"]);
  assert.ok(comEquipe.paraEquipe.every((a) => a.soEquipe === true));
  assert.ok(acoes(comEquipe).every((a) => a.soEquipe === false));
  assert.equal(comEquipe.aviso, "Poucas ações nesta semana: as leituras deste período pediram só 2 ações.", "o aviso conta só as ações do médico");
}
// Quando a Ação da semana é de arrumação da equipe, o Próximo é a primeira ação do médico (não fica vazio, não usa a da equipe).
const semanaDaEquipe = acoesDaHoje(sintetica(
  [fato("eq", "ruim", 3), fato("x", "atencao", 2), fato("y", "ruim", 2)],
  [passo("eq", { soEquipe: true }), passo("x"), passo("y")],
));
if (semanaDaEquipe.tipo === "acoes") {
  assert.equal(semanaDaEquipe.proxima?.id, "y", "o Próximo é a primeira ação do médico");
  assert.deepEqual(semanaDaEquipe.paraEquipe.map((a) => a.id), ["eq"]);
}
// Só arrumação da equipe: o Próximo fica vazio e o aviso diz que não houve ação.
const soDaEquipe = acoesDaHoje(sintetica([fato("eq", "ruim", 3)], [passo("eq", { soEquipe: true })]));
if (soDaEquipe.tipo === "acoes") {
  assert.equal(soDaEquipe.proxima, null);
  assert.deepEqual(soDaEquipe.outras, []);
  assert.equal(soDaEquipe.paraEquipe.length, 1);
  assert.equal(soDaEquipe.aviso, "Poucas ações nesta semana: as leituras deste período não pediram nenhuma ação.");
}
// paraEquipe: no máximo 3, sem repetir id nem frase; houveExcluidas não vem de passo da equipe.
const muitasDaEquipe = acoesDaHoje(sintetica(
  ["e1", "e2", "e3", "e4", "e5"].map((id) => fato(id, "atencao", 1)),
  [passo("e1", { texto: "a mesma frase", soEquipe: true }), passo("e2", { texto: "a mesma frase", soEquipe: true }), passo("e3", { soEquipe: true }), passo("e4", { soEquipe: true }), passo("e5", { soEquipe: true })],
));
if (muitasDaEquipe.tipo === "acoes") {
  assert.deepEqual(muitasDaEquipe.paraEquipe.map((a) => a.id), ["e1", "e3", "e4"], "no máximo 3, sem frase repetida");
  assert.ok(!muitasDaEquipe.aviso?.includes("selo"), "passo da equipe não liga o motivo dos números sem selo");
}
// A fixture da Lana com 30 posts sem tema (como nos mocks do e2e): posts-sem-tema fica em paraEquipe e fora da lista.
const FORMATOS = ["reels", "carrossel", "estatico"];
const postsSemTema = Array.from({ length: 30 }, (_, i) => ({
  format: FORMATOS[i % 3], posted_at: `2026-10-${String(2 + (i % 10)).padStart(2, "0")}T15:00:00Z`, reach: 800 + i * 40, saved: 5 + (i % 6), tema: null,
}));
const comPosts = acoesDaHoje(entradaDaLana({ extras: [{ tela: "posts", rota: `${C}/posts`, fatos: fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts: postsSemTema }) }] }));
assert.equal(comPosts.tipo, "acoes");
if (comPosts.tipo === "acoes") {
  assert.ok(!ids(comPosts).includes("posts-sem-tema"), "posts-sem-tema fora da lista do médico");
  assert.ok(comPosts.paraEquipe.some((a) => a.id === "posts-sem-tema"), "posts-sem-tema em paraEquipe");
  assert.ok(comPosts.paraEquipe.length <= 3);
}

// ---------- legenda de 1 frase e até 90 caracteres; comparação com barras (quick 261112-e8e) ----------
assert.equal(MAX_CARACTERES_DA_LEGENDA, 90);
// Frase do fato com mais de 90 caracteres: legenda null, a frase inteira vai para o começo de numerosTecnicos (nunca corta no meio de palavra).
const FRASE_LONGA = "Quem chama no WhatsApp espera muito tempo pela primeira resposta da equipe do consultório em todos os dias.";
assert.ok(FRASE_LONGA.length > 90 && !/[.!?]\s/.test(FRASE_LONGA));
const legendaLonga = unica(fato("lg", "ruim", 3, { manchete: "Espera longa no WhatsApp", frase: FRASE_LONGA, numeros: [{ chave: "evidencia", exibicao: "47 min" }] }));
assert.ok(legendaLonga, "o fato de frase longa vira ação");
assert.equal(legendaLonga!.legenda, null, "frase de mais de 90 caracteres não vira legenda");
assert.equal(legendaLonga!.numerosTecnicos[0], FRASE_LONGA, "a frase inteira vai para o Ver números");
// Frase do fato com 2 frases (mesmo curtas): também vai para o Ver números.
const duasFrases = unica(fato("d2", "ruim", 3, { manchete: "Espera longa no WhatsApp", frase: "A espera subiu. A equipe demora a responder.", numeros: [{ chave: "evidencia", exibicao: "47 min" }] }));
assert.ok(duasFrases);
assert.equal(duasFrases!.legenda, null, "duas frases não viram legenda");
assert.equal(duasFrases!.numerosTecnicos[0], "A espera subiu. A equipe demora a responder.");
// Frase de 1 linha e até 90 caracteres continua legenda.
const legendaCurta = unica(fato("lc", "ruim", 3, { manchete: "Espera longa no WhatsApp", frase: "A espera pela primeira resposta subiu neste período.", numeros: [{ chave: "evidencia", exibicao: "47 min" }] }));
assert.equal(legendaCurta!.legenda, "A espera pela primeira resposta subiu neste período.");
assert.equal(legendaCurta!.barras, undefined, "sem comparação, sem barras (e sem a chave)");
assert.ok(!("barras" in legendaCurta!));
// Comparação válida vira legenda e barras.
const comComparacao = unica(fato("cmp", "bom", 2, {
  manchete: "Post de foto alcançou mais",
  frase: "Estático é o formato que mais leva o perfil a gente nova.",
  numeros: [{ chave: "evidencia", exibicao: TECNICO }],
  comparacao: { frase: "Post de foto alcança 2,4x mais que Carrossel.", barras: [{ rotulo: "Post de foto", exibicao: "2.400 pessoas", fracao: 1 }, { rotulo: "Carrossel", exibicao: "1.000 pessoas", fracao: 0.42 }] },
}));
assert.equal(comComparacao!.legenda, "Post de foto alcança 2,4x mais que Carrossel.", "a frase da comparação é a legenda");
assert.equal(comComparacao!.barras?.length, 2);
assert.ok(comComparacao!.barras!.every((b) => b.fracao >= 0 && b.fracao <= 1));
assert.deepEqual(comComparacao!.numerosTecnicos, [TECNICO], "a frase do fato que ficou de fora não é duplicada quando a comparação vale");
// Comparação com rótulo dos 4 números da Phase 9: não vira barra (D-06); a legenda volta para a frase do fato.
const comGuardaNaBarra = unica(fato("cmp2", "bom", 2, {
  manchete: "Post de foto alcançou mais",
  frase: "Estático é o formato que mais leva o perfil a gente nova.",
  numeros: [{ chave: "evidencia", exibicao: TECNICO }],
  comparacao: { frase: "Mais gente chegou até a clínica.", barras: [{ rotulo: "Quem agendaram", exibicao: "10 pessoas", fracao: 1 }] },
}));
assert.equal(comGuardaNaBarra!.barras, undefined, "barra com 'agendaram' não é desenhada");
assert.equal(comGuardaNaBarra!.legenda, "Estático é o formato que mais leva o perfil a gente nova.");
// Comparação com frase de mais de 90 caracteres não vale.
const comFraseLongaNaComparacao = unica(fato("cmp3", "bom", 2, {
  manchete: "Post de foto alcançou mais",
  frase: "Estático é o formato que mais leva o perfil a gente nova.",
  numeros: [{ chave: "evidencia", exibicao: TECNICO }],
  comparacao: { frase: FRASE_LONGA, barras: [{ rotulo: "Post de foto", exibicao: "2.400 pessoas", fracao: 1 }] },
}));
assert.equal(comFraseLongaNaComparacao!.barras, undefined);

// ---------- o módulo é puro: sem banco, sem consulta e sem IA (D-05) ----------
const fonte = readFileSync(new URL("../src/lib/leitura/fatos-hoje.ts", import.meta.url), "utf8");
assert.ok(!/supabase|useQuery|chamarIA|fetch\(/.test(fonte), "fatos-hoje.ts não usa banco, consulta nem IA");
assert.ok(/montarTexto\(/.test(fonte), "toda frase de ação passa por montarTexto");

console.log("test-leitura-hoje: ok");
