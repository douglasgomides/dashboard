// Integration Core (admin): lê do banco quais conexões cada cliente tem ligadas e a última sincronização de cada uma.
// Nunca lê token ou chave: só o fato de a conexão existir.
import { supabase } from "@/integrations/supabase/client";
import { CONECTORES, estadoDoCliente, type EstadoCliente, type RegistroSync } from "@/lib/conectores";
import { fetchAllRows } from "@/lib/pagination";

const db = supabase as any;

export interface LinhaConexao { clientId: string; cliente: string; estado: EstadoCliente; ultimoSucesso: string | null; erro: string | null; detalhe: string | null }

export async function getMapaConexoes(): Promise<Record<string, LinhaConexao[]>> {
  return lerMapaConexoes(db);
}

/** Dependency injection keeps HTTP pagination and credential-free selects testable offline. */
export async function lerMapaConexoes(leitor: { from: (table: string) => any }): Promise<Record<string, LinhaConexao[]>> {
  const [cli, crm, ig, sync, links, ads] = await Promise.all([
    fetchAllRows((from, to) => leitor.from("clients").select("id, name, meta_ad_account_id, wts_company_id").order("name").order("id").range(from, to)),
    fetchAllRows((from, to) => leitor.from("crm_connections").select("client_id, provider, active").order("id").range(from, to)),
    fetchAllRows((from, to) => leitor.from("instagram_accounts").select("client_id, sync_source, active, ig_username").order("id").range(from, to)),
    fetchAllRows((from, to) => leitor.from("sync_status").select("client_id, fonte, last_attempt_at, last_success_at, last_error").order("client_id").order("fonte").range(from, to)),
    fetchAllRows((from, to) => leitor.from("shortio_links").select("client_id, stats_em").not("client_id", "is", null).order("id").range(from, to)),
    fetchAllRows((from, to) => leitor.from("client_ad_accounts").select("client_id, ad_account_id, active").order("client_id").order("ad_account_id").range(from, to)),
  ]);
  const clientes = cli as { id: string; name: string; meta_ad_account_id: string | null; wts_company_id: string | null }[];
  const syncDe = new Map<string, RegistroSync>((sync as (RegistroSync & { client_id: string; fonte: string })[]).map((s) => [`${s.client_id}:${s.fonte}`, s]));
  const crmDe = new Map<string, boolean>();
  for (const c of crm as { client_id: string; provider: string; active: boolean | null }[]) if (c.active !== false) crmDe.set(`${c.client_id}:${c.provider}`, true);
  const igDe = new Map<string, string>();
  for (const a of ig as { client_id: string; sync_source: string | null; active: boolean | null; ig_username: string | null }[])
    if (a.active !== false && a.sync_source) igDe.set(`${a.client_id}:${a.sync_source}`, a.ig_username ? `@${a.ig_username}` : "conta ligada");
  const adsDe = new Map<string, Set<string>>();
  for (const account of ads as { client_id: string; ad_account_id: string; active: boolean | null }[]) {
    if (account.active === false) continue;
    const ids = adsDe.get(account.client_id) ?? new Set<string>();
    ids.add(account.ad_account_id);
    adsDe.set(account.client_id, ids);
  }
  const linksDe = new Map<string, { n: number; ultimo: string | null }>();
  for (const l of links as { client_id: string; stats_em: string | null }[]) {
    const g = linksDe.get(l.client_id) ?? { n: 0, ultimo: null };
    g.n++;
    if (l.stats_em && Number.isFinite(Date.parse(l.stats_em)) && (!g.ultimo || Date.parse(l.stats_em) > Date.parse(g.ultimo))) g.ultimo = l.stats_em;
    linksDe.set(l.client_id, g);
  }

  const mapa: Record<string, LinhaConexao[]> = {};
  for (const con of CONECTORES) {
    if (con.estado === "planejado") { mapa[con.id] = []; continue; }
    mapa[con.id] = clientes.map((c) => {
      let ligado = false; let detalhe: string | null = null;
      if (con.id === "meta_graph" || con.id === "windsor") { detalhe = igDe.get(`${c.id}:${con.id}`) ?? null; ligado = !!detalhe; }
      else if (con.id === "meta_ads") {
        const contas = new Set(adsDe.get(c.id));
        if (c.meta_ad_account_id) contas.add(c.meta_ad_account_id);
        ligado = contas.size > 0;
        detalhe = contas.size === 1 ? `conta ${[...contas][0]}` : contas.size ? `${contas.size} contas ligadas` : null;
      }
      else if (con.id === "wts") ligado = !!c.wts_company_id?.trim();
      else if (con.id === "shortio") { const g = linksDe.get(c.id); ligado = !!g; detalhe = g ? `${g.n} link(s)` : null; }
      else ligado = crmDe.has(`${c.id}:${con.id}`);
      if (con.id === "shortio") {
        const g = linksDe.get(c.id);
        const est = estadoDoCliente(ligado, g ? { last_attempt_at: g.ultimo, last_success_at: g.ultimo, last_error: null } : null);
        return { clientId: c.id, cliente: c.name, estado: est, ultimoSucesso: g?.ultimo ?? null, erro: null, detalhe };
      }
      const s = con.fonte ? syncDe.get(`${c.id}:${con.fonte}`) : undefined;
      return { clientId: c.id, cliente: c.name, estado: estadoDoCliente(ligado, s), ultimoSucesso: s?.last_success_at ?? null, erro: s?.last_error ?? null, detalhe };
    });
  }
  return mapa;
}
