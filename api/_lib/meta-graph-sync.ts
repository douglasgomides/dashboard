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
import { storiesAoVivo, insightsDoStory, g as graphGet, type StoryAoVivo } from "./meta-audiencia.js";
import { graphPageUrl, integrationRequest } from "./integration-http.js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { janelaDoDia, laData, laMeiaNoiteMs, somarDias } from "./dia-meta.js";

const GRAPH_BASE = META_GRAPH_URL;
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
  // Relê à força as métricas diárias desde esta data (AAAA-MM-DD, dia da Califórnia), mesmo as que parecem completas.
  // Uso: corrigir dias gravados errados (ex.: 24/10/2026 em diante, pelo erro de horário de verão).
  relerDesde?: string;
  // Só atualiza os stories (leitura rápida), para rodar com mais frequência que o sync completo.
  soStories?: boolean;
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
    (after ? `&after=${encodeURIComponent(after)}` : "");
  const all: MetaMedia[] = [];
  let nextCursor: string | null = null;
  let pagesLeft = maxPages;

  while (url && pagesLeft > 0) {
    const res = await fetch(graphPageUrl(url), integrationRequest());
    if (!res.ok) {
      throw new Error(`Meta Graph media fetch failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data?: MetaMedia[];
      paging?: { next?: string; cursors?: { after?: string } };
    };
    if (!Array.isArray(body?.data)) throw new Error("Meta Graph media: resposta inválida, cursor preservado");
    all.push(...body.data);
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
  errors: string[] = [],
): Promise<Map<string, Record<string, number>>> {
  const result = new Map<string, Record<string, number>>();
  if (mediaIds.length === 0) return result;

  for (const idsBatch of chunk(mediaIds, INSIGHTS_BATCH_SIZE)) {
    // Lote que estoura o tempo (conta grande, posts antigos): divide ao meio até 5 posts. O que ainda assim falhar
    // fica sem métrica (o post é gravado mesmo assim) e entra em `errors`, em vez de derrubar a página inteira de 100 posts
    // (Doctor Creator e Douglas não conseguiam completar o histórico).
    const pedirLote = async (ids: string[]): Promise<({ code: number; body: string } | null)[]> => {
      const batchPayload = ids.map((id) => ({ method: "GET", relative_url: `${id}/insights?metric=${metrics}` }));
      try {
        const res = await fetch(`${GRAPH_BASE}/`, integrationRequest({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batchPayload) }),
        }));
        if (!res.ok) throw new Error(`Meta Graph batch insights failed (${res.status}): ${await res.text()}`);
        return (await res.json()) as { code: number; body: string }[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/timeout|aborted|timed out/i.test(msg)) throw err;
        if (ids.length > 5) {
          const meio = Math.ceil(ids.length / 2);
          return [...(await pedirLote(ids.slice(0, meio))), ...(await pedirLote(ids.slice(meio)))];
        }
        errors.push(`insights de ${ids.length} post(s): Meta não respondeu a tempo`);
        return ids.map(() => null);
      }
    };
    const responses = await pedirLote(idsBatch);

    for (let i = 0; i < idsBatch.length; i++) {
      const id = idsBatch[i];
      const sub = responses[i];
      if (!sub || sub.code !== 200) {
        // Subcódigo 2108006: o post é de antes de a conta virar comercial (ex.: post de 2016 do Douglas). A Meta nunca
        // mede esse post, em nenhuma rodada, então não é erro: contava como falha do sync em toda atualização manual.
        let semMedicaoPermanente = false;
        try {
          const e = JSON.parse(sub?.body ?? "{}")?.error;
          // Também permanente: vídeo antigo (IGTV/2020) cujo tipo de mídia a API de insights não suporta (HOMS, 2 posts).
          semMedicaoPermanente = e?.error_subcode === 2108006 || /does not support .* metric for this media product type/i.test(String(e?.message ?? ""));
        } catch { /* corpo inválido */ }
        if (!semMedicaoPermanente) errors.push(`insights ${id}: Graph respondeu ${sub?.code ?? "sem resposta"}`);
        continue;
      }
      try {
        const parsed = JSON.parse(sub.body) as { data?: { name: string; values?: { value: number }[] }[] };
        const metrics: Record<string, number> = {};
        for (const m of parsed.data ?? []) {
          const value = numOrNull(m.values?.[0]?.value);
          if (value !== null) metrics[m.name] = value;
        }
        result.set(id, metrics);
      } catch {
        errors.push(`insights ${id}: resposta inválida da Graph`);
      }
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
): Promise<{ count: number; errors: string[]; nextCursor: string | null; done: boolean; persisted: boolean; vistos: { id: string; timestamp: string }[] }> {
  const { media, nextCursor, done } = await fetchMediaPage(igAccountId, accessToken, maxPages, after);
  const errors: string[] = [];
  const insightsById = await fetchInsightsBatch(
    media.map((m) => m.id),
    accessToken,
    INSIGHTS_METRICS,
    errors,
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
      // Ausência de métrica não é um valor novo: omitir preserva o snapshot anterior.
      const metricFields: Record<string, number> = {};
      for (const [column, value] of Object.entries({
        reach: ins.reach,
        saved: ins.saved,
        likes: ins.likes,
        comments: ins.comments,
        shares: ins.shares,
        views: ins.views,
        engagement: ins.total_interactions,
        reel_avg_watch_time_ms: reelExtra.ig_reels_avg_watch_time,
        reel_total_watch_time_ms: reelExtra.ig_reels_video_view_total_time,
        profile_visits: feedExtra.profile_visits,
        media_follows: feedExtra.follows,
      })) {
        if (value !== undefined) metricFields[column] = value;
      }
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
        ...metricFields,
        ...(Object.keys(ins).length > 0 ? { metrics_updated_at: now } : {}),
      };
    });

  // PostgREST usa a união das colunas do lote. Misturar patches diferentes
  // preencheria com null as métricas omitidas nas demais linhas.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = Object.keys(row).sort().join(",");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  let count = 0;
  let persisted = true;
  for (const batch of [...groups.values()].flatMap((group) => chunk(group, BATCH_SIZE))) {
    const { error } = await supabase
      .from("instagram_posts")
      .upsert(batch, { onConflict: "instagram_account_id,windsor_media_id" });
    if (error) {
      errors.push(`posts batch (${batch.length}): ${error.message}`);
      persisted = false;
    }
    else count += batch.length;
  }
  const vistos = media.filter((m) => m.id && m.timestamp).map((m) => ({ id: m.id, timestamp: m.timestamp as string }));
  return { count, errors, nextCursor, done, persisted, vistos };
}

/** Acima disto (ou de 5% da listagem) de posts "sumidos" numa mesma listagem, desconfia da resposta e não marca nada. */
const MAX_REMOVIDOS_POR_RODADA = 10;

/**
 * Posts apagados ou arquivados no Instagram somem da listagem /media, mas continuavam no Nexo contando nos "posts do
 * período" e nas médias (auditoria de 01/11/2026: Doctor Creator com 13 posts em 27-30/10, a Meta com 10).
 * A listagem a partir do topo é contínua: todo post publicado entre o mais antigo e o mais novo que ela trouxe
 * deveria estar nela. O que está no banco nesse intervalo e não veio é marcado com removido_em (nada é apagado; as
 * telas e os agentes filtram removido_em is null). Se a listagem chegou ao fim (done), o intervalo vai até o começo.
 * Post marcado que volta a aparecer (desarquivado) perde a marca.
 */
export async function marcarPostsRemovidos(
  supabase: SupabaseClient<Database>,
  accountId: string,
  vistos: { id: string; timestamp: string }[],
  listagemAteOFim: boolean,
): Promise<{ removidos: number; errors: string[] }> {
  if (vistos.length === 0) return { removidos: 0, errors: [] };
  const ids = vistos.map((v) => v.id);
  const errors: string[] = [];
  // Limite inferior = o ÚLTIMO item na ordem da Meta (do mais novo para o mais antigo), não o menor timestamp: post
  // fixado no topo do perfil pode ser antigo e alargaria o intervalo para posts que a listagem nem chegou a cobrir.
  const maisAntigo = new Date(Date.parse(vistos[vistos.length - 1].timestamp)).toISOString();
  // Volta a contar o post que reapareceu.
  for (const lote of chunk(ids, BATCH_SIZE)) {
    const { error } = await supabase.from("instagram_posts").update({ removido_em: null })
      .eq("instagram_account_id", accountId).in("windsor_media_id", lote).not("removido_em", "is", null);
    if (error) { errors.push(`posts removidos: ${error.message}`); return { removidos: 0, errors }; }
  }
  const noBanco: { id: string; windsor_media_id: string | null }[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    let q = supabase.from("instagram_posts").select("id, windsor_media_id")
      .eq("instagram_account_id", accountId).is("removido_em", null).not("windsor_media_id", "is", null);
    if (!listagemAteOFim) q = q.gte("posted_at", maisAntigo);
    const { data, error } = await q.order("id").range(inicio, inicio + 999);
    if (error) { errors.push(`posts removidos: ${error.message}`); return { removidos: 0, errors }; }
    noBanco.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const vistosSet = new Set(ids);
  const sumidos = noBanco.filter((p) => p.windsor_media_id && !vistosSet.has(p.windsor_media_id)).map((p) => p.id);
  if (sumidos.length === 0) return { removidos: 0, errors };
  if (sumidos.length > Math.max(MAX_REMOVIDOS_POR_RODADA, Math.ceil(vistos.length * 0.05))) {
    errors.push(`posts removidos: ${sumidos.length} posts não vieram na listagem da Meta; nada foi marcado (conferir a conta)`);
    return { removidos: 0, errors };
  }
  const { error } = await supabase.from("instagram_posts").update({ removido_em: new Date().toISOString() }).in("id", sumidos);
  if (error) { errors.push(`posts removidos: ${error.message}`); return { removidos: 0, errors }; }
  return { removidos: sumidos.length, errors };
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
// A métrica que a Meta não devolveu nesta leitura fica de fora da linha: não apaga (nem zera) a leitura anterior.
// Além dos que estão na lista "no ar", relê pelo id os stories gravados que ainda estão dentro de 24 h + margem
// (STORY_RELEITURA_HORAS): a lista pode deixar de trazê-los antes do fim, e o número final ficava parado em ~15 h.
export const STORY_RELEITURA_HORAS = 26;
const COLUNAS_STORY: [keyof StoryAoVivo, string][] = [
  ["alcance", "reach"], ["views", "views"], ["respostas", "replies"], ["compartilhamentos", "shares"],
  ["interacoes", "total_interactions"], ["visitas_ao_perfil", "profile_visits"], ["novos_seguidores", "follows"],
];
const DA_METRICA: Record<string, string> = { reach: "reach", views: "views", replies: "replies", shares: "shares", total_interactions: "total_interactions", profile_visits: "profile_visits", follows: "follows" };

export async function guardarStories(supabase: SupabaseClient<Database>, igAccountId: string, accountId: string, clientId: string, token: string): Promise<string[]> {
  try {
    const stories = await storiesAoVivo(token, igAccountId);
    const agora = new Date().toISOString();
    const linhas: Record<string, unknown>[] = stories.map((s) => {
      const linha: Record<string, unknown> = {
        client_id: clientId,
        instagram_account_id: accountId,
        ig_media_id: s.id,
        posted_at: s.postado_em,
        media_type: s.media_type,
        permalink: s.permalink,
        thumbnail_url: s.thumbnail_url,
      };
      let medido = false;
      for (const [campo, coluna] of COLUNAS_STORY) { const v = s[campo]; if (typeof v === "number") { linha[coluna] = v; medido = true; } }
      if (medido) linha.metrics_updated_at = agora;
      return linha;
    });

    // Stories gravados que ainda podem ter número novo e não vieram na lista.
    const noAr = new Set(stories.map((s) => s.id));
    const { data: recentes, error: erroRecentes } = await (supabase as any)
      .from("instagram_stories")
      .select("ig_media_id")
      .eq("instagram_account_id", accountId)
      .gte("posted_at", new Date(Date.now() - STORY_RELEITURA_HORAS * 3600_000).toISOString())
      .limit(200);
    if (erroRecentes && !(erroRecentes.code === "42P01" || /instagram_stories/.test(erroRecentes.message ?? ""))) return [`stories: ${erroRecentes.message}`];
    const faltam = ((recentes ?? []) as { ig_media_id: string }[]).map((r) => r.ig_media_id).filter((id) => id && !noAr.has(id));
    for (let i = 0; i < faltam.length; i += 5) {
      const lidos = await Promise.all(faltam.slice(i, i + 5).map(async (id) => ({ id, m: await insightsDoStory(token, id) })));
      for (const { id, m } of lidos) {
        const linha: Record<string, unknown> = { client_id: clientId, instagram_account_id: accountId, ig_media_id: id };
        for (const [nome, coluna] of Object.entries(DA_METRICA)) if (typeof m[nome] === "number") linha[coluna] = m[nome];
        if (Object.keys(linha).length > 3) { linha.metrics_updated_at = agora; linhas.push(linha); }
      }
    }
    if (linhas.length === 0) return [];

    // Mesmo conjunto de colunas por lote: o upsert em lote preencheria com null a coluna que falta.
    const grupos = new Map<string, Record<string, unknown>[]>();
    for (const l of linhas) { const k = Object.keys(l).sort().join(","); grupos.set(k, [...(grupos.get(k) ?? []), l]); }
    for (const grupo of grupos.values()) {
      const { error } = await (supabase as any).from("instagram_stories").upsert(grupo, { onConflict: "instagram_account_id,ig_media_id" });
      if (error) {
        // 42P01 = tabela inexistente: migração ainda não aplicada, não é falha do sync.
        if (error.code === "42P01" || /instagram_stories/.test(error.message ?? "")) return [];
        return [`stories: ${error.message}`];
      }
    }
    return [];
  } catch (e) {
    return [`stories: ${e instanceof Error ? e.message : String(e)}`];
  }
}

// Seguiram e deixaram de seguir num intervalo (follows_and_unfollows por follow_type).
// "vazio": a Meta respondeu sem o detalhamento (dia ainda aberto ou sem medida: a doc diz que vem "empty data set
// instead of 0"). Isso NÃO é "0 seguidores novos": quem chama grava null e relê depois. Erro de chamada sobe.
export type SeguiramEDeixaram = { status: "ok"; novos: number; saidas: number } | { status: "vazio" };
export async function lerSeguiramEDeixaram(token: string, igId: string, since: number, until: number): Promise<SeguiramEDeixaram> {
  const c = await graphGet(token, `${igId}/insights`, { metric: "follows_and_unfollows", period: "day", metric_type: "total_value", breakdown: "follow_type", since, until });
  const r: any[] = c?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  const valor = (k: string) => { const v = Number(r.find((x: any) => x.dimension_values?.[0] === k)?.value); return Number.isFinite(v) ? v : null; };
  const novos = valor("FOLLOWER"), saidas = valor("NON_FOLLOWER");
  if (novos == null && saidas == null) return { status: "vazio" };
  // Com o detalhamento presente, o tipo que falta é zero de fato (a Meta só lista quem teve movimento).
  return { status: "ok", novos: novos ?? 0, saidas: saidas ?? 0 };
}

// Reconstrói os últimos 28 dias de seguidores com os números REAIS da Meta: seguiram e deixaram de seguir por dia
// (follows_and_unfollows). Parte do total de hoje e volta dia a dia: total do dia anterior = total do dia menos o saldo.
// Só preenche dia sem total gravado, nunca sobrescreve o que foi medido. A Meta conta o dia no fuso da Califórnia,
// e cada dia tem a sua própria meia-noite (dia-meta.ts): voltar de 24 em 24 horas errava 1 hora depois da mudança
// de horário dos EUA. Se um dia falhar ou vier sem dado, a reconstrução PARA ali: antes a falha virava saldo 0 e
// todos os totais mais antigos saíam errados sem aviso.
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

    const agora = Date.now();
    const hojeLa = laData(agora);
    const inicioDeHoje = Math.floor(laMeiaNoiteMs(hojeLa) / 1000);
    const erros: string[] = [];
    const saldo = async (de: number, ate: number): Promise<number | null> => {
      try {
        const f = await lerSeguiramEDeixaram(token, igAccountId, de, ate);
        return f.status === "ok" ? f.novos - f.saidas : null;
      } catch (e) {
        erros.push(`seguidores (histórico): ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    };

    const parcial = await saldo(inicioDeHoje, Math.floor(agora / 1000));
    if (parcial == null) return erros.slice(0, 1);
    // saldos[i] = saldo do dia i+1 antes de hoje (Califórnia).
    const dias = Array.from({ length: 28 }, (_, i) => janelaDoDia(somarDias(hojeLa, -(i + 1))));
    const saldos: (number | null)[] = new Array(28).fill(null);
    for (let k = 0; k < 28; k += 7) {
      await Promise.all(dias.slice(k, k + 7).map(async (d, j) => { saldos[k + j] = await saldo(d.since, d.until); }));
    }
    // total ao fim do dia i = total ao fim do dia mais recente menos o saldo daquele dia, partindo de hoje menos o parcial.
    let total = totalHoje - parcial;
    const linhas: { instagram_account_id: string; client_id: string; date: string; followers_count: number }[] = [];
    for (let i = 0; i < 28; i++) {
      const data = dias[i].data;
      if (!conhecidos.has(data) && data < hojeBr) linhas.push({ instagram_account_id: accountId, client_id: clientId, date: data, followers_count: Math.round(total) });
      const s = saldos[i];
      if (s == null) break; // sem o saldo deste dia, o total dos dias mais antigos seria inventado
      total -= s;
    }
    if (linhas.length > 0) {
      // Linhas só com a coluna do total: o upsert não toca nas outras métricas do dia.
      const { error } = await supabase.from("instagram_account_daily_metrics").upsert(linhas as never, { onConflict: "instagram_account_id,date" });
      if (error) erros.push(`seguidores (histórico): ${error.message}`);
    }
    return erros.slice(0, 1);
  } catch (e) {
    return [`seguidores (histórico): ${e instanceof Error ? e.message : String(e)}`];
  }
}

