// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03): o veredito, os 3 anéis contra o próprio período anterior,
// "Você agora contra você antes", os cartões de dinheiro e as descobertas. Módulo puro, só dados fictícios: nenhum número, nome
// ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-resultados.ts
import assert from "node:assert/strict";
import { checarDescoberta, checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import {
  aneisDeResultados,
  cartoesDeDinheiro,
  descobertasDeResultados,
  linhasAgoraContraAntes,
  medidasDoInstagram,
  retornoDaEntrada,
  vereditoDeResultados,
  type EntradaCincoResultados,
} from "../src/lib/leitura/cinco-resultados";

// O real brasileiro sai com espaço sem quebra (U+00A0): nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/\u00a0/g, " ");

const fatos = (ok = true): FatosDaTela => ({
  tela: "resultados",
  versaoRegras: 2,
  tipoPeriodo: "periodo",
  periodo: { de: "2026-10-01", ate: "2026-10-30", anterior: { de: "2026-09-01", ate: "2026-09-30" } },
  portao: ok
    ? { ok: true }
    : { ok: false, codigo: "sem_dado", motivo: "o Instagram não tem nenhum dia com dado neste período", passo: { verbo: "conferir", texto: "a conexão das fontes", quem: "equipe_hub" } },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});

const entrada = (parte: Partial<EntradaCincoResultados> = {}): EntradaCincoResultados => ({
  fatos: fatos(),
  dias: 30,
  valores: { mandaram_mensagem: 150, agendaram: 60, fecharam: 18 },
  atual: { mandaram_mensagem: 150, agendaram: 60, fecharam: 18 },
  antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 },
  diario: [],
  ads: null,
  seguidores: null,
  salvos: null,
  retorno: null,
  ...parte,
});

// ---------------------------------------------------------------- anéis
{
  const [conversas, agendaram, fecharam] = aneisDeResultados(entrada());
  assert.equal(conversas.rotulo, "Conversas");
  assert.equal(agendaram.rotulo, "Agendaram");
  assert.equal(fecharam.rotulo, "Fecharam");
  // 150 contra 100: o anel enche inteiro e dá uma volta a mais de 0,5.
  assert.equal(conversas.fracao, 1);
  assert.equal(conversas.volta, 0.5);
  assert.equal(conversas.selo, "Em alta");
  assert.equal(conversas.variacao?.texto, "▲ 50%");
  // 60 contra 80: três quartos, sem volta; 18 contra 36: metade, sem volta.
  assert.equal(agendaram.fracao, 0.75);
  assert.equal(agendaram.volta, 0);
  assert.equal(agendaram.selo, "Em queda");
  assert.equal(fecharam.fracao, 0.5);
  assert.equal(fecharam.volta, 0);
  assert.equal(fecharam.selo, "Em queda");
  assert.equal(fecharam.tom, "ruim");
  // O número do centro é o do cartão (a mesma conta que a tela já mostrava), não a soma dos dias.
  const dosCartoes = aneisDeResultados(entrada({ valores: { mandaram_mensagem: 140, agendaram: 55, fecharam: 17 } }));
  assert.deepEqual(dosCartoes.map((a) => a.valor), [140, 55, 17]);
}
{
  // Igual (menos de 3%): anel cheio, sem volta, selo "Igual".
  const [c] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 101, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.selo, "Igual");
  assert.equal(c.volta, 0.01);
  assert.equal(c.tom, "neutro");
}
{
  // Volta nunca passa de uma volta inteira.
  const [c] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 900, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.fracao, 1);
  assert.equal(c.volta, 1);
}
{
  // Antes abaixo da base mínima, ausente ou zero: sem comparação, "Falta dado", sem volta e nunca 0%.
  for (const antes of [{ mandaram_mensagem: 5 }, { mandaram_mensagem: null }, { mandaram_mensagem: 0 }]) {
    const [c] = aneisDeResultados(entrada({ antes: { ...entrada().antes, ...antes } }));
    assert.equal(c.variacao, null);
    assert.equal(c.selo, "Falta dado");
    assert.equal(c.tom, "neutro");
    assert.equal(c.fracao, 0);
    assert.equal(c.volta, 0);
  }
  // Sem número no cartão, o centro não inventa: valor null.
  const [c] = aneisDeResultados(entrada({ valores: { mandaram_mensagem: null, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.valor, null);
}
{
  // Passagem entre os anéis: do mesmo período e da mesma fonte; "N de M" quando a base é pequena; nada quando fora de ordem.
  const [, ag, fe] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 1000, agendaram: 50, fecharam: 25 } }));
  assert.equal(ag.passagemAteAqui, "5% seguem");
  assert.equal(fe.passagemAteAqui, "50% seguem");
  const pequena = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 20, agendaram: 10, fecharam: 4 } }));
  assert.equal(pequena[1].passagemAteAqui, "10 de 20 seguem", "abaixo da base do funil: N de M, sem %");
  assert.equal(pequena[2].passagemAteAqui, "4 de 10 seguem");
  const decimal = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 5000, agendaram: 36, fecharam: 18 } }));
  assert.equal(decimal[1].passagemAteAqui, "0,7% seguem");
  const foraDeOrdem = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 100, agendaram: 10, fecharam: 30 } }));
  assert.equal(foraDeOrdem[2].passagemAteAqui, null, "fechou mais do que agendou: não existe passagem");
  const semNumero = aneisDeResultados(entrada({ atual: { mandaram_mensagem: null, agendaram: 10, fecharam: 3 } }));
  assert.equal(semNumero[1].passagemAteAqui, null);
  assert.equal(aneisDeResultados(entrada())[0].passagemAteAqui, null, "o primeiro anel não tem passagem");
}

