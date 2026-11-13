// Base da leitura por regra (Phase 3.1): período anterior, portão de honestidade, modelos de texto, filtro de linguagem,
// verbos do próximo passo e os fatos finos de Resultados. Só regra fixa, sem IA e sem banco.
// Rodar: npx tsx scripts/test-leitura-base.ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { periodoAnterior, VERBOS_PROVISORIOS, ROTULO_DECISAO } from "../src/lib/leitura/tipos";
import type { FatosDaTela, Fato, PassoFato } from "../src/lib/leitura/tipos";
import { portaoDoPeriodo, piorPortao } from "../src/lib/leitura/portao";
import { montarTexto, checarTextoDaLeitura, problemasDoTexto, frasePasso, rotuloPeriodo } from "../src/lib/leitura/texto";
import { verboDoTexto, deInsight, deLimitacao } from "../src/lib/leitura/adaptadores";
import { fatosDeResultados } from "../src/lib/leitura/fatos-resultados";
import { avaliarRastreio } from "../src/lib/rastreio-anuncios";
import { statusDaFonte } from "../src/lib/status-fonte";
import { montarResultado } from "../src/lib/resultado";
import { diagnosticarAds } from "../src/lib/anuncios-objetivo";
import { LIMITES } from "../src/lib/limites";
import { leads, ig, ads, posts, adsCampanhas } from "./fixtures/lana-2026-10";

// ---------- período anterior (D-06) ----------
assert.deepEqual(periodoAnterior("2026-10-11", "2026-11-09"), { de: "2026-09-11", ate: "2026-10-10" }, "30 dias: anterior de 30 dias, termina no dia anterior ao início");
assert.deepEqual(periodoAnterior("2026-11-03", "2026-11-09"), { de: "2026-10-27", ate: "2026-11-02" }, "7 dias: anterior de 7 dias");
assert.deepEqual(periodoAnterior("2026-11-09", "2026-11-09"), { de: "2026-11-08", ate: "2026-11-08" }, "1 dia: o dia anterior");
assert.equal(LIMITES.leitura.grupoMinimo, 5, "grupo menor que 5 não vira conclusão");
assert.equal(Object.keys(ROTULO_DECISAO).length, 5);
assert.equal(VERBOS_PROVISORIOS.length, 8);

// ---------- portão de honestidade (D-03) ----------
const base = { periodoAte: "2026-11-09", hoje: "2026-11-10", n: 30 };
assert.deepEqual(portaoDoPeriodo(base), { ok: true }, "tudo certo devolve ok");

const rastreio = avaliarRastreio({ cliquesLink: 7391, conversas: 29 });
assert.equal(rastreio.suspeito, true, "o caso Doctor Creator (7.391 cliques e 29 conversas) é suspeito");
const pRastreio = portaoDoPeriodo({ ...base, rastreio });
assert.ok(!pRastreio.ok);
if (!pRastreio.ok) {
  assert.equal(pRastreio.codigo, "rastreio_suspeito");
  assert.equal(pRastreio.passo.verbo, "corrigir");
  assert.equal(pRastreio.passo.quem, "gestor_trafego");
  assert.match(pRastreio.motivo, /rastreio das conversas dos anúncios está suspeito/);
}

const vermelha = statusDaFonte({ fonte: "instagram", cadastro: true, data_ate: null }, "2026-11-10");
assert.equal(vermelha.cor, "vermelho");
const pFonte = portaoDoPeriodo({ ...base, fontes: [{ nome: "Instagram", status: vermelha }] });
assert.ok(!pFonte.ok);
if (!pFonte.ok) {
  assert.equal(pFonte.codigo, "fonte_parada");
  assert.equal(pFonte.passo.verbo, "conferir");
  assert.equal(pFonte.passo.quem, "equipe_hub");
}
const pAtraso = portaoDoPeriodo({ ...base, fontes: [{ nome: "Instagram", status: null, ultimoDado: "2026-10-31" }] });
assert.ok(!pAtraso.ok);
if (!pAtraso.ok) {
  assert.equal(pAtraso.passo.verbo, "conferir");
  assert.equal(pAtraso.passo.quem, "equipe_hub");
  assert.match(pAtraso.motivo, /o Instagram está sem dado novo desde 31\/10/);
  assert.match(frasePasso(pAtraso.passo), /^Conferir a conexão do Instagram\.$/);
}
assert.deepEqual(portaoDoPeriodo({ ...base, fontes: [{ nome: "Instagram", status: null, ultimoDado: "2026-11-08" }] }), { ok: true }, "1 dia antes de ontem ainda é em dia");
assert.deepEqual(portaoDoPeriodo({ ...base, fontes: [{ nome: "CRM", status: statusDaFonte({ fonte: "crm", cadastro: true, data_ate: "2026-11-09" }, "2026-11-10") }] }), { ok: true }, "fonte verde passa");

