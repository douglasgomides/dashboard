// Limites e paginação conferidos na doc oficial (01/11/2026): Meta (uso e códigos de limite, 4 trocas de orçamento por
// hora), Helena/WTS (200/5 s e 1.000/5 min por conta, ordem das mensagens, sessões v2), Clint (canal cancelado, janela
// das conversas) e RD (visibilidade do token). Sem rede: fetch simulado, dados fictícios.
import assert from "node:assert/strict";
import {
  codigoDeLimiteMeta, ehLimiteMeta, fetchMeta, lerUsoMeta, limiteNoLote, limparBloqueiosMeta, MetaLimiteError,
} from "../api/_lib/meta-limite";
import { podeTrocarOrcamento, trocasDeOrcamentoNaHora, TROCAS_ORCAMENTO_POR_HORA, type MudancaOrcamento } from "../src/lib/anuncios-acoes";
import { aplicarAcao } from "../api/_lib/anuncios-acoes";
import { definirDormirRetry, esperaDasJanelas, fetchComRetry, limparRitmos, ritmoHelena, RitmoEsgotadoError } from "../api/_lib/integration-http";
import { esquecerVersaoSessoesWts, listarSessoesWts } from "../api/_lib/wts-sync";
import { lerPaginaMensagens, QUERY_MENSAGENS_WTS } from "../api/_lib/conversas-wts";
import { avisoCanaisClint, proximaJanelaClint } from "../api/_lib/conversas-clint";
import { avisoVisibilidadeRd } from "../api/_lib/rdstation-sync";

const originalFetch = globalThis.fetch;
const h = (o: Record<string, unknown>) => JSON.stringify(o);
const resp = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...headers } });

