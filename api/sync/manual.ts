import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";
import { runMetaAdsGraphSync } from "../_lib/meta-ads-graph-sync.js";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";
import { runInstagramSync } from "../_lib/instagram-sync.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { runMetaCommentsSync } from "../_lib/meta-comments-sync.js";
import { runKommoLeadsSync } from "../_lib/kommo-leads-sync.js";
import { runClintSync } from "../_lib/clint-sync.js";
import { runRdStationSync } from "../_lib/rdstation-sync.js";
import { runFlwChatSync } from "../_lib/flwchat-sync.js";
import { lerAudiencia } from "../_lib/meta-audiencia.js";
import { classificarConteudoComIA } from "../_lib/conteudo-ia.js";
import { ingerirConversasWts } from "../_lib/conversas-wts.js";
import { criarLinkShort, cliquesDoLink, destinoWhatsApp, novoCodigoRef } from "../_lib/shortio.js";
import { recordSyncStatus, erroCurto, lerDadosAte, type FonteSync } from "../_lib/sync-status.js";

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
// Anúncios reconferem 90 dias a cada clique (upsert, então não duplica). É o que
// fecha buracos sozinho: conta recém-ligada, dia que a Meta revisou depois, sync
// que falhou. Posts e comentários seguem na janela curta, porque a Meta Graph
// cobra uma chamada por página.
const DIAS_DE_ANUNCIOS = 90;

// O alvo do botão (posts) e a fonte do registro (instagram) têm nomes diferentes.
const FONTE_DO_ALVO: Record<string, FonteSync> = {
  posts: "instagram",
  historico: "instagram",
  comentarios: "comentarios",
  anuncios: "anuncios",
  atendimento: "atendimento",
  crm: "crm",
};

