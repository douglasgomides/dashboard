import assert from "node:assert/strict";
import { leads } from "../api/_lib/meta-ads-graph-sync";
import { conversationSummarySchema, normalizarResumoConversa } from "../api/_lib/ai-output";
import { aplicarCompraAprovada, aplicarReembolso } from "../api/_lib/clint-sync";

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
// Categoria escrita de outro jeito é padronizada; origem fora da lista vira "desconhecida", nunca um chute.
const escrita = conversationSummarySchema.safeParse(normalizarResumoConversa({ ...base, origem: "Paciente antigo", etapa: "Preço apresentado " }));
assert.equal(escrita.success, true);
if (escrita.success) { assert.equal(escrita.data.origem, "paciente_antigo"); assert.equal(escrita.data.etapa, "preco_apresentado"); }
const origemNova = conversationSummarySchema.safeParse(normalizarResumoConversa({ ...base, origem: "google" }));
assert.equal(origemNova.success && origemNova.data.origem, "desconhecida");
// Funil de compra aprovada: vira venda, menos a que repete um ganho do mesmo contato em até 3 dias; perda fica perda.
const linhas: Record<string, any>[] = [
  { pipeline_id: "fechado", outcome: "won", occurred_at: "2026-10-10T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "aprov", outcome: "open", occurred_at: "2026-10-11T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "aprov", outcome: "open", occurred_at: "2026-10-20T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "aprov", outcome: "open", occurred_at: "2026-10-11T10:00:00Z", raw_payload: { contact: { id: "c2" } } },
  { pipeline_id: "aprov", outcome: "lost", occurred_at: "2026-10-11T10:00:00Z", raw_payload: { contact: { id: "c3" } } },
];
aplicarCompraAprovada(linhas, ["aprov"]);
assert.deepEqual(linhas.map((l) => l.outcome), ["won", "open", "won", "won", "lost"]);
assert.equal(linhas[1].raw_payload.compra_repetida, true);
// Reembolso desfaz o ganho mais recente do mesmo contato em até 30 dias.
const comReembolso: Record<string, any>[] = [
  { pipeline_id: "venda", outcome: "won", occurred_at: "2026-10-01T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "venda", outcome: "won", occurred_at: "2026-08-01T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "reemb", outcome: "lost", occurred_at: "2026-10-05T10:00:00Z", raw_payload: { contact: { id: "c1" } } },
  { pipeline_id: "venda", outcome: "won", occurred_at: "2026-10-01T10:00:00Z", raw_payload: { contact: { id: "c2" } } },
];
aplicarReembolso(comReembolso, ["reemb"]);
assert.deepEqual(comReembolso.map((l) => l.outcome), ["lost", "won", "lost", "won"]);
console.log("test-auditoria-lote1: ok");
