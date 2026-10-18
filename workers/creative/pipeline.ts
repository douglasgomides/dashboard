import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analysisSchema,
  assessCoverage,
  validateEvidence,
  PIPELINE_VERSION,
  type CreativeSource,
  type CreativeAsset,
  type CreativeAnalysis,
  type CreativeStructure,
} from "../../src/lib/creative-intelligence/contracts.js";
import {
  performanceEvidence,
  type PerformancePost,
} from "../../src/lib/creative-intelligence/performance.js";
import { JobContext, CreativeError, checked } from "./runtime.js";
import { processProduction } from "./production.js";
import { ownMedia, externalMedia, checkpoint, runActor } from "./providers.js";
import {
  download,
  probe,
  storeAsset,
  localAsset,
  runMedia,
  extractVideo,
} from "./media.js";
import {
  analyseSlide,
  transcribeAudio,
  analyseVideoFrames,
  extractDna,
  adaptStructure,
  semanticVector,
} from "./intelligence.js";

async function sourceFor(ctx: JobContext): Promise<CreativeSource> {
  const source = await checked(
    ctx.admin
      .from("creative_sources")
      .select("*")
      .eq("id", ctx.job.source_id)
      .eq("client_id", ctx.job.client_id)
      .eq("account_id", ctx.job.account_id)
      .single(),
  );
  if (!source)
    throw new CreativeError(
      "SOURCE_NOT_FOUND",
      "A publicação não está disponível para esta conta.",
    );
  return source as CreativeSource;
}
async function acquire(ctx: JobContext, source: CreativeSource, dir: string) {
  const reference =
    source.origin === "own"
      ? await ownMedia(ctx, source)
      : await externalMedia(ctx, source);
  const old = await checked(
    ctx.admin
      .from("creative_assets")
      .select("*")
      .eq("client_id", source.client_id)
      .eq("account_id", source.account_id)
      .eq("source_id", source.id)
      .in("kind", ["image", "video"])
      .order("created_at", { ascending: false }),
  );
  const files: { asset: CreativeAsset; path: string }[] = [];
  const missing = [...reference.missing];
  for (const item of reference.items) {
    await ctx.beat(
      5 + Math.round((files.length / Math.max(1, reference.items.length)) * 20),
      `Obtendo arquivo ${item.position} de ${reference.expected ?? reference.items.length}`,
    );
    try {
      const previous = (old as CreativeAsset[]).find(
        (a) =>
          a.kind === item.kind &&
          a.position === item.position &&
          a.metadata.original_id === item.id,
      );
      if (previous) {
        const path = await localAsset(ctx, previous, dir);
        files.push({ asset: previous, path });
        continue;
      }
      const raw = join(dir, `original-${item.position}`),
        integrity = await download(
          item.url,
          raw,
          ctx.signal,
          item.kind === "image" ? 20 * 1024 * 1024 : 200 * 1024 * 1024,
        );
      const technical = await probe(raw, ctx.signal);
      if (item.kind === "image") {
        const image = join(dir, `slide-${item.position}.jpg`);
        await runMedia(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            raw,
            "-frames:v",
            "1",
            "-vf",
            "scale=1536:1536:force_original_aspect_ratio=decrease",
            "-q:v",
            "2",
            image,
          ],
          ctx.signal,
        );
        const asset = await storeAsset(ctx, source.id, image, {
          kind: "image",
          position: item.position,
          mime: "image/jpeg",
          width: technical.width,
          height: technical.height,
          metadata: {
            original_id: item.id,
            original_sha256: integrity.sha256,
            original_bytes: integrity.bytes,
            normalisation:
              "JPEG para leitura; conteúdo integral da imagem, sem recorte",
          },
        });
        files.push({ asset, path: image });
      } else {
        if (technical.duration <= 0)
          throw new CreativeError("INVALID_VIDEO", "Vídeo sem duração válida.");
        const asset = await storeAsset(ctx, source.id, raw, {
          kind: "video",
          position: item.position,
          mime: "video/mp4",
          width: technical.width,
          height: technical.height,
          duration_seconds: technical.duration,
          metadata: { original_id: item.id, original_sha256: integrity.sha256 },
        });
        files.push({ asset, path: raw });
      }
    } catch (error) {
      if (ctx.signal.aborted) throw error;
      missing.push(
        `Item ${item.position}: ${error instanceof CreativeError ? error.message : "Não foi possível obter e validar o arquivo."}`,
      );
    }
  }
  if (!files.length)
    throw new CreativeError(
      "MEDIA_UNAVAILABLE",
      "Nenhum arquivo real pôde ser obtido. Não foi gerada análise a partir da legenda.",
    );
  return { reference, files, missing };
}
export async function analyse(ctx: JobContext, dir: string) {
  const source = await sourceFor(ctx),
    acquired = await acquire(ctx, source, dir);
  const assets = acquired.files.map((f) => f.asset),
    slides: any[] = [],
    scenes: any[] = [],
    transcript: any[] = [];
  let duration: number | null = null,
    audioSeconds = 0,
    visualSeconds = 0,
    maxGap: number | null = null;
  const missing = [...acquired.missing],
    limitations = [...acquired.reference.limitations];
  if (source.format === "carrossel") {
    for (const file of acquired.files) {
      if (file.asset.kind !== "image") {
        missing.push(
          `Slide ${file.asset.position} contém vídeo: leitura integral desse item ainda não homologada.`,
        );
        continue;
      }
      await ctx.beat(
        30 +
          Math.round((slides.length / Math.max(1, acquired.files.length)) * 40),
        `Lendo copy e design do slide ${file.asset.position}`,
      );
      slides.push(await analyseSlide(ctx, file.asset, file.path));
    }
    if (!slides.length)
      throw new CreativeError(
        "VISUAL_ANALYSIS_UNAVAILABLE",
        "Nenhum slide pôde ser analisado visualmente.",
      );
  } else {
    const video = acquired.files.find((f) => f.asset.kind === "video");
    if (!video)
      throw new CreativeError(
        "VIDEO_UNAVAILABLE",
        "O vídeo integral não foi obtido.",
      );
    await ctx.beat(
      30,
      "Decodificando vídeo, extraindo áudio, frames e mudanças de cena",
    );
    const extracted = await checkpoint(ctx, "extraction", async () =>
      extractVideo(ctx, source.id, video.path, dir),
    );
    // Caminhos temporários de checkpoints anteriores não sobrevivem ao reinício.
    // Os arquivos privados são reabertos e conferidos pelo SHA-256.
    const frames = [] as { asset: CreativeAsset; path: string }[];
    for (const frame of extracted.frames) {
      let path = frame.path;
      try {
        await stat(path);
      } catch {
        path = await localAsset(ctx, frame.asset, dir);
      }
      frames.push({ asset: frame.asset, path });
    }
    assets.push(...extracted.assets);
    duration = extracted.technical.duration;
    maxGap = 1;
    if (extracted.audioPath) {
      let path = extracted.audioPath;
      try {
        await stat(path);
      } catch {
        path = await localAsset(
          ctx,
          extracted.assets.find((a) => a.kind === "audio")!,
          dir,
        );
      }
      transcript.push(...(await transcribeAudio(ctx, path, duration)));
      audioSeconds = duration;
    } else {
      audioSeconds = duration;
      limitations.push(
        "Arquivo sem trilha de áudio, confirmado por inspeção técnica. Não há narração para transcrever.",
      );
    }
    await ctx.beat(
      45,
      "Analisando textos na tela, enquadramentos e blocos do vídeo",
    );
    scenes.push(
      ...(await analyseVideoFrames(ctx, frames, duration, transcript)),
    );
    visualSeconds = scenes.reduce((sum, s) => sum + (s.end - s.start), 0);
    limitations.push(
      "Leitura visual por frames a 1fps e mudanças de cena. Elementos muito breves, movimento contínuo e transições entre amostras podem não ser observados; análise global permanece parcial.",
    );
    if (extracted.cutTimes.length > 300)
      missing.push(
        "Mais de 300 mudanças de cena: somente as primeiras 300 receberam frames adicionais.",
      );
  }
  const dna = await extractDna(ctx, source.format, slides, scenes, transcript);
  const result = analysisSchema.parse({
    ...dna,
    format: source.format,
    slides,
    scenes,
  });
  validateEvidence(result, assets, duration);
  const coverage = assessCoverage(
    {
      expected_assets: acquired.reference.expected,
      acquired_assets: acquired.files.length,
      analysed_assets:
        source.format === "carrossel" ? slides.length : scenes.length ? 1 : 0,
      duration_seconds: duration,
      audio_processed_seconds: audioSeconds,
      visual_processed_seconds: visualSeconds,
      visual_method:
        source.format === "carrossel" ? "all_slides" : "sampled_frames",
      maximum_frame_gap_seconds: maxGap,
      missing,
      limitations,
    },
    source.format,
  );
  let performance: unknown = {
    available: false,
    reason: "Referência externa: insights privados não disponíveis.",
  };
  if (source.post_id) {
    const posts = await checked(
      ctx.admin
        .from("instagram_posts")
        .select("*")
        .eq("client_id", source.client_id)
        .eq("instagram_account_id", source.account_id)
        .order("posted_at", { ascending: false })
        .limit(1000),
    );
    const original = (posts as PerformancePost[]).find(
      (p) => p.id === source.post_id,
    );
    if (original)
      performance = performanceEvidence(
        original,
        posts as PerformancePost[],
        "salvamento",
      );
  }
  await ctx.finish({
    version: PIPELINE_VERSION,
    model: process.env.CREATIVE_VISION_MODEL || "gpt-4.1-mini",
    coverage,
    result,
    transcript,
    performance,
    asset_ids: assets.map((a) => a.id),
  });
}
export async function adapt(ctx: JobContext) {
  const structure = (await checked(
    ctx.admin
      .from("creative_structures")
      .select("*")
      .eq("client_id", ctx.job.client_id)
      .eq("account_id", ctx.job.account_id)
      .eq("id", ctx.job.input.structure_id)
      .single(),
  )) as CreativeStructure;
  const analysis = (await checked(
    ctx.admin
      .from("creative_analyses")
      .select("*")
      .eq("client_id", ctx.job.client_id)
      .eq("account_id", ctx.job.account_id)
      .eq("id", structure.analysis_id)
      .single(),
  )) as CreativeAnalysis;
  if (
    analysis.coverage.status !== "completa" &&
    ctx.job.input.allow_partial !== true
  )
    throw new CreativeError(
      "PARTIAL_ANALYSIS",
      "Confirme explicitamente a adaptação de uma análise parcial.",
    );
  await ctx.beat(30, "Adaptando estrutura com o Brand Brain aprovado");
  const document = await adaptStructure(ctx, structure, analysis);
  await ctx.finish({
    document,
    model: process.env.CREATIVE_VISION_MODEL || "gpt-4.1-mini",
    version: PIPELINE_VERSION,
    source_coverage: analysis.coverage.status,
    review_required: true,
  });
}
export async function discover(ctx: JobContext) {
  const input = ctx.job.input,
    platform = input.platform as "instagram" | "tiktok",
    query = String(input.query);
  const rows = await runActor(
    ctx,
    platform,
    platform === "instagram"
      ? {
          search: query.replace(/^#/, ""),
          searchType: "hashtag",
          resultsType: "posts",
          resultsLimit: 20,
        }
      : {
          searchQueries: [query],
          searchSection: "/video",
          resultsPerPage: 20,
          shouldDownloadVideos: false,
          commentsPerPost: 0,
        },
  );
  const result = [];
  for (const item of rows.slice(0, 20)) {
    const url = item.url || item.webVideoUrl;
    let canonical: URL;
    try {
      canonical = new URL(url);
    } catch {
      continue;
    }
    if (
      canonical.protocol !== "https:" ||
      !(
        platform === "instagram"
          ? /^(www\.)?instagram\.com$/
          : /^(www\.)?tiktok\.com$/
      ).test(canonical.hostname)
    )
      continue;
    canonical.search = "";
    canonical.hash = "";
    const format = item.type === "Sidecar" ? "carrossel" : "reels";
    if (input.format && input.format !== format) continue;
    const timestamp = item.timestamp || item.createTimeISO || null;
    if (
      input.since &&
      (!timestamp || Date.parse(timestamp) < Date.parse(String(input.since)))
    )
      continue;
    if (
      input.until &&
      (!timestamp ||
        Date.parse(timestamp) > Date.parse(String(input.until)) + 86_400_000)
    )
      continue;
    const metadata = {
      likes: item.likesCount ?? item.diggCount ?? null,
      comments: item.commentsCount ?? item.commentCount ?? null,
      views: item.videoViewCount ?? item.playCount ?? null,
      shares: item.shareCount ?? null,
      posted_at: timestamp,
      handle: item.ownerUsername ?? item.authorMeta?.name ?? null,
      requested_country: input.country ?? null,
      requested_language: input.language ?? null,
      geography_verified: false,
      language_verified: false,
      classification: "popularidade_observada",
      acceleration: null,
      limitations: [
        "Sem alcance e salvamentos privados de terceiros.",
        "País e idioma solicitados não confirmados pelo coletor.",
        "Uma observação não comprova aceleração.",
      ],
    };
    result.push({
      client_id: ctx.job.client_id,
      account_id: ctx.job.account_id,
      job_id: ctx.job.id,
      platform,
      external_id: String(item.id || canonical.pathname),
      canonical_url: canonical.href,
      title: String(item.caption || item.text || "Referência externa").slice(
        0,
        180,
      ),
      format,
      metadata,
    });
  }
  if (result.length)
    await checked(
      ctx.admin
        .from("creative_discoveries")
        .upsert(result, { onConflict: "job_id,external_id" }),
    );
  await ctx.finish({
    count: result.length,
    provider: "Apify",
    classification: "popularidade_observada",
    coverage_notes: [
      "Resultados dependem do universo do coletor, não de acesso irrestrito ao Explorar/Para Você.",
      "Filtros sem comprovação aparecem como não confirmados.",
    ],
  });
}
export async function measure(ctx: JobContext) {
  const adaptation = await checked(
    ctx.admin
      .from("creative_adaptations")
      .select("*")
      .eq("id", ctx.job.input.adaptation_id)
      .eq("client_id", ctx.job.client_id)
      .eq("account_id", ctx.job.account_id)
      .single(),
  );
  if (
    !adaptation.published_post_id ||
    adaptation.published_post_id !== ctx.job.input.post_id
  )
    throw new CreativeError(
      "PUBLICATION_NOT_LINKED",
      "Não há publicação confirmada para medir.",
    );
  const post = await checked(
    ctx.admin
      .from("instagram_posts")
      .select("*")
      .eq("id", adaptation.published_post_id)
      .eq("client_id", ctx.job.client_id)
      .eq("instagram_account_id", ctx.job.account_id)
      .single(),
  );
  const window = Number(ctx.job.input.window_day),
    target = Date.parse(post.posted_at) + window * 86_400_000,
    observed = Date.now(),
    metricsAt = Date.parse(post.metrics_updated_at || "");
  const quality = !Number.isFinite(metricsAt)
    ? "missing"
    : observed - metricsAt > 12 * 3_600_000
      ? "stale"
      : Math.abs(metricsAt - target) > 12 * 3_600_000
        ? "late"
        : "within_window";
  const peers = await checked(
    ctx.admin
      .from("instagram_posts")
      .select("*")
      .eq("client_id", ctx.job.client_id)
      .eq("instagram_account_id", ctx.job.account_id)
      .eq("format", post.format)
      .order("posted_at", { ascending: false })
      .limit(500),
  );
  const comparison = {
    ...performanceEvidence(
      post as PerformancePost,
      peers as PerformancePost[],
      adaptation.document.objective,
    ),
    age_matched: false,
    causal: false,
  };
  const metrics = {
    reach: post.reach,
    saved: post.saved,
    shares: post.shares,
    views: post.views,
    follows: post.media_follows,
    watch_time_ms: post.reel_avg_watch_time_ms,
  };
  await checked(
    ctx.admin
      .from("creative_metric_observations")
      .upsert(
        {
          client_id: ctx.job.client_id,
          account_id: ctx.job.account_id,
          adaptation_id: adaptation.id,
          post_id: post.id,
          window_day: window,
          metrics_at: post.metrics_updated_at,
          age_hours: (observed - Date.parse(post.posted_at)) / 3_600_000,
          quality,
          metrics,
          comparison,
        },
        { onConflict: "adaptation_id,window_day" },
      ),
  );
  // Sem coorte de mesma idade e testes repetidos, não promover automaticamente para "validada".
  await ctx.finish({ window_day: window, quality, metrics, comparison });
}
export async function search(ctx: JobContext) {
  const query = String(ctx.job.input.query),
    candidates = await checked(
      ctx.admin
        .from("creative_structures")
        .select("*")
        .eq("client_id", ctx.job.client_id)
        .eq("account_id", ctx.job.account_id)
        .limit(100),
    );
  for (const candidate of candidates ?? [])
    if (!candidate.embedding) {
      const vector = await semanticVector(
        ctx,
        `${candidate.title}\n${candidate.theme}\n${JSON.stringify(candidate.dna)}`,
        `embedding:${candidate.id}`,
      );
      await checked(
        ctx.admin
          .from("creative_structures")
          .update({
            embedding: vector,
            embedding_model: "text-embedding-3-small",
          })
          .eq("id", candidate.id)
          .eq("client_id", ctx.job.client_id)
          .eq("account_id", ctx.job.account_id),
      );
    }
  const vector = await semanticVector(ctx, query, "embedding:query");
  const matches = await checked(
    ctx.admin.rpc("creative_search", {
      p_client_id: ctx.job.client_id,
      p_account_id: ctx.job.account_id,
      p_query: query,
      p_embedding: vector,
    }),
  );
  await ctx.finish({ matches });
}
export async function processJob(ctx: JobContext) {
  const dir = await mkdtemp(join(tmpdir(), "nexo-creative-"));
  ctx.start();
  const timeout = setTimeout(() => ctx.controller.abort(), 20 * 60_000);
  try {
    await ctx.beat();
    if (ctx.job.kind.startsWith("production_")) await processProduction(ctx, dir);
    else if (ctx.job.kind === "analyse") await analyse(ctx, dir);
    else if (ctx.job.kind === "adapt") await adapt(ctx);
    else if (ctx.job.kind === "discover") await discover(ctx);
    else if (ctx.job.kind === "measure") await measure(ctx);
    else if (ctx.job.kind === "search") await search(ctx);
  } catch (error) {
    const known =
      error instanceof CreativeError
        ? error
        : ctx.signal.aborted
          ? new CreativeError(
              "WORKER_INTERRUPTED",
              "Processamento interrompido. As etapas concluídas foram preservadas para retomada.",
              true,
            )
          : new CreativeError(
              "PROCESSING_FAILED",
              "Não foi possível concluir o processamento. Consulte a configuração e as evidências já adquiridas.",
              false,
            );
    await checked(
      ctx.admin.rpc("creative_fail", {
        p_job_id: ctx.job.id,
        p_lease: ctx.job.lease_token,
        p_code: known.code,
        p_message: known.message,
        p_retry: known.retry,
      }),
    );
    // Não imprimir erros brutos: SDKs podem incluir URLs, prompts e chaves na exceção.
    console.error(JSON.stringify({ job_id: ctx.job.id, code: known.code }));
  } finally {
    clearTimeout(timeout);
    ctx.stop();
    await rm(dir, { recursive: true, force: true });
  }
}
