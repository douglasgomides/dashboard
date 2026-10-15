import assert from "node:assert/strict";
import { CRONOGRAMA } from "../src/lib/sap-cronograma";
import { SESSOES, blocoNoTempo, duracaoPlanejada, linhasParaAcoes, prazosPos, sessaoDoItem } from "../src/lib/sap-sessoes";

const s1 = SESSOES[0];
assert.equal(s1.id, "S1");
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
