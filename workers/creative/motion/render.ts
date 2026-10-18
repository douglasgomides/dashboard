import { readFile, stat, realpath, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  renderMedia,
  selectComposition,
  makeCancelSignal,
} from "@remotion/renderer";
import { captionPages } from "../../../src/lib/creative-intelligence/video-motion";
const schema = z
  .object({
    basePath: z.string(),
    output: z.string(),
    duration: z.number().positive().max(180),
    aspect: z.enum(["9:16", "1:1", "16:9"]),
    subtitles: z.boolean(),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    captionPosition: z.enum(["lower", "upper"]),
    gentleZoom: z.boolean(),
    cuts: z
      .array(
        z.object({
          start: z.number().nonnegative(),
          end: z.number().positive(),
        }),
      )
      .min(1)
      .max(120),
    words: z
      .array(
        z.object({
          text: z.string().max(200),
          start: z.number().nonnegative(),
          end: z.number().positive(),
        }),
      )
      .max(6000),
  })
  .strict();
const manifestPath = await realpath(process.argv[2]),
  input = schema.parse(JSON.parse(await readFile(manifestPath, "utf8"))),
  basePath = await realpath(input.basePath),
  dir = dirname(manifestPath);
if (
  dirname(basePath) !== dir ||
  (await realpath(dirname(input.output))) !== dir ||
  (await stat(basePath)).size > 200 * 1024 * 1024
)
  throw new Error("Arquivos fora do trabalho");
const size = (await stat(basePath)).size,
  token = "/" + randomUUID() + ".mp4";
const server = createServer((req, res) => {
  if (req.url !== token || !["GET", "HEAD"].includes(req.method || "")) {
    res.writeHead(404).end();
    return;
  }
  const range = req.headers.range,
    match = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range && !match) {
    res.writeHead(416).end();
    return;
  }
  const start = match ? Number(match[1]) : 0,
    end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
    return;
  }
  res.writeHead(match ? 206 : 200, {
    "Content-Type": "video/mp4",
    "Content-Length": end - start + 1,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(basePath, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Servidor local indisponível");
const { cancel, cancelSignal } = makeCancelSignal();
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
try {
  const empty = join(dir, "motion-public");
  await mkdir(empty, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: fileURLToPath(new URL("./index.tsx", import.meta.url)),
    publicDir: empty,
    outDir: join(dir, "motion-bundle"),
  });
  const dims =
    input.aspect === "9:16"
      ? [720, 1280]
      : input.aspect === "1:1"
        ? [720, 720]
        : [1280, 720];
  let offset = 0;
  const cutTimes = input.cuts.map((c) => {
    const t = offset;
    offset += c.end - c.start;
    return t;
  });
  const props = {
    videoUrl: `http://127.0.0.1:${address.port}${token}`,
    duration: input.duration,
    width: dims[0],
    height: dims[1],
    accent: input.accent,
    captionPosition: input.captionPosition,
    gentleZoom: input.gentleZoom,
    subtitles: input.subtitles,
    pages: captionPages(input.words).map((p) =>
      p.map((w, i) => ({
        text: (i ? " " : "") + w.text,
        startMs: w.start * 1000,
        endMs: w.end * 1000,
        timestampMs: null,
        confidence: null,
      })),
    ),
    cutTimes,
  };
  browser = await openBrowser("chrome", {
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
    chromiumOptions: {
      disableWebSecurity: false,
      ignoreCertificateErrors: false,
    },
    logLevel: "error",
  });
  const composition = await selectComposition({
    serveUrl,
    id: "NexoVideo",
    inputProps: props,
    puppeteerInstance: browser,
    timeoutInMilliseconds: 60000,
    logLevel: "error",
  });
  let lastProgress = -1;
  await renderMedia({
    composition,
    serveUrl,
    inputProps: props,
    outputLocation: input.output,
    codec: "h264",
    audioCodec: "aac",
    crf: 18,
    concurrency: 2,
    onProgress: ({ progress }) => {
      if (Math.floor(progress * 20) > lastProgress) {
        lastProgress = Math.floor(progress * 20);
        process.stdout.write(JSON.stringify({ progress }) + "\n");
      }
    },
    puppeteerInstance: browser,
    cancelSignal,
    timeoutInMilliseconds: 60000,
    logLevel: "error",
    offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024,
  });
} finally {
  await browser?.close({ silent: true });
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
