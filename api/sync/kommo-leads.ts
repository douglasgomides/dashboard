import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { runKommoLeadsSync } from "../_lib/kommo-leads-sync.js";

// Sync ativo de leads da Kommo via API — complementa o webhook passivo
// (api/integrations/kommo/webhook.ts), que só cobre o que teve evento
// depois de registrado. Mesmo SYNC_SECRET dos outros endpoints de sync.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const KOMMO_API_TOKEN = process.env.KOMMO_API_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !KOMMO_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Servidor sem SYNC_SECRET/KOMMO_API_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados",
    });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const connectionId = typeof req.query.connection_id === "string" ? req.query.connection_id : undefined;
  const maxPagesParam = typeof req.query.max_pages === "string" ? Number(req.query.max_pages) : undefined;
  const maxPages = maxPagesParam && Number.isFinite(maxPagesParam) ? maxPagesParam : undefined;

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("crm_connections")
    .select("id, client_id, subdomain")
    .eq("provider", "kommo")
    .eq("active", true);
  if (connectionId) query = query.eq("id", connectionId);
  const { data: connections, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  try {
    const results = [];
    for (const conn of connections ?? []) {
      if (!conn.subdomain) {
        results.push({ connectionId: conn.id, errors: ["sem subdomínio configurado, não dá pra montar a URL da API"] });
        continue;
      }
      const result = await runKommoLeadsSync({
        accessToken: KOMMO_API_TOKEN,
        kommoDomain: `${conn.subdomain}.kommo.com`,
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        crmConnectionId: conn.id,
        clientId: conn.client_id,
        maxPages,
      });
      results.push({ connectionId: conn.id, ...result });
    }
    const hasErrors = results.some((r) => "errors" in r && r.errors && r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), connections: results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
