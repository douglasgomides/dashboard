/**
 * Sync direto com a API do Instagram (Meta Graph API), sem passar pela
 * Windsor.ai. Criado porque a Windsor trava/demora demais em consultas de
 * período histórico (testado e confirmado — qualquer janela que não seja
 * "bem recente" nunca completa a tempo). A API direta da Meta pagina o
 * histórico completo de posts rapidamente, sem esse problema.
 *
 * Precisa de um token de usuário de longa duração com as permissões
 * instagram_basic, instagram_manage_insights, pages_read_engagement,
 * pages_show_list — gerado uma vez por quem for Admin da Business Manager
 * de cada cliente. Como o token é do usuário (não da conta do cliente), o
 * MESMO token continua funcionando pra qualquer cliente novo assim que essa
 * pessoa virar Admin na Business Manager dele — não precisa gerar de novo.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { numOrNull, chunk, BATCH_SIZE, normalizeFormat } from "./instagram-sync.js";
import { classifyTema } from "./tema-classifier.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const INSIGHTS_METRICS = "reach,likes,comments,shares,saved,views,total_interactions";
const INSIGHTS_BATCH_SIZE = 50; // limite da API de lote da Meta

interface MetaMedia {
  id: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
}

export interface MetaSyncEnv {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  // Processar todas as contas numa invocação só estourava os 300s da
  // função na Vercel (confirmado: FUNCTION_INVOCATION_TIMEOUT com só 2
  // contas). Passando isso, processa só essa conta — quem chama itera uma
  // por vez.
  onlyAccountId?: string;
  // Quantas páginas de /media (100 posts cada) processar nesta invocação —
  // mesmo uma conta só pode ter posts demais pra caber em 300s. Retorna
  // nextCursor/done pra quem chama continuar de onde parou.
  maxPages?: number;
  after?: string;
}

export interface MetaAccountSyncResult {
  accountId: string;
  igAccountId: string;
  posts: number;
  temasClassified: number;
  nextCursor: string | null;
  done: boolean;
  errors: string[];
}

// Pagina a mídia da conta, mais recente primeiro. Limitado a maxPages por
// chamada — processar o histórico inteiro (500+ posts) numa invocação só
// estourava os 300s da função na Vercel (confirmado por teste direto). Quem
// chama itera passando o cursor `next` de volta até `done: true`.
async function fetchMediaPage(
  igAccountId: string,
  accessToken: string,
  maxPages: number,
  after?: string,
): Promise<{ media: MetaMedia[]; nextCursor: string | null; done: boolean }> {
  const fields = "id,caption,timestamp,media_type,media_product_type,permalink,thumbnail_url";
  let url: string | null =
    `${GRAPH_BASE}/${igAccountId}/media?fields=${fields}&limit=100&access_token=${accessToken}` +
    (after ? `&after=${after}` : "");
  const all: MetaMedia[] = [];
  let nextCursor: string | null = null;
  let pagesLeft = maxPages;

  while (url && pagesLeft > 0) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meta Graph media fetch failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: MetaMedia[];
      paging?: { next?: string; cursors?: { after?: string } };
    };
    all.push(...(body.data ?? []));
    nextCursor = body.paging?.cursors?.after ?? null;
    url = body.paging?.next ?? null;
    pagesLeft--;
  }
  return { media: all, nextCursor: url ? nextCursor : null, done: !url };
}

// Busca insights de até 50 posts por chamada via API de lote da Meta, em vez
// de uma chamada por post — pra 500+ posts isso é a diferença entre ~10
// chamadas e 500.
async function fetchInsightsBatch(
  mediaIds: string[],
  accessToken: string,
): Promise<Map<string, Record<string, number>>> {
  const result = new Map<string, Record<string, number>>();

  for (const idsBatch of chunk(mediaIds, INSIGHTS_BATCH_SIZE)) {
    const batchPayload = idsBatch.map((id) => ({
      method: "GET",
      relative_url: `${id}/insights?metric=${INSIGHTS_METRICS}`,
    }));

    const res = await fetch(`${GRAPH_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batchPayload) }),
    });
    if (!res.ok) {
      throw new Error(`Meta Graph batch insights failed (${res.status}): ${await res.text()}`);
    }
    const responses = (await res.json()) as { code: number; body: string }[];

    for (let i = 0; i < idsBatch.length; i++) {
      const id = idsBatch[i];
      const sub = responses[i];
      if (!sub || sub.code !== 200) continue; // posts antigos podem não ter insights disponíveis — não derruba o sync
      const parsed = JSON.parse(sub.body) as { data?: { name: string; values?: { value: number }[] }[] };
      const metrics: Record<string, number> = {};
      for (const m of parsed.data ?? []) metrics[m.name] = m.values?.[0]?.value ?? 0;
      result.set(id, metrics);
    }
  }
  return result;
}

async function syncAccountPosts(
  supabase: SupabaseClient<Database>,
  accessToken: string,
  accountId: string,
  igAccountId: string,
  clientId: string,
  maxPages: number,
  after: string | undefined,
): Promise<{ count: number; errors: string[]; nextCursor: string | null; done: boolean }> {
  const { media, nextCursor, done } = await fetchMediaPage(igAccountId, accessToken, maxPages, after);
  const insightsById = await fetchInsightsBatch(
    media.map((m) => m.id),
    accessToken,
  );

  const now = new Date().toISOString();
  const rows = media
    .filter((m) => m.id && m.timestamp)
    .map((m) => {
      const ins = insightsById.get(m.id) ?? {};
      return {
        instagram_account_id: accountId,
        client_id: clientId,
        windsor_media_id: m.id,
        media_type: m.media_type ?? null,
        format: normalizeFormat(m.media_type, m.media_product_type) as any,
        permalink: m.permalink ?? null,
        thumbnail_url: m.thumbnail_url ?? null,
        caption: m.caption ?? null,
        posted_at: m.timestamp ?? null,
        reach: numOrNull(ins.reach),
        saved: numOrNull(ins.saved),
        likes: numOrNull(ins.likes),
        comments: numOrNull(ins.comments),
        shares: numOrNull(ins.shares),
        views: numOrNull(ins.views),
        engagement: numOrNull(ins.total_interactions),
        metrics_updated_at: now,
      };
    });

  const errors: string[] = [];
  let count = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(batch, { onConflict: "instagram_account_id,windsor_media_id" });
    if (error) errors.push(`posts batch (${batch.length}): ${error.message}`);
    else count += batch.length;
  }
  return { count, errors, nextCursor, done };
}

async function classifyMissingTemas(
  supabase: SupabaseClient<Database>,
  accountId: string,
  igAccountId: string,
): Promise<{ count: number; errors: string[] }> {
  const { data: rows, error: selectError } = await supabase
    .from("instagram_posts")
    .select("id, caption")
    .eq("instagram_account_id", accountId)
    .is("tema", null);
  if (selectError) return { count: 0, errors: [`classify select: ${selectError.message}`] };

  const idsByTema = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const tema = classifyTema(igAccountId, row.caption);
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

// windsor_account_id guarda o Instagram Business Account ID — o mesmo
// identificador que a API direta da Meta usa, então não precisa de coluna
// nova pra mapear conta.
export async function runMetaGraphSync(env: MetaSyncEnv): Promise<MetaAccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase.from("instagram_accounts").select("id, client_id, windsor_account_id").eq("active", true);
  if (env.onlyAccountId) query = query.eq("id", env.onlyAccountId);
  const { data: accounts, error } = await query;
  if (error) throw error;

  const maxPages = env.maxPages ?? 3;
  const results: MetaAccountSyncResult[] = [];
  for (const account of accounts ?? []) {
    const errors: string[] = [];
    const posts = await syncAccountPosts(
      supabase,
      env.accessToken,
      account.id,
      account.windsor_account_id,
      account.client_id,
      maxPages,
      env.after,
    ).catch((err) => {
      errors.push(`posts: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [], nextCursor: null, done: true };
    });
    const temas = await classifyMissingTemas(supabase, account.id, account.windsor_account_id).catch((err) => {
      errors.push(`classify: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });

    results.push({
      accountId: account.id,
      igAccountId: account.windsor_account_id,
      posts: posts.count,
      temasClassified: temas.count,
      nextCursor: posts.nextCursor,
      done: posts.done,
      errors: [...errors, ...posts.errors, ...temas.errors],
    });
  }
  return results;
}
