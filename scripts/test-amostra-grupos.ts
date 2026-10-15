import assert from "node:assert/strict";
import { computeReachByTema, separarAmostra } from "../src/lib/report-metrics";

// 9 posts de "menopausa" e 2 de "sono": só menopausa entra na comparação; sono vai para "poucos dados".
const posts = [
  ...Array.from({ length: 9 }, (_, i) => ({ tema: "menopausa", reach: 1000 + i })),
  { tema: "sono", reach: 90000 },
  { tema: "sono", reach: 85000 },
];
const { conclusivos, poucos } = separarAmostra(computeReachByTema(posts));
assert.deepEqual(conclusivos.map((t) => t.tema), ["menopausa"]);
assert.deepEqual(poucos.map((t) => [t.tema, t.count]), [["sono", 2]]);
console.log("test-amostra-grupos: ok");
