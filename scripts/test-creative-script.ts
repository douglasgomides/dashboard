import assert from "node:assert/strict";
import type { CreativeAnalysis } from "../src/lib/creative-intelligence/contracts";
import {
  reelScriptInstructions,
  reelScriptReference,
  speechInRange,
  spokenScript,
} from "../src/lib/creative-intelligence/reference-script";

const transcript = [
  { start: 0, end: 3, text: "  Você já fez essa pergunta?  " },
  { start: 3, end: 8, text: "A resposta precisa de contexto, não de um resumo." },
  { start: 8, end: 10, text: "Confira a orientação completa." },
];
const scenes = [
  { start: 0, end: 5, narration: "DESCRIÇÃO VISUAL, NÃO É A FALA" },
  { start: 5, end: 10, narration: "UM RESUMO NÃO SUBSTITUI A TRANSCRIÇÃO" },
] as CreativeAnalysis["result"]["scenes"];
const analysis = {
  transcript,
  result: { scenes } as CreativeAnalysis["result"],
};
assert.equal(
  spokenScript(transcript),
  "Você já fez essa pergunta? A resposta precisa de contexto, não de um resumo. Confira a orientação completa.",
);
const reference = reelScriptReference(analysis);
assert.equal(reference.available, true);
assert.deepEqual(reference.segments.map((s) => s.text), transcript.map((s) => s.text));
assert.deepEqual(reference.blocks.map((s) => s.transcript_indices), [[0, 1], [1, 2]]);
assert.equal(reference.segments.length, 3, "Um segmento que cruza blocos não duplica a fonte");
assert.deepEqual(speechInRange(transcript, 3, 8), [transcript[1]]);
assert.deepEqual(speechInRange(transcript, 5, 10), [transcript[1], transcript[2]]);
assert.deepEqual(speechInRange(transcript, 10, 12), []);
const prompt = reelScriptInstructions(analysis);
for (const segment of transcript) assert.ok(prompt.includes(segment.text));
assert.ok(!prompt.includes(scenes[0].narration));
assert.ok(!prompt.includes(scenes[1].narration));
const unavailable = { ...analysis, transcript: [] };
assert.equal(reelScriptReference(unavailable).available, false);
assert.equal(spokenScript([]), "");
assert.ok(reelScriptInstructions(unavailable).includes('"available":false'));
assert.ok(reelScriptInstructions(unavailable).includes("não a reconstrua"));
assert.deepEqual(transcript[0], { start: 0, end: 3, text: "  Você já fez essa pergunta?  " });
console.log("Roteiro original completo, vínculos temporais e ausência de fala verificados.");
