import assert from "node:assert/strict";
import { captionContrast, readableCaptionAccent, hasEmbeddedCaptions } from "../src/lib/creative-intelligence/caption-style";
import {
  cutWords,
  captionPages,
  motionPlanSchema,
  type MotionPlan,
} from "../src/lib/creative-intelligence/video-motion";
import {
  newDocument,
  productionDocumentSchema,
  type VideoDocument,
} from "../src/lib/creative-intelligence/production";
const words = [
  { text: "Primeira", start: 0, end: 0.4 },
  { text: "frase.", start: 0.4, end: 1 },
  { text: "Excluir", start: 2, end: 2.5 },
  { text: "Última", start: 4, end: 4.5 },
  { text: "frase.", start: 4.5, end: 5 },
];
assert.deepEqual(
  cutWords(words, [
    { start: 0, end: 1 },
    { start: 4, end: 5 },
  ]),
  [
    ...words.slice(0, 2),
    { text: "Última", start: 1, end: 1.5 },
    { text: "frase.", start: 1.5, end: 2 },
  ],
);
assert(!cutWords(words, [{ start: 0.2, end: 0.9 }]).length);
assert.equal(captionPages(words).length, 3);
for (const page of captionPages(
  Array.from({ length: 12 }, (_, i) => ({
    text: "palavra",
    start: i * 0.3,
    end: (i + 1) * 0.3,
  })),
))
  assert(page.length <= 5 && page.map((w) => w.text).join(" ").length <= 30);
assert(captionContrast("#ffffff") > 15);
assert.equal(readableCaptionAccent("#101318"), "#F4D77C");
assert(captionContrast(readableCaptionAccent("#202020")) >= 4.5);
assert.equal(readableCaptionAccent("#FFD600"), "#FFD600");
assert.equal(readableCaptionAccent("invalid"), "#F4D77C");
assert.equal(hasEmbeddedCaptions({ motion: { source_has_captions: true } }), true);
assert.equal(hasEmbeddedCaptions({ sourceHasCaptions: true }), true);
assert.equal(hasEmbeddedCaptions({ sourceHasCaptions: false, motion: { source_has_captions: true } }), false);
assert.equal(hasEmbeddedCaptions({}), false);
const plan: MotionPlan = {
  version: 1,
  source_media_id: "11111111-1111-4111-8111-111111111111",
  reference_analysis_id: "22222222-2222-4222-8222-222222222222",
  reference_source_id: "33333333-3333-4333-8333-333333333333",
  reference_coverage: "sampled_frames",
  observations: ["Texto branco com destaque amarelo observado na referência"],
  limitations: ["Movimento entre frames não confirmado"],
  accent: "#D4B464",
  caption_position: "lower",
  gentle_zoom: false,
  source_has_captions: false,
  words,
  timing: "provider_words",
};
assert(motionPlanSchema.safeParse(plan).success);
assert(
  motionPlanSchema.safeParse({
    ...plan,
    reference_performance: {
      objective: "salvamento",
      relative_multiple: 6.1,
      baseline_count: 84,
      reach: 140668,
      saved: 5470,
      paid: "unknown",
      observed_at: "2026-10-18T16:09:28.403057+00:00",
      limitations: ["Comparação observacional"],
    },
  }).success,
);

assert(
  !motionPlanSchema.safeParse({ ...plan, accent: "red;url(https://x)" })
    .success,
);
assert(
  !motionPlanSchema.safeParse({ ...plan, reference_coverage: "complete_video" })
    .success,
);
const d: VideoDocument = {
  ...(newDocument("reels") as VideoDocument),
  source: { origin: "production", id: plan.source_media_id },
  duration: 5,
  cuts: [{ id: "all", start: 0, end: 5, label: "Inteiro", reason: "Teste" }],
  motionRequested: true,
  motion: plan,
};
assert(productionDocumentSchema.safeParse(d).success);
assert(productionDocumentSchema.safeParse({ ...d, sourceHasCaptions: true }).success);
assert.equal((newDocument("reels") as VideoDocument).subtitleSize, 48);
assert(
  !productionDocumentSchema.safeParse({
    ...d,
    source: { ...d.source, id: "44444444-4444-4444-8444-444444444444" },
  }).success,
);
assert(
  !productionDocumentSchema.safeParse({
    ...d,
    motion: { ...plan, words: [{ text: "Fim", start: 4, end: 6 }] },
  }).success,
);
console.log(
  "test-creative-motion: tempos por palavra, cortes, legibilidade, fonte e contrato visual passaram",
);
