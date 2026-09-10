/**
 * Gasto de mídia lido direto da Marketing API da Meta, sem intermediário.
 *
 * Substitui o caminho pela Windsor (api/_lib/meta-ads-sync.ts) pelo mesmo
 * motivo que o Instagram já migrou: dado oficial vem completo. O comentário
 * em api/sync/manual.ts registra a constatação de quando isso foi descoberto
 * — "mandar todo mundo pra Windsor sobrescreveria com dado furado quem vem da
 * Graph API".
 *
 * Escreve nas MESMAS tabelas do caminho antigo (meta_ads_daily e
 * meta_ads_campaigns), então as telas e as funções do banco não mudam.
 *
 * As contas vêm de client_ad_accounts, não de clients.meta_ad_account_id: um
 * cliente pode ter mais de uma conta — a Dra. Juliana Paola tem duas.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

const API = "https://graph.facebook.com/v21.0";

export type MetaAdsGraphEnv = {
  accessToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  syncDays?: number;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
};

export type MetaAdsGraphResult = {
  client_id: string;
  client_name: string;
  ad_account_id: string;
  rows: number;
  campaigns: number;
  spend: number;
  conversations: number;
  errors: string[];
};

type AcaoMeta = { action_type?: string; value?: string | number };

type LinhaInsight = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  unique_clicks?: string;
  frequency?: string;
  inline_link_clicks?: string;
  actions?: AcaoMeta[];
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * A Windsor entregava `actions` já achatado em colunas. Indo direto, o array
 * vem aninhado e a extração é nossa.
 *
 * É o trecho mais delicado deste arquivo: `messaging_conversation_started_7d`
 * é a ÚNICA conversão que estas contas médicas têm. Não há pixel nem
 * formulário, então `lead` e `landing_page_view` chegam zerados e o custo por
 * conversa sai daqui. Errar a chave não gera erro — gera custo por conversa
 * infinito, que parece campanha ruim.
 *
 * A Meta versiona a chave por janela de atribuição, e o nome exato mudou entre
 * versões da API. Por isso casamos por sufixo em vez de string fixa: pega
 * tanto "onsite_conversion.messaging_conversation_started_7d" quanto a
 * variante sem o prefixo de onsite_conversion.
 */
function somaAcao(acoes: AcaoMeta[] | undefined, casa: (tipo: string) => boolean): number {
  if (!acoes) return 0;
  let total = 0;
  for (const a of acoes) {
    if (a.action_type && casa(a.action_type)) total += n(a.value);
  }
  return total;
}

function conversas(acoes: AcaoMeta[] | undefined): number {
  return somaAcao(acoes, (t) => t.includes("messaging_conversation_started"));
}
function leads(acoes: AcaoMeta[] | undefined): number {
  return somaAcao(acoes, (t) => t === "lead" || t === "offsite_conversion.fb_pixel_lead");
}
function landingPageViews(acoes: AcaoMeta[] | undefined): number {
  return somaAcao(acoes, (t) => t === "landing_page_view");
}
function linkClicks(acoes: AcaoMeta[] | undefined): number {
  return somaAcao(acoes, (t) => t === "link_click");
}

