/**
 * Tags dos contatos da Clint (somente leitura no CRM).
 *
 * Na Clint a origem muitas vezes não está no negócio, e sim nas tags do CONTATO ("instagram_douglas", "site_doctor",
 * "facebook_leads", "ig-social", "Social Selling"). A API de negócios não traz essas tags: só GET /v1/contacts/{id}.
 * Auditoria de 29/10/2026: nos 40 negócios mais recentes do Douglas Gomides, 22 estavam sem origem e 15 deles tinham
 * a origem numa tag do contato.
 *
 * Como funciona:
 *  - lê, em partes e com prazo, as tags dos contatos dos negócios recentes que ainda não foram lidos (ou que foram
 *    lidos há mais de LER_DE_NOVO_DIAS); um contato por chamada, poucas chamadas em paralelo;
 *  - guarda em crm_contato_tags (a mesma tabela das tags do FlwChat; lista vazia = lido sem tag);
 *  - aplica nos leads do contato (raw_payload.contato_tags) pela função crm_aplicar_tags_contato, e o gatilho de
 *    origem (migração 20261030140000) lê a origem da tag.
 * O sync de negócios também junta as tags guardadas a cada rodada, para elas não sumirem quando o negócio é regravado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchComRetry } from "./integration-http.js";

const LER_DE_NOVO_DIAS = 14;
const JANELA_DIAS = 365;
const PARALELO = 4;

export interface ResultadoTagsClint {
  clientId: string;
  connectionId: string;
  lidos: number;
  comTag: number;
  pendentes: number;
  errors: string[];
}

export type BuscarContato = (token: string, contatoId: string) => Promise<{ status: number; tags: unknown[] | null }>;

/** Nomes das tags do contato. Ignora as tags que o próprio Nexo escreve ("Nexo | ..."), que não dizem origem. */
export function nomesDasTagsClint(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .map((t) => (typeof t === "string" ? t : (t as { name?: unknown })?.name))
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0 && !/^nexo\b/i.test(n.trim()))
        .map((n) => n.trim()),
    ),
  ];
}

/** Contatos que faltam ler: dos negócios mais recentes primeiro, sem leitura ou com leitura velha. */
export function contatosPendentes(
  recentes: string[],
  lidos: Map<string, string>,
  agora: number,
): string[] {
  const limite = agora - LER_DE_NOVO_DIAS * 86_400_000;
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const id of recentes) {
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const lido = lidos.get(id);
    if (!lido || new Date(lido).getTime() < limite) out.push(id);
  }
  return out;
}

export async function runClintTags(
  supabase: SupabaseClient,
  buscar: BuscarContato,
  opts: { onlyClientId?: string; deadlineMs: number; agora?: number },
): Promise<ResultadoTagsClint[]> {
  let q = supabase.from("crm_connections").select("id, client_id, access_token").eq("provider", "clint").eq("active", true);
  if (opts.onlyClientId) q = q.eq("client_id", opts.onlyClientId);
  const { data: conexoes, error } = await q;
  if (error) throw error;
  const agora = opts.agora ?? Date.now();
  const out: ResultadoTagsClint[] = [];

  for (const conn of (conexoes ?? []) as { id: string; client_id: string; access_token: string | null }[]) {
    const r: ResultadoTagsClint = { clientId: conn.client_id, connectionId: conn.id, lidos: 0, comTag: 0, pendentes: 0, errors: [] };
    out.push(r);
    if (!conn.access_token) { r.errors.push("Conexão sem access_token"); continue; }

    // Contatos dos negócios do último ano, do mais novo para o mais velho.
    const recentes: string[] = [];
    const desde = new Date(agora - JANELA_DIAS * 86_400_000).toISOString();
    for (let de = 0; ; de += 1000) {
      const { data, error: e } = await supabase
        .from("crm_leads")
        .select("contato:raw_payload->contact->>id")
        .eq("crm_connection_id", conn.id)
        .is("removido_na_origem", null)
        .gte("occurred_at", desde)
        .order("occurred_at", { ascending: false })
        .range(de, de + 999);
      if (e) { r.errors.push(`leads: ${e.message}`); break; }
      for (const l of (data ?? []) as { contato: string | null }[]) if (l.contato) recentes.push(String(l.contato));
      if ((data ?? []).length < 1000) break;
    }
    const lidos = new Map<string, string>();
    for (let de = 0; ; de += 1000) {
      const { data, error: e } = await supabase
        .from("crm_contato_tags")
        .select("contato_id, lido_em")
        .eq("crm_connection_id", conn.id)
        .order("contato_id")
        .range(de, de + 999);
      if (e) { r.errors.push(`tags lidas: ${e.message}`); break; }
      for (const t of (data ?? []) as { contato_id: string; lido_em: string }[]) lidos.set(t.contato_id, t.lido_em);
      if ((data ?? []).length < 1000) break;
    }
    if (r.errors.length) continue;

    const fila = contatosPendentes(recentes, lidos, agora);
    let i = 0;
    const linhas: { crm_connection_id: string; contato_id: string; tags: string[]; lido_em: string }[] = [];
    const trabalhador = async () => {
      while (i < fila.length && Date.now() < opts.deadlineMs) {
        const id = fila[i++];
        try {
          const resp = await buscar(conn.access_token!, id);
          if (resp.status === 404) { linhas.push({ crm_connection_id: conn.id, contato_id: id, tags: [], lido_em: new Date().toISOString() }); continue; }
          if (resp.status !== 200 || resp.tags == null) { r.errors.push(`contato: Clint respondeu ${resp.status}`); return; }
          const tags = nomesDasTagsClint(resp.tags);
          linhas.push({ crm_connection_id: conn.id, contato_id: id, tags, lido_em: new Date().toISOString() });
        } catch (err) {
          r.errors.push(`contato: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: PARALELO }, trabalhador));
    r.lidos = linhas.length;
    r.comTag = linhas.filter((l) => l.tags.length > 0).length;
    r.pendentes = Math.max(0, fila.length - linhas.length);

    for (let de = 0; de < linhas.length; de += 500) {
      const { error: e } = await supabase.from("crm_contato_tags").upsert(linhas.slice(de, de + 500), { onConflict: "crm_connection_id,contato_id" });
      if (e) r.errors.push(`gravar tags: ${e.message}`);
    }
    if (r.comTag > 0) {
      const { error: e } = await supabase.rpc("crm_aplicar_tags_contato", { p_connection_id: conn.id });
      if (e) r.errors.push(`aplicar tags nos leads: ${e.message}`);
    }
  }
  return out;
}

/** GET /v1/contacts/{id} da Clint: só as tags. */
export const buscarContatoClint: BuscarContato = async (token, contatoId) => {
  const res = await fetchComRetry(`https://api.clint.digital/v1/contacts/${encodeURIComponent(contatoId)}`, {
    headers: { "api-token": token, Accept: "application/json" },
  }, { timeoutMs: 20_000 });
  if (res.status !== 200) return { status: res.status, tags: null };
  const corpo = (await res.json().catch(() => null)) as { data?: { tags?: unknown } } | null;
  const tags = corpo?.data?.tags;
  return { status: 200, tags: Array.isArray(tags) ? tags : [] };
};
