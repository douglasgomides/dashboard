import assert from "node:assert/strict";
import { ehEtapaBase, motivosPerdaClint, origemPorFunil } from "../api/_lib/clint-sync";

const padroes = ["Base (não abordado)"];
assert.equal(ehEtapaBase("Base (não abordado)", padroes), true);
assert.equal(ehEtapaBase("BASE (NAO ABORDADO)", padroes), true, "sem acento e maiúscula");
assert.equal(ehEtapaBase("Lead", padroes), false);
assert.equal(ehEtapaBase("Enviei a primeira mensagem", padroes), false, "abordado volta a contar");
assert.equal(ehEtapaBase("", padroes), false);
assert.equal(ehEtapaBase("Base (não abordado)", ["  "]), false, "padrão vazio não marca nada");
console.log("clint base ok");

// Motivos de perda (GET /v1/lost-status) e funil que é canal (config.origem_por_funil).
const motivos = motivosPerdaClint({ data: [{ id: "a", name: " Sem interesse " }, { id: "b", name: "" }, { name: "sem id" }] }, "conn");
assert.equal(motivos.length, 1);
assert.equal(motivos[0].nome, "Sem interesse");
assert.equal(motivos[0].crm_connection_id, "conn");
assert.deepEqual(motivosPerdaClint({ status: 404 }, "conn"), []);
const mapa = { "Social Seller": "Prospecção ativa (Social Seller)" };
assert.equal(origemPorFunil("Social Seller", mapa), "Prospecção ativa (Social Seller)");
assert.equal(origemPorFunil("Consultas", mapa), null, "funil fora do mapa não ganha origem");
assert.equal(origemPorFunil(null, mapa), null);
console.log("clint motivos e funil ok");
