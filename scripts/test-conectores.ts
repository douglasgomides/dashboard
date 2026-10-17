import assert from "node:assert/strict";
import { CONECTORES, estadoDoCliente } from "../src/lib/conectores";

const agora = new Date("2026-10-17T12:00:00Z").getTime();
const h = (horas: number) => new Date(agora - horas * 3_600_000).toISOString();

assert.equal(estadoDoCliente(false, { last_attempt_at: h(1), last_success_at: h(1), last_error: null }, agora), "nao_conectado");
assert.equal(estadoDoCliente(true, null, agora), "sem_registro");
assert.equal(estadoDoCliente(true, { last_attempt_at: h(1), last_success_at: h(1), last_error: null }, agora), "conectado");
assert.equal(estadoDoCliente(true, { last_attempt_at: h(100), last_success_at: h(100), last_error: null }, agora), "atrasado");
// Erro na última tentativa (depois do último sucesso) = erro; erro antigo seguido de sucesso = conectado.
assert.equal(estadoDoCliente(true, { last_attempt_at: h(1), last_success_at: h(30), last_error: "401" }, agora), "erro");
assert.equal(estadoDoCliente(true, { last_attempt_at: h(30), last_success_at: h(1), last_error: "401" }, agora), "conectado");
assert.equal(estadoDoCliente(true, { last_attempt_at: h(1), last_success_at: null, last_error: null }, agora), "sem_registro");

// Catálogo: ids únicos; planejados não têm fonte de sincronização (não fingem estado).
assert.equal(new Set(CONECTORES.map((c) => c.id)).size, CONECTORES.length);
for (const c of CONECTORES.filter((x) => x.estado === "planejado")) assert.equal(c.fonte, null, c.id);
assert.ok(["google_ads", "whatsapp_business", "feegow", "clinica_nas_nuvens", "google_sheets"].every((id) => CONECTORES.find((c) => c.id === id)?.estado === "planejado"));

console.log("ok conectores");
