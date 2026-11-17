import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types.js";
import deployment from "../vercel.json";
import clint from "../api/sync/clint.js";
import thumbnails from "../api/sync/backfill-thumbnails.js";
import instagram from "../api/sync/instagram.js";
import kommo from "../api/sync/kommo-leads.js";
import manual from "../api/sync/manual.js";
import ads from "../api/sync/meta-ads.js";
import comments from "../api/sync/meta-comments.js";
import graph from "../api/sync/meta-graph.js";
import wts from "../api/sync/wts.js";
import kommoWebhook from "../api/integrations/kommo/webhook.js";
import createAdmin from "../api/admin/create-admin.js";
import createUser from "../api/admin/create-user.js";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
const routes: Record<string, Handler> = {
  "/api/sync/clint": clint, "/api/sync/backfill-thumbnails": thumbnails,
  "/api/sync/instagram": instagram, "/api/sync/kommo-leads": kommo,
  "/api/sync/manual": manual, "/api/sync/meta-ads": ads,
  "/api/sync/meta-comments": comments, "/api/sync/meta-graph": graph,
  "/api/sync/wts": wts, "/api/integrations/kommo/webhook": kommoWebhook,
  "/api/admin/create-admin": createAdmin, "/api/admin/create-user": createUser,
};
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".mp4": "video/mp4", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
};
const MAX_BODY = 4_500_000;

function decorateResponse(response: ServerResponse): VercelResponse {
  const res = response as VercelResponse;
  res.status = function (code) { this.statusCode = code; return this; };
  res.json = function (body) {
    this.setHeader("Content-Type", "application/json; charset=utf-8");
    this.end(JSON.stringify(body)); return this;
  };
  res.send = function (body) {
    if (body !== null && typeof body === "object" && !Buffer.isBuffer(body)) return this.json(body);
    if (!this.hasHeader("Content-Type")) this.setHeader("Content-Type", Buffer.isBuffer(body) ? "application/octet-stream" : "text/html; charset=utf-8");
    this.end(body === undefined || body === null ? undefined : Buffer.isBuffer(body) ? body : String(body));
    return this;
  };
  res.redirect = function (code, url) { this.statusCode = code; this.setHeader("Location", url); this.end(); return this; };
  return res;
}

function parameters(search: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Corpo muito grande"), { status: 413 });
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type === "application/json" || type.endsWith("+json")) {
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); }
  }
  if (type === "application/x-www-form-urlencoded") return parameters(new URLSearchParams(raw));
  return raw;
}

export function createHubServer(options: { staticRoot?: string; handlers?: Record<string, Handler> } = {}) {
  const staticRoot = resolve(options.staticRoot ?? "dist");
  const handlers = options.handlers ?? routes;
  const server = createServer(async (incoming, response) => {
    const res = decorateResponse(response);
    for (const { key, value } of deployment.headers[0].headers) res.setHeader(key, value);
    try {
      const url = new URL(incoming.url ?? "/", "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path.includes("\0") || path.includes("\\") || path.split("/").some(p => p.startsWith("."))) {
        res.status(404).end(); return;
      }
      if (path === "/healthz") {
        res.setHeader("Cache-Control", "no-store"); res.json({ ok: true }); return;
      }
      if (path === "/readyz") {
        const ready = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SYNC_SECRET"].every(key => !!process.env[key]);
        res.setHeader("Cache-Control", "no-store"); res.status(ready ? 200 : 503).json({ ok: ready }); return;
      }
      const req = incoming as VercelRequest;
      req.query = parameters(url.searchParams);
      req.cookies = Object.create(null);
      for (const part of String(req.headers.cookie ?? "").split(";")) {
        const index = part.indexOf("=");
        if (index > 0) req.cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
      }
      // Preserve Vercel's explicit rewrites and the signed webhook's unconsumed bytes.
      if (path === "/api/atendimento/canais") { path = "/api/sync/manual"; req.query._central = "canais"; }
      if (path === "/api/atendimento/meta-webhook") { path = "/api/sync/manual"; req.query._central = "meta-webhook"; }
      if (/^\/r\/[^/]+$/.test(path)) { req.query.r = path.slice(3); path = "/api/sync/manual"; }
      const handler = Object.prototype.hasOwnProperty.call(handlers, path) ? handlers[path] : undefined;
      if (handler) {
        res.setHeader("Cache-Control", "private, no-store, max-age=0");
        if (req.query._central !== "meta-webhook") req.body = await body(req);
        await handler(req, res);
        if (!res.writableEnded) res.end();
        return;
      }
      if (path === "/api" || path.startsWith("/api/")) { res.status(404).json({ error: "Endpoint não encontrado" }); return; }
      if (incoming.method !== "GET" && incoming.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); res.status(405).end(); return; }
      let file = resolve(staticRoot, "." + path);
      if (file !== staticRoot && !file.startsWith(staticRoot + sep)) { res.status(404).end(); return; }
      let info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        if (path.startsWith("/assets/")) { res.status(404).end(); return; }
        file = resolve(staticRoot, "index.html"); info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) { res.status(503).end("Interface indisponível"); return; }
      res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
      res.setHeader("Content-Length", info.size);
      res.setHeader("Cache-Control", path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      if (incoming.method === "HEAD") { res.end(); return; }
      createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch (error) {
      const status = error instanceof URIError ? 400 : (error as { status?: number }).status ?? 500;
      if (!res.headersSent) res.status(status).json({ error: status === 413 ? "Corpo muito grande" : status === 400 ? "Pedido inválido" : "Não foi possível concluir a solicitação" });
      else res.destroy();
    }
  });
  server.requestTimeout = 310_000;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createHubServer();
  server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () => console.info("Hub HTTP pronto"));
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 310_000).unref();
    });
  }
}
