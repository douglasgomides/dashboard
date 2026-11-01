// Instagram certo por dia (auditoria de 01/11/2026): fuso da Califórnia por data (horário de verão dos EUA),
// "sem dado" no lugar de 0 seguidores, posts apagados, stories até o fim das 24 h, transcrição com o token da conta
// e comentários com respostas paginadas. Tudo com respostas fictícias; nada conecta à Meta nem ao banco real.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { janelaDoDia, laData, laDiasAtras, laMeiaNoiteMs, somarDias } from "../api/_lib/dia-meta";
import { diaCompleto, diasParaReler, gravarMetricasDiariasPelaGraph, guardarStories, lerSeguiramEDeixaram, marcarPostsRemovidos } from "../api/_lib/meta-graph-sync";
import { erroPermanenteDeTranscricao, transcreverReels } from "../api/_lib/transcrever-reels";
import { runMetaCommentsSync } from "../api/_lib/meta-comments-sync";

const origin = "https://dia-certo.supabase.invalid";
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const db = () => createClient(origin, "fictional-key", { auth: { persistSession: false, autoRefreshToken: false } });
const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const originalFetch = globalThis.fetch, originalNow = Date.now, originalEnv = { ...process.env };

function testFuso() {
  // Antes do fim do horário de verão (01/11/2026): meia-noite = 07:00 UTC. Depois: 08:00 UTC.
  assert.equal(laMeiaNoiteMs("2026-10-24"), Date.parse("2026-10-24T07:00:00Z"));
  assert.equal(laMeiaNoiteMs("2026-10-31"), Date.parse("2026-10-31T07:00:00Z"));
  assert.equal(laMeiaNoiteMs("2026-11-01"), Date.parse("2026-11-01T07:00:00Z"), "o dia da mudança começa ainda no horário de verão");
  assert.equal(laMeiaNoiteMs("2026-11-02"), Date.parse("2026-11-02T08:00:00Z"));
  // 01/11 tem 25 horas; 31/10 termina 1 s antes da meia-noite de 01/11.
  assert.deepEqual(janelaDoDia("2026-10-31"), { data: "2026-10-31", since: s("2026-10-31T07:00:00Z"), until: s("2026-11-01T07:00:00Z") - 1 });
  const nov1 = janelaDoDia("2026-11-01");
  assert.equal(nov1.until - nov1.since + 1, 25 * 3600);
  // Segundo domingo de março (08/03/2026): começa no horário de inverno (08:00 UTC) e tem 23 horas.
  assert.equal(laMeiaNoiteMs("2026-03-07"), Date.parse("2026-03-07T08:00:00Z"));
  assert.equal(laMeiaNoiteMs("2026-03-08"), Date.parse("2026-03-08T08:00:00Z"));
  assert.equal(laMeiaNoiteMs("2026-03-09"), Date.parse("2026-03-09T07:00:00Z"));
  const mar8 = janelaDoDia("2026-03-08");
  assert.equal(mar8.until - mar8.since + 1, 23 * 3600);
  // O erro antigo: "meia-noite de hoje menos k×24h". Em 01/11 à tarde, o dia 24/10 começava às 08:00 UTC (1 h depois)
  // e a janela entrava 59 min no dia 25. Agora cada data tem a sua meia-noite.
  const agora = Date.parse("2026-11-01T15:00:00Z");
  assert.equal(laData(agora), "2026-11-01");
  assert.equal(laDiasAtras(8, agora), "2026-10-24");
  const antigo = laMeiaNoiteMs("2026-11-02") - 9 * 86_400_000; // hoje(02/11) - 9 dias pelo método antigo
  assert.notEqual(antigo, laMeiaNoiteMs("2026-10-24"));
  // Toda janela de 120 dias para trás cobre o tempo sem buraco nem sobreposição, atravessando as duas mudanças.
  for (let d = "2026-01-01"; d < "2027-01-01"; d = somarDias(d, 1)) {
    assert.equal(janelaDoDia(d).until + 1, janelaDoDia(somarDias(d, 1)).since, `janela contínua em ${d}`);
    assert.equal(laData(laMeiaNoiteMs(d)), d);
  }
}

