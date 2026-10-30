/**
 * Conferência diária: quantos leads o Nexo tem de cada conexão de CRM contra quantos o CRM tem ao vivo.
 *
 * Auditoria de 29/10/2026: a Dra. Lana chegou a ter 20 mil leads no Nexo e 11 mil no Kommo (leads apagados e um funil
 * "Leads Excluídos" contados), e ninguém viu. A reconciliação do Kommo existia, mas não marcava nada sozinha acima
 * de 30% de diferença. Esta conferência não corrige nada: só conta dos dois lados, guarda em crm_conferencia e acende
 * o alerta "crm-diverge-origem" em qualidade_dados quando a diferença passa do limite (src/lib/limites.ts).
 *
 * O que se compara em cada CRM (somente leitura, contagem completa):
 *  - Kommo: todos os leads da API (paginando tudo) x leads vivos no Nexo (apagados no Kommo já saem pela reconciliação).
 *  - Clint: totalCount de cada funil lido (config.origins) x tudo o que o Nexo guardou desses funis, inclusive o que
 *    ele marcou de propósito (lista de base, cards substituídos): o Clint também ainda tem esses negócios.
 *  - RD Station: total da API x tudo o que o Nexo guardou.
 *  - FlwChat: a API só lista cards ABERTOS, e o Nexo guarda também os fechados. A diferença é registrada, mas não
 *    alerta (metodo "so_abertos") até a reconciliação de apagados do FlwChat existir.
 *  - Digisac: a API conta todos os contatos, inclusive grupos e quem nunca conversou, que o sync deixa de fora de
 *    propósito. Registra, sem alerta (metodo "contatos").
 */
import { leadsDaEntradaKommo } from "./kommo-leads-sync.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITES } from "../../src/lib/limites.js";

export type MetodoConferencia = "total" | "so_abertos" | "contatos";

export interface ConexaoConferida {
  id: string;
  client_id: string;
  provider: string;
  subdomain: string | null;
  access_token: string | null;
  config: Record<string, unknown> | null;
}

export interface ResultadoConferencia {
  connectionId: string;
  clientId: string;
  provider: string;
  nexo: number;
  crm: number | null;
  metodo: MetodoConferencia;
  alerta: boolean;
  aviso: string | null;
}

/** Busca JSON na API do CRM. Injetada para os testes rodarem sem rede. */
export type BuscarJson = (url: string, headers: Record<string, string>) => Promise<{ status: number; corpo: unknown }>;

/** A diferença só vira alerta quando passa da fatia E do mínimo em leads (os leads do dia não são problema). */
export function divergeDemais(nexo: number, crm: number): boolean {
  const dif = Math.abs(nexo - crm);
  if (dif < LIMITES.conferenciaCrm.divergenciaMinimaLeads) return false;
  return dif / Math.max(crm, 1) > LIMITES.conferenciaCrm.divergenciaMaxima;
}

const MAX_PAGINAS_KOMMO = 200; // 50 mil leads

export async function contarNoCrm(
  conn: ConexaoConferida,
  buscar: BuscarJson,
  opts: { tokenKommoPadrao?: string; digisac?: { url: string; token: string } | null } = {},
): Promise<{ total: number | null; metodo: MetodoConferencia; aviso: string | null }> {
  const cfg = conn.config ?? {};
  switch (conn.provider) {
    case "kommo": {
      const token = conn.access_token || opts.tokenKommoPadrao;
      if (!token || !conn.subdomain) return { total: null, metodo: "total", aviso: "Kommo sem token ou sem subdomínio: não deu para contar" };
      let total = 0;
      for (let pagina = 1; pagina <= MAX_PAGINAS_KOMMO; pagina++) {
        const r = await buscar(`https://${conn.subdomain}.kommo.com/api/v4/leads?limit=250&page=${pagina}`, { Authorization: `Bearer ${token}` });
        if (r.status !== 200 && r.status !== 204) return { total: null, metodo: "total", aviso: `Kommo respondeu ${r.status} na página ${pagina}` };
        const corpo = r.corpo as { _embedded?: { leads?: unknown[] }; _links?: { next?: unknown } };
        total += corpo?._embedded?.leads?.length ?? 0;
        if (r.status === 204 || !corpo?._links?.next) {
          // Leads da Entrada (não aceitos) não vêm na listagem padrão: somam aqui também.
          const entrada = await leadsDaEntradaKommo(buscar, `${conn.subdomain}.kommo.com`, token);
          if (entrada.erro) return { total: null, metodo: "total", aviso: entrada.erro };
          return { total: total + entrada.leads.length, metodo: "total", aviso: null };
        }
      }
      return { total: null, metodo: "total", aviso: "Kommo com mais de 50 mil leads: contagem interrompida" };
    }
    case "clint": {
      if (!conn.access_token) return { total: null, metodo: "total", aviso: "Clint sem token" };
      const origens = Array.isArray(cfg.origins) ? (cfg.origins as unknown[]).map(String) : [];
      const urls = origens.length
        ? origens.map((o) => `https://api.clint.digital/v1/deals?limit=1&page=1&origin_id=${encodeURIComponent(o)}`)
        : ["https://api.clint.digital/v1/deals?limit=1&page=1"];
      let total = 0;
      for (const url of urls) {
        const r = await buscar(url, { "api-token": conn.access_token });
        const n = Number((r.corpo as { totalCount?: unknown })?.totalCount);
        if (r.status !== 200 || !Number.isFinite(n)) return { total: null, metodo: "total", aviso: `Clint respondeu ${r.status}` };
        total += n;
      }
      return { total, metodo: "total", aviso: null };
    }
    case "rdstation": {
      if (!conn.access_token) return { total: null, metodo: "total", aviso: "RD Station sem token" };
      const r = await buscar(`https://crm.rdstation.com/api/v1/deals?limit=1&page=1&token=${encodeURIComponent(conn.access_token)}`, {});
      const n = Number((r.corpo as { total?: unknown })?.total);
      if (r.status !== 200 || !Number.isFinite(n)) return { total: null, metodo: "total", aviso: `RD Station respondeu ${r.status}` };
      return { total: n, metodo: "total", aviso: null };
    }
    case "flwchat": {
      if (!conn.access_token) return { total: null, metodo: "so_abertos", aviso: "FlwChat sem token" };
      const paineis = Array.isArray(cfg.panel_ids) ? (cfg.panel_ids as unknown[]).map(String) : [];
      let total = 0;
      for (const p of paineis) {
        const r = await buscar(`https://api.wts.chat/crm/v1/panel/card?PanelId=${encodeURIComponent(p)}&pageSize=1&pageNumber=1`, { Authorization: `Bearer ${conn.access_token}` });
        const n = Number((r.corpo as { totalItems?: unknown })?.totalItems);
        if (r.status !== 200 || !Number.isFinite(n)) return { total: null, metodo: "so_abertos", aviso: `FlwChat respondeu ${r.status}` };
        total += n;
      }
      return { total, metodo: "so_abertos", aviso: null };
    }
    case "digisac": {
      if (!opts.digisac) return { total: null, metodo: "contatos", aviso: "Digisac sem endereço ou token no cadastro" };
      const r = await buscar(`${opts.digisac.url.replace(/\/+$/, "")}/api/v1/contacts?perPage=1&page=1`, { Authorization: `Bearer ${opts.digisac.token}` });
      const n = Number((r.corpo as { total?: unknown })?.total);
      if (r.status !== 200 || !Number.isFinite(n)) return { total: null, metodo: "contatos", aviso: `Digisac respondeu ${r.status}` };
      return { total: n, metodo: "contatos", aviso: null };
    }
    default:
      return { total: null, metodo: "total", aviso: `CRM ${conn.provider} ainda sem conferência` };
  }
}

