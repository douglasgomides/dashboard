import assert from "node:assert/strict";
import { rotuloRelacionamento } from "../src/lib/relacionamento";

const base = { pessoa_id: "p", ja_paciente: false, compras: 0, ultima_compra: null, conversou_antes: false, primeiro_contato: null };
assert.equal(rotuloRelacionamento(null), null, "sem dado não inventa rótulo");
assert.deepEqual(rotuloRelacionamento({ ...base, ja_paciente: true, compras: 3, ultima_compra: "2026-03-12" }), { tipo: "paciente", rotulo: "Já é paciente", detalhe: "3 compras · última compra em 12/03/2026" });
assert.equal(rotuloRelacionamento({ ...base, ja_paciente: true })!.detalhe, "consulta registrada no CRM", "compareceu sem venda ganha");
const antigo = rotuloRelacionamento({ ...base, conversou_antes: true, primeiro_contato: "2026-01-05" })!;
assert.equal(antigo.rotulo, "Já falou com a clínica");
assert.match(antigo.detalhe, /05\/01\/2026, sem compra/);
assert.equal(rotuloRelacionamento(base)!.tipo, "novo");
console.log("relacionamento ok");
