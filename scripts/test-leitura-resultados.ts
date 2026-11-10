// Leitura de Resultados da clínica e de Pacientes do período (Phase 3.1, plano 03): fatos completos, resumo da clínica em
// 3 linhas (D-07), fatos de Pacientes e das telas em construção. Só regra fixa, sem IA e sem banco.
// Rodar: npx tsx scripts/test-leitura-resultados.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERBOS_PROVISORIOS } from "../src/lib/leitura/tipos";
import type { Fato } from "../src/lib/leitura/tipos";
import { montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import { fatosDeResultados, fatosDeResultadosComAreas, funilDosNumeros, periodosDeComparacao, somaDiaria, variacaoPct, VERSAO_REGRAS_RESULTADOS } from "../src/lib/leitura/fatos-resultados";
import { resumirClinica } from "../src/lib/leitura/resumo-clinica";
import { fatosDePacientes, fatosEmConstrucao, VERSAO_REGRAS_PACIENTES } from "../src/lib/leitura/fatos-pacientes";
import { paraChamarAgora, type PacientesPeriodo, type VendaHistorico } from "../src/lib/pacientes";
import { avaliarRastreio } from "../src/lib/rastreio-anuncios";
import { montarResultado } from "../src/lib/resultado";
import { diagnosticarAds } from "../src/lib/anuncios-objetivo";
import type { DadosRoi } from "../src/lib/roi";
import type { Insight } from "../src/lib/insight";
import { leads, ig, ads, posts, adsCampanhas } from "./fixtures/lana-2026-10";

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

const HOJE = "2026-10-14";
const lanaResultado = montar(HOJE);
const entrada = (extra: Partial<Parameters<typeof fatosDeResultados>[0]> = {}) => ({ resultado: lanaResultado, de: START, ate: END, hoje: HOJE, ...extra });
const FUNIL = { atual: { mandaram_mensagem: 978, agendaram: 120, fecharam: 9 }, anterior: { mandaram_mensagem: 800, agendaram: 150, fecharam: 12 } };
const ROI_CONFIAVEL: DadosRoi = {
  tem_anuncios: true, tem_crm: true, crm_provider: "kommo", rotulo_custo: "venda",
  investido: 1500, investido_aquisicao: 1000, investido_crescimento: 500, investido_estimado: 0,
  leads: 100, leads_com_origem: 95, ganhos: 20, ganhos_com_valor: 20, receita: 6000, ganho_identificavel: true, crm_compartilhado: false,
  ganhos_anuncio: 20, ganhos_anuncio_com_valor: 20, receita_anuncio: 6000, receita_por_origem: [{ origem: "Anúncio", ganhos: 20, receita: 6000 }],
  ganhos_com_canal: 20,
};
const semNumero = (f: Fato) => f.numeros.length === 0;

// ---------- versão das regras ----------
assert.equal(VERSAO_REGRAS_RESULTADOS, 2, "as regras completas de Resultados são a versão 2");

// ---------- ROI só com selo confiável ----------
const comRoi = (roi: DadosRoi) => fatosDeResultados(entrada({ funil: FUNIL, roi }));
const temRoi = (f: ReturnType<typeof fatosDeResultados>) => f.fatos.some((x) => x.id === "roi");
assert.equal(temRoi(comRoi(ROI_CONFIAVEL)), true, "selo confiável cria o fato de ROI");
assert.equal(temRoi(comRoi({ ...ROI_CONFIAVEL, investido: 3000, investido_estimado: 2000 })), false, "selo parcial não cria fato de ROI");
assert.equal(temRoi(comRoi({ ...ROI_CONFIAVEL, anuncios_planilha: true })), false, "anúncio lançado à mão (parcial) não cria fato de ROI");
assert.equal(temRoi(comRoi({ ...ROI_CONFIAVEL, tem_anuncios: false })), false, "sem conta de anúncios o selo é ilegível: sem fato de ROI");
assert.equal(temRoi(comRoi({ ...ROI_CONFIAVEL, leads_com_origem: 10 })), false, "ROI não calculável não vira fato");
assert.equal(temRoi(fatosDeResultados(entrada({ funil: FUNIL }))), false, "sem dado de ROI não há fato");
const roi = comRoi(ROI_CONFIAVEL).fatos.find((x) => x.id === "roi")!;
assert.ok(roi.numeros.length >= 1 && !semNumero(roi), "o ROI traz número ao lado");

// ---------- variação com base mínima ----------
const mudou = (f: ReturnType<typeof fatosDeResultados>) => f.fatos.filter((x) => x.id.startsWith("mudou-"));
const normal = fatosDeResultados(entrada({ funil: FUNIL }));
assert.ok(mudou(normal).some((x) => /Mais pessoas chamaram a clínica 22% \(de 800 para 978\)/.test(x.frase)), "variação de quem chamou: 'de X para Y' e o percentual");
assert.ok(mudou(normal).some((x) => /Os agendamentos caíram 20% \(de 150 para 120\)/.test(x.frase) && x.tom === "ruim"), "queda de agendamento é fato ruim");
const baseFraca = fatosDeResultados(entrada({ funil: { atual: { mandaram_mensagem: 30, agendaram: 9, fecharam: 6 }, anterior: { mandaram_mensagem: 5, agendaram: 4, fecharam: 2 } } }));
assert.equal(mudou(baseFraca).length, 0, "base do período anterior menor que a mínima: nenhum fato de variação");
const semAnterior = fatosDeResultados(entrada({ funil: { atual: FUNIL.atual, anterior: null } }));
assert.equal(mudou(semAnterior).length, 0, "sem período anterior medido não há variação");

// ---------- dado com erro na origem nega ----------
const dado: Insight = {
  id: "dado-crm-parado", area: "resumo", tom: "ruim", titulo: "O CRM está sem atualizar.", diagnostico: "O CRM não recebeu lead novo.", evidencia: "Último lead há 9 dias.",
  confianca: "alta", impacto: "alto", acao: { texto: "Corrigir a conexão do CRM." }, responsavel: "equipe_hub",
};
const comErro = fatosDeResultados({ ...entrada(), resultado: montar(HOJE, { problemasDados: [dado] }), funil: FUNIL });
assert.ok(!comErro.portao.ok && comErro.portao.codigo === "erro_de_dado", "insight dado-* de severidade alta nega");
if (!comErro.portao.ok) assert.match(comErro.portao.motivo, /erro na origem/);
const textoErro = montarTexto(comErro);
assert.equal(textoErro.tipo, "sem_leitura");
assert.deepEqual(problemasDoTexto(textoErro), []);

// ---------- funil fora de ordem e rastreio suspeito negam ----------
const fora = fatosDeResultados(entrada({ funil: { atual: { mandaram_mensagem: 500, agendaram: 3, fecharam: 36 }, anterior: null } }));
assert.ok(!fora.portao.ok && fora.portao.codigo === "funil_fora_de_ordem", "agendou menos do que fechou nega");
if (!fora.portao.ok) assert.equal(fora.portao.passo.quem, "comercial");
const suspeito = fatosDeResultados(entrada({ funil: FUNIL, rastreio: avaliarRastreio({ cliquesLink: 7391, conversas: 29 }) }));
assert.ok(!suspeito.portao.ok && suspeito.portao.codigo === "rastreio_suspeito");

// ---------- número sem medida nunca vira zero, queda ou conclusão ----------
const semMedida = fatosDeResultados(entrada({
  funil: {
    atual: { mandaram_mensagem: 978, agendaram: null, fecharam: 9 }, anterior: { mandaram_mensagem: 800, agendaram: 150, fecharam: 12 },
    semMedida: [{ chave: "agendaram", rotulo: "Agendaram", motivo: "As conversas ainda não chegavam ao Nexo.", quem: "equipe_hub" }],
  },
}));
assert.ok(!mudou(semMedida).some((x) => /agendamentos/i.test(x.frase)), "agendamento sem medida não vira variação");
const faltaMedida = semMedida.fatos.find((x) => x.id === "sem-medida-agendaram");
assert.ok(faltaMedida && faltaMedida.ressalva && faltaMedida.numeros[0]?.exibicao === "Sem dado", "o que não foi medido aparece como ressalva 'Sem dado', nunca como 0");
// Nenhuma fonte com dado: sem leitura com o motivo da fonte.
const nada = fatosDeResultados({
  ...entrada(), resultado: montar(HOJE, { diario: [] }),
  funil: { atual: { mandaram_mensagem: null, agendaram: null, fecharam: null }, anterior: null, semMedida: [{ chave: "mandaram_mensagem", rotulo: "Chamaram", motivo: "A fonte não respondeu.", quem: "equipe_hub" }] },
});
assert.ok(!nada.portao.ok && nada.portao.codigo === "sem_dado", "nenhuma fonte ligada tem dado: sem leitura");

// ---------- resumo da clínica (D-07) ----------
const completo = fatosDeResultadosComAreas(entrada({ funil: FUNIL, roi: ROI_CONFIAVEL }));
assert.deepEqual(Object.keys(completo.porArea).sort(), ["anuncios", "comercial", "conteudo", "ideias", "resumo"], "os fatos vêm separados pelas 5 áreas");
const passosLana = [completo.fatos.proximoPasso, ...completo.fatos.outrosPassos].filter((p) => p != null);
const resumo = resumirClinica({ fatos: completo.fatos, porArea: completo.porArea, passos: passosLana });
assert.equal(resumo.tipo, "resumo", "a Lana tem resumo");
if (resumo.tipo === "resumo") {
  assert.ok(resumo.aconteceu && resumo.aconteceu.numeros.length >= 1, "o que aconteceu traz número");
  assert.ok(resumo.preocupa && resumo.preocupa.numeros.length >= 1 && ["ruim", "atencao"].includes(resumo.preocupa.tom), "o que mais preocupa é fato ruim ou de atenção, com número");
  assert.notEqual(resumo.preocupa!.fatoId, resumo.aconteceu!.fatoId, "as duas linhas não repetem o mesmo fato");
  assert.ok(resumo.acao, "a ação da semana existe");
  assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(resumo.acao!.verbo), "a ação começa por verbo da lista");
  assert.ok(resumo.acao!.rotuloQuem.length > 0, "a ação diz quem resolve");
  const fatosPorId = new Map(Object.values(completo.porArea).flat().map((f) => [f.id, f]));
  const maior = Math.max(...[...fatosPorId.values()].filter((f) => !f.ressalva && f.tom !== "neutro").map((f) => f.peso));
  assert.equal(fatosPorId.get(resumo.aconteceu!.fatoId)?.peso, maior, "o que aconteceu é um fato de maior peso");
  console.log("  Resumo da Lana:", resumo.aconteceu!.frase, "|", resumo.preocupa!.frase, "→", resumo.acao!.frase, `(${resumo.acao!.rotuloQuem})`);
}
assert.deepEqual(problemasDoTexto(resumo), [], "toda saída do resumo passa no filtro de linguagem");

