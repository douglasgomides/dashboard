import assert from "node:assert/strict";
import { ITENS_ACESSO, prontoParaSessao1, resumoAcessos, type RegistroAcesso } from "../src/lib/sap-acessos";

assert.equal(ITENS_ACESSO.length, 29);
// Críticos do 02.05: A1–A6, A11, D1, D3.
assert.deepEqual(ITENS_ACESSO.filter((i) => i.prazo === "C").map((i) => i.id), ["A1", "A2", "A3", "A4", "A5", "A6", "A11", "D1", "D3"]);
const reg = (item: string, status: RegistroAcesso["status"] = "confirmado"): RegistroAcesso => ({ item, status, confirmado_em: "2026-10-15", confirmado_por: "Gestor de Tráfego", observacao: null, revogado_em: null });

let r = resumoAcessos([reg("A1"), reg("A5", "nao_se_aplica")], 8);
assert.deepEqual(r.criticos, { feitos: 2, total: 9 });
assert.ok(r.atrasados.some((i) => i.id === "A2"));
assert.ok(!r.atrasados.some((i) => i.id === "A7")); // complementar só vence no D14
assert.equal(r.aRevogar, 1);

const todos = ["A1", "A2", "A3", "A4", "A5", "A6", "A11", "D1", "D3"].map((i) => reg(i));
let p = prontoParaSessao1(todos, new Set([3, 4]));
assert.equal(p.pronto, false);
assert.deepEqual(p.falta, ["reunião de baseline"]);
p = prontoParaSessao1(todos, new Set([3, 4, 8]));
assert.equal(p.pronto, true);
console.log("ok sap-acessos");
