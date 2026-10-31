import { withApiObservability } from "../_lib/observability.js";
import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runMetaAdsSync } from "../_lib/meta-ads-sync.js";
import { runMetaAdsGraphSync } from "../_lib/meta-ads-graph-sync.js";
import { runAdsPlanilhaSync } from "../_lib/ads-planilha-sync.js";
import { runMetaGraphSync } from "../_lib/meta-graph-sync.js";
import { runInstagramSync } from "../_lib/instagram-sync.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { runMetaCommentsSync } from "../_lib/meta-comments-sync.js";
import { runKommoLeadsSync } from "../_lib/kommo-leads-sync.js";
import { runClintSync } from "../_lib/clint-sync.js";
import { runRdStationSync } from "../_lib/rdstation-sync.js";
import { runFlwChatSync } from "../_lib/flwchat-sync.js";
import { runDigisacSync } from "../_lib/digisac-sync.js";
import { lerAudiencia, lerResumoPeriodo } from "../_lib/meta-audiencia.js";
import { classificarConteudoComIA } from "../_lib/conteudo-ia.js";
import { ingerirConversasWts } from "../_lib/conversas-wts.js";
import { ingerirConversasClint } from "../_lib/conversas-clint.js";
import { enriquecerContatosKommo } from "../_lib/kommo-contatos.js";
import { cliquesDoLink } from "../_lib/shortio.js";
import { recordSyncStatus, erroCurto, lerDadosAte, type FonteSync } from "../_lib/sync-status.js";
import { rodarConferencia, rodarEtapa, ETAPAS, type EtapaId, type Achado, type Verificado } from "../_lib/conferencia.js";
import { resumirConversa } from "../_lib/resumo-conversa.js";
import { rascunharSessao } from "../_lib/sessao-ia.js";
import { codigoLivre, paginaLinkDesativado, redirecionarLink, slugLivre } from "../_lib/redirecionar.js";
import { gerarArtes, listarArtes, revisarArte } from "../_lib/creative-arte.js";
import { atualizarPlano } from "../_lib/plano-semana.js";
import { processarReuniao } from "../_lib/reuniao.js";
import { redigirSecao } from "../_lib/copiloto.js";
import { gerarComPrompt } from "../_lib/sap-gerar.js";
import { PROMPT_POR_CODIGO } from "../_lib/sap-prompts.js";
import { aplicarAcao, desfazerAcao, tokenEscritaConfigurado } from "../_lib/anuncios-acoes.js";
import { baseDoLink, candidatosCodigo, destinoSite, destinoWhatsApp, numeroDoDestino, novoSlug, POSICOES, mensagemComRef, urlDoLink, validarNomeLink, type Posicao } from "../../src/lib/rastreio.js";
import { rodarAgentes, catalogoFluxos, enfileirarBrain } from "../_lib/agentes.js";
import { resumoEquipe } from "../_lib/resumo-equipe.js";
import { manualRequestSchema } from "../_lib/request-validation.js";
import { lerResumoCrmNegocio } from "../_lib/crm-negocio-resumo.js";
import { ehNegocioProprio } from "../../src/lib/negocio-proprio.js";
import { forma as formaSonda } from "../_lib/sonda-conversas-crm.js";
import { integrationHost, integrationRequest } from "../_lib/integration-http.js";

// Sincronização sob demanda, disparada pelo botão dentro do dashboard.
//
// No navegador, usa a sessão do usuário (admin ou membro autorizado do cliente).
// SYNC_SECRET fica reservado às ações explícitas do agendamento de agentes; nunca vai para o navegador.
//
// Janela curta de propósito: o botão existe para "atualiza agora que eu
// publiquei", não para refazer histórico. Backfill continua sendo trabalho dos
// endpoints com secret, chamados pelo n8n.

