// Fechamento do mês (Phase 03.1.1.1, plano 08): os cartões da história, só com a própria clínica contra o período anterior dela.
// Módulo puro, só dados fictícios: nenhum número, nome ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-fechamento-do-mes.ts
import assert from "node:assert/strict";
import { checarFraseCinco } from "../src/lib/leitura/cinco-segundos";
import { cartoesDoMes, periodoServeParaFechamento, pontosDaEscala, type EntradaDoMes, type PostDoMes } from "../src/lib/fechamento-do-mes";
import { AVISO_FORA_DE_ORDEM, type EtapaDesenhada, type FunilDesenhado } from "../src/lib/funil-desenhado";
import { variacoes } from "../src/lib/diagnostico-estrategico";
import { analyzeGrowth } from "../src/lib/hub-conteudo";
import { lerPeriodo } from "../src/lib/leitura-periodo";
import { montarResultado } from "../src/lib/resultado";
import { descobertaDaAcao, montarEntradaDaHoje } from "../src/lib/leitura/entrada-da-hoje";
import { acoesDaHoje } from "../src/lib/leitura/fatos-hoje";
import { fatosDeResultadosComAreas } from "../src/lib/leitura/fatos-resultados";
import { fatosDePublicacoes, fatosDoInstagram } from "../src/lib/leitura/fatos-instagram";

// O real brasileiro sai com espaço sem quebra (U+00A0): nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

const entrada = (parte: Partial<EntradaDoMes> = {}): EntradaDoMes => ({
  nome: "Dra. Teste Fictícia",
  inicio: "2026-10-01",
  fim: "2026-10-30",
  dias: 30,
  anterior: { inicio: "2026-09-01", fim: "2026-09-30" },
  conversas: { atual: 300, antes: 200, porDia: [10, 12, null, 8, 15] },
  ...parte,
});

// ---------------------------------------------------------------- o período serve para o fechamento
{
  assert.equal(periodoServeParaFechamento("2026-10-01", "2026-10-31"), true, "31 dias");
  assert.equal(periodoServeParaFechamento("2026-10-01", "2026-10-30"), true, "30 dias");
  assert.equal(periodoServeParaFechamento("2026-02-01", "2026-02-28"), true, "28 dias");
  assert.equal(periodoServeParaFechamento("2026-10-01", "2026-10-27"), false, "27 dias");
  assert.equal(periodoServeParaFechamento("2026-10-01", "2026-10-07"), false, "7 dias");
  assert.equal(periodoServeParaFechamento("2026-01-01", "2026-03-31"), false, "90 dias");
}

// ---------------------------------------------------------------- abertura, WhatsApp e final
{
  const cartoes = cartoesDoMes(entrada());
  assert.deepEqual(cartoes.map((c) => c.id), ["abertura", "whatsapp", "final"], "a ordem da história");

  const abertura = cartoes[0];
  assert.equal(abertura.numero, null, "a abertura não tem número");
  assert.equal(abertura.titulo, "Dra. Teste,");
  assert.equal(abertura.legenda, "seus últimos 30 dias chegaram.");
  assert.deepEqual(abertura.periodo, { atual: "01/10 a 30/10", anterior: "01/09 a 30/09" }, "as datas dos dois períodos vão no cartão");

  const w = cartoes[1];
  assert.equal(sp(w.numero ?? ""), "300");
  assert.equal(w.legenda, "pessoas chamaram você");
  assert.equal(sp(w.comparacao ?? ""), "▲ 50% · antes eram 200");
  assert.equal(w.tom, "bom");
  assert.deepEqual(w.periodo, { atual: "01/10 a 30/10", anterior: "01/09 a 30/09" });
  assert.equal(w.visual?.tipo, "barras");
  assert.deepEqual(w.visual?.tipo === "barras" ? w.visual.valores : [], [10, 12, null, 8, 15], "dia sem dado fica buraco, nunca zero");

  const fim = cartoes[2];
  assert.equal(fim.numero, null);
  assert.equal(fim.legenda, "300 chamaram.");
}

