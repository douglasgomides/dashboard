// Linha de 30 dias dos cartões (sketch 002, variante A): pontos, caminho, média, dedo, texto do dia, comparação com a média e resumo.
// Números da Lana do sketch (13/10 a 11/11/2026): conversas por dia.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-linha-30-dias.ts
import assert from "node:assert/strict";
import {
  caminhoDaArea,
  caminhoDaLinha,
  comparacaoComAMedia,
  indiceMaisProximo,
  mediaDaSerie,
  pontosDaLinha,
  resumoDaSerie,
  serieContinua,
  temSerieParaDesenhar,
  textoDoDia,
  yDaMedia,
} from "../src/lib/linha-30-dias";

// ---------------------------------------------------------------- pontos: o maior valor a 92% da altura, x de 0 a 300
const p = pontosDaLinha([0, 50, 100], 300, 64);
assert.equal(p.length, 3);
assert.deepEqual([p[0]!.x, p[1]!.x, p[2]!.x], [0, 150, 300]);
assert.equal(p[2]!.y, 64 - 64 * 0.92, "o maior valor fica a 92% da altura");
assert.equal(p[0]!.y, 64, "zero fica na base");
assert.equal(p[1]!.y, 64 - 0.5 * 64 * 0.92);

// Dia sem dado (null) não vira ponto: o caminho quebra ali, nunca desce a zero.
const buraco = pontosDaLinha([10, null, 30, 40], 300, 64);
assert.equal(buraco[1], null);
assert.ok(buraco[0] && buraco[2] && buraco[3]);
const linha = caminhoDaLinha(buraco);
assert.equal((linha.match(/M/g) ?? []).length, 2, "dois trechos contínuos: um M novo depois do buraco");
assert.ok(!/NaN/.test(linha));
assert.match(linha, /^M0,/);
const area = caminhoDaArea(buraco, 64);
// O trecho de um ponto só (o dia 0) não vira área; o trecho 2..3 fecha na base.
assert.equal((area.match(/M/g) ?? []).length, 1);
assert.match(area, /L300,64 L200,64Z$/);
const semBuraco = caminhoDaArea(pontosDaLinha([1, 2, 3], 300, 64), 64);
assert.match(semBuraco, /^M0,[\d.]+ L150,[\d.]+ L300,[\d.]+ L300,64 L0,64Z$/);
assert.equal(caminhoDaLinha(pontosDaLinha([null, null], 300, 64)), "");

// Série só de zeros não divide por zero.
const zeros = pontosDaLinha([0, 0, 0], 300, 64);
assert.ok(zeros.every((q) => q && Number.isFinite(q.y) && q.y === 64));

// ---------------------------------------------------------------- média
assert.equal(mediaDaSerie([2, null, 4]), 3, "ignora null");
assert.equal(mediaDaSerie([null, null]), null, "sem nenhum valor devolve null");
assert.equal(mediaDaSerie([]), null);
assert.equal(mediaDaSerie([0, 0]), 0, "zero medido é média zero, não ausência");
assert.equal(yDaMedia([0, 100], 64), 64 - 0.5 * 64 * 0.92);
assert.equal(yDaMedia([null, null], 64), null);

// ---------------------------------------------------------------- dedo: o dia mais próximo
assert.equal(indiceMaisProximo(0.5, 30), 15);
assert.equal(indiceMaisProximo(-0.2, 30), 0, "preso no começo");
assert.equal(indiceMaisProximo(1.4, 30), 29, "preso no fim");
assert.equal(indiceMaisProximo(0, 30), 0);
assert.equal(indiceMaisProximo(1, 30), 29);
assert.equal(indiceMaisProximo(0.5, 1), 0, "um dia só");

