import assert from "node:assert/strict";
import { adaptationBrief, creativeAdaptationId, creativeEntrySchema } from "../src/lib/creative-intelligence/editorial";
import { roteiroCompleto } from "../src/lib/pauta";
import { adaptationSchema } from "../src/lib/creative-intelligence/contracts";
const id = "55555555-5555-4555-8555-555555555555";
const document = adaptationSchema.parse({
  title: "Título", theme: "Sono", format: "carrossel", objective: "salvamento", hook: "Gancho", caption: "Legenda integral", cta: "Chamada", preserved_principles: [], justified_changes: [], brain_keys: [], medical_review_flags: ["Revisar"], clinical_claims_requiring_verification: ["Conferir"],
  units: ["Capa existente", "Última orientação"].map((copy, i) => ({ position: i + 1, original_position: i + 1, start: null, end: null, copy, narrative_role: "Explicação", image_brief: "Imagem", layout_brief: "Layout", recording_brief: "", editing_brief: "", on_screen_text: "", structural_reference: "Sequência", justified_changes: [] })),
});
const pauta = { titulo: "Título", formato: "carrossel" as const, objetivo: "salvamento" as const, gancho: "Gancho", roteiro: document.units.map(u => u.copy), cta: "Chamada", aviso: "Revisar", motivo: null, ideia_id: `creative:${id}` };
const text = roteiroCompleto(pauta, document);
assert.equal(text, adaptationBrief({ document }));
assert.equal((text.match(/Slide /g) || []).length, 2);
assert.ok(text.includes(document.caption));
assert.ok(text.includes("Layout: Layout"));
assert.ok(!text.includes("Card 3"));
const legacy = roteiroCompleto(pauta);
assert.ok(legacy.includes(document.units[1].copy));
assert.ok(!legacy.includes("Último card:"));
assert.equal(creativeAdaptationId(pauta.ideia_id), id);
assert.equal(creativeAdaptationId("creative:../../secret"), undefined);
assert.equal(creativeAdaptationId("agente:abc"), undefined);
const invalid = creativeEntrySchema.parse({ aba: "bad", conta: "bad", adaptacao: "bad" });
assert.ok(!invalid.aba && !invalid.conta && !invalid.adaptacao);
console.log("Documentos integrais, links válidos e sequência do planejador preservados.");
