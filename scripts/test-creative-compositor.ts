import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { composeSlide, layoutSlide } from "../api/_lib/creative-compositor";

const unit = { position: 2, copy: "Informações precisas, linguagem apropriada e marketing ético. Atenção às ações médicas: não há atalhos para a credibilidade.", on_screen_text: "Resumo que não pode substituir o texto completo", image_brief: "Retrato inventado do autor", layout_brief: "", narrative_role: "" };
const layout = layoutSlide(unit);
assert.equal(layout.lines.join(" "), unit.copy, "full copy and every Portuguese accent survive line wrapping");
assert.ok(layout.size >= 36 && layout.lines.length > 1);
assert.ok(layout.baseline >= 220 && layout.baseline + layout.leading * (layout.lines.length - 1) < 1010);
const background = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#86dbef"/></svg>').render().asPng();
const image = composeSlide(unit, 10, background, layout);
assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
assert.equal(image.readUInt32BE(16), 1080);
assert.equal(image.readUInt32BE(20), 1350);
// Decode through the same rasterizer and verify opaque pixels + actual ink in the text panel.
const decoded = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><image width="1080" height="1350" href="data:image/png;base64,${image.toString("base64")}"/></svg>`).render();
const pixels = decoded.pixels;
let ink = 0;
for (let y = 250; y < 1000; y++) for (let x = 84; x < 996; x++) {
  const i = (y * 1080 + x) * 4;
  assert.equal(pixels[i + 3], 255);
  if (pixels[i] < 80 && pixels[i + 1] < 100) ink++;
}
assert.ok(ink > 10000, "real font outlines must render rather than silently disappear in production");
assert.throws(() => layoutSlide({ ...unit, copy: "palavra ".repeat(200).trim() }), /não cabe/);
assert.throws(() => layoutSlide({ ...unit, copy: "x".repeat(1601) }), /1600/);
assert.throws(() => layoutSlide({ ...unit, copy: "🦷" }), /não tem suporte/);
assert.throws(() => layoutSlide({ ...unit, copy: "", on_screen_text: "" }), /1 a 1600/);
assert.throws(() => composeSlide(unit, 10, Buffer.from("bad provider data")), /PNG válido/);
assert.equal(layoutSlide({ ...unit, copy: "Ação\\nInformações" }).lines.filter(Boolean).join(" "), "Ação Informações");
console.log("creative-compositor ok (glyphs, complete accented copy, readable bounds, PNG dimensions, opaque pixels, paid-call preflight)");
