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
import { integrationHost, integrationRequest } from "./integration-http.js";

const PAGE_SIZE = 250; // limite máximo da API da Kommo
const INCREMENTAL_LOOKBACK_DAYS = 3; // margem de segurança sobre o intervalo do job diário

export interface KommoLead {
  id: number;
  status_id: number;
  pipeline_id: number;
  price: number | null;
  created_at?: number | null;
  name?: string | null;
  custom_fields_values?: { field_name?: string; values?: { value?: unknown }[] }[] | null;
  [key: string]: unknown;
}

// O Kommo codifica ganho e perda em ids fixos de status: 142 é ganho, 143 é
// perdido, qualquer outro é etapa comum. A Clint usa texto (WON/LOST/OPEN).
// A coluna outcome guarda o significado, já traduzido, para as funções do
// banco não precisarem saber de qual CRM veio a linha.
function kommoOutcome(statusId: number): "open" | "won" | "lost" {
  if (statusId === 142) return "won";
  if (statusId === 143) return "lost";
  return "open";
}

function kommoCampo(lead: KommoLead, padrao: RegExp): string | null {
  const campos = Array.isArray(lead.custom_fields_values) ? lead.custom_fields_values : [];
  for (const c of campos) {
    if (c?.field_name && padrao.test(c.field_name)) {
      const v = c.values?.[0]?.value;
      if (v != null && String(v) !== "") return String(v);
    }
  }
  return null;
}

/**
 * A linha de crm_leads que o Kommo vira. Exportada para o sync, a reconciliação
 * e os scripts usarem exatamente a mesma tradução.
 */
export function linhaDoLead(lead: KommoLead, crmConnectionId: string, clientId: string) {
  return {
    crm_connection_id: crmConnectionId,
    client_id: clientId,
    provider: "kommo" as const,
    external_lead_id: String(lead.id),
    event_type: "sync",
    status_id: String(lead.status_id),
    old_status_id: null,
    pipeline_id: String(lead.pipeline_id),
    price: lead.price,
    // Colunas normalizadas: o mesmo significado que as funções do banco
    // antes extraíam do raw_payload a cada consulta. Gravar aqui é o que
    // permite que Kommo e Clint sejam lidos pela mesma função — e sem
    // isso, todo lead novo entraria sem data e sumiria dos "novos 7 dias".
    occurred_at: lead.created_at ? new Date(lead.created_at * 1000).toISOString() : null,
    outcome: kommoOutcome(lead.status_id),
    // "Fonte do Lead" (Lana) ou "Origem do Lead" (HOMS): o mesmo dado, nomes diferentes por conta.
    source: kommoCampo(lead, /(Fonte|Origem) do Lead/i),
    // Canal de entrada (WhatsApp, comentários do Instagram, formulário...). O Kommo só devolve
    // quando se pede with=source_id; sem isso o campo vem ausente e fica nulo aqui.
    canal_id: lead.source_id != null ? String(lead.source_id) : null,
    contact_name: lead.name ?? null,
    raw_payload: lead as any,
    received_at: new Date().toISOString(),
    removido_na_origem: null,
  };
}

