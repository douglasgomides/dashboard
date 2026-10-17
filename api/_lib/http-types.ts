import type { IncomingMessage, ServerResponse } from "node:http";

/** Contrato HTTP estrutural das funções, sem depender do builder da Vercel. */
export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  // O runtime desserializa JSON, form ou texto. Cada handler deve validar a entrada.
  body: any;
  cookies: Record<string, string>;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): this;
  json(body: unknown): this;
}
