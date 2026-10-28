import assert from "node:assert/strict";
import { ehEtapaBase } from "../api/_lib/clint-sync";

const padroes = ["Base (não abordado)"];
assert.equal(ehEtapaBase("Base (não abordado)", padroes), true);
assert.equal(ehEtapaBase("BASE (NAO ABORDADO)", padroes), true, "sem acento e maiúscula");
assert.equal(ehEtapaBase("Lead", padroes), false);
assert.equal(ehEtapaBase("Enviei a primeira mensagem", padroes), false, "abordado volta a contar");
assert.equal(ehEtapaBase("", padroes), false);
assert.equal(ehEtapaBase("Base (não abordado)", ["  "]), false, "padrão vazio não marca nada");
console.log("clint base ok");
