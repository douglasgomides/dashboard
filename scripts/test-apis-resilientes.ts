import assert from "node:assert/strict";
import { definirDormirRetry, esperaRetryAfter, fetchComRetry, ritmoKommo } from "../api/_lib/integration-http";
import { mascararDadosPessoais } from "../api/_lib/mascarar-pii";
import { chamarIAJson, deveUsarReserva, ErroProvedorIA } from "../api/_lib/ia";
import { avisoValidadeToken, erroCurto, expiraDoJwt, ocultarSegredos } from "../api/_lib/sync-status";
import { direcaoDigisac, primeiraRespostaDigisac } from "../api/_lib/conversas-digisac";

// Tudo offline: fetch falso, espera falsa. Nenhum dado real.
const originalFetch = globalThis.fetch;
const esperas: number[] = [];
definirDormirRetry(async (ms) => { esperas.push(ms); });
const resposta = (status: number, corpo: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });

try {
  // ---- Retry-After ----
  assert.equal(esperaRetryAfter("3"), 3000);
  assert.equal(esperaRetryAfter("0.5"), 500);
  assert.equal(esperaRetryAfter(null), null);
  assert.equal(esperaRetryAfter("lixo"), null);
  const agora = Date.parse("2026-11-01T12:00:00Z");
  assert.equal(esperaRetryAfter("Sun, 01 Nov 2026 12:00:04 GMT", agora), 4000);

  // ---- 429 com Retry-After, depois 200 ----
  let chamadas = 0;
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    chamadas++;
    assert.equal(init?.redirect, "error", "nunca segue redirecionamento com token");
    return chamadas === 1 ? resposta(429, {}, { "retry-after": "2" }) : resposta(200, { ok: true });
  }) as typeof fetch;
  esperas.length = 0;
  let r = await fetchComRetry("https://exemplo.kommo.com/api/v4/leads");
  assert.equal(r.status, 200);
  assert.equal(chamadas, 2);
  assert.deepEqual(esperas, [2000], "respeita o Retry-After");

  // ---- 5xx persistente: para no total de tentativas e devolve a última resposta ----
  chamadas = 0; esperas.length = 0;
  globalThis.fetch = (async () => { chamadas++; return resposta(503); }) as typeof fetch;
  r = await fetchComRetry("https://api.exemplo.test/x", {}, { tentativas: 3, baseMs: 100 });
  assert.equal(r.status, 503);
  assert.equal(chamadas, 3);
  assert.equal(esperas.length, 2);
  assert.ok(esperas[1] > esperas[0], "espera cresce");

  // ---- 4xx não repete ----
  chamadas = 0;
  globalThis.fetch = (async () => { chamadas++; return resposta(401); }) as typeof fetch;
  r = await fetchComRetry("https://api.exemplo.test/x");
  assert.equal(r.status, 401);
  assert.equal(chamadas, 1);

  // ---- Retry-After acima do teto: não prende a função ----
  chamadas = 0; esperas.length = 0;
  globalThis.fetch = (async () => { chamadas++; return resposta(429, {}, { "retry-after": "3600" }); }) as typeof fetch;
  r = await fetchComRetry("https://api.exemplo.test/x", {}, { maxEsperaMs: 10_000 });
  assert.equal(r.status, 429);
  assert.equal(chamadas, 1);
  assert.deepEqual(esperas, []);

  // ---- Prazo da rodada: não espera além dele ----
  chamadas = 0; esperas.length = 0;
  globalThis.fetch = (async () => { chamadas++; return resposta(500); }) as typeof fetch;
  r = await fetchComRetry("https://api.exemplo.test/x", {}, { baseMs: 5000, prazo: Date.now() + 1000 });
  assert.equal(chamadas, 1);

  // ---- Queda de rede: tenta de novo; estouro de tempo não ----
  chamadas = 0;
  globalThis.fetch = (async () => { chamadas++; if (chamadas === 1) throw new TypeError("fetch failed"); return resposta(200); }) as typeof fetch;
  r = await fetchComRetry("https://api.exemplo.test/x", {}, { baseMs: 1 });
  assert.equal(r.status, 200);
  assert.equal(chamadas, 2);
  chamadas = 0;
  globalThis.fetch = (async () => { chamadas++; throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as typeof fetch;
  await assert.rejects(fetchComRetry("https://api.exemplo.test/x"), /timeout/);
  assert.equal(chamadas, 1);

  // ---- Ritmo do Kommo: no máximo 6 pedidos por segundo por conta ----
  esperas.length = 0;
  globalThis.fetch = (async () => resposta(200)) as typeof fetch;
  const ritmo = ritmoKommo("conta-ritmo.kommo.com");
  assert.equal(ritmo.porSegundo, 6);
  for (let i = 0; i < 4; i++) await fetchComRetry("https://conta-ritmo.kommo.com/api/v4/leads", {}, { ritmo });
  assert.equal(esperas.length, 3, "a partir do 2º pedido espaça");
  assert.ok(esperas.every((ms) => ms > 0 && ms <= 1000));

  // ---- Máscara de dados pessoais (LGPD) ----
  const m = mascararDadosPessoais("Meu e-mail é paciente.teste@exemplo.com.br, CPF 123.456.789-09 e celular (11) 98765-4321. Também +55 21 3456 7890.");
  assert.ok(!/exemplo\.com/.test(m) && !/123\.456/.test(m) && !/98765/.test(m) && !/3456 7890/.test(m), m);
  assert.ok(m.includes("[e-mail]") && m.includes("[cpf]") && m.includes("[telefone]"));
  assert.equal(mascararDadosPessoais("CPF 12345678909"), "CPF [cpf]");
  assert.ok(!/\d{8}/.test(mascararDadosPessoais("liga 11987654321")), "celular só com dígitos também sai");
  assert.ok(!/\d{8}/.test(mascararDadosPessoais("whats 5511987654321")));
  // Preço, data e hora não são dado pessoal: ficam.
  assert.equal(mascararDadosPessoais("Consulta R$ 450,00 dia 12/11 às 14:30"), "Consulta R$ 450,00 dia 12/11 às 14:30");
  assert.equal(mascararDadosPessoais(null), "");

  // ---- Segredos fora dos logs e das mensagens de erro ----
  const url = "https://connectors.windsor.ai/facebook?api_key=abc123segredo&date_from=2026-10-01";
  assert.ok(!ocultarSegredos(url).includes("abc123segredo"));
  assert.ok(ocultarSegredos(url).includes("date_from=2026-10-01"));
  assert.ok(!erroCurto(`falhou em ${url}`)!.includes("abc123segredo"));
  assert.ok(!erroCurto("webhook?connection_id=1&secret=s3gr3d0")!.includes("s3gr3d0"));
  assert.ok(!erroCurto("crm.rdstation.com/api/v1/deals?token=tok123&page=1")!.includes("tok123"));
  assert.equal(erroCurto("x access_token=EAAB123 y"), "x access_token=*** y");
  assert.ok(!erroCurto("Authorization: Bearer abc.def-ghi")!.includes("abc.def"));
  assert.ok(!erroCurto("Incorrect API key provided: sk-proj-abcd****wxyz")!.includes("abcd"));

  // ---- Validade do token (JWT do Kommo) ----
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.parse("2026-11-20T00:00:00Z") / 1000);
  const jwt = `${b64({ alg: "RS256" })}.${b64({ exp, jti: "x" })}.assinatura`;
  assert.equal(expiraDoJwt(jwt)?.toISOString(), "2026-11-20T00:00:00.000Z");
  assert.equal(expiraDoJwt("token-que-nao-e-jwt"), null);
  assert.equal(expiraDoJwt(null), null);
  const hoje = new Date("2026-11-01T00:00:00Z");
  assert.match(avisoValidadeToken("Kommo", expiraDoJwt(jwt), hoje)!, /^O token do Kommo vence em 19 dias \(20\/11\/2026\)/);
  assert.equal(avisoValidadeToken("Kommo", new Date("2027-06-01T00:00:00Z"), hoje), null, "longe do vencimento não avisa");
  assert.match(avisoValidadeToken("Kommo", new Date("2026-10-30T00:00:00Z"), hoje)!, /venceu em 30\/10\/2026/);
  assert.match(avisoValidadeToken("Kommo", new Date("2026-11-01T20:00:00Z"), hoje)!, /vence em 1 dia /);

  // ---- Digisac: avisos, reações e ligações não são mensagem do paciente ----
  assert.equal(direcaoDigisac({ isFromMe: false, type: "ticket" }), "sistema");
  assert.equal(direcaoDigisac({ isFromMe: false, type: "reaction" }), "sistema");
  assert.equal(direcaoDigisac({ isFromMe: true, type: "call_log" }), "sistema");
  assert.equal(direcaoDigisac({ isFromMe: false, type: "chat" }), "entrada");
  // 1ª resposta pelas mensagens: aviso e robô não contam; sem marca de quem enviou, não calcula.
  const t = (min: number) => new Date(Date.parse("2026-10-20T12:00:00Z") + min * 60_000).toISOString();
  const conversa = [
    { type: "ticket", isFromMe: false, timestamp: t(0) },
    { type: "chat", isFromMe: true, userId: null, timestamp: t(0.1) }, // abriu antes do paciente: não é resposta
    { type: "chat", isFromMe: false, timestamp: t(1) },
    { type: "chat", isFromMe: true, userId: null, timestamp: t(1.05) }, // robô de boas-vindas
    { type: "reaction", isFromMe: true, userId: "u1", timestamp: t(2) },
    { type: "chat", isFromMe: true, userId: "u1", timestamp: t(13) },
  ];
  assert.deepEqual(primeiraRespostaDigisac(conversa), { em: t(13), segundos: 720 });
  assert.equal(primeiraRespostaDigisac(conversa.map(({ userId: _u, ...m }) => m)), null, "sem userId não dá para separar robô de pessoa");
  assert.equal(primeiraRespostaDigisac([{ type: "chat", isFromMe: false, timestamp: t(0) }, { type: "chat", isFromMe: true, userId: null, timestamp: t(1) }]), null);
  assert.equal(primeiraRespostaDigisac([{ type: "chat", isFromMe: true, userId: "u1", timestamp: t(0) }]), null, "sem mensagem do paciente");

  // ---- IA: OpenAI falha (401/429/5xx/rede) e a Anthropic responde, registrando quem serviu ----
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 401, "openai")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 403, "openai")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 429, "openai")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 502, "openai")), true);
  assert.equal(deveUsarReserva(new ErroProvedorIA("x", 400, "openai")), false, "pedido inválido não muda de provedor");
  assert.equal(deveUsarReserva(new SyntaxError("json")), false);
  assert.equal(deveUsarReserva(new TypeError("fetch failed")), true);

  const linhas: Record<string, unknown>[] = [];
  const admin = { from: (tabela: string) => ({ insert: async (l: Record<string, unknown>) => { assert.equal(tabela, "ia_execucoes"); linhas.push(l); return { error: null }; } }) } as any;
  const pedido = { sistema: "Responda JSON.", entrada: "oi", finalidade: "teste_reserva", clientId: null };
  const env = { o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  process.env.OPENAI_API_KEY = "fictional-openai-key";
  process.env.ANTHROPIC_API_KEY = "fictional-anthropic-key";
  const hosts: string[] = [];
  const modelos: string[] = [];
  const iaFalsa = (openai: () => Response | Promise<Response>) => (async (u: string | URL | Request, init?: RequestInit) => {
    const host = new URL(String(u)).hostname;
    hosts.push(host);
    const corpo = JSON.parse(String(init?.body));
    modelos.push(corpo.model);
    if (host === "api.openai.com") return openai();
    assert.equal(host, "api.anthropic.com");
    return resposta(200, { content: [{ type: "text", text: '{"ok":"claude"}' }], usage: { input_tokens: 1000, output_tokens: 100 } });
  }) as typeof fetch;

  for (const status of [401, 403, 429, 500, 503]) {
    hosts.length = 0; linhas.length = 0; modelos.length = 0;
    globalThis.fetch = iaFalsa(() => resposta(status, { error: { message: "Incorrect API key provided: sk-proj-abcd****wxyz" } }));
    const out = await chamarIAJson(admin, pedido);
    assert.deepEqual(out.json, { ok: "claude" }, `status ${status}`);
    assert.equal(out.provedor, "anthropic");
    assert.equal(out.reserva, true);
    assert.deepEqual(hosts, ["api.openai.com", "api.anthropic.com"]);
    assert.equal(linhas.length, 2, "a falha e a resposta da reserva ficam registradas");
    assert.equal(linhas[0].ok, false);
    assert.equal(linhas[0].modelo, "gpt-4o-mini");
    assert.ok(!String(linhas[0].erro).includes("abcd"), "chave nunca vai para o registro, nem mascarada");
    assert.equal(linhas[1].ok, true);
    assert.equal(linhas[1].modelo, "claude-haiku-5-5");
    assert.equal(linhas[1].custo_usd, (1000 * 0.1 + 100 * 0.5) / 1_000_000);
  }
  // Modelo forte da reserva.
  hosts.length = 0; linhas.length = 0; modelos.length = 0;
  globalThis.fetch = iaFalsa(() => resposta(500));
  const forte = await chamarIAJson(admin, { ...pedido, qualidade: "forte" });
  assert.equal(forte.modelo, "claude-sonnet-5-5");
  assert.deepEqual(modelos, ["gpt-4.1", "claude-sonnet-5-5"]);
  assert.equal(linhas[1].custo_usd, (1000 * 2 + 100 * 10) / 1_000_000, "preço do Sonnet na tabela");

  // Queda de rede na OpenAI também passa para a reserva.
  hosts.length = 0; linhas.length = 0;
  globalThis.fetch = iaFalsa(() => { throw new TypeError("fetch failed"); });
  assert.equal((await chamarIAJson(admin, pedido)).provedor, "anthropic");

  // OpenAI ok: serve sozinha.
  hosts.length = 0; linhas.length = 0;
  globalThis.fetch = iaFalsa(() => resposta(200, { choices: [{ message: { content: '{"ok":"gpt"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  const direto = await chamarIAJson(admin, pedido);
  assert.deepEqual(direto.json, { ok: "gpt" });
  assert.equal(direto.provedor, "openai");
  assert.equal(direto.reserva, false);
  assert.deepEqual(hosts, ["api.openai.com"]);
  assert.equal(linhas.length, 1);

  // 400 (pedido inválido) não usa a reserva.
  hosts.length = 0; linhas.length = 0;
  globalThis.fetch = iaFalsa(() => resposta(400));
  await assert.rejects(chamarIAJson(admin, pedido), /OpenAI respondeu 400/);
  assert.deepEqual(hosts, ["api.openai.com"]);

  // Os dois falham: erro final da reserva, as duas tentativas registradas.
  hosts.length = 0; linhas.length = 0;
  globalThis.fetch = (async (u: string | URL | Request) => resposta(new URL(String(u)).hostname === "api.openai.com" ? 401 : 529)) as typeof fetch;
  await assert.rejects(chamarIAJson(admin, pedido), /Anthropic respondeu 529/);
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.ok === false));

  // Sem a chave da Anthropic, a falha da OpenAI é o erro final.
  delete process.env.ANTHROPIC_API_KEY;
  globalThis.fetch = iaFalsa(() => resposta(401));
  await assert.rejects(chamarIAJson(admin, pedido), /OpenAI respondeu 401/);

  if (env.o === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = env.o;
  if (env.a === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = env.a;
  console.log("ok apis-resilientes (retry 429/5xx/rede com Retry-After e teto, ritmo do Kommo, máscara LGPD, segredos fora do log, validade do token, Digisac, reserva de IA)");
} finally {
  globalThis.fetch = originalFetch;
}
