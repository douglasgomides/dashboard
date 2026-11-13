// Anúncios no formato 5 segundos (Phase 03.1.1.1, plano 09): o veredito do custo por conversa com o sinal honesto, o custo de cada dia, a média
// móvel de 7 dias, os dias de verba baixa e as descobertas. Módulo puro, só dados fictícios: nenhum nome, número ou campanha dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-anuncios.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GUARDA_SEM_COMPARAR_CLINICAS, checarDescoberta, checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import {
  ACOES_DE_ANUNCIOS,
  custoPorDia,
  descobertasDosAnuncios,
  diasDeVerbaBaixa,
  mediaMovel7,
  vereditoDosAnuncios,
  type DiaDeAnuncio,
  type DiaDoResultado,
  type EntradaCincoAnuncios,
} from "../src/lib/leitura/cinco-anuncios";

// O real brasileiro sai com espaço sem quebra (U+00A0) em alguns pontos: nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

const dia = (i: number) => new Date(Date.UTC(2026, 9, 30) - i * 86_400_000).toISOString().slice(0, 10);
/** `n` dias terminando em `fim` dias atrás, todos com o mesmo gasto e as mesmas conversas. */
function dias(n: number, gasto: number, conversas: number, fim = 0): DiaDeAnuncio[] {
  return Array.from({ length: n }, (_, k) => ({ dia: dia(fim + (n - 1 - k)), gasto, conversas }));
}

const fatosOk = (): FatosDaTela => ({
  tela: "anuncios",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo: { de: dia(29), ate: dia(0), anterior: { de: dia(59), ate: dia(30) } },
  portao: { ok: true },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});
const fatosSuspeitos = (): FatosDaTela => ({
  ...fatosOk(),
  portao: {
    ok: false,
    codigo: "rastreio_suspeito",
    motivo: "o rastreio das conversas dos anúncios está suspeito (700 cliques no link e só 9 conversas contadas)",
    passo: { verbo: "corrigir", texto: "o rastreio das conversas dos anúncios", quem: "gestor_trafego" },
  },
});

// ---------------------------------------------------------------- veredito
{
  // Custo caiu de 29 para 24: "Melhorou", "mais barato", e a frase cabe nas regras de texto.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 2400, conversas: 100 }, anterior: { gasto: 2900, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Melhorou");
  assert.equal(v.tom, "bom");
  const t = sp(textoDaFrase(v.frase));
  assert.equal(t, "R$ 24 por conversa: 17% mais barato que no período anterior");
  assert.ok(t.length <= 90);
  assert.deepEqual(checarFraseCinco(t), []);
  assert.match(sp(v.apoio ?? ""), /^Antes: R\$ 29,00 por conversa\. Investido caiu 17%; conversas iguais\.$/);
  // O número vem em destaque e o percentual leva a ênfase do lado bom.
  assert.equal(v.frase[0].enfase, "numero");
  assert.equal(v.frase[2].enfase, "bom");
}
{
  // Custo subiu: "Piorou" e "mais caro", nunca "mais barato".
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 80 }, anterior: { gasto: 3000, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Piorou");
  assert.equal(v.tom, "ruim");
  const t = sp(textoDaFrase(v.frase));
  assert.match(t, /^R\$ 38 por conversa: 25% mais caro que no período anterior$/);
  assert.ok(!/barato/.test(t), "custo que subiu nunca diz mais barato");
  assert.equal(v.frase[2].enfase, "ruim");
}
{
  // Dentro de 3%: "Estável" e "igual ao período anterior", sem percentual.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 100 }, anterior: { gasto: 2950, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Estável");
  assert.equal(v.tom, "neutro");
  assert.equal(sp(textoDaFrase(v.frase)), "R$ 30 por conversa: igual ao período anterior");
}
{
  // Custo abaixo de R$ 10 mostra os centavos; o limite de 90 caracteres vale para custo e percentuais grandes.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 540, conversas: 60 }, anterior: { gasto: 3000, conversas: 60 } });
  assert.ok(v && v.tipo === "veredito");
  const t = sp(textoDaFrase(v.frase));
  assert.match(t, /^R\$ 9,00 por conversa: 82% mais barato/);
  assert.ok(t.length <= 90);
}
{
  // Poucas conversas (abaixo do mínimo do funil) em qualquer período: sem percentual, vira a conclusão que a leitura já tinha.
  const sem = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 300, conversas: 10 }, anterior: { gasto: 300, conversas: 100 } });
  assert.ok(sem);
  assert.ok(sem.tipo === "sem_leitura" || !/%/.test(textoDaFrase(sem.frase)), "sem base mínima nunca dá percentual de custo");
  const semAnterior = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 100 }, anterior: null });
  assert.ok(semAnterior);
  assert.ok(semAnterior.tipo === "sem_leitura" || !/mais (barato|caro)/.test(textoDaFrase(semAnterior.frase)));
}
{
  // Rastreio suspeito: o mesmo "Falta dado:" e o mesmo passo da leitura (Gestor de tráfego), nunca um veredito de custo.
  const v = vereditoDosAnuncios({ fatos: fatosSuspeitos(), atual: { gasto: 3000, conversas: 100 }, anterior: { gasto: 3000, conversas: 80 } });
  assert.ok(v && v.tipo === "sem_leitura");
  assert.match(v.motivo, /rastreio das conversas dos anúncios está suspeito/);
  assert.equal(v.passo.quem, "gestor_trafego");
  assert.match(v.passo.rotuloQuem, /Gestor de tráfego/);
}
{
  // Fatos ainda carregando: nada.
  assert.equal(vereditoDosAnuncios({ fatos: null, atual: null, anterior: null }), null);
}

