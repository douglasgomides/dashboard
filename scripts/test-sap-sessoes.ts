import assert from "node:assert/strict";
import { CRONOGRAMA } from "../src/lib/sap-cronograma";
import { SESSOES, blocoNoTempo, duracaoPlanejada, linhasParaAcoes, prazosPos, sessaoDoItem } from "../src/lib/sap-sessoes";

const s1 = SESSOES.find((x) => x.id === "S1")!;
assert.equal(s1.id, "S1");
// Todas as reuniões: item do cronograma existe, ids únicos, chaves únicas, documentos citados existem, ações apontam para um campo.
assert.equal(new Set(SESSOES.map((x) => x.id)).size, SESSOES.length);
for (const s of SESSOES) {
  assert.ok(CRONOGRAMA.some((i) => i.n === s.cronoN), `${s.id}: item ${s.cronoN} do cronograma`);
  const min = duracaoPlanejada(s);
  assert.ok(min >= 15 && min <= 150, `${s.id}: duração ${min}`);
  const cods = new Set(s.docs.map((x) => x.codigo));
  for (const p of [...s.preparo, ...s.pos]) if (p.doc) assert.ok(cods.has(p.doc), `${s.id}: doc ${p.doc}`);
  const ch = [...s.preparo, ...s.pos].map((p) => p.chave).concat(s.blocos.flatMap((b) => (b.registrar ?? []).map((r) => r.chave)));
  assert.equal(new Set(ch).size, ch.length, `${s.id}: chaves repetidas`);
  assert.ok(!ch.some((c) => c === "inicio" || c === "fim" || c === "ia_rascunho"), `${s.id}: chave reservada`);
  if (s.acoesDe) assert.ok(ch.includes(s.acoesDe.chave), `${s.id}: acoesDe`);
  for (const d of s.docs) assert.ok(/^https:\/\/docs\.google\.com\//.test(d.url), `${s.id}: url ${d.codigo}`);
  assert.ok(s.preparo.every((p) => p.horas <= 0) && s.pos.every((p) => p.horas > 0), `${s.id}: horas`);
}
// Liga com o item certo do Cronograma Mestre.
assert.equal(CRONOGRAMA.find((i) => i.n === s1.cronoN)?.nome.startsWith("Sessão 1"), true);
assert.equal(sessaoDoItem(9)?.id, "S1");
// Roteiro cabe em 90 a 120 min (03.04).
const d = duracaoPlanejada(s1);
assert.ok(d >= 90 && d <= 120, `duração ${d}`);
// Todo documento citado no preparo/pós existe na lista de documentos.
const codigos = new Set(s1.docs.map((x) => x.codigo));
for (const p of [...s1.preparo, ...s1.pos]) if (p.doc) assert.ok(codigos.has(p.doc), p.doc);
// Chaves de registro únicas.
const chaves = s1.blocos.flatMap((b) => (b.registrar ?? []).map((r) => r.chave));
assert.equal(new Set(chaves).size, chaves.length);
assert.ok(chaves.includes(s1.acoesDe!.chave));

assert.deepEqual(blocoNoTempo(s1, 0), { n: 1, restante: 10, estouro: 0 });
assert.equal(blocoNoTempo(s1, 12).n, 2);
assert.equal(blocoNoTempo(s1, 85).n, 3);
assert.equal(blocoNoTempo(s1, d + 7).estouro, 7);

const pz = prazosPos(s1, "2026-10-20T15:00:00.000Z", "2026-10-21T16:00:00.000Z", new Set(["pos-congelar"]));
assert.equal(pz[0].feito, true);
assert.equal(pz[1].atrasado, true); // 4 h já passou
assert.equal(pz.find((p) => p.chave === "pos-enviar")?.atrasado, false); // 48 h ainda não

assert.deepEqual(linhasParaAcoes("- Responder em 5 min\n\n2. Confirmar na véspera\n• ok\n  Lista de espera  "), ["Responder em 5 min", "Confirmar na véspera", "Lista de espera"]);
console.log("ok sap-sessoes");
{
  const { trilha, lerRascunho, rascunhoEmTexto } = await import("../src/lib/sap-sessoes");
  const t = trilha(SESSOES, [{ n: 9, dataAlvo: "2026-10-10", dataIni: "2026-10-09", dataFim: "2026-10-11", status: "feito" }], "2026-10-12");
  assert.equal(t.passos.find((p) => p.s.id === "S1")?.estado, "feita");
  const r = lerRascunho(JSON.stringify({ resumo: "ok", decisoes: ["a", 3, ""], acoes_clinica: ["x"] }));
  assert.deepEqual(r?.decisoes, ["a"]);
  assert.ok(rascunhoEmTexto(r!, "S1").includes("- x"));
  assert.equal(lerRascunho("{quebrado"), null);
  console.log("ok sap-sessoes trilha/ia");
}
