import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { ingerirConversasWts } from "../_lib/conversas-wts.js";
import { analisarConversasPendentes } from "../_lib/resumo-conversa.js";

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
  const inicio = Date.now();

  // ?so_analisar=1: só a leitura por IA das conversas pendentes (sem sync), para uma 2ª chamada do n8n.
  if (req.query.so_analisar === "1") {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    let q = admin.from("conversas").select("client_id").gte("ultima_msg_em", new Date(Date.now() - 30 * 86400000).toISOString());
    if (clientId) q = q.eq("client_id", clientId);
    const { data } = await q.limit(5000);
    const clientes = [...new Set((data ?? []).map((r: { client_id: string }) => r.client_id))];
    // Clientes em paralelo (cada um com o tempo todo): antes, um de cada vez dividia os 4 minutos e o atraso não baixava.
    const orcamentoMs = Math.max(15_000, 240_000 - (Date.now() - inicio));
    const resultados = await Promise.all(clientes.map((id) => analisarConversasPendentes(admin, id, { limite: 200, orcamentoMs }).then((r) => [id, r] as const)));
    const analise: Record<string, unknown> = Object.fromEntries(resultados);
    res.status(200).json({ ok: true, analise });
    return;
  }

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
        const { data: lig } = await admin.from("crm_connections").select("access_token").eq("client_id", id).eq("provider", "flwchat").eq("active", true);
        const extras = (lig ?? []).map((l) => l.access_token as string).filter(Boolean);
        const c = await ingerirConversasWts(admin, WTS_API_TOKEN, id, { tokensExtras: extras, limite: 80, orcamentoMs: Math.floor(100_000 / Math.max(1, clientes.length)), dias: 7 });
        conversas[id] = { sessoes: c.sessoes, mensagens: c.mensagens, com_anuncio: c.comAnuncio ?? 0, campos_primeira_msg: c.valoresVistos.chaves, erros: c.erros.slice(0, 3) };
      }
    } catch (e) {
      conversas.erro = e instanceof Error ? e.message : String(e);
    }
    // Leitura por IA das conversas novas, com o tempo que sobrar da função (até ~270s no total).
    const analise: Record<string, unknown> = {};
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const clientes = [...new Set(results.map((r) => r.client_id))];
      for (const id of clientes) {
        const resta = 260_000 - (Date.now() - inicio);
        if (resta < 15_000) break;
        analise[id] = await analisarConversasPendentes(admin, id, { limite: 60, orcamentoMs: Math.floor(resta / Math.max(1, clientes.length - Object.keys(analise).length)) });
      }
    } catch (e) {
      analise.erro = e instanceof Error ? e.message : String(e);
    }
    const hasErrors = results.some((r) => r.errors.length > 0);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), contas: results, conversas, analise });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
