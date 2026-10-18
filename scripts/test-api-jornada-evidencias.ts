import assert from "node:assert/strict";
import {
  registrarVinculosKommo,
  reconciliarJornada,
  type VinculoKommo,
} from "../api/_lib/jornada-evidencias.js";

const calls: { name: string; args: any }[] = [];
let error = false,
  conflito = false;
const db = {
  rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    return {
      data: { conflitos: conflito ? 1 : 0 },
      error: error ? { message: "Bearer SEGREDO_DO_FORNECEDOR" } : null,
    };
  },
} as any;
const v: VinculoKommo = {
  lead_id: "lead",
  conversa_id: "conversation",
  lead_externo_id: "external-lead",
  conversa_externo_id: "talk",
  metodo: "kommo_evento",
  referencia_externa: "message",
};
assert.equal(
  await registrarVinculosKommo(
    db,
    "client",
    Array.from({ length: 201 }, () => v),
  ),
  null,
);
assert.equal(calls.length, 2);
assert.equal(calls[0].args.p_vinculos.length, 200);
assert.equal(calls[1].args.p_vinculos.length, 1);
assert.ok(calls.every((c) => c.args.p_client === "client"));
conflito = true;
calls.length = 0;
assert.match(
  (await registrarVinculosKommo(
    db,
    "client",
    Array.from({ length: 201 }, () => v),
  ))!,
  /conflitante/,
);
assert.equal(calls.length, 2, "um conflito não pula o restante do lote");
error = true;
const failure = await reconciliarJornada(db, "client");
assert.match(failure!, /conferir/);
assert.doesNotMatch(failure!, /SEGREDO/);
assert.doesNotMatch(
  (await registrarVinculosKommo(db, "client", [v]))!,
  /SEGREDO/,
);
console.log(
  "test-api-jornada-evidencias: lotes, escopo, conflito e sanitização passaram",
);
