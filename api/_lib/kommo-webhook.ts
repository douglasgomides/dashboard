/**
 * Parsing dos webhooks nativos da Kommo — chegam como
 * application/x-www-form-urlencoded com notação de colchetes
 * (leads[add][0][id]=123, leads[status][0][status_id]=456...), não JSON.
 * Lemos o corpo bruto para decodificar a notação de colchetes sem depender
 * do parser de formulário oferecido pelo runtime HTTP.
 */

export class WebhookBodyError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

const MAX_BODY_BYTES = 1024 * 1024;

export async function readRawBody(req: AsyncIterable<string | Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new WebhookBodyError("Corpo do webhook muito grande", 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Decodifica "leads[add][0][id]=123&leads[add][0][name]=Fulano" em
// { leads: { add: { "0": { id: "123", name: "Fulano" } } } }.
export function parseBracketFormBody(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new WebhookBodyError("Corpo do webhook muito grande", 413);
  const root: Record<string, unknown> = {};
  const params = new URLSearchParams(raw);

  let fields = 0;
  for (const [rawKey, value] of params.entries()) {
    if (++fields > 10_000) throw new WebhookBodyError("Campos demais no webhook", 413);
    const match = rawKey.match(/^([^[\]]+)((?:\[[^\]]*\])*)$/);
    if (!match) continue;
    const [, firstKey, bracketPart] = match;
    const path = [firstKey, ...Array.from(bracketPart.matchAll(/\[([^\]]*)\]/g)).map((m) => m[1])];
    // A leitura de node[__proto__] em um objeto normal atravessa para Object.prototype.
    // Rejeita o caminho inteiro antes de criar qualquer nó.
    if (path.length > 20 || path.some((key) => ["__proto__", "prototype", "constructor"].includes(key))) {
      throw new WebhookBodyError("Campo inválido no webhook", 400);
    }

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
  if (!leads || typeof leads !== "object" || Array.isArray(leads)) return [];

  const events: KommoLeadEvent[] = [];
  for (const eventType of ["add", "status", "delete"] as const) {
    const group = leads[eventType] as Record<string, Record<string, unknown>> | undefined;
    if (!group || typeof group !== "object" || Array.isArray(group)) continue;
    for (const entry of Object.values(group)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const id = entry.id;
      if (!id) continue;
      events.push({
        externalLeadId: String(id),
        eventType,
        statusId: entry.status_id != null ? String(entry.status_id) : null,
        oldStatusId: entry.old_status_id != null ? String(entry.old_status_id) : null,
        pipelineId: entry.pipeline_id != null ? String(entry.pipeline_id) : null,
        price: entry.price != null && String(entry.price).trim() !== "" && Number.isFinite(Number(entry.price)) ? Number(entry.price) : null,
        raw: entry,
      });
    }
  }
  return events;
}