const pSelo = portaoDoPeriodo({ ...base, selo: { nivel: "ilegivel", motivo: "Falta o valor das vendas ganhas." } });
assert.ok(!pSelo.ok);
if (!pSelo.ok) {
  assert.equal(pSelo.codigo, "selo_ilegivel");
  assert.match(pSelo.motivo, /Falta o valor das vendas ganhas/);
}
assert.deepEqual(portaoDoPeriodo({ ...base, selo: { nivel: "parcial", motivo: "Falta uma parte." } }), { ok: true }, "selo parcial não nega");

// D-01: a ordem das etapas do funil não é entrada do portão (nem nega a leitura): vira fato para a equipe em quem lê o funil
// (fatos-resultados, fatos-comercial, fatos-pacientes). O portão não lê mais nada sobre a ordem.
assert.ok(!/fora_de_ordem|fora de ordem/.test(readFileSync(new URL("../src/lib/leitura/portao.ts", import.meta.url), "utf8")), "o portão não tem passo de ordem do funil");
const pErro = portaoDoPeriodo({ ...base, problemasAltos: 2 });
assert.ok(!pErro.ok);
if (!pErro.ok) assert.equal(pErro.codigo, "erro_de_dado");

const pAmostra = portaoDoPeriodo({ ...base, n: 4 });
assert.ok(!pAmostra.ok);
if (!pAmostra.ok) {
  assert.equal(pAmostra.codigo, "amostra_pequena");
  assert.equal(pAmostra.motivo, "a amostra é pequena (4, menos de 5)");
  assert.equal(pAmostra.passo.quem, "equipe_hub");
}
assert.deepEqual(portaoDoPeriodo({ ...base, n: 5 }), { ok: true }, "5 já é amostra");

// Ordem: falta de dado, fonte parada, rastreio, selo, erro de dado e amostra (seis passos; a ordem do funil não nega).
const tudoRuim = {
  ...base, n: 1, problemasAltos: 1, selo: { nivel: "ilegivel" as const, motivo: "x" }, rastreio,
  fontes: [{ nome: "Instagram", status: null, ultimoDado: "2026-10-01" }],
};
const ordem = ["sem_dado", "fonte_parada", "rastreio_suspeito", "selo_ilegivel", "erro_de_dado", "amostra_pequena"];
const semDado = { motivo: "nenhum dia com dado", quem: "equipe_hub" as const };
let atual: Parameters<typeof portaoDoPeriodo>[0] = { ...tudoRuim, semDado };
const vistos: string[] = [];
for (let i = 0; i < ordem.length; i++) {
  const p = portaoDoPeriodo(atual);
  assert.ok(!p.ok, `negado na etapa ${i}`);
  if (!p.ok) vistos.push(p.codigo);
  if (i === 0) atual = { ...atual, semDado: null };
  if (i === 1) atual = { ...atual, fontes: [] };
  if (i === 2) atual = { ...atual, rastreio: null };
  if (i === 3) atual = { ...atual, selo: null };
  if (i === 4) atual = { ...atual, problemasAltos: 0 };
}
assert.deepEqual(vistos, ordem, "o portão nega nesta ordem");
assert.equal(ordem.length, 6, "o portão tem seis passos");
assert.equal(piorPortao([{ ok: true }, pAmostra, pRastreio]), pAmostra, "piorPortao devolve o primeiro negado");
assert.deepEqual(piorPortao([{ ok: true }, { ok: true }]), { ok: true });

