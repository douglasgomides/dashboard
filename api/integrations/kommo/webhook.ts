import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/integrations/supabase/types.js";
import { readRawBody, parseBracketFormBody, extractLeadEvents } from "../../_lib/kommo-webhook.js";

// Recebe os webhooks nativos da Kommo (lead adicionado/status mudou/
// excluído). A URL é única por conexão (connection_id + secret gerados no
// painel admin) — a Kommo não assina os webhooks, então essa é a única
// proteção do endpoint. Precisa responder em até 2s com status 100–299 pra
// não disparar retry (a Kommo tenta de novo até 4x numa janela de 1h).

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).end();
    return;
  }

  const connectionId = typeof req.query.connection_id === "string" ? req.query.connection_id : null;
  const secret = typeof req.query.secret === "string" ? req.query.secret : null;
  if (!connectionId || !secret) {
    res.status(404).end();
    return;
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: connection } = await supabase
    .from("crm_connections")
    .select("id, client_id, provider, webhook_secret, active")
    .eq("id", connectionId)
    .maybeSingle();

  if (!connection || connection.webhook_secret !== secret || !connection.active) {
    res.status(404).end();
    return;
  }

  const raw = await readRawBody(req);
  const parsed = parseBracketFormBody(raw);
  const events = extractLeadEvents(parsed);

  for (const event of events) {
    const { error } = await supabase.from("crm_leads").insert({
      crm_connection_id: connection.id,
      client_id: connection.client_id,
      provider: connection.provider,
      external_lead_id: event.externalLeadId,
      event_type: event.eventType,
      status_id: event.statusId,
      old_status_id: event.oldStatusId,
      pipeline_id: event.pipelineId,
      price: event.price,
      raw_payload: event.raw as any,
    });
    if (error) console.error(`[kommo webhook] ${connection.client_id}/${event.externalLeadId}:`, error.message);
  }

  // Qualquer chave de topo além de "leads" (ex: "chat" — mensagem recebida)
  // ainda não tem parser dedicado — a documentação pública da Kommo não
  // detalha essa estrutura. Guarda bruto por enquanto pra inspecionar dado
  // real antes de escrever o parser definitivo.
  const otherKeys = Object.keys(parsed).filter((k) => k !== "leads");
  for (const key of otherKeys) {
    const { error } = await supabase.from("crm_raw_events").insert({
      crm_connection_id: connection.id,
      client_id: connection.client_id,
      event_key: key,
      raw_payload: parsed[key] as any,
    });
    if (error) console.error(`[kommo webhook] raw ${connection.client_id}/${key}:`, error.message);
  }

  res.status(200).json({ received: events.length, rawEvents: otherKeys.length });
}