// ---- Métricas diárias da conta direto da Graph ----
// Alcance, interações, salvos, compartilhamentos, toques no perfil, novos seguidores e saídas por dia.
// A Meta conta o dia no fuso da Califórnia e leva ~2 dias para fechar; o dia gravado é o da Califórnia (igual a
// reconstruirSeguidores), e a janela de cada dia vem de janelaDoDia (meia-noite daquela data até a do dia seguinte).
/** Quantos dias para trás a Graph é relida em busca de dia incompleto. */
const JANELA_GRAPH_DIAS = 120;
/** Dias forçados por rodada com relerDesde (o resto fica para a rodada seguinte com o mesmo parâmetro). */
const MAX_RELEITURA_FORCADA = 60;
/** Dia com 0 seguidores novos E 0 saídas e alcance a partir disto é tratado como não medido (relido). */
const ALCANCE_MINIMO_ZERO_SUSPEITO = 500;
const METRICAS_DIA = ["reach", "total_interactions", "likes", "comments", "saves", "shares", "profile_links_taps"] as const;

async function metricasDoDia(token: string, igId: string, since: number, until: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ler = async (lista: string[]) => {
    const c = await graphGet(token, `${igId}/insights`, { metric: lista.join(","), period: "day", metric_type: "total_value", since, until });
    for (const d of c?.data ?? []) { const v = d?.total_value?.value; if (typeof v === "number" && Number.isFinite(v)) { out[d.name] = v; } }
  };
  try { await ler([...METRICAS_DIA]); }
  catch { for (const m of METRICAS_DIA) { try { await ler([m]); } catch { /* métrica que esta conta não expõe */ } } }
  return out;
}

