/**
 * Sync de negócios da Clint para crm_leads.
 *
 * A Clint só expõe dois endpoints de leitura úteis: GET /v1/deals (paginado,
 * filtrável por origin_id) e GET /v1/origins. Não existe /v1/pipelines nem
 * /v1/stages — o nome da etapa vem junto do próprio negócio, no campo `stage`.
 *
 * Modelagem: a "origem" da Clint faz o papel de pipeline, e a etapa faz o
 * papel de status. Isso deixa os dados no mesmo formato que o Kommo já grava
 * em crm_pipeline_statuses, então o kanban e o funil funcionam para os dois
 * sem código separado.
 *
 * Quais origens pertencem a qual cliente fica em crm_connections.config,
 * não no código: a conta tem 20 origens e o recorte é decisão de negócio,
 * que muda sem deploy.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CLINT_BASE = "https://api.clint.digital/v1";
const PAGE_SIZE = 200;
const BATCH_SIZE = 500;

export interface ClintSyncEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyClientId?: string;
}

export interface ClintSyncResult {
  clientId: string;
  connectionId: string;
  origens: number;
  negocios: number;
  errors: string[];
}

interface ClintDeal {
  id: string;
  origin_id: string;
  stage?: string | null;
  stage_id?: string | null;
  status?: string | null;
  value?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  fields?: Record<string, unknown> | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    ddi?: string | null;
    instagram?: string | null;
  } | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// OPEN / WON / LOST na Clint. Qualquer coisa que não reconhecemos vira
// "open" em vez de null: um negócio sem desfecho conhecido está, por
// definição, em aberto — e null quebraria as contagens do painel.
function normalizeOutcome(status: unknown): "open" | "won" | "lost" {
  const s = String(status ?? "").toUpperCase();
  if (s === "WON") return "won";
  if (s === "LOST") return "lost";
  return "open";
}

async function clintGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${CLINT_BASE}${path}`, { headers: { "api-token": token } });
  if (!res.ok) {
    throw new Error(`Clint ${path} falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function fetchOrigins(token: string): Promise<Map<string, string>> {
  const body = await clintGet(token, "/origins");
  const map = new Map<string, string>();
  for (const o of body?.data ?? []) {
    if (o?.id) map.set(String(o.id), String(o.name ?? o.id));
  }
  return map;
}

// Puxa todos os negócios de uma origem, página a página. A Clint devolve
// hasNext; confiamos nele em vez de calcular por totalCount, que muda entre
// páginas se alguém criar um negócio no meio da paginação.
async function fetchDealsByOrigin(token: string, originId: string): Promise<ClintDeal[]> {
  const all: ClintDeal[] = [];
  let page = 1;
  // Trava de segurança: 200 páginas × 200 = 40 mil negócios por origem. Se
  // bater nisso, é bug de paginação, não volume real.
  while (page <= 200) {
    const body = await clintGet(token, `/deals?origin_id=${originId}&limit=${PAGE_SIZE}&page=${page}`);
    const rows: ClintDeal[] = body?.data ?? [];
    all.push(...rows);
    if (!body?.hasNext || rows.length === 0) break;
    page++;
  }
  return all;
}

export async function runClintSync(env: ClintSyncEnv): Promise<ClintSyncResult[]> {
  const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("crm_connections")
    .select("id, client_id, access_token, config")
    .eq("provider", "clint")
    .eq("active", true);
  if (env.onlyClientId) query = query.eq("client_id", env.onlyClientId);
  const { data: connections, error } = await query;
  if (error) throw error;

  const results: ClintSyncResult[] = [];

  for (const conn of connections ?? []) {
    const errors: string[] = [];
    const token = conn.access_token as string | null;
    const origins: string[] = (conn.config as any)?.origins ?? [];

    if (!token) {
      results.push({ clientId: conn.client_id, connectionId: conn.id, origens: 0, negocios: 0, errors: ["Conexão sem access_token"] });
      continue;
    }
    if (origins.length === 0) {
      results.push({ clientId: conn.client_id, connectionId: conn.id, origens: 0, negocios: 0, errors: ["Conexão sem origens em config.origins"] });
      continue;
    }

    const originNames = await fetchOrigins(token).catch((err) => {
      errors.push(`origins: ${err instanceof Error ? err.message : String(err)}`);
      return new Map<string, string>();
    });

    const leadRows: Record<string, unknown>[] = [];
    const stageRows = new Map<string, Record<string, unknown>>();

    for (const originId of origins) {
      const deals = await fetchDealsByOrigin(token, originId).catch((err) => {
        errors.push(`origem ${originId}: ${err instanceof Error ? err.message : String(err)}`);
        return [] as ClintDeal[];
      });

      const originName = originNames.get(originId) ?? originId;

      for (const d of deals) {
        if (!d?.id) continue;

        leadRows.push({
          crm_connection_id: conn.id,
          client_id: conn.client_id,
          provider: "clint",
          external_lead_id: d.id,
          event_type: "sync",
          status_id: d.stage_id ?? null,
          pipeline_id: d.origin_id ?? originId,
          price: typeof d.value === "number" ? d.value : null,
          occurred_at: d.created_at ?? null,
          outcome: normalizeOutcome(d.status),
          // A origem é o que mais se aproxima de "de onde veio o lead" na
          // Clint — o equivalente ao campo "Fonte do Lead" do Kommo.
          source: originName,
          contact_name: d.contact?.name ?? null,
          contact_email: d.contact?.email ?? null,
          contact_phone: d.contact?.phone ?? null,
          raw_payload: d as unknown as Record<string, unknown>,
          received_at: d.updated_at ?? d.created_at ?? new Date().toISOString(),
        });

        // A etapa só existe dentro do negócio, então o catálogo de etapas é
        // descoberto a partir deles. Map por chave composta evita repetir a
        // mesma etapa uma vez por negócio.
        if (d.stage_id && d.stage) {
          const key = `${d.origin_id ?? originId}:${d.stage_id}`;
          if (!stageRows.has(key)) {
            stageRows.set(key, {
              crm_connection_id: conn.id,
              pipeline_id: d.origin_id ?? originId,
              pipeline_name: originName,
              status_id: d.stage_id,
              status_name: d.stage,
            });
          }
        }
      }
    }

    let gravados = 0;
    for (const batch of chunk(leadRows, BATCH_SIZE)) {
      const { error: upsertError } = await supabase
        .from("crm_leads")
        .upsert(batch, { onConflict: "crm_connection_id,external_lead_id" });
      if (upsertError) errors.push(`leads (${batch.length}): ${upsertError.message}`);
      else gravados += batch.length;
    }

    if (stageRows.size > 0) {
      const { error: stageError } = await supabase
        .from("crm_pipeline_statuses")
        .upsert([...stageRows.values()], { onConflict: "crm_connection_id,pipeline_id,status_id" });
      if (stageError) errors.push(`etapas: ${stageError.message}`);
    }

    results.push({
      clientId: conn.client_id,
      connectionId: conn.id,
      origens: origins.length,
      negocios: gravados,
      errors,
    });
  }

  return results;
}