// ---------------------------------------------------------------- texto do dia (lido em T12:00Z: o dia não troca por fuso)
const dia = textoDoDia("2026-10-14", 685);
assert.match(dia, /^[a-zà-ú]{3}\.?, 14\/10: 685$/, `dia da semana curto, dd/mm e o valor: ${dia}`);
assert.match(textoDoDia("2026-10-14", null), /: sem dado$/, "dia sem dado diz sem dado, nunca 0");
assert.match(textoDoDia("2026-10-14", 1234.5, (n) => `R$ ${n}`), /: R\$ 1234\.5$/, "usa o formatador da tela");
assert.match(textoDoDia("2026-10-14", 1234), /: 1\.234$/, "milhar em pt-BR");

// ---------------------------------------------------------------- comparação com a média
assert.deepEqual(comparacaoComAMedia(685, 194, 30), { sobe: true, texto: "▲ 253% vs média do mês" });
assert.deepEqual(comparacaoComAMedia(97, 194, 30), { sobe: false, texto: "▼ 50% vs média do mês" });
assert.equal(comparacaoComAMedia(10, 5, 7)?.texto, "▲ 100% vs média do período", "com 7 dias a média é do período");
assert.equal(comparacaoComAMedia(10, 5, 28)?.texto, "▲ 100% vs média do mês");
assert.equal(comparacaoComAMedia(10, 5, 31)?.texto, "▲ 100% vs média do mês");
assert.equal(comparacaoComAMedia(10, 0, 30), null, "média 0 não vira %");
assert.equal(comparacaoComAMedia(10, null, 30), null);
assert.equal(comparacaoComAMedia(null, 5, 30), null, "dia sem dado não compara");
assert.equal(comparacaoComAMedia(5, 5, 30)?.texto, "igual à média do mês");

// ---------------------------------------------------------------- resumo para leitor de tela
const datas = ["2026-10-13", "2026-10-14", "2026-10-15"];
assert.equal(
  resumoDaSerie({ rotulo: "Conversas", datas, valores: [167, 685, 549] }),
  "Conversas por dia, 13/10 a 15/10: média 467; maior 685 em 14/10; menor 167 em 13/10",
);
assert.equal(
  resumoDaSerie({ rotulo: "Conversas", datas, valores: [167, null, 549] }),
  "Conversas por dia, 13/10 a 15/10: média 358; maior 549 em 15/10; menor 167 em 13/10; 1 dia sem dado",
);
assert.match(resumoDaSerie({ rotulo: "Conversas", datas, valores: [null, 5, null] }), /; 2 dias sem dado$/);
assert.match(resumoDaSerie({ rotulo: "Investido", datas, valores: [1, 2, 3], formatar: (n) => `R$ ${n}` }), /média R\$ 2; maior R\$ 3 em 15\/10; menor R\$ 1 em 13\/10/);

// ---------------------------------------------------------------- menos de 2 dias com valor: não desenha
assert.equal(temSerieParaDesenhar([5]), false);
assert.equal(temSerieParaDesenhar([5, null, null]), false);
assert.equal(temSerieParaDesenhar([5, null, 6]), true);
assert.equal(temSerieParaDesenhar([]), false);

// ---------------------------------------------------------------- eixo contínuo: dia sem linha é buraco, nunca zero
assert.deepEqual(serieContinua([{ dia: "2026-10-15", valor: 3 }, { dia: "2026-10-13", valor: 1 }]), { datas: ["2026-10-13", "2026-10-14", "2026-10-15"], valores: [1, null, 3] });
assert.deepEqual(serieContinua([{ dia: "2026-10-13T00:00:00Z", valor: 0 }, { dia: "2026-10-14", valor: null }]), { datas: ["2026-10-13", "2026-10-14"], valores: [0, null] }, "zero medido continua zero");
assert.deepEqual(serieContinua([]), { datas: [], valores: [] });
assert.deepEqual(serieContinua([{ dia: "2026-10-31", valor: 1 }, { dia: "2026-11-02", valor: 2 }]).datas, ["2026-10-31", "2026-11-01", "2026-11-02"], "vira o mês sem pular dia");

console.log("test-linha-30-dias: ok");
