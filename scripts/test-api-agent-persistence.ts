import assert from "node:assert/strict";
import { FLUXOS, rodarAgentes, enfileirarBrain } from "../api/_lib/agentes";

const FLOW = "review_persistence";
const EXTERNAL_FLOW = "review_external_persistence";
const originalFetch = globalThis.fetch;
const originalClickupToken = process.env.CLICKUP_API_TOKEN;
let effects = 0;
FLUXOS[FLOW] = {
  id: FLOW, agente: "review", nome: "Persistence review", objetivo: "Offline regression",
  passos: [
    { nome: "persist", descricao: "Side effect with recovery context", risco: "baixo", idempotente: true, executar: async () => {
      effects++;
      return { tipo: "seguir", saida: { written: 7 }, contexto: { recovered: 7 } };
    } },
    { nome: "finish", descricao: "Inspect restored context", risco: "baixo", executar: async (ctx) => ({ tipo: "concluir", resultado: { recovered: ctx.exec.contexto.recovered } }) },
  ],
};
FLUXOS[EXTERNAL_FLOW] = {
  id: EXTERNAL_FLOW, agente: "review", nome: "External persistence review", objetivo: "Offline regression",
  passos: [
    { nome: "comment", descricao: "External write", ferramenta: "clickup.comentar", risco: "baixo", idempotente: true,
      executar: async (ctx) => ({ tipo: "seguir", saida: await ctx.usar("clickup.comentar", { task_id: "task-123", texto: "Persist this comment safely" }) }) },
    { nome: "finish", descricao: "Conclude", risco: "baixo", executar: async () => ({ tipo: "concluir", resultado: { ok: true } }) },
  ],
};

function fakeDatabase() {
  const state: any = { id: "execution", client_id: "client", fluxo: FLOW, estado: "pendente", passo_atual: 0, contexto: {}, tentativas: 0, custo_usd: 0, teto_custo_usd: 1 };
  const logs: any[] = [];
  let rejectState = false;
  let rejectCost = false;
  let rejectIdempotence = false;
  let rejectConfirmation = false;
  let rejectStepLog = false;
  let rejectIntent = false;
  const admin: any = {
    rpc: async () => {
      if (state.estado !== "pendente") return { data: [], error: null };
      state.estado = "rodando";
      return { data: [structuredClone(state)], error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let update: any = null;
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters[key] = value; return q; },
        update: (value: any) => { update = value; return q; },
        maybeSingle: async () => rejectIdempotence ? { data: null, error: { message: "idempotence read failed" } } : { data: logs.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null, error: null },
        insert: async (value: any) => {
          if (rejectIntent && value.nome.startsWith("intencao:")) return { error: { message: "intent write failed" } };
          if (rejectStepLog && value.chave_idempotencia && !value.nome.startsWith("intencao:")) return { error: { message: "step write failed" } };
          if (value.chave_idempotencia && logs.some((row) => row.chave_idempotencia === value.chave_idempotencia)) return { error: { message: "duplicate key" } };
          logs.push({ id: logs.length + 1, ...structuredClone(value) });
          return { error: null };
        },
        single: async () => {
          if (rejectConfirmation) return { data: null, error: { message: "confirmation write failed" } };
          const row = logs.find((item) => Object.entries(filters).every(([key, value]) => item[key] === value));
          if (!row) return { data: null, error: { message: "not found" } };
          Object.assign(row, update);
          return { data: { id: row.id }, error: null };
        },
        then: (resolve: (value: any) => unknown, reject: (reason: any) => unknown) => Promise.resolve().then(() => {
          if (table === "ia_execucoes") return rejectCost ? { data: null, error: { message: "cost read failed" } } : { data: [], error: null };
          if (table === "agente_execucoes" && update) {
            if (rejectState) return { error: { message: "state write failed" } };
            Object.assign(state, update);
            return { error: null };
          }
          throw new Error(`Unexpected query ${table}`);
        }).then(resolve, reject),
      };
      return q;
    },
  };
  return {
    admin, state, logs,
    rejectState: (value: boolean) => { rejectState = value; }, rejectCost: (value: boolean) => { rejectCost = value; }, rejectIdempotence: (value: boolean) => { rejectIdempotence = value; },
    rejectConfirmation: (value: boolean) => { rejectConfirmation = value; }, rejectStepLog: (value: boolean) => { rejectStepLog = value; }, rejectIntent: (value: boolean) => { rejectIntent = value; },
  };
}

