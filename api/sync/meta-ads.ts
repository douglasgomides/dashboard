import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";

// Gasto de mídia do Meta, por dia e por campanha, via Windsor.
// Roda para todo cliente ativo com meta_ad_account_id preenchido.
// Protegido pelo mesmo SYNC_SECRET dos outros endpoints de sync.
//
// Parâmetros opcionais:
//   sync_days=7          janela móvel (padrão 7 — a Meta revisa dias recentes)
//   from=&to=            janela exata, para backfill em pedaços
//   client_id=           limita a um cliente

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !WINDSOR_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Servidor sem SYNC_SECRET/WINDSOR_API_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados",
    });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const syncDaysParam = typeof req.query.sync_days === "string" ? Number(req.query.sync_days) : undefined;
  const syncDays = syncDaysParam && Number.isFinite(syncDaysParam) ? syncDaysParam : undefined;
  const dateFrom = typeof req.query.from === "string" ? req.query.from : undefined;
  const dateTo = typeof req.query.to === "string" ? req.query.to : undefined;
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  try {
    const results = await runMetaAdsSync({
      windsorApiKey: WINDSOR_API_KEY,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      syncDays,
      dateFrom,
      dateTo,
      clientId,
    });

    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), accounts: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
