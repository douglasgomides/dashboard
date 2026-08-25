/**
 * Parsing dos webhooks nativos da Kommo — chegam como
 * application/x-www-form-urlencoded com notação de colchetes
 * (leads[add][0][id]=123, leads[status][0][status_id]=456...), não JSON.
 * @vercel/node só faz parse automático de JSON, então lemos o corpo bruto e
 * decodificamos essa notação manualmente aqui.
 */
import type { IncomingMessage } from "http";

export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Decodifica "leads[add][0][id]=123&leads[add][0][name]=Fulano" em
// { leads: { add: { "0": { id: "123", name: "Fulano" } } } }.
export function parseBracketFormBody(raw: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const params = new URLSearchParams(raw);

  for (const [rawKey, value] of params.entries()) {
    const match = rawKey.match(/^([^[\]]+)((?:\[[^\]]*\])*)$/);
    if (!match) continue;
    const [, firstKey, bracketPart] = match;
    const path = [firstKey, ...Array.from(bracketPart.matchAll(/\[([^\]]*)\]/g)).map((m) => m[1])];

    let node: Record<string, unknown> = root;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[path[path.length - 1]] = value;
  }

  return root;
}

export interface KommoLeadEvent {
  externalLeadId: string;
  eventType: "add" | "status" | "delete";
  statusId: string | null;
  oldStatusId: string | null;
  pipelineId: string | null;
  price: number | null;
  raw: unknown;
}

export function extractLeadEvents(parsed: Record<string, unknown>): KommoLeadEvent[] {
  const leads = parsed.leads as Record<string, unknown> | undefined;
  if (!leads) return [];

  const events: KommoLeadEvent[] = [];
  for (const eventType of ["add", "status", "delete"] as const) {
    const group = leads[eventType] as Record<string, Record<string, unknown>> | undefined;
    if (!group) continue;
    for (const entry of Object.values(group)) {
      const id = entry.id;
      if (!id) continue;
      events.push({
        externalLeadId: String(id),
        eventType,
        statusId: entry.status_id != null ? String(entry.status_id) : null,
        oldStatusId: entry.old_status_id != null ? String(entry.old_status_id) : null,
        pipelineId: entry.pipeline_id != null ? String(entry.pipeline_id) : null,
        price: entry.price != null ? Number(entry.price) : null,
        raw: entry,
      });
    }
  }
  return events;
}