function testCompletude() {
  assert.equal(diaCompleto({ date: "d", reach: 900, new_followers: 12, unfollowers: 3 }), true);
  assert.equal(diaCompleto({ date: "d", reach: 900, new_followers: 0, unfollowers: null }), false, "0 novos com saídas vazias (Windsor) é incompleto");
  assert.equal(diaCompleto({ date: "d", reach: 133_473, new_followers: 0, unfollowers: 0 }), false, "0 e 0 com alcance alto é incompleto");
  assert.equal(diaCompleto({ date: "d", reach: 120, new_followers: 0, unfollowers: 0 }), true, "conta pequena pode ter dia sem movimento");
  assert.equal(diaCompleto({ date: "d", reach: null, new_followers: 5, unfollowers: 1 }), false);
  assert.equal(diaCompleto({ date: "d", reach: 0, new_followers: 0, unfollowers: 2 }), false);

  const completos = new Set(Array.from({ length: 130 }, (_, i) => somarDias("2026-11-02", -i)));
  const alvo = diasParaReler("2026-11-02", completos, "2026-10-24");
  assert.deepEqual(alvo.slice(0, 7), ["2026-10-31", "2026-10-30", "2026-10-29", "2026-10-28", "2026-10-27", "2026-10-26", "2026-10-25"]);
  assert.deepEqual(alvo.slice(7), ["2026-10-24"], "reler_desde força os dias já 'completos' que saíram dos 7 recentes");
  assert.equal(new Set(alvo).size, alvo.length, "sem dia repetido");
  assert.equal(diasParaReler("2026-11-02", completos).length, 7);
  assert.equal(diasParaReler("2026-11-02", completos, "2025-01-01").length, 7 + 60, "releitura forçada limitada por rodada");
}

async function testMetricasDiarias() {
  Date.now = () => Date.parse("2026-11-01T15:00:00Z");
  const pedidos: { since: number; until: number; metric: string }[] = [];
  const gravadas = new Map<string, Record<string, unknown>>();
  const vazio = janelaDoDia("2026-10-25").since, falha = janelaDoDia("2026-10-26").since;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      if ((init?.method ?? "GET") === "GET") return json([]);
      for (const row of JSON.parse(String(init?.body)) as Record<string, unknown>[]) gravadas.set(String(row.date), row);
      return json(null);
    }
    assert.equal(u.hostname, "graph.facebook.com");
    const since = Number(u.searchParams.get("since")), until = Number(u.searchParams.get("until"));
    const metric = u.searchParams.get("metric")!;
    pedidos.push({ since, until, metric });
    if (metric === "follows_and_unfollows") {
      if (since === falha) return json({ error: { message: "erro fictício" } }, 500);
      if (since === vazio) return json({ data: [{ name: "follows_and_unfollows", total_value: { breakdowns: [{ results: [] }] } }] });
      return json({ data: [{ name: "follows_and_unfollows", total_value: { breakdowns: [{ results: [{ dimension_values: ["FOLLOWER"], value: 7 }] }] } }] });
    }
    return json({ data: metric.split(",").map((name) => ({ name, total_value: { value: name === "reach" ? 422 : 1 } })) });
  };
  const erros = await gravarMetricasDiariasPelaGraph(db(), "ig", "account", "client", "token", "2026-10-24");
  assert.deepEqual(erros, []);
  for (const p of pedidos) {
    const dia = laData(p.since * 1000);
    assert.deepEqual({ since: p.since, until: p.until }, { since: janelaDoDia(dia).since, until: janelaDoDia(dia).until }, `janela exata de ${dia}`);
  }
  assert.ok(pedidos.some((p) => p.since === s("2026-10-24T07:00:00Z") && p.until === s("2026-10-25T07:00:00Z") - 1), "24/10 é pedido com a meia-noite do horário de verão");
  assert.equal(gravadas.get("2026-10-24")?.reach, 422);
  assert.equal(gravadas.get("2026-10-24")?.new_followers, 7);
  assert.equal(gravadas.get("2026-10-24")?.unfollowers, 0, "com o detalhamento presente, o tipo ausente é zero");
  const d25 = gravadas.get("2026-10-25")!;
  assert.ok("new_followers" in d25 && d25.new_followers === null && d25.unfollowers === null, "resposta sem detalhamento vira null, não 0");
  const d26 = gravadas.get("2026-10-26")!;
  assert.ok(!("new_followers" in d26) && !("unfollowers" in d26), "erro na chamada preserva o valor anterior");
  assert.equal(d26.reach, 422);

  globalThis.fetch = async () => json({ data: [] });
  assert.deepEqual(await lerSeguiramEDeixaram("token", "ig", 1, 2), { status: "vazio" });
}

