import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";
import { runInstagramSync } from "../_lib/instagram-sync.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { runMetaCommentsSync } from "../_lib/meta-comments-sync.js";

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

function temErro(r: { contas?: { errors: string[] }[] } | undefined): boolean {
  return (r?.contas ?? []).some((c) => c.errors.length > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  const WTS_API_TOKEN = process.env.WTS_API_TOKEN;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados" });
    return;
  }
  // Fixados depois da checagem: dentro das funções abaixo o TypeScript perde o
  // estreitamento de process.env e volta a tratá-los como possivelmente vazios.
  const urlSupabase: string = SUPABASE_URL;
  const chaveServico: string = SUPABASE_SERVICE_ROLE_KEY;

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
  const ALVOS = ["posts", "anuncios", "atendimento", "comentarios", "tudo"];
  if (!client_id || !alvo || !ALVOS.includes(alvo)) {
    res.status(400).json({ error: "Informe client_id e alvo ('tudo', 'posts', 'anuncios', 'atendimento' ou 'comentarios')" });
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
    async function sincronizarAnuncios() {
      if (!WINDSOR_API_KEY) throw new Error("Servidor sem WINDSOR_API_KEY configurada");
      const contas = await runMetaAdsSync({
        windsorApiKey: WINDSOR_API_KEY,
        supabaseUrl: urlSupabase,
        supabaseServiceRoleKey: chaveServico,
        syncDays: DIAS_DE_JANELA,
        clientId: client_id,
      });

      if (contas.length === 0) {
        return { nada_a_fazer: "Este cliente não tem conta de anúncio ligada ao cadastro.", contas };
      }
      return { linhas: contas.reduce((a, c) => a + c.rows, 0), contas };
    }

    async function sincronizarAtendimento() {
      if (!WTS_API_TOKEN) throw new Error("Servidor sem WTS_API_TOKEN configurado");
      const contas = await runWtsSync({
        wtsToken: WTS_API_TOKEN,
        supabaseUrl: urlSupabase,
        supabaseServiceRoleKey: chaveServico,
        syncDays: DIAS_DE_JANELA,
        clientId: client_id,
      });

      if (contas.length === 0) {
        return { nada_a_fazer: "Este cliente não tem conta da WTS ligada ao cadastro.", contas };
      }
      return { sessoes: contas.reduce((a, c) => a + c.sessoes, 0), contas };
    }

    async function sincronizarPosts() {
    const { data: perfis, error: erroPerfis } = await admin
      .from("instagram_accounts")
      .select("id, sync_source")
      .eq("client_id", client_id)
      .eq("active", true);
    if (erroPerfis) throw new Error(erroPerfis.message);

    if (!perfis || perfis.length === 0) {
      return { nada_a_fazer: "Este cliente não tem perfil do Instagram conectado.", contas: [] };
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
        supabaseUrl: urlSupabase,
        supabaseServiceRoleKey: chaveServico,
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
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          onlyAccountId: perfil.id,
          maxPages: 2,
        });
        contas.push(...parcial);
      }
    }

    return { posts: contas.reduce((a, c) => a + (c.posts ?? 0), 0), contas };
    }

    // Comentários usam o token guardado por conta em instagram_account_secrets,
    // com o do ambiente como reserva — por isso não exigem META_ACCESS_TOKEN
    // aqui, ao contrário do sync de posts pela Graph API.
    async function sincronizarComentarios() {
      // runMetaCommentsSync filtra por conta, não por cliente — mesmo padrão
      // do sync de posts pela Graph API.
      const { data: perfisCom } = await admin
        .from("instagram_accounts")
        .select("id")
        .eq("client_id", client_id)
        .eq("active", true);

      const contas = [];
      for (const perfil of perfisCom ?? []) {
        const parcial = await runMetaCommentsSync({
          accessToken: META_ACCESS_TOKEN ?? "",
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          onlyAccountId: perfil.id,
        });
        contas.push(...parcial);
      }
      if (contas.length === 0) {
        return { nada_a_fazer: "Este cliente não tem perfil do Instagram conectado.", contas };
      }
      return { comentarios: contas.reduce((a, c) => a + (c.comments ?? 0), 0), contas };
    }

    if (alvo === "anuncios") {
      const r = await sincronizarAnuncios();
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "atendimento") {
      const r = await sincronizarAtendimento();
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "comentarios") {
      const r = await sincronizarComentarios();
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "posts") {
      const r = await sincronizarPosts();
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }

    // "tudo": cada parte falha por conta própria. Cliente sem conta de anúncio
    // não pode impedir que os posts dele atualizem — por isso cada bloco é
    // capturado em separado em vez de derrubar a requisição inteira.
    const partes: Record<string, unknown> = {};
    for (const [nome, fn] of [
      ["posts", sincronizarPosts],
      ["comentarios", sincronizarComentarios],
      ["anuncios", sincronizarAnuncios],
      ["atendimento", sincronizarAtendimento],
    ] as const) {
      try {
        partes[nome] = await fn();
      } catch (err) {
        partes[nome] = { erro: err instanceof Error ? err.message : String(err) };
      }
    }
    const algumErro = Object.values(partes).some(
      (r) => (r as any)?.erro || temErro(r as any),
    );
    res.status(algumErro ? 207 : 200).json({ alvo, partes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
