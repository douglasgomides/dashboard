import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import manual from "../api/sync/manual";
import type { VercelRequest, VercelResponse } from "../api/_lib/http-types";
import { atribuirLinks, DIAS_ATRIBUICAO, paginaLinkDesativado, redirecionarLink } from "../api/_lib/redirecionar";
import {
  atribuirConversa, baseDoLink, candidatosCodigo, codigoCurtoValido, codigosNaMensagem, destinoWhatsApp, fraseSemCodigo, LINK_BASE_PADRAO,
  mensagemComRef, NOME_MAX, numeroDoDestino, POSICOES, sugerirNomeLink, urlCurta, urlDoLink, validarNomeLink,
} from "../src/lib/rastreio";

// Piloto dos links curtos (Dra. Juliana Paola e Dra. Mariela Muniz, mesmo WhatsApp). Tudo com dados fictícios e rede falsa.

// ---- 1. Nome do link: minúsculas, sem acento, até 24, com motivo em português simples
assert.deepEqual(validarNomeLink("Juliana Bio"), { ok: true, slug: "juliana-bio" });
assert.deepEqual(validarNomeLink("  Mariela   Stóry!! "), { ok: true, slug: "mariela-story" });
assert.deepEqual(validarNomeLink("MARIELA_QR"), { ok: true, slug: "mariela-qr" });
assert.equal(validarNomeLink("a".repeat(NOME_MAX)).ok, true);
const longo = validarNomeLink("a".repeat(NOME_MAX + 1));
assert.ok(!longo.ok && /no máximo 24/.test(longo.motivo));
assert.ok(!validarNomeLink("ab").ok);
assert.ok(!validarNomeLink("---").ok);
const reservado = validarNomeLink("admin");
assert.ok(!reservado.ok && /reservado/.test(reservado.motivo));
for (const r of [longo, reservado, validarNomeLink("")]) if (!r.ok) assert.ok(!r.motivo.includes("—"), "texto sem travessão");

// Sugestão a partir do nome da clínica + lugar; se já existe, numera.
assert.equal(sugerirNomeLink("Dra. Juliana Paola", "bio"), "juliana-bio");
assert.equal(sugerirNomeLink("Dra. Mariela Muniz", "story"), "mariela-story");
assert.equal(sugerirNomeLink("Dra. Mariela Muniz", "parceiro"), "mariela-indicacao");
assert.equal(sugerirNomeLink("Dra. Juliana Paola", "bio", ["juliana-bio"]), "juliana-bio-2");
assert.equal(sugerirNomeLink("Dra. Juliana Paola", "bio", ["juliana-bio", "juliana-bio-2"]), "juliana-bio-3");
assert.equal(sugerirNomeLink("Clínica Dr. Ângelo Gonçalves", "destaque"), "angelo-destaque");
assert.equal(sugerirNomeLink(null, "qr"), "clinica-qr");
for (const p of Object.keys(POSICOES) as (keyof typeof POSICOES)[]) {
  const s = sugerirNomeLink("Dra. Maximiliana Albuquerque", p);
  assert.ok(validarNomeLink(s).ok && s.length <= NOME_MAX, `sugestão válida para ${p}: ${s}`);
}

// ---- 2. Endereço com domínio configurável (nunca o host do navegador)
assert.equal(baseDoLink(undefined), LINK_BASE_PADRAO);
assert.equal(baseDoLink(""), "https://dash.doctorcreator.com.br");
assert.equal(baseDoLink("https://dc.link/"), "https://dc.link");
assert.equal(baseDoLink("dc.link"), "https://dc.link");
assert.equal(baseDoLink("http://dc.link"), LINK_BASE_PADRAO, "sem https volta ao padrão");
assert.equal(baseDoLink("https://dc.link/r"), LINK_BASE_PADRAO, "com caminho volta ao padrão");
assert.equal(baseDoLink("javascript:alert(1)"), LINK_BASE_PADRAO);
assert.equal(urlDoLink("juliana-bio"), "https://dash.doctorcreator.com.br/r/juliana-bio");
assert.equal(urlDoLink("juliana-bio", "https://dc.link"), "https://dc.link/r/juliana-bio");
assert.equal(urlCurta("mariela-story", "dc.link"), "dc.link/r/mariela-story");