// ---------------------------------------------------------------- custo por dia e média móvel
{
  const lista = custoPorDia([
    { dia: dia(3), gasto: 100, conversas: 4 },
    { dia: dia(2), gasto: 100, conversas: 0 },
    { dia: dia(1), gasto: 0, conversas: 3 },
    { dia: dia(0), gasto: 90, conversas: 3 },
  ]);
  // Dia sem conversa e dia sem gasto não ganham custo (nunca zero, nunca divisão por zero).
  assert.deepEqual(lista, [
    { dia: dia(3), custo: 25 },
    { dia: dia(0), custo: 30 },
  ]);
  assert.deepEqual(custoPorDia([]), []);
}
{
  // 10 dias a R$ 25 por conversa: os 6 primeiros são null (ainda não existem 7 dias) e depois R$ 25.
  const m = mediaMovel7(dias(10, 100, 4));
  assert.equal(m.valores.length, 10);
  assert.deepEqual(m.valores.slice(0, 6), [null, null, null, null, null, null]);
  assert.deepEqual(m.valores.slice(6), [25, 25, 25, 25]);
  assert.deepEqual(m.melhor, { valor: 25, ate: dia(3) });
  // Menos de 7 dias: nenhuma média e nenhuma melhor semana.
  const curto = mediaMovel7(dias(5, 100, 4));
  assert.ok(curto.valores.every((v) => v == null));
  assert.equal(curto.melhor, null);
  assert.deepEqual(mediaMovel7([]), { datas: [], valores: [], melhor: null });
}
{
  // A melhor semana é a menor média medida, com o dia em que a janela termina. Dias com custo alto no começo e baixo no fim.
  const alto = dias(7, 200, 4, 7); // R$ 50
  const baixo = dias(7, 80, 4, 0); // R$ 20
  const m = mediaMovel7([...alto, ...baixo]);
  assert.equal(m.melhor?.valor, 20);
  assert.equal(m.melhor?.ate, dia(0));
  // Janela sem conversa: buraco, nunca zero.
  const seca = mediaMovel7(dias(9, 100, 0));
  assert.ok(seca.valores.every((v) => v == null));
  assert.equal(seca.melhor, null);
}

