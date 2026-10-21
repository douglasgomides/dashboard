/**
 * Sync de negócios da Clint para crm_leads.
 *
 * GET /v1/deals traz os negócios e GET /v1/origins traz os funis e todas
 * as suas etapas, inclusive as vazias. O campo fields.fonte/UTM guarda a
 * origem de aquisição; o nome do funil não substitui esse campo.
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
  /**
   * Prazo (Date.now() em ms) para parar de paginar. A Clint não filtra por
   * data, então cada rodada puxa a origem inteira; o botão manual roda numa
   * função de ~60s e precisa devolver parcial + aviso em vez de estourar.
   */
  deadlineMs?: number;
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
  value?: number | string | null;
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

interface ClintOrigin {
  id: string;
  name?: string;
  stages?: { id: string; label: string }[];
}

export function clintSource(fields: ClintDeal["fields"]): string | null {
  // Algumas automações acrescentam a qualificação depois de "|". Ela
  // continua no raw_payload, sem fragmentar o agrupamento por origem.
  for (const key of ["fonte", "origem", "utm_source", "parameters_utm_source"]) {
    const raw = fields?.[key];
    if (typeof raw !== "string") continue;
    const value = raw.split("|")[0].trim();
    if (value) return value;
  }
  return null;
}

export function clintPrice(value: ClintDeal["value"]): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const res = await fetch(`${CLINT_BASE}${path}`, { headers: { "api-token": token }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!res.ok) {
    // O corpo do provedor pode conter contatos ou credenciais. Só o status
    // e o recurso são necessários para identificar a falha no painel.
    throw new Error(`Clint ${path.split("?")[0]} falhou (${res.status})`);
  }
  return res.json();
}

async function fetchOrigins(token: string): Promise<Map<string, ClintOrigin>> {
  const map = new Map<string, ClintOrigin>();
  for (let page = 1; page <= 200; page++) {
    const body = await clintGet(token, `/origins?limit=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(body?.data)) throw new Error("Clint origins: resposta sem lista de funis");
    for (const o of body.data) {
      if (o?.id) map.set(String(o.id), o);
    }
    if (!body.hasNext) return map;
    if (body.data.length === 0) throw new Error("Clint origins: paginação inconsistente");
  }
  throw new Error("Clint origins: limite de paginação atingido");
}

// Puxa todos os negócios de uma origem, página a página. A Clint devolve
// hasNext; confiamos nele em vez de calcular por totalCount, que muda entre
// páginas se alguém criar um negócio no meio da paginação.
async function fetchDealsByOrigin(
  token: string,
  originId: string,
  deadlineMs?: number,
): Promise<{ deals: ClintDeal[]; truncated: boolean }> {
  const all: ClintDeal[] = [];
  let page = 1;
  let truncated = false;
  // Trava de segurança: 200 páginas × 200 = 40 mil negócios por origem. Se
  // bater nisso, é bug de paginação, não volume real.
  while (page <= 200) {
    if (deadlineMs && Date.now() > deadlineMs) {
      truncated = true;
      break;
    }
    const body = await clintGet(token, `/deals?origin_id=${originId}&limit=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(body?.data)) throw new Error("Clint deals: resposta sem lista de negócios");
    const rows: ClintDeal[] = body.data;
    all.push(...rows);
    if (!body?.hasNext) break;
    if (rows.length === 0) throw new Error("Clint deals: paginação inconsistente");
    if (page === 200) truncated = true;
    page++;
  }
  return { deals: all, truncated };
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
    const configuredOrigins: unknown = (conn.config as any)?.origins;
    const origins = Array.isArray(configuredOrigins)
      ? [...new Set(configuredOrigins.filter((id): id is string => typeof id === "string" && id.length > 0))]
      : [];

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
      return new Map<string, ClintOrigin>();
    });

    const leadRows = new Map<string, Record<string, unknown>>();
    const stageRows = new Map<string, Record<string, unknown>>();

    for (const originId of origins) {
      const origin = originNames.get(originId);
      for (const stage of origin?.stages ?? []) {
        if (!stage.id || !stage.label) continue;
        stageRows.set(`${originId}:${stage.id}`, {
          crm_connection_id: conn.id,
          pipeline_id: originId,
          pipeline_name: origin?.name ?? originId,
          status_id: stage.id,
          status_name: stage.label,
        });
      }
    }

    for (const originId of origins) {
      const { deals, truncated } = await fetchDealsByOrigin(token, originId, env.deadlineMs).catch((err) => {
        errors.push(`origem ${originId}: ${err instanceof Error ? err.message : String(err)}`);
        return { deals: [] as ClintDeal[], truncated: false };
      });
      if (truncated) errors.push(`origem ${originId}: tempo esgotado, dados parciais — rode de novo`);

      const originName = originNames.get(originId)?.name ?? originId;

      for (const d of deals) {
        if (!d?.id) continue;
        // Uma resposta fora do recorte não pode trazer negócios de outro
        // cliente da mesma conta Clint.
        if (d.origin_id && d.origin_id !== originId) {
          errors.push(`origem ${originId}: negócio fora do funil solicitado`);
          continue;
        }

        leadRows.set(d.id, {
          crm_connection_id: conn.id,
          client_id: conn.client_id,
          provider: "clint",
          external_lead_id: d.id,
          event_type: "sync",
          status_id: d.stage_id ?? null,
          pipeline_id: d.origin_id ?? originId,
          price: clintPrice(d.value),
          occurred_at: d.created_at ?? null,
          outcome: normalizeOutcome(d.status),
          source: clintSource(d.fields),
          contact_name: d.contact?.name ?? null,
          contact_email: d.contact?.email ?? null,
          contact_phone: d.contact?.phone ?? null,
          raw_payload: d as unknown as Record<string, unknown>,
          received_at: d.updated_at ?? d.created_at ?? new Date().toISOString(),
        });

        // Etapas antigas ainda referenciadas por negócios ficam disponíveis
        // como fallback, sem substituir o catálogo atual da Clint.
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
    for (const batch of chunk([...leadRows.values()], BATCH_SIZE)) {
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
