/**
 * Preenche thumbnail_url pros posts já sincronizados antes da correção em
 * meta-graph-sync.ts (que só pedia thumbnail_url, campo que só existe pra
 * VIDEO — post de imagem ficou sem foto). Só toca posts que já estão salvos,
 * não refaz o sync inteiro.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const BATCH_SIZE = 50;

export interface BackfillThumbnailsEnv {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  limit?: number;
}

export interface BackfillThumbnailsResult {
  checked: number;
  updated: number;
  remaining: number;
  errors: string[];
}

export async function runBackfillThumbnails(env: BackfillThumbnailsEnv): Promise<BackfillThumbnailsResult> {
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const limit = env.limit ?? 200;
  const { data: posts, error } = await supabase
    .from("instagram_posts")
    .select("id, windsor_media_id")
    .is("thumbnail_url", null)
    .limit(limit);
  if (error) throw error;

  const errors: string[] = [];
  let updated = 0;

  for (let i = 0; i < (posts?.length ?? 0); i += BATCH_SIZE) {
    const batch = (posts ?? []).slice(i, i + BATCH_SIZE);
    const batchPayload = batch.map((p) => ({
      method: "GET",
      relative_url: `${p.windsor_media_id}?fields=thumbnail_url,media_url`,
    }));
    const res = await fetch(`${GRAPH_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: env.accessToken, batch: JSON.stringify(batchPayload) }),
    });
    if (!res.ok) {
      errors.push(`batch fetch failed (${res.status}): ${await res.text()}`);
      continue;
    }
    const responses = (await res.json()) as { code: number; body: string }[];
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const sub = responses[j];
      if (!sub || sub.code !== 200) continue;
      const parsed = JSON.parse(sub.body) as { thumbnail_url?: string; media_url?: string };
      const url = parsed.thumbnail_url ?? parsed.media_url ?? null;
      if (!url) continue;
      const { error: updateError } = await supabase.from("instagram_posts").update({ thumbnail_url: url }).eq("id", post.id);
      if (updateError) errors.push(`update ${post.id}: ${updateError.message}`);
      else updated++;
    }
  }

  const { count: remaining } = await supabase
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .is("thumbnail_url", null);

  return { checked: posts?.length ?? 0, updated, remaining: remaining ?? 0, errors };
}