/** GET /api/v4/leads/pipelines → linhas de crm_pipeline_statuses (funil = pipeline, etapa = status). */
export function etapasDosFunis(body: unknown, crmConnectionId: string) {
  const funis = (body as { _embedded?: { pipelines?: unknown[] } })?._embedded?.pipelines;
  if (!Array.isArray(funis)) return [];
  return funis.flatMap((f) => {
    const funil = f as { id?: number; name?: string; _embedded?: { statuses?: Array<{ id?: number; name?: string }> } };
    if (!Number.isSafeInteger(funil.id)) return [];
    return (funil._embedded?.statuses ?? [])
      .filter((s) => Number.isSafeInteger(s.id) && typeof s.name === "string" && s.name.trim())
      .map((s) => ({
        crm_connection_id: crmConnectionId,
        pipeline_id: String(funil.id),
        pipeline_name: String(funil.name ?? funil.id).trim(),
        status_id: String(s.id),
        status_name: s.name!.trim(),
      }));
  });
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
  const res = await fetch(`https://${domain}/api/v4/leads?${qs.toString()}`, integrationRequest({
    headers: { Authorization: `Bearer ${accessToken}` },
  }));
  if (res.status === 204) return { leads: [], hasMore: false };
  if (!res.ok) {
    throw new Error(`Kommo leads fetch failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { _embedded?: { leads?: KommoLead[] }; _links?: { next?: unknown } };
  const leads = body?._embedded?.leads;
  if (!Array.isArray(leads) || leads.some((l) => !l || !Number.isSafeInteger(l.id) || l.id <= 0)) {
    throw new Error("Kommo leads: resposta inválida, cursor preservado");
  }
  return { leads, hasMore: !!body._links?.next };
}

export async function runKommoLeadsSync(env: KommoLeadsSyncEnv): Promise<KommoLeadsSyncResult> {
  const domain = integrationHost(env.kommoDomain, "kommo");
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const errors: string[] = [];

  // Nomes dos motivos de perda: o lead só traz loss_reason_id. Sem o nome, ninguém sabe o que o número
  // significa e o SAP não consegue separar preço, medo, cônjuge... (07.07). Falha aqui não para o sync.
  try {
    const res = await fetch(`https://${domain}/api/v4/leads/loss_reasons?limit=250`, integrationRequest({
      headers: { Authorization: `Bearer ${env.accessToken}` },
    }));
    if (res.ok && res.status !== 204) {
      const body = (await res.json()) as { _embedded?: { loss_reasons?: { id: number; name: string }[] } };
      const motivos = body._embedded?.loss_reasons ?? [];
      if (motivos.length) {
        const { error } = await (supabase as any).from("crm_motivos_perda").upsert(
          motivos.map((m) => ({ crm_connection_id: env.crmConnectionId, motivo_id: String(m.id), nome: m.name, atualizado_em: new Date().toISOString() })),
          { onConflict: "crm_connection_id,motivo_id" },
        );
        if (error) errors.push(`motivos de perda: ${error.message}`);
      }
    }
  } catch (err) {
    errors.push(`motivos de perda: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Nomes dos funis e etapas: sem isso, etapa criada no Kommo depois da carga inicial aparece como "?" e não entra em
  // "consulta agendada" nem na aba "A analisar" (Dra. Lana: 591 leads no funil Cadência em 3 etapas sem nome).
  // Falha aqui não para o sync.
  try {
    const res = await fetch(`https://${domain}/api/v4/leads/pipelines`, integrationRequest({
      headers: { Authorization: `Bearer ${env.accessToken}` },
    }));
    if (res.ok && res.status !== 204) {
      const etapas = etapasDosFunis(await res.json(), env.crmConnectionId);
      if (etapas.length) {
        const { error } = await (supabase as any).from("crm_pipeline_statuses").upsert(etapas, { onConflict: "crm_connection_id,pipeline_id,status_id" });
        if (error) errors.push(`etapas: ${error.message}`);
      }
    }
  } catch (err) {
    errors.push(`etapas: ${err instanceof Error ? err.message : String(err)}`);
  }
  const maxPages = Number.isInteger(env.maxPages) && env.maxPages! > 0 ? Math.min(env.maxPages!, 100) : 5;

  const { data: state, error: stateReadError } = await supabase
    .from("crm_leads_sync_state")
    .select("next_page, backfill_done")
    .eq("crm_connection_id", env.crmConnectionId)
    .maybeSingle();
  if (stateReadError) return { leadsFetched: 0, leadsUpserted: 0, done: false, mode: "backfill", errors: [...errors, `state read: ${stateReadError.message}`] };

  const mode: "backfill" | "incremental" = state?.backfill_done ? "incremental" : "backfill";
  const baseParams: Record<string, string> =
    mode === "incremental"
      ? {
          "filter[updated_at][from]": String(
            Math.floor(Date.now() / 1000) - INCREMENTAL_LOOKBACK_DAYS * 86400,
          ),
        }
      : {};

  let page = mode === "backfill" && Number.isInteger(state?.next_page) && state!.next_page > 0 ? state!.next_page : 1;
  let pagesLeft = maxPages;
  let leadsFetched = 0;
  let leadsUpserted = 0;
  let hasMore = true;

  // Persiste o cursor a cada página processada. Antes, o estado só era salvo
  // no fim da execução E somente se `errors.length === 0`. Numa conta grande
  // (ex.: HOMS, ~30 páginas) a função estoura o tempo da Vercel no meio ou uma
  // página falha — e aí TODO o avanço era descartado: a próxima execução
  // recomeçava da mesma página e nunca passava dali (ficava congelada). Salvar
  // por página garante que o backfill avance a cada execução, retomando de onde
  // parou, mesmo com timeout ou erro pontual.
  async function persistState(nextPage: number, done: boolean) {
    const { error: stateError } = await supabase.from("crm_leads_sync_state").upsert(
      {
        crm_connection_id: env.crmConnectionId,
        next_page: done ? 1 : nextPage,
        backfill_done: done,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "crm_connection_id" },
    );
    if (stateError) errors.push(`state upsert: ${stateError.message}`);
    return !stateError;
  }

  while (hasMore && pagesLeft > 0) {
    let result;
    try {
      result = await fetchLeadsPage(domain, env.accessToken, {
        ...baseParams,
        page: String(page),
        with: "custom_fields_values,source_id,contacts",
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
    leadsFetched += result.leads.length;

    if (result.leads.length > 0) {
      const rows = result.leads.map((lead) => linhaDoLead(lead, env.crmConnectionId, env.clientId));
      const { error } = await supabase
        .from("crm_leads")
        .upsert(rows, { onConflict: "crm_connection_id,external_lead_id" });
      if (error) {
        errors.push(`upsert page ${page}: ${error.message}`);
        break;
      }
      leadsUpserted += rows.length;
    }

    // Grava o avanço imediatamente, página a página, para não perder o
    // progresso. Nem a falha da página nem a do estado podem descartá-la.
    const pageHasMore = mode === "backfill" ? result.leads.length === PAGE_SIZE : result.hasMore;
    if (!(await persistState(page + 1, mode === "incremental" || !pageHasMore))) break;
    hasMore = pageHasMore;
    page++;
    pagesLeft--;
  }

  if (mode === "incremental" && hasMore && pagesLeft === 0) errors.push("Kommo incremental incompleto: limite de páginas atingido; aumente max_pages para cobrir a janela");
  return { leadsFetched, leadsUpserted, done: !hasMore, mode, errors };
}
