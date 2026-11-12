// Atendimento no formato 5 segundos (Phase 03.1.1.1, plano 06): o veredito das conversas por dia, os 3 números-chave contra a própria clínica, o
// dia cruzado com o Instagram e os anúncios dela e as descobertas. Módulo puro, só dados fictícios: nenhum número, nome ou legenda dos pilotos
// entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-atendimento.ts
import assert from "node:assert/strict";
import { foraDaFaixa } from "../src/lib/faixa-do-normal";
import { nomeDoDia } from "../src/lib/linha-30-dias";
import { checarDescoberta, checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import {
  MOTIVO_SEM_VOLUME,
  diaComum,
  diaCruzado,
  descobertasDoAtendimento,
  diaInicialDoCruzamento,
  faixaDasConversas,
  numerosDoAtendimento,
  padraoDaSemana,
  valoresNoEixo,
  vereditoDoAtendimento,
  type DiaSolto,
  type EntradaCincoAtendimento,
  type SerieNoEixo,
} from "../src/lib/leitura/cinco-atendimento";

// O real brasileiro sai com espaço sem quebra (U+00A0): nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

// ---------------------------------------------------------------- fixtures (todas fictícias)
const dataDoDia = (i: number) => new Date(Date.UTC(2026, 9, 1 + i, 12)).toISOString().slice(0, 10);
const eixo = (n: number) => Array.from({ length: n }, (_, i) => dataDoDia(i));
const serie = (valores: (number | null)[]): SerieNoEixo => ({ datas: eixo(valores.length), valores });

/** 30 dias: perto de 17 conversas por dia, um pico no dia 11 (52) e um dia quase parado no dia 19 (3). */
const PADRAO = [16, 18, 17, 19, 15, 18, 17];
const agora30 = Array.from({ length: 30 }, (_, i) => (i === 11 ? 52 : i === 19 ? 3 : PADRAO[i % 7]));
const antes30 = Array.from({ length: 30 }, () => 14);
const soma = (v: (number | null)[]) => v.reduce<number>((s, x) => s + (x ?? 0), 0);

/** O alcance diário fictício: perto de 1.000, com um dia de 5.000 (o dia 11 do eixo). */
const alcanceDe = (n: number, pico = 11): DiaSolto[] => Array.from({ length: n }, (_, i) => ({ dia: dataDoDia(i), valor: i === pico ? 5000 : 900 + ((i * 37) % 200) }));
/** As conversas pelo anúncio: 12 a 14 por dia, com o dia 19 quase parado (2). */
const anuncioDe = (n: number): DiaSolto[] => Array.from({ length: n }, (_, i) => ({ dia: dataDoDia(i), valor: i === 19 ? 2 : 12 + (i % 3) }));

const entrada = (resto: Partial<EntradaCincoAtendimento> = {}): EntradaCincoAtendimento => ({
  dias: 30,
  conversas: serie(agora30),
  conversasAntes: serie(antes30),
  pessoas: { agora: 410, antes: 380 },
  somas: { atual: { mandaram_mensagem: 500, leads_novos: 150 }, antes: { mandaram_mensagem: 480, leads_novos: 190 } },
  diario: {
    mandaram: Array.from({ length: 30 }, (_, i) => 15 + (i % 4)),
    leads: Array.from({ length: 30 }, (_, i) => 4 + (i % 3)),
  },
  alcance: alcanceDe(30),
  anuncios: anuncioDe(30),
  equipe: true,
  ...resto,
});

// ---------------------------------------------------------------- veredito
{
  const v = vereditoDoAtendimento(entrada());
  assert.ok(v.tipo === "veredito");
  assert.equal(textoDaFrase(v.frase), "Chegam 18 conversas por dia.");
  assert.equal(v.frase.find((p) => p.enfase)?.texto, "18 conversas por dia", "o número vai em destaque, como dado (nunca HTML)");
  assert.equal(v.palavra, "Estável");
  assert.equal(v.tom, "neutro");
  assert.match(sp(v.apoio ?? ""), /^Normal: de \d+ a \d+ conversas por dia · 2 dias fora disso\.$/);
  assert.deepEqual(checarFraseCinco(textoDaFrase(v.frase)), []);
  assert.deepEqual(checarFraseCinco(v.apoio ?? ""), []);
  assert.ok(textoDaFrase(v.frase).length <= 90 && (v.apoio ?? "").length <= 90);

  // O apoio diz o mesmo normal que a faixa do gráfico.
  const faixa = faixaDasConversas(entrada().conversas);
  assert.ok(faixa);
  assert.ok((v.apoio ?? "").includes(`de ${faixa.lo} a ${faixa.hi} conversas`));
}
{
  // Poucos dias medidos: a frase fica, e o apoio diz "Falta dado" (nunca um normal inventado).
  const v = vereditoDoAtendimento({ conversas: serie([10, 12, 11, 13, 12]) });
  assert.ok(v.tipo === "veredito");
  assert.equal(v.palavra, "Falta dado");
  assert.equal(v.apoio, "Falta dado: poucos dias para saber o normal.");
  assert.equal(textoDaFrase(v.frase), "Chegam 12 conversas por dia.");
}
{
  // Nenhum dia medido: o mesmo "Falta dado: motivo" da leitura, com o passo.
  const v = vereditoDoAtendimento({ conversas: serie([null, null, null]) });
  assert.ok(v.tipo === "sem_leitura");
  assert.equal(v.motivo, MOTIVO_SEM_VOLUME);
  assert.ok(v.passo.frase.length > 0);
  assert.equal(vereditoDoAtendimento({ conversas: serie([]) }).tipo, "sem_leitura");
}
{
  // Os 3 últimos dias medidos todos abaixo ou todos acima do normal: "Em queda" e "Em alta".
  const estavel = Array.from({ length: 27 }, () => 20);
  const queda = vereditoDoAtendimento({ conversas: serie([...estavel, 1, 1, 1]) });
  assert.ok(queda.tipo === "veredito");
  assert.equal(queda.palavra, "Em queda");
  assert.equal(queda.tom, "ruim");
  const alta = vereditoDoAtendimento({ conversas: serie([...estavel, 90, 90, 90]) });
  assert.ok(alta.tipo === "veredito");
  assert.equal(alta.palavra, "Em alta");
  assert.equal(alta.tom, "bom");
  // Mais de um quarto dos dias fora do normal, mas não nos últimos 3: "Atenção".
  const solto = [...Array.from({ length: 5 }, () => 0), ...Array.from({ length: 5 }, () => 200), ...Array.from({ length: 20 }, () => 20)];
  const mexido = [...solto.slice(10, 12), ...solto.slice(0, 10), ...solto.slice(12)];
  const atencao = vereditoDoAtendimento({ conversas: serie(mexido) });
  assert.ok(atencao.tipo === "veredito");
  assert.equal(atencao.palavra, "Atenção");
  assert.equal(atencao.tom, "atencao");
}
{
  // Singular, decimal e menos de 1.
  const frase = (valores: number[]) => {
    const v = vereditoDoAtendimento({ conversas: serie(valores) });
    assert.ok(v.tipo === "veredito");
    return sp(textoDaFrase(v.frase));
  };
  assert.equal(frase(Array.from({ length: 10 }, () => 1)), "Chegam 1 conversa por dia.");
  assert.equal(frase([2, 3, 2, 3, 2, 3, 2, 3]), "Chegam 2,5 conversas por dia.");
  assert.equal(frase([0, 1, 0, 0, 1, 0, 0, 0]), "Chegam menos de 1 conversa por dia.");
}

// ---------------------------------------------------------------- números-chave
{
  const [conversas, taxa, pessoas] = numerosDoAtendimento(entrada());
  assert.deepEqual([conversas.id, taxa.id, pessoas.id], ["conversas", "viram-lead", "pessoas"]);
  assert.deepEqual([conversas.titulo, taxa.titulo, pessoas.titulo], ["Conversas", "Viram lead, de cada 100", "Pessoas diferentes"]);

  // Conversas: a soma do volume diário contra a soma do período anterior da mesma clínica.
  const atual = soma(agora30);
  assert.equal(conversas.valor, atual);
  assert.equal(conversas.antes, 420);
  const pct = Math.round(((atual - 420) / 420) * 100);
  assert.equal(conversas.textoDaVariacao, `▲ ${pct}% · melhor que antes`);
  assert.equal(conversas.melhor, true);
  assert.equal(conversas.selo, null);
  assert.equal(conversas.serie?.datas.length, 30, "a linha de 30 dias usa a série diária");

  // Viram lead de cada 100: 150 de 500 = 30, contra 190 de 480 = 40 (arredonda 39,58): 10 pontos a menos.
  assert.equal(taxa.valor, 30);
  assert.equal(taxa.antes, 40);
  assert.equal(taxa.textoDaVariacao, "▼ 10 pontos · pior que antes");
  assert.equal(taxa.melhor, false);
  assert.ok(taxa.serie && taxa.serie.valores.filter((v) => v != null).length >= 2);

  // Pessoas diferentes: 410 contra 380.
  assert.equal(pessoas.valor, 410);
  assert.equal(pessoas.antes, 380);
  assert.equal(pessoas.textoDaVariacao, "▲ 8% · melhor que antes");
  assert.equal(pessoas.serie, undefined, "pessoas diferentes não tem série diária");
}
{
  // Sem o período anterior (a leitura falhou): o número fica, a variação some e o selo diz por quê.
  const [conversas, , pessoas] = numerosDoAtendimento(entrada({ conversasAntes: null, pessoas: { agora: 410, antes: null } }));
  assert.equal(conversas.valor, soma(agora30));
  assert.equal(conversas.textoDaVariacao, null);
  assert.deepEqual(conversas.selo, { tom: "neutro", texto: "Falta dado · sem período anterior" });
  assert.equal(pessoas.textoDaVariacao, null);
  assert.deepEqual(pessoas.selo, { tom: "neutro", texto: "Falta dado · sem período anterior" });
}
{
  // Base pequena no período anterior: sem variação (2 conversas viram +100%), com o motivo.
  const [conversas] = numerosDoAtendimento(entrada({ conversasAntes: serie(Array.from({ length: 30 }, () => 0)) }));
  assert.equal(conversas.textoDaVariacao, null);
  assert.deepEqual(conversas.selo, { tom: "neutro", texto: "Falta dado · poucas conversas antes" });
  // Poucos dias medidos no anterior: também não compara.
  const [pouco] = numerosDoAtendimento(entrada({ conversasAntes: serie([...Array.from({ length: 5 }, () => 14), ...Array.from({ length: 25 }, () => null)]) }));
  assert.equal(pouco.textoDaVariacao, null);
  assert.deepEqual(pouco.selo, { tom: "neutro", texto: "Falta dado · poucos dias medidos" });
  // Pessoas com base pequena antes.
  const [, , pessoas] = numerosDoAtendimento(entrada({ pessoas: { agora: 410, antes: 12 } }));
  assert.equal(pessoas.textoDaVariacao, null);
  assert.deepEqual(pessoas.selo, { tom: "neutro", texto: "Falta dado · poucas pessoas antes" });
}
{
  // Viram lead de cada 100: cada ressalva é um "Falta dado" com o motivo, nunca zero.
  const mede = (atual: Record<string, number | null> | null, antes: Record<string, number | null> | null = { mandaram_mensagem: 480, leads_novos: 190 }) =>
    numerosDoAtendimento(entrada({ somas: { atual, antes } }))[1];
  const semHistorico = mede(null);
  assert.equal(semHistorico.valor, null);
  assert.match(semHistorico.motivo ?? "", /histórico por dia não mede/);
  assert.match(mede({ mandaram_mensagem: 100, leads_novos: 130 }).motivo ?? "", /passa de quem chamou/);
  assert.match(mede({ mandaram_mensagem: null, leads_novos: 10 }).motivo ?? "", /histórico por dia não mede/);
  // Poucas conversas agora: "N de M", sem "de cada 100" nem variação.
  const pouca = mede({ mandaram_mensagem: 20, leads_novos: 6 });
  assert.equal(pouca.valor, null);
  assert.equal(pouca.valorTexto, "6 de 20");
  assert.equal(pouca.textoDaVariacao, null);
  assert.deepEqual(pouca.selo, { tom: "neutro", texto: "Falta dado · poucas conversas" });
  // Base pequena no período anterior: o número fica, a variação não.
  const semAnterior = mede({ mandaram_mensagem: 500, leads_novos: 150 }, { mandaram_mensagem: 10, leads_novos: 4 });
  assert.equal(semAnterior.valor, 30);
  assert.equal(semAnterior.textoDaVariacao, null);
  assert.deepEqual(semAnterior.selo, { tom: "neutro", texto: "Falta dado · sem período anterior" });
  assert.equal(mede({ mandaram_mensagem: 500, leads_novos: 150 }, null).textoDaVariacao, null);
  // Melhorou: 40 de cada 100 contra 30.
  const melhorou = mede({ mandaram_mensagem: 500, leads_novos: 200 }, { mandaram_mensagem: 500, leads_novos: 150 });
  assert.equal(melhorou.textoDaVariacao, "▲ 10 pontos · melhor que antes");
  assert.equal(melhorou.melhor, true);
  // Igual (menos de 1 ponto).
  const igual = mede({ mandaram_mensagem: 500, leads_novos: 150 }, { mandaram_mensagem: 500, leads_novos: 151 });
  assert.equal(igual.textoDaVariacao, "= igual");
  assert.equal(igual.melhor, null);
  // Sem o histórico por dia alinhado, não há linha de 30 dias.
  assert.equal(numerosDoAtendimento(entrada({ diario: null }))[1].serie, undefined);
  // Pessoas sem medida: motivo, nunca zero.
  const semPessoas = numerosDoAtendimento(entrada({ pessoas: { agora: null, antes: 380 } }))[2];
  assert.equal(semPessoas.valor, null);
  assert.match(semPessoas.motivo ?? "", /não trouxe as pessoas diferentes/);
  // Sem nenhum dia medido de conversas: motivo, nunca zero.
  const semDias = numerosDoAtendimento(entrada({ conversas: serie([null, null, null]) }))[0];
  assert.equal(semDias.valor, null);
  assert.equal(semDias.motivo, MOTIVO_SEM_VOLUME);
}

// ---------------------------------------------------------------- apoio: eixo e dia comum
{
  const datas = eixo(5);
  assert.equal(valoresNoEixo(datas, null), null);
  assert.deepEqual(valoresNoEixo(datas, [{ dia: datas[1], valor: 7 }, { dia: datas[3], valor: null }]), [null, 7, null, null, null], "dia sem linha ou sem valor é buraco, nunca zero");
  assert.equal(diaComum(alcanceDe(5)), null, "menos de 7 dias medidos: não há dia comum");
  assert.ok(diaComum(alcanceDe(30))! > 800 && diaComum(alcanceDe(30))! < 1200);
  assert.equal(diaComum(null), null);
}

// ---------------------------------------------------------------- o dia cruzado
{
  const e = entrada();
  const faixa = faixaDasConversas(e.conversas);
  const marcas = foraDaFaixa(e.conversas.valores, faixa);
  assert.equal(marcas[11], "acima");
  assert.equal(marcas[19], "abaixo");

  // O pico: o Instagram bombou (alcance acima do dobro do dia comum da clínica).
  const pico = diaCruzado(11, e);
  assert.ok(pico);
  assert.equal(pico.marca, "acima");
  assert.equal(pico.notaDaMarca, "▲ acima do normal");
  assert.equal(pico.conversas, 52);
  assert.equal(pico.leads, 4 + (11 % 3));
  assert.equal(pico.titulo, nomeDoDia(dataDoDia(11)));
  assert.equal(pico.alcance.valor, 5000);
  assert.match(sp(pico.alcance.comparacao ?? ""), /^▲ \d+% vs dia comum$/);
  assert.equal(pico.alcance.faltaDado, null);
  assert.equal(pico.causa, "Provável causa: o Instagram bombou nesse dia.");
  assert.equal(pico.causaVinda, "instagram");

  // O dia quase parado: o anúncio quase parou (abaixo de um terço do dia comum). O alcance desse dia é comum.
  const parado = diaCruzado(19, e);
  assert.ok(parado);
  assert.equal(parado.marca, "abaixo");
  assert.equal(parado.notaDaMarca, "▼ abaixo do normal");
  assert.equal(parado.anuncio.valor, 2);
  assert.match(sp(parado.anuncio.comparacao ?? ""), /^▼ \d+% vs dia comum$/);
  assert.equal(parado.causa, "Provável causa: o anúncio quase parou nesse dia.");
  assert.equal(parado.causaVinda, "anuncio");

  // Dia comum.
  const comum = diaCruzado(3, e);
  assert.ok(comum);
  assert.equal(comum.marca, "normal");
  assert.equal(comum.notaDaMarca, "dentro do normal");
  assert.equal(comum.causa, "Dia comum.");
  assert.equal(comum.causaVinda, null);

  // Fora do normal sem nenhuma das duas causas: "Sem causa clara nos outros dados."
  const semCausa = diaCruzado(11, entrada({ alcance: alcanceDe(30, -1), anuncios: anuncioDe(30).map((d, i) => (i === 19 ? { ...d, valor: 13 } : d)) }));
  assert.ok(semCausa);
  assert.equal(semCausa.marca, "acima");
  assert.equal(semCausa.causa, "Sem causa clara nos outros dados.");
  assert.equal(semCausa.causaVinda, null);

  // Toda frase do dia cruzado passa no filtro de linguagem da fase.
  for (const i of [3, 11, 19]) {
    const d = diaCruzado(i, e);
    assert.ok(d);
    assert.deepEqual(checarFraseCinco(d.causa), [], d.causa);
    for (const t of [d.notaDaMarca, d.alcance.comparacao, d.anuncio.comparacao]) if (t) assert.deepEqual(checarFraseCinco(t), [], t);
  }
  assert.deepEqual(checarFraseCinco(semCausa.causa), []);

  // Fora do eixo: nada.
  assert.equal(diaCruzado(-1, e), null);
  assert.equal(diaCruzado(30, e), null);
}
{
  // Fonte sem dado: "Falta dado" na própria linha, e nunca vira causa nem zero.
  const semInstagram = diaCruzado(11, entrada({ alcance: null }));
  assert.ok(semInstagram);
  assert.equal(semInstagram.alcance.valor, null);
  assert.match(semInstagram.alcance.faltaDado ?? "", /^Falta dado/);
  assert.equal(semInstagram.alcance.comparacao, null);
  assert.notEqual(semInstagram.causaVinda, "instagram");
  assert.equal(semInstagram.causa, "Sem causa clara nos outros dados.");

  const semAnuncio = diaCruzado(19, entrada({ anuncios: null }));
  assert.ok(semAnuncio);
  assert.match(semAnuncio.anuncio.faltaDado ?? "", /^Falta dado/);
  assert.notEqual(semAnuncio.causaVinda, "anuncio");

  // A fonte respondeu mas não tem aquele dia: "Falta dado" e nenhuma causa.
  const buraco = diaCruzado(11, entrada({ alcance: alcanceDe(30).filter((d) => d.dia !== dataDoDia(11)) }));
  assert.ok(buraco);
  assert.equal(buraco.alcance.faltaDado, "Falta dado");
  assert.equal(buraco.alcance.valor, null);
  assert.equal(buraco.causaVinda, null);

  // Poucos dias de Instagram: sem dia comum, então nenhuma comparação nem causa (o valor continua à mostra).
  const poucos = diaCruzado(3, entrada({ alcance: alcanceDe(5, 3) }));
  assert.ok(poucos);
  assert.equal(poucos.alcance.valor, 5000);
  assert.equal(poucos.alcance.comparacao, null);
  assert.equal(poucos.causaVinda, null);

  // Sem faixa do normal (poucos dias): a marca fica nula e a frase diz "Falta dado".
  const curta = diaCruzado(2, entrada({ conversas: serie([10, 12, 11, 13, 12]), alcance: null, anuncios: null, diario: null }));
  assert.ok(curta);
  assert.equal(curta.marca, null);
  assert.equal(curta.notaDaMarca, null);
  assert.equal(curta.causa, "Falta dado: poucos dias para saber o normal.");
  assert.equal(curta.leads, null);
  assert.deepEqual(checarFraseCinco(curta.causa), []);
}

// ---------------------------------------------------------------- dia inicial do cruzamento
{
  // Entre os dias fora do normal, o de maior alcance no Instagram: o pico do dia 11.
  assert.equal(diaInicialDoCruzamento(entrada()), 11);
  assert.equal(diaInicialDoCruzamento(entrada({ alcance: null })), null);
  assert.equal(diaInicialDoCruzamento(entrada({ conversas: serie([10, 12, 11, 13, 12]) })), null);
}


// ---------------------------------------------------------------- padrão da semana
const diaDaSemana = (i: number) => new Date(`${dataDoDia(i)}T12:00:00Z`).getUTCDay();
{
  // Quarta e quinta cheias (30), os outros dias 12 e o domingo 6: 30 dias, então cada dia da semana tem 4 ou 5 dias medidos.
  const porSemana: Record<number, number> = { 0: 6, 1: 12, 2: 12, 3: 30, 4: 30, 5: 12, 6: 12 };
  const valores = Array.from({ length: 30 }, (_, i) => porSemana[diaDaSemana(i)]);
  const semana = padraoDaSemana(serie(valores));
  assert.deepEqual(semana.map((s) => s.nome), ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]);
  assert.deepEqual(semana.map((s) => s.media), [12, 12, 30, 30, 12, 12, 6]);
  assert.ok(semana.every((s) => s.dias >= 4));
  // Um dia da semana com um dia medido só não tem média (nunca zero); buraco não conta.
  const curta = padraoDaSemana(serie([5, 6, null, 7, 8, 9, 10, 11]));
  assert.ok(curta.some((s) => s.media == null));
  assert.equal(curta.reduce((t, s) => t + s.dias, 0), 7);
}