// ---------------------------------------------------------------- anel medido em parte dos dias (D-01)
{
  const semAtual = { mandaram_mensagem: 150, agendaram: 60, fecharam: null };
  const [, , fe] = aneisDeResultados(entrada({ atual: semAtual, cobertura: { fecharam: { medidos: 18, de: 30 } } }));
  assert.equal(fe.selo, "Medido em 18 de 30 dias", "parcial: diz quantos dias foram medidos, nunca 'Falta dado'");
  assert.equal(fe.tom, "atencao");
  assert.equal(fe.fracao, 0, "sem comparação desenhada");
  assert.equal(fe.volta, 0);
  const [, , semCob] = aneisDeResultados(entrada({ atual: semAtual }));
  assert.equal(semCob.selo, "Falta dado", "sem cobertura: a regra de sempre");
  const [, , nada] = aneisDeResultados(entrada({ atual: semAtual, cobertura: { fecharam: { medidos: 0, de: 30 } } }));
  assert.equal(nada.selo, "Falta dado", "nenhum dia medido: Falta dado");
  const [, , completo] = aneisDeResultados(entrada({ antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: null }, cobertura: { fecharam: { medidos: 30, de: 30 } } }));
  assert.equal(completo.selo, "Falta dado", "completo sem período anterior: Falta dado");
  const [conv] = aneisDeResultados(entrada({ cobertura: { mandaram_mensagem: { medidos: 18, de: 30 } } }));
  assert.equal(conv.selo, "Em alta", "com variação, o selo da variação manda");
}

