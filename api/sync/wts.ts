import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { ingerirConversasWts } from "../_lib/conversas-wts.js";

// Atendimento no WhatsApp via WTS Chat.
// Roda para todo cliente ativo com wts_company_id preenchido.
// Protegido pelo mesmo SYNC_SECRET dos outros endpoints de sync.
//
// Parâmetros opcionais:
//   sync_days=7          janela móvel (padrão 7)
//   full=1               backfill completo, sem corte de data
//   client_id=           limita a um cliente
//
// O backfill completo tem teto de 400 páginas por execução (~40 mil sessões).
// Se a conta for maior que isso, chame de novo: o upsert é idempotente e a
// segunda passada só regrava o que já existe até alcançar o resto.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const WTS_API_TOKEN = process.env.WTS_API_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !WTS_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Servidor sem SYNC_SECRET/WTS_API_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados",
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
  const full = req.query.full === "1" || req.query.full === "true";
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  try {
    const results = await runWtsSync({
      wtsToken: WTS_API_TOKEN,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      syncDays,
      full,
      clientId,
    });

    await recordSyncStatusPorCliente(
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
      "atendimento",
      results.map((r) => ({ clientId: r.client_id, rows: r.sessoes, errors: r.errors })),
    );
    // Conversas: depois do sync das sessões, traz as mensagens das novas (até ~100s). Nunca derruba o sync.
    const conversas: Record<string, unknown> = {};
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const clientes = [...new Set(results.map((r) => r.client_id))];
      for (const id of clientes) {
        const c = await ingerirConversasWts(admin, WTS_API_TOKEN, id, { limite: 80, orcamentoMs: Math.floor(100_000 / Math.max(1, clientes.length)), dias: 7 });
        conversas[id] = { sessoes: c.sessoes, mensagens: c.mensagens, erros: c.erros.slice(0, 3) };
      }
    } catch (e) {
      conversas.erro = e instanceof Error ? e.message : String(e);
    }
    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), contas: results, conversas });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