// ---------- verbos (D-10) ----------
assert.equal(verboDoTexto("Impulsionar o Reels de botox"), "reforçar");
assert.equal(verboDoTexto("Responder as conversas paradas"), "responder");
assert.equal(verboDoTexto("Pause a campanha de tráfego"), "pausar");
assert.equal(verboDoTexto("Preencher a origem dos contatos"), "corrigir");
assert.equal(verboDoTexto("Ligar para quem pediu retorno"), "ligar para");
assert.equal(verboDoTexto("Algo que não casa com nenhum verbo"), "revisar", "sem casamento, revisar");
for (const v of VERBOS_PROVISORIOS) assert.ok(verboDoTexto(`${v} alguma coisa`) === v, `o verbo ${v} se reconhece`);

// ---------- modelo de texto ----------
const periodo = { de: "2026-10-11", ate: "2026-11-09", anterior: { de: "2026-09-11", ate: "2026-10-10" } };
assert.equal(rotuloPeriodo(periodo), "11/10 a 09/11, comparado com 11/09 a 10/10");
assert.equal(rotuloPeriodo({ de: "2026-10-11", ate: "2026-11-09", anterior: null }), "11/10 a 09/11");

const fatoRuim: Fato = { id: "agendamentos", tom: "ruim", peso: 3, frase: "Os agendamentos caíram 18% (de 34 para 28).", numeros: [{ chave: "agendamentos", exibicao: "28 agendamentos" }] };
const fatoAtencao: Fato = { id: "espera", tom: "atencao", peso: 2, frase: "A primeira resposta no WhatsApp leva 47 minutos.", numeros: [{ chave: "espera", exibicao: "47 min" }] };
const fatoBom: Fato = { id: "alcance", tom: "bom", peso: 3, frase: "O alcance subiu 12% (de 10.000 para 11.200).", numeros: [{ chave: "alcance", exibicao: "11.200 pessoas" }] };
const passoA: PassoFato = { verbo: "responder", texto: "as conversas paradas há mais de 1 dia", quem: "atendimento", motivo: "A espera pela primeira resposta passou de 30 minutos.", fatoId: "espera" };
const passoB: PassoFato = { verbo: "reforçar", texto: "o Reels de pele mais visto", quem: "social_media" };
const passoC: PassoFato = { verbo: "conferir", texto: "o cadastro dos contatos", quem: "comercial" };
const fatosOk: FatosDaTela = { tela: "resultados", versaoRegras: 1, tipoPeriodo: "periodo", periodo, portao: { ok: true }, fatos: [fatoBom, fatoAtencao, fatoRuim], proximoPasso: passoA, outrosPassos: [passoB, passoC] };
const t1 = montarTexto(fatosOk);
assert.equal(t1.tipo, "leitura");
if (t1.tipo === "leitura") {
  assert.equal(t1.aconteceu.fatoId, "agendamentos", "maior peso; no empate, o ruim vem antes do bom");
  assert.ok(t1.aconteceu.numeros.length >= 1, "número ao lado da frase");
  assert.equal(t1.porque?.fatoId, "espera", "o porquê é o fato do passo");
  assert.ok(t1.proximoPasso, "um próximo passo");
  assert.equal(t1.proximoPasso?.frase, "Responder as conversas paradas há mais de 1 dia.");
  assert.equal(t1.proximoPasso?.rotuloQuem, "Atendimento/secretária");
  assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(t1.proximoPasso!.verbo));
  assert.equal(t1.verMais.length, 2, "os outros passos vão para ver mais");
  assert.deepEqual(t1.verMais.map((p) => p.verbo), ["reforçar", "conferir"]);
  assert.equal(t1.semPassoMotivo, null);
}
assert.deepEqual(problemasDoTexto(t1), [], "toda saída de montarTexto passa no filtro");

const fatosSemPasso: FatosDaTela = { ...fatosOk, fatos: [fatoBom], proximoPasso: null, outrosPassos: [] };
const t2 = montarTexto(fatosSemPasso);
assert.equal(t2.tipo, "leitura");
if (t2.tipo === "leitura") {
  assert.equal(t2.proximoPasso, null);
  assert.equal(t2.semPassoMotivo, "nenhuma ação passou nas regras neste período");
  assert.equal(t2.porque, null);
}
assert.deepEqual(problemasDoTexto(t2), []);

