import assert from "node:assert/strict";
import { marcarSubstituidos } from "../api/_lib/flwchat-sync";

const AGORA = "2026-10-27T12:00:00.000Z";
const card = (id: string, number: number, outcome: string, opts: { contato?: string; proc?: string; dia?: string; price?: number | null; painel?: string } = {}) => ({
  external_lead_id: id,
  pipeline_id: opts.painel ?? "orc",
  outcome,
  price: opts.price ?? null,
  occurred_at: `${opts.dia ?? "2026-09-01"}T10:00:00Z`,
  raw_payload: {
    id, number, contactIds: [opts.contato ?? "c1"],
    custom_fields_values: [{ field_name: "Tipo de Procedimento", values: [{ value: opts.proc ?? "CALORIMETRIA" }] }],
  },
});
const por = <L extends { external_lead_id: string }>(linhas: L[], id: string): L => linhas.find((l) => l.external_lead_id === id)!;

// Pendente → Orçado → Liberado do mesmo item: só o Liberado conta.
const fluxo = marcarSubstituidos([card("a", 10, "open"), card("b", 11, "open"), card("c", 12, "won", { price: 450 })], AGORA);
assert.equal(por(fluxo, "a").removido_na_origem, AGORA);
assert.equal(por(fluxo, "a").raw_payload.substituido_por, "b");
assert.equal(por(fluxo, "b").raw_payload.substituido_por, "c");
assert.equal(por(fluxo, "c").removido_na_origem, null, "o card mais novo continua valendo");

// Recompra: dois Liberados do mesmo item em dias diferentes são duas compras.
const recompra = marcarSubstituidos([card("a", 1, "won", { price: 700 }), card("b", 2, "won", { price: 700, dia: "2026-10-01" })], AGORA);
assert.ok(recompra.every((l) => l.removido_na_origem === null));

// Liberado copiado no mesmo dia e mesmo valor: o segundo é cópia.
const copia = marcarSubstituidos([card("a", 1, "won", { price: 700 }), card("b", 2, "won", { price: 700 })], AGORA);
assert.equal(por(copia, "b").removido_na_origem, AGORA);
assert.equal(por(copia, "a").removido_na_origem, null);

// Outro paciente, outro procedimento ou outro painel: nada se mistura.
const separados = marcarSubstituidos([
  card("a", 1, "open"), card("b", 2, "won", { contato: "c2" }), card("c", 3, "won", { proc: "TESTE MICROBIOTA" }), card("d", 4, "won", { painel: "novo" }),
], AGORA);
assert.ok(separados.every((l) => l.removido_na_origem === null));

// Orçado sem card mais novo continua em aberto; card sem procedimento não entra na regra.
const semProc = { ...card("x", 5, "open"), raw_payload: { id: "x", number: 5, contactIds: ["c1"], custom_fields_values: [] } };
const soltos = marcarSubstituidos([card("a", 1, "open"), semProc], AGORA);
assert.ok(soltos.every((l) => l.removido_na_origem === null));

// Um card que deixou de ser substituído volta a valer na sync seguinte (a marcação é refeita).
assert.equal(marcarSubstituidos([card("a", 1, "open")], AGORA)[0].removido_na_origem, null);
console.log("flwchat substituidos ok");
