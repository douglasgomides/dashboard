import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "../workers/creative/node_modules/@resvg/resvg-js/index.js";
import {
  newDocument,
  renderSlideSvg,
  type VideoDocument,
} from "../src/lib/creative-intelligence/production";
import { assertMagic, renderVideoFile } from "../workers/creative/production";
import { runMedia, probe } from "../workers/creative/media";
const dir = await mkdtemp(join(tmpdir(), "nexo-production-test-")),
  signal = AbortSignal.timeout(90000);
try {
  const d = newDocument("carrossel");
  if (d.format !== "carrossel") throw new Error();
  d.slides[0].copy = "Sua saúde merece informação clara.";
  const png = new Resvg(
    renderSlideSvg(d, 0, () => null),
    { font: { loadSystemFonts: true } },
  )
    .render()
    .asPng();
  assertMagic(png, "image/png");
  const image = join(dir, "slide.png");
  await writeFile(image, png);
  const imageInfo = await probe(image, signal);
  assert.equal(imageInfo.width, 1080);
  assert.equal(imageInfo.height, 1350);
  assert.throws(
    () => assertMagic(Buffer.from('<svg onload="x"/>'), "image/png"),
    /corresponde/,
  );
  assert.throws(
    () => assertMagic(Buffer.from("#EXTM3U\nhttp://127.0.0.1/x"), "video/mp4"),
    /corresponde/,
  );
  const source = join(dir, "source.mp4");
  await runMedia(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x193247:s=360x640:r=30:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=6",
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      source,
    ],
    signal,
  );
  const video: VideoDocument = {
    ...(newDocument("reels") as VideoDocument),
    source: {
      origin: "production",
      id: "11111111-1111-4111-8111-111111111111",
    },
    duration: 6,
    transcript: [
      { start: 0, end: 2, text: "Informação clara para sua saúde." },
      { start: 4, end: 6, text: "Converse com seu médico." },
    ],
    cuts: [
      { id: "a", start: 0, end: 2, label: "A", reason: "Abertura" },
      { id: "b", start: 4, end: 6, label: "B", reason: "Fechamento" },
    ],
  };
  const output = await renderVideoFile(source, video, dir, signal);
  assert(Math.abs(output.duration - 4) < 0.3);
  assert.deepEqual(output.dimensions, [720, 1280]);
  assert.equal(output.captions.length, 2);
  assert.equal(output.captions[1].start, 2);
  await assert.rejects(
    () =>
      renderVideoFile(
        source,
        { ...video, cuts: [{ ...video.cuts[0], start: 1 }] },
        dir,
        signal,
      ),
    /divide uma fala/,
  );
  await assert.rejects(
    () => renderVideoFile(source, { ...video, duration: 5 }, dir, signal),
    /não corresponde/,
  );
  console.log(
    "test-creative-production-media: PNG 1080×1350, assinatura de arquivo, MP4 720×1280 com áudio/legendas, duração e cortes passaram (sem API paga)",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