// Portão negado: o resumo diz o mesmo motivo.
const negado = fatosDeResultadosComAreas(entrada({ funil: FUNIL, rastreio: avaliarRastreio({ cliquesLink: 7391, conversas: 29 }) }));
const resumoNegado = resumirClinica({ fatos: negado.fatos, porArea: negado.porArea, passos: [] });
assert.equal(resumoNegado.tipo, "sem_leitura");
if (resumoNegado.tipo === "sem_leitura" && !negado.fatos.portao.ok) {
  assert.equal(resumoNegado.motivo, negado.fatos.portao.motivo, "mesmo motivo do portão");
  assert.equal(resumoNegado.passo.quem, "gestor_trafego");
}
assert.deepEqual(problemasDoTexto(resumoNegado), []);

// Sem nenhum fato aproveitável: não inventa.
const vazio = resumirClinica({ fatos: { ...completo.fatos, fatos: [] }, porArea: { resumo: [], conteudo: [], anuncios: [], comercial: [], ideias: [] }, passos: [] });
assert.equal(vazio.tipo, "sem_leitura", "sem fato, sem leitura");

// A leitura nunca cita risco nem projeção.
const todosOsTextos = JSON.stringify([montarTexto(completo.fatos), resumo]);
assert.ok(!/em risco|projeção|projecao|previsão/i.test(todosOsTextos), "sem 'em risco', projeção nem previsão");
assert.deepEqual(problemasDoTexto(montarTexto(completo.fatos)), []);