async function testBrainScheduling() {
  let failModules = false;
  let failPrevious = false;
  let previous: { estado: string; criado_em: unknown } | null = null;
  let insertError: { code: string; message: string } | null = null;
  let inserts = 0;
  const admin: any = {
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: previous, error: failPrevious ? { message: "previous run unavailable" } : null }),
        insert: async (value: any) => {
          assert.equal(table, "agente_execucoes");
          assert.equal(value.fluxo, "brain_carga");
          assert.equal(value.criado_por, null);
          if (insertError) return { error: insertError };
          inserts++;
          return { error: null };
        },
        then: (resolve: (value: any) => unknown, reject: (reason: any) => unknown) => Promise.resolve({ data: [{ client_id: "client" }], error: failModules ? { message: "modules unavailable" } : null }).then(resolve, reject),
      };
      return q;
    },
  };
  failModules = true;
  await assert.rejects(() => enfileirarBrain(admin), /modules unavailable/);
  failModules = false; failPrevious = true;
  await assert.rejects(() => enfileirarBrain(admin), /verificar a última leitura/);
  assert.equal(inserts, 0, "an unreadable previous run must never be treated as no prior work");
  failPrevious = false;
  for (const criado_em of [null, "invalid date", "", 0]) {
    previous = { estado: "concluida", criado_em };
    await assert.rejects(() => enfileirarBrain(admin), /data inválida/);
  }
  assert.equal(inserts, 0);
  previous = { estado: "concluida", criado_em: new Date(Date.now() - 3_600_000).toISOString() };
  assert.deepEqual(await enfileirarBrain(admin), { enfileiradas: 0, puladas: 1 });
  previous = { estado: "pausada", criado_em: new Date(Date.now() - 12 * 3_600_000).toISOString() };
  assert.deepEqual(await enfileirarBrain(admin), { enfileiradas: 0, puladas: 1 }, "paused runs still block a duplicate scheduled run");
  previous = { estado: "concluida", criado_em: new Date(Date.now() - 12 * 3_600_000).toISOString() };
  assert.deepEqual(await enfileirarBrain(admin), { enfileiradas: 1, puladas: 0 });
  previous = null;
  assert.deepEqual(await enfileirarBrain(admin), { enfileiradas: 1, puladas: 0 });
  assert.equal(inserts, 2);
  insertError = { code: "23505", message: "unique violation" };
  assert.deepEqual(await enfileirarBrain(admin), { enfileiradas: 0, puladas: 1 }, "a competing enqueue is handled by its unique-violation code");
  insertError = { code: "XX000", message: "duplicate connection failure" };
  await assert.rejects(() => enfileirarBrain(admin), /duplicate connection failure/);
  assert.equal(inserts, 2, "unexpected insert failures cannot be treated as a harmless duplicate");
}