// ---------------------------------------------------------------- veredito
{
  const v = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 162, agendaram: 60, fecharam: 18 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(v?.tipo, "veredito");
  if (v?.tipo === "veredito") {
    assert.equal(v.palavra, "Atenção");
    assert.equal(v.tom, "atencao");
    const frase = textoDaFrase(v.frase);
    assert.ok(frase.length <= 90, frase);
    assert.deepEqual(checarFraseCinco(frase), []);
    assert.equal(frase, "Chegaram 62% mais conversas, mas fecharam só 18 contra 36.");
    assert.deepEqual(v.frase.filter((p) => p.enfase).map((p) => p.texto), ["62% mais conversas", "só 18 contra 36"]);
  }
}
{
  const bom = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 150, agendaram: 90, fecharam: 40 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(bom?.tipo === "veredito" && bom.palavra, "Bom");
  if (bom?.tipo === "veredito") {
    assert.equal(textoDaFrase(bom.frase), "Chegaram 50% mais conversas e fecharam 40 contra 36.");
    assert.deepEqual(checarFraseCinco(textoDaFrase(bom.frase)), []);
  }
  const ruim = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 70, agendaram: 40, fecharam: 18 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(ruim?.tipo === "veredito" && ruim.palavra, "Ruim");
  if (ruim?.tipo === "veredito") assert.equal(textoDaFrase(ruim.frase), "Chegaram 30% menos conversas e fecharam só 18 contra 36.");
  const estavel = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 101, agendaram: 80, fecharam: 36 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(estavel?.tipo === "veredito" && estavel.palavra, "Estável");
  assert.equal(estavel?.tipo === "veredito" && estavel.tom, "neutro");
  const misto = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 70, agendaram: 90, fecharam: 40 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(misto?.tipo === "veredito" && misto.palavra, "Atenção");
  if (misto?.tipo === "veredito") assert.deepEqual(checarFraseCinco(textoDaFrase(misto.frase)), []);
}
{
  // Portão negado: o mesmo "Falta dado: motivo" e o passo da leitura, e nenhuma conclusão (D-05).
  const v = vereditoDeResultados(entrada({ fatos: fatos(false) }));
  assert.equal(v?.tipo, "sem_leitura");
  if (v?.tipo === "sem_leitura") {
    assert.match(v.motivo, /Instagram/);
    assert.ok(v.passo.frase.length > 0);
  }
  // Sem fatos ainda: nada a dizer.
  assert.equal(vereditoDeResultados(entrada({ fatos: null })), null);
  // Sem comparação de quem fechou (base do período anterior pequena): cai para o veredito dos fatos, nunca inventa número.
  const sem = vereditoDeResultados(entrada({ antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 4 } }));
  assert.notEqual(sem?.tipo === "veredito" ? textoDaFrase(sem.frase) : "", "Chegaram 50% mais conversas, mas fecharam só 18 contra 4.");
  if (sem?.tipo === "veredito") assert.deepEqual(checarFraseCinco(textoDaFrase(sem.frase)), []);
}
// ---------------------------------------------------------------- você agora contra você antes
{
  // Custo 9 agora contra 10 antes, com menos é melhor: "10% mais barato que antes", e a bolinha de agora fica à direita da de antes.
  const e = entrada({ ads: { atual: { gasto: 900, conversas: 100 }, anterior: { gasto: 1000, conversas: 100 }, porDia: [] } });
  const [, custo] = linhasAgoraContraAntes(e);
  assert.equal(custo.frase, "10% mais barato que antes");
  assert.equal(custo.melhor, true);
  assert.ok(custo.posicaoAgora! > custo.posicaoAntes!, "direita = melhor, invertido para custo");
  assert.equal(sp(custo.detalhe), "Custo por conversa · agora: R$ 9,00 · 30 dias antes: R$ 10,00 · ▲ melhorou");
  const caro = linhasAgoraContraAntes(entrada({ ads: { atual: { gasto: 1100, conversas: 100 }, anterior: { gasto: 1000, conversas: 100 }, porDia: [] } }))[1];
  assert.equal(caro.frase, "10% mais caro que antes");
  assert.equal(caro.melhor, false);
  assert.ok(caro.posicaoAgora! < caro.posicaoAntes!);
}
{
  const linhas = linhasAgoraContraAntes(entrada());
  // Conversas 150 contra 100: "50% a mais que antes", agora à direita.
  assert.equal(linhas[0].frase, "50% a mais que antes");
  assert.ok(linhas[0].posicaoAgora! > linhas[0].posicaoAntes!);
  // Igual dentro de 3%.
  const igual = linhasAgoraContraAntes(entrada({ atual: { mandaram_mensagem: 101, agendaram: 60, fecharam: 18 } }))[0];
  assert.equal(igual.frase, "Igual a antes");
  assert.equal(igual.melhor, null);
  assert.match(igual.detalhe, /= igual$/);
  // Uma linha sem um dos lados: falta dado com o motivo e nenhuma bolinha (nunca 0).
  for (const l of linhas.slice(1)) {
    assert.ok(l.faltaDado, `${l.id} sem dado nenhum`);
    assert.equal(l.posicaoAgora, null);
    assert.equal(l.posicaoAntes, null);
    assert.equal(l.frase, "Falta dado");
    assert.match(l.detalhe, /falta dado: /);
  }
  const semUmLado = linhasAgoraContraAntes(entrada({ ads: { atual: { gasto: 900, conversas: 100 }, anterior: { gasto: 1000, conversas: 0 }, porDia: [] } }))[1];
  assert.equal(semUmLado.faltaDado, "faltam o gasto e as conversas dos anúncios");
  assert.equal(semUmLado.posicaoAgora, null);
  // Conversas do período anterior abaixo da base: falta dado.
  assert.ok(linhasAgoraContraAntes(entrada({ antes: { mandaram_mensagem: 5 } }))[0].faltaDado);
  // Toda frase passa nas guardas (90 caracteres, sem jargão, sem comparar clínicas).
  const todas = linhasAgoraContraAntes(
    entrada({
      ads: { atual: { gasto: 900, conversas: 100 }, anterior: { gasto: 1000, conversas: 100 }, porDia: [] },
      seguidores: { atual: 80, antes: 50, rotuloAntes: "14 dias antes" },
      salvos: { atual: { salvos: 40, alcance: 10000 }, antes: { salvos: 94, alcance: 10000 }, rotuloAntes: "14 dias antes" },
    }),
  );
  for (const l of todas) assert.deepEqual(checarFraseCinco(l.frase), [], l.frase);
  assert.equal(todas[2].frase, "60% a mais que antes");
  assert.equal(todas[3].frase, "57% a menos que antes");
  assert.equal(todas[3].melhor, false);
  assert.match(todas[3].detalhe, /agora: 4,0 · 14 dias antes: 9,4 · ▼ piorou$/);
  // Salvos sem alcance: falta dado.
  assert.ok(linhasAgoraContraAntes(entrada({ salvos: { atual: { salvos: 4, alcance: 0 }, antes: { salvos: 9, alcance: 100 }, rotuloAntes: "x" } }))[3].faltaDado);
}
{
  // Salvos a cada mil e seguidores nas mesmas janelas: o período anterior tem o mesmo número de dias, terminando na véspera do início.
  const dia = (i: number) => new Date(Date.UTC(2026, 9, 31) - i * 86_400_000).toISOString().slice(0, 10); // 2026-10-31 menos i
  const linhas = Array.from({ length: 40 }, (_, i) => ({ date: dia(i), reach: 1000, saves: i < 14 ? 10 : 20, new_followers: i < 14 ? 6 : 3 }));
  // Hoje é 2026-11-02: o Instagram fecha 2 dias depois, então o período vai até 2026-10-31. Início 2026-10-18 = 14 dias.
  const m = medidasDoInstagram({ metricas: linhas, anterior: linhas, start: "2026-10-18", end: "2026-11-02", hoje: "2026-11-02" });
  assert.equal(m.seguidores?.atual, 14 * 6);
  assert.equal(m.seguidores?.antes, 14 * 3);
  assert.equal(m.seguidores?.rotuloAntes, "14 dias antes");
  assert.deepEqual(m.salvos?.atual, { salvos: 140, alcance: 14000 });
  assert.deepEqual(m.salvos?.antes, { salvos: 280, alcance: 14000 });
  // Dia sem dado de um lado: com menos de 80% dos dias, o lado vira null (nunca zero).
  const furado = linhas.map((l, i) => (i >= 14 && i < 24 ? { ...l, new_followers: null, reach: null } : l));
  const mf = medidasDoInstagram({ metricas: linhas, anterior: furado, start: "2026-10-18", end: "2026-11-02", hoje: "2026-11-02" });
  assert.equal(mf.seguidores?.atual, 14 * 6);
  assert.equal(mf.seguidores?.antes, null);
  assert.equal(mf.salvos?.antes, null);
  // Período curto demais (menos de 7 dias fechados): nada a comparar.
  assert.deepEqual(medidasDoInstagram({ metricas: linhas, anterior: linhas, start: "2026-10-28", end: "2026-11-02", hoje: "2026-11-02" }), { seguidores: null, salvos: null });
}