// ---------- comparação com o período anterior (compartilhada com Pacientes) ----------
assert.deepEqual(periodosDeComparacao("2026-10-11", "2026-11-10", "2026-11-10"), { fimFechado: "2026-11-09", dias: 30, anterior: { start: "2026-09-11", end: "2026-10-10" } }, "hoje fica de fora: 30 dias fechados, anterior de 30 dias");
assert.deepEqual(periodosDeComparacao("2026-10-01", "2026-10-31", "2026-11-10").anterior, { start: "2026-08-31", end: "2026-09-30" }, "mês fechado: anterior de 31 dias");
const diasLinhas = Array.from({ length: 10 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, mandaram_mensagem: 10, agendaram: i < 5 ? 2 : null }));
assert.deepEqual(somaDiaria(diasLinhas, 10, ["mandaram_mensagem", "agendaram"]), { mandaram_mensagem: 100, agendaram: null }, "menos de 80% dos dias medidos: sem soma, nunca zero");
assert.deepEqual(variacaoPct(120, 100), { pct: 20, tom: "up" });
assert.deepEqual(variacaoPct(80, 100), { pct: -20, tom: "down" });
assert.equal(variacaoPct(5, 0), null, "base zero não vira variação");
assert.equal(variacaoPct(null, 10), null, "sem medida não vira variação");
const funilBanco = funilDosNumeros({
  dados: { numeros: { mandaram_mensagem: { valor: 900 }, agendaram: { valor: null, motivo_sem_dado: "As conversas ainda não chegavam ao Nexo.", responsavel: "equipe_hub" }, fecharam: { valor: 9 } } },
  somaAtual: { mandaram_mensagem: 950, agendaram: null, fecharam: 9 }, somaAntes: { mandaram_mensagem: 800, agendaram: null, fecharam: 12 },
});
assert.ok(funilBanco);
assert.equal(funilBanco!.pessoas?.agendaram, null, "agendaram sem medida continua nulo, não vira 0");
assert.deepEqual(funilBanco!.semMedida?.map((s) => [s.chave, s.quem, s.motivo]), [["agendaram", "equipe_hub", "As conversas ainda não chegavam ao Nexo."]]);
assert.equal(funilDosNumeros({ dados: null }), null, "a consulta de pessoas não respondeu: sem funil");

