/**
 * Completa o histórico de mudanças de etapa (crm_lead_eventos) de uma conexão Kommo
 * a partir dos eventos do próprio Kommo (GET /api/v4/events, tipo lead_status_changed).
 *
 * Por quê: o gatilho do banco só passou a gravar eventos em 15/10/2026 e grava a hora em que o sync
 * VIU a mudança, não a hora em que ela aconteceu. Sem isso, "Movimentos no CRM" mostra poucos
 * agendamentos (4 onde o Kommo tem 8, no caso da Lana). Aqui cada evento entra com a hora real.
 *
 * Uso (variáveis de ambiente, nada de segredo no código):
 *   SUPABASE_URL, SK (service role), KOMMO_TOKEN, KOMMO_DOMAIN (ex.: gtlabiscentral.kommo.com),
 *   CONN_ID, CLIENT_ID, DESDE (ISO), ATE (ISO, normalmente o início da gravação do gatilho),
 *   DRY=1 só conta e mostra por semana; FORCE=1 grava mesmo que já existam eventos no período.
 *
 * Tipos gravados, iguais aos do gatilho crm_registrar_evento: mudou_etapa, e ganhou / perdeu / reabriu
 * quando o resultado muda (142 = ganho, 143 = perdido no Kommo).
 */
import { createClient } from "@supabase/supabase-js";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`falta ${k}`);
  return v;
};
const url = need("SUPABASE_URL"), sk = need("SK"), kommoToken = need("KOMMO_TOKEN"), domain = need("KOMMO_DOMAIN");
const connId = need("CONN_ID"), clientId = need("CLIENT_ID");
const desde = Math.floor(new Date(need("DESDE")).getTime() / 1000);
const ate = Math.floor(new Date(need("ATE")).getTime() / 1000);
const dry = process.env.DRY === "1", force = process.env.FORCE === "1";
const sb = createClient(url, sk, { auth: { persistSession: false } });

const outcome = (id: number) => (id === 142 ? "won" : id === 143 ? "lost" : "open");

async function pagina(page: number) {
  const qs = new URLSearchParams({
    "filter[type][]": "lead_status_changed",
    "filter[created_at][from]": String(desde),
    "filter[created_at][to]": String(ate),
    limit: "100",
    page: String(page),
  });
  const res = await fetch(`https://${domain}/api/v4/events?${qs}`, { headers: { Authorization: `Bearer ${kommoToken}`, Accept: "application/json" } });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Kommo events ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json())._embedded?.events ?? []) as any[];
}

const eventos: any[] = [];
for (let page = 1; page <= 400; page++) {
  const ev = await pagina(page);
  eventos.push(...ev);
  if (ev.length < 100) break;
  await new Promise((r) => setTimeout(r, 200));
}
console.log("eventos lidos do Kommo:", eventos.length);

const linhas: any[] = [];
for (const e of eventos) {
  const antes = e.value_before?.[0]?.lead_status, depois = e.value_after?.[0]?.lead_status;
  if (!depois) continue;
  const quando = new Date(e.created_at * 1000).toISOString();
  const base = { client_id: clientId, crm_connection_id: connId, external_lead_id: String(e.entity_id), ocorreu_em: quando, registrado_em: quando };
  linhas.push({ ...base, tipo: "mudou_etapa", pipeline_de: antes ? String(antes.pipeline_id) : null, status_de: antes ? String(antes.id) : null, pipeline_para: String(depois.pipeline_id), status_para: String(depois.id) });
  const o0 = antes ? outcome(antes.id) : "open", o1 = outcome(depois.id);
  if (o0 !== o1) {
    linhas.push({ ...base, tipo: o1 === "won" ? "ganhou" : o1 === "lost" ? "perdeu" : "reabriu", pipeline_para: String(depois.pipeline_id), status_para: String(depois.id) });
  }
}
console.log("linhas a gravar:", linhas.length, "| mudou_etapa:", linhas.filter((l) => l.tipo === "mudou_etapa").length);

// Para o número da semana: quantas foram para uma etapa de consulta agendada (nome da etapa vem do cadastro de etapas).
const { data: etapas } = await sb.from("crm_pipeline_statuses").select("pipeline_id,status_id,status_name").eq("crm_connection_id", connId);
const consulta = new Set((etapas ?? []).filter((x: any) => /Consulta Agendada/i.test(x.status_name)).map((x: any) => `${x.pipeline_id}:${x.status_id}`));
const porSemana = new Map<string, Set<string>>();
for (const l of linhas.filter((x) => x.tipo === "mudou_etapa" && consulta.has(`${x.pipeline_para}:${x.status_para}`))) {
  const d = new Date(new Date(l.ocorreu_em).getTime() - 3 * 3600_000);
  const seg = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400_000).toISOString().slice(0, 10);
  if (!porSemana.has(seg)) porSemana.set(seg, new Set());
  porSemana.get(seg)!.add(l.external_lead_id);
}
console.log("leads distintos que foram para consulta agendada, por semana:", Object.fromEntries([...porSemana].sort().map(([k, v]) => [k, v.size])));

if (dry) { console.log("DRY=1: nada foi gravado"); process.exit(0); }

const { count } = await sb.from("crm_lead_eventos").select("id", { count: "exact", head: true }).eq("crm_connection_id", connId).neq("tipo", "entrou").lt("ocorreu_em", new Date(ate * 1000).toISOString()).gte("ocorreu_em", new Date(desde * 1000).toISOString());
if ((count ?? 0) > 0 && !force) throw new Error(`já existem ${count} eventos nesse período; use FORCE=1 se quiser gravar mesmo assim (pode duplicar)`);

let gravadas = 0;
for (let i = 0; i < linhas.length; i += 500) {
  const { error } = await sb.from("crm_lead_eventos").insert(linhas.slice(i, i + 500));
  if (error) throw new Error(`gravação: ${error.message}`);
  gravadas += Math.min(500, linhas.length - i);
}
console.log("gravadas:", gravadas);
