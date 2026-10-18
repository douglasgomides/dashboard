import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { aprenderClinica } from "../api/_lib/aprendizado";
import { atribuirLinks } from "../api/_lib/redirecionar";
import { transcreverReels } from "../api/_lib/transcrever-reels";
import { ingerirConversasKommo } from "../api/_lib/conversas-kommo";
import { manualRequestSchema } from "../api/_lib/request-validation";
import { atenderClinicaSombra, rodarAtendenteSombra } from "../api/_lib/atendente";

const CID = "11111111-1111-4111-8111-111111111111";
const origin = "https://modern-integrations.offline.invalid";
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const dbError = () => json({ code: "XX000", message: "simulated database failure" }, 400);
const db = () => createClient(origin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
const originalFetch = globalThis.fetch, originalEnv = { ...process.env };

try {
  // O formulário atual manda campos opcionais vazios; a validação deve preservar esse contrato.
  const native = manualRequestSchema.parse({ alvo: "link_rastreado", client_id: CID, tipo: "bio", site_url: "", numero_whatsapp: "", frase: "Mensagem fictícia", destino_tipo: "whatsapp" });
  assert.equal(native.numero_whatsapp, undefined);
  assert.equal(native.site_url, undefined);
  assert.equal(native.frase, "Mensagem fictícia");
  assert.ok(manualRequestSchema.safeParse({ alvo: "sap_redigir", client_id: CID, titulo: "Seção fictícia", turnos: [{ papel: "equipe", texto: "Contexto fictício" }] }).success);

  let failRead = "conversas_resumos", writes = 0, rejectExpiry = false;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin);
    const table = u.pathname.split("/").at(-1);
    if ((init?.method ?? "GET") !== "GET") { writes++; return rejectExpiry ? dbError() : json(null); }
    if (table === failRead) return dbError();
    return json(table === "agentes_aprendizados" ? [{ id: "lesson", chave: "old", estado: "ativo" }] : []);
  };
  for (const table of ["conversas_resumos", "instagram_posts", "meta_ads_daily", "meta_ads_campaigns", "sugestoes_agentes", "operacao_recuperacao"]) {
    failRead = table;
    await assert.rejects(() => aprenderClinica(db(), CID));
    assert.equal(writes, 0, "an incomplete source must never expire existing lessons");
  }
  failRead = ""; rejectExpiry = true;
  await assert.rejects(() => aprenderClinica(db(), CID), /expirar/);
  rejectExpiry = false;
  assert.equal((await aprenderClinica(db(), CID)).expiradas, 1);

  let rejectAssignment = true;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin);
    const table = u.pathname.split("/").at(-1);
    assert.equal(u.searchParams.get("client_id"), `eq.${CID}`, "all attribution reads/writes remain scoped");
    if (init?.method === "PATCH") { assert.equal(u.searchParams.get("link_id"), "is.null"); return rejectAssignment ? dbError() : json({ id: "conversation" }); }
    if (table === "links_rastreados") return json([{ id: "link", client_id: CID, codigo_ref: "AAAAAA", mensagem_modelo: "Mensagem fictícia", criado_em: new Date().toISOString() }]);
    if (table === "conversas") return json([{ id: "conversation", iniciada_em: new Date().toISOString() }]);
    if (table === "mensagens") return json([{ texto: "Mensagem fictícia (ref AAAAAA)" }]);
    if (table === "link_cliques") return json([]);
    throw new Error(`Unexpected attribution call ${table}`);
  };
  await assert.rejects(() => atribuirLinks(db(), CID), /persistir/);
  rejectAssignment = false;
  assert.equal((await atribuirLinks(db(), CID)).atribuidas, 1);

  process.env.META_ACCESS_TOKEN = "fictional-meta-token";
  process.env.OPENAI_API_KEY = "fictional-openai-key";
  let rejectTranscript = true, rejectCost = false, unsafeVideo = false, invalidTranscript = false, videoCalls = 0, providerCalls = 0;
  const patches: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      const table = u.pathname.split("/").at(-1);
      if ((init?.method ?? "GET") === "GET") {
        assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
        return json([{ id: "post", client_id: CID, windsor_media_id: "123" }]);
      }
      if (table === "ia_execucoes") return rejectCost ? dbError() : json(null);
      assert.equal(table, "instagram_posts");
      assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
      const body = JSON.parse(String(init?.body)); patches.push(body);
      return rejectTranscript ? dbError() : json(null);
    }
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    if (u.hostname === "graph.facebook.com") return json({ media_type: "VIDEO", media_url: unsafeVideo ? "https://127.0.0.1/private" : "https://video.fixture.fbcdn.net/reel.mp4" });
    if (u.hostname === "video.fixture.fbcdn.net") { videoCalls++; return new Response(new Uint8Array([1, 2, 3])); }
    assert.equal(u.hostname, "api.openai.com"); providerCalls++; return json({ text: invalidTranscript ? { invalid: true } : "Roteiro fictício" });
  };
  let r = await transcreverReels(db(), 10_000, 1, CID);
  assert.equal(r.feitas, 0); assert.match(r.erros[0], /persistir/);
  assert.equal(patches.length, 1, "a failed save must not stamp a permanent transcription error");
  rejectTranscript = false;
  r = await transcreverReels(db(), 10_000, 1, CID); assert.equal(r.feitas, 1);
  rejectCost = true; const before = patches.length;
  r = await transcreverReels(db(), 10_000, 1, CID);
  assert.equal(r.feitas, 0); assert.equal(patches.length, before, "missing cost audit cannot be reported as a saved transcription");
  rejectCost = false; invalidTranscript = true;
  r = await transcreverReels(db(), 10_000, 1, CID);
  assert.equal(r.feitas, 0); assert.equal(patches.length, before, "malformed provider output must not become a completed transcript");
  invalidTranscript = false; unsafeVideo = true; const beforeVideo = videoCalls, beforeAi = providerCalls;
  r = await transcreverReels(db(), 10_000, 1, CID);
  assert.equal(r.feitas, 0); assert.equal(videoCalls, beforeVideo); assert.equal(providerCalls, beforeAi);

  let urgent = false, rejectDraft = true, auditCalls = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin, "failed shadow audit must stop before contacting AI");
    const table = u.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      if (table === "acessos_conversas") { auditCalls++; return dbError(); }
      assert.equal(table, "atendente_rascunhos");
      return rejectDraft ? dbError() : json(null);
    }
    if (table === "clients") return json({ name: "Clínica fictícia" });
    assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
    if (table === "conversas") return json([{ id: "conversation", ultima_msg_em: new Date().toISOString() }]);
    if (table === "mensagens" && u.searchParams.has("conversa_id")) return json([{ id: "message", direcao: "entrada", texto: urgent ? "Estou com falta de ar" : "Olá, gostaria de conhecer a clínica", enviada_em: new Date().toISOString(), tipo: "text" }]);
    if (table === "atendente_rascunhos" && u.searchParams.has("gatilho_mensagem_id")) return json(null);
    return json([]);
  };
  let shadow = await atenderClinicaSombra(db(), CID, Date.now() + 10_000);
  assert.equal(auditCalls, 1); assert.equal(shadow.rascunhos, 0); assert.match(shadow.erros[0], /registrar o acesso/);
  urgent = true;
  await assert.rejects(() => atenderClinicaSombra(db(), CID, Date.now() + 10_000), /persistir/);
  rejectDraft = false;
  shadow = await atenderClinicaSombra(db(), CID, Date.now() + 10_000);
  assert.equal(shadow.passou_humano, 1);
  assert.deepEqual(await rodarAtendenteSombra(db(), 10_000, CID), {});

  let requests = 0;
  globalThis.fetch = async (input) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin, "invalid Kommo host cannot receive credentials"); requests++;
    return json([{ id: "connection", client_id: CID, subdomain: "127.0.0.1", access_token: "fictional-key", config: {} }]);
  };
  const kommo = await ingerirConversasKommo(db());
  assert.equal(requests, 1); assert.match(Object.values(kommo)[0].erros[0], /inválido/);
  console.log("ok api-modern-integrations (contrato atual, aprendizado fail-closed, atribuição/transcrição persistidas, escopo e SSRF Kommo)");
} finally {
  globalThis.fetch = originalFetch;
  for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
  Object.assign(process.env, originalEnv);
}