async function testPostsRemovidos() {
  const banco = [
    { id: "p1", windsor_media_id: "m1", posted_at: "2026-10-30T12:00:00Z", removido_em: null as string | null },
    { id: "p2", windsor_media_id: "m2", posted_at: "2026-10-29T12:00:00Z", removido_em: null as string | null },
    { id: "p3", windsor_media_id: "m3", posted_at: "2026-10-28T12:00:00Z", removido_em: "2026-10-31T00:00:00Z" as string | null },
    { id: "p4", windsor_media_id: "m4", posted_at: "2026-09-01T12:00:00Z", removido_em: null as string | null },
  ];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    assert.equal(u.origin, origin);
    assert.equal(u.searchParams.get("instagram_account_id") ?? "eq.account", "eq.account");
    const method = init?.method ?? "GET";
    if (method === "GET") {
      const desde = u.searchParams.get("posted_at")?.replace(/^gte\./, "");
      return json(banco.filter((p) => p.removido_em === null && (!desde || p.posted_at >= desde)).map(({ id, windsor_media_id }) => ({ id, windsor_media_id })));
    }
    assert.equal(method, "PATCH");
    const patch = JSON.parse(String(init?.body));
    const ids = u.searchParams.get("id")?.match(/in\.\((.*)\)/)?.[1].split(",");
    const midias = u.searchParams.get("windsor_media_id")?.match(/in\.\((.*)\)/)?.[1].split(",");
    for (const p of banco) if ((ids && ids.includes(p.id)) || (midias && midias.includes(p.windsor_media_id) && p.removido_em !== null)) p.removido_em = patch.removido_em;
    return json(null);
  };
  // A Meta devolveu m1 e m3 (m3 tinha sido arquivado e voltou); m2 sumiu dentro do intervalo; m4 é mais antigo que a listagem.
  const r = await marcarPostsRemovidos(db(), "account", [{ id: "m1", timestamp: "2026-10-30T12:00:00+0000" }, { id: "m3", timestamp: "2026-10-28T12:00:00+0000" }], false);
  assert.deepEqual(r, { removidos: 1, errors: [] });
  assert.ok(banco.find((p) => p.id === "p2")!.removido_em, "post que sumiu da listagem é marcado");
  assert.equal(banco.find((p) => p.id === "p3")!.removido_em, null, "post que voltou perde a marca");
  assert.equal(banco.find((p) => p.id === "p4")!.removido_em, null, "post fora do intervalo listado não é marcado");
  assert.equal(banco.find((p) => p.id === "p1")!.removido_em, null);
  // Listagem vazia não marca nada; sumiço em massa é tratado como resposta suspeita.
  assert.deepEqual(await marcarPostsRemovidos(db(), "account", [], true), { removidos: 0, errors: [] });
  for (let i = 0; i < 20; i++) banco.push({ id: `x${i}`, windsor_media_id: `mx${i}`, posted_at: "2026-10-30T13:00:00Z", removido_em: null });
  const massa = await marcarPostsRemovidos(db(), "account", [{ id: "m1", timestamp: "2026-10-30T12:00:00+0000" }], false);
  assert.equal(massa.removidos, 0);
  assert.match(massa.errors[0], /nada foi marcado/);
  assert.ok(banco.filter((p) => p.id.startsWith("x")).every((p) => p.removido_em === null));
}