function temErro(r: { ok?: boolean; contas?: { errors: string[] }[] } | undefined): boolean {
  return r?.ok === false || (r?.contas ?? []).some((c) => c.errors.length > 0);
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
  const ALVOS = ["posts", "anuncios", "atendimento", "comentarios", "crm", "historico", "tudo", "audiencia", "classificar", "link_rastreado", "links_stats", "jornada", "sonda_conversas", "conversas"];
  if (!client_id || !alvo || !ALVOS.includes(alvo)) {
    res.status(400).json({ error: "Informe client_id e alvo ('tudo', 'posts', 'anuncios', 'atendimento', 'comentarios' ou 'crm')" });
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
      // Anúncios vêm de DUAS fontes: a Graph API (token próprio, contas em
      // client_ad_accounts — ex.: Dr. Sergio) e a Windsor. Cada conta é
      // preenchida pela sua fonte; o erro da outra fonte sobre a mesma conta é
      // esperado. Rodamos as duas e olhamos só o que entrou — igual ao endpoint
      // automático (api/sync/meta-ads.ts). Antes só o Windsor rodava aqui, e
      // clientes da Graph apareciam como "sem conta de anúncio ligada".
      // Graph roda SEMPRE: cada conta tem o seu token em
      // client_ad_accounts.access_token (médicos em BMs diferentes). O
      // META_ADS_TOKEN global virou só reserva e pode nem existir — não usamos
      // mais o META_ACCESS_TOKEN do Instagram aqui (não tem ads_read).
      const TOKEN_ADS = process.env.META_ADS_TOKEN;
      let linhas = 0;
      let temConta = false;
      let graphTemConta = false;
      const erros: string[] = [];

      {
        const g = await runMetaAdsGraphSync({
          accessToken: TOKEN_ADS,
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          syncDays: DIAS_DE_ANUNCIOS,
          clientId: client_id,
        });
        if (g.length > 0) temConta = true;
        linhas += g.reduce((a, c) => a + c.rows, 0);
        // Erro da Graph é sempre real: a conta está cadastrada para ela.
        erros.push(...g.flatMap((c) => c.errors));
        graphTemConta = g.length > 0;
      }

      if (WINDSOR_API_KEY) {
        const w = await runMetaAdsSync({
          windsorApiKey: WINDSOR_API_KEY,
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          syncDays: DIAS_DE_ANUNCIOS,
          clientId: client_id,
        });
        if (w.length > 0) temConta = true;
        linhas += w.reduce((a, c) => a + c.rows, 0);
        // Erro da Windsor só vale quando a Graph não serve este cliente; do
        // contrário é o ruído esperado de conta que a Windsor não enxerga.
        if (!graphTemConta) erros.push(...w.flatMap((c) => c.errors));
      }

      if (!temConta) {
        return { nada_a_fazer: "Este cliente não tem conta de anúncio ligada ao cadastro." };
      }
      return { linhas, erros };
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

    // runInstagramSync grava as métricas DIÁRIAS (alcance, seguidores) de todas as contas
    // ativas do cliente e os posts só das que vêm da Windsor. A Graph API não grava
    // essa tabela, então sem esta chamada o botão deixava a Visão geral e o Conteúdo
    // sem dado para quem lê os posts pela Graph.
    if (perfisWindsor.length > 0 || (perfisGraph.length > 0 && WINDSOR_API_KEY)) {
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

      // O botão lê o perfil INTEIRO: repete rodadas de 150 posts até o backfill
      // terminar (done) ou o tempo acabar. Antes era uma rodada de 30 por clique, e
      // uma conta com 355 posts (Dra. Betina) levava ~12 cliques para ter as Dúvidas.
      const prazo = Date.now() + 40_000;
      const contas = [];
      for (const perfil of perfisCom ?? []) {
        for (let rodada = 0; rodada < 20; rodada++) {
          const parcial = await runMetaCommentsSync({
            accessToken: META_ACCESS_TOKEN ?? "",
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            onlyAccountId: perfil.id,
            maxPosts: 150,
          });
          contas.push(...parcial);
          const ultima = parcial[parcial.length - 1];
          if (!ultima || ultima.done || ultima.errors.length > 0 || Date.now() > prazo) break;
        }
      }
      if (contas.length === 0) {
        return { nada_a_fazer: "Este cliente não tem perfil do Instagram conectado.", contas };
      }
      return { comentarios: contas.reduce((a, c) => a + (c.comments ?? 0), 0), contas };
    }

    // CRM: Kommo e Clint do cliente, janela curta. Planilha é dado estático
    // (importado à mão) — não há o que sincronizar, e dizer isso é melhor que
    // fingir que atualizou.
    async function sincronizarCrm() {
      const { data: conexoes, error: erroCon } = await admin
        .from("crm_connections")
        .select("id, provider, subdomain, access_token")
        .eq("client_id", client_id)
        .eq("active", true);
      if (erroCon) throw new Error(erroCon.message);

      // Kommo sem endereço = CRM lançado à mão (ex.: relatório em PDF). Não tem de onde puxar.
      const kommo = (conexoes ?? []).filter((c) => c.provider === "kommo" && c.subdomain);
      const kommoManual = (conexoes ?? []).filter((c) => c.provider === "kommo" && !c.subdomain);
      const clint = (conexoes ?? []).filter((c) => c.provider === "clint");
      const rdstation = (conexoes ?? []).filter((c) => c.provider === "rdstation");
      const flwchat = (conexoes ?? []).filter((c) => c.provider === "flwchat");
      const planilha = (conexoes ?? []).filter((c) => c.provider === "planilha");

      if (kommo.length === 0 && clint.length === 0 && rdstation.length === 0 && flwchat.length === 0) {
        // CRM que a equipe da cliente não liberou: o dado chega por planilha/relatório exportado e é lançado
        // à mão. Grava o motivo para o painel dizer isso, em vez de parecer falha de sincronização.
        if (kommoManual.length > 0 || planilha.length > 0) {
          try {
            await admin.from("sync_status").upsert(
              {
                client_id: client_id as string,
                fonte: "crm",
                motivo:
                  "A equipe da cliente não liberou acesso ao CRM e envia só uma planilha exportada dele, que é lançada à mão aqui. O dado só avança quando chega uma planilha nova. Não é falha de sincronização.",
                motivo_dono: "cliente",
                motivo_em: new Date().toISOString(),
              } as never,
              { onConflict: "client_id,fonte" },
            );
          } catch {
            /* a coluna pode ainda não existir; o aviso é um extra */
          }
        }
        if (kommoManual.length > 0) {
          return {
            nada_a_fazer: "CRM lançado à mão (planilha exportada pela equipe da cliente), sem acesso ao CRM para sincronizar.",
            linhas: 0,
            erros: [] as string[],
          };
        }
        return planilha.length > 0
          ? { nada_a_fazer: "CRM por planilha, não sincroniza.", linhas: 0, erros: [] as string[] }
          : { nada_a_fazer: "Este cliente não tem CRM ligado ao cadastro.", linhas: 0, erros: [] as string[] };
      }

      let linhas = 0;
      const erros: string[] = [];

      for (const conn of kommo) {
        const tokenKommo = conn.access_token || process.env.KOMMO_API_TOKEN;
        if (!conn.subdomain) {
          erros.push("Kommo: conexão sem subdomínio configurado");
          continue;
        }
        if (!tokenKommo) {
          erros.push("Kommo: conexão sem token e servidor sem KOMMO_API_TOKEN");
          continue;
        }
        try {
          const r = await runKommoLeadsSync({
            accessToken: tokenKommo,
            kommoDomain: conn.subdomain.includes(".") ? conn.subdomain : `${conn.subdomain}.kommo.com`,
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            crmConnectionId: conn.id,
            clientId: client_id as string,
            maxPages: 3,
          });
          linhas += r.leadsUpserted;
          erros.push(...r.errors.map((e) => `Kommo: ${e}`));
        } catch (err) {
          erros.push(`Kommo: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (clint.length > 0) {
        try {
          // 50s: a função tem ~60s de teto e a Clint não filtra por data.
          const r = await runClintSync({
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            onlyClientId: client_id,
            deadlineMs: Date.now() + 50_000,
          });
          linhas += r.reduce((a, c) => a + c.negocios, 0);
          erros.push(...r.flatMap((c) => c.errors.map((e) => `Clint: ${e}`)));
        } catch (err) {
          erros.push(`Clint: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (rdstation.length > 0) {
        try {
          const r = await runRdStationSync({
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            onlyClientId: client_id,
            deadlineMs: Date.now() + 50_000,
          });
          linhas += r.reduce((a, c) => a + c.negocios, 0);
          erros.push(...r.flatMap((c) => c.errors.map((e) => `RD Station: ${e}`)));
        } catch (err) {
          erros.push(`RD Station: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (flwchat.length > 0) {
        try {
          const r = await runFlwChatSync({
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            onlyClientId: client_id,
            deadlineMs: Date.now() + 50_000,
          });
          linhas += r.reduce((a, c) => a + c.cards, 0);
          erros.push(...r.flatMap((c) => c.errors.map((e) => `FlwChat: ${e}`)));
        } catch (err) {
          erros.push(`FlwChat: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { linhas, erros };
    }

    // Cada parte devolve o formato antigo MAIS o resumo honesto: ok, linhas,
    // erro e dados_ate (frescura lida do DADO depois do sync, não da tentativa).
    // Também deixa o resultado registrado em sync_status.
    async function executar(nome: string, fn: () => Promise<any>) {
      const fonte = FONTE_DO_ALVO[nome];
      let r: any;
      try {
        r = await fn();
      } catch (err) {
        const msg = erroCurto(err instanceof Error ? err.message : String(err)) ?? "erro desconhecido";
        await recordSyncStatus(admin, client_id as string, fonte, { ok: false, error: msg });
        throw Object.assign(new Error(msg), { registrado: true });
      }
      const errosLista: string[] = [
        ...(r?.erros ?? []),
        ...(r?.contas ?? []).flatMap((c: { errors?: string[] }) => c.errors ?? []),
      ];
      const erro = erroCurto(errosLista[0]);
      const linhas: number = r?.linhas ?? r?.posts ?? r?.comentarios ?? r?.sessoes ?? 0;
      if (r?.nada_a_fazer) {
        return { ...r, ok: true, linhas: 0, erro: null, dados_ate: await lerDadosAte(admin, client_id as string, fonte) };
      }
      const ok = errosLista.length === 0;
      const dadosAte = await lerDadosAte(admin, client_id as string, fonte);
      await recordSyncStatus(admin, client_id as string, fonte, {
        ok,
        rows: linhas,
        error: erro,
        dataAte: dadosAte,
      });
      return { ...r, ok, linhas, erro, dados_ate: dadosAte };
    }

    // Audiência (demografia, origem, horários, stories no ar): leitura ao vivo da Meta, nada é gravado.
    // Guarda 20 minutos na memória da função para não repetir ~15 chamadas à Meta a cada abertura da tela.
    if (alvo === "audiencia") {
      const memoria: Map<string, { t: number; d: unknown }> = ((globalThis as any).__audienciaCache ??= new Map());
      const guardado = memoria.get(client_id);
      if (guardado && Date.now() - guardado.t < 20 * 60_000) {
        res.status(200).json({ alvo, ok: true, dados: guardado.d, do_cache: true });
        return;
      }
      const { data: contasIg, error: erroIg } = await admin
        .from("instagram_accounts")
        .select("id, windsor_account_id, sync_source")
        .eq("client_id", client_id)
        .eq("active", true);
      if (erroIg) throw new Error(erroIg.message);
      const conta = (contasIg ?? []).find((c) => c.sync_source === "meta_graph" && c.windsor_account_id);
      if (!conta) {
        res.status(200).json({ alvo, ok: true, nada_a_fazer: "Este cliente não tem Instagram ligado pela Meta com token próprio, então a audiência detalhada não está disponível." });
        return;
      }
      const { data: segredo } = await admin.from("instagram_account_secrets").select("meta_access_token").eq("instagram_account_id", conta.id).maybeSingle();
      const tokenIg = segredo?.meta_access_token ?? META_ACCESS_TOKEN;
      if (!tokenIg) {
        res.status(200).json({ alvo, ok: false, erro: "Instagram sem token da Meta configurado." });
        return;
      }
      const dados = await lerAudiencia({ igId: conta.windsor_account_id as string, token: tokenIg });
      memoria.set(client_id, { t: Date.now(), d: dados });
      res.status(200).json({ alvo, ok: true, dados });
      return;
    }

    // ---- Conversas do WhatsApp (WTS): grava mensagens, pessoa e toque. Só admin: é dado de paciente. ----
    if (alvo === "conversas") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin ingere conversas" });
        return;
      }
      if (!WTS_API_TOKEN) {
        res.status(200).json({ alvo, ok: false, erro: "Servidor sem WTS_API_TOKEN configurado" });
        return;
      }
      const b = (req.body ?? {}) as { limite?: number; dias?: number; refazer?: boolean };
      const { data: ligacoes } = await admin.from("crm_connections").select("access_token").eq("client_id", client_id).eq("provider", "flwchat").eq("active", true);
      const extras = (ligacoes ?? []).map((l) => l.access_token as string).filter(Boolean);
      const r = await ingerirConversasWts(admin, WTS_API_TOKEN, client_id as string, { limite: Math.min(Number(b.limite) || 120, 300), dias: b.dias, refazer: !!b.refazer, tokensExtras: extras, orcamentoMs: 200_000 });
      res.status(r.erros.length ? 207 : 200).json({ alvo, ok: r.erros.length === 0, ...r, erros: r.erros.slice(0, 8) });
      return;
    }

    // ---- Sonda de conversas (só admin): testa endpoints de cada CRM e devolve apenas a ESTRUTURA, nunca dados ----
    if (alvo === "sonda_conversas") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin" });
        return;
      }
      const forma = (v: any, d = 0): any =>
        v == null ? null : Array.isArray(v) ? [forma(v[0], d + 1)] : typeof v === "object" ? (d > 4 ? "{…}" : Object.fromEntries(Object.keys(v).slice(0, 60).map((k) => [k, forma(v[k], d + 1)]))) : typeof v;
      const tentar = async (base: string, caminho: string, cab: Record<string, string>) => {
        try {
          const r = await fetch(`${base}${caminho}`, { headers: { Accept: "application/json", ...cab }, signal: AbortSignal.timeout(15_000) });
          const t = await r.text();
          let j: any = null;
          try { j = JSON.parse(t); } catch { /* não é JSON */ }
          return { status: r.status, forma: j ? forma(j) : t.slice(0, 80) };
        } catch (e) {
          return { status: 0, forma: e instanceof Error ? e.message.slice(0, 80) : "erro" };
        }
      };
      const saida: Record<string, unknown> = {};

      // WTS Chat (token do servidor) e FlwChat (token da conexão): mesma API, api.wts.chat
      const { data: sess } = await admin.from("wts_sessions").select("session_id, contact_id").eq("client_id", client_id).not("contact_id", "is", null).order("started_at", { ascending: false }).limit(25);
      if ((sess ?? []).length > 0 && WTS_API_TOKEN) {
        const cab = { Authorization: `Bearer ${WTS_API_TOKEN}` };
        const base = "https://api.wts.chat";
        // Procura uma sessão que tenha mensagens e mostra a forma da sessão, da mensagem e do contato.
        let achou = false;
        for (const s0 of sess ?? []) {
          const m = await tentar(base, `/chat/v1/session/${s0.session_id}/message?PageSize=3`, cab);
          const itens = (m.forma as any)?.items;
          if (m.status === 200 && Array.isArray(itens) && itens[0]) {
            saida["wts mensagem (forma)"] = m;
            saida["wts sessão (forma)"] = await tentar(base, `/chat/v1/session/${s0.session_id}`, cab);
            saida["wts contato /core/v1/contact/{id}"] = await tentar(base, `/core/v1/contact/${s0.contact_id}`, cab);
            achou = true;
            break;
          }
        }
        saida["wts achou sessão com mensagens"] = achou;
      }

      // Kommo: notas, eventos e contatos (telefone) de um lead de exemplo
      const { data: conn } = await admin.from("crm_connections").select("provider, subdomain, access_token").eq("client_id", client_id).eq("active", true);
      const k = (conn ?? []).find((c) => c.provider === "kommo" && c.subdomain && c.access_token);
      if (k) {
        const dom = (k.subdomain as string).includes(".") ? (k.subdomain as string) : `${k.subdomain}.kommo.com`;
        const cab = { Authorization: `Bearer ${k.access_token}` };
        const base = `https://${dom}`;
        const lead = await tentar(base, "/api/v4/leads?limit=1&with=contacts", cab);
        saida["kommo lead?with=contacts (forma)"] = lead;
        const { data: l1 } = await admin.from("crm_leads").select("external_lead_id").eq("client_id", client_id).eq("provider", "kommo").order("received_at", { ascending: false }).limit(1);
        const lid = l1?.[0]?.external_lead_id;
        if (lid) {
          const tipos = async (caminho: string, chave: string) => {
            try {
              const r = await fetch(`${base}${caminho}`, { headers: { Accept: "application/json", ...cab }, signal: AbortSignal.timeout(15_000) });
              const j: any = await r.json().catch(() => ({}));
              const itens: any[] = j?._embedded?.[chave] ?? [];
              const cont: Record<string, number> = {};
              for (const i of itens) cont[String(i.note_type ?? i.type ?? "?")] = (cont[String(i.note_type ?? i.type ?? "?")] ?? 0) + 1;
              return { status: r.status, tipos: cont, exemplo: forma(itens[0]) };
            } catch (e) { return { status: 0, erro: e instanceof Error ? e.message.slice(0, 60) : "erro" }; }
          };
          saida["kommo notas (tipos + forma)"] = await tipos(`/api/v4/leads/${lid}/notes?limit=50`, "notes");
          saida["kommo eventos do lead (tipos + forma)"] = await tipos(`/api/v4/events?limit=50&filter[entity][]=lead&filter[entity_id][]=${lid}`, "events");
          saida["kommo /api/v4/talks (forma)"] = await tentar(base, `/api/v4/talks?limit=2`, cab);
        }
        saida["kommo contato (forma)"] = await tentar(base, "/api/v4/contacts?limit=1", cab);
      }

      // FlwChat: token por conexão
      const f = (conn ?? []).find((c) => c.provider === "flwchat" && c.access_token);
      if (f) {
        const cab = { Authorization: `Bearer ${f.access_token}` };
        saida["flwchat /core/v1/contact?PageSize=1"] = await tentar("https://api.wts.chat", "/core/v1/contact?PageSize=1", cab);
        saida["flwchat /chat/v1/session?PageSize=1"] = await tentar("https://api.wts.chat", "/chat/v1/session?PageSize=1", cab);
      }
      res.status(200).json({ alvo, ok: true, conexoes: (conn ?? []).map((c) => c.provider), sonda: saida });
      return;
    }

    // ---- Jornada: links rastreados (short.gy), cliques e vínculo pessoa <-> lead ----
    if (alvo === "jornada") {
      const { data: ligados, error: erroRpc } = await admin.rpc("vincular_pessoas", { p_client: client_id });
      if (erroRpc) {
        res.status(200).json({ alvo, ok: false, erro: `vincular_pessoas: ${erroRpc.message}` });
        return;
      }
      res.status(200).json({ alvo, ok: true, leads_ligados: ligados ?? 0 });
      return;
    }

    if (alvo === "link_rastreado" || alvo === "links_stats") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin cria e atualiza links rastreados" });
        return;
      }
      const chaveShort = process.env.SHORTIO_API_KEY;
      const dominioShort = process.env.SHORTIO_DOMAIN;
      if (!chaveShort || !dominioShort) {
        res.status(200).json({ alvo, ok: false, erro: "Servidor sem SHORTIO_API_KEY e SHORTIO_DOMAIN configurados na Vercel." });
        return;
      }

      if (alvo === "links_stats") {
        const { data: links } = await admin.from("links_rastreados").select("id, shortio_id").eq("client_id", client_id).not("shortio_id", "is", null);
        let atualizados = 0;
        for (const l of links ?? []) {
          const n = await cliquesDoLink(chaveShort, l.shortio_id as string);
          if (n == null) continue;
          await admin.from("links_rastreados").update({ cliques_total: n, cliques_atualizado_em: new Date().toISOString() }).eq("id", l.id);
          atualizados++;
        }
        res.status(200).json({ alvo, ok: true, atualizados, total: (links ?? []).length });
        return;
      }

      const b = (req.body ?? {}) as {
        tipo?: string; titulo?: string; numero_whatsapp?: string; mensagem?: string; instagram_post_id?: string | null; ad_campaign_id?: string | null;
      };
      const tipos = ["bio", "post", "story", "anuncio", "email", "outro"];
      if (!b.tipo || !tipos.includes(b.tipo) || !b.numero_whatsapp || !b.mensagem) {
        res.status(400).json({ error: "Informe tipo (bio, post, story, anuncio, email ou outro), numero_whatsapp e mensagem" });
        return;
      }
      const codigo = novoCodigoRef();
      const destino = destinoWhatsApp(b.numero_whatsapp, b.mensagem, codigo);
      const curto = await criarLinkShort({ chave: chaveShort, dominio: dominioShort, destino, titulo: b.titulo, tags: [b.tipo, codigo] });
      const { data: criado, error: erroIns } = await admin
        .from("links_rastreados")
        .insert({
          client_id,
          codigo_ref: codigo,
          tipo: b.tipo,
          instagram_post_id: b.instagram_post_id ?? null,
          ad_campaign_id: b.ad_campaign_id ?? null,
          titulo: b.titulo ?? null,
          destino_url: destino,
          mensagem_modelo: b.mensagem,
          shortio_id: curto.id,
          short_url: curto.shortUrl,
          criado_por: quem.user.id,
        } as never)
        .select("id")
        .single();
      if (erroIns) {
        res.status(200).json({ alvo, ok: false, erro: `Link criado no short.gy (${curto.shortUrl}) mas não gravado: ${erroIns.message}` });
        return;
      }
      res.status(200).json({ alvo, ok: true, id: criado?.id, codigo_ref: codigo, short_url: curto.shortUrl });
      return;
    }

    if (alvo === "classificar") {
      // Classificação por IA (tema, funil C0 a C3, estágio) sob demanda. Com refazer=true reclassifica o funil
      // de todos os posts, em blocos: repita com antes_de = "proximo" da resposta até vir proximo null.
      // Reclassificar sobrescreve o funil existente, então só admin.
      const { refazer, antes_de } = (req.body ?? {}) as { refazer?: boolean; antes_de?: string | null };
      if (refazer && !ehAdmin) {
        res.status(403).json({ error: "Só admin pode reclassificar o funil de todos os posts" });
        return;
      }
      const { data: contas } = await admin.from("instagram_accounts").select("id").eq("client_id", client_id).eq("active", true);
      if (!contas || contas.length === 0) {
        res.status(200).json({ alvo, ok: true, nada_a_fazer: "Este cliente não tem Instagram ligado." });
        return;
      }
      let count = 0;
      let proximo: string | null = null;
      const erros: string[] = [];
      let pulado: string | undefined;
      for (const c of contas) {
        const r = await classificarConteudoComIA(admin, c.id, { maxPosts: 400, orcamentoMs: 200_000, refazerFunil: !!refazer, antesDe: antes_de ?? null });
        count += r.count;
        erros.push(...r.errors);
        pulado = pulado ?? r.pulado;
        if (r.proximo && (!proximo || r.proximo < proximo)) proximo = r.proximo;
      }
      res.status(erros.length ? 207 : 200).json({ alvo, ok: erros.length === 0, classificados: count, proximo, erros, pulado });
      return;
    }

    if (alvo === "anuncios") {
      const r = await executar("anuncios", sincronizarAnuncios);
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "atendimento") {
      const r = await executar("atendimento", sincronizarAtendimento);
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "comentarios") {
      const r = await executar("comentarios", sincronizarComentarios);
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "historico") {
      // Completa o histórico diário (alcance, seguidores novos, interações) do Instagram.
      // O sync normal só traz os últimos dias; sem isso, "Últimos 90 dias", "6 meses" e
      // "Último ano" mostram o mesmo total, porque não há dia mais antigo gravado. Só
      // admin: puxa um ano inteiro da Windsor e leva alguns minutos.
      if (!ehAdmin) {
        res.status(403).json({ error: "Só a equipe Doctor Creator pode completar o histórico." });
        return;
      }
      if (!WINDSOR_API_KEY) {
        res.status(500).json({ error: "WINDSOR_API_KEY não está configurada no servidor" });
        return;
      }
      const r = await executar("posts", async () => {
        const contas = await runInstagramSync({
          windsorApiKey: WINDSOR_API_KEY,
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          syncDays: 365,
          onlyClientId: client_id,
        });
        if (contas.length === 0) {
          return { nada_a_fazer: "Este cliente não tem perfil do Instagram conectado.", contas: [] };
        }
        return {
          posts: contas.reduce((a, c) => a + (c.dailyMetrics ?? 0), 0),
          contas,
        };
      });
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "posts") {
      const r = await executar("posts", sincronizarPosts);
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }
    if (alvo === "crm") {
      const r = await executar("crm", sincronizarCrm);
      res.status(temErro(r) ? 207 : 200).json({ alvo, ...r });
      return;
    }

    // "tudo": cada parte falha por conta própria. Cliente sem conta de anúncio
    // não pode impedir que os posts dele atualizem — por isso cada bloco é
    // capturado em separado em vez de derrubar a requisição inteira.
    //
    // Em paralelo: a função tem ~60s de teto e cinco partes em fila (posts da
    // Graph, comentários, anúncios, WTS e agora CRM) somavam mais que isso.
    // Partes tocam serviços diferentes e não dependem umas das outras.
    const partes: Record<string, unknown> = {};
    await Promise.all(
      (
        [
          ["posts", sincronizarPosts],
          ["comentarios", sincronizarComentarios],
          ["anuncios", sincronizarAnuncios],
          ["atendimento", sincronizarAtendimento],
          ["crm", sincronizarCrm],
        ] as const
      ).map(async ([nome, fn]) => {
        try {
          partes[nome] = await executar(nome, fn);
        } catch (err) {
          partes[nome] = {
            ok: false,
            linhas: 0,
            erro: err instanceof Error ? err.message : String(err),
            dados_ate: null,
          };
        }
      }),
    );
    const algumErro = Object.values(partes).some(
      (r) => (r as any)?.ok === false || (r as any)?.erro || temErro(r as any),
    );
    res.status(algumErro ? 207 : 200).json({ alvo, partes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
