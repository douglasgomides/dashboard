// A faixa do normal da própria clínica (Phase 03.1.1.1, plano 06): mediana mais ou menos a distância entre os quartis, dia fora dela
// marcado "acima" ou "abaixo", e nenhuma faixa com poucos dias. Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-faixa-do-normal.ts
import assert from "node:assert/strict";
import { MIN_DIAS_DA_FAIXA, faixaDoNormal, foraDaFaixa, medianaDaSerie } from "../src/lib/faixa-do-normal";

assert.equal(MIN_DIAS_DA_FAIXA, 7);

// O exemplo do plano: o buraco (null) fica de fora; 8 dias medidos.
{
  const serie = [10, 12, 11, 13, 40, 2, 12, null, 11];
  const f = faixaDoNormal(serie);
  assert.ok(f, "8 dias medidos bastam");
  assert.equal(f.dias, 8);
  assert.equal(f.mediana, 11.5);
  // quartis por interpolação linear: Q1 = 10,75 e Q3 = 12,25, então a distância é 1,5.
  assert.equal(f.lo, 10);
  assert.equal(f.hi, 13);
  const marcas = foraDaFaixa(serie, f);
  assert.equal(marcas[4], "acima", "o dia 40 passa do limite de cima");
  assert.equal(marcas[5], "abaixo", "o dia 2 fica sob o limite de baixo");
  assert.equal(marcas[7], null, "o buraco continua buraco, nunca vira dia normal nem zero");
  assert.equal(marcas[0], "normal");
  assert.equal(marcas[1], "normal");
  assert.equal(marcas[3], "normal", "o limite de cima ainda é normal");
  assert.equal(marcas.length, serie.length);
}

// Menos de 7 dias medidos: sem faixa (a tela diz "Falta dado").
{
  assert.equal(faixaDoNormal([10, 12, 11, 13, 12, 11]), null);
  assert.equal(faixaDoNormal([10, 12, null, 11, 13, 12, 11, null]), null, "buracos não contam como dia medido");
  assert.ok(faixaDoNormal([10, 12, 11, 13, 12, 11, 10]));
  assert.equal(faixaDoNormal([]), null);
  assert.equal(faixaDoNormal([null, null, null]), null);
  // O mínimo é ajustável, mas nunca aceita uma série vazia.
  assert.ok(faixaDoNormal([5, 6, 7], { minDias: 3 }));
  assert.equal(faixaDoNormal([], { minDias: 0 }), null);
}

// Sem faixa, nenhum dia é marcado.
assert.deepEqual(foraDaFaixa([1, 2, null, 40], null), [null, null, null, null]);

// O limite de baixo nunca fica negativo, e zero medido é zero medido (não buraco).
{
  const f = faixaDoNormal([0, 0, 0, 0, 0, 1, 30, 40]);
  assert.ok(f);
  assert.ok(f.lo >= 0);
  const marcas = foraDaFaixa([0, 50], f);
  assert.equal(marcas[0], "normal", "zero conversas num dia comum de poucas conversas é normal");
  assert.equal(marcas[1], "acima");
}

// A faixa usa só os dias da série recebida (D-02): a mesma série em outra ordem dá a mesma faixa.
{
  const a = faixaDoNormal([3, 9, 5, 7, 5, 6, 8, 4]);
  const b = faixaDoNormal([8, 4, 5, 6, 3, 9, 7, 5]);
  assert.deepEqual(a, b);
}

// Série constante: faixa de um ponto só, e o dia igual é normal.
{
  const f = faixaDoNormal([10, 10, 10, 10, 10, 10, 10]);
  assert.ok(f);
  assert.deepEqual([f.lo, f.hi, f.mediana], [10, 10, 10]);
  assert.deepEqual(foraDaFaixa([10, 11, 9], f), ["normal", "acima", "abaixo"]);
}

// Mediana da série (o "dia comum" usado no dia cruzado): ignora buraco, null sem dia medido.
assert.equal(medianaDaSerie([1, 100, null, 3]), 3);
assert.equal(medianaDaSerie([4, 8]), 6);
assert.equal(medianaDaSerie([null, null]), null);
assert.equal(medianaDaSerie([]), null);

console.log("test-faixa-do-normal: ok");