// ---------- Pacientes do período ----------
const nump = (valor: number | null, extra: Record<string, unknown> = {}) => ({ valor, fonte: "crm", motivo_sem_dado: valor == null ? "Sem dado no CRM." : null, responsavel: "comercial", ...extra });
const NOMES_DA_LISTA = ["Maria Fictícia Souza", "Joana Inventada Lima"];
const hojeP = "2026-11-10";
const dadosPacientes = (numeros: Record<string, unknown> = {}): PacientesPeriodo =>
  ({
    periodo: { de: "2026-10-11", ate: "2026-11-09" }, cliente_de_teste: false, tem_crm: true, tem_conversas: true, tem_leitura_ia: false, tem_funil_prospeccao: false,
    numeros: {
      mandaram_mensagem: nump(120), leads_novos: nump(80), antigos: nump(40), agendaram: nump(30), negociacao: nump(12),
      compareceram: nump(null, { nao_medido_por: "etapa_sem_uso", motivo_sem_dado: "A equipe não usa a etapa de comparecimento." }),
      fecharam: nump(9, { vendas: 9, sem_valor: 0, valor_total: 18000 }), abordados: nump(null, { nao_se_aplica: true }), engajaram_instagram: nump(15),
      ...numeros,
    },
    listas: {
      agendaram: { total: 2, itens: [
        { id: "a1", pessoa: "pp1", nome: NOMES_DA_LISTA[0], canal: "whatsapp", conversa_id: null, data: "2026-10-20", fonte: "crm", crm: null, leitura: null, agendou_em: "2026-10-20" },
        { id: "a2", pessoa: "pp2", nome: NOMES_DA_LISTA[1], canal: "whatsapp", conversa_id: null, data: "2026-10-21", fonte: "crm", crm: null, leitura: null, agendou_em: "2026-10-21" },
      ] },
    },
  }) as unknown as PacientesPeriodo;