// ---------------------------------------------------------------- descobertas
/** Uma entrada que tem as 4 descobertas: dias cheios na semana (quarta e quinta), pico do Instagram, anúncio parado por 4 dias e a taxa em queda. */
function entradaCompleta(resto: Partial<EntradaCincoAtendimento> = {}): EntradaCincoAtendimento {
  const porSemana: Record<number, number> = { 0: 6, 1: 12, 2: 12, 3: 30, 4: 30, 5: 12, 6: 12 };
  const valores = Array.from({ length: 30 }, (_, i) => (i === 13 ? 90 : porSemana[diaDaSemana(i)]));
  const parado: Record<number, number> = { 18: 1, 19: 0, 20: 2, 21: 1 };
  return entrada({
    conversas: serie(valores),
    // O pico de conversas (dia 13, uma quarta) é o mesmo do pico de alcance do Instagram.
    alcance: alcanceDe(30, 13),
    anuncios: Array.from({ length: 30 }, (_, i) => ({ dia: dataDoDia(i), valor: parado[i] ?? 12 + (i % 3) })),
    ...resto,
  });
}
{
  const { itens, aviso } = descobertasDoAtendimento(entradaCompleta());
  assert.equal(aviso, null, "com 3 ou mais descobertas não há aviso");
  assert.deepEqual(itens.map((d) => d.id).sort(), ["atendimento-anuncio-parou", "atendimento-padrao-da-semana", "atendimento-pico-do-instagram", "atendimento-viram-lead"]);
  assert.ok(itens.length >= 3 && itens.length <= 5);
  // O que piorou vem primeiro.
  assert.equal(itens[0].tom, "ruim");
  assert.equal(itens[1].tom, "ruim");
  assert.notEqual(itens[2].tom, "ruim");
  for (const d of itens) {
    assert.deepEqual(checarDescoberta(d), [], d.frase);
    assert.ok(d.porque.barras.length >= 2 && d.porque.barras.length <= 3, `${d.id}: de 2 a 3 fatores`);
    assert.ok(d.frase.length <= 90, d.frase);
    assert.ok(d.quem && d.quem.length > 0);
    assert.ok(d.acao.rota != null || d.acao.local != null, "toda descoberta tem UMA ação");
    assert.ok(!(d.acao.rota != null && d.acao.local != null), "a ação é só uma");
    assert.ok(!/EXEMPLO|primeira resposta|esperando resposta/i.test(`${d.frase} ${d.porque.titulo} ${d.porque.obs ?? ""}`), "dado que não é medido não vira descoberta (D-05)");
  }
  const por = (id: string) => itens.find((d) => d.id === id)!;

  const semana = por("atendimento-padrao-da-semana");
  assert.match(sp(semana.frase), /^Quarta e quinta recebem [\d,]+(×| vezes) mais conversas que domingo\.$/);
  assert.equal(semana.acao.local, "ver-por-equipe");
  assert.equal(semana.quem, "Atendimento/secretária");
  assert.equal(semana.porque.barras[0].rotulo, "Quarta");
  assert.equal(semana.porque.barras[2].rotulo, "Domingo");

  const pico = por("atendimento-pico-do-instagram");
  assert.match(sp(pico.frase), /^O pico veio do Instagram: \d{2}\/\d{2} teve .+ de alcance e 90 conversas\.$/);
  assert.equal(pico.acao.rota, "/_authenticated/$clientId/conteudo");
  assert.equal(pico.acao.rotulo, "Ver Instagram");
  assert.equal(pico.quem, "Social media");
  assert.equal(pico.tom, "bom");

  const parou = por("atendimento-anuncio-parou");
  assert.match(sp(parou.frase), /^De \d{2}\/\d{2} a \d{2}\/\d{2} o anúncio quase parou: só 4 conversas pagas em 4 dias\.$/);
  assert.equal(parou.acao.rota, "/_authenticated/$clientId/anuncios");
  assert.equal(parou.quem, "Gestor de tráfego");
  assert.equal(parou.tom, "ruim");
  assert.equal(parou.porque.barras.length, 3);

  const lead = por("atendimento-viram-lead");
  assert.equal(sp(lead.frase), "De cada 100 conversas, 30 viram lead. Antes eram 40.");
  assert.equal(lead.tom, "ruim");
  assert.equal(lead.selo, "Em queda");
  // A equipe abre as conversas; o médico vai ao funil (T-03.1.1.1-21).
  assert.deepEqual(lead.acao, { rotulo: "Ver conversas", local: "ver-conversas" });
  const doMedico = descobertasDoAtendimento(entradaCompleta({ equipe: false })).itens.find((d) => d.id === "atendimento-viram-lead")!;
  assert.deepEqual(doMedico.acao, { rotulo: "Ver o funil", rota: "/_authenticated/$clientId/pacientes" });
}
{
  // Sem Instagram e sem anúncio: só o que a clínica mede, e o aviso diz por quê (nunca inventa).
  const { itens, aviso } = descobertasDoAtendimento(entradaCompleta({ alcance: null, anuncios: null }));
  assert.deepEqual(itens.map((d) => d.id).sort(), ["atendimento-padrao-da-semana", "atendimento-viram-lead"]);
  assert.match(aviso ?? "", /^Poucas descobertas neste período: .+\.$/);
  assert.deepEqual(checarFraseCinco(aviso ?? ""), []);
}
{
  // Poucos dias de Instagram e de anúncio: sem dia comum, sem descoberta. Sem o período anterior: a taxa não vira descoberta.
  const { itens, aviso } = descobertasDoAtendimento(entradaCompleta({ alcance: alcanceDe(5), anuncios: anuncioDe(5), somas: { atual: { mandaram_mensagem: 500, leads_novos: 150 }, antes: null } }));
  assert.deepEqual(itens.map((d) => d.id), ["atendimento-padrao-da-semana"]);
  assert.match(aviso ?? "", /^Poucas descobertas neste período: /);
}
{
  // Uma série comum, sem dia da semana mais cheio (razão abaixo de 1,5) e sem taxa em mudança: nada inventado.
  const e = entrada({ conversas: serie(Array.from({ length: 30 }, (_, i) => PADRAO[i % 7])), somas: { atual: { mandaram_mensagem: 500, leads_novos: 150 }, antes: { mandaram_mensagem: 500, leads_novos: 151 } }, alcance: alcanceDe(30, -1), anuncios: anuncioDe(30).map((d) => ({ ...d, valor: 13 })) });
  const { itens, aviso } = descobertasDoAtendimento(e);
  assert.deepEqual(itens, []);
  assert.match(aviso ?? "", /^Poucas descobertas neste período: /);
}
{
  // Dois dias seguidos de anúncio parado já valem; um dia isolado não é um trecho (o dia cruzado já o explica).
  const comRun = (idx: number[]) => anuncioDe(30).map((d, i) => ({ ...d, valor: idx.includes(i) ? 1 : 13 }));
  const dois = descobertasDoAtendimento(entradaCompleta({ anuncios: comRun([5, 6]) })).itens.find((d) => d.id === "atendimento-anuncio-parou");
  assert.ok(dois);
  assert.match(sp(dois.frase), /só 2 conversas pagas em 2 dias\.$/);
  const solto = descobertasDoAtendimento(entradaCompleta({ anuncios: comRun([5, 8]) })).itens.find((d) => d.id === "atendimento-anuncio-parou");
  assert.equal(solto, undefined);
  // Dia comum baixo demais (menos de 3 conversas): um terço dele não distingue nada.
  const baixo = descobertasDoAtendimento(entradaCompleta({ anuncios: anuncioDe(30).map((d) => ({ ...d, valor: 2 })) })).itens.find((d) => d.id === "atendimento-anuncio-parou");
  assert.equal(baixo, undefined);
}

console.log("test-cinco-atendimento: ok");