const negado = portaoDoPeriodo({ ...base, rastreio });
const t3 = montarTexto({ ...fatosOk, portao: negado });
assert.equal(t3.tipo, "sem_leitura");
assert.ok(!("aconteceu" in t3), "sem leitura não traz linha de conclusão");
if (t3.tipo === "sem_leitura") {
  assert.match(t3.motivo, /rastreio/);
  assert.equal(t3.passo.quem, "gestor_trafego");
  assert.equal(t3.passo.rotuloQuem, "Gestor de tráfego");
}
assert.deepEqual(problemasDoTexto(t3), []);

// Frase reprovada no filtro nunca chega à tela: o fato é descartado e o resto continua.
const fatoRisco: Fato = { id: "risco", tom: "ruim", peso: 3, frase: "A meta está em risco neste mês.", numeros: [{ chave: "meta", exibicao: "28 de 40" }] };
const t4 = montarTexto({ ...fatosOk, fatos: [fatoRisco, fatoRuim], proximoPasso: null, outrosPassos: [] });
assert.equal(t4.tipo, "leitura");
if (t4.tipo === "leitura") assert.equal(t4.aconteceu.fatoId, "agendamentos", "o fato com frase proibida é descartado");
// Sem nenhum fato aproveitável: diz que não há leitura, nunca inventa.
const t5 = montarTexto({ ...fatosOk, fatos: [fatoRisco], proximoPasso: null, outrosPassos: [] });
assert.equal(t5.tipo, "sem_leitura");
assert.deepEqual(problemasDoTexto(t5), []);
// Ressalva do dado (ex.: período incompleto) não toma o lugar de uma conclusão, nem vira "por quê".
const fatoRessalva: Fato = { id: "cobertura-0", tom: "atencao", peso: 1, ressalva: true, frase: "Período incompleto: 20 de 30 dias têm dado.", numeros: [{ chave: "dias", exibicao: "20 de 30 dias" }] };
const fatoBomLeve: Fato = { id: "seguidores", tom: "bom", peso: 1, frase: "Os seguidores subiram 4%.", numeros: [{ chave: "seg", exibicao: "+120" }] };
const t6 = montarTexto({ ...fatosOk, fatos: [fatoRessalva, fatoBomLeve], proximoPasso: null, outrosPassos: [] });
assert.equal(t6.tipo, "leitura");
if (t6.tipo === "leitura") {
  assert.equal(t6.aconteceu.fatoId, "seguidores", "a conclusão vem antes da ressalva");
  assert.equal(t6.porque, null, "ressalva não é o porquê");
}
const t7 = montarTexto({ ...fatosOk, fatos: [fatoRessalva], proximoPasso: null, outrosPassos: [] });
assert.equal(t7.tipo === "leitura" && t7.aconteceu.fatoId, "cobertura-0", "sem conclusão, a ressalva aparece (honesta) em vez de nada");

// ---------- filtro de linguagem (D-04, LEIT-07) ----------
const reprovar = (texto: string, trecho: RegExp) => {
  const p = checarTextoDaLeitura(texto);
  assert.ok(p.length > 0, `deveria reprovar: ${texto}`);
  assert.ok(p.some((x) => trecho.test(x)), `motivo esperado ${trecho} para: ${texto}; veio ${JSON.stringify(p)}`);
};
reprovar("O CTR subiu 12% neste período.", /jargão/);
reprovar("O custo por lead caiu.", /jargão/);
reprovar("Os agendamentos vão crescer no próximo mês.", /previsão ou promessa/);
reprovar("Projeção em 30 dias: 5.272.", /previsão ou promessa/);
reprovar("A meta está em risco.", /previsão ou promessa/);
reprovar("O Reels trouxe 40% dos contatos.", /causa/);
reprovar("Ligue para 11 99999-9999.", /dado pessoal/);
reprovar("Escreva para maria@clinica.com.br.", /dado pessoal/);
reprovar("Resultado garantido em 30 dias.", /CFM|previsão/);
reprovar("Uma frase. Outra frase. Uma terceira frase.", /frases/);
reprovar(`${"palavra ".repeat(40)}fim.`, /caracteres/);
assert.deepEqual(checarTextoDaLeitura("Os agendamentos caíram 18% (de 34 para 28)."), [], "frase com fato e número passa");
assert.deepEqual(checarTextoDaLeitura("O Reels de pele pode ter ajudado: foi o post com mais contatos."), [], "causa com ressalva passa");
assert.deepEqual(checarTextoDaLeitura("Conferir a conexão do Instagram."), []);