async function testStories() {
  Date.now = originalNow;
  const upserts: Record<string, unknown>[][] = [];
  const insightsPedidos: string[] = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      if ((init?.method ?? "GET") === "GET") {
        assert.ok(u.searchParams.get("posted_at")?.startsWith("gte."), "relê só os stories dentro de 24 h + margem");
        return json([{ ig_media_id: "s1" }, { ig_media_id: "s2" }]);
      }
      upserts.push(JSON.parse(String(init?.body)));
      return json(null);
    }
    if (u.pathname.endsWith("/stories")) {
      if (!u.searchParams.get("after")) return json({ data: [{ id: "s1", timestamp: "2026-11-01T10:00:00+0000" }], paging: { next: "https://graph.facebook.com/next", cursors: { after: "c2" } } });
      return json({ data: [{ id: "s3", timestamp: "2026-11-01T11:00:00+0000" }] });
    }
    const id = u.pathname.split("/").at(-2)!;
    insightsPedidos.push(id);
    if (id === "s1") return json({ data: [{ name: "reach", values: [{ value: 50 }] }, { name: "views", values: [] }] });
    if (id === "s2") return json({ data: [{ name: "reach", values: [{ value: 80 }] }, { name: "views", values: [{ value: 120 }] }] });
    return json({ error: { message: "fora do ar" } }, 400);
  };
  assert.deepEqual(await guardarStories(db(), "ig", "account", "client", "token"), []);
  assert.deepEqual(insightsPedidos.sort(), ["s1", "s2", "s3"], "lista paginada e o story que saiu da lista ainda é relido");
  const linhas = upserts.flat();
  const s1 = linhas.find((l) => l.ig_media_id === "s1")!;
  assert.equal(s1.reach, 50);
  assert.ok(!("views" in s1), "métrica ausente não vira 0 nem apaga a anterior");
  const s2 = linhas.find((l) => l.ig_media_id === "s2")!;
  assert.equal(s2.views, 120);
  assert.ok(s2.metrics_updated_at);
  const s3 = linhas.find((l) => l.ig_media_id === "s3")!;
  assert.ok(!("reach" in s3) && !("metrics_updated_at" in s3), "story sem leitura de métrica não finge uma leitura nova");
  assert.ok(upserts.every((g) => g.every((l) => Object.keys(l).sort().join() === Object.keys(g[0]).sort().join())), "um lote por conjunto de colunas");
}

async function testTranscricao() {
  process.env.META_ACCESS_TOKEN = "token-global-ficticio";
  process.env.OPENAI_API_KEY = "chave-ficticia";
  const CID = "22222222-2222-4222-8222-222222222222";
  const patches: Record<string, unknown>[] = [];
  const tokensUsados: string[] = [];
  let graphStatus = 400, graphCode = 190;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      const table = u.pathname.split("/").at(-1);
      if ((init?.method ?? "GET") === "GET") {
        if (table === "instagram_account_secrets") return json([{ instagram_account_id: "conta", meta_access_token: "token-da-conta-ficticio" }]);
        assert.equal(u.searchParams.get("removido_em"), "is.null", "post apagado não é transcrito");
        assert.match(u.searchParams.get("or") ?? "", /transcricao_proxima_em\.is\.null/);
        return json([{ id: "post", client_id: CID, instagram_account_id: "conta", windsor_media_id: "123" }]);
      }
      if (table === "ia_execucoes") return json(null);
      patches.push(JSON.parse(String(init?.body)));
      return json(null);
    }
    if (u.hostname === "graph.facebook.com") {
      tokensUsados.push(u.searchParams.get("access_token")!);
      if (graphStatus !== 200) return json({ error: { code: graphCode, error_subcode: graphCode === 100 ? 33 : undefined, message: "fictício" } }, graphStatus);
      return json({ media_type: "VIDEO", media_url: "https://video.fixture.fbcdn.net/reel.mp4" });
    }
    if (u.hostname === "video.fixture.fbcdn.net") return new Response(new Uint8Array([1, 2, 3]));
    return json({ error: "chave inválida" }, 401);
  };
  let r = await transcreverReels(db(), 10_000, 1, CID);
  assert.deepEqual(tokensUsados, ["token-da-conta-ficticio"], "usa o token da conta, não o global");
  assert.equal(r.feitas, 0);
  assert.ok(patches[0].transcricao_proxima_em && !("transcricao_em" in patches[0]), "token inválido é passageiro: tenta de novo depois");
  graphCode = 100;
  r = await transcreverReels(db(), 10_000, 1, CID);
  assert.ok(patches[1].transcricao_em && patches[1].transcricao_proxima_em === null, "post que não existe mais é permanente");
  graphStatus = 200;
  r = await transcreverReels(db(), 10_000, 1, CID);
  assert.ok(!("transcricao_em" in patches[2]) && patches[2].transcricao_proxima_em, "401 da transcrição é passageiro");
  assert.equal(erroPermanenteDeTranscricao("Graph respondeu 400 (código 190) ao pedir o vídeo"), false);
  assert.equal(erroPermanenteDeTranscricao("transcrição respondeu 401"), false);
  assert.equal(erroPermanenteDeTranscricao("sem arquivo de vídeo disponível"), true);
  assert.equal(erroPermanenteDeTranscricao("vídeo acima de 25 MB"), true);
}