// ---------------------------------------------------------------- dado que falta tira o cartão (nunca 0)
{
  const sem = cartoesDoMes(entrada({ conversas: { atual: null, antes: 200, porDia: [] } }));
  assert.deepEqual(sem.map((c) => c.id), ["abertura", "final"], "conversas sem medida: o cartão some");
  assert.ok(!sem.some((c) => c.numero === "0"), "nunca um 0 no lugar de dado que falta");
  assert.equal(sem[1].legenda, "Este foi o seu mês.");

  const semAntes = cartoesDoMes(entrada({ conversas: { atual: 300, antes: null, porDia: [10] } }));
  const w = semAntes.find((c) => c.id === "whatsapp");
  assert.ok(w, "o cartão fica");
  assert.equal(w?.comparacao, undefined, "sem período anterior não há comparação (nem 0%)");
  assert.equal(w?.tom, "neutro");

  const semNome = cartoesDoMes(entrada({ nome: "Clínica Teste" }));
  assert.equal(semNome[0].titulo, "Seu mês", "nome sem Dr. ou Dra. não vira saudação");
}

// ---------------------------------------------------------------- pontos com escala
{
  assert.deepEqual(pontosDaEscala(2_400_000, 2_000_000), { passo: 100_000, rotulo: "1 ponto = 100 mil pessoas", pontosAtual: 24, pontosAntes: 20 });
  assert.deepEqual(pontosDaEscala(30, 20), { passo: 1, rotulo: "1 ponto = 1 pessoa", pontosAtual: 30, pontosAntes: 20 });
  const e1 = pontosDaEscala(41, 10);
  assert.equal(e1?.passo, 2, "41 não cabe em 40 pontos de 1: passa para 2");
  assert.equal(e1?.rotulo, "1 ponto = 2 pessoas");
  const e2 = pontosDaEscala(130_000, 90_000);
  assert.equal(e2?.passo, 5000, "130 mil em até 40 pontos: 5 mil por ponto");
  for (const [a, b] of [[7, 3], [999, 12], [48_000, 51_000], [3_300_000, 900_000], [1, 1]] as const) {
    const r = pontosDaEscala(a, b)!;
    assert.ok(r.pontosAtual <= 40 && r.pontosAntes <= 40, `${a} e ${b} cabem em 40 pontos (passo ${r.passo})`);
    assert.ok(/^1 ponto = /.test(r.rotulo));
  }
  assert.equal(pontosDaEscala(null, 10), null, "sem número medido não há escala");
  assert.equal(pontosDaEscala(10, null), null);
  assert.equal(pontosDaEscala(0, 0), null, "nada a desenhar");
}

