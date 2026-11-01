/**
 * Sync de negociações do RD Station CRM para crm_leads.
 *
 * API v1 (https://crm.rdstation.com/api/v1): autenticação só por token, enviado
 * na query string (`?token=`). Limite de 120 requisições por minuto. A listagem
 * de /deals é paginada (`page`, `limit` até 200) e devolve `has_more`.
 *
 * Modelagem, igual ao que Kommo e Clint já gravam em crm_leads:
 *  - o funil do RD vira "pipeline" e a etapa vira "status" (crm_pipeline_statuses);
 *  - `win` true = ganho, false = perdido, null = em aberto;
 *  - a "fonte" da negociação (deal_source) vira `source`, o equivalente ao
 *    "Fonte do Lead" do Kommo.
 * O token fica em crm_connections.access_token, por cliente.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lerTodasAsLinhas } from "./ler-paginas.js";
import { fetchComRetry } from "./integration-http.js";

const RD_BASE = "https://crm.rdstation.com/api/v1";
const PAGE_SIZE = 200;
const BATCH_SIZE = 500;
// Trava de segurança: 100 páginas x 200 = 20 mil negociações. Passar disso é
// bug de paginação, não volume real.
const MAX_PAGES = 100;

export interface RdStationSyncEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyClientId?: string;
  // Instante (epoch ms) a partir do qual paramos de paginar e devolvemos o que
  // já veio, para o botão não estourar o teto de 60s da função.
  deadlineMs?: number;
}

export interface RdStationSyncResult {
  clientId: string;
  connectionId: string;
  funis: number;
  negocios: number;
  errors: string[];
}

interface RdDeal {
  _id: string;
  name?: string | null;
  amount_total?: number | null;
  win?: boolean | null;
  closed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deal_stage?: { _id?: string; id?: string; name?: string | null } | null;
  deal_source?: { name?: string | null } | null;
  contacts?: {
    name?: string | null;
    emails?: { email?: string | null }[] | null;
    phones?: { phone?: string | null }[] | null;
  }[] | null;
}

interface RdPipeline {
  _id?: string;
  id?: string;
  name?: string | null;
  deal_stages?: { _id?: string; id?: string; name?: string | null }[] | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// win: true = ganho, false = perdido, null/ausente = em aberto.
export function rdOutcome(win: unknown): "open" | "won" | "lost" {
  if (win === true) return "won";
  if (win === false) return "lost";
  return "open";
}

async function rdGet(token: string, path: string, query: Record<string, string | number> = {}): Promise<any> {
  const qs = new URLSearchParams({ token, ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) });
  // 120 pedidos/min na doc (crm-v1-limite-de-requisicoes-da-api); a doc não diz se o 429 traz Retry-After. O helper
  // usa o cabeçalho quando vem e, sem ele, espera crescente (com teto) antes de tentar de novo.
  const res = await fetchComRetry(`${RD_BASE}/${path}?${qs.toString()}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    // Nunca repetir a URL no erro: ela carrega o token.
    throw new Error(`RD Station /${path} falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  }
  return res.json();
}

/**
 * Funil do negócio. O RD só manda a etapa; o funil vem do catálogo /deal_pipelines. Se o catálogo falhou nesta rodada,
 * usa o catálogo já gravado (crm_pipeline_statuses) e, sem ele, o funil que o negócio já tem no banco. Antes, uma falha
 * do catálogo gravava pipeline_id='rdstation' em todos os negócios e o gatilho criava um "mudou de etapa" falso para
 * cada um (e outro no dia seguinte, de volta). Só negócio novo, sem nada salvo, fica com 'rdstation'.
 */
export function funilDoNegocio(
  stageId: string | null,
  catalogo: Map<string, { id: string }>,
  catalogoSalvo: Map<string, string>,
  funilAtual: string | null | undefined,
): string {
  if (stageId && catalogo.has(stageId)) return catalogo.get(stageId)!.id;
  if (stageId && catalogoSalvo.has(stageId)) return catalogoSalvo.get(stageId)!;
  if (funilAtual) return funilAtual;
  return "rdstation";
}