// ---------------------------------------------------------------- cartões de dinheiro
{
  const base = entrada({ ads: { atual: { gasto: 1000, conversas: 100 }, anterior: { gasto: 1100, conversas: 100 }, porDia: [{ dia: "2026-10-01", gasto: 30, conversas: 3 }, { dia: "2026-10-02", gasto: 40, conversas: 4 }] } });
  const [retorno, gasto, paciente] = cartoesDeDinheiro(base);
  // Sem o valor médio da consulta: Retorno sem medida, com o motivo, nunca 0.
  assert.equal(retorno.semMedida, true);
  assert.equal(retorno.valor, null);
  assert.equal(retorno.motivo, "os números comerciais ainda não chegaram");
  const semTicket = cartoesDeDinheiro({ ...base, retorno: { calculavel: false, retornoPorReal: null, motivo: "precisa do valor médio da consulta", equipeInformaValor: true } })[0];
  assert.equal(semTicket.semMedida, true);
  assert.equal(semTicket.motivo, "precisa do valor médio da consulta");
  assert.equal(semTicket.equipeInformaValor, true);
  const comRetorno = cartoesDeDinheiro({ ...base, retorno: { calculavel: true, retornoPorReal: 3.456, motivo: null, equipeInformaValor: false } })[0];
  assert.equal(comRetorno.semMedida, false);
  assert.equal(sp(comRetorno.valorTexto!), "R$ 3,46");
  assert.equal(comRetorno.equipeInformaValor, false);
  // Gasto: menos é melhor, com a palavra e a série diária.
  assert.equal(sp(gasto.valorTexto!), "R$ 1.000");
  assert.equal(gasto.textoDaVariacao, "▼ 9% · gastou menos que antes");
  assert.deepEqual(gasto.selo, { tom: "bom", texto: "Gastou menos" });
  assert.equal(gasto.serie?.datas.length, 2);
  // Anúncio por paciente fechado: gasto sobre fechados (18 agora, 36 antes), menos é melhor.
  assert.equal(paciente.valor, 1000 / 18);
  assert.equal(paciente.antes, 1100 / 36);
  assert.equal(paciente.textoDaVariacao, "▲ 82% · mais caro que antes");
  assert.deepEqual(paciente.selo, { tom: "ruim", texto: "Mais caro" });
  // Nenhum fechado ou fechados sem medida: sem número (nunca divide por zero nem vira 0).
  const zero = cartoesDeDinheiro({ ...base, atual: { ...base.atual, fecharam: 0 } })[2];
  assert.equal(zero.semMedida, true);
  assert.equal(zero.motivo, "ninguém fechou no período");
  const naoMedido = cartoesDeDinheiro({ ...base, atual: { ...base.atual, fecharam: null } })[2];
  assert.equal(naoMedido.motivo, "os fechados do período não foram medidos");
  // Sem anúncios: gasto sem medida, e o anúncio por paciente diz que falta o gasto.
  const semAds = cartoesDeDinheiro(entrada());
  assert.equal(semAds[1].semMedida, true);
  assert.equal(semAds[2].motivo, "falta o gasto em anúncios");
  // Valor medido sem o período anterior: selo de falta de comparação, sem variação.
  const semAntes = cartoesDeDinheiro({ ...base, ads: { atual: { gasto: 1000, conversas: 100 }, anterior: null, porDia: [] } })[1];
  assert.equal(semAntes.variacao, null);
  assert.equal(semAntes.selo?.texto, "Falta dado · sem período anterior");
}
{
  // O retorno resumido de montarRoi: o motivo é curto e só "valor" é coisa que a equipe informa.
  const item = (id: string, feito: boolean) => ({ id, bloqueia: true, feito }) as never;
  assert.deepEqual(retornoDaEntrada({ calculavel: true, retornoPorReal: 2, motivoFinal: null, itens: [] }), { calculavel: true, retornoPorReal: 2, motivo: null, equipeInformaValor: false });
  assert.deepEqual(retornoDaEntrada({ calculavel: false, retornoPorReal: null, motivoFinal: "item", itens: [item("crm", true), item("valor", false)] }), {
    calculavel: false,
    retornoPorReal: null,
    motivo: "precisa do valor médio da consulta",
    equipeInformaValor: true,
  });
  assert.equal(retornoDaEntrada({ calculavel: false, retornoPorReal: null, motivoFinal: "item", itens: [item("crm", false)] })?.motivo, "falta ligar o CRM");
  assert.equal(retornoDaEntrada({ calculavel: false, retornoPorReal: null, motivoFinal: "sem_investimento", itens: [] })?.motivo, "sem anúncio de aquisição no período");
  assert.equal(retornoDaEntrada({ calculavel: false, retornoPorReal: null, motivoFinal: "item", itens: [item("crm", false)] })?.equipeInformaValor, false);
  assert.equal(retornoDaEntrada(null), null);
}
// ---------------------------------------------------------------- descobertas
{
  const completa = entrada({
    // Conversas 150 contra 100 (sobe), agendaram 60 contra 80, fecharam 18 contra 36 (cai); anúncio: gasto 900 contra 1000 com 100 conversas.
    atual: { mandaram_mensagem: 150, agendaram: 60, fecharam: 18 },
    antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 },
    diario: [
      { dia: "2026-10-03", mandaram_mensagem: 4 },
      { dia: "2026-10-09", mandaram_mensagem: 11 },
      { dia: "2026-10-10", mandaram_mensagem: null },
    ],
    ads: {
      atual: { gasto: 900, conversas: 150 },
      anterior: { gasto: 1000, conversas: 100 },
      porDia: [
        { dia: "2026-10-03", gasto: 30, conversas: 3 },
        { dia: "2026-10-09", gasto: 24, conversas: 4 },
        { dia: "2026-10-10", gasto: 20, conversas: 0 },
      ],
    },
  });
  const { itens, aviso } = descobertasDeResultados(completa, { equipe: false });
  assert.equal(aviso, null);
  assert.equal(itens.length, 4);
  // Em ordem de impacto: o que piorou primeiro (anúncio por paciente +80%, fechados -50%), depois o que melhorou (conversas +50%, custo -40%).
  assert.deepEqual(itens.map((d) => d.id), ["resultados-anuncio-por-paciente", "resultados-fecharam", "resultados-conversas", "resultados-custo-por-conversa"]);
  assert.deepEqual(itens.map((d) => d.tom), ["ruim", "ruim", "bom", "bom"]);
  for (const d of itens) {
    assert.deepEqual(checarDescoberta(d), [], d.id);
    assert.ok(!d.frase.includes("÷"), d.frase);
    assert.ok(!(d.porque.obs ?? "").includes("÷"), d.porque.obs);
    assert.equal(d.porque.barras.length >= 2 && d.porque.barras.length <= 3, true, d.id);
    assert.ok(d.acao.rota, "só navega");
    assert.deepEqual(checarFraseCinco(d.frase), []);
    assert.doesNotMatch(`${d.frase} ${d.porque.obs ?? ""}`, /outras cl[ií]nicas|m[ée]dia da carteira|ranking/i);
  }
  const [pac, fe, con, cus] = itens;
  assert.equal(fe.frase, "Fechados caíram de 36 para 18. A perda está depois da conversa.");
  assert.equal(fe.selo, "Em queda");
  assert.equal(fe.acao.rota, "/_authenticated/$clientId/pacientes");
  // Por quê: conversas que agendam (60/150 contra 80/100) e agendados que fecham (18/60 contra 36/80), de cada 100.
  assert.deepEqual(fe.porque.barras.map((b) => [b.rotulo, b.exibicao]), [["Conversas que agendam", "80 → 40"], ["Agendados que fecham", "45 → 30"]]);
  assert.equal(sp(pac.frase), "Cada paciente fechado custou R$ 50 em anúncio. Antes, R$ 28.");
  assert.deepEqual(pac.porque.barras.map((b) => b.rotulo), ["Gasto em anúncios", "Pacientes fechados"]);
  assert.equal(pac.acao.rota, "/_authenticated/$clientId/anuncios");
  assert.equal(pac.porque.obs, "Conta: gasto em anúncio dividido pelos fechados de todas as origens.");
  assert.equal(sp(cus.frase), "Conversa a R$ 6,00: 40% mais barata que nos 30 dias antes (R$ 10,00).");
  assert.deepEqual(cus.porque.barras.map((b) => b.rotulo), ["30 dias antes", "Agora", "Melhor dia (09/10)"]);
  assert.equal(con.frase, "150 conversas: 50% a mais que nos 30 dias antes (100).");
  assert.equal(con.porque.obs, "Dia mais forte da clínica: 09/10, com 11 conversas.");
  assert.equal(con.acao.rota, "/_authenticated/$clientId/pacientes");
  // Para a equipe, a ação de conversas leva a Atendimento.
  assert.equal(descobertasDeResultados(completa, { equipe: true }).itens.find((d) => d.id === "resultados-conversas")?.acao.rota, "/_authenticated/$clientId/atendimento");
}
{
  // Base pequena: a taxa que não tem base nos dois períodos vira barra listrada "Falta dado" (nunca zero).
  const pequena = entrada({ atual: { mandaram_mensagem: 20, agendaram: 10, fecharam: 4 }, antes: { mandaram_mensagem: 40, agendaram: 30, fecharam: 12 } });
  const fe = descobertasDeResultados(pequena, { equipe: false }).itens.find((d) => d.id === "resultados-fecharam")!;
  assert.ok(fe, "fechados caíram: continua descoberta");
  assert.equal(fe.porque.barras[0].faltou, true, "20 conversas está abaixo da base do funil");
  assert.equal(fe.porque.barras[0].exibicao, "Falta dado");
  assert.deepEqual(checarDescoberta(fe), []);
}
{
  // Poucas descobertas: mostra o que existe e o motivo, nunca inventa. Sem anúncios nem comparação de fechados, só sobra conversas.
  const pouco = entrada({ antes: { mandaram_mensagem: 100, agendaram: null, fecharam: null } });
  const r = descobertasDeResultados(pouco, { equipe: false });
  assert.deepEqual(r.itens.map((d) => d.id), ["resultados-conversas"]);
  assert.equal(r.aviso, "Poucas descobertas neste período: faltam os fechados do período anterior.");
  assert.ok(r.aviso!.length <= 90);
  // Tudo igual a antes: nada para dizer, com o motivo honesto.
  const igual = descobertasDeResultados(entrada({ atual: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }), { equipe: false });
  assert.deepEqual(igual.itens, []);
  assert.match(igual.aviso ?? "", /^Poucas descobertas neste período: /);
  // Portão negado: nenhuma descoberta e nenhum aviso (a tela diz "Falta dado: motivo").
  assert.deepEqual(descobertasDeResultados(entrada({ fatos: fatos(false) }), { equipe: false }), { itens: [], aviso: null });
  assert.deepEqual(descobertasDeResultados(entrada({ fatos: null }), { equipe: false }), { itens: [], aviso: null });
}
void checarDescoberta;

console.log("test-cinco-resultados: ok");