// ---------------------------------------------------------------- Instagram: alcance, seguidores novos e post campeão
{
  const base = entrada({ conversas: null });
  const cartoes = cartoesDoMes({
    ...base,
    alcance: { atual: 2_400_000, antes: 2_000_000 },
    seguidores: { atual: { novos: 280, diasMedidos: 28 }, antes: { novos: 200, diasMedidos: 28 }, total: [5000, null, 5100, 5280] },
  });
  assert.deepEqual(cartoes.map((c) => c.id), ["abertura", "alcance", "seguidores", "final"]);
  const a = cartoes[1];
  assert.equal(sp(a.numero ?? ""), "2,4 mi");
  assert.equal(sp(a.comparacao ?? ""), "▲ 20% · antes eram 2 mi");
  assert.equal(a.visual?.tipo, "pontos");
  if (a.visual?.tipo === "pontos") {
    assert.equal(a.visual.pontos.length, 30, "linhas de 10 pontos até caber o maior lado");
    assert.equal(a.visual.pontos.filter((p) => p === "base").length, 20, "20 pontos já havia antes");
    assert.equal(a.visual.pontos.filter((p) => p === "mais").length, 4, "4 pontos a mais agora");
    assert.ok(a.visual.legenda.includes("1 ponto = 100 mil pessoas"));
  }

  const s = cartoes[2];
  assert.equal(s.numero, "+280");
  assert.equal(sp(s.comparacao ?? ""), "▲ 40% por dia · antes eram 200", "a média por dia dos dois períodos");
  assert.equal(s.visual?.tipo, "linha");

  // Alcance caiu: os pontos a menos aparecem e o cartão não esconde a queda.
  const menos = cartoesDoMes({ ...base, alcance: { atual: 1_500_000, antes: 2_000_000 } }).find((c) => c.id === "alcance")!;
  assert.equal(menos.tom, "ruim");
  assert.equal(menos.visual?.tipo, "pontos");
  // 2 milhões em até 40 pontos: 50 mil por ponto, então 30 pontos agora e 40 antes (10 a menos).
  if (menos.visual?.tipo === "pontos") assert.equal(menos.visual.pontos.filter((p) => p === "menos").length, 10);

  // Sem dado: o cartão some, nunca vira 0.
  const sem = cartoesDoMes({ ...base, alcance: { atual: null, antes: 100 }, seguidores: { atual: { novos: 10, diasMedidos: 3 }, antes: null, total: [] } });
  assert.deepEqual(sem.map((c) => c.id), ["abertura", "final"], "alcance sem medida e seguidores com poucos dias não viram cartão");
}
{
  const post = (i: number, saved: number | null, reach: number, posted: string, extra: Partial<PostDoMes> = {}): PostDoMes => ({ saved, reach, posted_at: posted, caption: `Legenda fictícia ${i}`, format: "reels", ...extra });
  const campeao = (posts: PostDoMes[]) => cartoesDoMes(entrada({ conversas: null, posts })).find((c) => c.id === "post");

  const a = campeao([post(1, 10, 500, "2026-10-05T15:00:00Z"), post(2, 30, 100, "2026-10-12T21:30:00Z", { tema: "tema fictício" }), post(3, 5, 900, "2026-10-20T12:00:00Z")])!;
  assert.equal(a.numero, "30");
  assert.equal(a.legenda, "pessoas salvaram");
  assert.equal(a.post?.legenda, "Legenda fictícia 2");
  assert.equal(a.post?.tema, "tema fictício");
  assert.equal(a.post?.quando, "seg., 12/10 às 18h", "dia e hora no horário de São Paulo");
  assert.equal(a.comparacao, undefined, "o post campeão não compara com nada");

  // Empate nos salvamentos: o de mais alcance; depois o mais recente.
  assert.equal(campeao([post(1, 20, 100, "2026-10-05T15:00:00Z"), post(2, 20, 300, "2026-10-04T15:00:00Z")])?.post?.legenda, "Legenda fictícia 2");
  assert.equal(campeao([post(1, 20, 100, "2026-10-05T15:00:00Z"), post(2, 20, 100, "2026-10-09T15:00:00Z")])?.post?.legenda, "Legenda fictícia 2");
  // Sem nenhum salvamento medido ou sem post: sem cartão.
  assert.equal(campeao([post(1, null, 100, "2026-10-05T15:00:00Z"), post(2, 0, 100, "2026-10-06T15:00:00Z")]), undefined);
  assert.equal(campeao([]), undefined);
  // Uma pessoa só salvou.
  assert.equal(campeao([post(1, 1, 100, "2026-10-05T15:00:00Z")])?.legenda, "pessoa salvou");
  // A legenda é texto: a regra não a corta nem interpreta HTML (o corte é do desenho).
  assert.equal(campeao([post(1, 3, 100, "2026-10-05T15:00:00Z", { caption: "  <b>oi</b>\n  tudo bem  " })])?.post?.legenda, "<b>oi</b> tudo bem");
}

// ---------------------------------------------------------------- anúncios: custo por conversa
{
  const dias = Array.from({ length: 10 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, gasto: 100 + i, conversas: 10 }));
  const custo = (parte: Partial<NonNullable<EntradaDoMes["anuncios"]>>) =>
    cartoesDoMes(entrada({ conversas: null, anuncios: { atual: { gasto: 3000, conversas: 100 }, antes: { gasto: 3000, conversas: 75 }, porDia: dias, ...parte } })).find((c) => c.id === "custo");

  const c = custo({})!;
  assert.equal(sp(c.numero ?? ""), "R$ 30,00");
  assert.equal(c.legenda, "por conversa no WhatsApp");
  assert.equal(sp(c.comparacao ?? ""), "▼ 25% mais barato · antes R$ 40,00", "menos é melhor: ▼ no número, tom bom");
  assert.equal(c.tom, "bom");
  assert.equal(c.visual?.tipo, "regua");
  if (c.visual?.tipo === "regua") {
    assert.equal(c.visual.dias.length, 10);
    assert.ok(c.visual.dias.every((d) => d >= 0 && d <= 100) && c.visual.agora >= 0 && c.visual.agora <= 100);
  }
  const caro = custo({ atual: { gasto: 3000, conversas: 60 }, antes: { gasto: 3000, conversas: 75 } })!;
  assert.equal(sp(caro.comparacao ?? ""), "▲ 25% mais caro · antes R$ 40,00");
  assert.equal(caro.tom, "ruim");
  // Abaixo da base mínima de conversas em um dos períodos, ou sem anúncio: sem cartão.
  assert.equal(custo({ antes: { gasto: 3000, conversas: 20 } }), undefined);
  assert.equal(custo({ atual: { gasto: 3000, conversas: 29 } }), undefined);
  assert.equal(custo({ atual: null }), undefined);
  assert.equal(custo({ antes: { gasto: null, conversas: 75 } }), undefined);
  // Poucos dias com custo: o cartão fica, sem a régua.
  assert.equal(custo({ porDia: dias.slice(0, 3) })?.visual, undefined);
}