async function fetchPipelines(token: string): Promise<RdPipeline[]> {
  const body = await rdGet(token, "deal_pipelines");
  return Array.isArray(body) ? body : (body?.deal_pipelines ?? []);
}

async function fetchDeals(token: string, deadlineMs?: number): Promise<{ deals: RdDeal[]; parcial: boolean }> {
  const all: RdDeal[] = [];
  let page = 1;
  while (page <= MAX_PAGES) {
    const body = await rdGet(token, "deals", { limit: PAGE_SIZE, page });
    const rows: RdDeal[] = body?.deals ?? [];
    all.push(...rows);
    if (!body?.has_more || rows.length === 0) return { deals: all, parcial: false };
    if (deadlineMs && Date.now() > deadlineMs) return { deals: all, parcial: true };
    page++;
  }
  return { deals: all, parcial: true };
}

export async function runRdStationSync(env: RdStationSyncEnv): Promise<RdStationSyncResult[]> {
  const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("crm_connections")
    .select("id, client_id, access_token")
    .eq("provider", "rdstation")
    .eq("active", true);
  if (env.onlyClientId) query = query.eq("client_id", env.onlyClientId);
  const { data: connections, error } = await query;
  if (error) throw error;

  const results: RdStationSyncResult[] = [];

  for (const conn of connections ?? []) {
    const errors: string[] = [];
    const token = conn.access_token as string | null;
    if (!token) {
      results.push({ clientId: conn.client_id, connectionId: conn.id, funis: 0, negocios: 0, errors: ["Conexão sem access_token"] });
      continue;
    }

    // Etapa -> funil. O negócio só traz a etapa; o funil vem do catálogo.
    const stageToPipeline = new Map<string, { id: string; name: string }>();
    const stageRows: Record<string, unknown>[] = [];
    let pipelines: RdPipeline[] = [];
    let catalogoFalhou = false;
    try {
      pipelines = await fetchPipelines(token);
    } catch (err) {
      catalogoFalhou = true;
      errors.push(err instanceof Error ? err.message : String(err));
    }
    for (const p of pipelines) {
      const pid = String(p._id ?? p.id ?? "");
      const pname = String(p.name ?? pid);
      if (!pid) continue;
      for (const s of p.deal_stages ?? []) {
        const sid = String(s._id ?? s.id ?? "");
        if (!sid) continue;
        stageToPipeline.set(sid, { id: pid, name: pname });
        stageRows.push({
          crm_connection_id: conn.id,
          pipeline_id: pid,
          pipeline_name: pname,
          status_id: sid,
          status_name: String(s.name ?? sid),
        });
      }
    }

    let deals: RdDeal[] = [];
    try {
      const r = await fetchDeals(token, env.deadlineMs);
      deals = r.deals;
      if (r.parcial) errors.push("RD Station: listagem interrompida por tempo, os negócios restantes entram na próxima rodada");
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // Etapa fora do catálogo desta rodada (ou catálogo que falhou): não sobrescreve o funil com 'rdstation'.
    const catalogoSalvo = new Map<string, string>();
    const funilAtual = new Map<string, string>();
    const semFunil = deals.some((d) => {
      const sid = String(d?.deal_stage?._id ?? d?.deal_stage?.id ?? "");
      return !sid || !stageToPipeline.has(sid);
    });
    if (deals.length > 0 && (catalogoFalhou || semFunil)) {
      try {
        const etapas = await lerTodasAsLinhas((de, ate) => supabase.from("crm_pipeline_statuses").select("pipeline_id, status_id")
          .eq("crm_connection_id", conn.id).order("pipeline_id").order("status_id").range(de, ate));
        for (const e of etapas as { pipeline_id: string; status_id: string }[]) catalogoSalvo.set(String(e.status_id), String(e.pipeline_id));
        const atuais = await lerTodasAsLinhas((de, ate) => supabase.from("crm_leads").select("external_lead_id, pipeline_id")
          .eq("crm_connection_id", conn.id).order("external_lead_id").range(de, ate));
        for (const l of atuais as { external_lead_id: string; pipeline_id: string | null }[])
          if (l.pipeline_id && l.pipeline_id !== "rdstation") funilAtual.set(String(l.external_lead_id), l.pipeline_id);
      } catch (err) {
        // Sem como preservar o funil: não grava nada nesta rodada (melhor que apagar o funil de todos os negócios).
        errors.push(`funis salvos: ${err instanceof Error ? err.message : String(err)}; negócios não gravados nesta rodada`);
        deals = [];
      }
    }

    const leadRows = deals
      .filter((d) => d?._id)
      .map((d) => {
        const stageId = String(d.deal_stage?._id ?? d.deal_stage?.id ?? "") || null;
        const contato = d.contacts?.[0];
        return {
          crm_connection_id: conn.id,
          client_id: conn.client_id,
          provider: "rdstation",
          external_lead_id: d._id,
          event_type: "sync",
          status_id: stageId,
          pipeline_id: funilDoNegocio(stageId, stageToPipeline, catalogoSalvo, funilAtual.get(d._id)),
          price: typeof d.amount_total === "number" && d.amount_total > 0 ? d.amount_total : null,
          // Entrada do negócio. A data da venda/perda é closed_at, que segue no raw_payload (crm_data_desfecho no banco).
          occurred_at: d.created_at ?? null,
          outcome: rdOutcome(d.win),
          source: d.deal_source?.name ?? null,
          contact_name: contato?.name ?? d.name ?? null,
          contact_email: contato?.emails?.[0]?.email ?? null,
          contact_phone: contato?.phones?.[0]?.phone ?? null,
          raw_payload: d as unknown as Record<string, unknown>,
          received_at: d.updated_at ?? d.created_at ?? new Date().toISOString(),
          // Negócio que voltou a aparecer deixa de estar removido.
          removido_na_origem: null,
        };
      });

    let gravados = 0;
    for (const batch of chunk(leadRows, BATCH_SIZE)) {
      const { error: upsertError } = await supabase
        .from("crm_leads")
        .upsert(batch, { onConflict: "crm_connection_id,external_lead_id" });
      if (upsertError) errors.push(`leads (${batch.length}): ${upsertError.message}`);
      else gravados += batch.length;
    }

    if (stageRows.length > 0) {
      const { error: stageError } = await supabase
        .from("crm_pipeline_statuses")
        .upsert(stageRows, { onConflict: "crm_connection_id,pipeline_id,status_id" });
      if (stageError) errors.push(`etapas: ${stageError.message}`);
    }

    // Negócio apagado no RD continuava contando (auditoria de 30/10/2026). Só com a lista completa e sem erro; trava de
    // 20% para falha da API não virar exclusão em massa.
    if (errors.length === 0 && leadRows.length > 0) {
      const vivos = new Set(leadRows.map((l) => l.external_lead_id));
      let locais: { external_lead_id: unknown }[] | null = null;
      let eLocais: { message: string } | null = null;
      try {
        locais = await lerTodasAsLinhas((de, ate) => supabase.from("crm_leads").select("external_lead_id")
          .eq("crm_connection_id", conn.id).is("removido_na_origem", null).order("external_lead_id").range(de, ate));
      } catch (err) {
        eLocais = { message: err instanceof Error ? err.message : String(err) };
      }
      if (eLocais) errors.push(`apagados: ${eLocais.message}`);
      else {
        const sumiram = (locais ?? []).map((l) => l.external_lead_id as string).filter((id) => !vivos.has(id));
        if (sumiram.length > Math.max(20, 0.2 * (locais ?? []).length)) {
          errors.push(`apagados: ${sumiram.length} negócios sumiram do RD de uma vez; nada foi marcado, conferir antes`);
        } else {
          const agora = new Date().toISOString();
          for (const lote of chunk(sumiram, 200)) {
            const { error: eMarca } = await supabase.from("crm_leads").update({ removido_na_origem: agora, event_type: "delete" })
              .eq("crm_connection_id", conn.id).in("external_lead_id", lote).is("removido_na_origem", null);
            if (eMarca) { errors.push(`apagados: ${eMarca.message}`); break; }
          }
        }
      }
    }

    results.push({ clientId: conn.client_id, connectionId: conn.id, funis: pipelines.length, negocios: gravados, errors });
  }

  return results;
}
