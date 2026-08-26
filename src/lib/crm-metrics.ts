// status_id 142/143 são universais em toda conta Kommo — sempre "venda
// ganha"/"venda perdida", qualquer que seja o pipeline (confirmado via API
// GET /leads/pipelines: todo pipeline da conta tem essas duas etapas fixas).
const WON_STATUS_ID = "142";
const LOST_STATUS_ID = "143";

// custom_fields chega como objeto de chaves numéricas em string (não
// array), tanto pra lista de campos quanto pra lista de valores dentro de
// cada campo — formato bruto do webhook da Kommo.
function getCustomFieldValue(customFields: unknown, fieldNameIncludes: string): string | null {
  if (!customFields || typeof customFields !== "object") return null;
  for (const field of Object.values(customFields as Record<string, any>)) {
    if (typeof field?.name === "string" && field.name.includes(fieldNameIncludes)) {
      const values = field.values;
      if (!values || typeof values !== "object") return null;
      const first = Object.values(values as Record<string, any>)[0];
      return first?.value ?? null;
    }
  }
  return null;
}

export function getFonteDoLead(lead: { raw_payload: any }): string {
  return getCustomFieldValue(lead.raw_payload?.custom_fields, "Fonte do Lead") ?? "Não informado";
}

export function getTipoDeProcedimento(lead: { raw_payload: any }): string {
  return getCustomFieldValue(lead.raw_payload?.custom_fields, "Tipo de Procedim") ?? "Não informado";
}

export interface FunilRow {
  chave: string;
  total: number;
  ganhos: number;
  perdidos: number;
  emAndamento: number;
  taxaGanho: number;
}

function computeFunil<T extends { status_id: string | null }>(
  leads: T[],
  keyOf: (lead: T) => string,
): FunilRow[] {
  const groups = new Map<string, { total: number; ganhos: number; perdidos: number }>();
  for (const lead of leads) {
    const key = keyOf(lead);
    const entry = groups.get(key) ?? { total: 0, ganhos: 0, perdidos: 0 };
    entry.total++;
    if (lead.status_id === WON_STATUS_ID) entry.ganhos++;
    else if (lead.status_id === LOST_STATUS_ID) entry.perdidos++;
    groups.set(key, entry);
  }
  return Array.from(groups.entries())
    .map(([chave, v]) => ({
      chave,
      total: v.total,
      ganhos: v.ganhos,
      perdidos: v.perdidos,
      emAndamento: v.total - v.ganhos - v.perdidos,
      taxaGanho: v.total > 0 ? (v.ganhos / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// Quantos leads por fonte (Instagram, Indicação etc.), e quantos desses
// viraram venda — o cruzamento real de origem × resultado.
export function computeFunilPorFonte(leads: { status_id: string | null; raw_payload: any }[]): FunilRow[] {
  return computeFunil(leads, getFonteDoLead);
}

export function computeFunilPorProcedimento(leads: { status_id: string | null; raw_payload: any }[]): FunilRow[] {
  return computeFunil(leads, getTipoDeProcedimento);
}

export interface EtapaStatus {
  pipeline_id: string;
  pipeline_name: string;
  status_id: string;
  status_name: string;
}

export function computeLeadsPorEtapa(
  leads: { status_id: string | null; pipeline_id: string | null }[],
  statuses: EtapaStatus[],
) {
  const nameByKey = new Map(statuses.map((s) => [`${s.pipeline_id}__${s.status_id}`, s]));
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key = `${lead.pipeline_id}__${lead.status_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => {
      const meta = nameByKey.get(key);
      return {
        pipeline: meta?.pipeline_name ?? "—",
        etapa: meta?.status_name ?? "—",
        count,
      };
    })
    .sort((a, b) => b.count - a.count);
}
