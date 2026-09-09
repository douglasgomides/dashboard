import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";
import { runInstagramSync } from "../_lib/instagram-sync.js";

// Sincronização sob demanda, disparada pelo botão dentro do dashboard.
//
// Diferente dos outros endpoints de sync, este NÃO usa o SYNC_SECRET: o
// segredo do n8n não pode viver no navegador. A autorização aqui é a sessão do
// próprio usuário — admin, ou membro do cliente que ele está olhando. É o mesmo
// padrão de api/admin/create-user.ts.
//
// Janela curta de propósito: o botão existe para "atualiza agora que eu
// publiquei", não para refazer histórico. Backfill continua sendo trabalho dos
// endpoints com secret, chamados pelo n8n.

const DIAS_DE_JANELA = 7;

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
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Sem token de autenticação" });
    return;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem.user) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const { client_id, alvo } = (req.body ?? {}) as { client_id?: string; alvo?: string };
  if (!client_id || (alvo !== "posts" && alvo !== "anuncios")) {
    res.status(400).json({ error: "Informe client_id e alvo ('posts' ou 'anuncios')" });
    return;
  }

  const { data: ehAdmin } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", quem.user.id)
    .maybeSingle();

  if (!ehAdmin) {
    const { data: ehMembro } = await admin
      .from("client_members")
      .select("user_id")
      .eq("user_id", quem.user.id)
      .eq("client_id", client_id)
      .maybeSingle();
    if (!ehMembro) {
      res.status(403).json({ error: "Sem acesso a este cliente" });
      return;
    }
  }

  try {
    if (alvo === "anuncios") {
      if (!WINDSOR_API_KEY) {
        res.status(500).json({ error: "Servidor sem WINDSOR_API_KEY configurada" });
        return;
      }
      const contas = await runMetaAdsSync({
        windsorApiKey: WINDSOR_API_KEY,
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        syncDays: DIAS_DE_JANELA,
        clientId: client_id,
      });

      if (contas.length === 0) {
        res.status(200).json({
          alvo,
          nada_a_fazer: "Este cliente não tem conta de anúncio ligada ao cadastro.",
          contas,
        });
        return;
      }
      const linhas = contas.reduce((a, c) => a + c.rows, 0);
      res.status(contas.some((c) => c.errors.length > 0) ? 207 : 200).json({ alvo, linhas, contas });
      return;
    }

    const { data: perfis, error: erroPerfis } = await admin
      .from("instagram_accounts")
      .select("id, sync_source")
      .eq("client_id", client_id)
      .eq("active", true);
    if (erroPerfis) throw new Error(erroPerfis.message);

    if (!perfis || perfis.length === 0) {
      res.status(200).json({
        alvo,
        nada_a_fazer: "Este cliente não tem perfil do Instagram conectado.",
        contas: [],
      });
      return;
    }

    // Cada perfil é atualizado pelo sync que o alimenta — ver
    // instagram_accounts.sync_source. Mandar todo mundo pra Graph API deixa
    // de fora Douglas e Doctor Creator (que vêm da Windsor e não estão na
    // Business Manager), e mandar todo mundo pra Windsor sobrescreveria com
    // dado furado quem vem da Graph API.
    const perfisGraph = perfis.filter((p) => p.sync_source === "meta_graph");
    const perfisWindsor = perfis.filter((p) => p.sync_source !== "meta_graph");

    const contas = [];

    if (perfisWindsor.length > 0) {
      if (!WINDSOR_API_KEY) {
        throw new Error("Perfil servido pela Windsor, mas WINDSOR_API_KEY não está configurada no servidor");
      }
      const parcial = await runInstagramSync({
        windsorApiKey: WINDSOR_API_KEY,
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        syncDays: 7,
        onlyClientId: client_id,
      });
      contas.push(...parcial);
    }

    if (perfisGraph.length > 0) {
      if (!META_ACCESS_TOKEN) {
        throw new Error("Perfil servido pela Meta Graph API, mas META_ACCESS_TOKEN não está configurado no servidor");
      }
      // Uma chamada por perfil: runMetaGraphSync filtra por conta, não por
      // cliente, e um cliente pode ter mais de um perfil.
      for (const perfil of perfisGraph) {
        const parcial = await runMetaGraphSync({
          accessToken: META_ACCESS_TOKEN,
          supabaseUrl: SUPABASE_URL,
          supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
          onlyAccountId: perfil.id,
          maxPages: 2,
        });
        contas.push(...parcial);
      }
    }

    const posts = contas.reduce((a, c) => a + (c.posts ?? 0), 0);
    res.status(contas.some((c) => c.errors.length > 0) ? 207 : 200).json({ alvo, posts, contas });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
