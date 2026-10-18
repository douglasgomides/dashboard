import { setTimeout as delay } from "node:timers/promises";
import type { CreativeSource } from "../../src/lib/creative-intelligence/contracts.js";
import {
  CreativeError,
  JobContext,
  checked,
  requireSecret,
} from "./runtime.js";

export async function checkpoint<T>(
  ctx: JobContext,
  phase: string,
  run: () => Promise<T>,
): Promise<T> {
  const saved = await checked(
    ctx.admin
      .from("creative_checkpoints")
      .select("result")
      .eq("client_id", ctx.job.client_id)
      .eq("job_id", ctx.job.id)
      .eq("phase", phase)
      .maybeSingle(),
  );
  if (saved) return saved.result as T;
  const result = await run();
  await ctx.beat();
  await checked(
    ctx.admin
      .from("creative_checkpoints")
      .upsert(
        { client_id: ctx.job.client_id, job_id: ctx.job.id, phase, result },
        { onConflict: "job_id,phase" },
      ),
  );
  return result;
}
export async function graphToken(ctx: JobContext) {
  const account = await checked(
    ctx.admin
      .from("instagram_accounts")
      .select("id,client_id")
      .eq("id", ctx.job.account_id)
      .eq("client_id", ctx.job.client_id)
      .single(),
  );
  if (!account)
    throw new CreativeError(
      "TENANT_MISMATCH",
      "Conta não pertence ao trabalho.",
    );
  const secret = await checked(
    ctx.admin
      .from("instagram_account_secrets")
      .select("meta_access_token")
      .eq("instagram_account_id", ctx.job.account_id)
      .maybeSingle(),
  );
  const token = secret?.meta_access_token;
  if (!token)
    throw new CreativeError(
      "META_AUTH_REQUIRED",
      "Esta conta precisa de uma credencial Meta válida no ambiente de homologação.",
    );
  return token as string;
}
export async function graphGet(
  ctx: JobContext,
  token: string,
  id: string,
  fields: string,
  after?: string,
) {
  if (!/^\d{5,40}(?:\/children)?$/.test(id))
    throw new CreativeError("INVALID_MEDIA_ID", "Identificador Meta inválido.");
  const version = process.env.CREATIVE_META_VERSION || "v21.0";
  if (!/^v\d{1,2}\.0$/.test(version))
    throw new CreativeError("INVALID_CONFIGURATION", "Versão Graph inválida.");
  const url = new URL(`https://graph.facebook.com/${version}/${id}`);
  url.searchParams.set("fields", fields);
  if (after) url.searchParams.set("after", after);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok)
    throw new CreativeError(
      response.status === 401 || response.status === 403
        ? "META_AUTH_REQUIRED"
        : "META_REQUEST_FAILED",
      "A Meta não disponibilizou a mídia. Verifique acesso, versão e permissões da conta.",
      response.status === 429 || response.status >= 500,
    );
  return response.json();
}
export interface AcquiredReference {
  expected: number | null;
  items: {
    id: string;
    url: string;
    kind: "image" | "video";
    position: number;
  }[];
  missing: string[];
  limitations: string[];
}
export async function ownMedia(
  ctx: JobContext,
  source: CreativeSource,
): Promise<AcquiredReference> {
  const token = await graphToken(ctx),
    m = await graphGet(
      ctx,
      token,
      source.external_id,
      "id,media_type,media_url,children.limit(100){id,media_type,media_url}",
    );
  if (source.format === "reels")
    return {
      expected: 1,
      items:
        m.media_type === "VIDEO" && m.media_url
          ? [{ id: String(m.id), url: m.media_url, kind: "video", position: 1 }]
          : [],
      missing: m.media_url
        ? []
        : ["Arquivo de vídeo não disponibilizado pela Meta."],
      limitations: [],
    };
  if (m.media_type !== "CAROUSEL_ALBUM")
    throw new CreativeError(
      "FORMAT_MISMATCH",
      "A publicação não é um carrossel na origem.",
    );
  let rows: any[] = [...(m.children?.data ?? [])],
    page = m.children?.paging;
  while (page?.next) {
    if (rows.length >= 30)
      throw new CreativeError(
        "CAROUSEL_LIMIT",
        "Carrossel acima do limite de 30 itens; nenhum resultado foi declarado completo.",
      );
    const after = page.cursors?.after;
    if (typeof after !== "string")
      throw new CreativeError(
        "CHILDREN_INCOMPLETE",
        "Paginação incompleta dos slides.",
      );
    const next = await graphGet(
      ctx,
      token,
      source.external_id + "/children",
      "id,media_type,media_url",
      after,
    );
    rows.push(...(next.data ?? []));
    page = next.paging;
  }
  if (rows.length < 2 || new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new CreativeError(
      "CHILDREN_INCOMPLETE",
      "A sequência integral de slides não foi disponibilizada.",
    );
  return {
    expected: rows.length,
    items: rows.flatMap((r, i) =>
      r.media_url
        ? [
            {
              id: String(r.id),
              url: String(r.media_url),
              kind:
                r.media_type === "VIDEO"
                  ? ("video" as const)
                  : ("image" as const),
              position: i + 1,
            },
          ]
        : [],
    ),
    missing: rows.flatMap((r, i) =>
      r.media_url ? [] : [`Slide ${i + 1}: arquivo ausente.`],
    ),
    limitations: [],
  };
}

const ACTORS = {
  instagram: "apify~instagram-scraper",
  tiktok: "clockworks~tiktok-scraper",
} as const;
async function apifyRequest(
  ctx: JobContext,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.apify.com/v2/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireSecret("APIFY_API_TOKEN")}`,
      "content-type": "application/json",
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok)
    throw new CreativeError(
      "APIFY_REQUEST_FAILED",
      "O coletor externo não concluiu a solicitação.",
      response.status === 429 || response.status >= 500,
    );
  return response.json();
}
export async function runActor(
  ctx: JobContext,
  platform: keyof typeof ACTORS,
  input: Record<string, unknown>,
): Promise<any[]> {
  if (process.env.CREATIVE_ENABLE_APIFY !== "true")
    throw new CreativeError(
      "PROVIDER_NOT_ENABLED",
      "Pesquisa externa ainda não habilitada e homologada neste ambiente.",
    );
  const run = await checkpoint(ctx, "apify-run", async () => {
    const reservation = await ctx.reserve(
      "apify",
      ACTORS[platform],
      "external_collection",
      0.25,
    );
    const response = await apifyRequest(
      ctx,
      `acts/${ACTORS[platform]}/runs?maxTotalChargeUsd=0.25&timeout=180&memory=512`,
      { method: "POST", body: JSON.stringify(input) },
    );
    if (!response.data?.id)
      throw new CreativeError(
        "INVALID_PROVIDER_RESPONSE",
        "O coletor não informou uma execução válida.",
      );
    return { runId: String(response.data.id), reservation };
  });
  for (let tries = 0; tries < 90; tries++) {
    await ctx.beat(15, "Aguardando o coletor de referências públicas");
    const response = await apifyRequest(
        ctx,
        `actor-runs/${encodeURIComponent(run.runId)}`,
      ),
      data = response.data;
    if (
      ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(data?.status)
    ) {
      if (typeof data.usageTotalUsd !== "number")
        throw new CreativeError(
          "PROVIDER_COST_UNKNOWN",
          "Custo externo não confirmado; reserva mantida para reconciliação.",
        );
      await ctx.settle(run.reservation, data.usageTotalUsd, {
        provider: "apify",
        run_id: run.runId,
        status: data.status,
      });
      if (data.status !== "SUCCEEDED")
        throw new CreativeError(
          "COLLECTION_INCOMPLETE",
          "O coletor terminou sem concluir a pesquisa.",
        );
      const result = await apifyRequest(
        ctx,
        `datasets/${encodeURIComponent(data.defaultDatasetId)}/items?clean=true&limit=30`,
      );
      if (!Array.isArray(result))
        throw new CreativeError(
          "INVALID_PROVIDER_RESPONSE",
          "Lista de referências inválida.",
        );
      return result;
    }
    await delay(3000, undefined, { signal: ctx.signal });
  }
  throw new CreativeError(
    "COLLECTION_TIMEOUT",
    "A coleta ainda não terminou. A execução foi preservada para retomada.",
    true,
  );
}
export async function externalMedia(
  ctx: JobContext,
  source: CreativeSource,
): Promise<AcquiredReference> {
  const input =
    source.platform === "tiktok"
      ? {
          postURLs: [source.canonical_url],
          resultsPerPage: 1,
          shouldDownloadVideos: true,
          commentsPerPost: 0,
        }
      : {
          directUrls: [source.canonical_url],
          resultsType: "posts",
          resultsLimit: 1,
        };
  const rows = await runActor(ctx, source.platform, input);
  const m = rows[0];
  if (!m)
    throw new CreativeError(
      "MEDIA_UNAVAILABLE",
      "O coletor não recuperou a publicação externa.",
    );
  if (source.format === "reels") {
    const url = m.videoUrl || m.videoMeta?.downloadAddr || m.mediaUrls?.[0];
    return {
      expected: 1,
      items:
        typeof url === "string"
          ? [{ id: source.external_id, url, kind: "video", position: 1 }]
          : [],
      missing:
        typeof url === "string"
          ? []
          : ["Arquivo de vídeo não disponibilizado pelo coletor."],
      limitations: [
        "Referência externa obtida por coletor; cobertura e disponibilidade dependem do fornecedor.",
      ],
    };
  }
  const children = Array.isArray(m.childPosts) ? m.childPosts : [];
  return {
    expected: typeof m.childrenCount === "number" ? m.childrenCount : null,
    items: children.flatMap((p: any, i: number) => {
      const url = p.videoUrl || p.displayUrl;
      return typeof url === "string"
        ? [
            {
              id: String(p.id || `${source.external_id}:${i}`),
              url,
              kind: p.videoUrl ? ("video" as const) : ("image" as const),
              position: i + 1,
            },
          ]
        : [];
    }),
    missing: children.length
      ? []
      : ["A sequência de slides não foi recuperada."],
    limitations:
      typeof m.childrenCount === "number"
        ? []
        : [
            "O coletor não informou uma contagem independente de slides; completude não comprovada.",
          ],
  };
}