// ---------------------------------------------------------------- dias de verba baixa
/** 30 dias de R$ 100 e 4 conversas, menos os dias `baixos` (índices de 0 a 29, o 29 é o mais antigo): verba e conversas dados à parte. */
function mes(baixos: readonly number[], verba: number, conversas: number): DiaDeAnuncio[] {
  return Array.from({ length: 30 }, (_, k) => {
    const i = 29 - k;
    return baixos.includes(i) ? { dia: dia(i), gasto: verba, conversas } : { dia: dia(i), gasto: 100, conversas: 4 };
  });
}
{
  // 4 dias seguidos com R$ 10 e nenhuma conversa: dias baixos, sem custo (não há conversa para dividir).
  const b = diasDeVerbaBaixa(mes([10, 11, 12, 13], 10, 0));
  assert.ok(b);
  assert.equal(b.dias.length, 4);
  assert.equal(b.de, dia(13));
  assert.equal(b.ate, dia(10));
  assert.equal(b.verbaMin, 10);
  assert.equal(b.verbaMax, 10);
  assert.equal(b.verbaComum, 100);
  assert.deepEqual(b.verbaMedia, { baixa: 10, normal: 100 });
  assert.deepEqual(b.conversasMedia, { baixa: 0, normal: 4 });
  assert.equal(b.custo, null);
}
{
  // Com conversas nos dias baixos há custo: R$ 10 por conversa contra R$ 25.
  const b = diasDeVerbaBaixa(mes([5, 6], 10, 1));
  assert.ok(b);
  assert.deepEqual(b.custo, { baixa: 10, normal: 25 });
}
{
  // Verba zero com linha conta como baixa; verba só um pouco abaixo (60% do comum) não conta.
  const zero = diasDeVerbaBaixa(mes([3, 4], 0, 0));
  assert.ok(zero);
  assert.equal(zero.verbaMin, 0);
  assert.equal(zero.custo, null);
  assert.equal(diasDeVerbaBaixa(mes([3, 4, 5], 60, 3)), null);
  // Só 1 dia baixo: nenhuma queda para apontar.
  assert.equal(diasDeVerbaBaixa(mes([7], 5, 0)), null);
  // Menos de 7 dias com gasto: não dá para saber o que é um dia comum.
  assert.equal(diasDeVerbaBaixa(dias(6, 100, 3)), null);
  assert.equal(diasDeVerbaBaixa([]), null);
  // Muitos dias baixos (mais de 40%) é o ritmo da clínica, não uma queda.
  assert.equal(diasDeVerbaBaixa(mes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 5, 0)), null);
  // Dia sem linha dentro do período não conta como dia baixo (sem dado não é verba zero).
  const comBuraco = mes([10, 11], 5, 0).filter((d) => d.dia !== dia(20));
  const sem = diasDeVerbaBaixa(comBuraco);
  assert.ok(sem);
  assert.equal(sem.dias.length, 2);
}

