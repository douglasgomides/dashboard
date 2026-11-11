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
import { resumirClinica } from "../src/lib/leitura/resumo-clinica";
import { checarTextoDaLeitura, montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import type { Fato, FatosDaTela, PassoFato, TomFato } from "../src/lib/leitura/tipos";
import {
  CHAVES_EXCLUIDAS_DA_HOJE,
  EXCLUIDOS_DA_HOJE,
  GUARDA_DE_NUMERO_DA_HOJE,
  GUARDA_DE_TEXTO_DA_HOJE,
  PREFIXOS_EXCLUIDOS_DA_HOJE,
  ROTA_DA_AREA,
  VERSAO_REGRAS_HOJE,
  acoesDaHoje,
  avisoDePoucasAcoes,
  nomeDaSaudacao,
  saudacaoDaHora,
  type AcaoDaHoje,
  type EntradaHoje,
  type HojeDaClinica,
} from "../src/lib/leitura/fatos-hoje";
import { leads, ig, ads, posts, adsCampanhas } from "./fixtures/lana-2026-10";

const C = "/_authenticated/$clientId";
assert.equal(VERSAO_REGRAS_HOJE, 1);

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
for (const a of listaLana) {
  assert.ok(a.numero.exibicao.length > 0, `${a.id}: sem número ao lado`);
  assert.ok(a.rotuloQuem.length > 0 && a.quem, `${a.id}: sem quem resolve`);
  assert.deepEqual(checarTextoDaLeitura(a.frase), [], `${a.id}: frase reprovada pelo filtro de linguagem`);
  assert.deepEqual(checarTextoDaLeitura(a.legenda), [], `${a.id}: legenda reprovada`);
  assert.ok(!GUARDA_DE_TEXTO_DA_HOJE.test(`${a.frase} ${a.legenda} ${a.numero.exibicao}`), `${a.id}: texto dos 4 números da Phase 9`);
  assert.ok(!GUARDA_DE_NUMERO_DA_HOJE.test(`${a.legenda} ${a.numero.exibicao}`), `${a.id}: número de destaque de agendamento, venda, consulta ou contato`);
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
const hSeis = acoesDaHoje(sintetica(seis, seis.map((f) => passo(f.id))));
assert.equal(hSeis.tipo, "acoes");
if (hSeis.tipo === "acoes") {
  assert.equal(hSeis.proxima?.id, "a", "o Próximo é a Ação da semana (o primeiro passo), mesmo com peso menor");
  assert.equal(hSeis.outras.length, 4, "Próximo mais 4 outras: 5 no total");
  assert.deepEqual(hSeis.outras.map((a) => a.id), ["f", "b", "d", "c"], "peso decrescente, depois ruim, atenção, bom; a de peso 1 fica de fora");
  assert.equal(hSeis.aviso, null, "com 3 ou mais ações não há aviso");
}
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
for (const id of [...EXCLUIDOS_DA_HOJE, "mudou-0", "mudou-7", "sem-medida-agendaram", "sem-medida-compareceram"]) {
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
assert.equal(nomeDaSaudacao("Dra. Lana Ribeiro"), "Dra. Lana");
assert.equal(nomeDaSaudacao("Lana"), "Lana");
assert.equal(nomeDaSaudacao("  Clínica   Boa Vida  Ltda "), "Clínica Boa");
assert.equal(nomeDaSaudacao(""), null);
assert.equal(nomeDaSaudacao("   "), null);
assert.equal(nomeDaSaudacao(null), null);
assert.equal(nomeDaSaudacao(undefined), null);

// ---------- o módulo é puro: sem banco, sem consulta e sem IA (D-05) ----------
const fonte = readFileSync(new URL("../src/lib/leitura/fatos-hoje.ts", import.meta.url), "utf8");
assert.ok(!/supabase|useQuery|chamarIA|fetch\(/.test(fonte), "fatos-hoje.ts não usa banco, consulta nem IA");
assert.ok(/montarTexto\(/.test(fonte), "toda frase de ação passa por montarTexto");

console.log("test-leitura-hoje: ok");
