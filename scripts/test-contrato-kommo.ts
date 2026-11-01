// Contrato da API v4 da Kommo (e do corpo do webhook). Doc: docs/apis/kommo.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_KOMMO_DOMINIO=<conta ou conta.kommo.com> CONTRATO_KOMMO_TOKEN=... npx tsx scripts/test-contrato-kommo.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { etapasDosFunis, linhaDoLead, type KommoLead } from "../api/_lib/kommo-leads-sync";
import { eventoParaMensagem, canalKommo } from "../api/_lib/conversas-kommo";
import { extractLeadEvents, parseBracketFormBody } from "../api/_lib/kommo-webhook";
import { integrationHost } from "../api/_lib/integration-http";

const HOSTS = /^[a-z0-9-]+\.(kommo\.com|amocrm\.(com|ru))$/;
function pedido(env: NodeJS.ProcessEnv, caminho: string) {
  if (!env.CONTRATO_KOMMO_DOMINIO || !env.CONTRATO_KOMMO_TOKEN) return null;
  let host: string;
  try { host = integrationHost(env.CONTRATO_KOMMO_DOMINIO, "kommo"); } catch { return "domínio Kommo inválido"; }
  return { url: `https://${host}${caminho}`, headers: { Authorization: `Bearer ${env.CONTRATO_KOMMO_TOKEN}`, Accept: "application/json" } };
}
const desde = () => Math.floor(Date.now() / 1000) - 3 * 86400;

await rodarContrato({
  api: "kommo",
  variaveis: ["CONTRATO_KOMMO_DOMINIO", "CONTRATO_KOMMO_TOKEN"],
  endpoints: [
    {
      nome: "leads",
      hosts: HOSTS,
      campos: campos([
        "_embedded.leads: array",
        "_embedded.leads[].id: number",
        "_embedded.leads[].status_id: number",
        "_embedded.leads[].pipeline_id: number",
        "_embedded.leads[].price: number|null",
        "_embedded.leads[].created_at: number",
        "_embedded.leads[].updated_at: number",
        "_embedded.leads[].name?: string|null",
        "_embedded.leads[].source_id?: number|null",
        "_embedded.leads[].custom_fields_values?: array|null",
        "_embedded.leads[].custom_fields_values[].field_name: string",
        "_embedded.leads[].custom_fields_values[].values: array",
        "_embedded.leads[]._embedded.contacts?: array",
        "_embedded.leads[]._embedded.contacts[].id: number",
        "_links?: object",
      ]),
      aoVivo: (env) => pedido(env, `/api/v4/leads?limit=5&page=1&with=source_id,contacts&filter[updated_at][from]=${desde()}`),
    },
    {
      nome: "funis",
      hosts: HOSTS,
      campos: campos([
        "_embedded.pipelines: array",
        "_embedded.pipelines[].id: number",
        "_embedded.pipelines[].name: string",
        "_embedded.pipelines[]._embedded.statuses: array",
        "_embedded.pipelines[]._embedded.statuses[].id: number",
        "_embedded.pipelines[]._embedded.statuses[].name: string",
        "_embedded.pipelines[]._embedded.statuses[].type: number",
      ]),
      avisos: (corpo) => {
        const ids = new Set<number>();
        for (const p of (corpo as any)?._embedded?.pipelines ?? []) for (const s of p?._embedded?.statuses ?? []) ids.add(Number(s?.id));
        return ids.size && !(ids.has(142) && ids.has(143)) ? ["etapas 142 (ganho) e 143 (perdido) não apareceram: o código depende delas"] : [];
      },
      aoVivo: (env) => pedido(env, "/api/v4/leads/pipelines"),
    },
    {
      nome: "motivos_perda",
      hosts: HOSTS,
      campos: campos(["_embedded.loss_reasons[].id: number", "_embedded.loss_reasons[].name: string"]),
      aoVivo: (env) => pedido(env, "/api/v4/leads/loss_reasons?limit=5"),
    },
    {
      nome: "contatos",
      hosts: HOSTS,
      campos: campos([
        "_embedded.contacts: array",
        "_embedded.contacts[].id: number",
        "_embedded.contacts[].custom_fields_values?: array|null",
        "_embedded.contacts[].custom_fields_values[].field_code?: string|null",
        "_embedded.contacts[].custom_fields_values[].values: array",
      ]),
      aoVivo: (env, ant) => {
        const ids = ((ant.leads as any)?._embedded?.leads ?? []).flatMap((l: any) => (l?._embedded?.contacts ?? []).map((c: any) => c?.id)).filter((x: unknown) => Number.isSafeInteger(x)).slice(0, 5);
        if (!ids.length) return env.CONTRATO_KOMMO_TOKEN ? "sem contato de exemplo nos leads" : null;
        return pedido(env, `/api/v4/contacts?${ids.map((id: number) => `filter[id][]=${id}`).join("&")}`);
      },
    },
    {
      nome: "eventos",
      hosts: HOSTS,
      campos: campos([
        "_embedded.events: array",
        "_embedded.events[].type: string",
        "_embedded.events[].entity_id: number",
        "_embedded.events[].entity_type: string",
        "_embedded.events[].created_at: number",
        "_embedded.events[].created_by?: number",
        "_embedded.events[].value_after: array",
        "_embedded.events[].value_after[].message.id: string",
        "_embedded.events[].value_after[].message.talk_id: number",
        "_embedded.events[].value_after[].message.origin?: string",
      ]),
      aoVivo: (env) => pedido(env, `/api/v4/events?limit=5&page=1&filter[type]=incoming_chat_message&filter[created_at][from]=${desde()}`),
    },
    {
      // Webhook (x-www-form-urlencoded com colchetes): não há GET; só a leitura offline.
      nome: "webhook_bruto",
      transformar: (corpo) => parseBracketFormBody(String(corpo)),
      campos: campos(["leads: object", "leads.status.0.id: string", "leads.status.0.status_id: string", "leads.status.0.pipeline_id: string", "leads.delete.0.id: string"]),
    },
  ],
  normalizadores: (f: any) => {
    const [ganho, aberto] = f.leads._embedded.leads as KommoLead[];
    const l = linhaDoLead(ganho, "conn", "cli");
    assert.equal(l.outcome, "won", "142 = ganho");
    assert.equal(l.source, "Instagram", "campo Fonte do Lead");
    assert.equal(l.canal_id, "300001");
    assert.equal(l.occurred_at, new Date(1760000000 * 1000).toISOString(), "created_at em segundos Unix");
    const l2 = linhaDoLead(aberto, "conn", "cli");
    assert.equal(l2.outcome, "open");
    assert.equal(l2.source, null);
    assert.equal(etapasDosFunis(f.funis, "conn").length, 4);
    const msgs = f.eventos._embedded.events.map(eventoParaMensagem);
    assert.deepEqual(msgs.map((m: any) => m?.direcao), ["entrada", "saida"]);
    assert.equal(msgs[0]?.talkId, "1001");
    assert.equal(canalKommo(msgs[0]?.origem ?? null), "whatsapp");
    const ev = extractLeadEvents(parseBracketFormBody(f.webhook_bruto));
    assert.deepEqual(ev.map((e) => [e.eventType, e.externalLeadId, e.statusId]), [["status", "9000001", "142"], ["delete", "9000002", null]]);
    assert.equal(ev[0].price, 1200);
  },
});
