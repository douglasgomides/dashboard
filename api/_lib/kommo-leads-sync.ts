/**
 * Sync ativo de leads da Kommo via API (GET /api/v4/leads), não só webhook
 * passivo. O webhook só entrega o que teve evento DEPOIS de registrado —
 * não cobre o histórico (dezenas de milhares de leads antigos) nem sempre
 * traz custom_fields completos (evento de mudança de etapa é mais magro
 * que o de lead criado). A API traz o estado atual completo de cada lead.
 *
 * Mesmo padrão de cursor do backfill de posts do Instagram: uma invocação
 * na Vercel não dá conta de paginar dezenas de milhares de leads de uma
 * vez. maxPages por chamada, estado salvo em crm_leads_sync_state. Uma vez
 * concluído o backfill completo, a mesma chamada vira sync incremental
 * diário — só busca leads atualizados recentemente (filter[updated_at]).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

const PAGE_SIZE = 250; // limite máximo da API da Kommo
const INCREMENTAL_LOOKBACK_DAYS = 3; // margem de segurança sobre o intervalo do job diário

interface KommoLead {
  id: number;
  status_id: number;
  pipeline_id: number;
  price: number | null;
  [key: string]: unknown;
}

export interface KommoLeadsSyncEnv {
  accessToken: string;
  kommoDomain: string; // ex: "gtlabiscentral.kommo.com"
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  crmConnectionId: string;
  clientId: string;
  maxPages?: number;
}

export interface KommoLeadsSyncResult {
  leadsFetched: number;
  leadsUpserted: number;
  done: boolean;
  mode: "backfill" | "incremental";
  errors: string[];
}

async function fetchLeadsPage(
  domain: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<{ leads: KommoLead[]; hasMore: boolean }> {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), ...params });
  const res = await fetch(`https://${domain}/api/v4/leads?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return { leads: [], hasMore: false };
  if (!res.ok) {
    throw new Error(`Kommo leads fetch failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { _embedded?: { leads?: KommoLead[] }; _links?: { next?: unknown } };
  const leads = body._embedded?.leads ?? [];
  return { leads, hasMore: !!body._links?.next };
}

export async function runKommoLeadsSync(env: KommoLeadsSyncEnv): Promise<KommoLeadsSyncResult> {
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const errors: string[] = [];
  const maxPages = env.maxPages ?? 5;

  const { data: state } = await supabase
    .from("crm_leads_sync_state")
    .select("next_page, backfill_done")
    .eq("crm_connection_id", env.crmConnectionId)
    .maybeSingle();

  const mode: "backfill" | "incremental" = state?.backfill_done ? "incremental" : "backfill";
  const baseParams: Record<string, string> =
    mode === "incremental"
      ? {
          "filter[updated_at][from]": String(
            Math.floor(Date.now() / 1000) - INCREMENTAL_LOOKBACK_DAYS * 86400,
          ),
        }
      : {};

  let page = mode === "backfill" ? (state?.next_page ?? 1) : 1;
  let pagesLeft = maxPages;
  let leadsFetched = 0;
  let leadsUpserted = 0;
  let hasMore = true;

  while (hasMore && pagesLeft > 0) {
    let result;
    try {
      result = await fetchLeadsPage(env.kommoDomain, env.accessToken, { ...baseParams, page: String(page) });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
    leadsFetched += result.leads.length;

    if (result.leads.length > 0) {
      const rows = result.leads.map((lead) => ({
        crm_connection_id: env.crmConnectionId,
        client_id: env.clientId,
        provider: "kommo" as const,
        external_lead_id: String(lead.id),
        event_type: "sync",
        status_id: String(lead.status_id),
        old_status_id: null,
        pipeline_id: String(lead.pipeline_id),
        price: lead.price,
        raw_payload: lead as any,
        received_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("crm_leads")
        .upsert(rows, { onConflict: "crm_connection_id,external_lead_id" });
      if (error) errors.push(`upsert page ${page}: ${error.message}`);
      else leadsUpserted += rows.length;
    }

    hasMore = mode === "backfill" ? result.leads.length === PAGE_SIZE : result.hasMore;
    page++;
    pagesLeft--;
  }

  const backfillDone = mode === "incremental" || !hasMore;
  if (errors.length === 0) {
    const { error: stateError } = await supabase.from("crm_leads_sync_state").upsert(
      {
        crm_connection_id: env.crmConnectionId,
        next_page: backfillDone ? 1 : page,
        backfill_done: backfillDone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "crm_connection_id" },
    );
    if (stateError) errors.push(`state upsert: ${stateError.message}`);
  }

  return { leadsFetched, leadsUpserted, done: backfillDone, mode, errors };
}
