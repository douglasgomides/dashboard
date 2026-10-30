import assert from "node:assert/strict";
import { leads } from "../api/_lib/meta-ads-graph-sync";
import { conversationSummarySchema, normalizarResumoConversa } from "../api/_lib/ai-output";

// Leads da Graph: "lead" já soma formulário + pixel; o pixel sozinho só conta quando falta o "lead".
assert.equal(leads([{ action_type: "lead", value: "4" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "4" }]), 4);
assert.equal(leads([{ action_type: "offsite_conversion.fb_pixel_lead", value: "3" }]), 3);
assert.equal(leads([{ action_type: "link_click", value: "9" }]), 0);
assert.equal(leads(undefined), 0);

// Resumo da IA: desvios de forma são arrumados, conteúdo que falta continua reprovando.
const base = {
  motivo: "Preço de consulta", resumo: "Paciente perguntou o preço.", comercial: false, interesse: null,
  origem: "desconhecida", etapa: "engajou", preco_pedido: true, preco_apresentado: false,
  objecoes: ["preco", "caro"], falhas: ["demora", "demora", "outra"], situacao: "outro", recuperavel: true,
  atendente: null, atendimento: { nota: "regular", nota_0a10: "12", pontos_fortes: null, pontos_a_melhorar: ["x"] },
  evidencia: null, como_deveria: null, proximo_passo: "Responder", alerta: null,
};
const ok = conversationSummarySchema.safeParse(normalizarResumoConversa(base));
assert.equal(ok.success, true);
if (ok.success) {
  assert.deepEqual(ok.data.objecoes, ["preco"]);
  assert.deepEqual(ok.data.falhas, ["demora"]);
  assert.equal(ok.data.recuperavel, false);
  assert.equal(ok.data.proximo_passo, null);
  assert.equal(ok.data.atendimento.nota_0a10, 10);
}
const semResumo = { ...base, resumo: undefined };
assert.equal(conversationSummarySchema.safeParse(normalizarResumoConversa(semResumo)).success, false);
assert.equal(conversationSummarySchema.safeParse(normalizarResumoConversa({ ...base, etapa: "inventada" })).success, false);
console.log("test-auditoria-lote1: ok");
