import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runBackfillThumbnails } from "../_lib/backfill-thumbnails.js";

// Endpoint de manutenção pontual — preenche thumbnail_url dos posts que
// sincronizaram antes da correção do campo (ver api/_lib/backfill-thumbnails.ts).
// Mesmo SYNC_SECRET dos outros endpoints de sync.

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

  const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const limit = limitParam && Number.isFinite(limitParam) ? limitParam : undefined;

  try {
    const result = await runBackfillThumbnails({
      accessToken: META_ACCESS_TOKEN,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      limit,
    });
    res.status(result.errors.length > 0 ? 207 : 200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
