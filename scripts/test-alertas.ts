import assert from "node:assert/strict";
import { chavesDoCorpo, corpo, decidir, type Alerta } from "./alertas/alertas";

const agora = new Date("2026-10-22T12:00:00Z");
const a: Alerta = { gravidade: "atencao", chave: "erro:x:crm", texto: "Clínica X · crm: sem subdomínio" };
const c: Alerta = { gravidade: "critico", chave: "coleta:instagram", texto: "Coleta de instagram sem sucesso há 30 horas" };

// Sem alerta e sem issue: nada. Sem alerta com issue aberta: fecha.
assert.deepEqual(decidir([], null, agora), { tipo: "nada" });
assert.equal(decidir([], { corpo: corpo([a], agora) }, agora).tipo, "fechar");

// Primeiro alerta abre a issue, com os críticos no título e as chaves guardadas no corpo.
const abre = decidir([a, c], null, agora);
assert.equal(abre.tipo, "abrir");
if (abre.tipo === "abrir") {
  assert.match(abre.titulo, /1 crítico\(s\), 2 no total/);
  assert.deepEqual(chavesDoCorpo(abre.corpo), ["coleta:instagram", "erro:x:crm"]);
  assert.ok(abre.corpo.indexOf("Crítico") < abre.corpo.indexOf("Atenção"), "críticos primeiro");
}

// Mesmos alertas: não comenta de novo (sem spam a cada hora).
assert.deepEqual(decidir([a], { corpo: corpo([a], agora) }, agora), { tipo: "nada" });
// Alerta novo: atualiza e comenta só o novo.
const nova = decidir([a, c], { corpo: corpo([a], agora) }, agora);
assert.equal(nova.tipo, "atualizar");
if (nova.tipo === "atualizar") { assert.match(nova.comentario ?? "", /Crítico:\*\* Coleta de instagram/); assert.ok(!(nova.comentario ?? "").includes("subdomínio")); }
// Um alerta resolvido e outro mantido: atualiza o corpo sem comentário.
const menos = decidir([a], { corpo: corpo([a, c], agora) }, agora);
assert.equal(menos.tipo, "atualizar");
if (menos.tipo === "atualizar") assert.equal(menos.comentario, null);
console.log("alertas ok");
