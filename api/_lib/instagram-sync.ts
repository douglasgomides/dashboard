/**
 * Lógica de sync Windsor.ai → Supabase, compartilhada entre o script manual
 * (scripts/sync-instagram.ts) e o endpoint HTTP (api/sync/instagram.ts) que
 * o n8n chama todo dia. Um único lugar pra essa lógica evita os dois
 * caminhos divergirem.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";

const WINDSOR_BASE = "https://connectors.windsor.ai/instagram";

export interface SyncEnv {
  windsorApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  syncDays?: number;
}

export interface AccountSyncResult {
  accountId: string;
  windsorAccountId: string;
  posts: number;
  dailyMetrics: number;
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
async function windsorGet(
  windsorApiKey: string,
  syncDays: number,
  fields: string[],
  windsorAccountId: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    api_key: windsorApiKey,
    date_from: dateNDaysAgo(syncDays),
    date_to: dateNDaysAgo(0),
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

async function syncPosts(
  supabase: SupabaseClient<Database>,
  windsorApiKey: string,
  syncDays: number,
  accountId: string,
  windsorAccountId: string,
  clientId: string,
): Promise<{ count: number; errors: string[] }> {
  const rows = await windsorGet(
    windsorApiKey,
    syncDays,
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

  const errors: string[] = [];
  let count = 0;
  for (const r of rows) {
    if (!r.media_id) continue;
    const { error } = await supabase.from("instagram_posts").upsert(
      {
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
        metrics_updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_account_id,windsor_media_id" },
    );
    if (error) errors.push(`post ${r.media_id}: ${error.message}`);
    else count++;
  }
  return { count, errors };
}

async function syncDailyMetrics(
  supabase: SupabaseClient<Database>,
  windsorApiKey: string,
  syncDays: number,
  accountId: string,
  windsorAccountId: string,
  clientId: string,
): Promise<{ count: number; errors: string[] }> {
  const rows = await windsorGet(
    windsorApiKey,
    syncDays,
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

  const errors: string[] = [];
  let count = 0;
  for (const r of rows.filter((row) => row.date)) {
    const { error } = await supabase.from("instagram_account_daily_metrics").upsert(
      {
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
      },
      { onConflict: "instagram_account_id,date" },
    );
    if (error) errors.push(`daily ${r.date}: ${error.message}`);
    else count++;
  }
  return { count, errors };
}

export async function runInstagramSync(env: SyncEnv): Promise<AccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const syncDays = env.syncDays ?? 90;

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
      syncDays,
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
      syncDays,
      account.id,
      account.windsor_account_id,
      account.client_id,
    ).catch((err) => {
      errors.push(`daily: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });

    results.push({
      accountId: account.id,
      windsorAccountId: account.windsor_account_id,
      posts: posts.count,
      dailyMetrics: daily.count,
      errors: [...errors, ...posts.errors, ...daily.errors],
    });
  }
  return results;
}
