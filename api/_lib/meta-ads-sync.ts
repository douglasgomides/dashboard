/**
 * Sync Windsor.ai (conector `facebook`) → Supabase para gasto de mídia.
 *
 * Roda pelo endpoint HTTP (api/sync/meta-ads.ts) que o n8n chama todo dia.
 * Usa a Windsor, e não a Graph API direto, por dois motivos: a chave já
 * existe e está autorizada nestas contas de anúncio, e o conector já entrega
 * `actions` achatado em colunas — inclusive a de conversa iniciada, que é o
 * único resultado mensurável nestas contas (não há pixel nem formulário, e
 * por isso `leads` e `landing_page_views` chegam zerados).
 *
 * Janela móvel curta por padrão: a Meta ainda revisa números de dias
 * recentes, e o upsert corrige o que mudou desde a última passada.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

const WINDSOR_BASE = "https://connectors.windsor.ai/facebook";

// Nome de campanha e objetivo vivem em meta_ads_campaigns, não em cada linha
// diária: a Meta trunca o nome de post impulsionado e duas campanhas
// diferentes chegam com o mesmo texto — a identidade real é o campaign_id.
const FIELDS = [
  "date",
  "campaign_id",
  "campaign",
  "objective",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "unique_clicks",
  "frequency",
  "actions_link_click",
  "actions_landing_page_view",
  "actions_lead",
  "actions_onsite_conversion_messaging_conversation_started_7d",
  // Criativo. A mídia do anúncio é uma cópia do post (media_product_type
  // 'AD'), com id e permalink próprios — não bate com instagram_posts, testado
  // por id e por permalink. Por isso guardamos o link aqui em vez de referenciar
  // o post orgânico.
  "effective_instagram_media_id",
  "effective_instagram_media__permalink",
  "effective_instagram_media__thumbnail_url",
];

export interface AdsSyncEnv {
  windsorApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  syncDays?: number;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
}

export interface AdsAccountSyncResult {
  clientId: string;
  clientName: string;
  adAccountId: string;
  campaigns: number;
  rows: number;
  errors: string[];
}

const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Number(null) é 0 em JS; aqui o 0 é o valor certo mesmo (dia sem clique é
// zero clique, não "sem dado"), mas string vazia e lixo viram 0 também em vez
// de NaN, que quebraria o insert.
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// frequency é a exceção: null aqui significa "a Meta não reportou", e gravar
// 0 diria que ninguém viu o anúncio mais de zero vezes — o que é falso.
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Mesma armadilha do sync de Instagram: sem _max_rows a Windsor corta em
// silêncio. Aqui o risco é maior — uma conta com 70 campanhas em 90 dias
// passa de 1.700 linhas.
async function windsorGet(
  windsorApiKey: string,
  dateFrom: string,
  dateTo: string,
  adAccountId: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    api_key: windsorApiKey,
    date_from: dateFrom,
    date_to: dateTo,
    fields: FIELDS.join(","),
    filter: JSON.stringify([["account_id", "eq", adAccountId]]),
    _max_rows: "100000",
  });
  const res = await fetch(`${WINDSOR_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Windsor.ai request failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  return body.data ?? [];
}

async function syncAccount(
  supabase: SupabaseClient<Database>,
  windsorApiKey: string,
  range: { from: string; to: string },
  client: { id: string; name: string; meta_ad_account_id: string },
): Promise<AdsAccountSyncResult> {
  const result: AdsAccountSyncResult = {
    clientId: client.id,
    clientName: client.name,
    adAccountId: client.meta_ad_account_id,
    campaigns: 0,
    rows: 0,
    errors: [],
  };

  const raw = await windsorGet(windsorApiKey, range.from, range.to, client.meta_ad_account_id);

  const campanhas = new Map<string, Database["public"]["Tables"]["meta_ads_campaigns"]["Insert"]>();
  const metricas: Database["public"]["Tables"]["meta_ads_daily"]["Insert"][] = [];

  for (const r of raw) {
    const campaignId = r.campaign_id ? String(r.campaign_id) : null;
    const date = r.date ? String(r.date) : null;
    if (!campaignId || !date) continue;

    const anterior = campanhas.get(campaignId);
    campanhas.set(campaignId, {
      client_id: client.id,
      ad_account_id: client.meta_ad_account_id,
      campaign_id: campaignId,
      name: String(r.campaign ?? "(sem nome)").slice(0, 180),
      objective: r.objective ? String(r.objective) : null,
      // A miniatura vem vazia em parte das linhas (6 de 20 na amostra), então
      // uma linha sem ela não pode apagar a que já tínhamos.
      instagram_media_id: texto(r.effective_instagram_media_id) ?? anterior?.instagram_media_id ?? null,
      permalink: texto(r.effective_instagram_media__permalink) ?? anterior?.permalink ?? null,
      thumbnail_url: texto(r.effective_instagram_media__thumbnail_url) ?? anterior?.thumbnail_url ?? null,
    });

    metricas.push({
      client_id: client.id,
      ad_account_id: client.meta_ad_account_id,
      date,
      campaign_id: campaignId,
      spend: num(r.spend),
      impressions: num(r.impressions),
      reach: num(r.reach),
      clicks: num(r.clicks),
      unique_clicks: num(r.unique_clicks),
      frequency: numOrNull(r.frequency),
      link_clicks: num(r.actions_link_click),
      landing_page_views: num(r.actions_landing_page_view),
      leads: num(r.actions_lead),
      conversations: num(r.actions_onsite_conversion_messaging_conversation_started_7d),
    });
  }

  // Campanhas primeiro: a tela junta métrica com nome, e uma métrica sem
  // campanha correspondente apareceria como "(campanha removida)".
  for (const batch of chunk([...campanhas.values()], BATCH_SIZE)) {
    const { error } = await supabase
      .from("meta_ads_campaigns")
      .upsert(batch, { onConflict: "client_id,ad_account_id,campaign_id" });
    if (error) result.errors.push(`campanhas: ${error.message}`);
    else result.campaigns += batch.length;
  }

  for (const batch of chunk(metricas, BATCH_SIZE)) {
    const { error } = await supabase
      .from("meta_ads_daily")
      .upsert(batch, { onConflict: "client_id,ad_account_id,date,campaign_id" });
    if (error) result.errors.push(`métricas: ${error.message}`);
    else result.rows += batch.length;
  }

  return result;
}

export async function runMetaAdsSync(env: AdsSyncEnv): Promise<AdsAccountSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const range = {
    from: env.dateFrom ?? dateNDaysAgo(env.syncDays ?? 7),
    to: env.dateTo ?? new Date().toISOString().slice(0, 10),
  };

  let query = supabase
    .from("clients")
    .select("id, name, meta_ad_account_id")
    .eq("active", true)
    .not("meta_ad_account_id", "is", null);
  if (env.clientId) query = query.eq("id", env.clientId);

  const { data: clients, error } = await query;
  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`);

  const results: AdsAccountSyncResult[] = [];
  for (const c of clients ?? []) {
    if (!c.meta_ad_account_id) continue;
    try {
      results.push(
        await syncAccount(supabase, env.windsorApiKey, range, {
          id: c.id,
          name: c.name,
          meta_ad_account_id: c.meta_ad_account_id,
        }),
      );
    } catch (err) {
      // Uma conta que falha não pode derrubar o sync das outras.
      results.push({
        clientId: c.id,
        clientName: c.name,
        adAccountId: c.meta_ad_account_id,
        campaigns: 0,
        rows: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return results;
}
