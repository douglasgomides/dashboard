/**
 * Sync de comentários dos posts via Meta Graph API. Matéria-prima pra pauta
 * (dúvidas reais que pacientes deixam) — não interpreta nem resume, só
 * classifica se é pergunta (heurística, sem IA) e guarda.
 *
 * Mesmo problema de limite de tempo do sync de posts (api/_lib/meta-graph-
 * sync.ts): uma invocação na Vercel não dá conta de puxar comentário do
 * histórico inteiro de uma vez. Usa o mesmo padrão — processa um lote de
 * posts (mais recentes primeiro) por chamada, com cursor salvo em
 * instagram_comments_sync_state pra retomar sozinho. Uma vez que o backlog
 * acaba, as chamadas seguintes (via o mesmo job diário) naturalmente só
 * pegam comentário novo dos posts mais recentes — sem trabalho extra.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { isQuestion } from "./question-classifier.js";
import { graphPageUrl, integrationRequest } from "./integration-http.js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { ehLimiteMeta, falharPorLimiteNoLote, fetchMeta, limiteNoLote } from "./meta-limite.js";

const GRAPH_BASE = META_GRAPH_URL;
const COMMENTS_BATCH_SIZE = 50; // limite da API de lote da Meta

interface MetaComment {
  id: string;
  text?: string;
  username?: string;
  like_count?: number;
  timestamp?: string;
  replies?: { data?: MetaComment[]; paging?: { next?: string } };
}

// Respostas entram como comentários: uma dúvida de paciente muitas vezes vem na
// resposta a outro comentário, e antes elas nem eram buscadas.
const CAMPOS_COMENTARIO = "id,text,username,like_count,timestamp,replies.limit(50){id,text,username,like_count,timestamp}";

// Teto de páginas extras por chamada (cada uma é um request). Post com 219
// comentários precisa de 5 páginas de 50. Sem teto, um post viral gasta o tempo
// da função e o resto do perfil fica sem ler.
const PAGINAS_EXTRAS_POR_CHAMADA = 120;

// Achata comentários e respostas. Comentário com mais de 50 respostas traz replies.paging.next: essa URL vai para
// `proximasRespostas` e é seguida depois (antes as respostas além da 50ª eram perdidas).
function achatar(lista: MetaComment[] | undefined, proximasRespostas?: string[]): MetaComment[] {
  const out: MetaComment[] = [];
  for (const c of lista ?? []) {
    out.push(c);
    for (const r of c.replies?.data ?? []) out.push(r);
    if (c.replies?.paging?.next && proximasRespostas) proximasRespostas.push(c.replies.paging.next);
  }
  return out;
}

export interface ResultadoLote {
  comentarios: Map<string, MetaComment[]>;
  /** Posts que falharam nesta rodada (registrados em errors). */
  falharam: Set<string>;
}

export interface CommentsSyncEnv {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyAccountId?: string;
  maxPosts?: number;
}

export interface CommentsAccountSyncResult {
  accountId: string;
  clientId: string;
  postsChecked: number;
  comments: number;
  questions: number;
  done: boolean;
  errors: string[];
  /** Posts cujos comentários não puderam ser lidos nesta rodada. */
  failedPosts?: string[];
}

