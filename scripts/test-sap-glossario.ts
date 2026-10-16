import assert from "node:assert/strict";
import { GLOSSARIO, explicacao, passosDoTour } from "../src/lib/sap-glossario";

assert.equal(new Set(GLOSSARIO.map((g) => g.termo.toLowerCase())).size, GLOSSARIO.length);
assert.ok(explicacao("d0")?.includes("começou"));
assert.equal(explicacao("inexistente"), null);
for (const admin of [true, false]) {
  const p = passosDoTour(admin);
  assert.equal(p.length, 4);
  assert.ok(p.every((x) => x.sub === "" || x.sub.startsWith("/")));
}
// Nenhuma explicação promete resultado (CFM): fala de processo e acompanhamento.
assert.ok(!GLOSSARIO.some((g) => /garantimos resultado|garante resultado|aumento garantido/i.test(g.explica)));
console.log("ok sap-glossario");
