import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHubServer } from "../server/vps.js";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types.js";

const root = await mkdtemp(join(tmpdir(), "hub-vps-http-"));
await mkdir(join(root, "assets"));
await writeFile(join(root, "index.html"), "<html>HUB_TEST</html>");
await writeFile(join(root, "assets/app.js"), "console.log('HUB_TEST')");
await writeFile(join(root, ".env"), "NEVER_SERVE_THIS");
const inspect = async (req: VercelRequest, res: VercelResponse) => {
  if (req.query._central === "meta-webhook") {
    let raw = ""; for await (const part of req) raw += part;
    res.json({ raw, signature: req.headers["x-hub-signature-256"] }); return;
  }
  res.json({ query: req.query, body: req.body, cookie: req.cookies.session });
};
const server = createHubServer({ staticRoot: root, handlers: { "/api/sync/manual": inspect } });
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); assert(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
try {
  let response = await fetch(base + "/login");
  assert.equal(response.status, 200); assert.match(await response.text(), /HUB_TEST/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cache-control"), "no-cache");
  response = await fetch(base + "/assets/app.js");
  assert.match(response.headers.get("content-type") ?? "", /javascript/);
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  for (const path of ["/api/missing", "/api/__proto__", "/assets/missing.js", "/.env", "/%2eenv", "/%5c.env"]) {
    response = await fetch(base + path); assert.equal(response.status, 404, path);
    assert(!String(await response.text()).includes("NEVER_SERVE_THIS"));
  }
  response = await fetch(base + "/api/sync/manual?x=1&x=2", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "session=a%20b" }, body: '{"alvo":"crm"}' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { query: { x: ["1", "2"] }, body: { alvo: "crm" }, cookie: "a b" });
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  response = await fetch(base + "/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
  response = await fetch(base + "/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "leads%5Badd%5D%5B0%5D%5Bid%5D=123" });
  assert.deepEqual((await response.json()).body, { "leads[add][0][id]": "123" });
  const raw = '{ "object": "instagram", "entry": [] }';
  response = await fetch(base + "/api/atendimento/meta-webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=test" }, body: raw });
  assert.deepEqual(await response.json(), { raw, signature: "sha256=test" });
  response = await fetch(base + "/api/atendimento/canais?_central=ignored");
  assert.equal((await response.json()).query._central, "canais");
  response = await fetch(base + "/r/campanha?utm_source=instagram");
  assert.deepEqual((await response.json()).query, { utm_source: "instagram", r: "campanha" });
  response = await fetch(base + "/healthz"); assert.deepEqual(await response.json(), { ok: true });
  response = await fetch(base + "/login", { method: "HEAD" }); assert.equal(response.status, 200); assert.equal(await response.text(), "");
  console.info("VPS_HTTP_OK: SPA, assets, private paths, bodies, cookies, rewrites and signed webhook stream");
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