// ---------------------------------------------------------------- onde mais perdemos
{
  const etapa = (id: string, nome: string, valor: number | null, taxa: number | null): EtapaDesenhada => ({
    id, nome, valor, texto: valor == null ? "Falta dado" : String(valor), estimado: false, motivo: null, explicacao: null, variacao: null,
    passagem: taxa == null ? null : { taxa, fracao: null, sem: null }, detalhe: [],
  });
  const desenhado = (parte: Partial<FunilDesenhado> = {}): FunilDesenhado => ({
    etapas: [etapa("conversou", "Conversou", 120, null), etapa("virou-lead", "Virou lead", 80, null), etapa("atendido", "Atendido", null, null), etapa("agendou", "Agendou", 30, null), etapa("fechou", "Fechou", 9, 0.3)],
    maiorPerda: { de: 3, para: 4, texto: "30% passam" },
    ligacoesForaDeOrdem: [],
    foraDeOrdem: false,
    aviso: null,
    ...parte,
  });
  const perda = (funil: EntradaDoMes["funil"]) => cartoesDoMes(entrada({ conversas: null, funil })).find((c) => c.id === "perda");

  const p = perda({ desenhado: desenhado(), fecharam: { atual: 29, antes: 58 } })!;
  assert.equal(p.numero, "30%");
  assert.equal(p.legenda, "passam de Agendou para Fechou");
  assert.equal(sp(p.comparacao ?? ""), "▼ 50% · fecharam 29, antes 58");
  assert.equal(p.tom, "ruim");
  assert.equal(p.visual?.tipo, "funil");
  if (p.visual?.tipo === "funil") {
    assert.deepEqual(p.visual.etapas.map((x) => x.rotulo), ["Conversou", "Virou lead", "Agendou", "Fechou"], "etapa sem dado não vira barra");
    assert.deepEqual(p.visual.etapas.filter((x) => x.perda).map((x) => x.rotulo), ["Fechou"]);
    assert.ok(p.visual.etapas.every((x) => x.fracao > 0 && x.fracao <= 1));
  }
  // O final cita quem fechou, vindo da soma dos dias.
  assert.equal(cartoesDoMes(entrada({ conversas: null, funil: { desenhado: desenhado(), fecharam: { atual: 29, antes: 58 } } })).at(-1)?.legenda, "29 fecharam.");

  // D-01: uma ligação fora de ordem em outro ponto (a de baixo sem %) não tira o cartão quando a maior perda está numa ligação em ordem.
  const foraEmOutroPonto = desenhado({
    etapas: [etapa("conversou", "Conversou", 120, null), etapa("virou-lead", "Virou lead", 60, 0.5), etapa("atendido", "Atendido", 54, 0.9), etapa("agendou", "Agendou", 90, null), etapa("fechou", "Fechou", 40, 0.44)],
    maiorPerda: { de: 0, para: 1, texto: "50% passam" },
    ligacoesForaDeOrdem: [3],
    foraDeOrdem: true,
    aviso: AVISO_FORA_DE_ORDEM,
  });
  const fp = perda({ desenhado: foraEmOutroPonto, fecharam: { atual: 29, antes: 58 } });
  assert.equal(fp?.numero, "50%");
  assert.equal(fp?.legenda, "passam de Conversou para Virou lead");
  // Sem maior perda (com ou sem ligação fora de ordem): nunca nomeia etapa.
  assert.equal(perda({ desenhado: desenhado({ maiorPerda: null }), fecharam: { atual: 29, antes: 58 } }), undefined);
  assert.equal(perda({ desenhado: desenhado({ maiorPerda: null, ligacoesForaDeOrdem: [4], foraDeOrdem: true, aviso: AVISO_FORA_DE_ORDEM }), fecharam: { atual: 29, antes: 58 } }), undefined);
  // A maior perda numa ligação sem taxa (a que cresce fica sem %) não vira cartão: a checagem da taxa continua guardando.
  assert.equal(perda({ desenhado: desenhado({ maiorPerda: { de: 2, para: 3, texto: "" } }), fecharam: { atual: 29, antes: 58 } }), undefined);
  assert.equal(perda({ desenhado: null, fecharam: { atual: 29, antes: 58 } }), undefined);
  // Sem a soma dos dias o cartão fica sem a comparação (nunca 0).
  assert.equal(perda({ desenhado: desenhado(), fecharam: { atual: null, antes: null } })?.comparacao, undefined);
}