async function buscarInsights(
  contaId: string,
  token: string,
  since: string,
  until: string,
): Promise<LinhaInsight[]> {
  const campos = [
    "date_start",
    "campaign_id",
    "campaign_name",
    "objective",
    "spend",
    "impressions",
    "reach",
    "clicks",
    "unique_clicks",
    "frequency",
    "inline_link_clicks",
    "actions",
  ].join(",");

  // act_ é obrigatório no caminho, e o id vem sem ele do cadastro.
  const conta = contaId.startsWith("act_") ? contaId : `act_${contaId}`;
  let url =
    `${API}/${conta}/insights?level=campaign&time_increment=1` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&fields=${campos}&limit=500&access_token=${encodeURIComponent(token)}`;

  const linhas: LinhaInsight[] = [];
  // Teto de páginas: uma conta com muitas campanhas em janela longa pagina
  // bastante, e a função da Vercel tem tempo limitado.
  for (let pagina = 0; pagina < 20 && url; pagina++) {
    const res = await fetch(url);
    const texto = await res.text();
    if (!res.ok) {
      throw new Error(`Meta insights ${conta} respondeu ${res.status}: ${texto.slice(0, 300)}`);
    }
    const corpo = JSON.parse(texto) as { data?: LinhaInsight[]; paging?: { next?: string } };
    linhas.push(...(corpo.data ?? []));
    url = corpo.paging?.next ?? "";
  }
  return linhas;
}

export async function runMetaAdsGraphSync(env: MetaAdsGraphEnv): Promise<MetaAdsGraphResult[]> {
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let consulta = supabase
    .from("client_ad_accounts")
    .select("client_id, ad_account_id, clients(name, active)")
    .eq("active", true);
  if (env.clientId) consulta = consulta.eq("client_id", env.clientId);

  const { data: contas, error } = await consulta;
  if (error) throw new Error(error.message);
  if (!contas || contas.length === 0) return [];

  const dias = env.syncDays ?? 7;
  const hoje = new Date();
  const until = env.dateTo ?? hoje.toISOString().slice(0, 10);
  const since =
    env.dateFrom ?? new Date(hoje.getTime() - dias * 86400_000).toISOString().slice(0, 10);

  const resultados: MetaAdsGraphResult[] = [];

  for (const conta of contas) {
    const cliente = conta.clients as unknown as { name: string; active: boolean } | null;
    if (!cliente?.active) continue;

    const r: MetaAdsGraphResult = {
      client_id: conta.client_id,
      client_name: cliente.name,
      ad_account_id: conta.ad_account_id,
      rows: 0,
      campaigns: 0,
      spend: 0,
      conversations: 0,
      errors: [],
    };

    try {
      const linhas = await buscarInsights(conta.ad_account_id, env.accessToken, since, until);

      // A Meta devolve uma linha por campanha por dia. Campanha repete em
      // todos os dias, então o cadastro dela é deduplicado antes de gravar.
      const campanhas = new Map<string, { name: string; objective: string | null }>();
      const diarias = [];

      for (const l of linhas) {
        if (!l.campaign_id || !l.date_start) continue;
        campanhas.set(l.campaign_id, {
          name: l.campaign_name ?? l.campaign_id,
          objective: l.objective ?? null,
        });
        const conv = conversas(l.actions);
        diarias.push({
          client_id: conta.client_id,
          ad_account_id: conta.ad_account_id,
          date: l.date_start,
          campaign_id: l.campaign_id,
          spend: n(l.spend),
          impressions: n(l.impressions),
          reach: n(l.reach),
          clicks: n(l.clicks),
          unique_clicks: n(l.unique_clicks),
          frequency: l.frequency ? n(l.frequency) : null,
          // inline_link_clicks é o campo dedicado; o array é reserva para
          // quando ele não vem.
          link_clicks: l.inline_link_clicks ? n(l.inline_link_clicks) : linkClicks(l.actions),
          landing_page_views: landingPageViews(l.actions),
          leads: leads(l.actions),
          conversations: conv,
          updated_at: new Date().toISOString(),
        });
        r.spend += n(l.spend);
        r.conversations += conv;
      }

      if (campanhas.size > 0) {
        // Só nome e objetivo. Miniatura e permalink do criativo vêm de outro
        // caminho e seriam apagados se entrassem nulos aqui.
        const linhasCamp = [...campanhas.entries()].map(([id, c]) => ({
          client_id: conta.client_id,
          ad_account_id: conta.ad_account_id,
          campaign_id: id,
          name: c.name,
          objective: c.objective,
          updated_at: new Date().toISOString(),
        }));
        for (let i = 0; i < linhasCamp.length; i += 200) {
          const { error: e } = await supabase
            .from("meta_ads_campaigns")
            .upsert(linhasCamp.slice(i, i + 200), { onConflict: "client_id,ad_account_id,campaign_id" });
          if (e) r.errors.push(`campanhas: ${e.message}`);
        }
        r.campaigns = linhasCamp.length;
      }

      for (let i = 0; i < diarias.length; i += 300) {
        const { error: e } = await supabase
          .from("meta_ads_daily")
          .upsert(diarias.slice(i, i + 300), { onConflict: "client_id,ad_account_id,date,campaign_id" });
        if (e) r.errors.push(`diárias: ${e.message}`);
        else r.rows += diarias.slice(i, i + 300).length;
      }
    } catch (err) {
      r.errors.push(err instanceof Error ? err.message : String(err));
    }

    resultados.push(r);
  }

  return resultados;
}
