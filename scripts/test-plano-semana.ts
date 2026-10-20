import assert from "node:assert/strict";
import { ordenar, resultadoConversas, semanaDe, taxaAprendida, valorEmJogo } from "../src/lib/plano-semana";

// Semana começa na segunda (Brasília): domingo 23h em SP ainda é a semana anterior.
assert.equal(semanaDe(new Date("2026-10-20T15:00:00Z")), "2026-10-19");
assert.equal(semanaDe(new Date("2026-10-19T02:00:00Z")), "2026-10-12"); // domingo 23h SP
assert.equal(semanaDe(new Date("2026-10-19T03:30:00Z")), "2026-10-19"); // segunda 00h30 SP

// Valor em jogo com e sem ticket.
const v = valorEmJogo(10, 0.3, 1000);
assert.equal(v.valor, 3000);
assert.ok(v.calculo.includes("padrão"));
assert.ok(valorEmJogo(10, 0.42, 1000).calculo.includes("aprendida"));
assert.equal(valorEmJogo(10, 0.3, null).valor, null);
assert.ok(valorEmJogo(10, 0.3, null).calculo.includes("Cadastre o ticket"));

// Ordem: valor primeiro, depois quantidade; no máximo 5.
const o = ordenar([{ valor_brl: null, n: 9 }, { valor_brl: 500, n: 1 }, { valor_brl: 2000, n: 2 }, { valor_brl: null, n: 3 }, { valor_brl: 10, n: 1 }, { valor_brl: 1, n: 1 }]);
assert.deepEqual(o.map((x) => x.valor_brl ?? `n${x.n}`), [2000, 500, 10, 1, "n9"]);

// Resultado e aprendizado.
const r = resultadoConversas(20, 12, 3, 1500);
assert.equal(r.resultado_brl, 4500);
assert.equal(r.feita, true);
assert.equal(resultadoConversas(5, 0, 0, null).feita, false);
assert.equal(taxaAprendida([{ n: 10, agendaram: 2 }], 0.15), 0.15); // menos de 20: padrão
assert.equal(taxaAprendida([{ n: 15, agendaram: 3 }, { n: 15, agendaram: 3 }], 0.15), 0.2);
console.log("plano-semana ok");

// O validador da API não pode descartar os campos do plano e o final do link personalizado.
import("../api/_lib/request-validation").then(({ manualRequestSchema }) => {
  const cid = "11111111-1111-4111-8111-111111111111";
  const link = manualRequestSchema.parse({ client_id: cid, alvo: "link_rastreado", acao: "renomear", id: cid, slug: "drajulia" });
  assert.equal((link as { slug?: string }).slug, "drajulia");
  const item = manualRequestSchema.parse({ client_id: cid, alvo: "plano_item", id: cid, estado: "feita", nota: "ok" });
  assert.equal((item as { estado?: string }).estado, "feita");
  assert.equal(manualRequestSchema.safeParse({ client_id: cid, alvo: "plano_item", id: cid }).success, false);
  assert.equal(manualRequestSchema.safeParse({ client_id: cid, alvo: "plano_semana" }).success, true);
  console.log("validação do plano ok");
});