// ---------------------------------------------------------------- 3 apostas
{
  const apostas = [
    { titulo: "Responder quem chamou", motivo: "Mais gente chamou e menos fecharam." },
    { titulo: "Reforçar o formato que mais salva", motivo: "Foi o formato mais salvo do período." },
    { titulo: "Conferir a conexão do Instagram", motivo: "Os dados do Instagram estão atrasados." },
    { titulo: "Uma quarta", motivo: "Esta não entra." },
  ];
  const a = cartoesDoMes(entrada({ conversas: null, apostas })).find((c) => c.id === "apostas")!;
  assert.equal(a.titulo, "3 apostas");
  assert.equal(a.legenda, "para o próximo mês");
  assert.equal(a.numero, null);
  assert.equal(a.visual?.tipo === "lista" ? a.visual.itens.length : 0, 3, "só as 3 primeiras");
  assert.deepEqual(a.visual?.tipo === "lista" ? a.visual.itens[0] : null, apostas[0]);
  assert.equal(cartoesDoMes(entrada({ conversas: null, apostas: [apostas[0]] })).find((c) => c.id === "apostas")?.titulo, "1 aposta");
  assert.equal(cartoesDoMes(entrada({ conversas: null, apostas: [] })).find((c) => c.id === "apostas"), undefined, "sem aposta o cartão some");
  assert.equal(cartoesDoMes(entrada({ conversas: null, apostas: null })).find((c) => c.id === "apostas"), undefined);
  // Texto que compara com outras clínicas ou promete não entra.
  const ruim = cartoesDoMes(entrada({ conversas: null, apostas: [{ titulo: "Subir", motivo: "Vai fechar mais que 3 de 12 clínicas." }, apostas[0]] })).find((c) => c.id === "apostas")!;
  assert.equal(ruim.visual?.tipo === "lista" ? ruim.visual.itens.length : 0, 1);
}

// ---------------------------------------------------------------- a ordem da história completa
{
  const dias = Array.from({ length: 10 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, gasto: 100, conversas: 10 }));
  const etapa = (id: string, nome: string, valor: number, taxa: number | null): EtapaDesenhada => ({ id, nome, valor, texto: String(valor), estimado: false, motivo: null, explicacao: null, variacao: null, passagem: taxa == null ? null : { taxa, fracao: null, sem: null }, detalhe: [] });
  const todos = cartoesDoMes(
    entrada({
      alcance: { atual: 2_400_000, antes: 2_000_000 },
      seguidores: { atual: { novos: 280, diasMedidos: 28 }, antes: { novos: 200, diasMedidos: 28 }, total: [5000, 5280] },
      posts: [{ saved: 10, reach: 100, posted_at: "2026-10-05T15:00:00Z", caption: "x", format: "reels" }],
      anuncios: { atual: { gasto: 3000, conversas: 100 }, antes: { gasto: 3000, conversas: 75 }, porDia: dias },
      funil: { desenhado: { etapas: [etapa("conversou", "Conversou", 120, null), etapa("fechou", "Fechou", 9, 0.3)], maiorPerda: { de: 0, para: 1, texto: "30% passam" }, ligacoesForaDeOrdem: [], foraDeOrdem: false, aviso: null }, fecharam: { atual: 29, antes: 58 } },
      apostas: [{ titulo: "Responder quem chamou", motivo: "Mais gente chamou e menos fecharam." }],
    }),
  );
  assert.deepEqual(todos.map((c) => c.id), ["abertura", "alcance", "seguidores", "post", "custo", "whatsapp", "perda", "apostas", "final"], "a ordem da história");
  assert.equal(todos.at(-1)?.legenda, "300 chamaram, 29 fecharam.");
  for (const c of todos) {
    // Nenhuma estimativa nem "o que teria sido" (D-05) e nada de enviar, compartilhar ou baixar (D-04).
    const texto = [c.rotulo, c.titulo ?? "", c.legenda, c.comparacao ?? ""].join(" ");
    assert.ok(!/~|a menos|teria|compartilh|baixar|PDF|enviar/i.test(texto), `cartão ${c.id}: texto proibido em "${texto}"`);
    if (c.numero != null) assert.ok(/\d/.test(c.numero), `cartão ${c.id}: o número tem dígito`);
  }
  assert.equal(todos.filter((c) => c.numero == null).map((c) => c.id).join(","), "abertura,apostas,final", "só estes três cartões não têm número grande");
}