try {
  const db = fakeDatabase();
  db.rejectState(true);
  await assert.rejects(() => rodarAgentes(db.admin, { execucaoId: "execution" }), /persistir o estado/);
  assert.equal(effects, 1);
  assert.equal(db.state.passo_atual, 0, "failed persistence cannot advance the in-memory workflow in the DB");
  assert.equal(db.logs.length, 1, "successful side effect has an idempotency record before state advancement");
  db.rejectState(false);
  db.state.estado = "pendente";
  await rodarAgentes(db.admin, { execucaoId: "execution" });
  assert.equal(effects, 1, "a resumed step must not repeat the side effect");
  assert.equal(db.state.resultado.recovered, 7, "idempotency recovery must restore the step context");

  const noCost = fakeDatabase();
  noCost.rejectCost(true);
  await assert.rejects(() => rodarAgentes(noCost.admin, { execucaoId: "execution" }), /verificar o custo/);
  assert.equal(effects, 1, "a cost database failure cannot bypass the spending limit");

  const noIdempotence = fakeDatabase();
  noIdempotence.rejectIdempotence(true);
  await rodarAgentes(noIdempotence.admin, { execucaoId: "execution" });
  assert.equal(effects, 1, "unreadable idempotence must never repeat a side effect");
  assert.equal(noIdempotence.state.estado, "aguardando");
  assert.ok(noIdempotence.logs.some((row) => row.ok === false));

  process.env.CLICKUP_API_TOKEN = "fake-key";
  let providerCalls = 0;
  let dropResponse = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://api.clickup.com/api/v2/task/task-123/comment");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    providerCalls++;
    if (dropResponse) throw new Error("response lost after provider accepted comment");
    return new Response(JSON.stringify({ id: "comment-1" }), { status: 200 });
  };

  const noIntent = fakeDatabase();
  noIntent.state.fluxo = EXTERNAL_FLOW;
  noIntent.rejectIntent(true);
  await rodarAgentes(noIntent.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 0, "HTTP must not be sent before the intent is durable");
  assert.equal(noIntent.state.estado, "pausada");

  const ambiguous = fakeDatabase();
  ambiguous.state.fluxo = EXTERNAL_FLOW;
  ambiguous.rejectConfirmation(true);
  await rodarAgentes(ambiguous.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 1, "the provider accepted exactly one comment");
  assert.equal(ambiguous.state.estado, "pausada", "confirmation persistence failure requires manual review");
  assert.match(ambiguous.state.erro, /reenvio automático bloqueado/i);
  assert.equal(ambiguous.logs.find((row) => row.nome.startsWith("intencao:")).ok, null);
  ambiguous.rejectConfirmation(false);
  ambiguous.state.estado = "pendente"; // even a manual resume cannot blindly resend an uncertain action
  await rodarAgentes(ambiguous.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 1, "an accepted action with lost persistence must not call the provider on resume");
  assert.equal(ambiguous.state.estado, "pausada");

  const confirmed = fakeDatabase();
  confirmed.state.fluxo = EXTERNAL_FLOW;
  confirmed.rejectStepLog(true);
  await assert.rejects(() => rodarAgentes(confirmed.admin, { execucaoId: "execution" }), /persistir o passo/);
  assert.equal(providerCalls, 2);
  assert.equal(confirmed.logs.find((row) => row.nome.startsWith("intencao:")).ok, true);
  confirmed.rejectStepLog(false);
  confirmed.state.estado = "pendente";
  await rodarAgentes(confirmed.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 2, "a durable external confirmation is reused if the outer step log failed");
  assert.equal(confirmed.state.estado, "concluida");

  const lostResponse = fakeDatabase();
  lostResponse.state.fluxo = EXTERNAL_FLOW;
  dropResponse = true;
  await rodarAgentes(lostResponse.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 3);
  assert.equal(lostResponse.state.estado, "pausada");
  lostResponse.state.estado = "pendente";
  await rodarAgentes(lostResponse.admin, { execucaoId: "execution" });
  assert.equal(providerCalls, 3, "a lost provider response cannot trigger a duplicate comment");
  await testBrainScheduling();
  console.log("ok api-agent-persistence (estado, contexto, custo, intenção externa, bloqueio de reenvio e agendamento Brand Brain)");
} finally {
  delete FLUXOS[FLOW]; delete FLUXOS[EXTERNAL_FLOW];
  globalThis.fetch = originalFetch;
  if (originalClickupToken === undefined) delete process.env.CLICKUP_API_TOKEN;
  else process.env.CLICKUP_API_TOKEN = originalClickupToken;
}