/**
 * Kommo e RD Station comparam com os vivos: os dois marcam o que foi apagado na origem (removido_na_origem). A Clint
 * também marca, mas usa o mesmo campo para as etapas de base (config.etapas_base, Dra. Marcelly), que continuam
 * existindo na Clint: compara com tudo. FlwChat só lista abertos e o Digisac conta contatos.
 */
export function contaVivosNoNexo(provider: string): boolean {
  return provider === "kommo" || provider === "rdstation";
}

export async function runConferenciaCrm(
  supabase: SupabaseClient,
  buscar: BuscarJson,
  opts: { tokenKommoPadrao?: string; onlyClientId?: string; hoje?: string } = {},
): Promise<ResultadoConferencia[]> {
  let q = supabase.from("crm_connections").select("id, client_id, provider, subdomain, access_token, config").eq("active", true);
  if (opts.onlyClientId) q = q.eq("client_id", opts.onlyClientId);
  const { data: conexoes, error } = await q;
  if (error) throw error;
  const dia = opts.hoje ?? new Date().toISOString().slice(0, 10);
  // Contas compartilhadas (HOMS em 3 clientes) são contadas uma vez só no CRM.
  const cache = new Map<string, Awaited<ReturnType<typeof contarNoCrm>>>();
  const out: ResultadoConferencia[] = [];

  for (const conn of (conexoes ?? []) as ConexaoConferida[]) {
    if (conn.provider === "planilha") continue;
    let digisac: { url: string; token: string } | null = null;
    if (conn.provider === "digisac") {
      const { data } = await supabase.from("clients").select("digisac_url, digisac_token").eq("id", conn.client_id).maybeSingle();
      const d = data as { digisac_url?: string | null; digisac_token?: string | null } | null;
      digisac = d?.digisac_url && d.digisac_token ? { url: d.digisac_url, token: d.digisac_token } : null;
    }
    const chave = `${conn.provider}|${conn.subdomain ?? ""}|${digisac?.url ?? ""}|${conn.provider === "kommo" ? "" : conn.id}`;
    let origem = cache.get(chave);
    if (!origem) {
      try {
        origem = await contarNoCrm(conn, buscar, { tokenKommoPadrao: opts.tokenKommoPadrao, digisac });
      } catch (err) {
        origem = { total: null, metodo: "total", aviso: err instanceof Error ? err.message : String(err) };
      }
      cache.set(chave, origem);
    }

    let qn = supabase.from("crm_leads").select("id", { count: "exact", head: true }).eq("crm_connection_id", conn.id);
    if (contaVivosNoNexo(conn.provider)) qn = qn.is("removido_na_origem", null);
    const { count, error: en } = await qn;
    if (en) throw en;
    const nexo = count ?? 0;
    const alerta = origem.total != null && origem.metodo === "total" && divergeDemais(nexo, origem.total);
    out.push({ connectionId: conn.id, clientId: conn.client_id, provider: conn.provider, nexo, crm: origem.total, metodo: origem.metodo, alerta, aviso: origem.aviso });
  }

  const linhas = out.map((r) => ({
    crm_connection_id: r.connectionId,
    client_id: r.clientId,
    dia,
    provider: r.provider,
    nexo: r.nexo,
    crm: r.crm,
    metodo: r.metodo,
    alerta: r.alerta,
    aviso: r.aviso,
    criado_em: new Date().toISOString(),
  }));
  if (linhas.length) {
    const { error: e } = await supabase.from("crm_conferencia").upsert(linhas, { onConflict: "crm_connection_id,dia" });
    if (e) throw e;
  }
  return out;
}