const pacientes = (dados: PacientesPeriodo, extra: Partial<Parameters<typeof fatosDePacientes>[0]> = {}) =>
  fatosDePacientes({ dados, de: "2026-10-11", ate: "2026-11-09", hoje: hojeP, ...extra });

assert.equal(VERSAO_REGRAS_PACIENTES, 1);
const pOk = pacientes(dadosPacientes(), { somaAtual: { mandaram_mensagem: 130, agendaram: 32, fecharam: 9 }, somaAntes: { mandaram_mensagem: 100, agendaram: 40, fecharam: 12 } });
assert.equal(pOk.tela, "pacientes");
assert.deepEqual(pOk.portao, { ok: true }, "Pacientes com os números medidos: o portão libera");
assert.deepEqual(pOk.periodo.anterior, { de: "2026-09-11", ate: "2026-10-10" });
// D1: a etapa de maior perda, com número ao lado.
const perda = pOk.fatos.find((f) => f.id === "maior-perda");
assert.ok(perda && perda.numeros.length >= 1 && /Chamaram|Agendaram|Fecharam/.test(perda.frase), "a etapa de maior perda é um fato com número");
// Variação com o período anterior (base mínima de leituraDoPeriodo).
assert.ok(pOk.fatos.some((f) => f.id.startsWith("mudou-") && /Mais pessoas chamaram a clínica 30% \(de 100 para 130\)/.test(f.frase)), "variação de quem chamou contra o período anterior");
assert.ok(pOk.proximoPasso && (VERBOS_PROVISORIOS as readonly string[]).includes(pOk.proximoPasso.verbo), "um próximo passo, com verbo da lista");
const textoPac = montarTexto(pOk);
assert.equal(textoPac.tipo, "leitura");
assert.deepEqual(problemasDoTexto(textoPac), [], "a leitura de Pacientes passa no filtro de linguagem");
if (textoPac.tipo === "leitura") console.log("  Pacientes:", textoPac.aconteceu.frase, textoPac.aconteceu.numeros.map((n) => n.exibicao).join(" | "), "→", textoPac.proximoPasso?.frase);

// Número principal sem medida: sem leitura, com o motivo e o responsável do próprio número; sem fato de agendaram.
const pSemAg = pacientes(dadosPacientes({ agendaram: nump(null, { motivo_sem_dado: "As conversas ainda não chegavam ao Nexo.", responsavel: "equipe_hub" }) }));
assert.ok(!pSemAg.portao.ok, "agendaram sem medida nega");
if (!pSemAg.portao.ok) {
  assert.equal(pSemAg.portao.motivo, "As conversas ainda não chegavam ao Nexo");
  assert.equal(pSemAg.portao.passo.quem, "equipe_hub", "quem resolve é o responsável do número");
}
assert.ok(!pSemAg.fatos.some((f) => /Agendaram|agendamentos/i.test(f.frase) && f.tom !== "atencao" ), "sem fato de agendaram");
assert.equal(montarTexto(pSemAg).tipo, "sem_leitura");
assert.deepEqual(problemasDoTexto(montarTexto(pSemAg)), []);
// Número secundário sem medida (comparecimento) não nega: vira ressalva "Sem dado".
const ressalvaComparecimento = pOk.fatos.find((f) => f.id === "sem-medida-compareceram");
assert.ok(ressalvaComparecimento?.ressalva && ressalvaComparecimento.numeros[0]?.exibicao === "Sem dado", "comparecimento não medido é ressalva, nunca 0");