try {
  // ---------- Meta: cabeçalhos de uso
  assert.deepEqual(lerUsoMeta(new Headers()), { pct: null, esperaMin: null, doApp: false });
  const uso = lerUsoMeta(new Headers({
    "x-app-usage": h({ call_count: 12, total_cputime: 30, total_time: 20 }),
    "x-ad-account-usage": h({ acc_id_util_pct: 41.5, reset_time_duration: 125 }),
    "x-business-use-case-usage": h({ "123": [{ type: "ads_insights", call_count: 95, total_cputime: 10, total_time: 10, estimated_time_to_regain_access: 7 }] }),
  }));
  assert.equal(uso.pct, 95);
  assert.equal(uso.esperaMin, 7, "maior espera entre reset (3 min) e estimated_time_to_regain_access (7)");
  assert.equal(uso.doApp, false);
  assert.equal(lerUsoMeta(new Headers({ "x-app-usage": "não é json" })).pct, null, "cabeçalho ilegível não derruba");
  assert.equal(lerUsoMeta(new Headers({ "x-fb-ads-insights-throttle": h({ app_id_util_pct: 92, acc_id_util_pct: 3 }) })).doApp, true);
  for (const c of [4, 17, 32, 613, 80000, 80004, 80014]) assert.ok(codigoDeLimiteMeta(c), String(c));
  for (const c of [1, 10, 100, 190, 200, 80015, "x", null]) assert.ok(!codigoDeLimiteMeta(c), String(c));
  assert.equal(limiteNoLote({ code: 400, body: h({ error: { code: 613 } }) }), 613);
  assert.equal(limiteNoLote({ code: 400, body: h({ error: { code: 100 } }) }), null);
  assert.equal(limiteNoLote({ code: 200, body: "{}" }), null);

  // ---------- Meta: para no erro de limite, respeita a espera e não insiste
  limparBloqueiosMeta();
  const pedidos: string[] = [];
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    pedidos.push(u.searchParams.get("access_token") ?? "");
    if (u.searchParams.get("access_token") === "token-ficticio-a") {
      return resp(400, { error: { code: 17, message: "User request limit reached" } },
        { "x-business-use-case-usage": h({ "1": [{ type: "ads_management", call_count: 100, estimated_time_to_regain_access: 7 }] }) });
    }
    if (u.searchParams.get("access_token") === "token-ficticio-cheio") return resp(200, { data: [] }, { "x-ad-account-usage": h({ acc_id_util_pct: 93 }) });
    if (u.searchParams.get("access_token") === "token-ficticio-app") return resp(400, { error: { code: 4, message: "Application request limit reached" } });
    return resp(200, { data: [] });
  };
  const urlA = "https://graph.facebook.com/v26.0/act_1/insights?access_token=token-ficticio-a";
  await assert.rejects(() => fetchMeta(urlA), (e: unknown) => {
    assert.ok(e instanceof MetaLimiteError && ehLimiteMeta(e));
    assert.match((e as Error).message, /código 17/);
    assert.match((e as Error).message, /cerca de 7 min/);
    assert.ok(!(e as Error).message.includes("token-ficticio"), "o token nunca vai para a mensagem");
    return true;
  });
  await assert.rejects(() => fetchMeta(urlA), /pausadas/);
  assert.equal(pedidos.filter((t) => t === "token-ficticio-a").length, 1, "não chama de novo durante a pausa");
  const outro = await fetchMeta("https://graph.facebook.com/v26.0/act_2/insights?access_token=token-ficticio-b");
  assert.equal(outro.status, 200, "outro token segue normal");
  // POST em lote: o token vem no corpo.
  await assert.rejects(() => fetchMeta("https://graph.facebook.com/v26.0/", { method: "POST", body: new URLSearchParams({ access_token: "token-ficticio-a" }) }), /código 17/);
  // Uso acima de 90%: a resposta vale, as próximas chamadas daquele token esperam.
  const cheio = "https://graph.facebook.com/v26.0/act_3?access_token=token-ficticio-cheio";
  assert.equal((await fetchMeta(cheio)).status, 200);
  await assert.rejects(() => fetchMeta(cheio), /uso em 93% do limite da conta/);
  // Código 4 é do aplicativo: pausa todos os tokens.
  await assert.rejects(() => fetchMeta("https://graph.facebook.com/v26.0/me?access_token=token-ficticio-app"), /código 4/);
  await assert.rejects(() => fetchMeta("https://graph.facebook.com/v26.0/me?access_token=token-ficticio-b"), /código 4/);
  limparBloqueiosMeta();

  // ---------- Meta: 4 trocas de orçamento por hora por conjunto
  const agora = Date.parse("2026-11-01T12:00:00Z");
  const t = (min: number) => new Date(agora - min * 60_000).toISOString();
  const troca = (ids: string[], min: number, desfeitaMin?: number) => ({
    tipo: "orcamento", estado: desfeitaMin != null ? "desfeita" : "aplicada",
    antes: { orcamentos: ids.map((id) => ({ id })) }, depois: { orcamentos: ids.map((id) => ({ id })) },
    aplicado_em: t(min), desfeito_em: desfeitaMin != null ? t(desfeitaMin) : null,
  });
  const hist: MudancaOrcamento[] = [troca(["c1", "c2"], 50, 40), troca(["c1"], 30), troca(["c1"], 10), troca(["c2"], 70), { tipo: "pausar", estado: "aplicada", aplicado_em: t(5) }];
  const conta = trocasDeOrcamentoNaHora(hist, agora);
  assert.equal(conta.get("c1"), 4, "aplicar e desfazer contam como duas trocas");
  assert.equal(conta.get("c2"), 2, "troca de mais de 1 h atrás não conta");
  assert.equal(TROCAS_ORCAMENTO_POR_HORA, 4);
  assert.equal(podeTrocarOrcamento(["c2"], hist, agora).ok, true);
  const recusa = podeTrocarOrcamento(["c1", "c2"], hist, agora);
  assert.equal(recusa.ok, false);
  assert.match(recusa.motivo!, /só aceita 4 trocas de orçamento por hora/);
  assert.match(recusa.motivo!, /daqui a uma hora/);

  // aplicarAcao recusa sem chamar a Meta para gravar e sem registrar falha.
  process.env.META_ADS_WRITE_TOKEN = "token-ficticio-escrita";
  const escritas: string[] = [];
  const inseridos: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (init?.method === "POST") { escritas.push(u.pathname); return resp(200, { success: true }); }
    if (u.pathname.endsWith("/camp1")) return resp(200, { status: "ACTIVE" });
    if (u.pathname.endsWith("/camp1/adsets")) return resp(200, { data: [{ id: "c1", status: "ACTIVE", daily_budget: "5000" }] });
    throw new Error(`pedido inesperado ${u.pathname}`);
  };
  const recentes = hist.filter((x) => x.tipo === "orcamento").map((x) => ({ ...x, aplicado_em: new Date(Date.now() - (agora - Date.parse(x.aplicado_em!))).toISOString(), desfeito_em: x.desfeito_em ? new Date(Date.now() - (agora - Date.parse(x.desfeito_em))).toISOString() : null }));
  const consulta = (linhas: unknown) => {
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, or: () => q,
      maybeSingle: async () => ({ data: linhas, error: null }), then: (ok: any) => ok({ data: linhas, error: null }) };
    return q;
  };
  const admin: any = {
    from(tabela: string) {
      if (tabela === "meta_ads_campaigns") return consulta({ campaign_id: "camp1" });
      if (tabela === "anuncios_mudancas") {
        const q = consulta(recentes);
        q.limit = () => consulta([]); // histórico do podeAplicar (24 h): vazio
        q.insert = (linha: unknown) => { inseridos.push(linha); return { select: () => ({ single: async () => ({ data: { id: "x" } }) }) }; };
        return q;
      }
      throw new Error(`tabela inesperada ${tabela}`);
    },
  };
  const r = await aplicarAcao(admin, { clientId: "cliente", campanhaId: "camp1", tipo: "orcamento", pct: 20, userId: "u" });
  assert.equal(r.ok, false);
  assert.match(String(r.erro), /4 trocas de orçamento por hora/);
  assert.deepEqual(escritas, [], "nada foi gravado na Meta");
  assert.deepEqual(inseridos, [], "recusa não vira linha de falha");
  delete process.env.META_ADS_WRITE_TOKEN;

  // ---------- Helena/WTS: janelas de 200/5 s e 1.000/5 min por conta
  assert.equal(esperaDasJanelas([], [{ max: 2, ms: 1000 }], 5000), 0);
  assert.equal(esperaDasJanelas([4500, 4800], [{ max: 2, ms: 1000 }], 5000), 500, "espera o mais antigo sair da janela");
  assert.equal(esperaDasJanelas([3000, 4800], [{ max: 2, ms: 1000 }], 5000), 0);
  const rh = ritmoHelena("pn_token_ficticio");
  assert.ok(!rh.chave.includes("pn_token_ficticio"), "a chave do ritmo não guarda o token");
  assert.equal(rh.chave, ritmoHelena("pn_token_ficticio").chave, "mesma conta, mesma chave (sessões, mensagens e cards)");
  assert.ok(rh.porSegundo * 5 < 200 && rh.janelas!.every((j) => (j.ms === 5_000 ? j.max < 200 : j.max < 1000)));
  limparRitmos();
  const dormidas: number[] = [];
  const dormirAntes = definirDormirRetry(async (ms) => { dormidas.push(ms); });
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; return resp(200, {}); };
  const ritmo = { chave: "helena:teste", porSegundo: 1000, janelas: [{ max: 5, ms: 300_000 }] };
  for (let i = 0; i < 5; i++) await fetchComRetry("https://api.wts.chat/core/v1/tag", {}, { ritmo });
  await assert.rejects(() => fetchComRetry("https://api.wts.chat/core/v1/tag", {}, { ritmo }), (e: unknown) => {
    assert.ok(e instanceof RitmoEsgotadoError);
    assert.match((e as Error).message, /limite de 5 pedidos em 300 s da conta/);
    return true;
  });
  assert.equal(chamadas, 5, "o 6º pedido não sai: esperar 5 min estouraria a função");
  // Janela curta: espera em vez de falhar.
  limparRitmos(); dormidas.length = 0;
  const curto = { chave: "helena:curto", porSegundo: 1000, janelas: [{ max: 2, ms: 5_000 }] };
  for (let i = 0; i < 3; i++) await fetchComRetry("https://api.wts.chat/core/v1/tag", {}, { ritmo: curto });
  assert.ok(dormidas.some((ms) => ms > 4_000 && ms <= 5_000), `esperou a janela de 5 s: ${dormidas}`);
  definirDormirRetry(dormirAntes);
  limparRitmos();

  // Sessões: v2 (documentada) com volta à v1 no 404.
  esquecerVersaoSessoesWts();
  const caminhos: string[] = [];
  const getFalso = (v2: number) => async <R,>(_t: string, path: string): Promise<R> => {
    caminhos.push(path);
    if (path.startsWith("/chat/v2/") && v2 !== 200) throw Object.assign(new Error(`WTS respondeu ${v2}`), { status: v2 });
    return { items: [], hasMorePages: false } as R;
  };
  await listarSessoesWts("tk-v2", "PageSize=100&PageNumber=1", getFalso(200));
  assert.deepEqual(caminhos, ["/chat/v2/session?PageSize=100&PageNumber=1"]);
  caminhos.length = 0;
  await listarSessoesWts("tk-v1", "PageSize=100&PageNumber=1", getFalso(404));
  await listarSessoesWts("tk-v1", "PageSize=100&PageNumber=2", getFalso(404));
  assert.deepEqual(caminhos, ["/chat/v2/session?PageSize=100&PageNumber=1", "/chat/v1/session?PageSize=100&PageNumber=1", "/chat/v1/session?PageSize=100&PageNumber=2"], "lembra a v1 depois do 404");
  await assert.rejects(() => listarSessoesWts("tk-500", "PageSize=100", getFalso(500)), /500/, "só o 404 volta para a v1");

  // Mensagens com ordem explícita; conta que recusa a ordem (400) é lida como antes.
  assert.match(QUERY_MENSAGENS_WTS, /OrderBy=createdAt&OrderDirection=ASCENDING/);
  const lidos: string[] = [];
  await lerPaginaMensagens("tk", "sessao 1", 1, async (_t, c) => { lidos.push(c); return { items: [] }; });
  assert.deepEqual(lidos, [`/chat/v1/session/sessao%201/message?${QUERY_MENSAGENS_WTS}&PageNumber=1`]);
  lidos.length = 0;
  await lerPaginaMensagens("tk", "s2", 1, async (_t, c) => { lidos.push(c); if (c.includes("OrderBy")) throw new Error("WTS /chat/v1/session/s2/message respondeu 400"); return { items: [] }; });
  assert.deepEqual(lidos.map((c) => c.includes("OrderBy")), [true, false]);

  // ---------- Clint: canal cancelado e janela que encolhe
  assert.equal(avisoCanaisClint([], []), null);
  assert.match(avisoCanaisClint(["Instagram A"], ["WhatsApp B", "WhatsApp C"])!, /^Clint: canal desconectado: "Instagram A"; canais cancelados: "WhatsApp B", "WhatsApp C"\./);
  assert.match(avisoCanaisClint([], ["X"])!, /^Clint: canal cancelado: "X"/);
  const cursor = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z", page: 1, index: 7 };
  const desc = [{ last_message_at: "2026-10-31T10:00:00.000Z" }, { last_message_at: "2026-10-20T10:00:00.000Z" }];
  assert.deepEqual(proximaJanelaClint(cursor, desc), { ...cursor, to: "2026-10-20T10:00:00.001Z", page: 1, index: 0 },
    "fim da janela vira a última conversa lida e volta à página 1 (nada pula quando a lista muda)");
  assert.deepEqual(proximaJanelaClint(cursor, [...desc].reverse()), { ...cursor, page: 2, index: 0 }, "fora de ordem: segue por página");
  const iguais = [{ last_message_at: "2026-10-31T23:59:59.999Z" }, { last_message_at: "2026-10-31T23:59:59.999Z" }];
  assert.equal(proximaJanelaClint({ ...cursor, to: "2026-11-01T00:00:00.000Z" }, iguais).page, 2, "sem progresso: segue por página (não trava)");

  // ---------- RD: indício de token sem visibilidade Geral
  const deUm = Array.from({ length: 30 }, () => ({ user: { _id: "u1" } }));
  assert.match(avisoVisibilidadeRd(deUm, 3)!, /30 negociações lidas são todas de um só responsável, mas a conta tem 3 usuários ativos/);
  assert.equal(avisoVisibilidadeRd(deUm, 1), null, "conta de um usuário só");
  assert.equal(avisoVisibilidadeRd(deUm, null), null, "sem a lista de usuários, sem aviso");
  assert.equal(avisoVisibilidadeRd(deUm.slice(0, 10), 3), null, "poucas negociações não provam nada");
  assert.equal(avisoVisibilidadeRd([...deUm, { user: { _id: "u2" } }], 3), null);
  assert.equal(avisoVisibilidadeRd([...deUm, { user: null }], 3), null);

  console.log("test-limites-apis: ok");
} finally {
  globalThis.fetch = originalFetch;
}
