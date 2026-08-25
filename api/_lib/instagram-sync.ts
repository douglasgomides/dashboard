/**
 * Lógica de sync Windsor.ai → Supabase, compartilhada entre o script manual
 * (scripts/sync-instagram.ts) e o endpoint HTTP (api/sync/instagram.ts) que
 * o n8n chama todo dia. Um único lugar pra essa lógica evita os dois
 * caminhos divergirem.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { classifyTema } from "./tema-classifier.js";

const WINDSOR_BASE = "https://connectors.windsor.ai/instagram";

export interface SyncEnv {
  windsorApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  syncDays?: number;
  // Sobrescreve syncDays com uma janela exata (YYYY-MM-DD) — usado pra rodar
  // um backfill grande em pedaços (ex: por trimestre) via chamadas separadas,
  // já que uma única invocação de função na Vercel tem limite de duração.
  dateFrom?: string;
  dateTo?: string;
}

export interface AccountSyncResult {
  accountId: string;
  windsorAccountId: string;
  posts: number;
  dailyMetrics: number;
  temasClassified: number;
  errors: string[];
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const BATCH_SIZE = 500;
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// REEL/STORY/CAROUSEL_ALBUM map diretamente; FEED de imagem ou vídeo é "estatico".
// A Windsor não é consistente entre contas: em algumas media_type vem "REEL",
// em outras "REELS" (plural) — por isso o includes() em vez de igualdade exata.
function normalizeFormat(mediaType: unknown, productType: unknown): string | null {
  const type = String(mediaType ?? "").toUpperCase();
  const product = String(productType ?? "").toUpperCase();
  if (product === "STORY") return "stories";
  if (product.includes("REEL") || type.includes("REEL")) return "reels";
  if (type === "CAROUSEL_ALBUM") return "carrossel";
  if (type === "IMAGE" || type === "VIDEO") return "estatico";
  return null;
}

// _max_rows não tem default documentado na API da Windsor — sem ele corremos
// risco de corte silencioso (foi isso que sumiu com reels da Lana Torres
// antes). Sempre scoped por conta via `filter`, nunca busca todas as contas
// juntas pra filtrar depois no cliente.
async function windsorGetRange(
  windsorApiKey: string,
  dateFrom: string,
  dateTo: string,
  fields: string[],
  windsorAccountId: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    api_key: windsorApiKey,
    date_from: dateFrom,
    date_to: dateTo,
    fields: fields.join(","),
    filter: JSON.stringify([["account_id", "eq", windsorAccountId]]),
    _max_rows: "100000",
  });
  const res = await fetch(`${WINDSOR_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Windsor.ai request failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  return body.data ?? [];
}

const WINDSOR_CHUNK_DAYS = 30;

// A Windsor demora demais (ou trava) quando pedimos uma janela de datas
// grande de uma vez — descoberto tentando um backfill de 1 ano, que nunca
// voltava. Pedir em pedaços de 30 dias, sequencialmente, é mais lento no
// total mas muito mais confiável. Ainda assim, um backfill de 1 ano inteiro
// numa única invocação da função estoura o limite de duração da Vercel —
// pra isso, quem chama o endpoint (ex: n8n) precisa fazer várias chamadas
// menores usando range.from/range.to em vez de uma sync_days=365 só.
async function windsorGet(
  windsorApiKey: string,
  range: { from: string; to: string },
  fields: string[],
  windsorAccountId: string,
): Promise<Record<string, unknown>[]> {
  const chunks: { from: string; to: string }[] = [];
  let cursor = new Date(range.to + "T00:00:00Z");
  const start = new Date(range.from + "T00:00:00Z");
  while (cursor > start) {
    const chunkStart = new Date(cursor);
    chunkStart.setUTCDate(chunkStart.getUTCDate() - WINDSOR_CHUNK_DAYS);
    const from = chunkStart < start ? range.from : chunkStart.toISOString().slice(0, 10);
    chunks.push({ from, to: cursor.toISOString().slice(0, 10) });
    cursor = chunkStart;
  }

  const all: Record<string, unknown>[] = [];
  for (const c of chunks) {
    const rows = await windsorGetRange(windsorApiKey, c.from, c.to, fields, windsorAccountId);
    all.push(...rows);
  }
  return all;
}

async function syncPosts(
  supabase: SupabaseClient<Database>,
  windsorApiKey: string,
  range: { from: string; to: string },
  accountId: string,
  windsorAccountId: string,
  clientId: string,
): Promise<{ count: number; errors: string[] }> {
  const rows = await windsorGet(
    windsorApiKey,
    range,
    [
      "account_id",
      "media_id",
      "media_type",
      "media_product_type",
      "media_permalink",
      "media_thumbnail_url",
      "media_caption",
      "timestamp",
      "media_reach",
      "media_saved",
      "media_like_count",
      "media_comments_count",
      "media_shares",
      "media_engagement",
      "media_views",
    ],
    windsorAccountId,
  );

  const now = new Date().toISOString();
  const postRows = rows
    .filter((r) => r.media_id)
    .map((r) => ({
      instagram_account_id: accountId,
      client_id: clientId,
      windsor_media_id: String(r.media_id),
      media_type: (r.media_type as string) ?? null,
      format: normalizeFormat(r.media_type, r.media_product_type) as any,
      permalink: (r.media_permalink as string) ?? null,
      thumbnail_url: (r.media_thumbnail_url as string) ?? null,
      caption: (r.media_caption as string) ?? null,
      posted_at: (r.timestamp as string) ?? null,
      reach: numOrNull(r.media_reach),
      saved: numOrNull(r.media_saved),
      likes: numOrNull(r.media_like_count),
      comments: numOrNull(r.media_comments_count),
      shares: numOrNull(r.media_shares),
      views: numOrNull(r.media_views),
      engagement: numOrNull(r.media_engagement),
      metrics_updated_at: now,
    }));

  // Upsert em lote em vez de linha a linha — pra 1 ano de histórico, uma
  // chamada por post estourava o timeout do n8n (60s+ pra poucas centenas
  // de posts). Em lotes de 500, um sync completo de 1 ano fica em segundos.
  const errors: string[] = [];
  let count = 0;
  for (const batch of chunk(postRows, BATCH_SIZE)) {
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(batch, { onConflict: "instagram_account_id,windsor_media_id" });
    if (error) errors.push(`posts batch (${batch.length}): ${error.message}`);
    else count += batch.length;
  }
  return { count, errors };
}

// Só preenche tema quando está null — nunca sobrescreve uma classificação já
// feita (automática ou corrigida manualmente na UI). Roda depois do
// syncPosts pra também cobrir posts recém-inseridos nesta mesma sync.
async function classifyMissingTemas(
  supabase: SupabaseClient<Database>,
  accountId: string,
  windsorAccountId: string,
): Promise<{ count: number; errors: string[] }> {
  const { data: rows, error: selectError } = await supabase
    .from("instagram_posts")
    .select("id, caption")
    .eq("instagram_account_id", accountId)
    .is("tema", null);
  if (selectError) return { count: 0, errors: [`classify select: ${selectError.message}`] };

  // Agrupa por tema calculado e faz um UPDATE por grupo (não por post) —
  // mesma razão do batching em syncPosts, e aqui o número de grupos é
  // pequeno (a quantidade de temas do cliente), então a economia é ainda
  // maior num backfill grande.
  const idsByTema = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const tema = classifyTema(windsorAccountId, row.caption);
    if (!tema) continue;
    const ids = idsByTema.get(tema) ?? [];
    ids.push(row.id);
    idsByTema.set(tema, ids);
  }

  const errors: string[] = [];
  let count = 0;
  for (const [tema, ids] of idsByTema) {
    for (const batch of chunk(ids, BATCH_SIZE)) {
      const { error } = await supabase.from("instagram_posts").update({ tema }).in("id", batch);
      if (error) errors.push(`classify "${tema}" (${batch.length}): ${error.message}`);
      else count += batch.length;
    }
  }
  return { count, errors };
}

async function syncDailyMetrics(
  supabase: SupabaseClient<Database>,
  windsorApiKey: string,
  range: { from: string; to: string },
  accountId: string,
  windsorAccountId: string,
  clientId: string,
): Promise<{ count: number; errors: string[] }> {
  const rows = await windsorGet(
    windsorApiKey,
    range,
    [
      "account_id",
      "date",
      "followers_count",
      "follower_count_1d",
      "reach_1d",
      "likes",
      "comments",
      "saves",
      "shares",
      "total_interactions",
      "profile_links_taps",
    ],
    windsorAccountId,
  );

  const dailyRows = rows
    .filter((r) => r.date)
    .map((r) => ({
      instagram_account_id: accountId,
      client_id: clientId,
      date: r.date as string,
      followers_count: numOrNull(r.followers_count),
      new_followers: numOrNull(r.follower_count_1d),
      reach: numOrNull(r.reach_1d),
      likes: numOrNull(r.likes),
      comments: numOrNull(r.comments),
      saves: numOrNull(r.saves),
      shares: numOrNull(r.shares),
      total_interactions: numOrNull(r.total_interactions),
      profile_links_taps: numOrNull(r.profile_links_taps),
    }));

  const errors: string[] = [];
  let count = 0;
  for (const batch of chunk(dailyRows, BATCH_SIZE)) {
    const { error } = await supabase
      .from("instagram_account_daily_metrics")
      .upsert(batch, { onConflict: "instagram_account_id,date" });
    if (error) errors.push(`daily batch (${batch.length}): ${error.message}`);
    else count += batch.length;
  }
  return { count, errors };
}

export async function runInstagramSync(env: SyncEnv): Promise<AccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const range =
    env.dateFrom && env.dateTo
      ? { from: env.dateFrom, to: env.dateTo }
      : { from: dateNDaysAgo(env.syncDays ?? 365), to: dateNDaysAgo(0) };

  const { data: accounts, error } = await supabase
    .from("instagram_accounts")
    .select("id, client_id, windsor_account_id")
    .eq("active", true);
  if (error) throw error;

  const results: AccountSyncResult[] = [];
  for (const account of accounts ?? []) {
    const errors: string[] = [];
    const posts = await syncPosts(
      supabase,
      env.windsorApiKey,
      range,
      account.id,
      account.windsor_account_id,
      account.client_id,
    ).catch((err) => {
      errors.push(`posts: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });
    const daily = await syncDailyMetrics(
      supabase,
      env.windsorApiKey,
      range,
      account.id,
      account.windsor_account_id,
      account.client_id,
    ).catch((err) => {
      errors.push(`daily: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });
    const temas = await classifyMissingTemas(supabase, account.id, account.windsor_account_id).catch((err) => {
      errors.push(`classify: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });

    results.push({
      accountId: account.id,
      windsorAccountId: account.windsor_account_id,
      posts: posts.count,
      dailyMetrics: daily.count,
      temasClassified: temas.count,
      errors: [...errors, ...posts.errors, ...daily.errors, ...temas.errors],
    });
  }
  return results;
}
