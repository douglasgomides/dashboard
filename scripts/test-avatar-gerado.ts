import assert from "node:assert/strict";
import { normalizarNome, hashFnv1a, tracosDoAvatar, type TracosAvatar } from "../src/lib/avatar-gerado";

// Semente: nome sem espaços nas pontas, em minúsculas e sem acento.
assert.equal(normalizarNome(" José da Silva "), "jose da silva");
assert.equal(normalizarNome("ÁRVORE"), "arvore");

// FNV-1a de 32 bits, valores de referência.
assert.equal(hashFnv1a(""), 2166136261);
assert.equal(hashFnv1a("a"), 3826002220);

// Mesmo nome normalizado, mesmo personagem.
assert.deepEqual(tracosDoAvatar("José"), tracosDoAvatar(" jose "));
assert.deepEqual(tracosDoAvatar("qa@example.test"), tracosDoAvatar("QA@example.test"));

function confereFaixas(t: TracosAvatar) {
  assert.ok(Number.isInteger(t.pele) && t.pele >= 0 && t.pele <= 4, `pele ${t.pele}`);
  assert.ok(Number.isInteger(t.corDoCabelo) && t.corDoCabelo >= 0 && t.corDoCabelo <= 5, `cabelo ${t.corDoCabelo}`);
  assert.ok(Number.isInteger(t.estiloDoCabelo) && t.estiloDoCabelo >= 0 && t.estiloDoCabelo <= 4, `estilo ${t.estiloDoCabelo}`);
  assert.ok(Number.isInteger(t.camisa) && t.camisa >= 0 && t.camisa <= 5, `camisa ${t.camisa}`);
  assert.equal(typeof t.oculos, "boolean");
}

const vinte = [
  "Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Hugo", "Isabela", "João",
  "Karina", "Lucas", "Marcelly", "Nina", "Otávio", "Paula", "Rafael", "Sofia", "Tiago", "Vitória",
];
const combinacoes = new Set<string>();
for (const nome of vinte) {
  const t = tracosDoAvatar(nome);
  confereFaixas(t);
  combinacoes.add(JSON.stringify(t));
}
assert.ok(combinacoes.size >= 10, `só ${combinacoes.size} combinações em 20 nomes`);

let comOculos = 0;
for (let i = 0; i < 1000; i++) {
  const t = tracosDoAvatar(`pessoa${i}@clinica.test`);
  confereFaixas(t);
  if (t.oculos) comOculos++;
}
assert.ok(comOculos >= 150 && comOculos <= 350, `óculos em ${comOculos} de 1000`);

console.log("test-avatar-gerado: ok");