export async function fetchCommentsBatch(
  postsWithMediaId: { id: string; windsor_media_id: string }[],
  accessToken: string,
  errors: string[],
): Promise<ResultadoLote> {
  const result = new Map<string, MetaComment[]>();
  const falharam = new Set<string>();
  // Páginas a seguir: de comentários do post ou de respostas de um comentário (as duas devolvem lista de comentários).
  const proximas: { postId: string; url: string; respostas: boolean }[] = [];
  const empilharRespostas = (postId: string, urls: string[]) => { for (const url of urls) proximas.push({ postId, url, respostas: true }); };

  for (let i = 0; i < postsWithMediaId.length; i += COMMENTS_BATCH_SIZE) {
    const batch = postsWithMediaId.slice(i, i + COMMENTS_BATCH_SIZE);
    const batchPayload = batch.map((p) => ({
      method: "GET",
      relative_url: `${p.windsor_media_id}/comments?fields=${CAMPOS_COMENTARIO}&limit=50`,
    }));
    const pedidoLote = integrationRequest({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, batch: JSON.stringify(batchPayload) }),
    });
    const res = await fetchMeta(`${GRAPH_BASE}/`, pedidoLote);
    if (!res.ok) {
      throw new Error(`Meta Graph batch comments failed (${res.status}): ${await res.text()}`);
    }
    const responses = (await res.json()) as { code: number; body: string }[];
    // Sub-resposta com erro de limite (4/17/32/613...): para aqui em vez de seguir pedindo os outros lotes.
    for (const sub of responses ?? []) {
      const codigo = limiteNoLote(sub);
      if (codigo != null) falharPorLimiteNoLote(`${GRAPH_BASE}/`, pedidoLote, codigo);
    }
    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const sub = responses[j];
      if (!sub || sub.code !== 200) {
        // Subcódigo 33: o post foi apagado no Instagram (ou saiu da visibilidade da conta). Não é falha do sync: some da próxima
        // listagem sozinho, e contava como erro vermelho de "comentários" no painel do cliente.
        let apagado = false;
        try { apagado = JSON.parse(sub?.body ?? "{}")?.error?.error_subcode === 33; } catch { /* corpo inválido */ }
        if (!apagado) { errors.push(`comentários ${post.id}: Graph respondeu ${sub?.code ?? "sem resposta"}`); falharam.add(post.id); }
        continue;
      }
      try {
        const parsed = JSON.parse(sub.body) as { data?: MetaComment[]; paging?: { next?: string } };
        if (!Array.isArray(parsed?.data)) throw new Error("página inválida");
        const urlsRespostas: string[] = [];
        result.set(post.id, achatar(parsed.data, urlsRespostas));
        if (parsed.paging?.next) proximas.push({ postId: post.id, url: parsed.paging.next, respostas: false });
        empilharRespostas(post.id, urlsRespostas);
      } catch { errors.push(`comentários ${post.id}: resposta inválida da Graph`); falharam.add(post.id); }
    }
  }

  // O lote só devolve a 1ª página de 50 de cada post. Segue o cursor dos que têm
  // mais, com teto de requests por chamada (o resto fica para a próxima rodada).
  let gastas = 0;
  while (proximas.length > 0 && gastas < PAGINAS_EXTRAS_POR_CHAMADA) {
    const item = proximas.shift()!;
    gastas++;
    try {
      const res = await fetchMeta(graphPageUrl(item.url), integrationRequest());
      if (!res.ok) { errors.push(`comentários ${item.postId}: página respondeu ${res.status}`); falharam.add(item.postId); continue; }
      const parsed = (await res.json()) as { data?: MetaComment[]; paging?: { next?: string } };
      if (!Array.isArray(parsed?.data)) throw new Error("página inválida");
      const atual = result.get(item.postId) ?? [];
      const urlsRespostas: string[] = [];
      // Página de respostas: os itens já são respostas (sem respostas dentro).
      atual.push(...(item.respostas ? parsed.data : achatar(parsed.data, urlsRespostas)));
      result.set(item.postId, atual);
      if (parsed.paging?.next) proximas.push({ postId: item.postId, url: parsed.paging.next, respostas: item.respostas });
      empilharRespostas(item.postId, urlsRespostas);
    } catch (e) {
      if (ehLimiteMeta(e)) throw e; // limite da Meta: não segue pedindo as outras páginas
      errors.push(`comentários ${item.postId}: não foi possível ler a página`); falharam.add(item.postId);
    }
  }
  if (proximas.length) {
    errors.push("Comentários incompletos: limite de páginas extras atingido");
    for (const p of proximas) falharam.add(p.postId);
  }
  return { comentarios: result, falharam };
}

