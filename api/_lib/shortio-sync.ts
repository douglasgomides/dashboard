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

const API = "https://api.short.io";
const STATS = "https://api-v2.short.io";
const GRAPH = "https://graph.facebook.com/v21.0";

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

async function get(url: string, chave: string): Promise<any> {
  const r = await fetch(url, { headers: { authorization: chave, accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`short.io ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

export async function sincronizarShortio(
  admin: SupabaseClient<any, any, any>,
  chave: string,
  opts: { orcamentoMs?: number; maxStats?: number } = {},
): Promise<{ links: number; atribuidos: number; semCliente: number; stats: number; erros: string[] }> {
  const inicio = Date.now();
  const orcamento = opts.orcamentoMs ?? 90_000;
  const erros: string[] = [];

  // Clientes: nome, @ e o link da bio (website do perfil), lido na Graph com o token de cada conta.
  const { data: cls } = await admin.from("clients").select("id, name, instagram_handle, active");
  const { data: igs } = await admin.from("instagram_accounts").select("id, client_id, ig_username, windsor_account_id, active");
  const { data: segs } = await admin.from("instagram_account_secrets").select("instagram_account_id, meta_access_token");
  const tokenDe = new Map((segs ?? []).map((s: any) => [s.instagram_account_id, s.meta_access_token]));
  const clientes: Cliente[] = [];
  for (const c of (cls ?? []) as any[]) {
    if (c.active === false) continue;
    const contas = ((igs ?? []) as any[]).filter((i) => i.client_id === c.id && i.active !== false);
    let bio: string | null = null;
    for (const conta of contas) {
      const tk = tokenDe.get(conta.id) ?? process.env.META_ACCESS_TOKEN;
      if (!tk || !conta.windsor_account_id || bio) continue;
      try {
        const r = await fetch(`${GRAPH}/${conta.windsor_account_id}?fields=website&access_token=${encodeURIComponent(tk)}`, { signal: AbortSignal.timeout(10_000) });
        const j: any = await r.json();
        if (r.ok && typeof j.website === "string") bio = j.website;
      } catch {
        /* sem bio: segue pelo nome */
      }
    }
    clientes.push({ id: c.id, name: c.name, handles: [c.instagram_handle, ...contas.map((x) => x.ig_username)].filter(Boolean), bio });
  }

  // Links de todos os domínios da conta.
  const dominios: any[] = await get(`${API}/api/domains`, chave).catch((e) => (erros.push(String(e.message ?? e)), []));
  const { data: manuais } = await admin.from("shortio_links").select("id").eq("atribuicao", "manual");
  const manual = new Set((manuais ?? []).map((m: any) => m.id));
  let links = 0;
  let atribuidos = 0;
  let semCliente = 0;
  for (const d of dominios ?? []) {
    let pageToken: string | null = null;
    for (let pag = 0; pag < 40; pag++) {
      if (Date.now() - inicio > orcamento) break;
      const j: any = await get(`${API}/api/links?domain_id=${d.id}&limit=150${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, chave).catch((e) => (erros.push(String(e.message ?? e)), null));
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
      for (let i = 0; i < linhas.length; i += 200) {
        const { error } = await admin.from("shortio_links").upsert(linhas.slice(i, i + 200), { onConflict: "id" });
        if (error) erros.push(`links: ${error.message}`);
      }
      pageToken = j.nextPageToken ?? null;
      if (!pageToken || !lista.length) break;
    }
  }

  // Cliques: os links com cliente, os mais antigos de atualização primeiro (limite por rodada).
  let stats = 0;
  const { data: pend } = await admin
    .from("shortio_links")
    .select("id")
    .not("client_id", "is", null)
    .order("stats_em", { ascending: true, nullsFirst: true })
    .limit(opts.maxStats ?? 120);
  for (const p of (pend ?? []) as { id: string }[]) {
    if (Date.now() - inicio > orcamento) break;
    try {
      const j: any = await get(`${STATS}/statistics/link/${encodeURIComponent(p.id)}?period=last30&tzOffset=-180`, chave);
      const total = Number(j?.totalClicks);
      const humanos = Number(j?.humanClicks);
      await admin.from("shortio_links").update({ cliques_total: Number.isFinite(total) ? total : null, cliques_humanos: Number.isFinite(humanos) ? humanos : null, stats_em: new Date().toISOString() }).eq("id", p.id);
      // Cliques por dia, quando o plano devolve (clickStatistics.datasets[].data[{x: data, y: n}]).
      const pontos: any[] = j?.clickStatistics?.datasets?.[0]?.data ?? [];
      const dias = pontos
        .map((pt) => ({ link_id: p.id, dia: String(pt.x ?? "").slice(0, 10), cliques: Number(pt.y) }))
        .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia) && Number.isFinite(x.cliques));
      if (dias.length) await admin.from("shortio_cliques_dia").upsert(dias, { onConflict: "link_id,dia" });
      stats++;
    } catch (e) {
      erros.push(`stats ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
      if (erros.length > 10) break;
    }
  }
  return { links, atribuidos, semCliente, stats, erros: erros.slice(0, 5) };
}
