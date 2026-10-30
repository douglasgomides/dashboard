import { withApiObservability } from "../_lib/observability.js";
import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runClintSync } from "../_lib/clint-sync.js";
import { runRdStationSync } from "../_lib/rdstation-sync.js";
import { runFlwChatSync } from "../_lib/flwchat-sync.js";
import { runDigisacSync } from "../_lib/digisac-sync.js";
import { ingerirConversasClint } from "../_lib/conversas-clint.js";
import { runConferenciaCrm, type BuscarJson } from "../_lib/conferencia-crm.js";
import { runClintTags, buscarContatoClint } from "../_lib/clint-tags.js";

// Sync dos negócios da Clint, chamado pelo n8n. Máquina chamando máquina,
// então autoriza por SYNC_SECRET — o mesmo padrão de api/sync/kommo-leads.
//
// O token da Clint NÃO vive aqui: ele fica em crm_connections.access_token,
// por cliente, porque cada cliente pode ter conta própria.
//
// ?conferencia=1 roda a conferência diária (Nexo x CRM ao vivo, todos os CRMs) em vez do sync. Fica aqui e não num
// arquivo novo porque o plano da Vercel aceita no máximo 12 funções e o projeto já está no teto.
// ?tags=1 lê, em partes, as tags dos contatos da Clint (onde fica a origem de muitos leads). Mesmo motivo.

// Somente leitura: GET com timeout. Resposta que não é JSON vira corpo nulo (a conferência registra o status).
const buscarJson: BuscarJson = async (url, headers) => {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  const texto = await res.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
  return { status: res.status, corpo };
};

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

  if (req.query.conferencia === "1") {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const r = await runConferenciaCrm(supabase, buscarJson, { tokenKommoPadrao: process.env.KOMMO_API_TOKEN, onlyClientId: clientId });
      res.status(200).json({ ok: true, conferencia: r, alertas: r.filter((x) => x.alerta).length });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.query.tags === "1") {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const r = await runClintTags(supabase, buscarContatoClint, { onlyClientId: clientId, deadlineMs: startedAt + 240_000 });
      res.status(r.some((x) => x.errors.length) ? 207 : 200).json({ ok: true, tags: r });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Conversas da Clint têm rota própria (antes usavam só a sobra desta e a primeira conexão gastava tudo).
  if (req.query.conversas === "1") {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const r = await ingerirConversasClint(supabase, { onlyClientId: clientId, orcamentoMs: 240_000 - (Date.now() - startedAt) });
      // Rodada que não leu nada e ficou pela metade não é sucesso: o status mostra o problema em vez de verde.
      await recordSyncStatusPorCliente(supabase, "atendimento", r.map((x) => ({
        clientId: x.clientId,
        rows: x.conversas,
        errors: x.erros.length ? x.erros : x.parcial && x.conversas === 0 ? ["Conversas da Clint: a rodada terminou sem ler nenhuma conversa nova"] : [],
      })));
      res.status(r.some((x) => x.erros.length > 0) ? 207 : 200).json({ ok: true, clint_conversas: r });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Prazo interno de 240 s (a Vercel corta em 300 s): cada CRM recebe um limite, e o que sobrar fica para a
  // próxima hora pelo cursor de cada um. Antes só o Digisac tinha prazo e a rota chegava a 272 s.
  try {
    const results = await runClintSync({
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      onlyClientId: clientId,
      deadlineMs: startedAt + 140_000,
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
        deadlineMs: startedAt + 165_000,
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
        deadlineMs: startedAt + 205_000,
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
        deadlineMs: Math.min(Date.now() + 45_000, startedAt + 235_000),
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
    // Origem pela primeira mensagem (mensagem pronta de link) e pela etapa de paciente da casa, para todos os
    // clientes (migração 20261030200000). Falha aqui não derruba o sync.
    const { error: eOrigem } = await supabaseStatus.rpc("crm_aplicar_origem_externa", {});
    if (eOrigem) console.error("crm_aplicar_origem_externa:", eOrigem.message);
    const hasErrors =
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
