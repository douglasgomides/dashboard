import { withApiObservability } from "../_lib/observability.js";
import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runClintSync } from "../_lib/clint-sync.js";
import { runRdStationSync } from "../_lib/rdstation-sync.js";
import { runFlwChatSync } from "../_lib/flwchat-sync.js";
import { runDigisacSync } from "../_lib/digisac-sync.js";
import { ingerirConversasClint } from "../_lib/conversas-clint.js";

// Sync dos negócios da Clint, chamado pelo n8n. Máquina chamando máquina,
// então autoriza por SYNC_SECRET — o mesmo padrão de api/sync/kommo-leads.
//
// O token da Clint NÃO vive aqui: ele fica em crm_connections.access_token,
// por cliente, porque cada cliente pode ter conta própria.

async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
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
    // FlwChat/Synkronos (Marcella Brasil) também entra aqui, pelo mesmo motivo.
    let flwchat: Awaited<ReturnType<typeof runFlwChatSync>> = [];
    let flwErro: string | undefined;
    try {
      flwchat = await runFlwChatSync({
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        onlyClientId: clientId,
      });
    } catch (err) {
      flwErro = err instanceof Error ? err.message : String(err);
    }
    // Digisac (IGM Palmas) entra aqui também, pelo mesmo motivo do limite de 12 funções.
    let digisac: Awaited<ReturnType<typeof runDigisacSync>> = [];
    let digErro: string | undefined;
    try {
      digisac = await runDigisacSync({
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        onlyClientId: clientId,
        deadlineMs: Date.now() + 45_000,
      });
    } catch (err) {
      digErro = err instanceof Error ? err.message : String(err);
    }
    // O status de CRM também precisa existir para quem sincroniza por aqui (FlwChat e RD Station). Sem isso o painel
    // mostrava "nenhuma tentativa" para Mariela, Sergio e Juliana Paola, mesmo com o sync rodando todo dia.
    const supabaseStatus = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await recordSyncStatusPorCliente(supabaseStatus, "crm", flwchat.map((r) => ({ clientId: r.clientId, rows: r.cards, errors: r.errors })));
    await recordSyncStatusPorCliente(supabaseStatus, "crm", digisac.map((r) => ({ clientId: r.clientId, rows: r.contatos, errors: r.errors })));
    await recordSyncStatusPorCliente(supabaseStatus, "atendimento", digisac.map((r) => ({ clientId: r.clientId, rows: r.atendimentos, errors: r.errors })));
    await recordSyncStatusPorCliente(supabaseStatus, "crm", rdstation.map((r) => ({ clientId: r.clientId, rows: r.negocios, errors: r.errors })));
    // Conversas usam apenas o tempo restante, depois dos provedores já atendidos
    // por este endpoint. O cursor permite continuar na próxima rodada.
    const clintConversas = await ingerirConversasClint(supabaseStatus, {
      onlyClientId: clientId,
      orcamentoMs: Math.max(1, Math.min(110_000, 270_000 - (Date.now() - startedAt))),
    });
    const hasErrors =
      clintConversas.some((r) => r.erros.length > 0 || r.parcial) ||
      results.some((r) => r.errors.length > 0) ||
      rdstation.some((r) => r.errors.length > 0) ||
      flwchat.some((r) => r.errors.length > 0) ||
      digisac.some((r) => r.errors.length > 0) ||
      !!rdErro ||
      !!flwErro ||
      !!digErro;
    res.status(hasErrors ? 207 : 200).json({
      synced_at: new Date().toISOString(),
      connections: results,
      clint_conversas: clintConversas,
      rdstation,
      flwchat,
      digisac,
      ...(digErro ? { digisac_erro: digErro } : {}),
      ...(rdErro ? { rdstation_erro: rdErro } : {}),
      ...(flwErro ? { flwchat_erro: flwErro } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export default withApiObservability(handler, "sync/clint");
