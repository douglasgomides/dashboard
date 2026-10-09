// Saúde das fontes de cada cliente: até que data cada fonte tem dado, lido do próprio banco.
// Usa a RPC client_sync_status quando ela existe; se a migração ainda não foi aplicada, lê as
// tabelas com as mesmas regras (RLS vale igual), para o selo e a Visão geral não sumirem.
import { supabase } from "@/integrations/supabase/client";

export type LinhaFonte = {
  fonte: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_rows: number | null;
  data_ate: string | null;
  // Por que está parada, descoberto pelo sync na origem (ex.: erro de pagamento na Meta) e de quem é a ação.
  motivo?: string | null;
  motivo_dono?: string | null;
};

export type Fontes = { tem_instagram: boolean; tem_anuncios: boolean; tem_crm: boolean; tem_atendimento: boolean } | null;

async function ultima(tabela: string, coluna: string, clientId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from(tabela)
    .select(coluna)
    .eq("client_id", clientId)
    .not(coluna, "is", null)
    .order(coluna, { ascending: false })
    .limit(1);
  const v = data?.[0]?.[coluna];
  return v ? String(v).slice(0, 10) : null;
}

export async function dadosAte(clientId: string): Promise<LinhaFonte[]> {
  const [igDia, igPost, ads, crm, wts] = await Promise.all([
    ultima("instagram_account_daily_metrics", "date", clientId),
    ultima("instagram_posts", "metrics_updated_at", clientId),
    ultima("meta_ads_daily", "date", clientId),
    // Data do lead, não a da sincronização (o Kommo grava received_at = agora a cada rodada).
    ultima("crm_leads", "occurred_at", clientId).then(async (d) => d ?? (await ultima("crm_leads", "received_at", clientId))),
    ultima("wts_sessions", "started_at", clientId),
  ]);
  // Instagram vale o dado MAIS ANTIGO entre a conta e os posts (caso da Marcelly: posts parados, conta em dia).
  const ig = igDia && igPost ? (igDia < igPost ? igDia : igPost) : (igDia ?? igPost);
  const l = (fonte: string, data_ate: string | null): LinhaFonte => ({
    fonte, last_attempt_at: null, last_success_at: null, last_error: null, last_rows: null, data_ate,
  });
  return [l("instagram", ig), l("anuncios", ads), l("crm", crm), l("atendimento", wts)];
}

// Depois do primeiro 404 da RPC, não insiste: o console fica limpo e cada tela poupa uma chamada.
const CHAVE_RPC = "dc:rpc-sync-status-ausente";
let rpcIndisponivel = (() => {
  try {
    return sessionStorage.getItem(CHAVE_RPC) === "1";
  } catch {
    return false;
  }
})();

export async function statusDoCliente(clientId: string): Promise<LinhaFonte[]> {
  if (rpcIndisponivel) return dadosAte(clientId);
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: LinhaFonte[] | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("client_sync_status", { p_client_id: clientId });
  if (!error) return data ?? [];
  rpcIndisponivel = true;
  try {
    sessionStorage.setItem(CHAVE_RPC, "1");
  } catch {
    /* sem storage: só perde a economia de chamada */
  }
  return dadosAte(clientId);
}

export function diasDeAtraso(dataAte: string): number {
  const [a, m, d] = dataAte.slice(0, 10).split("-").map(Number);
  const hoje = new Date();
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base - Date.UTC(a, m - 1, d)) / 86400000);
}

export type Tom = "bom" | "atencao" | "ruim" | "neutro";
export function tomDaFonte(l: Pick<LinhaFonte, "data_ate" | "last_error"> | undefined): Tom {
  if (!l) return "neutro";
  if (l.last_error) return "ruim";
  if (!l.data_ate) return "neutro";
  const atraso = diasDeAtraso(l.data_ate);
  return atraso <= 1 ? "bom" : atraso <= 3 ? "atencao" : "ruim";
}

export function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
