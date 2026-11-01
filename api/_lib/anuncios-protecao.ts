/**
 * Proteção contra "gasto trocado por zero".
 *
 * Caso que motivou (auditoria de 01/11/2026): no dia 21/10 o sync de anúncios regravou o dia 21/09 com gasto zero em
 * 4 contas, mas a Meta e a Windsor mostram gasto real nesse dia. O sync não registrou erro, e o cliente passou a ver
 * gasto zero num dia em que pagou anúncio.
 *
 * Regra (simples de propósito): um dia passado (anterior a ontem) que já tem gasto > 0 gravado NÃO é substituído por
 * uma resposta com gasto zero ou vazio. A linha é pulada e contada em "precisa_reconferir", para alguém conferir na
 * origem. Hoje e ontem ainda mudam na Meta e seguem sendo gravados normalmente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type LinhaDiaria = { date: string; campaign_id: string; spend?: number | null };

/** Último dia protegido: anteontem (hoje e ontem a Meta ainda fecha os números). */
export function ultimoDiaProtegido(hoje: string): string {
  return new Date(Date.parse(`${hoje.slice(0, 10)}T12:00:00Z`) - 2 * 86400_000).toISOString().slice(0, 10);
}

/** Chave de uma linha diária (dia + campanha). */
export const chaveDiaria = (date: string, campaignId: string) => `${date.slice(0, 10)}|${campaignId}`;

/**
 * Separa as linhas que podem ser gravadas das que trocariam gasto real por zero num dia passado.
 * `gastoExistente`: gasto já gravado por (dia|campanha), só das linhas com gasto > 0.
 */
export function separarZerosSuspeitos<T extends LinhaDiaria>(
  novas: T[],
  gastoExistente: Map<string, number>,
  limite: string,
): { gravar: T[]; puladas: T[] } {
  const gravar: T[] = [];
  const puladas: T[] = [];
  for (const l of novas) {
    const novo = Number(l.spend ?? 0);
    const antes = gastoExistente.get(chaveDiaria(l.date, l.campaign_id)) ?? 0;
    if (l.date.slice(0, 10) <= limite && !(novo > 0) && antes > 0) puladas.push(l);
    else gravar.push(l);
  }
  return { gravar, puladas };
}

/** Linhas candidatas a zero suspeito: dia passado e gasto zero/vazio. Só essas precisam de leitura no banco. */
export function candidatasAZero<T extends LinhaDiaria>(novas: T[], limite: string): T[] {
  return novas.filter((l) => l.date.slice(0, 10) <= limite && !(Number(l.spend ?? 0) > 0));
}

/**
 * Lê o gasto > 0 já gravado nos dias das linhas candidatas. Se a leitura falhar, devolve null: quem chama não grava
 * as candidatas (na dúvida, não apaga gasto).
 */
export async function lerGastoExistente(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  adAccountId: string,
  candidatas: LinhaDiaria[],
): Promise<Map<string, number> | null> {
  const mapa = new Map<string, number>();
  const datas = [...new Set(candidatas.map((l) => l.date.slice(0, 10)))].sort();
  if (datas.length === 0) return mapa;
  try {
    for (let i = 0; i < datas.length; i += 60) {
      const lote = datas.slice(i, i + 60);
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from("meta_ads_daily")
          .select("date, campaign_id, spend")
          .eq("client_id", clientId)
          .eq("ad_account_id", adAccountId)
          .in("date", lote)
          .gt("spend", 0)
          .order("date")
          .order("campaign_id")
          .range(de, de + 999);
        if (error) return null;
        for (const r of (data ?? []) as { date: string; campaign_id: string; spend: number | string }[]) {
          mapa.set(chaveDiaria(String(r.date), String(r.campaign_id)), Number(r.spend));
        }
        if ((data?.length ?? 0) < 1000) break;
      }
    }
    return mapa;
  } catch {
    return null;
  }
}

/**
 * Aplica a proteção a um lote de uma conta: devolve o que gravar e quantas linhas foram puladas.
 * Sem leitura do banco (falha), as candidatas a zero ficam de fora e também contam como "precisa reconferir".
 */
export async function protegerContraZero<T extends LinhaDiaria>(
  supabase: SupabaseClient<any, any, any>,
  clientId: string,
  adAccountId: string,
  novas: T[],
  hoje: string = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
): Promise<{ gravar: T[]; precisaReconferir: number }> {
  const limite = ultimoDiaProtegido(hoje);
  const candidatas = candidatasAZero(novas, limite);
  if (candidatas.length === 0) return { gravar: novas, precisaReconferir: 0 };
  const existente = await lerGastoExistente(supabase, clientId, adAccountId, candidatas);
  if (!existente) {
    const fora = new Set(candidatas);
    return { gravar: novas.filter((l) => !fora.has(l)), precisaReconferir: candidatas.length };
  }
  const { gravar, puladas } = separarZerosSuspeitos(novas, existente, limite);
  return { gravar, precisaReconferir: puladas.length };
}