// ---------------------------------------------------------------- a EntradaHoje movida para entrada-da-hoje.ts é a mesma de antes
{
  const START = "2026-09-13";
  const END = "2026-10-12";
  const HOJE = "2026-10-14";
  const dia = (i: number) => new Date(Date.UTC(2026, 8, 13 + i, 12)).toISOString().slice(0, 10);
  const diario = Array.from({ length: 30 }, (_, i) => ({ date: dia(i), reach: 1000 + i * 10, total_interactions: 60 + (i % 7), new_followers: 10 + (i % 3), unfollowers: 2, saves: 5 + (i % 4), followers_count: 5000 + i * 8 }));
  const posts = Array.from({ length: 12 }, (_, i) => ({ posted_at: `${dia(i * 2)}T15:00:00Z`, reach: 800 + i * 20, saved: 4 + (i % 5), engagement: 50 + i, caption: `Legenda fictícia ${i}`, format: i % 2 ? "reels" : "carrossel" }));
  const resultado = montarResultado({ start: START, end: END, hoje: HOJE, diario, posts, fontes: { tem_instagram: true, tem_anuncios: false, tem_crm: false, tem_atendimento: false } });
  const funil = { funil: null, atual: {}, antes: {} };
  const dados = { resultado, start: START, end: END, hoje: HOJE, funil, roi: null, pessoas: undefined, posts, metricas: diario, anterior: [], temIg: true, fontes: [] };

  // Como o código inline da Hoje montava (a mesma conta, escrita aqui como referência).
  const feitos = fatosDeResultadosComAreas({ resultado, de: START, ate: END, hoje: HOJE, funil: null, roi: null });
  const comp = variacoes(diario, []);
  const cresc = analyzeGrowth(diario, START, END);
  const antigo = {
    fatos: feitos.fatos,
    porArea: feitos.porArea,
    insights: resultado.insights,
    limitacoes: resultado.limitacoes,
    extras: [
      { tela: "posts", rota: "/_authenticated/$clientId/posts", fatos: fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts }) },
      {
        tela: "conteudo",
        rota: "/_authenticated/$clientId/conteudo",
        fatos: fatosDoInstagram(lerPeriodo({ diario, diarioAnterior: [], posts }), {
          de: START, ate: END, hoje: HOJE, posts, diario, anteriorMedido: false,
          variacaoLimitada: comp.limitada && comp.motivo ? { motivo: comp.motivo } : null,
          crescimento: cresc ? { novos: cresc.novos, saidas: cresc.saidas, liquido: cresc.liquido, diasMedidos: cresc.diasMedidos } : null,
        }),
      },
    ],
    fontes: [],
  };
  assert.deepEqual(montarEntradaDaHoje(dados), antigo, "a EntradaHoje com o Instagram ligado");
  assert.deepEqual(montarEntradaDaHoje({ ...dados, temIg: false }).extras, [], "sem Instagram ligado não há fonte extra de posts nem de desempenho");
  assert.equal(montarEntradaDaHoje({ ...dados, posts: undefined }).extras?.length, 0, "sem posts carregados, nenhuma fonte extra");
  assert.equal(montarEntradaDaHoje({ ...dados, metricas: undefined }).extras?.length, 1, "sem o diário, só as publicações");
  // As ações vêm da mesma regra da Hoje, e cada descoberta que sai delas passa nas guardas de texto.
  const acoes = acoesDaHoje(montarEntradaDaHoje(dados));
  if (acoes.tipo === "acoes") {
    for (const acao of [acoes.proxima, ...acoes.outras].filter((x) => x != null)) {
      const d = descobertaDaAcao(acao);
      if (d) assert.deepEqual(checarFraseCinco(d.frase), [], `a descoberta "${d.frase}" passa nas guardas`);
    }
  }
}

// ---------------------------------------------------------------- guardas de texto e um número por cartão
{
  const todos = cartoesDoMes(entrada());
  for (const c of todos) {
    for (const texto of [c.legenda, c.comparacao ?? ""]) assert.deepEqual(checarFraseCinco(texto), [], `cartão ${c.id}: "${texto}"`);
    // Um número grande só: o número é uma string única (nenhum cartão carrega dois).
    assert.ok(c.numero == null || typeof c.numero === "string");
  }
}

console.log("test-fechamento-do-mes: ok");