export async function runMetaCommentsSync(env: CommentsSyncEnv): Promise<CommentsAccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // O token vem por conta quando existir, e cai no do ambiente quando não.
  // Existem duas Business Managers em jogo e nenhum token cobre as duas: um
  // valor global obrigaria a escolher qual cliente funciona.
  let query = supabase.from("instagram_accounts").select("id, client_id").eq("active", true);
  if (env.onlyAccountId) query = query.eq("id", env.onlyAccountId);
  const { data: accounts, error } = await query;
  if (error) throw error;

  // Token por conta, com o do ambiente como reserva. Nenhum token cobre as
  // duas Business Managers em uso, então um valor global obrigaria a escolher
  // qual cliente funciona. Consulta separada porque a tabela de segredos é
  // legível só por admin (e pelo service role daqui).
  const tokensPorConta = new Map<string, string>();
  {
    const { data: segredos, error: erroSegredos } = await supabase
      .from("instagram_account_secrets")
      .select("instagram_account_id, meta_access_token");
    if (erroSegredos) throw new Error(`Não foi possível carregar os tokens de comentários: ${erroSegredos.message}`);
    for (const seg of segredos ?? []) {
      if (seg.meta_access_token) tokensPorConta.set(seg.instagram_account_id, seg.meta_access_token);
    }
  }

  const maxPosts = env.maxPosts ?? 30;
  const results: CommentsAccountSyncResult[] = [];

  for (const account of accounts ?? []) {
    const errors: string[] = [];
    const tokenDaConta = tokensPorConta.get(account.id) ?? env.accessToken;
    if (!tokenDaConta) {
      results.push({ accountId: account.id, clientId: account.client_id, postsChecked: 0, comments: 0, questions: 0, done: false,
        errors: ["Sem token da Meta: nem na conta, nem no ambiente"] });
      continue;
    }
    try {
      const { data: state, error: erroEstado } = await supabase
        .from("instagram_comments_sync_state")
        .select("last_synced_post_posted_at")
        .eq("instagram_account_id", account.id)
        .maybeSingle();
      if (erroEstado) throw new Error(`Estado dos comentários: ${erroEstado.message}`);

      // Frescor primeiro, histórico com o que sobrar.
      //
      // Antes esta função só andava para trás: pegava os posts mais antigos
      // que o cursor e, ao terminar, zerava o cursor e recomeçava do topo.
      // Numa conta com 1.275 posts, a 30 por execução, uma volta completa leva
      // uns 40 dias — e era esse o tempo que um comentário de hoje esperava
      // para ser visto. A conta da Lana chegou a ficar com o cursor em
      // agosto de 2025, com 477 posts recentes nunca verificados, enquanto a
      // execução diária reportava "sucesso" todo dia.
      //
      // Agora toda execução relê os posts mais novos — que é onde comentário
      // novo aparece — e gasta o resto da cota continuando o backfill.
      const RECENTES = 12;
      const cotaBackfill = Math.max(1, maxPosts - RECENTES);

      const { data: recentes, error: erroRecentes } = await supabase
        .from("instagram_posts")
        .select("id, windsor_media_id, posted_at")
        .eq("instagram_account_id", account.id)
        .is("removido_em", null)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false })
        .limit(RECENTES);
      if (erroRecentes) throw erroRecentes;

      let backfillQuery = supabase
        .from("instagram_posts")
        .select("id, windsor_media_id, posted_at")
        .eq("instagram_account_id", account.id)
        .is("removido_em", null)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false })
        .limit(cotaBackfill);
      if (state?.last_synced_post_posted_at) {
        backfillQuery = backfillQuery.lt("posted_at", state.last_synced_post_posted_at);
      }
      const { data: antigos, error: postsError } = await backfillQuery;
      if (postsError) throw postsError;

      // Numa conta nova os dois conjuntos se sobrepõem; sem isto o mesmo post
      // entraria duas vezes na chamada em lote da Meta.
      const vistos = new Set<string>();
      const posts = [...(recentes ?? []), ...(antigos ?? [])].filter((p) => {
        if (vistos.has(p.id)) return false;
        vistos.add(p.id);
        return true;
      });

      // "done" olha só o backfill: a janela de recentes é relida sempre e
      // nunca "termina".
      const done = (antigos?.length ?? 0) < cotaBackfill;

      const { comentarios: commentsByPost, falharam } = await fetchCommentsBatch(posts ?? [], tokenDaConta, errors);
      const now = new Date().toISOString();
      const rows = [];
      for (const post of posts ?? []) {
        for (const c of commentsByPost.get(post.id) ?? []) {
          if (!c.id || !c.text) continue;
          rows.push({
            client_id: account.client_id,
            instagram_post_id: post.id,
            external_comment_id: c.id,
            text: c.text,
            author_username: c.username ?? null,
            like_count: c.like_count ?? null,
            is_question: isQuestion(c.text),
            commented_at: c.timestamp ?? null,
          });
        }
      }

      let commentsCount = 0;
      let questionsCount = 0;
      let gravacaoFalhou = false;
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from("instagram_comments")
          .upsert(rows, { onConflict: "instagram_post_id,external_comment_id" });
        if (upsertError) { errors.push(`comments upsert: ${upsertError.message}`); gravacaoFalhou = true; }
        else {
          commentsCount = rows.length;
          questionsCount = rows.filter((r) => r.is_question).length;
        }
      }

      // Pelo backfill, não pela lista mesclada: a janela de recentes é sempre
      // a mesma e travaria o cursor no topo para sempre.
      const oldestChecked = antigos && antigos.length > 0 ? antigos[antigos.length - 1].posted_at : null;
      // Um post com erro não trava mais o histórico da conta: o cursor anda e o post fica listado nos erros (ele é
      // relido na próxima volta completa do histórico). O cursor só fica parado se a gravação falhou ou se TODOS os
      // posts lidos nesta rodada falharam (sinal de token ou permissão, não de um post isolado).
      const lidosIds = (posts ?? []).map((p) => p.id);
      const todosFalharam = lidosIds.length > 0 && lidosIds.every((id) => falharam.has(id));
      if (!gravacaoFalhou && !todosFalharam) {
        const { error: stateError } = await supabase.from("instagram_comments_sync_state").upsert(
          {
            instagram_account_id: account.id,
            last_synced_post_posted_at: done ? null : oldestChecked,
            updated_at: now,
          },
          { onConflict: "instagram_account_id" },
        );
        if (stateError) errors.push(`state upsert: ${stateError.message}`);
      }

      results.push({
        accountId: account.id,
        clientId: account.client_id,
        postsChecked: posts?.length ?? 0,
        comments: commentsCount,
        questions: questionsCount,
        done: done && errors.length === 0,
        ...(falharam.size ? { failedPosts: [...falharam] } : {}),
        errors,
      });
    } catch (err) {
      results.push({
        accountId: account.id,
        clientId: account.client_id,
        postsChecked: 0,
        comments: 0,
        questions: 0,
        done: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return results;
}
