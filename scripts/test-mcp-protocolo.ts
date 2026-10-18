import assert from "node:assert/strict";
import { FERRAMENTAS, validarArgumentos, periodo, claims, resposta, erro } from "../supabase/functions/mcp/protocolo";

const id = "8d4b3b3f-74a7-419a-a113-35ebc02cb37f";
// Só leitura: nenhuma ferramenta de escrita no MVP.
assert.ok(FERRAMENTAS.every((f) => /^(listar|get|list)_/.test(f.name)));
assert.equal(validarArgumentos("listar_clinicas", {}), null);
assert.match(validarArgumentos("apagar_tudo", {})!, /desconhecida/);
assert.match(validarArgumentos("get_instagram_overview", {})!, /obrigatório: clinica_id/);
assert.match(validarArgumentos("get_instagram_overview", { clinica_id: "1 or 1=1" })!, /inválido/);
assert.match(validarArgumentos("get_instagram_overview", { clinica_id: id, extra: 1 })!, /não aceito/);
assert.match(validarArgumentos("get_instagram_overview", { clinica_id: id, de: "ontem" })!, /data/);
assert.match(validarArgumentos("get_instagram_overview", { clinica_id: id, de: "2026-10-10", ate: "2026-10-01" })!, /anterior/);
assert.match(validarArgumentos("list_top_performing_content", { clinica_id: id, limite: 50 })!, /limite/);
assert.equal(validarArgumentos("list_top_performing_content", { clinica_id: id, limite: 3, de: "2026-09-01", ate: "2026-09-30" }), null);
assert.match(validarArgumentos("get_brand_brain_summary", { clinica_id: id, de: "2026-09-01" })!, /não aceito/);

const p = periodo({}, new Date("2026-10-18T15:00:00Z"));
assert.deepEqual(p, { ate: "2026-10-18", de: "2026-09-18" });
assert.deepEqual(periodo({ de: "2026-01-01", ate: "2026-01-31" }), { de: "2026-01-01", ate: "2026-01-31" });

const payload = Buffer.from(JSON.stringify({ sub: "u", client_id: "abc" })).toString("base64url");
assert.equal(claims(`x.${payload}.y`)!.client_id, "abc");
assert.equal(claims("lixo"), null);
assert.deepEqual(resposta(1, { ok: true }), { jsonrpc: "2.0", id: 1, result: { ok: true } });
assert.equal(erro(undefined, -32601, "x").id, null);
console.log("ok mcp-protocolo");
