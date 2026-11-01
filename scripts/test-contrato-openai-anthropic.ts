// Contrato das respostas da OpenAI e da Anthropic que api/_lib/ia.ts lê. Doc: docs/apis/openai-anthropic.md.
// Ao vivo (só GET em /v1/models: confere se os modelos padrão ainda existem):
//   CONTRATO_AO_VIVO=1 CONTRATO_OPENAI_KEY=... CONTRATO_ANTHROPIC_KEY=... npx tsx scripts/test-contrato-openai-anthropic.ts
import assert from "node:assert/strict";
import { campos, rodarContrato, type Endpoint } from "./contrato/comum";
import { chamarIAJson } from "../api/_lib/ia";

// Os mesmos padrões de api/_lib/ia.ts, transcrever-reels.ts e creative-arte.ts (que não exportam as constantes).
const MODELOS_OPENAI = [process.env.AGENTES_MODELO || "gpt-4o-mini", process.env.AGENTES_MODELO_FORTE || "gpt-4.1", "gpt-4o-mini-transcribe", "gpt-image-1"];
const MODELOS_CLAUDE = [process.env.AGENTES_MODELO_CLAUDE || "claude-haiku-4-5-20251001", process.env.AGENTES_MODELO_CLAUDE_FORTE || "claude-sonnet-5-5"];

const modeloOpenai = (m: string): Endpoint => ({
  nome: "openai_modelo",
  rotulo: `openai_modelo ${m}`,
  hosts: /^api\.openai\.com$/,
  campos: campos(["id: string", "object: string"]),
  aoVivo: (env) => (env.CONTRATO_OPENAI_KEY ? { url: `https://api.openai.com/v1/models/${encodeURIComponent(m)}`, headers: { Authorization: `Bearer ${env.CONTRATO_OPENAI_KEY}` } } : null),
});
const modeloClaude = (m: string): Endpoint => ({
  nome: "anthropic_modelo",
  rotulo: `anthropic_modelo ${m}`,
  hosts: /^api\.anthropic\.com$/,
  campos: campos(["id: string", "type: string"]),
  aoVivo: (env) => (env.CONTRATO_ANTHROPIC_KEY ? { url: `https://api.anthropic.com/v1/models/${encodeURIComponent(m)}`, headers: { "x-api-key": env.CONTRATO_ANTHROPIC_KEY, "anthropic-version": "2023-06-01" } } : null),
});

/** Chama o chamarIAJson real com fetch e banco falsos, só na memória. */
async function comFetchFalso(resposta: unknown, chaves: { openai?: string; anthropic?: string }) {
  const antes = { fetch: globalThis.fetch, o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  const pedidos: string[] = [];
  const registros: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    pedidos.push(new URL(typeof input === "string" || input instanceof URL ? input : input.url).hostname);
    return new Response(JSON.stringify(resposta), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  if (chaves.openai) process.env.OPENAI_API_KEY = chaves.openai; else delete process.env.OPENAI_API_KEY;
  if (chaves.anthropic) process.env.ANTHROPIC_API_KEY = chaves.anthropic; else delete process.env.ANTHROPIC_API_KEY;
  const admin = { from: () => ({ insert: async (linha: Record<string, unknown>) => { registros.push(linha); return { error: null }; } }) };
  try {
    const r = await chamarIAJson(admin as never, { sistema: "Responda em JSON.", entrada: "teste", finalidade: "contrato", clientId: null });
    return { r, pedidos, registros };
  } finally {
    globalThis.fetch = antes.fetch;
    if (antes.o === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = antes.o;
    if (antes.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = antes.a;
  }
}

await rodarContrato({
  api: "openai-anthropic",
  variaveis: ["CONTRATO_OPENAI_KEY", "CONTRATO_ANTHROPIC_KEY"],
  endpoints: [
    {
      // POST no código: só offline.
      nome: "openai_chat",
      campos: campos(["choices: array", "choices[].message.content: string|null", "choices[].finish_reason: string", "usage.prompt_tokens: number", "usage.completion_tokens: number"]),
    },
    {
      nome: "anthropic_messages",
      campos: campos(["content: array", "content[].type: string", "content[].text?: string", "stop_reason: string|null", "usage.input_tokens: number", "usage.output_tokens: number"]),
    },
    ...MODELOS_OPENAI.map(modeloOpenai),
    ...MODELOS_CLAUDE.map(modeloClaude),
  ],
  normalizadores: async (f: any) => {
    const o = await comFetchFalso(f.openai_chat, { openai: "chave-falsa-de-teste" });
    assert.deepEqual(o.pedidos, ["api.openai.com"]);
    assert.deepEqual(o.r.json, { resumo: "exemplo", itens: [1, 2] });
    assert.equal(o.registros[0]?.tokens_entrada, 120);
    assert.equal(o.registros[0]?.ok, true);
    // Reserva: só entra quando NÃO há chave da OpenAI (não quando a OpenAI falha). Ver pegadinhas.
    const a = await comFetchFalso(f.anthropic_messages, { anthropic: "chave-falsa-de-teste" });
    assert.deepEqual(a.pedidos, ["api.anthropic.com"]);
    assert.deepEqual(a.r.json, { resumo: "exemplo", itens: [1, 2] }, "texto antes do JSON é ignorado");
    assert.equal(a.registros[0]?.tokens_saida, 35);
  },
});