type LinhaDiaria = { date: string; reach: number | null; new_followers: number | null; unfollowers: number | null };

/**
 * Um dia gravado só é "completo" (não precisa ser relido) quando tem alcance, novos E saídas. Não contam como completos:
 * - zero em tudo (Windsor que travou);
 * - novos = 0 com saídas vazias (formato da Windsor de reserva: Douglas e Lana em 24-25/08, Doctor Creator em 29-30/09);
 * - 0 novos e 0 saídas com alcance alto (dia aberto gravado como zero).
 */
export function diaCompleto(r: LinhaDiaria): boolean {
  if (r.reach == null || r.new_followers == null || r.unfollowers == null) return false;
  if (r.reach === 0 && r.new_followers === 0) return false;
  if (r.new_followers === 0 && r.unfollowers === 0 && r.reach >= ALCANCE_MINIMO_ZERO_SUSPEITO) return false;
  return true;
}

/**
 * Quais dias (Califórnia) reler nesta rodada: sempre os 7 fechados mais recentes (k=2..8, a Meta ainda revisa),
 * depois os forçados por relerDesde (do mais antigo para o mais novo) e, por fim, até 28 dias incompletos mais
 * antigos (primeiro os do último mês, do mais antigo para o mais novo; depois os demais).
 */
export function diasParaReler(hojeLa: string, completos: Set<string>, relerDesde?: string): string[] {
  const dataK = (k: number) => somarDias(hojeLa, -k);
  const alvo: string[] = [];
  for (let k = 2; k < 9; k++) alvo.push(dataK(k));
  const vistos = new Set(alvo);
  if (relerDesde && /^\d{4}-\d{2}-\d{2}$/.test(relerDesde)) {
    const limite = dataK(JANELA_GRAPH_DIAS - 1);
    const forcados: string[] = [];
    for (let d = relerDesde < limite ? limite : relerDesde; d <= dataK(2); d = somarDias(d, 1)) if (!vistos.has(d)) forcados.push(d);
    for (const d of forcados.slice(0, MAX_RELEITURA_FORCADA)) { alvo.push(d); vistos.add(d); }
  }
  const buracos = Array.from({ length: JANELA_GRAPH_DIAS - 9 }, (_, i) => 9 + i).filter((k) => !completos.has(dataK(k)) && !vistos.has(dataK(k)));
  const recentes = buracos.filter((k) => k <= 30).sort((a, b) => b - a);
  const antigos = buracos.filter((k) => k > 30);
  for (const k of [...recentes, ...antigos].slice(0, 28)) alvo.push(dataK(k));
  return alvo;
}