// ---------- adaptadores ----------
const insight = deInsight({
  id: "ritmo", area: "conteudo", tom: "ruim", titulo: "O alcance caiu 20% em relação ao período anterior.", diagnostico: "Menos pessoas viram os posts.",
  evidencia: "Alcance típico por dia: 1.000 contra 1.250.", confianca: "alta", impacto: "alto",
  acao: { texto: "Publicar mais Reels nesta semana." }, responsavel: "social_media",
});
assert.equal(insight.fato.tom, "ruim");
assert.equal(insight.fato.peso, 3);
assert.equal(insight.fato.numeros[0]?.exibicao, "Alcance típico por dia: 1.000 contra 1.250.");
assert.equal(insight.passo?.verbo, "publicar");
assert.equal(insight.passo?.quem, "social_media");
assert.equal(insight.passo?.motivo, "Menos pessoas viram os posts.");
const lim = deLimitacao({ id: "l1", area: "comercial", texto: "Sem origem preenchida nos contatos.", resolve: "comercial", comoResolver: "Preencher a origem de cada contato no CRM." });
assert.equal(lim.fato.tom, "atencao");
assert.equal(lim.passo?.verbo, "corrigir");
assert.equal(lim.passo?.quem, "comercial");

// ---------- fatos de Resultados ----------
const START = "2026-09-13", END = "2026-10-12";
const alcance: Record<string, number> = { "2026-09-13":61623,"2026-09-14":58056,"2026-09-15":67139,"2026-09-16":53382,"2026-09-17":47272,"2026-09-18":42881,"2026-09-19":39477,"2026-09-20":37724,"2026-09-21":30967,"2026-09-22":30734,"2026-09-23":35195,"2026-09-24":42662,"2026-09-25":95179,"2026-09-26":81621,"2026-09-27":67709,"2026-09-28":91403,"2026-09-29":132261,"2026-09-30":84931,"2026-10-01":52075,"2026-10-02":37995,"2026-10-03":36884,"2026-10-04":62354,"2026-10-05":32303,"2026-10-06":36768,"2026-10-07":33028,"2026-10-08":47120,"2026-10-09":39077,"2026-10-10":29260,"2026-10-11":30235,"2026-10-12":32332 };
const diag = diagnosticarAds(
  adsCampanhas.map(([h, id, , g, i, lc, cv, ld, lpv]) => ({ date: h === 1 ? START : END, campaign_id: id, spend: g, impressions: i, link_clicks: lc, conversations: cv, leads: ld, landing_page_views: lpv })),
  [...new Map(adsCampanhas.map(([, id, obj]) => [id, { campaign_id: id, name: `${obj} …${id.slice(-4)}`, objective: obj }])).values()],
  START, END,
);
const montar = (hoje: string, extra: Partial<Parameters<typeof montarResultado>[0]> = {}) =>
  montarResultado({
    start: START, end: END, hoje,
    diario: ig.map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date], new_followers: 180, followers_count: 128000 })),
    posts: posts.map(([posted_at, engagement, caption]) => ({ posted_at, engagement, caption, format: "reels" })),
    adsDiag: diag, adsPorDia: ads.map(([dia, gasto]) => ({ dia, gasto })),
    wts: { atendimentos: 640, espera_mediana_seg: 47 * 60, sem_roteamento: 20 },
    crm: { novos: 978, ganhos: 9 }, leadsPorDia: leads.map(([dia, total]) => ({ dia, total })),
    fontes: { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true },
    ...extra,
  });

