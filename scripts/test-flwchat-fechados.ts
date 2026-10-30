import assert from "node:assert/strict";
import { cardsFechadosNaOrigem } from "../api/_lib/flwchat-sync";

// Aberto no Nexo que não veio na lista completa do painel foi fechado no FlwChat.
assert.deepEqual(cardsFechadosNaOrigem(["a", "b", "c"], new Set(["a", "c", "novo"])), ["b"]);
// Tudo na lista: nada fechado.
assert.deepEqual(cardsFechadosNaOrigem(["a"], new Set(["a"])), []);
// Lista com menos da metade dos abertos (resposta ruim da API): não fecha nada.
const abertos = Array.from({ length: 40 }, (_, i) => `c${i}`);
assert.equal(cardsFechadosNaOrigem(abertos, new Set(abertos.slice(0, 10))), null);
// Painel pequeno esvaziado de verdade (menos de 20 abertos): fecha.
assert.deepEqual(cardsFechadosNaOrigem(["x", "y"], new Set()), ["x", "y"]);
console.log("test-flwchat-fechados: ok");