async function testComentarios() {
  let estado = 0;
  const gravados: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.origin === origin) {
      const table = u.pathname.split("/").at(-1);
      if (init?.method === "POST") {
        if (table === "instagram_comments") gravados.push(...JSON.parse(String(init.body)));
        if (table === "instagram_comments_sync_state") estado++;
        return json(null);
      }
      if (table === "instagram_accounts") return json([{ id: "account", client_id: "client" }]);
      if (table === "instagram_account_secrets") return json([]);
      if (table === "instagram_comments_sync_state") return json(null);
      if (table === "instagram_posts") {
        assert.equal(u.searchParams.get("removido_em"), "is.null");
        return json([{ id: "ok", windsor_media_id: "m-ok", posted_at: "2026-10-02T10:00:00Z" }, { id: "ruim", windsor_media_id: "m-ruim", posted_at: "2026-10-01T10:00:00Z" }]);
      }
      throw new Error(`leitura inesperada ${table}`);
    }
    assert.equal(u.hostname, "graph.facebook.com");
    if (init?.method === "POST") {
      const lote = JSON.parse(new URLSearchParams(String(init.body)).get("batch")!) as { relative_url: string }[];
      return json(lote.map((b) => b.relative_url.startsWith("m-ruim")
        ? { code: 500, body: "{}" }
        : { code: 200, body: JSON.stringify({ data: [{ id: "c1", text: "Pergunta?", replies: { data: [{ id: "r1", text: "resposta 1" }], paging: { next: "https://graph.facebook.com/v26.0/c1/replies?after=x" } } }] }) }));
    }
    assert.match(u.pathname, /\/c1\/replies$/);
    return json({ data: [{ id: "r51", text: "resposta 51" }] });
  };
  const r = (await runMetaCommentsSync({ accessToken: "token", supabaseUrl: origin, supabaseServiceRoleKey: "k" }))[0];
  assert.deepEqual(gravados.map((g) => g.external_comment_id).sort(), ["c1", "r1", "r51"], "respostas além da 1ª página são seguidas");
  assert.equal(estado, 1, "um post com erro não trava o histórico da conta");
  assert.deepEqual(r.failedPosts, ["ruim"]);
  assert.ok(r.errors.some((e) => e.includes("ruim")));
}

try {
  testFuso();
  testCompletude();
  await testMetricasDiarias();
  await testPostsRemovidos();
  await testStories();
  await testTranscricao();
  await testComentarios();
  console.log("ok instagram-dia-certo (fuso por data, sem dado ≠ 0, posts removidos, stories, transcrição e comentários)");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}
