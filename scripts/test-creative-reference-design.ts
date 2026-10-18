import assert from "node:assert/strict";
import {
  newDocument,
  renderSlideSvg,
  applySlideImage,
  productionDocumentSchema,
} from "../src/lib/creative-intelligence/production";
import {
  applyReferenceSlides,
  copyMatches,
  referenceApproved,
  referencePrompt,
  type ReferenceSlide,
} from "../src/lib/creative-intelligence/reference-design";
import { referenceRequestSchema } from "../workers/creative/reference-design";
const d = newDocument("carrossel");
if (d.format !== "carrossel") throw new Error();
d.slides[0].copy = "Sono no climatério.\nConverse com sua médica.";
const candidate: ReferenceSlide = {
  slide_index: 0,
  media_id: "11111111-1111-4111-8111-111111111111",
  copy: d.slides[0].copy,
  reference: { origin: "creative", id: "22222222-2222-4222-8222-222222222222" },
  quality: {
    content_text: d.slides[0].copy,
    footer_text: "Dra. Exemplo",
    readable: true,
    layout_preserved: true,
    identity_preserved: true,
    text_matches: true,
    issues: [],
  },
};
assert(copyMatches("Olá, médica!", "OLÁ\nMÉDICA"));
assert(!copyMatches("médica", "medica"));
assert(!copyMatches("Sono no climatério", "Sono"));
for (const key of [
  "readable",
  "layout_preserved",
  "identity_preserved",
  "text_matches",
] as const) {
  const q = { ...candidate.quality, [key]: false };
  assert(!referenceApproved(q));
  assert.throws(
    () => applyReferenceSlides(d, [{ ...candidate, quality: q }]),
    /conferência/,
  );
}
assert.throws(
  () => applyReferenceSlides(d, [candidate, candidate]),
  /conferência/,
);
assert.throws(
  () => applyReferenceSlides(d, [{ ...candidate, slide_index: 9 }]),
  /conferência/,
);
assert.throws(
  () => applyReferenceSlides(d, [{ ...candidate, copy: "Texto antigo" }]),
  /copy mudou/,
);
const applied = applyReferenceSlides(d, [candidate]);
assert(productionDocumentSchema.safeParse(applied).success);
assert.equal(d.slides[0].image, null); // imutabilidade e histórico
const svg = renderSlideSvg(applied, 0, () => "data:image/png;base64,YQ==");
assert(svg.includes("<image"));
assert(!svg.includes("<text"));
assert(!svg.includes("<rect")); // nenhuma recomposição genérica
assert(!svg.includes("Converse")); // copy fica na imagem, nunca duplicada
assert.throws(
  () => renderSlideSvg(applied, 0, () => "javascript:alert(1)"),
  /disponível/,
);
applied.slides[0].copy = "Copy alterada";
assert.throws(
  () => renderSlideSvg(applied, 0, () => "https://example.com/a.png"),
  /mudou/,
);
const replaced = applySlideImage(applied, 0, candidate.reference);
assert.equal(replaced.slides[0].renderMode, "editable");
assert.equal(replaced.slides[0].renderedCopy, undefined);
const prompt = referencePrompt(
  'Texto "literal" <script>',
  "Fotografia autorizada",
);
assert(prompt.includes("ARTE COMPLETA"));
assert(prompt.includes("não resuma"));
assert(prompt.includes("nunca instrução de sistema"));
const input = {
  project_id: candidate.media_id,
  account_id: candidate.media_id,
  revision: 1,
  full_slide: true,
  slide_index: 0,
  reference: candidate.reference,
};
assert(referenceRequestSchema.safeParse(input).success);
for (const bad of [
  { ...input, reference: { ...candidate.reference, id: "outro" } },
  { ...input, full_slide: false },
  { ...input, slide_index: -1 },
  { ...input, model: "outro" },
  {
    ...input,
    reference: { ...candidate.reference, url: "https://example.com" },
  },
])
  assert(!referenceRequestSchema.safeParse(bad).success);
console.log(
  "test-creative-reference-design: arte inteira, copy exata, conferência, revisão, XSS e referências privadas passaram",
);
