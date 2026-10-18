import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { runMedia, probe } from "../workers/creative/media";
const dir = await mkdtemp(join(tmpdir(), "nexo-motion-check-"));
try {
  const basePath = join(dir, "base.mp4"),
    output = join(dir, "final.mp4");
  await runMedia(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=360x640:rate=30",
      "-t",
      "1.5",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-y",
      basePath,
    ],
    AbortSignal.timeout(30000),
  );
  const manifest = join(dir, "input.json");
  await writeFile(
    manifest,
    JSON.stringify({
      basePath,
      output,
      duration: 1.5,
      aspect: "9:16",
      subtitles: true,
      subtitleSize: 56,
      accent: "#D4B464",
      captionPosition: "lower",
      gentleZoom: true,
      cuts: [{ start: 0, end: 1.5 }],
      words: [
        { text: "Texto", start: 0.1, end: 0.5 },
        { text: "legível.", start: 0.5, end: 1.2 },
      ],
    }),
  );
  await promisify(execFile)(
    process.execPath,
    [
      "--import",
      import.meta.resolve("tsx"),
      resolve("workers/creative/motion/render.ts"),
      manifest,
    ],
    {
      timeout: 180000,
      env: {
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        REMOTION_BROWSER_EXECUTABLE:
          process.env.REMOTION_BROWSER_EXECUTABLE || chromium.executablePath(),
      },
    },
  );
  const info = await probe(output, AbortSignal.timeout(15000));
  assert(Math.abs(info.duration - 1.5) < 0.12);
  assert.equal(info.width, 720);
  assert.equal(info.height, 1280);
  assert((await stat(output)).size > 1000);
  await runMedia(
    "ffmpeg",
    ["-v", "error", "-i", output, "-f", "null", "-"],
    AbortSignal.timeout(30000),
  );
  console.log(
    "Remotion: MP4 real, duração, dimensões e decodificação integral verificados (mídia sintética, sem dados de clientes).",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
