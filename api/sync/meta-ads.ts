import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";
import { runMetaAdsGraphSync } from "../_lib/meta-ads-graph-sync.js";

// Gasto de mídia do Meta, por dia e por campanha, via Windsor.
// Roda para todo cliente ativo com meta_ad_account_id preenchido.
// Protegido pelo mesmo SYNC_SECRET dos outros endpoints de sync.
//
// Parâmetros opcionais:
//   sync_days=7          janela móvel (padrão 7 — a Meta revisa dias recentes)
//   from=&to=            janela exata, para backfill em pedaços
//   client_id=           limita a um cliente
//   fonte=graph          lê direto da Marketing API da Meta (oficial)
//   fonte=windsor        caminho antigo, via Windsor (padrão por enquanto)
//
// O caminho "graph" existe porque dado oficial vem completo — mesmo motivo
// que levou o Instagram a sair da Windsor. Ele lê as contas de
// client_ad_accounts, que aceita mais de uma por cliente; a Windsor lia
// clients.meta_ad_account_id, que é uma coluna só.
//
// O padrão continua windsor de propósito: trocar a fonte de todo mundo de uma
// vez, sem comparar os números lado a lado antes, é o tipo de mudança que
// altera relatório de cliente sem ninguém perceber.

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
  // Piso de 30 dias: a rotina diária chamava com 7, e qualquer falha de mais de uma
// semana (ou conta recém-ligada) deixava buraco no histórico para sempre.
const PISO_DIAS_ANUNCIOS = 30;
  const syncDays = Math.max(syncDaysParam && Number.isFinite(syncDaysParam) ? syncDaysParam : 0, PISO_DIAS_ANUNCIOS);
  const dateFrom = typeof req.query.from === "string" ? req.query.from : undefined;
  const dateTo = typeof req.query.to === "string" ? req.query.to : undefined;
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;

  const fonte = typeof req.query.fonte === "string" ? req.query.fonte : "ambas";

  // Sem `fonte`, o endpoint roda as DUAS vias: Windsor (uma conta por cliente,
  // clients.meta_ad_account_id) e Graph (contas em client_ad_accounts, token por
  // conta). Antes o padrão era só Windsor, e as contas lidas direto da Meta
  // (HOMS, Sergio, Antônio, Ana Claudia) só atualizavam no clique do botão.
  const urlSb: string = SUPABASE_URL;
  const chaveSb: string = SUPABASE_SERVICE_ROLE_KEY;
  async function rodarGraph() {
    const contas = await runMetaAdsGraphSync({
      accessToken: process.env.META_ADS_TOKEN,
      supabaseUrl: urlSb,
      supabaseServiceRoleKey: chaveSb,
      syncDays,
      dateFrom,
      dateTo,
      clientId,
    });
    await recordSyncStatusPorCliente(
      createClient(urlSb, chaveSb, { auth: { persistSession: false, autoRefreshToken: false } }),
      "anuncios",
      contas.map((c) => ({ clientId: c.client_id, rows: c.rows, errors: c.errors })),
      { okSeHouveLinhas: true },
    );
    return contas;
  }

  if (fonte === "graph") {
    // Token separado do META_ACCESS_TOKEN de propósito.
    //
    // O token do Instagram NÃO tem ads_read — testado em 10/09/2026 e a Meta
    // devolveu 403 "(#200) Ad account owner has NOT grant ads_management or
    // ads_read permission" nas cinco contas, incluindo as três que já rodam há
    // meses pela Windsor. Ou seja, a dependência da Windsor para mídia nunca
    // foi decisão de arquitetura: era consequência do escopo do token.
    //
    // Manter separado evita que regenerar o token de mídia derrube a leitura
    // de conteúdo. NÃO cai mais no META_ACCESS_TOKEN: o token do Instagram não
    // tem ads_read e só gerava 403. Agora o token vem POR CONTA
    // (client_ad_accounts.access_token) — cada médico numa BM diferente — e o
    // META_ADS_TOKEN global é só reserva para contas sem token próprio, então
    // pode nem existir.
    const TOKEN_ADS = process.env.META_ADS_TOKEN;
    try {
      const contas = await runMetaAdsGraphSync({
        accessToken: TOKEN_ADS,
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        syncDays,
        dateFrom,
        dateTo,
        clientId,
      });
      await recordSyncStatusPorCliente(
        createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
        "anuncios",
        contas.map((c) => ({ clientId: c.client_id, rows: c.rows, errors: c.errors })),
        { okSeHouveLinhas: true },
      );
      const temErro = contas.some((c) => c.errors.length > 0);
      res.status(temErro ? 207 : 200).json({ fonte: "graph", synced_at: new Date().toISOString(), contas });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

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

    await recordSyncStatusPorCliente(
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
      "anuncios",
      // Só o que a Windsor efetivamente entregou: o erro dela sobre contas que
      // a Graph alimenta é esperado e apagaria o sucesso registrado pela Graph.
      results.filter((r) => r.rows > 0).map((r) => ({ clientId: r.clientId, rows: r.rows, errors: [] })),
    );
    let graph: unknown = undefined;
    let graphComErro = false;
    if (fonte === "ambas") {
      try {
        const contasGraph = await rodarGraph();
        graph = contasGraph;
        graphComErro = contasGraph.some((c) => c.errors.length > 0);
      } catch (err) {
        graph = { erro: err instanceof Error ? err.message : String(err) };
        graphComErro = true;
      }
    }
    const hasErrors = results.some((r) => r.errors.length > 0) || graphComErro;
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), accounts: results, ...(graph !== undefined ? { graph } : {}) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