// ---- 3. Texto com código curto e único
const cands = candidatosCodigo();
assert.equal(new Set(cands).size, cands.length);
assert.ok(cands.every(codigoCurtoValido), cands.join(","));
assert.ok(/^R\d{2}$/.test(cands[0]), "começa pelos de 2 números");
assert.equal(mensagemComRef("Olá! Vim pelo Instagram", "R27"), "Olá! Vim pelo Instagram (R27)");
assert.equal(mensagemComRef("Olá! Vim pelo Instagram (R11)", "R27"), "Olá! Vim pelo Instagram (R27)", "código velho na frase sai");
assert.equal(mensagemComRef("", "R27"), "Olá! Vim pelo Instagram (R27)");
assert.equal(fraseSemCodigo("Olá! Vim pelo link da bio (R27)"), "Olá! Vim pelo link da bio");
const wa = destinoWhatsApp("(67) 99999-1234", "Olá! Vim pelo story", "R318")!;
assert.equal(decodeURIComponent(wa.split("text=")[1]), "Olá! Vim pelo story (R318)");
assert.equal(numeroDoDestino(wa), "5567999991234");
assert.deepEqual(codigosNaMensagem("olá! vim pelo story (r318)"), ["R318"]);
assert.deepEqual(codigosNaMensagem("Oi (ref A7K9QX)"), ["A7K9QX"], "links antigos continuam sendo reconhecidos");
for (const p of Object.values(POSICOES)) assert.ok(p.frase.length <= 50 && !p.frase.includes("—"), p.frase);

// ---- 5. Atribuição por código (e o mesmo WhatsApp em duas clínicas)
const ini = "2026-10-20T15:00:00Z";
const linksJuliana = [
  { id: "bio", codigo_ref: "R27", mensagem_modelo: "Olá! Vim pelo link da bio (R27)", criado_em: "2026-10-01T00:00:00Z" },
  { id: "story", codigo_ref: "R318", mensagem_modelo: "Olá! Vim pelo story (R318)", criado_em: "2026-10-02T00:00:00Z" },
];
assert.deepEqual(atribuirConversa("Olá! Vim pelo story (R318)", ini, linksJuliana, []), { link_id: "story", como: "ref" });
assert.deepEqual(atribuirConversa("ola vim pelo link da bio r27", ini, linksJuliana, []), { link_id: "bio", como: "ref" });
assert.equal(atribuirConversa("Olá! Vim pelo link da bio (R45)", ini, linksJuliana, [{ link_id: "bio", em: ini }]), null, "código da outra clínica: não chuta pela frase nem pelo horário");
assert.deepEqual(atribuirConversa("Olá! Vim pelo link da bio", ini, linksJuliana, []), { link_id: "bio", como: "frase" }, "apagou o código: casa pela frase");
assert.equal(atribuirConversa("Oi (ref ZZZZZZ)", ini, linksJuliana, [{ link_id: "bio", em: ini }]), null, "código antigo de outra clínica também não chuta");
assert.deepEqual(atribuirConversa("Boa tarde, posso marcar (amanha)?", ini, linksJuliana, [{ link_id: "bio", em: new Date(Date.parse(ini) - 3 * 60_000).toISOString() }]), { link_id: "bio", como: "horario" }, "palavra comum entre parênteses não é código");

