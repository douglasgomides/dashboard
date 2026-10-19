// Testa o servidor das ações nos anúncios (api/_lib/anuncios-acoes.ts) com banco e Meta simulados, sem rede.
import assert from "node:assert/strict";
import { motivoRecusarDesfazer, reservaExpirada } from "../src/lib/anuncios-acoes";
import { aplicarAcao, desfazerAcao } from "../api/_lib/anuncios-acoes";

process.env.META_ADS_WRITE_TOKEN = "TOKEN-DE-TESTE";

// ---------- banco simulado (só o que o módulo usa) ----------
type Linha = Record<string, any>;
function criarBanco(inicial: Record<string, Linha[]> = {}) {
  const tabelas: Record<string, Linha[]> = { meta_ads_campaigns: [], anuncios_mudancas: [], sugestoes_agentes: [], ...inicial };
  let seq = 0;
  const reservado = (r: Linha) => r.estado === "em_andamento" || r.estado === "desfazendo";
  const conflito = (t: string, linha: Linha, ignorar?: Linha) =>
    t === "anuncios_mudancas" && reservado(linha) && tabelas[t].some((o) => o !== ignorar && o.campanha_id === linha.campanha_id && reservado(o));
  const banco = {
    tabelas,
    from(t: string) {
      const filtros: ((r: Linha) => boolean)[] = [];
      let modo: "select" | "insert" | "update" | "delete" = "select";
      let payload: any = null, devolve = false, unico: "single" | "maybe" | null = null;
      const q: any = {
        select() { if (modo === "select") modo = "select"; else devolve = true; return q; },
        insert(v: Linha) { modo = "insert"; payload = v; return q; },
        update(v: Linha) { modo = "update"; payload = v; return q; },
        delete() { modo = "delete"; return q; },
        eq(c: string, v: any) { filtros.push((r) => r[c] === v); return q; },
        neq(c: string, v: any) { filtros.push((r) => r[c] !== v); return q; },
        lt(c: string, v: any) { filtros.push((r) => r[c] != null && r[c] < v); return q; },
        gte(c: string, v: any) { filtros.push((r) => r[c] != null && r[c] >= v); return q; },
        single() { unico = "single"; return q; },
        maybeSingle() { unico = "maybe"; return q; },
        then(ok: any, ko: any) { return Promise.resolve(executar()).then(ok, ko); },
      };
      const executar = () => {
        const alvo = tabelas[t];
        let saida: Linha[] = [];
        if (modo === "insert") {
          const nova = { id: `id${++seq}`, criado_em: new Date().toISOString(), ...payload };
          if (conflito(t, nova)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          alvo.push(nova); saida = [nova];
        } else if (modo === "update") {
          const acertos = alvo.filter((r) => filtros.every((f) => f(r)));
          for (const r of acertos) {
            const depois = { ...r, ...payload };
            if (conflito(t, depois, r)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          for (const r of acertos) Object.assign(r, payload);
          saida = acertos;
        } else if (modo === "delete") {
          tabelas[t] = alvo.filter((r) => !filtros.every((f) => f(r)));
          saida = [];
        } else saida = alvo.filter((r) => filtros.every((f) => f(r)));
        if (unico === "single") return saida.length === 1 ? { data: saida[0], error: null } : { data: null, error: { message: "esperava 1 linha" } };
        if (unico === "maybe") return { data: saida[0] ?? null, error: null };
        return { data: modo === "select" || devolve ? saida : null, error: null };
      };
      return q;
    },
  };
  return banco;
}

// ---------- Meta simulada ----------
interface Obj { status?: string; daily_budget?: number; filhos?: string[] }
function criarMeta(objs: Record<string, Obj>, falharEm: string[] = [], atraso = 0) {
  const posts: { id: string; campos: Record<string, string> }[] = [];
  const urls: string[] = [];
  const headers: (string | undefined)[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    urls.push(url);
    headers.push(init?.headers?.Authorization);
    if (atraso) await new Promise((r) => setTimeout(r, atraso));
    const caminho = new URL(url).pathname.replace(/^\/v21\.0\//, "");
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if ((init?.method ?? "GET") === "POST") {
      const id = caminho;
      const campos = Object.fromEntries(new URLSearchParams(init.body as URLSearchParams));
      if (falharEm.includes(id)) return json({ error: { message: "rate limit" } }, 400);
      posts.push({ id, campos });
      if (campos.status) objs[id].status = campos.status;
      if (campos.daily_budget) objs[id].daily_budget = Number(campos.daily_budget);
      return json({ success: true });
    }
    if (caminho.endsWith("/adsets")) {
      const pai = caminho.replace("/adsets", "");
      return json({ data: (objs[pai].filhos ?? []).map((id) => ({ id, status: objs[id].status, daily_budget: String(objs[id].daily_budget) })) });
    }
    const o = objs[caminho];
    return json({ id: caminho, status: o.status, ...(o.daily_budget ? { daily_budget: String(o.daily_budget) } : {}) });
  }) as typeof fetch;
  return { posts, urls, headers };
}
const camp = (id = "c1", client = "cli") => ({ campaign_id: id, client_id: client });
const base = () => ({ meta_ads_campaigns: [camp()] });
const P = { clientId: "cli", campanhaId: "c1", userId: "u1" };

// 1) Orçamento +20% em dois conjuntos; token só no header; registro completo.
{
  const banco = criarBanco(base());
  const meta = criarMeta({ c1: { status: "ACTIVE", filhos: ["a1", "a2"] }, a1: { status: "ACTIVE", daily_budget: 5000 }, a2: { status: "ACTIVE", daily_budget: 10000 } });
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  assert.equal(r.ok, true);
  assert.deepEqual(meta.posts.map((p) => [p.id, p.campos.daily_budget]), [["a1", "6000"], ["a2", "12000"]]);
  assert.ok(meta.urls.every((u) => !u.includes("TOKEN-DE-TESTE") && !u.includes("access_token")), "token não pode ir na URL");
  assert.ok(meta.headers.every((h) => h === "Bearer TOKEN-DE-TESTE"), "token vai no header Authorization");
  const linha = banco.tabelas.anuncios_mudancas[0];
  assert.equal(linha.estado, "aplicada");
  assert.equal(linha.antes.orcamentos.length, 2);
  assert.equal(linha.depois.orcamentos[1].daily_budget, 12000);
}

// 2) Segunda ação na mesma campanha dentro de 24 h é bloqueada e não chama a Meta; a reserva some.
{
  const banco = criarBanco({ ...base(), anuncios_mudancas: [{ id: "x", campanha_id: "c1", client_id: "cli", estado: "aplicada", aplicado_em: new Date(Date.now() - 3_600_000).toISOString(), criado_em: new Date().toISOString() }] });
  const meta = criarMeta({ c1: { status: "ACTIVE", daily_budget: 5000 } });
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /24 h/);
  assert.equal(meta.posts.length, 0);
  assert.equal(banco.tabelas.anuncios_mudancas.length, 1, "reserva removida");
}

// 3) Falhas anteriores (sem aplicado_em) não escondem uma mudança aplicada recente.
{
  const falhas = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, campanha_id: "c1", client_id: "cli", estado: "falhou", aplicado_em: null, criado_em: new Date().toISOString() }));
  const aplicada = { id: "ok1", campanha_id: "c1", client_id: "cli", estado: "aplicada", aplicado_em: new Date(Date.now() - 600_000).toISOString(), criado_em: new Date().toISOString() };
  const banco = criarBanco({ ...base(), anuncios_mudancas: [...falhas, aplicada] });
  const meta = criarMeta({ c1: { status: "ACTIVE", daily_budget: 5000 } });
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  assert.equal(r.ok, false);
  assert.equal(meta.posts.length, 0);
}

