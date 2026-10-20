import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "./http-types.js";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
/** Correlação de suporte sem registrar payload, tokens, contatos ou mensagens. */
export function withApiObservability(handler: Handler, endpoint: string, log: (record: string) => void = console.info): Handler {
  return async (req, res) => {
    const requestId = randomUUID(), start = Date.now();
    const originalStatus = res.status, originalJson = res.json;
    let status = 200, failed = false;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.status = function (value) { status = value; return originalStatus.call(this, value); };
    res.json = function (body) {
      if (body && typeof body === "object" && (body as { ok?: unknown }).ok === false) failed = true;
      return originalJson.call(this, body);
    };
    try {
      await handler(req, res);
    } catch {
      failed = true;
      if (!res.headersSent) res.status(503).json({ error: `Não foi possível concluir a solicitação. Referência: ${requestId}` });
      else if (!res.writableEnded) res.end();
    } finally {
      res.status = originalStatus; res.json = originalJson;
      const actualStatus = res.statusCode >= 100 ? res.statusCode : status;
      log(JSON.stringify({ event: "api.completed", endpoint, request_id: requestId, status: actualStatus, ok: !failed && actualStatus < 400, duration_ms: Date.now() - start }));
    }
  };
}