// ---------------------------------------------------------------- servidor (rede falsa)
const origin = "https://links-piloto.offline.invalid";
const CID = "11111111-1111-4111-8111-111111111111", LID = "22222222-2222-4222-8222-222222222222", UID = "33333333-3333-4333-8333-333333333333";
const PID = "44444444-4444-4444-8444-444444444444", CONV = "55555555-5555-4555-8555-555555555555";
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const fetchAntes = globalThis.fetch, envAntes = { ...process.env }, errorAntes = console.error;
const db = () => createClient(origin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
const NAVEGADOR = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0";
const logs: unknown[][] = [];
console.error = (...a: unknown[]) => { logs.push(a); };

async function abrir(slug: string) {
  let status = 0, corpo: unknown = null, local: string | null = null;
  const headers: Record<string, string> = {};
  const req = Object.assign(Readable.from([]), { method: "GET", query: { r: slug }, body: undefined, headers: { "user-agent": NAVEGADOR } }) as unknown as VercelRequest;
  const res = {
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; return this; },
    status(s: number) { status = s; return this; }, send(b: unknown) { corpo = b; return this; }, json(b: unknown) { corpo = b; return this; },
    redirect(s: number, u: string) { status = s; local = u; return this; },
  } as unknown as VercelResponse;
  await manual(req, res);
  return { status, corpo, local, headers };
}
async function chamar(body: Record<string, unknown>) {
  let status = 0, result: any;
  const req = Object.assign(Readable.from([]), { method: "POST", query: {}, body: { client_id: CID, alvo: "link_rastreado", ...body }, headers: { authorization: "Bearer fictional", host: "untrusted.invalid" } }) as unknown as VercelRequest;
  const res = { setHeader() { return this; }, status(s: number) { status = s; return this; }, json(v: unknown) { result = v; return this; } } as unknown as VercelResponse;
  await manual(req, res);
  return { status, result };
}

