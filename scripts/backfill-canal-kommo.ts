/**
 * Preenche crm_leads.canal_id (canal de entrada, source_id do Kommo) nos leads que já estavam no banco.
 *
 * Por quê: a sincronização só passou a pedir with=source_id agora, então os leads antigos têm canal_id nulo
 * e o alerta "sem origem" não consegue descontar os que entraram por comentário, direct ou formulário.
 * Só escreve canal_id (nunca source, raw_payload ou etapa) e só em lead que já existe aqui.
 *
 * Uso (variáveis de ambiente, nada de segredo no código):
 *   SUPABASE_URL, SK (service role), KOMMO_TOKEN, KOMMO_DOMAIN (ex.: gtlabiscentral.kommo.com), CONN_ID,
 *   DIAS (padrão 90; 0 = tudo), DRY=1 só conta por canal e não grava.
 */
import { createClient } from "@supabase/supabase-js";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`falta ${k}`);
  return v;
};
const url = need("SUPABASE_URL"), sk = need("SK"), token = need("KOMMO_TOKEN"), domain = need("KOMMO_DOMAIN");
const connId = need("CONN_ID");
const dias = Number(process.env.DIAS ?? "90");
const dry = process.env.DRY === "1";
const sb = createClient(url, sk, { auth: { persistSession: false } });

const PAGE = 250;
const desde = dias > 0 ? Math.floor(Date.now() / 1000) - dias * 86400 : 0;

async function pagina(page: number): Promise<{ id: number; source_id: number | null }[]> {
  const qs = new URLSearchParams({ limit: String(PAGE), page: String(page), with: "source_id", "order[created_at]": "desc" });
  if (desde) qs.set("filter[created_at][from]", String(desde));
  const res = await fetch(`https://${domain}/api/v4/leads?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Kommo leads ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json())._embedded?.leads ?? []) as any[];
}

const porCanal = new Map<string, string[]>();
let lidos = 0;
for (let page = 1; page <= 200; page++) {
  const leads = await pagina(page);
  for (const l of leads) {
    if (l.source_id == null) continue;
    const k = String(l.source_id);
    (porCanal.get(k) ?? porCanal.set(k, []).get(k)!).push(String(l.id));
  }
  lidos += leads.length;
  if (leads.length < PAGE) break;
}
console.log(`leads lidos no Kommo: ${lidos}`);
console.log([...porCanal].map(([c, ids]) => `${c}: ${ids.length}`).join("\n"));

if (dry) {
  console.log("DRY=1: nada gravado");
} else {
  let gravados = 0;
  for (const [canal, ids] of porCanal) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error, count } = await sb
        .from("crm_leads")
        .update({ canal_id: canal }, { count: "exact" })
        .eq("crm_connection_id", connId)
        .in("external_lead_id", ids.slice(i, i + 200));
      if (error) throw new Error(`update canal ${canal}: ${error.message}`);
      gravados += count ?? 0;
    }
  }
  console.log(`linhas atualizadas: ${gravados}`);
}
