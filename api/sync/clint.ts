import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runClintSync } from "../_lib/clint-sync.js";
import { runRdStationSync } from "../_lib/rdstation-sync.js";

// Sync dos negócios da Clint, chamado pelo n8n. Máquina chamando máquina,
// então autoriza por SYNC_SECRET — o mesmo padrão de api/sync/kommo-leads.
//
// O token da Clint NÃO vive aqui: ele fica em crm_connections.access_token,
// por cliente, porque cada cliente pode ter conta própria.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Servidor sem SYNC_SECRET/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados" });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  try {
    const results = await runClintSync({
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      onlyClientId: clientId,
    });
    await recordSyncStatusPorCliente(
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
      "crm",
      results.map((r) => ({ clientId: r.clientId, rows: r.negocios, errors: r.errors })),
    );
    // RD Station CRM entra pelo mesmo endpoint e horário: a Vercel Hobby aceita
    // no máximo 12 funções, então não existe arquivo próprio para ele.
    let rdstation: Awaited<ReturnType<typeof runRdStationSync>> = [];
    let rdErro: string | undefined;
    try {
      rdstation = await runRdStationSync({
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        onlyClientId: clientId,
      });
    } catch (err) {
      rdErro = err instanceof Error ? err.message : String(err);
    }
    const hasErrors = results.some((r) => r.errors.length > 0) || rdstation.some((r) => r.errors.length > 0) || !!rdErro;
    res.status(hasErrors ? 207 : 200).json({
      synced_at: new Date().toISOString(),
      connections: results,
      rdstation,
      ...(rdErro ? { rdstation_erro: rdErro } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