export async function gravarMetricasDiariasPelaGraph(
  supabase: SupabaseClient<Database>,
  igAccountId: string,
  accountId: string,
  clientId: string,
  token: string,
  relerDesde?: string,
): Promise<string[]> {
  try {
    // A Meta é a fonte destas métricas (validado contra a Windsor em 19/10/2026: alcance, novos seguidores e saídas
    // batem dia a dia). Toda rodada relê os 7 últimos dias fechados e até 28 dias incompletos mais antigos.
    const hojeLa = laData(Date.now());
    // Dias completos dos últimos 120 dias (a Meta guarda as métricas diárias por pelo menos 6 meses: auditoria de
    // 30/10/2026). Antes a busca parava no último dia completo e nunca voltava a um buraco mais antigo.
    const { data: lidos } = await supabase
      .from("instagram_account_daily_metrics")
      .select("date, reach, new_followers, unfollowers")
      .eq("instagram_account_id", accountId)
      .gte("date", somarDias(hojeLa, -JANELA_GRAPH_DIAS));
    const completos = new Set(((lidos ?? []) as LinhaDiaria[]).filter(diaCompleto).map((r) => r.date));
    const alvo = diasParaReler(hojeLa, completos, relerDesde).map(janelaDoDia);

    const linhas: Record<string, unknown>[] = [];
    for (let i = 0; i < alvo.length; i += 7) {
      await Promise.all(alvo.slice(i, i + 7).map(async (d) => {
        const [m, f] = await Promise.all([
          metricasDoDia(token, igAccountId, d.since, d.until),
          lerSeguiramEDeixaram(token, igAccountId, d.since, d.until).catch(() => null),
        ]);
        const linha: Record<string, unknown> = { instagram_account_id: accountId, client_id: clientId, date: d.data };
        for (const k of METRICAS_DIA) if (k in m) linha[k] = m[k];
        const temMetrica = Object.keys(linha).length > 3;
        if (f?.status === "ok") { linha.new_followers = f.novos; linha.unfollowers = f.saidas; }
        // A Meta respondeu o dia sem o detalhamento: "sem dado", não "0 seguidores novos". Fica null e o dia é relido.
        // Só grava o null quando a Meta devolveu outras métricas do dia (resposta vazia em tudo pode ser instabilidade).
        else if (f?.status === "vazio" && temMetrica) { linha.new_followers = null; linha.unfollowers = null; }
        // Erro na chamada (f = null): não grava as colunas, o valor anterior fica.
        if (Object.keys(linha).length > 3) { linhas.push(linha); } // só grava o dia se a Meta devolveu alguma métrica
      }));
    }
    if (linhas.length === 0) { return ["métricas diárias pela Graph: a Meta não devolveu nenhuma métrica"]; }
    // Cada grupo tem o mesmo conjunto de colunas (o upsert em lote preenche com null a coluna que falta).
    const grupos = new Map<string, Record<string, unknown>[]>();
    for (const l of linhas) { const k = Object.keys(l).sort().join(","); grupos.set(k, [...(grupos.get(k) ?? []), l]); }
    for (const g of grupos.values()) {
      const { error } = await supabase.from("instagram_account_daily_metrics").upsert(g as never, { onConflict: "instagram_account_id,date" });
      if (error) { return [`métricas diárias pela Graph: ${error.message}`]; }
    }
    return [];
  } catch (e) {
    return [`métricas diárias pela Graph: ${e instanceof Error ? e.message : String(e)}`];
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
  // Só de cliente ativo: a conta de cliente inativo (Dra. Juliana Carrion) seguia sendo lida a cada hora, gastando
  // chamadas da Meta e gerando alerta de dia zerado para quem nem está no painel (auditoria de 30/10/2026).
  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("id, client_id, clients!inner(active)")
    .eq("active", true)
    .eq("sync_source", "meta_graph")
    .eq("clients.active", true);
  if (error) throw error;
  return (data ?? []).map((a) => ({ id: a.id, client_id: a.client_id }));
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

    if (env.soStories) {
      results.push({ accountId: account.id, clientId: account.client_id, igAccountId: account.windsor_account_id, posts: 0, temasClassified: 0,
        nextCursor: null, done: true, errors: await guardarStories(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta) });
      continue;
    }

    const vazio = { count: 0, errors: [] as string[], nextCursor: null as string | null, done: true, persisted: false, vistos: [] as { id: string; timestamp: string }[] };
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
    let topoPersistido = true;
    const retomando = !env.after && after !== undefined;
    if (retomando) {
      const topo = await buscar(undefined, 1).catch((err) => {
        errors.push(`posts (topo): ${err instanceof Error ? err.message : String(err)}`);
        return vazio;
      });
      postsTopo = topo.count;
      topoPersistido = topo.persisted;
      errors.push(...topo.errors);
      if (topo.persisted) errors.push(...(await marcarPostsRemovidos(supabase, account.id, topo.vistos, topo.done)).errors);
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
    // Sem cursor (after undefined), a listagem começou do topo: serve para achar post apagado/arquivado.
    // Retomando o backfill, quem faz isso é a releitura do topo acima.
    if (!retomando && after === undefined && posts.persisted) errors.push(...(await marcarPostsRemovidos(supabase, account.id, posts.vistos, posts.done)).errors);
    posts = { ...posts, count: posts.count + postsTopo };
    errors.push(...posts.errors);

    let progressoGravado = false;
    // Insights indisponíveis preservam as métricas e ficam no diagnóstico;
    // não prendem o histórico em posts antigos que a Meta não mede mais.
    if (posts.persisted && topoPersistido) {
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
      else progressoGravado = true;
    }

    const temas = await classifyMissingTemas(supabase, account.id, account.windsor_account_id).catch((err) => {
      errors.push(`classify: ${err instanceof Error ? err.message : String(err)}`);
      return { count: 0, errors: [] };
    });

    const errosSeguidores = await gravarSeguidoresDeHoje(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta);
    errosSeguidores.push(...(await reconstruirSeguidores(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta)));
    errosSeguidores.push(...(await guardarStories(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta)));
    errosSeguidores.push(...(await gravarMetricasDiariasPelaGraph(supabase, account.windsor_account_id, account.id, account.client_id, tokenDaConta, env.relerDesde)));

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
      nextCursor: progressoGravado ? posts.nextCursor : (after ?? null),
      done: progressoGravado && posts.done,
      errors: [...errors, ...temas.errors, ...ia.errors, ...errosSeguidores],
    });
  }
  return results;
}