// 4) Dois cliques ao mesmo tempo: só um passa.
{
  const banco = criarBanco(base());
  const meta = criarMeta({ c1: { status: "ACTIVE", daily_budget: 5000 } }, [], 15);
  const [a, b] = (await Promise.all([aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 }), aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 })])) as any[];
  assert.equal([a, b].filter((x) => x.ok).length, 1, "exatamente uma ação aplicada");
  assert.match([a, b].find((x) => !x.ok).erro, /em andamento/);
  assert.equal(meta.posts.length, 1, "a Meta recebeu uma escrita só");
}

// 5) Falha no meio: o conjunto que já mudou volta ao valor anterior e o registro fica como falhou.
{
  const banco = criarBanco(base());
  const objs = { c1: { status: "ACTIVE", filhos: ["a1", "a2"] }, a1: { status: "ACTIVE", daily_budget: 5000 }, a2: { status: "ACTIVE", daily_budget: 10000 } };
  const meta = criarMeta(objs, ["a2"]);
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  assert.equal(r.ok, false);
  assert.match(r.erro, /revertidas/);
  assert.equal(objs.a1.daily_budget, 5000, "a1 voltou ao valor original");
  assert.deepEqual(meta.posts.map((p) => [p.id, p.campos.daily_budget]), [["a1", "6000"], ["a1", "5000"]]);
  assert.equal(banco.tabelas.anuncios_mudancas[0].estado, "falhou");
}

