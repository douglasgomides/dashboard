import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runInstagramSync } from "../_lib/instagram-sync.js";

// Endpoint chamado pelo n8n todo dia (Schedule Trigger → HTTP Request) pra
// atualizar o dashboard sem precisar rodar o script manualmente. Protegido
// por SYNC_SECRET (não é auth de usuário — é máquina chamando máquina).

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

  const syncDaysParam = req.query.sync_days;
  const syncDays = syncDaysParam ? Number(Array.isArray(syncDaysParam) ? syncDaysParam[0] : syncDaysParam) : 365;

  try {
    const results = await runInstagramSync({
      windsorApiKey: WINDSOR_API_KEY,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      syncDays: Number.isFinite(syncDays) ? syncDays : 365,
    });

    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), accounts: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
