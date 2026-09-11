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
  // Agregado por (data, campanha), não uma linha por linha da Windsor.
  //
  // A consulta pede campos de nível de ANÚNCIO (media id, permalink,
  // thumbnail), então a Windsor devolve uma linha por anúncio. Uma campanha
  // com 3 anúncios no mesmo dia vira 3 linhas com a mesma chave, e o
  // Postgres recusa o comando inteiro com "ON CONFLICT DO UPDATE command
  // cannot affect row a second time" — derrubando o lote. Foi assim que o
  // Douglas ficou com 22 campanhas e zero métricas.
  const metricasPorChave = new Map<string, Database["public"]["Tables"]["meta_ads_daily"]["Insert"]>();

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

    const chave = `${date}|${campaignId}`;
    const acc = metricasPorChave.get(chave);
    if (!acc) {
      metricasPorChave.set(chave, {
        client_id: client.id,
        ad_account_id: client.meta_ad_account_id,
        date,
        campaign_id: campaignId,
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
        unique_clicks: num(r.unique_clicks),
        frequency: null, // recalculada depois de somar; ver abaixo
        link_clicks: num(r.actions_link_click),
        landing_page_views: num(r.actions_landing_page_view),
        leads: num(r.actions_lead),
        conversations: num(r.actions_onsite_conversion_messaging_conversation_started_7d),
      });
    } else {
      acc.spend = (acc.spend ?? 0) + num(r.spend);
      acc.impressions = (acc.impressions ?? 0) + num(r.impressions);
      // Alcance somado entre anúncios superestima: a mesma pessoa pode ter
      // visto dois anúncios da campanha. A Windsor não entrega alcance no
      // nível da campanha, então esta é a melhor aproximação disponível —
      // e é por isso que frequência é derivada, não somada.
      acc.reach = (acc.reach ?? 0) + num(r.reach);
      acc.clicks = (acc.clicks ?? 0) + num(r.clicks);
      acc.unique_clicks = (acc.unique_clicks ?? 0) + num(r.unique_clicks);
      acc.link_clicks = (acc.link_clicks ?? 0) + num(r.actions_link_click);
      acc.landing_page_views = (acc.landing_page_views ?? 0) + num(r.actions_landing_page_view);
      acc.leads = (acc.leads ?? 0) + num(r.actions_lead);
      acc.conversations = (acc.conversations ?? 0) + num(r.actions_onsite_conversion_messaging_conversation_started_7d);
    }
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

  // Frequência é impressões por pessoa alcançada — precisa ser calculada
  // depois da soma, nunca somada linha a linha.
  const metricas = [...metricasPorChave.values()].map((m) => ({
    ...m,
    frequency: m.reach && m.reach > 0 ? Number(((m.impressions ?? 0) / m.reach).toFixed(4)) : null,
  }));

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

  // As contas vêm de client_ad_accounts, não mais de clients.meta_ad_account_id.
  //
  // O campo no cadastro é singular e quem tem mais de uma conta ficava com ele
  // nulo — Dr. Sergio Maia (duas) e Dra. Juliana Paola (duas) caíam fora do
  // filtro `.not("meta_ad_account_id", "is", null)` e o botão de sincronizar
  // respondia "Este cliente não tem conta de anúncio ligada ao cadastro",
  // mesmo com as contas cadastradas e acessíveis. A tabela client_ad_accounts
  // existe exatamente para o caso de várias contas por cliente.
  //
  // meta_ad_account_id continua sendo lido como reserva, para não quebrar
  // cliente que só está no cadastro antigo enquanto a migração não termina.
  let contasQuery = supabase
    .from("client_ad_accounts")
    .select("client_id, ad_account_id, clients!inner(id, name, active)")
    .eq("active", true)
    .eq("clients.active", true);
  if (env.clientId) contasQuery = contasQuery.eq("client_id", env.clientId);

  const { data: vinculos, error: erroVinculos } = await contasQuery;
  if (erroVinculos) throw new Error(`Falha ao listar contas de anúncio: ${erroVinculos.message}`);

  const alvos = new Map<string, { id: string; name: string; meta_ad_account_id: string }>();
  for (const v of vinculos ?? []) {
    const cliente = v.clients as unknown as { id: string; name: string };
    alvos.set(`${v.client_id}:${v.ad_account_id}`, {
      id: v.client_id,
      name: cliente?.name ?? "",
      meta_ad_account_id: v.ad_account_id,
    });
  }

  let legadoQuery = supabase
    .from("clients")
    .select("id, name, meta_ad_account_id")
    .eq("active", true)
    .not("meta_ad_account_id", "is", null);
  if (env.clientId) legadoQuery = legadoQuery.eq("id", env.clientId);

  const { data: legado, error } = await legadoQuery;
  if (error) throw new Error(`Falha ao listar clientes: ${error.message}`);
  for (const c of legado ?? []) {
    if (!c.meta_ad_account_id) continue;
    const chave = `${c.id}:${c.meta_ad_account_id}`;
    if (!alvos.has(chave)) {
      alvos.set(chave, { id: c.id, name: c.name, meta_ad_account_id: c.meta_ad_account_id });
    }
  }

  const results: AdsAccountSyncResult[] = [];
  for (const alvo of alvos.values()) {
    try {
      results.push(await syncAccount(supabase, env.windsorApiKey, range, alvo));
    } catch (err) {
      // Uma conta que falha não pode derrubar o sync das outras.
      results.push({
        clientId: alvo.id,
        clientName: alvo.name,
        adAccountId: alvo.meta_ad_account_id,
        campaigns: 0,
        rows: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }

  return results;
}