const DIAS_DE_JANELA = 7;
const agendamentoSchema = z.object({ alvo: z.literal("agentes"), acao: z.enum(["rodar", "brain_enfileirar", "agendar", "resumo_equipe"]) }).strict();
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

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  // Rotas da central compartilham a função existente no plano Hobby. Cada handler
  // mantém sua própria autenticação; o webhook lê os bytes antes de req.body.
  if (req.query._central === "canais") {
    await (await import("../_lib/central-canais.js")).default(req, res); return;
  }
  if (req.query._central === "meta-webhook") {
    await (await import("../_lib/central-webhook.js")).default(req, res); return;
  }
  // Vendas do checkout (Hubla): POST ?checkout=hubla&client_id=<uuid>, do n8n, com SYNC_SECRET. Autenticação própria.
  if (typeof req.query.checkout === "string") {
    await (await import("../_lib/checkout-vendas.js")).default(req, res); return;
  }

  // Link rastreado próprio: /r/<slug> (rewrite no vercel.json) registra o clique e leva ao destino. Público, sem token.
  if (req.method === "GET" && typeof req.query.r === "string") {
    const url = process.env.SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const slug = req.query.r;
    if (!url || !chave) console.error("[links] servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY para abrir link");
    const destino = url && chave
      ? await redirecionarLink(createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }), slug, (req.headers["user-agent"] as string) ?? null, (req.headers.referer as string) ?? null)
        .catch((e: unknown) => { console.error("[links] falha ao abrir link", { slug: slug.slice(0, 40), erro: e instanceof Error ? e.message : String(e) }); return null; })
      : null;
    res.setHeader("Cache-Control", "no-store");
    if (!destino) { res.status(404).send("Link não encontrado."); return; }
    if (destino.tipo === "inativo") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(410).send(paginaLinkDesativado(destino.whatsapp));
      return;
    }
    res.redirect(302, destino.url);
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const corpoOriginal: unknown = req.body;
  const parsedBody = manualRequestSchema.safeParse(corpoOriginal);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Parâmetros inválidos", campos: [...new Set(parsedBody.error.issues.map((issue) => issue.path[0]).filter(Boolean))] });
    return;
  }
  req.body = parsedBody.data;

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

  // Agendamento do n8n (SYNC_SECRET), restrito às ações explícitas que só GERAM SUGESTÕES para revisão humana:
  // - "brain_enfileirar" (ou "agendar"): mede o resultado das sugestões e põe na fila a rodada de cada agente do catálogo
  //   (Brain, Recuperação, Anúncios, Conteúdo, Campanhas) das clínicas cuja última rodada passou do intervalo;
  // - "rodar": roda a fila de agentes (aprovações continuam esperando uma pessoa; nada é enviado a clínica ou paciente);
  // - "resumo_equipe": devolve o e-mail diário do que os agentes deixaram para a equipe e os e-mails dos admins
  //   (quem envia é o n8n; só números e nomes de clínica).
  const SYNC_SECRET = process.env.SYNC_SECRET;
  if (SYNC_SECRET && timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(SYNC_SECRET).digest())) {
    const entrada = agendamentoSchema.safeParse(corpoOriginal);
    if (!entrada.success) { res.status(403).json({ error: "O segredo do agendamento só permite as ações explícitas da fila de agentes" }); return; }
    const corpo = entrada.data;
    try {
      if (corpo.acao === "resumo_equipe") {
        res.status(200).json({ alvo: "agentes", ok: true, ...(await resumoEquipe(admin)) });
        return;
      }
      if (corpo.acao === "brain_enfileirar" || corpo.acao === "agendar") {
        const r = await enfileirarBrain(admin);
        res.status(200).json({ alvo: "agentes", ok: true, agendado: true, ...r });
        return;
      }
      // Agendado: até 3 min de passos novos por chamada (um passo de IA pode levar mais 1,5 min; a função aceita 5), para a fila do dia andar em poucas chamadas.
      const r = await rodarAgentes(admin, { execucaoId: null, maxPassos: 8, prazoMs: 180_000 });
      res.status(200).json({ alvo: "agentes", ok: true, agendado: true, ...r });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
    return;
  }

  const { data: quem, error: erroQuem } = await admin.auth.getUser(token);
  if (erroQuem || !quem.user) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const { client_id, alvo } = (req.body ?? {}) as { client_id?: string; alvo?: string };
  // "conferencia" e "agentes" olham todos os clientes de uma vez (só admin), por isso não exigem client_id.
  // O alvo já passou pelo enum de manualRequestSchema; uma segunda lista fica desatualizada e bloqueia novas funções.
  const alvoGlobal = alvo === "conferencia" || alvo === "agentes";
  if ((!client_id && !alvoGlobal) || !alvo) {
    res.status(400).json({ error: "Informe client_id e alvo ('tudo', 'posts', 'anuncios', 'atendimento', 'comentarios' ou 'crm')" });
    return;
  }

  const { data: ehAdmin, error: erroAdmin } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", quem.user.id)
    .maybeSingle();
  if (erroAdmin) { res.status(503).json({ error: "Não foi possível verificar o acesso" }); return; }

  if (!ehAdmin) {
    if (alvoGlobal) {
      res.status(403).json({ error: "Só admin" });
      return;
    }
    const { data: ehMembro, error: erroMembro } = await admin
      .from("client_members")
      .select("user_id, role")
      .eq("user_id", quem.user.id)
      .eq("client_id", client_id)
      .maybeSingle();
    if (erroMembro) { res.status(503).json({ error: "Não foi possível verificar o acesso" }); return; }
    if (!ehMembro) {
      res.status(403).json({ error: "Sem acesso a este cliente" });
      return;
    }
    if (!["owner", "strategist"].includes(ehMembro.role) && !["audiencia", "periodo_instagram", "crm_negocio_resumo"].includes(alvo)) {
      res.status(403).json({ error: "Seu acesso é somente leitura" });
      return;
    }
  }

  try {
    if (alvo === "crm_negocio_resumo") {
      const {de,ate}=req.body as {de?:string;ate?:string};
      if(!de || !ate || !ehNegocioProprio(client_id!)) { res.status(400).json({error:"Conta ou período inválido para esta leitura."}); return; }
      const leitura=await lerResumoCrmNegocio(admin,client_id!,de,ate);
      res.status(200).json({alvo,ok:true,...leitura}); return;
    }
    // Agentic Core: a Central de Agentes pede para rodar a fila (ou uma execução) e o catálogo de fluxos.
    if (alvo === "agentes") {
      const { acao, execucao_id } = (req.body ?? {}) as { acao?: string; execucao_id?: string };
      if (acao && !["catalogo", "rodar"].includes(acao)) { res.status(400).json({ error: "Ação de agentes inválida" }); return; }
      if (acao === "catalogo") { res.status(200).json({ alvo, ok: true, fluxos: catalogoFluxos() }); return; }
      if (execucao_id && !/^[0-9a-f-]{36}$/.test(execucao_id)) { res.status(400).json({ error: "execucao_id inválido" }); return; }
      const r = await rodarAgentes(admin, { execucaoId: execucao_id ?? null, maxPassos: 8, prazoMs: 45_000 });
      res.status(200).json({ alvo, ok: true, ...r });
      return;
    }
    if (alvoGlobal) {
      const { etapa, conferencia_id } = (req.body ?? {}) as { etapa?: string; conferencia_id?: string };
      // Sem etapa: conferência inteira numa chamada (modo antigo).
      if (!etapa) {
        const resultado = await rodarConferencia(admin, { tokenGlobalAnuncios: process.env.META_ADS_TOKEN });
        res.status(200).json({ alvo, ok: true, ...resultado });
        return;
      }
      // Por etapas: a tela chama "inicio", depois cada etapa, depois "fim". Cada etapa grava seu
      // resultado na rodada (conferencias_dados), então a última conferência fica salva com data e hora.
      if (etapa === "inicio") {
        const { data: nova, error } = await admin.from("conferencias_dados").insert({ iniciada_por: quem.user.id }).select("id, iniciada_em").single();
        if (error) throw new Error(error.message);
        res.status(200).json({ alvo, ok: true, conferencia_id: nova.id, iniciada_em: nova.iniciada_em, etapas: ETAPAS });
        return;
      }
      if (!conferencia_id) {
        res.status(400).json({ error: "Informe conferencia_id" });
        return;
      }
      const { data: atual, error: erroLer } = await admin.from("conferencias_dados").select("*").eq("id", conferencia_id).maybeSingle();
      if (erroLer || !atual) {
        res.status(404).json({ error: "Conferência não encontrada" });
        return;
      }
      if (etapa === "fim") {
        const { error } = await admin.from("conferencias_dados").update({ concluida_em: new Date().toISOString() }).eq("id", conferencia_id);
        if (error) throw new Error(error.message);
        res.status(200).json({ alvo, ok: true });
        return;
      }
      if (!(ETAPAS as readonly string[]).includes(etapa)) {
        res.status(400).json({ error: "Etapa desconhecida" });
        return;
      }
      const t0 = Date.now();
      let registro: Record<string, unknown>;
      let r: Awaited<ReturnType<typeof rodarEtapa>> | null = null;
      try {
        r = await rodarEtapa(admin, etapa as EtapaId, { tokenGlobalAnuncios: process.env.META_ADS_TOKEN });
        registro = { etapa, status: "ok", achados: r.achados.length, verificados: r.verificados.length, ms: Date.now() - t0 };
      } catch (e) {
        registro = { etapa, status: "erro", erro: erroCurto(e instanceof Error ? e.message : String(e), 200), ms: Date.now() - t0 };
      }
      // Rodar a mesma etapa de novo substitui o resultado anterior dela (não duplica).
      const etapas = [...((atual.etapas as any[]) ?? []).filter((x) => x.etapa !== etapa), registro];
      const achados = [...((atual.achados as Achado[]) ?? []).filter((a) => a.etapa !== etapa), ...(r?.achados ?? [])];
      const verificados = [...((atual.verificados as Verificado[]) ?? []).filter((v) => v.etapa !== etapa), ...(r?.verificados ?? [])];
      const extra: Record<string, unknown> = {};
      if (r?.contas_vistas_na_meta != null) extra.contas_vistas_na_meta = r.contas_vistas_na_meta;
      if (r?.tokens_testados != null) extra.tokens_testados = r.tokens_testados;
      const { error: erroGravar } = await admin.from("conferencias_dados").update({ etapas, achados, verificados, ...extra }).eq("id", conferencia_id);
      if (erroGravar) throw new Error(erroGravar.message);
      res.status(200).json({ alvo, ok: true, ...registro, novos: r?.achados ?? [], novos_verificados: r?.verificados ?? [] });
      return;
    }
    if (!client_id) {
      res.status(400).json({ error: "Informe client_id" });
      return;
    }
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
      let windsorTemConta = false;
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
        if (w.length > 0) windsorTemConta = true;
        linhas += w.reduce((a, c) => a + c.rows, 0);
        // Erro da Windsor só vale quando a Graph não serve este cliente; do
        // contrário é o ruído esperado de conta que a Windsor não enxerga.
        if (!graphTemConta) erros.push(...w.flatMap((c) => c.errors));
      }

      // Planilha de distribuição de conteúdo (clients.ads_planilha_url): para quem a Meta e a Windsor não enxergam a conta.
      {
        const pl = await runAdsPlanilhaSync({ supabaseUrl: urlSupabase, supabaseServiceRoleKey: chaveServico, onlyClientId: client_id });
        if (pl.length > 0) temConta = true;
        linhas += pl.reduce((a, c) => a + c.rows, 0);
        erros.push(...pl.flatMap((c) => c.errors));
      }

      if (!temConta) {
        return { nada_a_fazer: "Este cliente não tem conta de anúncio ligada ao cadastro." };
      }
      // Só a planilha alimentou (nem Graph nem Windsor leem conta deste cliente): "dados até" não se aplica.
      return { linhas, erros, so_planilha: !graphTemConta && !windsorTemConta };
    }

    async function sincronizarAtendimento() {
      // Digisac (IGM Palmas): o atendimento sai da mesma conexão do CRM, então a rodada é uma só.
      const { data: ligDigisac } = await admin.from("crm_connections").select("id").eq("client_id", client_id).eq("provider", "digisac").eq("active", true);
      if ((ligDigisac ?? []).length > 0) {
        const r = await runDigisacSync({
          supabaseUrl: urlSupabase,
          supabaseServiceRoleKey: chaveServico,
          onlyClientId: client_id,
          deadlineMs: Date.now() + 50_000,
        });
        const erros = r.flatMap((c) => c.errors);
        if (erros.length > 0 && r.every((c) => c.atendimentos === 0)) throw new Error(`Digisac: ${erros[0]}`);
        return { sessoes: r.reduce((a, c) => a + c.atendimentos, 0), contas: r };
      }
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
      const digisac = (conexoes ?? []).filter((c) => c.provider === "digisac");
      const planilha = (conexoes ?? []).filter((c) => c.provider === "planilha");

      if (kommo.length === 0 && clint.length === 0 && rdstation.length === 0 && flwchat.length === 0 && digisac.length === 0) {
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

      if (digisac.length > 0) {
        try {
          const r = await runDigisacSync({
            supabaseUrl: urlSupabase,
            supabaseServiceRoleKey: chaveServico,
            onlyClientId: client_id,
            deadlineMs: Date.now() + 50_000,
          });
          linhas += r.reduce((a, c) => a + c.contatos, 0);
          erros.push(...r.flatMap((c) => c.errors.map((e) => `Digisac: ${e}`)));
        } catch (err) {
          erros.push(`Digisac: ${err instanceof Error ? err.message : String(err)}`);
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
      // O registro guarda a data; a resposta ao botão não a mostra quando só a planilha alimentou (não é "atualizado até").
      await recordSyncStatus(admin, client_id as string, fonte, {
        ok,
        rows: linhas,
        error: erro,
        dataAte: dadosAte,
      });
      return { ...r, ok, linhas, erro, dados_ate: r?.so_planilha ? null : dadosAte };
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

    // Números do período escolhido, do jeito do painel do Instagram (alcance ÚNICO, não a soma dos dias). Leitura ao vivo,
    // nada é gravado; guarda 20 minutos na memória da função, por cliente e período.
    if (alvo === "periodo_instagram") {
      const b = (req.body ?? {}) as { de?: string; ate?: string };
      const iso = /^\d{4}-\d{2}-\d{2}$/;
      if (!b.de || !b.ate || !iso.test(b.de) || !iso.test(b.ate)) {
        res.status(400).json({ error: "Informe de e ate (YYYY-MM-DD)" });
        return;
      }
      const chave = `${client_id}:${b.de}:${b.ate}`;
      const memoria: Map<string, { t: number; d: unknown }> = ((globalThis as any).__periodoIgCache ??= new Map());
      const guardado = memoria.get(chave);
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
        res.status(200).json({ alvo, ok: true, nada_a_fazer: "Instagram sem token próprio da Meta: o alcance único do período não está disponível." });
        return;
      }
      const { data: segredo } = await admin.from("instagram_account_secrets").select("meta_access_token").eq("instagram_account_id", conta.id).maybeSingle();
      const tokenIg = segredo?.meta_access_token ?? META_ACCESS_TOKEN;
      if (!tokenIg) {
        res.status(200).json({ alvo, ok: false, erro: "Instagram sem token da Meta configurado." });
        return;
      }
      const dados = await lerResumoPeriodo({ igId: conta.windsor_account_id as string, token: tokenIg, de: b.de, ate: b.ate });
      memoria.set(chave, { t: Date.now(), d: dados });
      res.status(200).json({ alvo, ok: true, dados });
      return;
    }

    // ---- Conversas do WhatsApp (WTS): grava mensagens, pessoa e toque. Só admin: é dado de paciente. ----
    // ---- Modo sessão do SAP: rascunho do pós-sessão por IA. Só admin: são notas internas da equipe. ----
    if (alvo === "sessao_ia") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin" });
        return;
      }
      const b = (req.body ?? {}) as { sessao?: string; titulo?: string; entregas?: string[]; rotulos?: Record<string, string>; transcricao?: string };
      if (!b.sessao || !b.titulo) {
        res.status(400).json({ error: "Informe sessao e titulo" });
        return;
      }
      const r = await rascunharSessao(admin, client_id!, {
        sessao: b.sessao, titulo: String(b.titulo).slice(0, 200),
        entregas: Array.isArray(b.entregas) ? b.entregas.map(String).slice(0, 20) : [],
        rotulos: b.rotulos && typeof b.rotulos === "object" ? b.rotulos : {},
        transcricao: typeof b.transcricao === "string" ? b.transcricao : null,
      }, quem.user.id);
      res.status(200).json({ alvo, ok: true, ...r });
      return;
    }
    if (alvo === "resumo_conversa") {
      const conversaId = (req.body ?? {}).conversa_id as string | undefined;
      if (!conversaId) {
        res.status(400).json({ error: "Informe conversa_id" });
        return;
      }
      const r = await resumirConversa(admin, client_id, conversaId, quem.user.id);
      res.status(200).json({ alvo, ok: true, ...r });
      return;
    }
    if (alvo === "conversas") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin ingere conversas" });
        return;
      }
      const clint = await admin.from("crm_connections").select("id,config").eq("client_id", client_id).eq("provider", "clint").eq("active", true);
      if (clint.error) throw new Error("Não foi possível conferir a conexão da Clint");
      if (clint.data?.some(c => c.config?.clint_conversas_ativo === true)) {
        const r = await ingerirConversasClint(admin, { onlyClientId: client_id, orcamentoMs: 200_000 });
        const ok = r.length > 0 && r.every(c => c.erros.length === 0 && !c.parcial);
        res.status(ok ? 200 : 207).json({ alvo, ok, clint: r, conversas: r.reduce((n,c) => n+c.conversas, 0), mensagens: r.reduce((n,c) => n+c.mensagens, 0), erros: r.flatMap(c => c.erros) });
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

    // ---- Telefone, e-mail e nome dos leads do Kommo (contatos). Só admin; o token fica no servidor. ----
    if (alvo === "kommo_contatos") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin" });
        return;
      }
      const b = (req.body ?? {}) as { pagina?: number; paginas?: number };
      const { data: conns } = await admin.from("crm_connections").select("id, client_id, subdomain, access_token, provider").eq("client_id", client_id).eq("provider", "kommo").eq("active", true);
      // Token da conexão ou, se não houver (Lana), o token geral do servidor, igual ao sync de leads.
      const tokenServidor = process.env.KOMMO_API_TOKEN;
      const conn = (conns ?? []).find((c) => c.subdomain && (c.access_token || tokenServidor));
      if (!conn) {
        res.status(200).json({ alvo, ok: false, erro: "Cliente sem conexão Kommo com subdomínio e token" });
        return;
      }
      const r = await enriquecerContatosKommo(admin, { id: conn.id, client_id: conn.client_id, subdomain: conn.subdomain as string, access_token: (conn.access_token || tokenServidor) as string }, { pagina: Number(b.pagina) || 1, paginas: Math.min(Number(b.paginas) || 20, 60), orcamentoMs: 240_000 });
      if (r.proximaPagina === null) {
        try {
          await admin.rpc("vincular_pessoas", { p_client: client_id });
        } catch {
          /* o vínculo roda de novo no próximo sync de CRM */
        }
      }
      res.status(r.erros.length ? 207 : 200).json({ alvo, ok: r.erros.length === 0, ...r, erros: r.erros.slice(0, 6) });
      return;
    }

    // ---- Sonda de conversas (só admin): testa endpoints de cada CRM e devolve apenas a ESTRUTURA, nunca dados ----
    if (alvo === "sonda_conversas") {
      if (!ehAdmin) {
        res.status(403).json({ error: "Só admin" });
        return;
      }
      const forma = formaSonda;
      const fimSonda = Date.now() + 45_000;
      const sinalSonda = () => AbortSignal.timeout(Math.max(1, Math.min(15_000, fimSonda - Date.now())));
      const tentar = async (base: string, caminho: string, cab: Record<string, string>) => {
        if (Date.now() >= fimSonda) return { status: 0, forma: "Orçamento da sonda esgotado" };
        try {
          const r = await fetch(`${base}${caminho}`, integrationRequest({ headers: { Accept: "application/json", ...cab }, signal: sinalSonda() }));
          const t = await r.text();
          let j: any = null;
          try { j = JSON.parse(t); } catch { /* não é JSON */ }
          return { status: r.status, forma: j ? forma(j) : "resposta não JSON" };
        } catch (e) {
          return { status: 0, forma: "consulta indisponível" };
        }
      };
      const saida: Record<string, unknown> = {};

      // WTS Chat (token do servidor) e FlwChat (token da conexão): mesma API, api.wts.chat
      const { data: sess, error: erroSessoes } = await admin.from("wts_sessions").select("session_id, contact_id").eq("client_id", client_id).not("contact_id", "is", null).order("started_at", { ascending: false }).limit(25);
      if (erroSessoes) throw new Error("Não foi possível ler as sessões para a sonda");
      if ((sess ?? []).length > 0 && WTS_API_TOKEN) {
        const cab = { Authorization: `Bearer ${WTS_API_TOKEN}` };
        const base = "https://api.wts.chat";
        // Procura uma sessão que tenha mensagens e mostra a forma da sessão, da mensagem e do contato.
        let achou = false;
        for (const s0 of sess ?? []) {
          if (Date.now() >= fimSonda) break;
          const m = await tentar(base, `/chat/v1/session/${encodeURIComponent(s0.session_id)}/message?PageSize=3`, cab);
          const itens = (m.forma as any)?.items;
          if (m.status === 200 && Array.isArray(itens) && itens[0]) {
            saida["wts mensagem (forma)"] = m;
            saida["wts sessão (forma)"] = await tentar(base, `/chat/v1/session/${encodeURIComponent(s0.session_id)}`, cab);
            saida["wts contato /core/v1/contact/{id}"] = await tentar(base, `/core/v1/contact/${encodeURIComponent(s0.contact_id)}`, cab);
            achou = true;
            break;
          }
        }
        saida["wts achou sessão com mensagens"] = achou;
      }

      // Kommo: notas, eventos e contatos (telefone) de um lead de exemplo
      const { data: conn, error: erroConexoes } = await admin.from("crm_connections").select("provider, subdomain, access_token").eq("client_id", client_id).eq("active", true);
      if (erroConexoes) throw new Error("Não foi possível ler as conexões para a sonda");
      const k = (conn ?? []).find((c) => c.provider === "kommo" && c.subdomain && c.access_token);
      if (k) {
        const dom = integrationHost(k.subdomain as string, "kommo");
        const cab = { Authorization: `Bearer ${k.access_token}` };
        const base = `https://${dom}`;
        const lead = await tentar(base, "/api/v4/leads?limit=1&with=contacts", cab);
        saida["kommo lead?with=contacts (forma)"] = lead;
        const { data: l1, error: erroLead } = await admin.from("crm_leads").select("external_lead_id").eq("client_id", client_id).eq("provider", "kommo").order("received_at", { ascending: false }).limit(1);
        if (erroLead) throw new Error("Não foi possível ler o lead para a sonda");
        const lid = l1?.[0]?.external_lead_id;
        if (lid) {
          const tipos = async (caminho: string, chave: string) => {
            if (Date.now() >= fimSonda) return { status: 0, erro: "Orçamento da sonda esgotado" };
            try {
              const r = await fetch(`${base}${caminho}`, integrationRequest({ headers: { Accept: "application/json", ...cab }, signal: sinalSonda() }));
              const j: any = await r.json().catch(() => ({}));
              const itens: any[] = j?._embedded?.[chave] ?? [];
              const cont: Record<string, number> = {};
              for (const i of itens) {
                const bruto = i.note_type ?? i.type;
                const t = ["common", "service_message", "extended_service_message", "incoming_chat_message", "outgoing_chat_message"].includes(bruto) ? String(bruto) : "outro";
                cont[t] = (cont[t] ?? 0) + 1;
              }
              return { status: r.status, tipos: cont, exemplo: forma(itens[0]) };
            } catch { return { status: 0, erro: "consulta indisponível" }; }
          };
          saida["kommo notas (tipos + forma)"] = await tipos(`/api/v4/leads/${encodeURIComponent(lid)}/notes?limit=50`, "notes");
          saida["kommo eventos do lead (tipos + forma)"] = await tipos(`/api/v4/events?limit=50&filter[entity][]=lead&filter[entity_id][]=${encodeURIComponent(lid)}`, "events");
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

    if (alvo === "link_rastreado") {
      // Gerador de links próprio (src/lib/rastreio.ts): nome curto no nosso domínio, clique registrado, frase + código.
      if (!ehAdmin) {
        res.status(403).json({ error: "Só a equipe cria links rastreados" });
        return;
      }
      const b = (req.body ?? {}) as { acao?: string; id?: string; slug?: string; tipo?: string; titulo?: string; campanha?: string; destino_tipo?: string; numero_whatsapp?: string; frase?: string; site_url?: string; instagram_post_id?: string | null };
      if (b.acao === "ativo" || b.acao === "inativo") {
        const { data, error } = await admin.from("links_rastreados").update({ ativo: b.acao === "ativo" }).eq("id", b.id ?? "").eq("client_id", client_id).select("id").maybeSingle();
        if (error) { res.status(503).json({ error: "Não foi possível atualizar o link" }); return; }
        if (!data) { res.status(404).json({ error: "Link não encontrado nesta clínica" }); return; }
        res.status(200).json({ alvo, ok: true });
        return;
      }
      // Domínio curto configurável (LINK_BASE_URL); nunca o host do pedido, que vem de quem chama.
      const base = baseDoLink(process.env.LINK_BASE_URL);
      const informado = b.slug != null && String(b.slug).trim() !== "";
      const nome = informado ? validarNomeLink(String(b.slug)) : null;
      if (b.acao === "conferir") {
        // A tela confere enquanto a equipe digita: o nome serve e ainda está livre?
        if (!nome) { res.status(400).json({ error: "Informe o nome do link" }); return; }
        if (!nome.ok) { res.status(200).json({ alvo, ok: true, valido: false, motivo: nome.motivo }); return; }
        const livre = await slugLivre(admin, nome.slug, b.id);
        res.status(200).json({ alvo, ok: true, valido: true, slug: nome.slug, livre, url: urlDoLink(nome.slug, base) });
        return;
      }
      if (nome && !nome.ok) {
        res.status(400).json({ error: nome.motivo });
        return;
      }
      const pedido = nome?.ok ? nome.slug : null;
      if (b.acao === "renomear") {
        // Troca o final do link; o final anterior continua redirecionando (fica em slugs_antigos).
        if (!pedido) { res.status(400).json({ error: "Informe o novo nome do link" }); return; }
        const { data: atual, error: erroAtual } = await admin.from("links_rastreados").select("id, slug, slugs_antigos").eq("id", b.id ?? "").eq("client_id", client_id).maybeSingle();
        if (erroAtual || !atual?.slug) { res.status(404).json({ error: "Link não encontrado" }); return; }
        if (!(await slugLivre(admin, pedido, atual.id))) { res.status(409).json({ error: "Esse nome já está em uso em outro link. Escolha outro." }); return; }
        const antigos = [...new Set([...((atual.slugs_antigos as string[] | null) ?? []), atual.slug])].filter((x) => x !== pedido);
        const { error } = await admin.from("links_rastreados").update({ slug: pedido, slugs_antigos: antigos } as never).eq("id", atual.id).eq("client_id", client_id);
        if (error) { res.status(200).json({ alvo, ok: false, erro: error.message }); return; }
        res.status(200).json({ alvo, ok: true, url: urlDoLink(pedido, base) });
        return;
      }
      if (b.acao === "frase") {
        // A equipe reescreve a mensagem pronta; o código e o número continuam os mesmos.
        const frase = String(b.frase ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
        if (!frase) { res.status(400).json({ error: "Escreva a mensagem que o paciente vai mandar" }); return; }
        const { data: atual, error: erroAtual } = await admin.from("links_rastreados").select("id, codigo_ref, destino_tipo, destino_url").eq("id", b.id ?? "").eq("client_id", client_id).maybeSingle();
        if (erroAtual || !atual) { res.status(404).json({ error: "Link não encontrado" }); return; }
        const numero = atual.destino_tipo === "site" ? null : numeroDoDestino(atual.destino_url);
        const novoDestino = numero ? destinoWhatsApp(numero, frase, atual.codigo_ref) : null;
        if (!novoDestino) { res.status(400).json({ error: "Este link não leva ao WhatsApp, então não tem mensagem pronta" }); return; }
        const { error } = await admin.from("links_rastreados").update({ destino_url: novoDestino, mensagem_modelo: mensagemComRef(frase, atual.codigo_ref) } as never).eq("id", atual.id).eq("client_id", client_id);
        if (error) { res.status(200).json({ alvo, ok: false, erro: error.message }); return; }
        res.status(200).json({ alvo, ok: true, mensagem: mensagemComRef(frase, atual.codigo_ref) });
        return;
      }
      const tipo = (b.tipo ?? "") as Posicao;
      if (!Object.prototype.hasOwnProperty.call(POSICOES, tipo)) {
        res.status(400).json({ error: `Informe tipo: ${Object.keys(POSICOES).join(", ")}` });
        return;
      }
      const titulo = String(b.titulo ?? "").trim().slice(0, 120) || POSICOES[tipo].rotulo;
      const frase = String(b.frase ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || POSICOES[tipo].frase;
      if (pedido && !(await slugLivre(admin, pedido))) {
        res.status(409).json({ error: "Esse nome já está em uso em outro link. Escolha outro." });
        return;
      }
      // Código curto (R27) único entre todas as clínicas: duas clínicas podem dividir o mesmo WhatsApp.
      const ref = await codigoLivre(admin, candidatosCodigo());
      if (!ref) { res.status(503).json({ error: "Não foi possível gerar o código do link. Tente de novo." }); return; }
      const slug = pedido ?? novoSlug();
      let destino: string | null = null;
      if (b.destino_tipo === "site") destino = destinoSite(String(b.site_url ?? ""), tipo, b.campanha || titulo, ref);
      else {
        let numero = String(b.numero_whatsapp ?? "");
        if (!numero) {
          const { data: cli } = await admin.from("sap_clinicas").select("whatsapp_numero").eq("client_id", client_id).not("whatsapp_numero", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
          numero = String(cli?.whatsapp_numero ?? "");
        }
        destino = destinoWhatsApp(numero, frase, ref);
      }
      if (!destino) {
        res.status(400).json({ error: b.destino_tipo === "site" ? "Endereço do site inválido (use https://...)" : "Número de WhatsApp da clínica inválido ou não cadastrado (DDD + número)" });
        return;
      }
      const { data: criado, error: erroIns } = await admin.from("links_rastreados").insert({
        client_id, codigo_ref: ref, slug, tipo, titulo, campanha: b.campanha ? String(b.campanha).slice(0, 80) : null, destino_tipo: b.destino_tipo === "site" ? "site" : "whatsapp",
        instagram_post_id: b.instagram_post_id ?? null, destino_url: destino, mensagem_modelo: b.destino_tipo === "site" ? null : mensagemComRef(frase, ref), criado_por: quem.user.id,
      } as never).select("id").single();
      if (erroIns) {
        // 23505: outro pedido pegou o mesmo nome ou código no mesmo instante.
        if (erroIns.code === "23505") { res.status(409).json({ error: "Esse nome ou código acabou de ser usado. Tente de novo." }); return; }
        res.status(200).json({ alvo, ok: false, erro: erroIns.message });
        return;
      }
      res.status(200).json({ alvo, ok: true, id: criado?.id, url: urlDoLink(slug, base), ref, mensagem: b.destino_tipo === "site" ? null : mensagemComRef(frase, ref) });
      return;
    }

    if (alvo === "anuncio_acao") {
      // Ação nos anúncios com 1 clique (pausar, reativar, orçamento ±20%). Só a equipe; aplica pela API da Meta.
      if (!ehAdmin) {
        res.status(403).json({ error: "Só a equipe aplica ações nos anúncios" });
        return;
      }
      const b = (req.body ?? {}) as { acao?: string; campanha_id?: string; tipo?: string; pct?: number; sugestao_id?: string; id?: string };
      if (b.acao === "status") { res.status(200).json({ alvo, ok: true, token: tokenEscritaConfigurado() }); return; }
      if (b.acao === "desfazer") { res.status(200).json({ alvo, ...(await desfazerAcao(admin, { clientId: client_id as string, id: String(b.id ?? ""), userId: quem.user.id })) }); return; }
      const tipo = b.tipo === "pausar" || b.tipo === "ativar" || b.tipo === "orcamento" ? b.tipo : null;
      if (!tipo || !b.campanha_id) { res.status(400).json({ error: "Informe campanha_id e tipo (pausar, ativar ou orcamento)" }); return; }
      const r = await aplicarAcao(admin, { clientId: client_id as string, campanhaId: b.campanha_id, tipo, pct: Number(b.pct ?? 0), sugestaoId: b.sugestao_id ?? null, userId: quem.user.id });
      res.status(200).json({ alvo, ...r });
      return;
    }

    if (alvo === "creative_worker") {
      // Inteligência Criativa: dispara na hora o worker no GitHub Actions (o agendamento de 10 min é só reserva).
      // Token fino com permissão "Actions: write" só neste repositório, em GITHUB_DISPATCH_TOKEN na Vercel.
      if (!ehAdmin) { res.status(403).json({ error: "Só a equipe usa a Inteligência Criativa" }); return; }
      const jobId = parsedBody.data.job_id;
      if (jobId) {
        const { data: job, error } = await admin.from("creative_jobs").select("id").eq("id", jobId).eq("client_id", client_id as string).maybeSingle();
        if (error) { res.status(503).json({ error: "Não foi possível conferir o trabalho solicitado" }); return; }
        if (!job) { res.status(404).json({ error: "Trabalho não encontrado nesta clínica" }); return; }
      }
      const tokenGh = process.env.GITHUB_DISPATCH_TOKEN;
      if (!tokenGh) { res.status(200).json({ alvo, ok: false, erro: "sem_token", agendado: true }); return; }
      const r = await fetch("https://api.github.com/repos/douglasgomides/dashboard/actions/workflows/creative-worker.yml/dispatches", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenGh}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "claude/doctor-creator-hub-nixvw6", ...(jobId ? { inputs: { job_id: jobId } } : {}) }),
      });
      res.status(200).json({ alvo, ok: r.status === 204, status: r.status, agendado: r.status !== 204 });
      return;
    }

    if (alvo === "reuniao") {
      // Reunião com a clínica: resumo, entregas da semana e propostas de memória para o Brain (só admin, como o Brain).
      if (!ehAdmin) { res.status(403).json({ error: "Só admin" }); return; }
      try { res.status(200).json({ alvo, ok: true, ...(await processarReuniao(admin, client_id as string, String((req.body as { id?: string }).id), quem.user.id)) }); }
      catch (e) { res.status(200).json({ alvo, ok: false, erro: e instanceof Error ? e.message : String(e) }); }
      return;
    }
    if (alvo === "plano_semana") {
      // Plano da semana: confere as ações anteriores e monta a desta semana (se ainda não existir).
      try { res.status(200).json({ alvo, ok: true, ...(await atualizarPlano(admin, client_id as string)) }); }
      catch (e) { res.status(200).json({ alvo, ok: false, erro: e instanceof Error ? e.message : String(e) }); }
      return;
    }
    if (alvo === "plano_item") {
      // Feita / não deu / descartada, decidido pela equipe (owner, strategist ou admin).
      const b = (req.body ?? {}) as { id?: string; estado?: string; nota?: string };
      if (!/^[0-9a-f-]{36}$/.test(String(b.id ?? "")) || !["proposta", "feita", "nao_feita", "descartada"].includes(String(b.estado))) { res.status(400).json({ error: "Pedido inválido" }); return; }
      const { error } = await admin.from("plano_itens").update({ estado: b.estado, nota: b.nota ? String(b.nota).slice(0, 500) : null, decidido_por: quem.user.id, decidido_em: new Date().toISOString() })
        .eq("id", b.id as string).eq("client_id", client_id as string);
      res.status(200).json({ alvo, ok: !error, erro: error?.message });
      return;
    }

    if (alvo === "creative_arte") {
      // Arte dos slides de uma adaptação (rascunho para revisão). Só a equipe; teto diário por clínica.
      if (!ehAdmin) { res.status(403).json({ error: "Só a equipe usa a Inteligência Criativa" }); return; }
      const b = (req.body ?? {}) as { acao?: string; adaptacao_id?: string; slides?: unknown; arte_id?: string; status?: string };
      try {
        if (b.acao === "gerar") { res.status(200).json({ alvo, ok: true, ...(await gerarArtes(admin, client_id as string, String(b.adaptacao_id ?? ""), quem.user.id, b.slides)) }); return; }
        if (b.acao === "revisar") { await revisarArte(admin, client_id as string, String(b.arte_id ?? ""), String(b.status ?? ""), quem.user.id); res.status(200).json({ alvo, ok: true }); return; }
        res.status(200).json({ alvo, ok: true, artes: await listarArtes(admin, client_id as string, String(b.adaptacao_id ?? "")) });
      } catch (e) {
        res.status(200).json({ alvo, ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    if (alvo === "sap_redigir") {
      // Copiloto dos documentos do SAP: rascunho + perguntas; respostas viram fatos propostos no Brand Brain.
      if (!ehAdmin) {
        res.status(403).json({ error: "Só a equipe usa o copiloto" });
        return;
      }
      const b = (req.body ?? {}) as { titulo?: string; dica?: string; texto_atual?: string; turnos?: { papel: string; texto: string }[] };
      const turnos = (Array.isArray(b.turnos) ? b.turnos : []).filter((t) => (t.papel === "ia" || t.papel === "equipe") && typeof t.texto === "string").slice(-12) as { papel: "ia" | "equipe"; texto: string }[];
      try {
        const r = await redigirSecao(admin, { clientId: client_id as string, titulo: String(b.titulo ?? "").slice(0, 120), dica: String(b.dica ?? "").slice(0, 600), textoAtual: String(b.texto_atual ?? ""), turnos });
        res.status(200).json({ alvo, ok: true, ...r });
      } catch (e) {
        res.status(200).json({ alvo, ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    if (alvo === "sap_prompt") {
      // Gerador dos prompts do SAP (05.13, 03.05, 06.10, 07.08, 08.08, 09.04): anexos colados pela equipe viram rascunho.
      if (!ehAdmin) {
        res.status(403).json({ error: "Só a equipe usa o gerador" });
        return;
      }
      const b = (req.body ?? {}) as { codigo?: string; anexos?: Record<string, unknown>; pedido?: string };
      const codigo = String(b.codigo ?? "");
      const def = PROMPT_POR_CODIGO.get(codigo);
      if (!def) {
        res.status(400).json({ error: "Informe um codigo de prompt valido" });
        return;
      }
      const anexos: Record<string, string> = {};
      for (const e of def.entradas) if (typeof b.anexos?.[e.id] === "string") anexos[e.id] = b.anexos[e.id] as string;
      try {
        const r = await gerarComPrompt(admin, { clientId: client_id as string, codigo, anexos, pedido: String(b.pedido ?? def.pedido) });
        res.status(200).json({ alvo, ok: true, ...r });
      } catch (e) {
        res.status(200).json({ alvo, ok: false, erro: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    if (alvo === "links_stats") {
      // Legado: cliques totais dos links antigos do short.gy.
      const chaveShort = process.env.SHORTIO_API_KEY;
      if (!ehAdmin || !chaveShort) {
        res.status(200).json({ alvo, ok: false, erro: "Só admin, com SHORTIO_API_KEY configurada" });
        return;
      }
      const { data: links, error: erroLinks } = await admin.from("links_rastreados").select("id, shortio_id").eq("client_id", client_id).not("shortio_id", "is", null);
      if (erroLinks) throw new Error("Não foi possível ler os links rastreados");
      let atualizados = 0;
      for (const l of links ?? []) {
        const n = await cliquesDoLink(chaveShort, l.shortio_id as string);
        if (n == null) continue;
        const { error: erroClique } = await admin.from("links_rastreados").update({ cliques_total: n, cliques_atualizado_em: new Date().toISOString() }).eq("client_id", client_id).eq("id", l.id);
        if (erroClique) throw new Error("Não foi possível persistir os cliques do link");
        atualizados++;
      }
      res.status(200).json({ alvo, ok: true, atualizados, total: (links ?? []).length });
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

export default withApiObservability(handler, "sync/manual");