// 6) Reserva presa há mais de 10 minutos não trava a campanha para sempre.
{
  const presa = { id: "p", campanha_id: "c1", client_id: "cli", estado: "em_andamento", aplicado_em: null, criado_em: new Date(Date.now() - 11 * 60_000).toISOString() };
  const banco = criarBanco({ ...base(), anuncios_mudancas: [presa] });
  criarMeta({ c1: { status: "ACTIVE", daily_budget: 5000 } });
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: -20 });
  assert.equal(r.ok, true);
  assert.equal(banco.tabelas.anuncios_mudancas.find((l) => l.id === "p")!.estado, "falhou");
}

// 7) Desfazer: funciona quando a Meta ainda está como a ação deixou.
{
  const banco = criarBanco(base());
  const objs = { c1: { status: "ACTIVE", daily_budget: 5000 } };
  const meta = criarMeta(objs);
  const feita: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  assert.equal(objs.c1.daily_budget, 6000);
  const r: any = await desfazerAcao(banco as any, { clientId: "cli", id: feita.id, userId: "u1" });
  assert.equal(r.ok, true);
  assert.equal(objs.c1.daily_budget, 5000);
  assert.equal(banco.tabelas.anuncios_mudancas[0].estado, "desfeita");
  assert.ok(meta.urls.every((u) => !u.includes("access_token")));
}

// 8) Desfazer recusa quando alguém mudou o orçamento na Meta depois da ação, e a ação continua desfazível.
{
  const banco = criarBanco(base());
  const objs = { c1: { status: "ACTIVE", daily_budget: 5000 } };
  const meta = criarMeta(objs);
  const feita: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  objs.c1.daily_budget = 9000; // mudança manual na Meta
  const antesDosPosts = meta.posts.length;
  const r: any = await desfazerAcao(banco as any, { clientId: "cli", id: feita.id, userId: "u1" });
  assert.equal(r.ok, false);
  assert.match(r.erro, /alterado depois/);
  assert.equal(meta.posts.length, antesDosPosts, "nada foi escrito na Meta");
  assert.equal(objs.c1.daily_budget, 9000, "a mudança manual foi preservada");
  assert.equal(banco.tabelas.anuncios_mudancas[0].estado, "aplicada", "reserva liberada");
}

// 9) Desfazer pausar recusa se a campanha foi reativada por fora.
{
  const banco = criarBanco(base());
  const objs = { c1: { status: "ACTIVE", daily_budget: 5000 } };
  criarMeta(objs);
  const feita: any = await aplicarAcao(banco as any, { ...P, tipo: "pausar" });
  assert.equal(objs.c1.status, "PAUSED");
  objs.c1.status = "ACTIVE";
  const r: any = await desfazerAcao(banco as any, { clientId: "cli", id: feita.id, userId: "u1" });
  assert.equal(r.ok, false);
  assert.match(r.erro, /status atual: ACTIVE/);
}

// 10) Dois desfazer simultâneos: só um executa.
{
  const banco = criarBanco(base());
  const objs = { c1: { status: "ACTIVE", daily_budget: 5000 } };
  const meta = criarMeta(objs, [], 10);
  const feita: any = await aplicarAcao(banco as any, { ...P, tipo: "orcamento", pct: 20 });
  const antes = meta.posts.length;
  const rs = (await Promise.all([desfazerAcao(banco as any, { clientId: "cli", id: feita.id, userId: "u1" }), desfazerAcao(banco as any, { clientId: "cli", id: feita.id, userId: "u2" })])) as any[];
  assert.equal(rs.filter((x) => x.ok).length, 1);
  assert.equal(meta.posts.length - antes, 1, "uma escrita de desfazer");
  assert.equal(objs.c1.daily_budget, 5000);
}

// 11) Campanha de outro cliente continua bloqueada.
{
  const banco = criarBanco({ meta_ads_campaigns: [camp("c1", "outro")] });
  const meta = criarMeta({ c1: { status: "ACTIVE", daily_budget: 5000 } });
  const r: any = await aplicarAcao(banco as any, { ...P, tipo: "pausar" });
  assert.equal(r.ok, false);
  assert.equal(meta.posts.length, 0);
}

// Regras puras.
assert.equal(motivoRecusarDesfazer("pausar", { status: "PAUSED" }, { status: "PAUSED", orcamentos: {} }), null);
assert.match(motivoRecusarDesfazer("orcamento", { orcamentos: [{ id: "a", nivel: "conjunto", daily_budget: 6000 }] }, { orcamentos: { a: 7000 } })!, /alterado depois/);
assert.match(motivoRecusarDesfazer("orcamento", { orcamentos: [{ id: "a", nivel: "conjunto", daily_budget: 6000 }] }, { orcamentos: {} })!, /nada foi desfeito/);
assert.equal(reservaExpirada(new Date(Date.now() - 11 * 60_000).toISOString()), true);
assert.equal(reservaExpirada(new Date(Date.now() - 2 * 60_000).toISOString()), false);

console.log("anuncios-acoes-servidor: ok");
