/**
 * Sync de comentários dos posts via Meta Graph API. Matéria-prima pra pauta
 * (dúvidas reais que pacientes deixam) — não interpreta nem resume, só
 * classifica se é pergunta (heurística, sem IA) e guarda.
 *
 * Mesmo problema de limite de tempo do sync de posts (api/_lib/meta-graph-
 * sync.ts): uma invocação na Vercel não dá conta de puxar comentário do
 * histórico inteiro de uma vez. Usa o mesmo padrão — processa um lote de
 * posts (mais recentes primeiro) por chamada, com cursor salvo em
 * instagram_comments_sync_state pra retomar sozinho. Uma vez que o backlog
 * acaba, as chamadas seguintes (via o mesmo job diário) naturalmente só
 * pegam comentário novo dos posts mais recentes — sem trabalho extra.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { isQuestion } from "./question-classifier.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const COMMENTS_BATCH_SIZE = 50; // limite da API de lote da Meta

interface MetaComment {
  id: string;
  text?: string;
  username?: string;
  like_count?: number;
  timestamp?: string;
}

export interface CommentsSyncEnv {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyAccountId?: string;
  maxPosts?: number;
}

export interface CommentsAccountSyncResult {
  accountId: string;
  postsChecked: number;
  comments: number;
  questions: number;
  done: boolean;
  errors: string[];
}

async function fetchCommentsBatch(
  postsWithMediaId: { id: string; windsor_media_id: string }[],
  accessToken: string,
): Promise<Map<string, MetaComment[]>> {
  const result = new Map<string, MetaComment[]>();
  for (let i = 0; i < postsWithMediaId.length; i += COMMENTS_BATCH_SIZE) {
    const batch = postsWithMediaId.slice(i, i + COMMENTS_BATCH_SIZE);
    const batchPayload = batch.map((p) => ({
      method: "GET",
      relative_url: `${p.windsor_media_id}/comments?fields=text,username,like_count,timestamp&limit=50`,
    }));
    const res = await fetch(`${GRAPH_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batchPayload) }),
    });
    if (!res.ok) {
      throw new Error(`Meta Graph batch comments failed (${res.status}): ${await res.text()}`);
    }
    const responses = (await res.json()) as { code: number; body: string }[];
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const sub = responses[j];
      if (!sub || sub.code !== 200) continue; // comentários desativados nesse post não derrubam o sync
      const parsed = JSON.parse(sub.body) as { data?: MetaComment[] };
      result.set(post.id, parsed.data ?? []);
    }
  }
  return result;
}

export async function runMetaCommentsSync(env: CommentsSyncEnv): Promise<CommentsAccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase.from("instagram_accounts").select("id, client_id").eq("active", true);
  if (env.onlyAccountId) query = query.eq("id", env.onlyAccountId);
  const { data: accounts, error } = await query;
  if (error) throw error;

  const maxPosts = env.maxPosts ?? 30;
  const results: CommentsAccountSyncResult[] = [];

  for (const account of accounts ?? []) {
    const errors: string[] = [];
    try {
      const { data: state } = await supabase
        .from("instagram_comments_sync_state")
        .select("last_synced_post_posted_at")
        .eq("instagram_account_id", account.id)
        .maybeSingle();

      let postsQuery = supabase
        .from("instagram_posts")
        .select("id, windsor_media_id, posted_at")
        .eq("instagram_account_id", account.id)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false })
        .limit(maxPosts);
      if (state?.last_synced_post_posted_at) {
        postsQuery = postsQuery.lt("posted_at", state.last_synced_post_posted_at);
      }
      const { data: posts, error: postsError } = await postsQuery;
      if (postsError) throw postsError;

      const done = (posts?.length ?? 0) < maxPosts;

      const commentsByPost = await fetchCommentsBatch(posts ?? [], env.accessToken);
      const now = new Date().toISOString();
      const rows = [];
      for (const post of posts ?? []) {
        for (const c of commentsByPost.get(post.id) ?? []) {
          if (!c.id || !c.text) continue;
          rows.push({
            client_id: account.client_id,
            instagram_post_id: post.id,
            external_comment_id: c.id,
            text: c.text,
            author_username: c.username ?? null,
            like_count: c.like_count ?? null,
            is_question: isQuestion(c.text),
            commented_at: c.timestamp ?? null,
          });
        }
      }

      let commentsCount = 0;
      let questionsCount = 0;
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("instagram_comments")
          .upsert(rows, { onConflict: "instagram_post_id,external_comment_id" });
        if (upsertError) errors.push(`comments upsert: ${upsertError.message}`);
        else {
          commentsCount = rows.length;
          questionsCount = rows.filter((r) => r.is_question).length;
        }
      }

      const oldestChecked = posts && posts.length > 0 ? posts[posts.length - 1].posted_at : null;
      if (errors.length === 0) {
        const { error: stateError } = await supabase.from("instagram_comments_sync_state").upsert(
          {
            instagram_account_id: account.id,
            last_synced_post_posted_at: done ? null : oldestChecked,
            updated_at: now,
          },
          { onConflict: "instagram_account_id" },
        );
        if (stateError) errors.push(`state upsert: ${stateError.message}`);
      }

      results.push({
        accountId: account.id,
        postsChecked: posts?.length ?? 0,
        comments: commentsCount,
        questions: questionsCount,
        done,
        errors,
      });
    } catch (err) {
      results.push({
        accountId: account.id,
        postsChecked: 0,
        comments: 0,
        questions: 0,
        done: true,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return results;
}
