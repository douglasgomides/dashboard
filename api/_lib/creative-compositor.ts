/** Real glyphs, measured before the paid call. AI never writes the publication copy. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { create, type Font } from "fontkit";
import { Resvg } from "@resvg/resvg-js";
import type { UnidadeArte } from "../../src/lib/creative-intelligence/arte.js";

let cachedFont: Font | undefined;
function font(): Font {
  return cachedFont ??= create(readFileSync(join(process.cwd(), "api/_assets/creative/NotoSans-Bold.ttf"))) as Font;
}
const WIDTH = 912, TOP = 220, HEIGHT = 790;
export interface SlideLayout { lines: string[]; size: number; leading: number; baseline: number }
export function layoutSlide(u: UnidadeArte): SlideLayout {
  const text = (u.copy || u.on_screen_text || "").trim().replace(/\\n/g, "\n").normalize("NFC");
  if (!text || text.length > 1600) throw new Error(`Revise o texto do slide ${u.position}: ele precisa ter de 1 a 1600 caracteres.`);
  const f = font();
  for (const char of text) if (!/\s/.test(char) && !f.hasGlyphForCodePoint(char.codePointAt(0)!)) {
    throw new Error(`O caractere “${char}” do slide ${u.position} ainda não tem suporte na arte. Substitua-o no texto antes de gerar.`);
  }
  for (let size = u.position === 1 ? 76 : 60; size >= 36; size -= 2) {
    const measure = (s: string) => f.layout(s).advanceWidth * size / f.unitsPerEm;
    const lines: string[] = [];
    let tooWide = false;
    for (const paragraph of text.split(/\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        if (measure(word) > WIDTH) { tooWide = true; break; }
        const candidate = line ? `${line} ${word}` : word;
        if (line && measure(candidate) > WIDTH) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    const leading = size * 1.4;
    const inkHeight = (f.ascent - f.descent) * size / f.unitsPerEm;
    const height = (lines.length - 1) * leading + inkHeight;
    if (!tooWide && height <= HEIGHT) return { lines, size, leading, baseline: TOP + (HEIGHT - height) / 2 + f.ascent * size / f.unitsPerEm };
  }
  throw new Error(`O texto do slide ${u.position} não cabe com boa leitura. Encurte o texto antes de gerar; nenhuma imagem foi solicitada.`);
}

function paths(text: string, x: number, y: number, size: number, color: string): string {
  const f = font(), run = f.layout(text), scale = size / f.unitsPerEm;
  let cursor = x;
  return run.glyphs.map((glyph, index) => {
    const p = run.positions[index];
    const path = `<path fill="${color}" transform="translate(${cursor + p.xOffset * scale} ${y - p.yOffset * scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}"/>`;
    cursor += p.xAdvance * scale;
    return path;
  }).join("");
}

/** Only a decorative band uses the generated pixels. All visible text is composed locally. */
export function composeSlide(u: UnidadeArte, total: number, background: Buffer, layout = layoutSlide(u)): Buffer {
  if (background.length > 32 * 1024 * 1024 || !background.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("A geração não devolveu um PNG válido. A arte não foi salva.");
  }
  const dark = u.position === 1 || u.position === total;
  const paper = dark ? "#102d40" : "#f6f4ef", ink = dark ? "#ffffff" : "#102d40", accent = dark ? "#86dbef" : "#167a96";
  const copy = layout.lines.map((line, i) => paths(line, 84, layout.baseline + i * layout.leading, layout.size, ink)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs><clipPath id="band"><rect x="0" y="1090" width="1080" height="260"/></clipPath></defs>
    <rect width="1080" height="1350" fill="${paper}"/>
    <path d="M84 128H792" stroke="${accent}" stroke-width="3"/>
    ${paths(`${String(u.position).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 844, 141, 25, ink)}
    ${copy}
    <image x="0" y="1090" width="1080" height="260" preserveAspectRatio="xMidYMid slice" clip-path="url(#band)" xlink:href="data:image/png;base64,${background.toString("base64")}"/>
    <rect x="0" y="1090" width="1080" height="260" fill="${paper}" opacity="0.18"/>
    <rect x="0" y="1084" width="1080" height="6" fill="${accent}"/>
  </svg>`;
  return new Resvg(svg, { font: { loadSystemFonts: false }, background: paper }).render().asPng();
}
