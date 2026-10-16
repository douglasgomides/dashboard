import assert from "node:assert/strict";
import { FERRAMENTAS, FUNCOES, RITOS, funcao } from "../src/lib/sap-operacao";

// As funções do núcleo do 11.02 (com o Condutor separado do Fundador) + a clínica.
assert.deepEqual(FUNCOES.map((f) => f.id), ["fundador", "condutor", "coordenador", "cs", "trafego", "editor", "comercial", "clinica"]);
assert.equal(funcao("coordenador").horas, "25 a 35 h/semana");
assert.ok(FUNCOES.every((f) => f.faz.length > 0 && f.noApp.length > 0));
// Rotina semanal do 11.02: 8 ritos, de segunda a sexta.
assert.equal(RITOS.length, 8);
assert.ok(RITOS[0].quando.startsWith("Segunda") && RITOS[RITOS.length - 1].quando.startsWith("Sexta"));
// Cada ferramenta diz para que usar, para que não usar e quem.
assert.ok(FERRAMENTAS.every((f) => f.usarPara && f.naoUsarPara && f.quem));
assert.ok(FERRAMENTAS.some((f) => f.nome.startsWith("App")));
console.log("ok sap-operacao");
