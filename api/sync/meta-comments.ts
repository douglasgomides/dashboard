import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runMetaCommentsSync } from "../_lib/meta-comments-sync.js";

// Sync de comentários dos posts (Meta Graph API) — matéria-prima pra pauta
// (dúvidas reais de pacientes). Mesmo SYNC_SECRET dos outros endpoints de sync.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !META_ACCESS_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Servidor sem SYNC_SECRET/META_ACCESS_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados",
    });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const accountId = typeof req.query.account_id === "string" ? req.query.account_id : undefined;
  const maxPostsParam = typeof req.query.max_posts === "string" ? Number(req.query.max_posts) : undefined;
  const maxPosts = maxPostsParam && Number.isFinite(maxPostsParam) ? maxPostsParam : undefined;

  try {
    const results = await runMetaCommentsSync({
      accessToken: META_ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      onlyAccountId: accountId,
      maxPosts,
    });
    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), accounts: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
