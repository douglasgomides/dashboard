import assert from "node:assert/strict";
import { getDiagnosticoComercial, getAcompanhamentos, salvarAcompanhamento } from "../src/lib/client-data";
import { createDeployRecovery } from "../src/lib/deploy-recovery";

const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const CID = "11111111-1111-4111-8111-111111111111";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
let fail = "fontes", reducedCalls = 0;
try {
  process.env.SUPABASE_URL = "https://audit.offline.invalid";
  process.env.SUPABASE_PUBLISHABLE_KEY = "fake-public-test-key";
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    assert.equal(u.origin, "https://audit.offline.invalid");
    if (u.pathname.endsWith("/client_fontes")) return fail === "fontes" ? json({ code: "XX000", message: "failed source" }, 500) : json([{ tem_atendimento: true }]);
    if (u.pathname.endsWith("/wts_resumo")) return fail === "wts" ? json({ code: "XX000", message: "failed attendance" }, 500) : json([]);
    if (u.pathname.endsWith("/crm_diagnostico_comercial")) return json({ code: "XX000", message: "failed diagnosis" }, 500);
    if (u.pathname.endsWith("/acoes_acompanhamento")) return json({ code: fail === "missing-table" ? "PGRST205" : "42501", message: "permission denied for table acoes_acompanhamento" }, 400);
    reducedCalls++; throw new Error(`Unexpected reduced source ${u.pathname}`);
  };
  for (fail of ["fontes", "wts", "diagnostico"]) {
    await assert.rejects(() => getDiagnosticoComercial(CID, "2026-10-01", "2026-10-20"));
  }
  assert.equal(reducedCalls, 0, "failure is not converted to empty/reduced commercial data");
  fail = "permissions";
  await assert.rejects(() => getAcompanhamentos(CID), (e: any) => e.code === "42501");
  const action: any = { clientId: CID, insightId: "fixture", titulo: "Fictício", status: "nova", historico: [], checklist: [] };
  await assert.rejects(() => salvarAcompanhamento(action), (e: any) => e.code === "42501", "permission failure never falls back to a local save");
  fail = "missing-table";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "[]", setItem: () => { throw new Error("quota"); } } });
  await assert.rejects(() => salvarAcompanhamento(action), /não foi salva/);

  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const first = createDeployRecovery(storage, () => 120_000);
  assert.equal(first(), true); assert.equal(first(), false);
  assert.equal(createDeployRecovery(storage, () => 120_001)(), false, "the guard survives reloads");
  assert.equal(createDeployRecovery({ getItem() { throw new Error("blocked"); }, setItem() {} })(), false, "blocked storage cannot start a reload loop");
  console.log("Client reliability: source failures propagate, denied saves fail closed, quota failure is visible and deployment recovery is bounded.");
} finally {
  globalThis.fetch = originalFetch;
  if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor); else Reflect.deleteProperty(globalThis, "localStorage");
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
}
