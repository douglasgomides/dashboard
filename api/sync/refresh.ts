import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { runInstagramSync } from "../_lib/instagram-sync.js";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";

// "Atualizar dados" da tela do cliente.
//
// Diferente de api/sync/instagram.ts e api/sync/meta-graph.ts, que são
// máquina-chamando-máquina e usam SYNC_SECRET, aqui quem chama é o navegador
// de uma pessoa logada. Então a autorização é a do próprio usuário: o token
// do Supabase que ele já tem, e a checagem de que ele pode ver AQUELE
// cliente. Sem isso, qualquer pessoa logada poderia disparar (e ler o
// resultado do) sync de qualquer cliente.
//
// A janela padrão é curta (7 dias) de propósito: o botão existe pra tirar a
// tela do "parou ontem", não pra refazer o histórico. Backfill continua
// sendo trabalho dos endpoints com SYNC_SECRET.

const DEFAULT_SYNC_DAYS = 7;
const MAX_SYNC_DAYS = 90;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados" });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: "Sem token de sessão" });
    return;
  }

  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : null;
  if (!clientId) {
    res.status(400).json({ error: "client_id obrigatório" });
    return;
  }

  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Quem é o usuário, segundo o Supabase — não segundo o que o navegador diz.
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Sessão inválida" });
    return;
  }
  const userId = userData.user.id;

  // Ele pode ver este cliente? Membro do cliente, ou admin da aplicação.
  const [{ data: membership }, { data: isAdmin }] = await Promise.all([
    admin.from("client_members").select("id").eq("user_id", userId).eq("client_id", clientId).maybeSingle(),
    admin.from("app_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (!membership && !isAdmin) {
    res.status(403).json({ error: "Sem acesso a este cliente" });
    return;
  }

  const requestedDays = Number(req.body?.sync_days);
  const syncDays = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_SYNC_DAYS)
    : DEFAULT_SYNC_DAYS;

  // Cada conta é atualizada pelo sync que a alimenta. Rodar o outro por cima
  // não é "atualizar mais": é trocar dado bom por dado com buraco.
  const { data: accounts, error: accountsError } = await admin
    .from("instagram_accounts")
    .select("id, sync_source")
    .eq("client_id", clientId)
    .eq("active", true);
  if (accountsError) {
    res.status(500).json({ error: accountsError.message });
    return;
  }
  if (!accounts || accounts.length === 0) {
    res.status(404).json({ error: "Este cliente não tem conta de Instagram ativa cadastrada" });
    return;
  }

  const graphAccounts = accounts.filter((a) => a.sync_source === "meta_graph");
  const windsorAccounts = accounts.filter((a) => a.sync_source !== "meta_graph");

  const errors: string[] = [];
  let postsSynced = 0;

  try {
    if (windsorAccounts.length > 0) {
      if (!WINDSOR_API_KEY) {
        errors.push("Conta servida pela Windsor, mas WINDSOR_API_KEY não está configurada no servidor");
      } else {
        const results = await runInstagramSync({
          windsorApiKey: WINDSOR_API_KEY,
          supabaseUrl: SUPABASE_URL,
          supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
          syncDays,
          onlyClientId: clientId,
        });
        for (const r of results) {
          postsSynced += r.posts;
          errors.push(...r.errors);
        }
      }
    }

    if (graphAccounts.length > 0) {
      if (!META_ACCESS_TOKEN) {
        errors.push("Conta servida pela Meta Graph API, mas META_ACCESS_TOKEN não está configurado no servidor");
      } else {
        for (const account of graphAccounts) {
          const results = await runMetaGraphSync({
            accessToken: META_ACCESS_TOKEN,
            supabaseUrl: SUPABASE_URL,
            supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
            onlyAccountId: account.id,
          });
          for (const r of results) {
            postsSynced += r.posts;
            errors.push(...r.errors);
          }
        }
      }
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  res.status(errors.length > 0 ? 207 : 200).json({
    synced_at: new Date().toISOString(),
    posts: postsSynced,
    errors,
  });
}
