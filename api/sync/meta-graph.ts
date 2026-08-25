import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";

// Sync direto com a API do Instagram (Meta Graph API) — substitui a Windsor
// pra puxar posts, porque ela trava em consultas de período histórico.
// Protegido pelo mesmo SYNC_SECRET do endpoint da Windsor.

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

  try {
    const results = await runMetaGraphSync({
      accessToken: META_ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      onlyAccountId: accountId,
    });

    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), accounts: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
