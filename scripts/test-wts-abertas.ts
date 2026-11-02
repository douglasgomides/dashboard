// Releitura das sessões abertas da WTS (reconciliarAbertas) com banco e API falsos. Nunca conecta a nada. Dados fictícios.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MAX_PAGINAS_ABERTAS, reconciliarAbertas, sessoesFechadasNaOrigem, sessoesQueSairamDoCliente, utmDaSessao } from "../api/_lib/wts-sync";

const origin = "https://review.supabase.co";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const db = () => createClient(origin, "fake-key", { auth: { persistSession: false, autoRefreshToken: false } }) as any;
const original = globalThis.fetch;

// Função pura: fora da lista = fechada; lista vazia com o Nexo cheio não fecha nada.
assert.deepEqual(sessoesFechadasNaOrigem([{ session_id: "a" }, { session_id: "b" }], new Set(["a"])), [{ session_id: "b" }]);
assert.deepEqual(sessoesFechadasNaOrigem([{ session_id: "a" }], new Set()), [{ session_id: "a" }], "poucas abertas e lista vazia: fecha");
assert.equal(sessoesFechadasNaOrigem(Array.from({ length: 20 }, (_, i) => ({ session_id: `s${i}` })), new Set()), null);
// Aberta na WTS, mas o dono atual não é mais o cliente que tem a cópia (equipe sem dono no Nexo): sai da fila dele.
{
  const naFonte = new Map<string, any>([["a", { id: "a", departmentId: "dep-geral" }], ["b", { id: "b", departmentId: "dep-m" }]]);
  const dono = (s: any) => (s.departmentId === "dep-m" ? "M" : null);
  assert.deepEqual(sessoesQueSairamDoCliente([{ client_id: "M", session_id: "a" }, { client_id: "M", session_id: "b" }, { client_id: "M", session_id: "c" }], naFonte, dono),
    [{ client_id: "M", session_id: "a" }], "só a que segue aberta com outro dono; a que sumiu da lista é das fechadas na origem");
}
// UTM da sessão v2: só campos da doc, sem vazio.
assert.deepEqual(utmDaSessao({ sourceId: "120", clid: " ab ", medium: "", outro: "x" }), { sourceId: "120", clid: "ab" });
assert.equal(utmDaSessao({}), null);
assert.equal(utmDaSessao("x"), null);

async function main() {
  // Nexo: J tem s-velha (fechou na WTS fora da janela) e s-viva; M tem s-m (ainda aberta).
  const nexo = [
    { client_id: "J", session_id: "s-velha" },
    { client_id: "J", session_id: "s-viva" },
    { client_id: "M", session_id: "s-m" },
  ];
  const updates: { client: string | null; ids: string | null; status: string | null; corpo: any }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, origin);
    const metodo = init?.method ?? "GET";
    if (metodo === "GET") {
      assert.equal(url.searchParams.get("client_id"), "in.(J,M)", "só os clientes desta conta");
      assert.equal(url.searchParams.get("status"), "in.(IN_PROGRESS,PENDING)");
      return json(nexo);
    }
    if (metodo === "PATCH") {
      updates.push({ client: url.searchParams.get("client_id"), ids: url.searchParams.get("session_id"), status: url.searchParams.get("status"), corpo: JSON.parse(String(init?.body)) });
      return json(null);
    }
    throw new Error(`pedido inesperado ${metodo} ${url.pathname}`);
  }) as typeof fetch;

  const pedidos: string[] = [];
  const listar = (async (_t: string, q: string) => {
    pedidos.push(q);
    const st = new URLSearchParams(q).get("Status");
    const pag = Number(new URLSearchParams(q).get("PageNumber"));
    if (st === "IN_PROGRESS") return pag === 1 ? { items: [{ id: "s-viva", createdAt: "2026-06-01T00:00:00Z" }], hasMorePages: true } : { items: [{ id: "s-antiga-nunca-importada", createdAt: "2026-05-01T00:00:00Z", status: "IN_PROGRESS" }], hasMorePages: false };
    return { items: [{ id: "s-m", createdAt: "2026-10-01T00:00:00Z" }], hasMorePages: false };
  }) as any;
  const gravados: string[][] = [];
  const erros: string[] = [];
  try {
    const r = await reconciliarAbertas(db(), "tk", ["J", "M"], async (lote) => { gravados.push(lote.map((s) => `${s.id}:${s.status}`)); }, (m) => erros.push(m), listar);
    assert.equal(erros.length, 0);
    assert.deepEqual(r, { abertas: 3, fechadas: 1, foraDoCliente: 0 });
    // A lista inteira de abertas é gravada (inclusive a que nunca tinha entrado), com a situação da lista.
    assert.deepEqual(gravados, [["s-viva:IN_PROGRESS", "s-antiga-nunca-importada:IN_PROGRESS", "s-m:PENDING"]]);
    assert.ok(pedidos.every((q) => q.includes("PageSize=100") && q.includes("OrderBy=createdat")));
    assert.equal(pedidos.length, 3);
    // Só a s-velha, só no cliente dela, só se ainda estiver aberta no Nexo.
    assert.equal(updates.length, 1);
    assert.deepEqual([updates[0].client, updates[0].ids, updates[0].status, updates[0].corpo.status], ["eq.J", "in.(s-velha)", "in.(IN_PROGRESS,PENDING)", "COMPLETED"]);

    // M tem s-m aberta; na WTS ela segue aberta, mas foi para uma equipe sem dono: sai da fila aberta de M.
    nexo.splice(0, nexo.length, { client_id: "M", session_id: "s-m" }, { client_id: "J", session_id: "s-viva" });
    updates.length = 0;
    const mudou = await reconciliarAbertas(db(), "tk", ["J", "M"], async () => {}, (m) => erros.push(m), listar, (s) => (s.id === "s-m" ? null : "J"));
    assert.deepEqual(mudou, { abertas: 3, fechadas: 1, foraDoCliente: 1 });
    assert.deepEqual(updates.map((u) => [u.client, u.ids]), [["eq.M", "in.(s-m)"]]);

    // Lista vazia com 20+ abertas no Nexo: não fecha nada e registra.
    nexo.splice(0, nexo.length, ...Array.from({ length: 25 }, (_, i) => ({ client_id: "J", session_id: `x${i}` })));
    updates.length = 0; erros.length = 0;
    const vazia = await reconciliarAbertas(db(), "tk", ["J", "M"], async () => {}, (m) => erros.push(m), (async () => ({ items: [], hasMorePages: false })) as any);
    assert.deepEqual(vazia, { abertas: 0, fechadas: 0, foraDoCliente: 0 });
    assert.equal(updates.length, 0);
    assert.ok(erros.some((e) => e.includes("veio vazia")));

    // Teto de páginas: lista incompleta não fecha nada e registra.
    erros.length = 0;
    let n = 0;
    const semFim = (async () => ({ items: [{ id: `p${n++}` }], hasMorePages: true })) as any;
    const teto = await reconciliarAbertas(db(), "tk", ["J"], async () => { throw new Error("não devia gravar"); }, (m) => erros.push(m), semFim);
    assert.equal(teto.fechadas, 0);
    assert.equal(n, MAX_PAGINAS_ABERTAS);
    assert.ok(erros.some((e) => e.includes("teto")));
    assert.equal(updates.length, 0);
  } finally {
    globalThis.fetch = original;
  }
  console.log("test-wts-abertas: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
