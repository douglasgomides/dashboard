/**
 * Sync direto com a API do Instagram (Meta Graph API), sem passar pela
 * Windsor.ai. Criado porque a Windsor trava/demora demais em consultas de
 * período histórico (testado e confirmado — qualquer janela que não seja
 * "bem recente" nunca completa a tempo). A API direta da Meta pagina o
 * histórico completo de posts rapidamente, sem esse problema.
 *
 * Precisa de um token de usuário de longa duração com as permissões
 * instagram_basic, instagram_manage_insights, pages_read_engagement,
 * pages_show_list — gerado uma vez por quem for Admin da Business Manager
 * de cada cliente. Como o token é do usuário (não da conta do cliente), o
 * MESMO token continua funcionando pra qualquer cliente novo assim que essa
 * pessoa virar Admin na Business Manager dele — não precisa gerar de novo.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { numOrNull, chunk, BATCH_SIZE, normalizeFormat } from "./instagram-sync.js";
import { classifyTema } from "./tema-classifier.js";
import { classificarConteudoComIA } from "./conteudo-ia.js";
import { storiesAoVivo, g as graphGet } from "./meta-audiencia.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const INSIGHTS_METRICS = "reach,likes,comments,shares,saved,views,total_interactions";

// Métricas extras pedidas numa SEGUNDA passada, separada da base — de
// propósito. Elas não existem em todo tipo de mídia (retenção só em reel;
// profile_visits e follows a Meta não suporta em reel), e a Graph API rejeita
// a sub-chamada inteira se qualquer métrica pedida for inválida pra aquela
// mídia. Se fossem junto com a base, um reel perderia reach/likes/saved
// também. Numa passada separada, a rejeição custa só o extra.
const REELS_EXTRA_METRICS = "ig_reels_avg_watch_time,ig_reels_video_view_total_time";
const FEED_EXTRA_METRICS = "profile_visits,follows";
const INSIGHTS_BATCH_SIZE = 50; // limite da API de lote da Meta

interface MetaMedia {
  id: string;
  caption?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export interface MetaSyncEnv {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  // Processar todas as contas numa invocação só estourava os 300s da
  // função na Vercel (confirmado: FUNCTION_INVOCATION_TIMEOUT com só 2
  // contas). Passando isso, processa só essa conta — quem chama itera uma
  // por vez.
  onlyAccountId?: string;
  // Quantas páginas de /media (100 posts cada) processar nesta invocação —
  // mesmo uma conta só pode ter posts demais pra caber em 300s. Retorna
  // nextCursor/done pra quem chama continuar de onde parou.
  maxPages?: number;
  after?: string;
}

export interface MetaAccountSyncResult {
  accountId: string;
  clientId: string;
  igAccountId: string;
  posts: number;
  temasClassified: number;
  nextCursor: string | null;
  done: boolean;
  errors: string[];
}

// Pagina a mídia da conta, mais recente primeiro. Limitado a maxPages por
// chamada — processar o histórico inteiro (500+ posts) numa invocação só
// estourava os 300s da função na Vercel (confirmado por teste direto). Quem
// chama itera passando o cursor `next` de volta até `done: true`.
async function fetchMediaPage(
  igAccountId: string,
  accessToken: string,
  maxPages: number,
  after?: string,
): Promise<{ media: MetaMedia[]; nextCursor: string | null; done: boolean }> {
  // thumbnail_url só existe pra VIDEO (é o preview estático do vídeo) — post
  // de imagem não tem esse campo, só media_url (o arquivo em si). Pedir os
  // dois e escolher na hora de montar a linha é o que cobre os dois casos.
  const fields = "id,caption,timestamp,media_type,media_product_type,permalink,thumbnail_url,media_url";
  let url: string | null =
    `${GRAPH_BASE}/${igAccountId}/media?fields=${fields}&limit=100&access_token=${accessToken}` +
    (after ? `&after=${after}` : "");
  const all: MetaMedia[] = [];
  let nextCursor: string | null = null;
  let pagesLeft = maxPages;

  while (url && pagesLeft > 0) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Meta Graph media fetch failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: MetaMedia[];
      paging?: { next?: string; cursors?: { after?: string } };
    };
    all.push(...(body.data ?? []));
    nextCursor = body.paging?.cursors?.after ?? null;
    url = body.paging?.next ?? null;
    pagesLeft--;
  }
  return { media: all, nextCursor: url ? nextCursor : null, done: !url };
}

// Busca insights de até 50 posts por chamada via API de lote da Meta, em vez
// de uma chamada por post — pra 500+ posts isso é a diferença entre ~10
// chamadas e 500.
async function fetchInsightsBatch(
  mediaIds: string[],
  accessToken: string,
  metrics: string = INSIGHTS_METRICS,
): Promise<Map<string, Record<string, number>>> {
  const result = new Map<string, Record<string, number>>();
  if (mediaIds.length === 0) return result;

  for (const idsBatch of chunk(mediaIds, INSIGHTS_BATCH_SIZE)) {
    const batchPayload = idsBatch.map((id) => ({
      method: "GET",
      relative_url: `${id}/insights?metric=${metrics}`,
    }));

    const res = await fetch(`${GRAPH_BASE}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batchPayload) }),
    });
    if (!res.ok) {
      throw new Error(`Meta Graph batch insights failed (${res.status}): ${await res.text()}`);
    }
    const responses = (await res.json()) as { code: number; body: string }[];

    for (let i = 0; i < idsBatch.length; i++) {
      const id = idsBatch[i];
      const sub = responses[i];
      if (!sub || sub.code !== 200) continue; // posts antigos podem não ter insights disponíveis — não derruba o sync
      const parsed = JSON.parse(sub.body) as { data?: { name: string; values?: { value: number }[] }[] };
      const metrics: Record<string, number> = {};
      for (const m of parsed.data ?? []) metrics[m.name] = m.values?.[0]?.value ?? 0;
      result.set(id, metrics);
    }
  }
  return result;
}

async function syncAccountPosts(
  supabase: SupabaseClient<Database>,
  accessToken: string,
  accountId: string,
  igAccountId: string,
  clientId: string,
  maxPages: number,
  after: string | undefined,
): Promise<{ count: number; errors: string[]; nextCursor: string | null; done: boolean }> {
  const { media, nextCursor, done } = await fetchMediaPage(igAccountId, accessToken, maxPages, after);
  const insightsById = await fetchInsightsBatch(
    media.map((m) => m.id),
    accessToken,
  );

  // Passadas extras, tolerantes a falha: se a Meta recusar (métrica indisponível
  // pra conta, post antigo demais, permissão faltando), o sync segue com as
  // métricas base em vez de derrubar tudo.
  const reelIds = media.filter((m) => normalizeFormat(m.media_type, m.media_product_type) === "reels").map((m) => m.id);
  const feedIds = media.filter((m) => normalizeFormat(m.media_type, m.media_product_type) !== "reels").map((m) => m.id);
  const tolerate = () => new Map<string, Record<string, number>>();
  const reelsExtraById = await fetchInsightsBatch(reelIds, accessToken, REELS_EXTRA_METRICS).catch(tolerate);
  const feedExtraById = await fetchInsightsBatch(feedIds, accessToken, FEED_EXTRA_METRICS).catch(tolerate);

  const now = new Date().toISOString();
  const rows = media
    .filter((m) => m.id && m.timestamp)
    .map((m) => {
      const ins = insightsById.get(m.id) ?? {};
      const reelExtra = reelsExtraById.get(m.id) ?? {};
      const feedExtra = feedExtraById.get(m.id) ?? {};
      return {
        instagram_account_id: accountId,
        client_id: clientId,
        windsor_media_id: m.id,
        media_type: m.media_type ?? null,
        format: normalizeFormat(m.media_type, m.media_product_type) as any,
        permalink: m.permalink ?? null,
        thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
        caption: m.caption ?? null,
        posted_at: m.timestamp ?? null,
        reach: numOrNull(ins.reach),
        saved: numOrNull(ins.saved),
        likes: numOrNull(ins.likes),
        comments: numOrNull(ins.comments),
        shares: numOrNull(ins.shares),
        views: numOrNull(ins.views),
        engagement: numOrNull(ins.total_interactions),
        // A Graph API não expõe skip rate (só a Windsor expõe) — fica null
        // neste caminho, e o hook rate simplesmente não aparece pra essas
        // contas em vez de ser inventado.
        reel_avg_watch_time_ms: numOrNull(reelExtra.ig_reels_avg_watch_time),
        reel_total_watch_time_ms: numOrNull(reelExtra.ig_reels_video_view_total_time),
        profile_visits: numOrNull(feedExtra.profile_visits),
        media_follows: numOrNull(feedExtra.follows),
        metrics_updated_at: now,
      };
    });

  const errors: string[] = [];
  let count = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(batch, { onConflict: "instagram_account_id,windsor_media_id" });
    if (error) errors.push(`posts batch (${batch.length}): ${error.message}`);
    else count += batch.length;
  }
  return { count, errors, nextCursor, done };
}


// Total de seguidores de hoje, direto da Graph, gravado na linha do dia (só essa coluna, o resto da linha fica).
// A Graph só informa o valor atual, então o histórico nasce a partir daqui, um ponto por dia.
async function gravarSeguidoresDeHoje(
  supabase: SupabaseClient<Database>,
  igAccountId: string,
  accountId: string,
  clientId: string,
  token: string,
): Promise<string[]> {
  try {
    const r = await fetch(`${GRAPH_BASE}/${igAccountId}?fields=followers_count&access_token=${token}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [`seguidores: Graph respondeu ${r.status}`];
    const j = (await r.json()) as { followers_count?: number };
    if (typeof j.followers_count !== "number") return [];
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); // dia em Brasília
    const { error } = await supabase
      .from("instagram_account_daily_metrics")
      .upsert({ instagram_account_id: accountId, client_id: clientId, date: hoje, followers_count: j.followers_count } as never, {
        onConflict: "instagram_account_id,date",
      });
    return error ? [`seguidores: ${error.message}`] : [];
  } catch (e) {
    return [`seguidores: ${e instanceof Error ? e.message : String(e)}`];
  }
}


// Stories duram 24 horas e a Meta não devolve os que já saíram do ar. Por isso o que está no ar na hora do sync
// é gravado em instagram_stories (uma linha por story). Sem a tabela (migração ainda não aplicada), não faz nada.
export async function guardarStories(supabase: SupabaseClient<Database>, igAccountId: string, accountId: string, clientId: string, token: string): Promise<string[]> {
  try {
    const stories = await storiesAoVivo(token, igAccountId);
    if (stories.length === 0) return [];
    const linhas = stories.map((s) => ({
      client_id: clientId,
      instagram_account_id: accountId,
      ig_media_id: s.id,
      posted_at: s.postado_em,
      media_type: s.media_type,
      permalink: s.permalink,
      thumbnail_url: s.thumbnail_url,
      reach: s.alcance,
      views: s.views,
      replies: s.respostas,
      shares: s.compartilhamentos,
      total_interactions: s.interacoes,
      profile_visits: s.visitas_ao_perfil,
      follows: s.novos_seguidores,
      metrics_updated_at: new Date().toISOString(),
    }));
    const { error } = await (supabase as any).from("instagram_stories").upsert(linhas, { onConflict: "instagram_account_id,ig_media_id" });
    if (error) {
      // 42P01 = tabela inexistente: migração ainda não aplicada, não é falha do sync.
      if (error.code === "42P01" || /instagram_stories/.test(error.message ?? "")) return [];
      return [`stories: ${error.message}`];
    }
    return [];
  } catch (e) {
    return [`stories: ${e instanceof Error ? e.message : String(e)}`];
  }
}

// Reconstrói os últimos 28 dias de seguidores com os números REAIS da Meta: seguiram e deixaram de seguir por dia
// (follows_and_unfollows). Parte do total de hoje e volta dia a dia: total do dia anterior = total do dia menos o saldo.
// Só preenche dia sem total gravado, nunca sobrescreve o que foi medido. A Meta conta o dia no fuso da Califórnia.
export async function reconstruirSeguidores(supabase: SupabaseClient<Database>, igAccountId: string, accountId: string, clientId: string, token: string): Promise<string[]> {
  try {
    const hojeBr = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const desdeBr = new Date(Date.now() - 31 * 86400 * 1000).toISOString().slice(0, 10);
    const { data: lidos } = await supabase
      .from("instagram_account_daily_metrics")
      .select("date, followers_count")
      .eq("instagram_account_id", accountId)
      .gte("date", desdeBr);
    const conhecidos = new Map((lidos ?? []).filter((r) => r.followers_count != null).map((r) => [r.date as string, Number(r.followers_count)]));
    const totalHoje = conhecidos.get(hojeBr);
    if (totalHoje == null) return [];
    const faltando = Array.from({ length: 28 }, (_, i) => new Date(Date.now() - (i + 1) * 86400 * 1000 - 3 * 3600 * 1000).toISOString().slice(0, 10)).filter((d) => !conhecidos.has(d));
    if (faltando.length < 5) return [];

    // Início do dia atual na Califórnia, em segundos UTC.
    const agora = Date.now();
    const la = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(agora));
    const [ya, ma, da] = la.split("-").map(Number);
    const offs = (instante: number) => {
      const t = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).formatToParts(new Date(instante)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
      return -Number(/GMT([+-]\d+)/.exec(t)?.[1] ?? -8);
    };
    const meiaNoite = (ano: number, mes: number, dia: number) => Date.UTC(ano, mes - 1, dia) + offs(Date.UTC(ano, mes - 1, dia, 12)) * 3600_000;
    const fimDoDia0 = meiaNoite(ya, ma, da) / 1000; // início de hoje (LA) = fim do dia de ontem

    const saldo = async (de: number, ate: number): Promise<number> => {
      const c = await graphGet(token, `${igAccountId}/insights`, { metric: "follows_and_unfollows", period: "day", metric_type: "total_value", breakdown: "follow_type", since: de, until: ate });
      const r = c?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      const seg = Number(r.find((x: any) => x.dimension_values?.[0] === "FOLLOWER")?.value ?? 0);
      const per = Number(r.find((x: any) => x.dimension_values?.[0] === "NON_FOLLOWER")?.value ?? 0);
      return seg - per;
    };

    const parcial = await saldo(fimDoDia0, Math.floor(agora / 1000));
    const saldos: number[] = new Array(28).fill(0);
    for (let k = 0; k < 28; k += 7) {
      await Promise.all(
        Array.from({ length: Math.min(7, 28 - k) }, (_, j) => k + j).map(async (i) => {
          const ate = fimDoDia0 - i * 86400;
          // Janela de UM dia exato: do início do dia até 1 segundo antes do fim. Com 24 h cheias a Meta devolve dois dias.
          saldos[i] = await saldo(ate - 86400, ate - 1).catch(() => 0);
        }),
      );
    }
    // total ao fim do dia i = total ao fim do dia i-1 (mais recente) menos o saldo do dia i-1 ... partindo de hoje menos o saldo parcial.
    let total = totalHoje - parcial;
    const linhas: { instagram_account_id: string; client_id: string; date: string; followers_count: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const diaLA = new Date(meiaNoite(ya, ma, da) - (i + 1) * 86400_000 + 12 * 3600_000);
      const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(diaLA);
      if (!conhecidos.has(data) && data < hojeBr) linhas.push({ instagram_account_id: accountId, client_id: clientId, date: data, followers_count: Math.round(total) });
      total -= saldos[i];
    }
    if (linhas.length === 0) return [];
    // Linhas só com a coluna do total: o upsert não toca nas outras métricas do dia.
    const { error } = await supabase.from("instagram_account_daily_metrics").upsert(linhas as never, { onConflict: "instagram_account_id,date" });
    return error ? [`seguidores (histórico): ${error.message}`] : [];
  } catch (e) {
    return [`seguidores (histórico): ${e instanceof Error ? e.message : String(e)}`];
  }
}

async function classifyMissingTemas(
  supabase: SupabaseClient<Database>,
  accountId: string,
  igAccountId: string,
): Promise<{ count: number; errors: string[] }> {
  // Pagina explicitamente: o PostgREST corta em 1.000 linhas por padrão e não
  // avisa. Sem isso, conta com mais de mil posts sem tema ficava parcialmente
  // classificada e o sync reportava sucesso — e, pior, como não havia ordem
  // definida, cada nova rodada sorteava outras mil e os posts recentes (os
  // únicos que alguém consulta) podiam nunca ser alcançados. Foi o que
  // aconteceu com a Dra. Juliana Paola: 3.271 posts, e os 119 recentes sem
  // tema continuavam intactos depois de duas rodadas.
  const PAGINA = 1000;
  const rows: { id: string; caption: string | null }[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error: selectError } = await supabase
      .from("instagram_posts")
      .select("id, caption")
      .eq("instagram_account_id", accountId)
      .is("tema", null)
      // Ordem estável é o que garante paginação correta; posted_at desc ainda
      // coloca o conteúdo recente na frente, que é o que a tela mostra.
      .order("posted_at", { ascending: false, nullsFirst: false })
      .range(inicio, inicio + PAGINA - 1);
    if (selectError) return { count: 0, errors: [`classify select: ${selectError.message}`] };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGINA) break;
  }

  const idsByTema = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const tema = classifyTema(igAccountId, row.caption);
    if (!tema) continue;
    const ids = idsByTema.get(tema) ?? [];
    ids.push(row.id);
    idsByTema.set(tema, ids);
  }

  const errors: string[] = [];
  let count = 0;
  for (const [tema, ids] of idsByTema) {
    for (const batch of chunk(ids, BATCH_SIZE)) {
      const { error } = await supabase.from("instagram_posts").update({ tema }).in("id", batch);
      if (error) errors.push(`classify "${tema}" (${batch.length}): ${error.message}`);
      else count += batch.length;
    }
  }
  return { count, errors };
}

// Lista os IDs das contas que este sync alimenta (ativas, sync_source
// meta_graph). Existe pra que quem chama (o n8n) itere UMA conta por
// requisição — processar todas numa invocação só estoura o limite de tempo
// da função na Vercel. Reaproveita o mesmo SYNC_SECRET do endpoint, então
// o chamador não precisa de credencial do Supabase.
export async function listMetaGraphAccountIds(env: {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}): Promise<{ id: string; client_id: string }[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("id, client_id")
    .eq("active", true)
    .eq("sync_source", "meta_graph");
  if (error) throw error;
  return data ?? [];
}

// windsor_account_id guarda o Instagram Business Account ID — o mesmo
// identificador que a API direta da Meta usa, então não precisa de coluna
// nova pra mapear conta.
//
// O cursor de paginação fica salvo em instagram_backfill_state, não só na
// resposta HTTP — uma invocação na Vercel tem ~300s, então o backfill de
// uma conta grande precisa de várias chamadas, e não dá pra confiar em
// alguém capturar o `nextCursor` da resposta anterior pra passar na
// próxima (o status de execução do n8n fica "running" por minutos mesmo
// depois da chamada real já ter terminado). Com o estado no banco, basta
// chamar o endpoint de novo com os mesmos parâmetros que ele retoma
// sozinho. Uma vez concluído (backfill_done = true), a mesma chamada vira
// o sync incremental do dia a dia — busca só os posts mais recentes.
export async function runMetaGraphSync(env: MetaSyncEnv): Promise<MetaAccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Simétrico ao filtro em instagram-sync.ts: cada sync só enxerga as contas
  // que ele alimenta. Conta da Windsor passada por engano aqui sairia com
  // metade dos campos vazios, porque o token da Graph API não cobre ela.
  let query = supabase
    .from("instagram_accounts")
    .select("id, client_id, windsor_account_id")
    .eq("active", true)
    .eq("sync_source", "meta_graph");
  if (env.onlyAccountId) query = query.eq("id", env.onlyAccountId);
  const { data: accounts, error } = await query;
  if (error) throw error;

  const maxPages = env.maxPages ?? 3;
  const results: MetaAccountSyncResult[] = [];
  for (const account of accounts ?? []) {
    const errors: string[] = [];

    const { data: state } = await supabase
      .from("instagram_backfill_state")
      .select("next_cursor, backfill_done")
      .eq("instagram_account_id", account.id)
      .maybeSingle();

    // Backfill em andamento: retoma do cursor salvo. Backfill concluído (ou
    // nunca iniciado sem `after` explícito): busca a partir do topo — é o
    // comportamento certo tanto pra primeira leva quanto pro sync diário.
    const after = env.after ?? (state && !state.backfill_done ? (state.next_cursor ?? undefined) : undefined);

    // Token da conta quando existir; o do ambiente é a reserva. Nenhum token
    // cobre as duas Business Managers em uso, então um valor global obrigaria
    // a escolher qual cliente funciona.
    const { data: segredo } = await supabase
      .from("instagram_account_secrets")
      .select("meta_access_token")
      .eq("instagram_account_id", account.id)
      .maybeSingle();
    const tokenDaConta = segredo?.meta_access_token ?? env.accessToken;

    const vazio = { count: 0, errors: [] as string[], nextCursor: null as string | null, done: true };
    const buscar = (cursor: string | undefined, paginas: number) =>
      syncAccountPosts(
        supabase,
        tokenDaConta,
        account.id,
        account.windsor_account_id,
        account.client_id,
        paginas,
        cursor,
      );

    // Backfill em andamento (retomando de um cursor salvo): antes, a execução
    // só andava para TRÁS a partir do cursor e nunca relia o topo. Resultado:
    // conta com backfill inacabado deixava de ver post novo (e de atualizar
    // as métricas dos recentes) até o backfill terminar — e se o cursor
    // ficasse inválido, a conta congelava sem ninguém notar (caso da Dra.
    // Marcelly Achkar, parada em 18/09). Agora toda execução relê a primeira
    // página do topo antes de continuar o backfill.
    let postsTopo = 0;
    const retomando = !env.after && after !== undefined;
    if (retomando) {
      const topo = await buscar(undefined, 1).catch((err) => {
        errors.push(`posts (topo): ${err instanceof Error ? err.message : String(err)}`);
        return vazio;
      });
      postsTopo = topo.count;
      errors.push(...topo.errors);
    }

    let posts = await buscar(after, maxPages).catch((err) => {
      // Cursor salvo que a Meta não aceita mais (expirou/invalidou): em vez de
      // repetir o mesmo erro para sempre, descarta o cursor e recomeça o
      // backfill do topo. O upsert é idempotente, então não duplica nada.
      if (retomando) return null;
      errors.push(`posts: ${err instanceof Error ? err.message : String(err)}`);
      return vazio;
    });
    if (posts === null) {
      posts = await buscar(undefined, maxPages).catch((err) => {
        errors.push(`posts: ${err instanceof Error ? err.message : String(err)}`);
        return vazio;
      });
    }
    posts = { ...posts, count: posts.count + postsTopo };

    if (errors.length === 0) {
      const { error: stateError } = await supabase.from("instagram_backfill_state").upsert(
        {
          instagram_account_id: account.id,
          next_cursor: posts.done ? null : posts.nextCursor,
          backfill_done: posts.done,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "instagram_account_id" },
      );
      if (stateError) errors.push(`state upsert: ${stateError.message}`);
    }

    const temas = await classifyMissingTemas(supabase, account.id, account.windsor_account_id).catch((err) => {
      errors.push(`classify: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });

    const errosSeguidores = await gravarSeguidoresDeHoje(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta);
    errosSeguidores.push(...(await reconstruirSeguidores(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta)));
    errosSeguidores.push(...(await guardarStories(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta)));

    // Tema, funil e estágio por IA para o que as regras não cobrem (só roda com ANTHROPIC_API_KEY).
    const ia = await classificarConteudoComIA(supabase, account.id).catch((err) => ({
      count: 0,
      errors: [`conteudo-ia: ${err instanceof Error ? err.message : String(err)}`],
      pulado: undefined as string | undefined,
    }));

    results.push({
      accountId: account.id,
      clientId: account.client_id,
      igAccountId: account.windsor_account_id,
      posts: posts.count,
      temasClassified: temas.count + ia.count,
      nextCursor: posts.nextCursor,
      done: posts.done,
      errors: [...errors, ...posts.errors, ...temas.errors, ...ia.errors, ...errosSeguidores],
    });
  }
  return results;
}
