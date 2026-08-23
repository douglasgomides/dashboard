/**
 * Fase 1 — sync manual/agendado dos dados de Instagram da Windsor.ai pro
 * Supabase. Roda com `npm run sync:instagram`. Não é um edge function ainda
 * (Fase 1 valida o cruzamento manualmente pros 2 clientes piloto antes de
 * automatizar o agendamento).
 *
 * Precisa de WINDSOR_API_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no
 * ambiente. O endpoint e os nomes de campo seguem a API pública da Windsor.ai
 * (https://windsor.ai/api-fields/) — confira lá se algum campo mudar.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";

const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_DAYS = Number(process.env.SYNC_DAYS ?? 90);

if (!WINDSOR_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing WINDSOR_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WINDSOR_BASE = "https://connectors.windsor.ai/instagram";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function windsorGet(fields: string[], extra: Record<string, string> = {}) {
  const params = new URLSearchParams({
    api_key: WINDSOR_API_KEY!,
    date_from: dateNDaysAgo(SYNC_DAYS),
    date_to: dateNDaysAgo(0),
    fields: fields.join(","),
    ...extra,
  });
  const res = await fetch(`${WINDSOR_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Windsor.ai request failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  return body.data ?? [];
}

// REEL/STORY/CAROUSEL_ALBUM map directly; plain FEED image or video is "estatico".
function normalizeFormat(mediaType: unknown, productType: unknown): string | null {
  const type = String(mediaType ?? "").toUpperCase();
  const product = String(productType ?? "").toUpperCase();
  if (product === "STORY") return "stories";
  if (product === "REEL" || type === "REEL") return "reels";
  if (type === "CAROUSEL_ALBUM") return "carrossel";
  if (type === "IMAGE" || type === "VIDEO") return "estatico";
  return null;
}

async function syncPosts(accountId: string, windsorAccountId: string) {
  const rows = await windsorGet([
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
  ]);

  const forAccount = rows.filter((r) => String(r.account_id) === windsorAccountId);

  for (const r of forAccount) {
    if (!r.media_id) continue;
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(
        {
          instagram_account_id: accountId,
          client_id: (await getClientIdForAccount(accountId))!,
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
    if (error) console.error(`[posts] ${windsorAccountId}/${r.media_id}:`, error.message);
  }

  console.log(`[posts] synced ${forAccount.length} posts for account ${windsorAccountId}`);
}

async function syncDailyMetrics(accountId: string, windsorAccountId: string) {
  const rows = await windsorGet([
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
  ]);

  const forAccount = rows.filter((r) => String(r.account_id) === windsorAccountId && r.date);
  const clientId = await getClientIdForAccount(accountId);

  for (const r of forAccount) {
    const { error } = await supabase.from("instagram_account_daily_metrics").upsert(
      {
        instagram_account_id: accountId,
        client_id: clientId!,
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
    if (error) console.error(`[daily] ${windsorAccountId}/${r.date}:`, error.message);
  }

  console.log(`[daily] synced ${forAccount.length} days for account ${windsorAccountId}`);
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const clientIdCache = new Map<string, string>();
async function getClientIdForAccount(accountId: string): Promise<string | null> {
  if (clientIdCache.has(accountId)) return clientIdCache.get(accountId)!;
  const { data } = await supabase
    .from("instagram_accounts")
    .select("client_id")
    .eq("id", accountId)
    .single();
  if (data) clientIdCache.set(accountId, data.client_id);
  return data?.client_id ?? null;
}

async function main() {
  const { data: accounts, error } = await supabase
    .from("instagram_accounts")
    .select("id, windsor_account_id")
    .eq("active", true);

  if (error) throw error;
  if (!accounts?.length) {
    console.log("Nenhuma conta Instagram ativa em instagram_accounts. Cadastre os 2 clientes piloto primeiro.");
    return;
  }

  for (const account of accounts) {
    await syncPosts(account.id, account.windsor_account_id);
    await syncDailyMetrics(account.id, account.windsor_account_id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