// ---------------------------------------------------------------- descobertas
const ROTA_ATENDIMENTO = "/_authenticated/$clientId/atendimento";
const ROTA_FUNIL = "/_authenticated/$clientId/pacientes";
const diarioCom = (mandaram: number, agendaram: number | null): DiaDoResultado[] => [{ dia: dia(1), mandaram_mensagem: mandaram, agendaram }];
const entrada = (extra: Partial<EntradaCincoAnuncios> = {}): EntradaCincoAnuncios => ({
  porDia: mes([10, 11, 12, 13], 10, 0),
  atual: { gasto: 2400, conversas: 100 },
  anterior: { gasto: 2900, conversas: 100 },
  fatos: fatosOk(),
  diario: diarioCom(120, 30),
  equipe: false,
  ...extra,
});
{
  const r = descobertasDosAnuncios(entrada());
  assert.ok(r.itens.length >= 3 && r.itens.length <= 5, `${r.itens.length} descobertas`);
  assert.equal(r.aviso, null);
  for (const d of r.itens) {
    assert.deepEqual(checarDescoberta(d), [], `descoberta ${d.id}`);
    assert.ok(d.porque.barras.length >= 2 && d.porque.barras.length <= 3, `${d.id} com ${d.porque.barras.length} barras`);
    assert.ok(d.acao.rota || d.acao.local, `${d.id} tem uma ação`);
    assert.ok(!(d.acao.rota && d.acao.local), `${d.id} tem UMA ação só`);
    // Nenhuma estimativa de conversa perdida nem projeção, e nada que pareça envio (W-3, CHAM-07).
    const tudo = [d.frase, d.impacto ?? "", d.porque.obs ?? "", ...d.porque.barras.map((b) => `${b.rotulo} ${b.exibicao}`), d.acao.rotulo].join(" | ");
    assert.ok(!/a menos nesses|cerca de|estimativa|avisar|enviar|pedir/i.test(tudo), `texto de ${d.id} promete, estima ou parece envio: ${tudo}`);
    assert.deepEqual(checarFraseCinco(d.frase), []);
    assert.ok(!GUARDA_SEM_COMPARAR_CLINICAS.test(tudo));
  }
  // Em ordem de impacto: o que piorou antes do que melhorou.
  const ordem = { ruim: 0, atencao: 1, bom: 2, neutro: 3 } as const;
  for (let i = 1; i < r.itens.length; i++) assert.ok(ordem[r.itens[i - 1].tom] <= ordem[r.itens[i].tom], "ordem por tom");

  // Dias de verba baixa: frase com o período e a faixa, tom ruim (as conversas caíram), "Custo" listrado (sem conversa nos dias baixos).
  const baixa = r.itens.find((d) => d.id === "anuncios-verba-baixa");
  assert.ok(baixa);
  assert.equal(sp(baixa.frase), `4 dias com verba baixa (${dia(13).slice(8, 10)}/${dia(13).slice(5, 7)} a ${dia(10).slice(8, 10)}/${dia(10).slice(5, 7)}): R$ 10 por dia.`);
  assert.equal(baixa.tom, "ruim");
  assert.equal(baixa.selo, "Fora do normal");
  assert.equal(baixa.quem, "Gestor de tráfego");
  assert.deepEqual(baixa.acao, { rotulo: "Ver plano de verba", local: ACOES_DE_ANUNCIOS.plano });
  assert.equal(baixa.impacto, "0,0 vs 4,0 conversas por dia");
  const custo = baixa.porque.barras.find((b) => b.rotulo === "Custo nos dias baixos");
  assert.ok(custo?.faltou && custo.exibicao === "Falta dado");
}
{
  // Custo subiu: a descoberta diz "subiu" e "Piorou", nunca "caiu".
  const r = descobertasDosAnuncios(entrada({ atual: { gasto: 3000, conversas: 80 }, anterior: { gasto: 3000, conversas: 100 } }));
  const custo = r.itens.find((d) => d.id === "anuncios-custo-por-conversa");
  assert.ok(custo);
  assert.equal(custo.tom, "ruim");
  assert.equal(custo.selo, "Piorou");
  assert.match(sp(custo.frase), /^Custo por conversa subiu 25%: de R\$ 30 para R\$ 38\.$/);
  assert.ok(!/caiu/.test(custo.frase));
  // Custo igual (dentro de 3%): sem descoberta de custo (o veredito já diz "igual").
  const igual = descobertasDosAnuncios(entrada({ atual: { gasto: 3000, conversas: 100 }, anterior: { gasto: 2950, conversas: 100 } }));
  assert.ok(!igual.itens.some((d) => d.id === "anuncios-custo-por-conversa"));
}
{
  // O dia mais barato só entra com dias suficientes e conversas por dia: o custo de 1 conversa não é recorde.
  const porDia = mes([], 0, 0).map((d, k) => ({ ...d, conversas: k === 3 ? 1 : 4, gasto: k === 3 ? 1 : 100 + k }));
  const r = descobertasDosAnuncios(entrada({ porDia }));
  const rec = r.itens.find((d) => d.id === "anuncios-dia-mais-barato");
  assert.ok(rec);
  assert.ok(!rec.frase.includes("R$ 1 "), "um dia de 1 conversa nunca é o recorde");
  assert.equal(rec.selo, "Seu recorde");
  assert.equal(rec.porque.barras.length, 3);
  const poucos = descobertasDosAnuncios(entrada({ porDia: dias(5, 100, 4) }));
  assert.ok(!poucos.itens.some((d) => d.id === "anuncios-dia-mais-barato"));
}
{
  // Gargalo depois do anúncio: menos da metade agendaram -> a frase do plano, e a ação muda com quem olha (equipe vai ao Atendimento).
  const equipe = descobertasDosAnuncios(entrada({ diario: diarioCom(120, 30), equipe: true }));
  const g = equipe.itens.find((d) => d.id === "anuncios-depois-do-anuncio");
  assert.ok(g);
  assert.equal(g.frase, "O anúncio traz conversa. O gargalo é depois: de cada 100 conversas, 25 agendaram.");
  assert.equal(g.tom, "atencao");
  assert.deepEqual(g.acao, { rotulo: "Ver atendimento", rota: ROTA_ATENDIMENTO });
  const medico = descobertasDosAnuncios(entrada({ diario: diarioCom(120, 30), equipe: false })).itens.find((d) => d.id === "anuncios-depois-do-anuncio");
  assert.deepEqual(medico?.acao, { rotulo: "Ver o funil", rota: ROTA_FUNIL });
  // A barra do anúncio que virou consulta é listrada (não há esse dado), e as conversas são de todas as origens.
  assert.ok(g.porque.barras.some((b) => b.faltou && b.exibicao === "Falta dado"));
  assert.match(g.porque.obs ?? "", /todas as origens/);
  // Mais da metade agendou: não chama de gargalo.
  const bom = descobertasDosAnuncios(entrada({ diario: diarioCom(100, 70) })).itens.find((d) => d.id === "anuncios-depois-do-anuncio");
  assert.ok(bom);
  assert.equal(bom.frase, "De cada 100 conversas, 70 agendaram.");
  assert.ok(!/gargalo/.test(bom.frase));
  // Abaixo do mínimo de conversas do funil, sem agendamento medido ou com mais agendamentos que conversas: nenhuma frase de gargalo.
  for (const diario of [diarioCom(10, 2), diarioCom(120, null), diarioCom(100, 140), null]) {
    assert.ok(!descobertasDosAnuncios(entrada({ diario })).itens.some((d) => d.id === "anuncios-depois-do-anuncio"));
  }
}
{
  // Rastreio suspeito ou fatos carregando: nenhuma descoberta.
  assert.deepEqual(descobertasDosAnuncios(entrada({ fatos: fatosSuspeitos() })), { itens: [], aviso: null });
  assert.deepEqual(descobertasDosAnuncios(entrada({ fatos: null })), { itens: [], aviso: null });
  // Poucos dados: só o que existe e o aviso com o motivo (nunca enche até 3).
  const pouco = descobertasDosAnuncios({ porDia: dias(3, 100, 4), atual: null, anterior: null, fatos: fatosOk(), diario: null });
  assert.equal(pouco.itens.length, 0);
  assert.match(pouco.aviso ?? "", /^Poucas descobertas neste período: .+\.$/);
}

// ---------------------------------------------------------------- a regra não lê dado de outra clínica
{
  const fonte = await readFile(new URL("../src/lib/leitura/cinco-anuncios.ts", import.meta.url), "utf8");
  assert.ok(!/carteira|outras cl[ií]nicas|ranking|benchmark/i.test(fonte.replace(/\/\/.*$/gm, "")), "a regra não compara com outras clínicas (D-02)");
}

console.log("test-cinco-anuncios: ok");
