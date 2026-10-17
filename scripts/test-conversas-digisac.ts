import assert from "node:assert/strict";
import { direcaoDigisac, textoDigisac } from "../api/_lib/conversas-digisac";

assert.equal(direcaoDigisac({ isFromMe: true }), "saida");
assert.equal(direcaoDigisac({ isFromMe: false }), "entrada");
assert.equal(direcaoDigisac({ fromMe: "true" }), "saida");
assert.equal(direcaoDigisac({}), "sistema");

assert.equal(textoDigisac({ text: "Oi, qual o valor?" }), "Oi, qual o valor?");
assert.equal(textoDigisac({ text: "", caption: "foto do exame" }), "foto do exame");
assert.equal(textoDigisac({ data: { transcription: "áudio transcrito" } }), "áudio transcrito");
assert.equal(textoDigisac({ type: "image" }), null);

console.log("ok conversas-digisac");
