/**
 * Sync dos links do short.gy (Short.io): todos os links da conta da Doctor Creator, com cliques, e a qual
 * cliente cada um pertence. Roda no fim do sync diário de anúncios (api/sync/meta-ads.ts), sem função nova.
 *
 * Atribuição ao cliente, nesta ordem (a primeira que bater vale):
 *  1. bio: o link é o "site" do perfil do Instagram do cliente (campo website da Graph API);
 *  2. handle: o @ do Instagram do cliente aparece no título, caminho, tags ou destino;
 *  3. nome: o nome do cliente (sem Dr./Dra., sem acento) aparece no título/caminho/tags/destino; só vale se
 *     um único cliente bater.
 * Link atribuído à mão (atribuicao = 'manual') nunca é sobrescrito. O que não bater fica sem cliente e
 * aparece no Admin para atribuir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { fetchComRetry, RitmoEsgotadoError, type Ritmo } from "./integration-http.js";

const API = "https://api.short.io";
const STATS = "https://api-v2.short.io";
const GRAPH = META_GRAPH_URL;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const PARADAS = new Set(["dr", "dra", "doutor", "doutora", "de", "da", "do", "das", "dos", "e", "clinica", "instituto", "hospital", "igm", "ms"]);

function palavrasDoNome(nome: string): string[] {
  return norm(nome).split(" ").filter((p) => p.length >= 3 && !PARADAS.has(p));
}

type Cliente = { id: string; name: string; handles: string[]; bio: string | null };

export function atribuir(link: { titulo: string; caminho: string; tags: string[]; original: string; short: string }, clientes: Cliente[]): { client_id: string; como: string; detalhe: string } | null {
  const shortN = link.short.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
  for (const c of clientes)
    if (c.bio && c.bio.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase() === shortN) return { client_id: c.id, como: "bio", detalhe: "link da bio do Instagram" };
  const texto = norm([link.titulo, link.caminho, link.tags.join(" "), link.original].join(" "));
  const textoJunto = texto.replace(/ /g, "");
  const porHandle = clientes.filter((c) => c.handles.some((h) => h.length >= 4 && textoJunto.includes(norm(h).replace(/ /g, ""))));
  if (porHandle.length === 1) return { client_id: porHandle[0].id, como: "handle", detalhe: "@ do Instagram no link" };
  // Nome: todas as palavras do nome (ou nome + sobrenome principal) presentes, juntas ou separadas.
  const pontos = clientes
    .map((c) => {
      const ps = palavrasDoNome(c.name);
      const achadas = ps.filter((p) => texto.split(" ").includes(p) || textoJunto.includes(p));
      return { c, achadas: achadas.length, total: ps.length };
    })
    .filter((x) => x.achadas >= Math.min(2, x.total) && x.achadas > 0);
  if (!pontos.length) return null;
  pontos.sort((a, b) => b.achadas - a.achadas || a.total - b.total);
  if (pontos.length > 1 && pontos[0].achadas === pontos[1].achadas) return null; // ambíguo: vai para o Admin
  return { client_id: pontos[0].c.id, como: "nome", detalhe: `nome no link (${pontos[0].achadas} palavra(s))` };
}

/**
 * Limites do Short.io. Tabela de preços (https://short.io/pricing, lida em 01/11/2026): "API rate limit: Maximum number of
 * API requests per second. 50 req/s" em todos os planos. As estatísticas têm limite próprio, menor: o artigo "API limits"
 * da ajuda (help.short.io / docs.short.io, bloqueados nesta rede; lido só por busca em 01/11/2026) fala em 60 pedidos por
 * minuto, e versões antigas em 10 por minuto. Em 01/11/2026 o sync recebeu 429 "Rate limit exceeded" ao pedir as
 * estatísticas de 120 links em sequência. Por isso: no máximo 1 por segundo e 50 por minuto (folga sob os 60), e o
 * que não couber na rodada fica para a próxima, sem virar erro.
 */
export const RITMO_SHORTIO_STATS: Ritmo = { chave: "shortio:stats", porSegundo: 1, janelas: [{ max: 50, ms: 60_000 }] };
const RITMO_SHORTIO_API: Ritmo = { chave: "shortio:api", porSegundo: 20 };
/** As estatísticas são de 30 dias e mudam uma vez por dia: link lido há menos disso não é pedido de novo. */
export const STATS_VALIDADE_MS = 20 * 3600_000;