// Funil fora de ordem: agendou menos do que fechou.
const pFora = pacientes(dadosPacientes({ agendaram: nump(3), fecharam: nump(36, { vendas: 36, sem_valor: 0, valor_total: 0 }) }));
assert.ok(!pFora.portao.ok && pFora.portao.codigo === "funil_fora_de_ordem");
if (!pFora.portao.ok) assert.equal(pFora.portao.passo.quem, "comercial");
// Amostra pequena.
const pPouco = pacientes(dadosPacientes({ mandaram_mensagem: nump(4), agendaram: nump(1), fecharam: nump(0, { vendas: 0, sem_valor: 0, valor_total: 0 }) }));
assert.ok(!pPouco.portao.ok && pPouco.portao.codigo === "amostra_pequena", "4 pessoas: amostra pequena");

// LGPD: a lista de pessoas para chamar nunca entra em fato nem na leitura.
const historico: VendaHistorico[] = [{ id: "v1", venda: "x1", nome: NOMES_DA_LISTA[0], data: "2026-06-01", valor: 900, funil: null, procedimento: "toxina botulínica", interesse: null, conversa_id: null }];
const dadosLgpd = dadosPacientes();
const chamar = paraChamarAgora(historico, dadosLgpd.listas.agendaram.itens, hojeP);
assert.ok(chamar.length >= 2 && chamar.every((c) => c.nome != null), "a fixture tem gente para chamar, com nome");
const tudoDePacientes = JSON.stringify([pOk, textoPac, montarTexto(pSemAg), montarTexto(pFora)]);
for (const c of chamar) assert.ok(!tudoDePacientes.includes(c.nome!), `nome da lista de chamar não pode aparecer na leitura: ${c.nome}`);
for (const nome of NOMES_DA_LISTA) assert.ok(!tudoDePacientes.includes(nome), `nome ${nome} vazou para a leitura`);

// Meta como fato: "N de M, faltam K", sem a palavra risco nem projeção.
const pMeta = pacientes(dadosPacientes(), { metas: { mandaram_mensagem: { meta: 40, atual: 28 }, agendaram: { meta: 10, atual: 12 }, fecharam: { meta: 5, atual: null } } });
const metaChamaram = pMeta.fatos.find((f) => f.id === "meta-mandaram_mensagem");
assert.ok(metaChamaram && /28 de 40, faltam 12/.test(metaChamaram.frase) && metaChamaram.numeros[0]?.exibicao === "28 de 40", "meta cadastrada vira fato 'N de M, faltam K'");
assert.ok(!/risco|projeç|projec|previs/i.test(JSON.stringify(pMeta.fatos)), "meta dita como fato: sem risco nem projeção");
assert.equal(pMeta.fatos.find((f) => f.id === "meta-agendaram")?.tom, "bom", "meta batida é fato bom");
assert.ok(/não foi medido/.test(pMeta.fatos.find((f) => f.id === "meta-fecharam")?.frase ?? ""), "meta sem medida do mês: sem acompanhamento, nunca 0 de 5");
assert.deepEqual(problemasDoTexto(montarTexto(pMeta)), []);

// Telas em construção: sem leitura, com o que falta e quem resolve.
for (const tela of ["consultas", "vendas"] as const) {
  const c = fatosEmConstrucao(tela);
  assert.equal(c.tela, tela);
  assert.ok(!c.portao.ok, `${tela}: sem leitura`);
  if (!c.portao.ok) {
    assert.equal(c.portao.motivo, "a tela ainda não tem a fonte ligada");
    assert.equal(c.portao.passo.verbo, "conferir");
    assert.equal(c.portao.passo.quem, "equipe_hub");
  }
  const t = montarTexto(c);
  assert.equal(t.tipo, "sem_leitura");
  assert.deepEqual(problemasDoTexto(t), []);
  assert.ok(!("aconteceu" in t));
}

// ---------- módulos puros (LEIT-02) ----------
for (const nome of ["fatos-resultados.ts", "resumo-clinica.ts", "fatos-pacientes.ts"]) {
  const fonte = readFileSync(new URL(`../src/lib/leitura/${nome}`, import.meta.url), "utf8");
  assert.ok(!/supabase|useQuery|chamarIA|fetch\(|from "react"/.test(fonte), `${nome}: módulo puro`);
}

console.log("test-leitura-resultados: ok");
