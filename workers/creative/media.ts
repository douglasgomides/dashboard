import { createWriteStream, createReadStream, existsSync } from "node:fs";
import { stat, readFile, readdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  BUCKET,
  type CreativeAsset,
} from "../../src/lib/creative-intelligence/contracts.js";
import {
  JobContext,
  CreativeError,
  requireSecret,
  checked,
} from "./runtime.js";

const localRequire = createRequire(import.meta.url);
export function binary(name: "ffmpeg" | "ffprobe") {
  if (process.env[name.toUpperCase() + "_PATH"])
    return process.env[name.toUpperCase() + "_PATH"]!;
  try {
    const installed = name === "ffmpeg"
      ? (localRequire("ffmpeg-static") as string)
      : (localRequire("ffprobe-static") as { path: string }).path;
    return installed && existsSync(installed) ? installed : name;
  } catch {
    return name;
  }
}
export function runMedia(
  name: "ffmpeg" | "ffprobe",
  args: string[],
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(binary(name), ["-hide_banner", "-protocol_whitelist", "file,pipe", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
      timeout: 180_000,
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (b) => {
      stdout = (stdout + b).slice(-4_000_000);
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-300_000);
    });
    child.once("error", () =>
      reject(
        new CreativeError(
          "MEDIA_PROCESS_FAILED",
          `${name} indisponível, cancelado ou excedeu o tempo permitido.`,
        ),
      ),
    );
    child.once("exit", (code) =>
      code === 0
        ? resolve(stdout || stderr)
        : reject(
            new CreativeError(
              "MEDIA_PROCESS_FAILED",
              `O arquivo não pôde ser processado por ${name}.`,
            ),
          ),
    );
  });
}
export async function probe(path: string, signal: AbortSignal) {
  const j = JSON.parse(
    await runMedia(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
      signal,
    ),
  );
  const v = (j.streams as any[]).find((s) => s.codec_type === "video");
  const duration = Number(j.format?.duration || v?.duration || 0);
  if (
    !v ||
    !Number.isFinite(duration) ||
    Number(v.width) * Number(v.height) > 40_000_000
  )
    throw new CreativeError(
      "INVALID_MEDIA",
      "Arquivo sem imagem válida ou excede a resolução permitida.",
    );
  return {
    width: Number(v.width),
    height: Number(v.height),
    duration,
    hasAudio: (j.streams as any[]).some((s) => s.codec_type === "audio"),
  };
}
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const a = address.split(".").map(Number);
    return !(
      a[0] === 0 ||
      a[0] === 10 ||
      a[0] === 127 ||
      a[0] >= 224 ||
      (a[0] === 169 && a[1] === 254) ||
      (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
      (a[0] === 192 && a[1] === 168) ||
      (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
      (a[0] === 198 && (a[1] === 18 || a[1] === 19))
    );
  }
  const a = address.toLowerCase();
  return (
    isIP(a) === 6 &&
    !a.startsWith("::") &&
    !a.startsWith("fc") &&
    !a.startsWith("fd") &&
    !/^fe[89ab]/.test(a) &&
    !a.startsWith("ff")
  );
}
export function allowedMediaUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    (!/(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com|byteoversea\.com|ibytedtos\.com|ibyteimg\.com|ttwstatic\.com|muscdn\.com)$/.test(
      u.hostname,
    ) &&
      u.hostname !== "api.apify.com")
  )
    throw new CreativeError(
      "UNSAFE_MEDIA_URL",
      "Origem do arquivo não permitida.",
    );
  return u;
}
/** Download em stream, DNS fixado ao endereço validado e redirecionamentos recusados. */
export async function download(
  raw: string,
  path: string,
  signal: AbortSignal,
  maxBytes = 200 * 1024 * 1024,
) {
  const url = allowedMediaUrl(raw),
    addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new CreativeError(
      "UNSAFE_MEDIA_URL",
      "Destino de rede não permitido.",
    );
  const selected = addresses.find((a) => a.family === 4) || addresses[0];
  let bytes = 0;
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const options: import("node:https").RequestOptions & {
      autoSelectFamily: boolean;
    } = {
      method: "GET",
      signal,
      timeout: 60_000,
      family: selected.family,
      autoSelectFamily: false,
      lookup: (_host, _opts, cb) => cb(null, selected.address, selected.family),
    };
    const req = request(url, options, (res) => {
      if (res.statusCode !== 200) {
        res.destroy();
        reject(
          new CreativeError(
            res.statusCode === 403 ? "MEDIA_URL_EXPIRED" : "DOWNLOAD_FAILED",
            "Não foi possível obter o arquivo da origem autorizada.",
            res.statusCode === 429 || (res.statusCode ?? 0) >= 500,
          ),
        );
        return;
      }
      if (Number(res.headers["content-length"] || 0) > maxBytes) {
        res.destroy();
        reject(
          new CreativeError(
            "MEDIA_TOO_LARGE",
            "Arquivo acima do limite de download do worker.",
          ),
        );
        return;
      }
      const guard = new Transform({
        transform(chunk, _encoding, cb) {
          bytes += chunk.length;
          if (bytes > maxBytes)
            cb(
              new CreativeError(
                "MEDIA_TOO_LARGE",
                "Arquivo excede o limite configurado.",
              ),
            );
          else {
            hash.update(chunk);
            cb(null, chunk);
          }
        },
      });
      void pipeline(
        res,
        guard,
        createWriteStream(path, { flags: "wx", mode: 0o600 }),
        { signal },
      ).then(() => resolve(), reject);
    });
    req.on("timeout", () =>
      req.destroy(
        new CreativeError(
          "DOWNLOAD_TIMEOUT",
          "O download excedeu o tempo permitido.",
          true,
        ),
      ),
    );
    req.on("error", () =>
      reject(
        new CreativeError(
          "DOWNLOAD_FAILED",
          "Falha de rede ao obter a mídia.",
          true,
        ),
      ),
    );
    req.end();
  });
  if (bytes === 0) throw new CreativeError("EMPTY_MEDIA", "Arquivo vazio.");
  return { bytes, sha256: hash.digest("hex") };
}
export async function storeAsset(
  ctx: JobContext,
  sourceId: string,
  path: string,
  details: Pick<CreativeAsset, "kind" | "position" | "mime"> &
    Partial<CreativeAsset>,
) {
  await ctx.beat();
  const id = randomUUID(),
    info = await stat(path),
    hash = createHash("sha256");
  for await (const b of createReadStream(path)) hash.update(b);
  const checksum = hash.digest("hex"),
    ext =
      details.mime === "image/jpeg"
        ? "jpg"
        : details.mime === "audio/mpeg"
          ? "mp3"
          : "mp4";
  const storagePath = `${ctx.job.client_id}/${ctx.job.account_id}/${sourceId}/${ctx.job.id}/${id}.${ext}`;
  const storageUrl = new URL(
    `/storage/v1/object/${BUCKET}/${storagePath}`,
    requireSecret("SUPABASE_URL"),
  );
  const response = await fetch(storageUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requireSecret("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: requireSecret("SUPABASE_SERVICE_ROLE_KEY"),
      "content-type": details.mime,
      "content-length": String(info.size),
      "x-upsert": "false",
    },
    body: createReadStream(path) as any,
    duplex: "half",
    signal: ctx.signal,
  } as RequestInit & { duplex: string });
  if (!response.ok)
    throw new CreativeError(
      "STORAGE_UPLOAD_FAILED",
      "O Storage recusou o arquivo. Confira o limite de tamanho do projeto.",
      response.status >= 500,
    );
  const asset: CreativeAsset = {
    ...details,
    id,
    client_id: ctx.job.client_id,
    account_id: ctx.job.account_id,
    source_id: sourceId,
    storage_path: storagePath,
    sha256: checksum,
    bytes: info.size,
    width: details.width ?? null,
    height: details.height ?? null,
    time_seconds: details.time_seconds ?? null,
    duration_seconds: details.duration_seconds ?? null,
    metadata: details.metadata ?? {},
  };
  await checked(ctx.admin.from("creative_assets").insert(asset));
  return asset;
}
export async function localAsset(
  ctx: JobContext,
  asset: CreativeAsset,
  directory: string,
) {
  if (
    asset.client_id !== ctx.job.client_id ||
    asset.account_id !== ctx.job.account_id
  )
    throw new CreativeError("TENANT_MISMATCH", "Arquivo de outra conta.");
  const path = join(directory, asset.id);
  const response = await fetch(
    new URL(
      `/storage/v1/object/authenticated/${BUCKET}/${asset.storage_path}`,
      requireSecret("SUPABASE_URL"),
    ),
    {
      headers: {
        authorization: `Bearer ${requireSecret("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: requireSecret("SUPABASE_SERVICE_ROLE_KEY"),
      },
      signal: ctx.signal,
    },
  );
  if (!response.ok || !response.body)
    throw new CreativeError(
      "ASSET_NOT_AVAILABLE",
      "Arquivo privado indisponível.",
    );
  const { Readable } = await import("node:stream");
  await pipeline(
    Readable.fromWeb(response.body as any),
    createWriteStream(path, { mode: 0o600 }),
    { signal: ctx.signal },
  );
  const hash = createHash("sha256");
  for await (const b of createReadStream(path)) hash.update(b);
  if (hash.digest("hex") !== asset.sha256)
    throw new CreativeError(
      "ASSET_INTEGRITY",
      "A integridade do arquivo não confere.",
    );
  return path;
}
export async function extractVideo(
  ctx: JobContext,
  sourceId: string,
  path: string,
  directory: string,
) {
  const technical = await probe(path, ctx.signal);
  if (technical.duration <= 0 || technical.duration > 600)
    throw new CreativeError(
      "VIDEO_DURATION_LIMIT",
      "O piloto processa vídeos de até dez minutos. O arquivo não foi truncado.",
    );
  const assets: CreativeAsset[] = [];
  const frames: { asset: CreativeAsset; path: string }[] = [];
  // Toda a duração é decodificada. A análise visual por frames continua explicitamente amostral.
  await runMedia(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "2",
      "-i",
      path,
      "-vf",
      "fps=1,scale=768:768:force_original_aspect_ratio=decrease",
      "-q:v",
      "3",
      join(directory, "frame-%06d.jpg"),
    ],
    ctx.signal,
  );
  const names = (await readdir(directory))
    .filter((n) => /^frame-\d+\.jpg$/.test(n))
    .sort();
  for (let i = 0; i < names.length; i++) {
    const p = join(directory, names[i]);
    const asset = await storeAsset(ctx, sourceId, p, {
      kind: "frame",
      position: i + 1,
      mime: "image/jpeg",
      time_seconds: Math.min(technical.duration, i),
      metadata: { sampling: "1fps", source_duration: technical.duration },
    });
    assets.push(asset);
    frames.push({ asset, path: p });
  }
  // Detecta mudanças em todos os frames, sem substituir a leitura multimodal dos recortes.
  const cuts = await runMedia(
    "ffmpeg",
    [
      "-threads",
      "2",
      "-i",
      path,
      "-vf",
      "select='gt(scene,0.22)',showinfo",
      "-an",
      "-f",
      "null",
      "-",
    ],
    ctx.signal,
  );
  const cutTimes = [...cuts.matchAll(/pts_time:([0-9.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => Number.isFinite(t) && t >= 0 && t <= technical.duration);
  for (let i = 0; i < cutTimes.length && i < 300; i++) {
    const t = cutTimes[i],
      p = join(directory, `cut-${i}.jpg`);
    await runMedia(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        String(t),
        "-i",
        path,
        "-frames:v",
        "1",
        "-vf",
        "scale=768:768:force_original_aspect_ratio=decrease",
        "-q:v",
        "3",
        p,
      ],
      ctx.signal,
    );
    const asset = await storeAsset(ctx, sourceId, p, {
      kind: "frame",
      position: names.length + i + 1,
      mime: "image/jpeg",
      time_seconds: t,
      metadata: { sampling: "scene_change" },
    });
    assets.push(asset);
    frames.push({ asset, path: p });
  }
  let audioPath: string | null = null;
  if (technical.hasAudio) {
    audioPath = join(directory, "audio.mp3");
    await runMedia(
      "ffmpeg",
      [
        "-v",
        "error",
        "-threads",
        "2",
        "-i",
        path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "48k",
        audioPath,
      ],
      ctx.signal,
    );
    assets.push(
      await storeAsset(ctx, sourceId, audioPath, {
        kind: "audio",
        position: 1,
        mime: "audio/mpeg",
        duration_seconds: technical.duration,
      }),
    );
  }
  return {
    technical,
    assets,
    frames: frames.sort(
      (a, b) => (a.asset.time_seconds ?? 0) - (b.asset.time_seconds ?? 0),
    ),
    audioPath,
    cutTimes,
  };
}
