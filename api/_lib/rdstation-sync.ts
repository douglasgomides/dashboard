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
  const res = await fetch(`${RD_BASE}/${path}?${qs.toString()}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    // Nunca repetir a URL no erro: ela carrega o token.
    throw new Error(`RD Station /${path} falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  }
  return res.json();
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
    try {
      pipelines = await fetchPipelines(token);
    } catch (err) {
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

    const leadRows = deals
      .filter((d) => d?._id)
      .map((d) => {
        const stageId = String(d.deal_stage?._id ?? d.deal_stage?.id ?? "") || null;
        const pipeline = stageId ? stageToPipeline.get(stageId) : undefined;
        const contato = d.contacts?.[0];
        return {
          crm_connection_id: conn.id,
          client_id: conn.client_id,
          provider: "rdstation",
          external_lead_id: d._id,
          event_type: "sync",
          status_id: stageId,
          pipeline_id: pipeline?.id ?? "rdstation",
          price: typeof d.amount_total === "number" && d.amount_total > 0 ? d.amount_total : null,
          occurred_at: d.created_at ?? null,
          outcome: rdOutcome(d.win),
          source: d.deal_source?.name ?? null,
          contact_name: contato?.name ?? d.name ?? null,
          contact_email: contato?.emails?.[0]?.email ?? null,
          contact_phone: contato?.phones?.[0]?.phone ?? null,
          raw_payload: d as unknown as Record<string, unknown>,
          received_at: d.updated_at ?? d.created_at ?? new Date().toISOString(),
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

    results.push({ clientId: conn.client_id, connectionId: conn.id, funis: pipelines.length, negocios: gravados, errors });
  }

  return results;
}
