import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { FERRAMENTAS } from "../api/_lib/agentes";
import { chamarIAJson } from "../api/_lib/ia";
import { limitarTexto, textoValido } from "../api/_lib/texto-ia";

const cid = "11111111-1111-4111-8111-111111111111";
const caption = `${"a".repeat(99)}🚀 legenda fictícia`;
const pg = new PGlite();
const originalFetch = globalThis.fetch;
const originalOpenAI = process.env.OPENAI_API_KEY;
const originalAnthropic = process.env.ANTHROPIC_API_KEY;
try {
  // Reproduz o defeito: JSON.stringify aceita o corte, mas jsonb rejeita o surrogate isolado.
  await assert.rejects(() => pg.query("select $1::jsonb", [JSON.stringify({ texto: caption.slice(0, 100) })]),
    (e: any) => e.code === "22P02" && /surrogate/i.test(e.detail));
  assert.equal(limitarTexto(caption, 100), "a".repeat(99));
  assert.equal(limitarTexto(caption, 101), `${"a".repeat(99)}🚀`);
  assert.equal(textoValido("ação 🚀 médica"), "ação 🚀 médica");
  assert.equal(textoValido("a\ud83db\ude80c\0d"), "a�b�cd");
  for (const limite of [0, 1, 99, 100, 101, 120, 7000, 15_000, 16_000, 19_000]) {
    const texto = limitarTexto(`${"a".repeat(Math.max(0, limite - 1))}🚀 fim`, limite);
    assert.ok(texto.length <= limite);
    await pg.query("select $1::jsonb", [JSON.stringify({ texto })]);
  }

  const origin = "https://unicode-fixture.offline.invalid";
  const admin = createClient(origin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
  let aiCalls = 0, costRows = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      const table = u.pathname.split("/").at(-1);
      if (init?.method === "POST") {
        assert.equal(table, "ia_execucoes"); costRows++;
        return Response.json(null);
      }
      assert.equal(u.searchParams.get(table === "clients" ? "id" : "client_id"), `eq.${cid}`);
      if (table === "clients") return Response.json({ name: "Clínica fictícia", specialty: "Dermatologia" });
      if (table === "sap_clinicas") return Response.json(null);
      if (table === "instagram_posts") return Response.json([{ caption, format: "reel", tema: "Educação", engagement: 5 }]);
      if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
      return Response.json([]);
    }
    assert.ok(["api.openai.com", "api.anthropic.com"].includes(u.hostname));
    aiCalls++;
    const body = JSON.parse(String(init?.body));
    const prompts = [body.system, ...body.messages.map((m: { content: string }) => m.content)].filter(Boolean);
    for (const texto of prompts) await pg.query("select $1::jsonb", [JSON.stringify({ texto })]);
    assert.equal(body.messages.at(-1).content, "entrada � corrigida");
    return u.hostname === "api.openai.com"
      ? Response.json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
      : Response.json({ content: [{ text: '{"ok":true}' }], usage: { input_tokens: 10, output_tokens: 5 } });
  };
  // Exercita a leitura completa do Estrategista, incluindo a legenda cortada em 100.
  const contexto = await FERRAMENTAS["growth.ler_contexto"].executar(admin, {} as any, { client_id: cid });
  assert.ok(contexto.texto.includes("Posts com mais engajamento"));
  await pg.query("select $1::jsonb", [JSON.stringify(contexto)]);
  assert.equal(aiCalls, 0, "a leitura não chama provedores de IA");

  const pedido = { sistema: "Responda JSON com acentos, ação e emoji 🚀.", entrada: "entrada \ud83d corrigida\0", finalidade: "teste_unicode", clientId: cid };
  process.env.OPENAI_API_KEY = "fictional-openai-key";
  assert.deepEqual((await chamarIAJson(admin, pedido)).json, { ok: true });
  delete process.env.OPENAI_API_KEY; process.env.ANTHROPIC_API_KEY = "fictional-anthropic-key";
  assert.deepEqual((await chamarIAJson(admin, pedido)).json, { ok: true });
  assert.equal(aiCalls, 2); assert.equal(costRows, 2);
  console.log("ok agentes-unicode (corte real de emoji, contexto jsonb e pedidos aos dois provedores)");
} finally {
  globalThis.fetch = originalFetch;
  if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAI;
  if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  await pg.close();
}
