/**
 * Validade dos tokens da Meta usados pelos syncs (Instagram pela Graph e anúncios pela Graph).
 *
 * O token de usuário de longa duração vence em ~60 dias e o acesso aos dados (data_access_expires_at) em ~90 dias
 * sem uso; o token de usuário do sistema da Business Manager não vence (expires_at = 0). Quando vence, o sync só
 * descobre no dia em que a Meta passa a recusar. Aqui a data sai do debug_token da própria Meta e vira
 * "O token da Meta vence em N dias" na saúde das fontes, com 30 dias de antecedência, pelo mesmo caminho do Kommo
 * (registrarValidadeToken: não apaga motivo de outra origem e grava sync_status.token_expira_em).
 *
 * Nunca derruba o sync: qualquer falha (rede, token inválido, coluna ausente) só deixa de avisar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { registrarValidadeToken, type FonteSync, type TextoAvisoToken } from "./sync-status.js";

interface RespostaDebugToken {
  data?: { is_valid?: boolean; expires_at?: number | string | null; data_access_expires_at?: number | string | null };
}

/**
 * Data mais próxima entre o vencimento do token e o do acesso aos dados. Zero (ou ausente) quer dizer "não vence".
 * Token que a Meta já diz inválido vale como vencido agora: ele já não lê nada.
 */
export function vencimentoDoDebugToken(resposta: RespostaDebugToken | null | undefined, agora = new Date()): Date | null {
  const d = resposta?.data;
  if (!d) return null;
  if (d.is_valid === false) return agora;
  const datas = [d.expires_at, d.data_access_expires_at]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => new Date(v * 1000));
  if (datas.length === 0) return null;
  return datas.reduce((a, b) => (a < b ? a : b));
}

/** Consulta o debug_token. O próprio token se inspeciona (não precisa do token do app). null quando não deu para ler. */
export async function lerVencimentoTokenMeta(token: string, fetchImpl: typeof fetch = fetch): Promise<Date | null> {
  if (!token) return null;
  try {
    const t = encodeURIComponent(token);
    const r = await fetchImpl(`${META_GRAPH_URL}/debug_token?input_token=${t}&access_token=${t}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return vencimentoDoDebugToken((await r.json()) as RespostaDebugToken);
  } catch {
    return null;
  }
}

const TEXTO_META: Record<"instagram" | "anuncios", TextoAvisoToken> = {
  instagram: {
    artigo: "a",
    efeito: "os posts do Instagram não atualizam",
    acao: "A equipe da cliente precisa gerar um novo token na Business Manager e atualizar a conexão",
  },
  anuncios: {
    artigo: "a",
    efeito: "os anúncios lidos direto da Meta não atualizam",
    acao: "A equipe da cliente precisa gerar um novo token na Business Manager e atualizar a conexão",
  },
};

/**
 * Lê o vencimento de cada token (uma consulta por token distinto) e grava, por cliente, o mais próximo.
 * Cliente sem nenhuma data (todos os tokens sem vencimento) limpa um aviso antigo de token.
 */
export async function registrarValidadeTokensMeta(
  supabase: SupabaseClient<any, any, any>,
  fonte: Extract<FonteSync, "instagram" | "anuncios">,
  itens: { clientId: string; token: string | null | undefined }[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, Date | null>> {
  const porToken = new Map<string, Promise<Date | null>>();
  const porCliente = new Map<string, Date | null>();
  try {
    for (const { clientId, token } of itens) {
      if (!token) continue;
      if (!porToken.has(token)) porToken.set(token, lerVencimentoTokenMeta(token, fetchImpl));
      const exp = await porToken.get(token)!;
      const atual = porCliente.get(clientId);
      if (!porCliente.has(clientId) || (exp && (!atual || exp < atual))) porCliente.set(clientId, exp);
    }
    for (const [clientId, exp] of porCliente) await registrarValidadeToken(supabase, clientId, fonte, "Meta", exp, TEXTO_META[fonte]);
  } catch {
    /* aviso é extra */
  }
  return porCliente;
}

/** Tokens do Instagram pela Graph: o da conta (instagram_account_secrets) ou o do ambiente. Só leitura com service role. */
export async function tokensInstagramDasContas(
  supabase: SupabaseClient<any, any, any>,
  contas: { accountId: string; clientId: string }[],
  tokenAmbiente: string | undefined,
): Promise<{ clientId: string; token: string | null }[]> {
  if (contas.length === 0) return [];
  try {
    const { data } = await supabase
      .from("instagram_account_secrets")
      .select("instagram_account_id, meta_access_token")
      .in("instagram_account_id", contas.map((c) => c.accountId));
    const seg = new Map(((data ?? []) as { instagram_account_id: string; meta_access_token: string | null }[]).map((s) => [s.instagram_account_id, s.meta_access_token]));
    return contas.map((c) => ({ clientId: c.clientId, token: seg.get(c.accountId) || tokenAmbiente || null }));
  } catch {
    return [];
  }
}

/** Tokens dos anúncios pela Graph: o da conta (client_ad_accounts.access_token) ou o META_ADS_TOKEN. */
export async function tokensAnunciosDosClientes(
  supabase: SupabaseClient<any, any, any>,
  clientIds: string[],
  tokenAmbiente: string | undefined,
): Promise<{ clientId: string; token: string | null }[]> {
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return [];
  try {
    const { data } = await supabase.from("client_ad_accounts").select("client_id, access_token").in("client_id", ids).eq("active", true);
    return ((data ?? []) as { client_id: string; access_token: string | null }[])
      .map((c) => ({ clientId: c.client_id, token: c.access_token || tokenAmbiente || null }))
      .filter((c) => c.token);
  } catch {
    return [];
  }
}
