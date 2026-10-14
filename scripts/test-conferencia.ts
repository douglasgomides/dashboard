// npx tsx scripts/test-conferencia.ts
import assert from "node:assert/strict";
import { compararGasto } from "../api/_lib/conferencia";
import { estadoDaEtapa, filtrarAchados, ordenarAchados, resumirConferencia, type Achado } from "../src/lib/conferencia";

// Gasto: diferenças pequenas (arredondamento, dia fechando) não viram alerta.
assert.equal(compararGasto(0, 0), null);
assert.equal(compararGasto(1000, 1010), null); // 1%
assert.equal(compararGasto(100, 115), null); // 13%, mas só R$ 15
assert.equal(compararGasto(800, 1000)!.gravidade, "media"); // 20% a menos
assert.ok(compararGasto(800, 1000)!.dif < 0);
assert.equal(compararGasto(500, 1000)!.gravidade, "alta"); // 50%
assert.equal(compararGasto(0, 300)!.gravidade, "alta"); // painel sem nada
assert.equal(compararGasto(2000, 1000)!.gravidade, "alta"); // em dobro (conta repetida)

const a = (id: string, gravidade: Achado["gravidade"], cliente: string | null, etapa: Achado["etapa"]): Achado => ({ id, gravidade, cliente, etapa, tipo: "x", titulo: id, detalhe: "", acao: "" });
const achados = [a("1", "baixa", "B", "parados"), a("2", "alta", "A", "duplicidades"), a("3", "media", null, "contas_meta"), a("4", "alta", "B", "inconsistencias")];
assert.deepEqual(ordenarAchados(achados).map((x) => x.id), ["2", "4", "3", "1"]);
assert.equal(filtrarAchados(achados, { gravidade: "alta" }).length, 2);
assert.equal(filtrarAchados(achados, { etapa: "parados" })[0].id, "1");
assert.equal(filtrarAchados(achados, { cliente: "B", gravidade: "alta" })[0].id, "4");
assert.equal(filtrarAchados(achados, {}).length, 4);

const r = resumirConferencia({
  achados,
  verificados: [
    { etapa: "parados", tipo: "instagram", nome: "@a", cliente: "A", ok: true, nota: "" },
    { etapa: "parados", tipo: "instagram", nome: "@b", cliente: "B", ok: false, nota: "" },
  ],
  etapas: [{ etapa: "parados", status: "ok" }, { etapa: "contas_meta", status: "erro", erro: "timeout" }],
});
assert.deepEqual(r.porGravidade, { alta: 2, media: 1, baixa: 1 });
assert.equal(r.verificados, 2);
assert.equal(r.comProblema, 1);
assert.deepEqual(r.etapasComErro, ["contas_meta"]);

assert.equal(estadoDaEtapa("parados", [], "parados"), "rodando");
assert.equal(estadoDaEtapa("parados", [{ etapa: "parados", status: "ok" }], null), "ok");
assert.equal(estadoDaEtapa("duplicidades", [], null), "pendente");

console.log("test-conferencia: ok");
