import assert from "node:assert/strict";
import { adaptStructure } from "../workers/creative/intelligence";
import { CreativeError, type JobContext } from "../workers/creative/runtime";
import type { CreativeAnalysis, CreativeStructure } from "../src/lib/creative-intelligence/contracts";
import fixture from "../tests/e2e/creative-fixture.json";

const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "fictional-key-no-network";
const original = "Organize suas ideias com calma";
const analysis = { ...fixture.analysis, result: { ...fixture.analysis.result, slides: [{ position: 1, copy: { full_text: original } }], original_theme: "Organização de ideias" } } as unknown as CreativeAnalysis;
const structure = fixture.structure as unknown as CreativeStructure;
const base = { ...fixture.adaptation.document, caption: "Legenda fictícia de teste", cta: "Salve este exemplo fictício", units: [{ ...fixture.adaptation.document.units[0] }] };
let mode: "repair" | "fail" | "accept" | "semantic_fail" | "invalid_refs" = "repair", calls = 0, settlements = 0, reservations = 0;
let approved = false;
function context() {
  const checkpoints = new Map<string, unknown>();
  const admin = { from(table: string) {
    let phase = "";
    const q = {
      select() { return q; }, eq(key: string, value: string) { if (key === "phase") phase = value; return q; }, in() { return q; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: table === "brain_itens" ? (approved ? [{ memoria: "identidade", chave: "nome", valor: "Autor fictício" }] : []) : null, error: null }).then(resolve); },
      async single() { return { data: { name: "Autor fictício", specialty: "Marketing" }, error: null }; },
      async maybeSingle() { return { data: checkpoints.has(phase) ? { result: checkpoints.get(phase) } : null, error: null }; },
      async upsert(row: { phase: string; result: unknown }) { checkpoints.set(row.phase, row.result); return { data: null, error: null }; },
    }; return q;
  } };
  return { admin, signal: new AbortController().signal, job: { id: fixture.adaptation.job_id, client_id: fixture.source.client_id, input: { theme: "Escolher uma agência de marketing médico", objective: "salvamento" } },
    async reserve() { reservations++; return "reserva-ficticia"; }, async settle(_id: string, cost: number) { assert.ok(cost > 0); settlements++; }, async beat() {},
  } as unknown as JobContext;
}
try {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.openai.com"); assert.equal(url.pathname, "/v1/chat/completions");
    calls++;
    const body = JSON.parse(String(init?.body));
    const prompt = JSON.stringify(body.messages);
    const intent = prompt.includes("Defina a intenção editorial");
    const review = prompt.includes("Revise a ADEQUAÇÃO AO TEMA");
    if (intent) return Response.json({ id: "ficticio", object: "chat.completion", created: 0, model: "gpt-4.1-mini", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ thesis: "Avaliar agências de marketing médico", audience: "Médicos que contratam uma agência", intended_question: "Como escolher uma agência preparada?", required_concepts: [{ concept: "agências", terms: ["agência", "agências"] }], unit_plan: [{ original_position: 1, narrative_function: "Gancho", new_argument: "Critérios para escolher agência" }] }) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } });
    if (!review && calls < 4) assert.ok(!prompt.includes(original), "initial generation does not receive the previous subject's copy");
    if (!review) {
      const refs = body.response_format.json_schema.schema.properties.brain_keys;
      if (approved) assert.deepEqual(refs.items.enum, ["identidade.nome"], "the provider schema only allows this clinic's approved references");
      else assert.equal(refs.maxItems, 0, "no approved Brand Brain means the model must emit an empty reference array, not keywords");
    }
    const corrected = mode === "accept" || mode === "semantic_fail" || mode === "invalid_refs" || (mode === "repair" && calls >= 4);
    const result = review ? { follows_requested_theme: mode !== "semantic_fail", theme_only_in_title_or_caption: false, unadapted_positions: mode === "semantic_fail" ? [1] : [], explanation: "Simula revisão permissiva que aceita um assunto genérico do mesmo setor" } : {
      ...base, brain_keys: mode === "invalid_refs" ? ["marketing médico"] : approved ? ["identidade.nome"] : [], title: "Como escolher uma agência", units: [{ ...base.units[0], copy: corrected ? "Agência médica\\nAvalie a estratégia" : original, on_screen_text: corrected ? "Escolha sua agência" : original }],
    };
    return Response.json({ id: "ficticio", object: "chat.completion", created: 0, model: "gpt-4.1-mini", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result) }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } });
  };
  const repaired = await adaptStructure(context(), structure, analysis);
  assert.equal(calls, 5, "a title-only adaptation is reviewed, rewritten and checked again");
  assert.match(repaired.units[0].copy, /Agência médica\nAvalie/);
  assert.equal(settlements, 5, "review and repair are budgeted and charged like every model call");
  assert.equal(reservations, settlements);
  mode = "fail"; calls = 0;
  await assert.rejects(() => adaptStructure(context(), structure, analysis), (e: unknown) => e instanceof CreativeError && e.code === "THEME_NOT_ADAPTED");
  assert.equal(calls, 5, "a second failed review blocks the proposal instead of claiming success");
  mode = "accept"; calls = 0;
  await adaptStructure(context(), structure, analysis);
  assert.equal(calls, 3, "a valid adaptation needs planning, generation and review, with no unnecessary rewrite");
  mode = "semantic_fail"; calls = 0;
  await assert.rejects(() => adaptStructure(context(), structure, analysis), (e: unknown) => e instanceof CreativeError && e.code === "THEME_NOT_ADAPTED");
  assert.equal(calls, 5, "mentioning a keyword does not override a negative semantic review");
  mode = "invalid_refs"; calls = 0;
  await assert.rejects(() => adaptStructure(context(), structure, analysis));
  assert.equal(calls, 2, "invented reference keywords fail the structured generation before review or publication");
  mode = "accept"; approved = true; calls = 0;
  const withBrain = await adaptStructure(context(), structure, analysis);
  assert.deepEqual(withBrain.brain_keys, ["identidade.nome"]);
  console.log("ok creative-theme (troca só no título rejeitada, reescrita e revisão limitada, custo contabilizado e quebra de linha preservada)");
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}
