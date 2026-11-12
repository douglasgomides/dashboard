// Fechamento do mês (Phase 03.1.1.1, plano 08): os cartões da história, só com a própria clínica contra o período anterior dela.
// Módulo puro, só dados fictícios: nenhum número, nome ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-fechamento-do-mes.ts
import assert from "node:assert/strict";
import { checarFraseCinco } from "../src/lib/leitura/cinco-segundos";
import { cartoesDoMes, periodoServeParaFechamento, type EntradaDoMes } from "../src/lib/fechamento-do-mes";

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