const lana = fatosDeResultados({ resultado: montar("2026-10-14"), de: START, ate: END, hoje: "2026-10-14" });
assert.equal(lana.tela, "resultados");
assert.equal(lana.versaoRegras, 3, "regras de Resultados: etapa fora de ordem não nega (03.1.1.1.1-01)");
assert.deepEqual(lana.periodo.anterior, periodoAnterior(START, END), "o anterior vem da mesma conta");
assert.deepEqual(lana.portao, { ok: true }, "Lana, período fechado: o portão libera");
assert.ok(lana.fatos.length >= 1, "a Lana tem fatos");
assert.ok(lana.fatos.some((f) => f.numeros.length > 0), "pelo menos um fato com número");
assert.ok(lana.proximoPasso, "a Lana tem um próximo passo");
assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(lana.proximoPasso!.verbo));
const textoLana = montarTexto(lana);
assert.equal(textoLana.tipo, "leitura", "a leitura da Lana sai");
assert.deepEqual(problemasDoTexto(textoLana), [], "a saída do modelo para a Lana passa no filtro");
if (textoLana.tipo === "leitura") {
  assert.ok(textoLana.aconteceu.numeros.length >= 1, "o 'o que aconteceu' da Lana traz número");
  console.log("  Lana:", textoLana.aconteceu.frase, textoLana.aconteceu.numeros.map((n) => n.exibicao).join(" | "), "→", textoLana.proximoPasso?.frase, `(${textoLana.proximoPasso?.rotuloQuem})`);
}

// Sem nenhum dia com dado do Instagram: sem leitura.
const semDia = fatosDeResultados({ resultado: montar("2026-10-14", { diario: [] }), de: START, ate: END, hoje: "2026-10-14" });
assert.ok(!semDia.portao.ok, "sem dia com dado, o portão nega");
if (!semDia.portao.ok) {
  assert.equal(semDia.portao.codigo, "sem_dado");
  assert.equal(semDia.portao.passo.quem, "equipe_hub");
}
assert.equal(montarTexto(semDia).tipo, "sem_leitura");

// Dado do Instagram parado há 10 dias, com o período terminando hoje: fonte parada.
const parado = fatosDeResultados({
  resultado: montar("2026-10-22", { start: "2026-09-23", end: "2026-10-22", diario: ig.map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date] })) }),
  de: "2026-09-23", ate: "2026-10-22", hoje: "2026-10-22",
});
assert.ok(!parado.portao.ok, "Instagram parado há 10 dias nega");
if (!parado.portao.ok) {
  assert.equal(parado.portao.codigo, "fonte_parada");
  assert.match(parado.portao.motivo, /o Instagram está sem dado novo desde 12\/10/);
  assert.equal(parado.portao.passo.verbo, "conferir");
}
const textoParado = montarTexto(parado);
assert.equal(textoParado.tipo, "sem_leitura");
assert.deepEqual(problemasDoTexto(textoParado), []);

// A Meta fecha o dia com 2 dias de atraso: dado até anteontem é normal e não nega.
const normal = fatosDeResultados({
  resultado: montar("2026-10-14", { start: "2026-09-15", end: "2026-10-14", diario: ig.map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date] })) }),
  de: "2026-09-15", ate: "2026-10-14", hoje: "2026-10-14",
});
assert.deepEqual(normal.portao, { ok: true }, "dado até 12/10 com hoje 14/10 é o atraso normal da Meta");

// Amostra pequena: poucos dias com dado.
const poucos = fatosDeResultados({
  resultado: montar("2026-10-14", { start: "2026-10-09", end: "2026-10-12", diario: ig.filter(([d]) => d >= "2026-10-09").map(([date, total_interactions]) => ({ date, total_interactions, reach: alcance[date] })) }),
  de: "2026-10-09", ate: "2026-10-12", hoje: "2026-10-14",
});
assert.ok(!poucos.portao.ok && poucos.portao.codigo === "amostra_pequena", "4 dias com dado: a amostra é pequena");

// ---------- módulos puros (LEIT-02) ----------
const dir = new URL("../src/lib/leitura/", import.meta.url);
for (const nome of readdirSync(dir)) {
  const fonte = readFileSync(new URL(nome, dir), "utf8");
  assert.ok(!/supabase|useQuery|chamarIA|fetch\(|from "react"/.test(fonte), `${nome}: módulo puro, sem banco, consulta, IA nem React`);
}

console.log("test-leitura-base: ok");