try {
  process.env.SUPABASE_URL = origin; process.env.SUPABASE_SERVICE_ROLE_KEY = "fictional";
  delete process.env.LINK_BASE_URL;

  // ---- 4. Redirecionamento: ativo, inativo, falha ao gravar, robô
  let ativo = true, falharClique = false, cliques = 0;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)); assert.equal(u.origin, origin);
    const tabela = u.pathname.split("/").at(-1);
    if (tabela === "links_rastreados") return json({ id: LID, client_id: CID, destino_url: "https://wa.me/5567999991234?text=Ol%C3%A1%20(R27)", destino_tipo: "whatsapp", ativo });
    if (tabela === "link_cliques") {
      assert.equal(init?.method, "POST");
      const corpo = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(corpo).sort(), ["client_id", "dispositivo", "link_id", "origem"], "clique sem dado pessoal");
      cliques++;
      return falharClique ? json({ code: "XX000", message: "falha simulada" }, 400) : json(null, 201);
    }
    throw new Error(`chamada inesperada ${tabela}`);
  };
  let r = await redirecionarLink(db(), "juliana-bio", NAVEGADOR, "https://l.instagram.com/");
  assert.deepEqual(r, { tipo: "destino", url: "https://wa.me/5567999991234?text=Ol%C3%A1%20(R27)" });
  assert.equal(cliques, 1);
  r = await redirecionarLink(db(), "juliana-bio", "facebookexternalhit/1.1", null);
  assert.equal(r?.tipo, "destino"); assert.equal(cliques, 1, "robô de prévia não conta");

  falharClique = true;
  r = await redirecionarLink(db(), "juliana-bio", NAVEGADOR, null);
  assert.equal(r?.tipo, "destino", "falha ao gravar o clique não impede o paciente");
  assert.equal(logs.length, 1, "a falha aparece no log");
  assert.match(String(logs[0][0]), /clique não registrado/);
  assert.equal((logs[0][1] as any).link_id, LID);
  assert.ok(!JSON.stringify(logs[0]).includes("iPhone"), "log sem dado do aparelho");
  falharClique = false;

  ativo = false;
  r = await redirecionarLink(db(), "juliana-bio", NAVEGADOR, null);
  assert.deepEqual(r, { tipo: "inativo", whatsapp: "https://wa.me/5567999991234" });
  assert.equal(cliques, 2, "link desativado não registra clique");
  const pagina = await abrir("juliana-bio");
  assert.equal(pagina.status, 410);
  assert.match(String(pagina.corpo), /Este link foi desativado/);
  assert.match(String(pagina.corpo), /href="https:\/\/wa\.me\/5567999991234"/);
  assert.ok(!String(pagina.corpo).includes("R27"), "sem a mensagem com código");
  assert.match(pagina.headers["content-type"], /text\/html/);
  assert.ok(!paginaLinkDesativado("javascript:alert(1)").includes("javascript"), "só aceita wa.me");
  ativo = true;
  const ok = await abrir("juliana-bio");
  assert.equal(ok.status, 302); assert.match(String(ok.local), /^https:\/\/wa\.me\//);
  assert.equal((await abrir("Nome Inválido")).status, 404);

  // ---- Criação: domínio configurável, código curto livre, aviso de nome em uso
  process.env.LINK_BASE_URL = "https://dc.link";
  let nomeEmUso = false, codigosUsados: string[] = [], gravado: any = null;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)), metodo = init?.method ?? "GET";
    assert.equal(u.origin, origin);
    if (u.pathname === "/auth/v1/user") return json({ id: UID });
    if (u.pathname.endsWith("/app_admins")) return json({ user_id: UID });
    if (u.pathname.endsWith("/sap_clinicas")) return json({ whatsapp_numero: "67999991234" });
    assert.ok(u.pathname.endsWith("/links_rastreados"), u.pathname);
    if (metodo === "GET" && u.searchParams.has("or")) return json(nomeEmUso ? [{ id: "outro" }] : []);
    if (metodo === "GET" && u.searchParams.has("codigo_ref")) {
      const pedidos = /^in\.\((.*)\)$/.exec(u.searchParams.get("codigo_ref") ?? "")![1].split(",");
      return json(pedidos.filter((c) => codigosUsados.includes(c)).map((c) => ({ codigo_ref: c })));
    }
    gravado = JSON.parse(String(init?.body));
    return json({ id: LID });
  };
  let c = await chamar({ acao: "conferir", slug: "Juliana Bio" });
  assert.deepEqual(c.result, { alvo: "link_rastreado", ok: true, valido: true, slug: "juliana-bio", livre: true, url: "https://dc.link/r/juliana-bio" });
  nomeEmUso = true;
  assert.equal((await chamar({ acao: "conferir", slug: "juliana-bio" })).result.livre, false, "avisa que já existe");
  assert.equal((await chamar({ tipo: "bio", slug: "juliana-bio" })).status, 409);
  const ruim = await chamar({ acao: "conferir", slug: "x".repeat(30) });
  assert.equal(ruim.result.valido, false); assert.match(ruim.result.motivo, /no máximo 24/);
  assert.equal((await chamar({ tipo: "bio", slug: "x".repeat(30) })).status, 400);
  nomeEmUso = false;
  codigosUsados = candidatosCodigo(200); // muitos ocupados: ainda acha um livre ou avisa, nunca repete
  c = await chamar({ tipo: "bio", slug: "juliana-bio", frase: "Olá! Vim pelo Instagram" });
  if (c.status === 200) {
    assert.equal(c.result.url, "https://dc.link/r/juliana-bio");
    assert.ok(codigoCurtoValido(c.result.ref) && !codigosUsados.includes(c.result.ref));
    assert.equal(gravado.codigo_ref, c.result.ref);
    assert.equal(gravado.mensagem_modelo, `Olá! Vim pelo Instagram (${c.result.ref})`);
    assert.equal(decodeURIComponent(gravado.destino_url.split("text=")[1]), `Olá! Vim pelo Instagram (${c.result.ref})`);
  } else assert.equal(c.status, 503);
  codigosUsados = [];
  c = await chamar({ tipo: "story", slug: "mariela-story" });
  assert.equal(c.status, 200);
  assert.equal(gravado.mensagem_modelo, `${POSICOES.story.frase} (${c.result.ref})`);
  delete process.env.LINK_BASE_URL;
  assert.equal((await chamar({ tipo: "bio", slug: "juliana-qr" })).result.url, "https://dash.doctorcreator.com.br/r/juliana-qr", "sem variável: domínio padrão");

  // Edição da frase: mantém número e código.
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)), metodo = init?.method ?? "GET";
    if (u.pathname === "/auth/v1/user") return json({ id: UID });
    if (u.pathname.endsWith("/app_admins")) return json({ user_id: UID });
    if (metodo === "GET") return json({ id: LID, codigo_ref: "R27", destino_tipo: "whatsapp", destino_url: "https://wa.me/5567999991234?text=x" });
    gravado = JSON.parse(String(init?.body));
    assert.equal(u.searchParams.get("client_id"), `eq.${CID}`);
    return json(null);
  };
  c = await chamar({ acao: "frase", id: LID, frase: "Olá! Quero agendar com a Dra. Juliana" });
  assert.equal(c.result.mensagem, "Olá! Quero agendar com a Dra. Juliana (R27)");
  assert.equal(decodeURIComponent(gravado.destino_url.split("text=")[1]), "Olá! Quero agendar com a Dra. Juliana (R27)");
  assert.ok(gravado.destino_url.startsWith("https://wa.me/5567999991234?"));

  // ---- 5. atribuirLinks: 30 dias, grava link_id e o toque clique_link da pessoa
  let corte = "", patch: any = null, toque: any = null;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input)), metodo = init?.method ?? "GET";
    const tabela = u.pathname.split("/").at(-1);
    if (tabela === "toques") { assert.equal(metodo, "POST"); toque = JSON.parse(String(init?.body)); return json(null, 201); }
    assert.equal(u.searchParams.get("client_id"), `eq.${CID}`, "leituras e gravações da atribuição ficam na clínica");
    if (tabela === "links_rastreados") return json([{ id: LID, client_id: CID, codigo_ref: "R27", mensagem_modelo: "Olá! Vim pelo link da bio (R27)", criado_em: "2026-01-01T00:00:00Z", tipo: "bio", instagram_post_id: null }]);
    if (tabela === "conversas" && metodo === "GET") { corte = String(u.searchParams.get("iniciada_em")).replace(/^gte\./, ""); return json([{ id: CONV, iniciada_em: new Date(Date.now() - 20 * 86_400_000).toISOString(), pessoa_id: PID }]); }
    if (tabela === "conversas" && metodo === "PATCH") { patch = JSON.parse(String(init?.body)); return json({ id: CONV }); }
    if (tabela === "mensagens") return json([{ texto: "Olá! Vim pelo link da bio (R27)" }]);
    if (tabela === "link_cliques") return json([]);
    throw new Error(`chamada inesperada ${tabela}`);
  };
  const a = await atribuirLinks(db(), CID);
  assert.equal(a.atribuidas, 1); assert.deepEqual(a.por, { ref: 1 }); assert.equal(a.erros, undefined);
  const dias = (Date.now() - Date.parse(corte)) / 86_400_000;
  assert.ok(Math.abs(dias - DIAS_ATRIBUICAO) < 0.1 && DIAS_ATRIBUICAO === 30, `olha 30 dias (${dias})`);
  assert.deepEqual(patch, { link_id: LID, atribuicao: "ref", codigo_ref: "R27" });
  const t = Array.isArray(toque) ? toque[0] : toque;
  assert.equal(t.tipo, "clique_link"); assert.equal(t.link_id, LID); assert.equal(t.pessoa_id, PID);
  assert.equal(t.fonte, "link_proprio"); assert.equal(t.externo_id, `conversa:${CONV}`); assert.equal(t.origem_tipo, "bio");
  console.log("links piloto: ok");
} finally {
  globalThis.fetch = fetchAntes; console.error = errorAntes;
  for (const k of Object.keys(process.env)) if (!(k in envAntes)) delete process.env[k];
  Object.assign(process.env, envAntes);
}
