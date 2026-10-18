import assert from "node:assert/strict";
import {
  newDocument,
  productionDocumentSchema,
  renderSlideSvg,
  timelineCaptions,
  toSrt,
  toAss,
  slideLayout,
  type VideoDocument,
} from "../src/lib/creative-intelligence/production";
const carousel = newDocument("carrossel");
if (carousel.format !== "carrossel") throw new Error();
carousel.slides[0].copy = 'Conteúdo <script>alert("x")</script> & ciência';
carousel.brand.signature = "Dra. Exemplo";
const svg = renderSlideSvg(carousel, 0, () => null);
assert(!svg.includes("<script>"));
assert(svg.includes("&lt;script&gt;"));
assert(svg.includes("&amp;"));
carousel.slides[0].image = {
  origin: "production",
  id: "11111111-1111-4111-8111-111111111111",
};
assert(
  !renderSlideSvg(carousel, 0, () => "javascript:alert(1)").includes(
    "javascript:",
  ),
);
carousel.slides[0].copy = "Médica e pacientes. ".repeat(100);
assert(slideLayout(carousel, 0).overflow);
assert.throws(() => renderSlideSvg(carousel, 0, () => null), /não cabe/);
assert(
  !productionDocumentSchema.safeParse({
    ...carousel,
    brand: { ...carousel.brand, ink: 'red" onload="alert(1)' },
  }).success,
);
assert(
  !productionDocumentSchema.safeParse({
    ...carousel,
    slides: [carousel.slides[0], carousel.slides[0]],
  }).success,
);
assert(
  !productionDocumentSchema.safeParse({ ...carousel, unexpected: "field" })
    .success,
);
const video: VideoDocument = {
  ...(newDocument("reels") as VideoDocument),
  source: { origin: "production", id: "11111111-1111-4111-8111-111111111111" },
  duration: 10,
  transcript: [
    { start: 0, end: 2, text: "Primeira fala." },
    { start: 3, end: 5, text: "Fala retirada." },
    { start: 7, end: 9, text: "Última fala." },
  ],
  cuts: [
    { id: "a", start: 0, end: 2, label: "A", reason: "Teste" },
    { id: "b", start: 7, end: 9, label: "B", reason: "Teste" },
  ],
};
assert(productionDocumentSchema.safeParse(video).success);
const captions = timelineCaptions(video);
assert.deepEqual(captions, [
  { start: 0, end: 2, text: "Primeira fala." },
  { start: 2, end: 4, text: "Última fala." },
]);
const srt = toSrt(captions);
assert(srt.includes("00:00:02,000 --> 00:00:04,000"));
assert(!srt.includes("Fala retirada"));
const ass = toAss(
  [{ start: 0, end: 1.2, text: "{\\an8}Fala \\N <b>real</b>" }],
  720,
  1280,
  36,
);
assert(ass.includes("PlayResX: 720\nPlayResY: 1280"));
assert(ass.includes("Default,Arial,36,"));
assert(ass.includes("0:00:00.00,0:00:01.20"));
assert(!ass.includes("{\\an8}"));
assert(!ass.includes("\\N"));
assert.equal(
  toSrt([
    {
      start: 0,
      end: 1,
      text: '{\\an8}<font color="red">Fala</font>\nreal --> aqui',
    },
  ]),
  "1\n00:00:00,000 --> 00:00:01,000\nFala real → aqui\n",
);
for (const cuts of [
  [{ ...video.cuts[0], end: 11 }],
  [video.cuts[1], video.cuts[0]],
  [video.cuts[0], { ...video.cuts[1], start: 1 }],
  [{ ...video.cuts[0], start: NaN }],
  [{ ...video.cuts[0], end: 0.1 }],
  [video.cuts[0], video.cuts[0]],
])
  assert(!productionDocumentSchema.safeParse({ ...video, cuts }).success);
assert(
  !productionDocumentSchema.safeParse({ ...video, duration: 181 }).success,
);
assert(!productionDocumentSchema.safeParse({ ...video, source: null }).success);
assert(
  !productionDocumentSchema.safeParse({ ...video, visualCoverage: "complete" })
    .success,
);
const fresh = newDocument("reels") as VideoDocument;
assert.equal(fresh.source, null);
assert.equal(fresh.cuts.length, 0);
assert.equal(fresh.visualCoverage, "not_analysed");
console.log(
  "test-creative-production: templates escapados, limites visuais, cortes, proveniência, duração e legendas passaram",
);
