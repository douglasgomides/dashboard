import assert from "node:assert/strict";
import { acoesDoSinal, novoOrcamento, podeAplicar } from "../src/lib/anuncios-acoes";

assert.deepEqual(acoesDoSinal("perfil_escalar").map((a) => a.tipo), ["orcamento"]);
assert.equal(acoesDoSinal("escalar")[0].pct, 20);
assert.deepEqual(acoesDoSinal("seguidor_caro").map((a) => a.tipo), ["pausar", "orcamento"]);
assert.equal(acoesDoSinal("fadiga").length, 0, "criativo cansado se resolve trocando criativo, não com botão");

assert.equal(novoOrcamento(5000, 20), 6000);
assert.equal(novoOrcamento(5000, 50), 6000, "limite de 20% mesmo se pedirem mais");
assert.equal(novoOrcamento(5000, -20), 4000);
assert.equal(novoOrcamento(110, -20), 100, "mínimo de R$ 1,00/dia");

const agora = Date.parse("2026-10-18T12:00:00Z");
assert.equal(podeAplicar("c1", [{ campanha_id: "c1", estado: "aplicada", aplicado_em: "2026-10-18T02:00:00Z" }], agora).ok, false);
assert.equal(podeAplicar("c1", [{ campanha_id: "c1", estado: "aplicada", aplicado_em: "2026-10-17T10:00:00Z" }], agora).ok, true);
assert.equal(podeAplicar("c1", [{ campanha_id: "c1", estado: "desfeita", aplicado_em: "2026-10-18T11:00:00Z" }], agora).ok, true);
assert.equal(podeAplicar("c1", [{ campanha_id: "c2", estado: "aplicada", aplicado_em: "2026-10-18T11:00:00Z" }], agora).ok, true);
console.log("anuncios-acoes: ok");