/** Erro do Short.io com o status, para o laço de estatísticas parar no 429 em vez de insistir link a link. */
class ErroShortio extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get(url: string, chave: string, opts: { ritmo: Ritmo; prazo: number }): Promise<any> {
  const r = await fetchComRetry(
    url,
    { headers: { authorization: chave, accept: "application/json" } },
    { tentativas: 3, timeoutMs: 20_000, maxEsperaMs: 10_000, ritmo: opts.ritmo, prazo: opts.prazo },
  );
  if (!r.ok) throw new ErroShortio(`short.io ${r.status}: ${(await r.text()).slice(0, 150)}`, r.status);
  return r.json();
}

export async function sincronizarShortio(
  admin: SupabaseClient<any, any, any>,
  chave: string,
  opts: { orcamentoMs?: number; maxStats?: number } = {},
): Promise<{ links: number; atribuidos: number; semCliente: number; stats: number; adiados: number; erros: string[]; biosSemLeitura: number }> {
  const inicio = Date.now();
  const orcamento = opts.orcamentoMs ?? 90_000;
  const prazo = inicio + orcamento;
  const api = { ritmo: RITMO_SHORTIO_API, prazo };
  const erros: string[] = [];

  // Clientes: nome, @ e o link da bio (website do perfil), lido na Graph com o token de cada conta.
  const { data: cls, error: erroClientes } = await admin.from("clients").select("id, name, instagram_handle, active, eh_teste");
  const { data: igs, error: erroContas } = await admin.from("instagram_accounts").select("id, client_id, ig_username, windsor_account_id, active");
  const { data: segs, error: erroSegredos } = await admin.from("instagram_account_secrets").select("instagram_account_id, meta_access_token");
  if (erroClientes || erroContas || erroSegredos) throw new Error("Não foi possível carregar os dados para atribuir os links com segurança");
  const tokenDe = new Map((segs ?? []).map((s: any) => [s.instagram_account_id, s.meta_access_token]));
  const clientes: Cliente[] = [];
  let biosComFalha = 0;
  for (const c of (cls ?? []) as any[]) {
    // Cliente de teste não entra na atribuição pelo nome (1 link real tinha ido parar na "CLÍNICA TESTE SAP V2").
    if (c.active === false || c.eh_teste === true) continue;
    const contas = ((igs ?? []) as any[]).filter((i) => i.client_id === c.id && i.active !== false);
    let bio: string | null = null;
    for (const conta of contas) {
      const tk = tokenDe.get(conta.id) ?? process.env.META_ACCESS_TOKEN;
      if (!tk || !conta.windsor_account_id || bio) continue;
      try {
        // Token no cabeçalho, não na URL (a URL vai para logs de erro e de proxy).
        const r = await fetch(`${GRAPH}/${conta.windsor_account_id}?fields=website`, { headers: { authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(10_000) });
        const j: any = await r.json();
        if (r.ok && typeof j.website === "string") bio = j.website;
        else if (!r.ok) biosComFalha++;
      } catch {
        biosComFalha++; // sem bio: segue pelo nome, mas a falha é contada
      }
    }
    clientes.push({ id: c.id, name: c.name, handles: [c.instagram_handle, ...contas.map((x) => x.ig_username)].filter(Boolean), bio });
  }

  // Links de todos os domínios da conta.
  const dominios: any[] = await get(`${API}/api/domains`, chave, api).catch((e) => (erros.push(String(e.message ?? e)), []));
  const manual = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const { data: manuais, error } = await admin.from("shortio_links").select("id").eq("atribuicao", "manual").order("id").range(de, de + 999);
    if (error) throw new Error("Não foi possível verificar as atribuições manuais dos links");
    for (const m of manuais ?? []) manual.add(String(m.id));
    if ((manuais?.length ?? 0) < 1000) break;
  }
  let links = 0;
  let atribuidos = 0;
  let semCliente = 0;
  for (const d of dominios ?? []) {
    let pageToken: string | null = null;
    for (let pag = 0; pag < 40; pag++) {
      if (Date.now() - inicio > orcamento) break;
      const j: any = await get(`${API}/api/links?domain_id=${d.id}&limit=150${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, chave, api).catch((e) => (erros.push(String(e.message ?? e)), null));
      if (!j) break;
      const lista: any[] = j.links ?? [];
      const linhas = lista.map((l) => {
        const base = {
          id: String(l.idString ?? l.id),
          dominio: d.hostname ?? null,
          short_url: l.secureShortURL ?? l.shortURL ?? null,
          original_url: l.originalURL ?? null,
          titulo: l.title ?? null,
          caminho: l.path ?? null,
          tags: Array.isArray(l.tags) ? l.tags : [],
          criado_em: l.createdAt ?? null,
          atualizado_em: new Date().toISOString(),
        };
        if (manual.has(base.id)) return base; // atribuição manual: não mexe no cliente
        const a = atribuir({ titulo: base.titulo ?? "", caminho: base.caminho ?? "", tags: base.tags, original: base.original_url ?? "", short: base.short_url ?? "" }, clientes);
        if (a) atribuidos++;
        else semCliente++;
        return { ...base, client_id: a?.client_id ?? null, atribuicao: a?.como ?? null, atribuicao_detalhe: a?.detalhe ?? null };
      });
      links += linhas.length;
      // PostgREST une as colunas de um lote. Misturar linhas manuais sem
      // client_id com automáticas faria o campo ausente virar null e apagaria
      // a atribuição feita pela equipe.
      const grupos = [linhas.filter((l) => manual.has(l.id)), linhas.filter((l) => !manual.has(l.id))];
      for (const grupo of grupos) {
        for (let i = 0; i < grupo.length; i += 200) {
          const { error } = await admin.from("shortio_links").upsert(grupo.slice(i, i + 200), { onConflict: "id" });
          if (error) erros.push(`links: ${error.message}`);
        }
      }
      pageToken = j.nextPageToken ?? null;
      if (!pageToken || !lista.length) break;
    }
  }

  // Cliques: os links com cliente que não foram lidos nas últimas 20 h, os mais antigos primeiro (limite por rodada).
  // Antes todo sync de anúncios pedia os 120 mais antigos, mesmo os lidos minutos antes, e batia no 429.
  let stats = 0;
  let adiados = 0;
  const lidoAntesDe = new Date(Date.now() - STATS_VALIDADE_MS).toISOString();
  const { data: pend, error: erroPendentes } = await admin
    .from("shortio_links")
    .select("id")
    .not("client_id", "is", null)
    .or(`stats_em.is.null,stats_em.lt.${lidoAntesDe}`)
    .order("stats_em", { ascending: true, nullsFirst: true })
    .limit(opts.maxStats ?? 120);
  if (erroPendentes) throw new Error(`Não foi possível ler as estatísticas pendentes: ${erroPendentes.message}`);
  const fila = (pend ?? []) as { id: string }[];
  for (let i = 0; i < fila.length; i++) {
    const p = fila[i];
    if (Date.now() - inicio > orcamento) {
      adiados += fila.length - i;
      break;
    }
    try {
      const j: any = await get(`${STATS}/statistics/link/${encodeURIComponent(p.id)}?period=last30&tzOffset=-180`, chave, { ritmo: RITMO_SHORTIO_STATS, prazo });
      const patch: Record<string, unknown> = { stats_em: new Date().toISOString() };
      for (const [origem, destino] of [["totalClicks", "cliques_total"], ["humanClicks", "cliques_humanos"]]) {
        const value = j?.[origem];
        if (value != null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) patch[destino] = Number(value);
      }
      if (Object.keys(patch).length === 1) throw new Error("Short.io devolveu estatísticas inválidas");
      const { error: erroStats } = await admin.from("shortio_links").update(patch).eq("id", p.id);
      if (erroStats) throw new Error(erroStats.message);
      // Cliques por dia, quando o plano devolve (clickStatistics.datasets[].data[{x: data, y: n}]).
      const pontos: any[] = j?.clickStatistics?.datasets?.[0]?.data ?? [];
      const dias = pontos
        .map((pt) => ({ link_id: p.id, dia: String(pt.x ?? "").slice(0, 10), cliques: Number(pt.y) }))
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia) && Number.isFinite(x.cliques));
      if (dias.length) {
        const { error } = await admin.from("shortio_cliques_dia").upsert(dias, { onConflict: "link_id,dia" });
        if (error) throw new Error(error.message);
      }
      stats++;
    } catch (e) {
      // Teto de 50 por minuto atingido nesta rodada: o resto fica para a próxima (os mais antigos vêm primeiro).
      if (e instanceof RitmoEsgotadoError) {
        adiados += fila.length - i;
        break;
      }
      erros.push(`stats ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
      // 429 mesmo depois das novas tentativas: para de pedir nesta rodada em vez de gastar o limite link a link.
      if (e instanceof ErroShortio && e.status === 429) {
        adiados += fila.length - i - 1;
        break;
      }
      if (erros.length > 10) break;
    }
  }
  // Conta cuja bio não foi lida na Graph: a atribuição dela segue só pelo nome e pelo @ (antes a falha era calada).
  return { links, atribuidos, semCliente, stats, adiados, erros: erros.slice(0, 5), biosSemLeitura: biosComFalha };
}
