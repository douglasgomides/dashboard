// Conferência ao vivo (Nexo x CRM de origem) com fetch e banco falsos. Nunca conecta a nada. Dados fictícios.
import assert from "node:assert/strict";
import {
  buscarSomenteGet,
  compararAmostra,
  compararFlwChat,
  erroLimpo,
  passaRegraDepartamento,
  periodoFechado,
  roteadorWts,
  runConferenciaAoVivo,
  type BuscarJson,
  type ClienteWts,
  type ConexaoAoVivo,
  type LeitorNexo,
  type LinhaConferencia,
  type RegistroNexo,
} from "../api/_lib/conferencia-ao-vivo";
import { definirDormirRetry } from "../api/_lib/integration-http";
import { dentroDaTolerancia, resumirAoVivo, textoTolerancia, TOL_AO_VIVO, TOL_EXATA } from "../src/lib/conferencia-ao-vivo";

definirDormirRetry(async () => {});

const AGORA = Date.parse("2026-11-01T15:00:00.000Z");
const P = periodoFechado(AGORA);
const DIA = 86_400_000;
const C1 = "00000000-0000-4000-8000-000000000001";
const C2 = "00000000-0000-4000-8000-000000000002";
const C3 = "00000000-0000-4000-8000-000000000003";
const TOKEN = "tok-falso-kommo-123";

// Período: 30 dias inteiros até ontem no horário de Brasília (03:00 UTC).
assert.equal(new Date(P.fim).toISOString(), "2026-11-01T03:00:00.000Z");
assert.equal(new Date(P.ini).toISOString(), "2026-10-02T03:00:00.000Z");

// Tolerâncias.
assert.equal(dentroDaTolerancia(100, 100, TOL_EXATA), true);
assert.equal(dentroDaTolerancia(101, 100, TOL_EXATA), false);
assert.equal(dentroDaTolerancia(102, 100, TOL_AO_VIVO), true, "mínimo 2");
assert.equal(dentroDaTolerancia(1009, 1000, TOL_AO_VIVO), true, "1% de 1000");
assert.equal(dentroDaTolerancia(1011, 1000, TOL_AO_VIVO), false);
assert.equal(textoTolerancia(TOL_EXATA), "exata");
assert.equal(textoTolerancia(TOL_AO_VIVO), "±1% (mín. 2)");

// Erro nunca carrega token nem URL.
assert.equal(erroLimpo(new Error(`falhou https://x.kommo.com/api?token=${TOKEN} Bearer ${TOKEN}`), [TOKEN]).includes(TOKEN), false);
assert.equal(erroLimpo(new Error("falhou https://crm.rdstation.com/api/v1/deals?token=abc")).includes("abc"), false);

// ---------- fonte falsa ----------
const sec = (ms: number) => Math.floor(ms / 1000);
const dentroP = P.ini + 5 * DIA;
const foraP = P.ini - 5 * DIA;
// Kommo: 6 leads na listagem (2 páginas) + 1 na Entrada.
const kommoLeads = [
  { id: 1, status_id: 10, pipeline_id: 5, price: 100, created_at: sec(dentroP), closed_at: null },
  { id: 2, status_id: 142, pipeline_id: 5, price: 500, created_at: sec(foraP), closed_at: sec(dentroP) },
  { id: 3, status_id: 143, pipeline_id: 5, price: 0, created_at: sec(dentroP), closed_at: sec(dentroP + DIA) },
  { id: 4, status_id: 142, pipeline_id: 5, price: 300, created_at: sec(foraP), closed_at: sec(foraP) },
  { id: 5, status_id: 11, pipeline_id: 5, price: null, created_at: sec(foraP), closed_at: null },
  { id: 6, status_id: 11, pipeline_id: 5, price: null, created_at: sec(AGORA - 3600_000), closed_at: null }, // hoje: fora do período fechado
];
const pedidos: { url: string; headers: Record<string, string> }[] = [];
const fonte: BuscarJson = async (url, headers) => {
  pedidos.push({ url, headers });
  const u = new URL(url);
  if (u.hostname === "conta.kommo.com") {
    assert.equal(headers.Authorization, `Bearer ${TOKEN}`);
    if (u.pathname.endsWith("/leads/pipelines")) return { status: 200, corpo: { _embedded: { pipelines: [{ id: 5, _embedded: { statuses: [{ id: 99, type: 1 }, { id: 10, type: 0 }] } }] } } };
    if (u.searchParams.get("filter[statuses][0][status_id]") === "99") return { status: 200, corpo: { _embedded: { leads: [{ id: 7, status_id: 99, pipeline_id: 5, price: 0, created_at: sec(dentroP) }] }, _links: {} } };
    const pg = Number(u.searchParams.get("page"));
    if (pg === 1) return { status: 200, corpo: { _embedded: { leads: kommoLeads.slice(0, 3) }, _links: { next: {} } } };
    return { status: 200, corpo: { _embedded: { leads: kommoLeads.slice(3) }, _links: {} } };
  }
  if (u.hostname === "crm.rdstation.com") {
    return { status: 200, corpo: { has_more: false, deals: [
      { _id: "d1", win: true, closed_at: new Date(dentroP).toISOString(), created_at: new Date(foraP).toISOString(), amount_total: 900, deal_stage: { _id: "s1" } },
      { _id: "d2", win: null, created_at: new Date(dentroP).toISOString(), amount_total: 0, deal_stage: { _id: "s0" } },
    ] } };
  }
  if (u.hostname === "api.wts.chat" && u.pathname === "/crm/v1/panel/card") {
    return { status: 200, corpo: { hasMorePages: false, items: [
      { id: "k1", stepId: "e1", monetaryAmount: 50, createdAt: new Date(dentroP).toISOString(), title: "x" },
      { id: "k2", stepId: "e2", monetaryAmount: null, createdAt: new Date(foraP).toISOString(), title: "y" },
      { id: "k3", stepId: "e2", createdAt: new Date(dentroP).toISOString(), title: "teste interno" }, // ignorado como no sync
    ] } };
  }
  if (u.hostname === "api.wts.chat" && u.pathname === "/chat/v1/session") {
    const st = u.searchParams.get("Status");
    if (st === "IN_PROGRESS") return { status: 200, corpo: { hasMorePages: false, items: [{ id: "s1", departmentId: "dA" }, { id: "s2", departmentId: "dB" }] } };
    if (st === "PENDING") return { status: 200, corpo: { hasMorePages: false, items: [{ id: "s3", departmentId: "dA" }, { id: "s1", departmentId: "dA" }] } };
    assert.equal(u.searchParams.get("OrderDirection"), "DESCENDING");
    return { status: 200, corpo: { hasMorePages: true, items: [
      { id: "s1", createdAt: new Date(AGORA - DIA).toISOString(), departmentId: "dA" },
      { id: "s2", createdAt: new Date(AGORA - 2 * DIA).toISOString(), departmentId: "dB" },
      { id: "s4", createdAt: new Date(AGORA - 3 * DIA).toISOString(), departmentId: "dZ" }, // sem dono
      { id: "s9", createdAt: new Date(AGORA - 9 * DIA).toISOString(), departmentId: "dA" }, // fim da janela: para aqui
    ] } };
  }
  if (u.hostname === "conta.digisac.io") {
    if (u.pathname === "/api/v1/contacts") return { status: 200, corpo: { lastPage: 1, data: [
      { id: "g1", isGroup: true, createdAt: new Date(dentroP).toISOString() },
      { id: "c1", hadChat: true, createdAt: new Date(dentroP).toISOString(), tags: [{ label: "Agendado" }] },
      { id: "c2", hadChat: false, createdAt: new Date(dentroP).toISOString() },
    ] } };
    const q = JSON.parse(u.searchParams.get("query") ?? "{}");
    return { status: 200, corpo: { total: q.where?.isOpen ? 4 : 12, data: [] } };
  }
  throw new Error(`pedido inesperado ${u.hostname}${u.pathname}`);
};

// ---------- Nexo falso ----------
const nx = (id: string, o: Partial<RegistroNexo>): RegistroNexo => ({ external_lead_id: id, status_id: null, pipeline_id: null, outcome: "open", price: null, occurred_at: null, removido_na_origem: null, closed_at: null, substituido_por: null, ...o });
const iso = (ms: number) => new Date(ms).toISOString();
const leadsNexo: Record<string, RegistroNexo[]> = {
  kommo1: [
    nx("1", { status_id: "10", pipeline_id: "5", price: 100, occurred_at: iso(dentroP) }),
    nx("2", { status_id: "142", pipeline_id: "5", outcome: "won", price: 500, occurred_at: iso(foraP), closed_at: String(sec(dentroP)) }),
    nx("3", { status_id: "143", pipeline_id: "5", outcome: "lost", price: 0, occurred_at: iso(dentroP), closed_at: String(sec(dentroP + DIA)) }),
    nx("4", { status_id: "142", pipeline_id: "5", outcome: "won", price: 300, occurred_at: iso(foraP), closed_at: String(sec(foraP)) }),
    nx("5", { status_id: "10", pipeline_id: "5", occurred_at: iso(foraP) }), // etapa desatualizada
    nx("6", { status_id: "11", pipeline_id: "5", occurred_at: iso(AGORA - 3600_000) }),
    nx("7", { status_id: "99", pipeline_id: "5", occurred_at: iso(dentroP) }),
    nx("8", { status_id: "10", pipeline_id: "5", occurred_at: iso(dentroP), removido_na_origem: iso(AGORA) }), // apagado na fonte
  ],
  rd1: [
    nx("d1", { status_id: "s1", outcome: "won", price: 900, occurred_at: iso(foraP), closed_at: iso(dentroP) }),
    nx("d2", { status_id: "s0", occurred_at: iso(dentroP) }),
  ],
  flw1: [
    nx("k1", { status_id: "e1", pipeline_id: "p1", price: 50, occurred_at: iso(dentroP), outcome: "won" }),
    nx("k2", { status_id: "e2", pipeline_id: "p1", occurred_at: iso(foraP), outcome: "closed" }), // fechado por engano
    nx("k9", { status_id: "e2", pipeline_id: "p1", occurred_at: iso(foraP), outcome: "closed" }),
  ],
  dig1: [nx("c1", { status_id: "agendado", pipeline_id: "sem-medico", occurred_at: iso(dentroP) })],
};
const conexoes: ConexaoAoVivo[] = [
  { id: "kommo1", client_id: C1, provider: "kommo", subdomain: "conta", access_token: null, config: {} },
  { id: "rd1", client_id: C1, provider: "rdstation", subdomain: null, access_token: "tok-rd-falso", config: {} },
  { id: "flw1", client_id: C2, provider: "flwchat", subdomain: null, access_token: "tok-flw-falso", config: { panel_ids: ["p1"] } },
  { id: "dig1", client_id: C3, provider: "digisac", subdomain: "conta", access_token: "tok-dig-falso", config: {} },
  { id: "kommo2", client_id: C2, provider: "kommo", subdomain: "conta", access_token: TOKEN, config: {} }, // mesma conta: lida uma vez
];
leadsNexo.kommo2 = leadsNexo.kommo1;
const wts: ClienteWts[] = [
  { id: C1, wts_company_id: "acc", wts_department_ids: ["dA"], wts_api_token: "tok-wts-falso" },
  { id: C2, wts_company_id: "acc", wts_department_ids: ["dB"], wts_api_token: null },
];
let gravadas: LinhaConferencia[] = [];
const leitor: LeitorNexo = {
  conexoes: async (only) => conexoes.filter((c) => !only || c.client_id === only),
  clientesWts: async () => wts,
  leads: async (id) => leadsNexo[id] ?? [],
  donoPeloCard: async () => new Map([["s2", C1]]), // o card diz que s2 é do C1, mesmo com a equipe do C2
  regrasDepartamento: async () => new Map(),
  contarSessoes: async (c) => (c === C1 ? 2 : c === C2 ? 0 : 12),
  contarSessoesAbertas: async (c) => (c === C1 ? 3 : c === C2 ? 0 : 9),
  gravar: async (l) => { gravadas = l; },
};

async function main() {
  const { resumo, linhas } = await runConferenciaAoVivo(leitor, fonte, { tokenKommoPadrao: TOKEN, agora: () => AGORA, aleatorio: () => 0.5 });
  assert.equal(gravadas, linhas);
  const v = (cli: string, f: string, m: string) => {
    const l = linhas.find((x) => x.client_id === cli && x.fonte === f && x.metrica === m);
    assert.ok(l, `${cli} ${f} ${m}`);
    return l!;
  };

  // Kommo: 7 leads na fonte (inclusive Entrada). Abertos: 1, 5, 6, 7 = 4 na fonte; Nexo 1, 5, 6, 7 (o 8 apagado sai).
  assert.deepEqual([v(C1, "kommo", "abertos_agora").nexo, v(C1, "kommo", "abertos_agora").fonte_valor], [4, 4]);
  assert.equal(v(C1, "kommo", "abertos_agora").ok, true);
  // Criados no período fechado: 1, 3, 7 (o 6 é de hoje). Exato.
  assert.deepEqual([v(C1, "kommo", "criados_30d").nexo, v(C1, "kommo", "criados_30d").fonte_valor, v(C1, "kommo", "criados_30d").ok], [3, 3, true]);
  // Ganhos pela data de fechamento: só o 2 (o 4 fechou antes). Perdidos: o 3.
  assert.deepEqual([v(C1, "kommo", "ganhos_30d").nexo, v(C1, "kommo", "ganhos_30d").fonte_valor], [1, 1]);
  assert.deepEqual([v(C1, "kommo", "perdidos_30d").nexo, v(C1, "kommo", "perdidos_30d").fonte_valor], [1, 1]);
  // Amostra: os 7 leads; o 5 tem etapa diferente no Nexo.
  const am = v(C1, "kommo", "amostra");
  assert.equal(am.amostra, 7);
  assert.equal(am.nexo, 6);
  assert.deepEqual((am.detalhe as { divergencias: Record<string, number> }).divergencias, { etapa: 1 });
  assert.equal(am.ok, true, "1 divergência em 20 é tolerada");
  // Conta compartilhada: o Kommo foi lido uma vez só (2 páginas + funis + Entrada).
  assert.equal(pedidos.filter((p) => p.url.includes("kommo.com")).length, 4);
  assert.equal(v(C2, "kommo", "abertos_agora").fonte_valor, 4);

  // RD Station.
  assert.deepEqual([v(C1, "rdstation", "ganhos_30d").nexo, v(C1, "rdstation", "ganhos_30d").fonte_valor], [1, 1]);
  assert.deepEqual([v(C1, "rdstation", "abertos_agora").nexo, v(C1, "rdstation", "abertos_agora").fonte_valor], [1, 1]);
  assert.equal(v(C1, "rdstation", "amostra").nexo, 2);

  // FlwChat: 2 cards listados (o de teste fica fora); o Nexo deu um deles como fechado.
  assert.deepEqual([v(C2, "flwchat", "abertos_agora").nexo, v(C2, "flwchat", "abertos_agora").fonte_valor], [1, 2]);
  assert.equal(v(C2, "flwchat", "abertos_agora").ok, true, "±2 em contagem ao vivo");
  assert.equal((v(C2, "flwchat", "amostra").detalhe as { divergencias: Record<string, number> }).divergencias.dado_como_fechado, 1);
  assert.equal(linhas.some((l) => l.fonte === "flwchat" && /ganhos|perdidos/.test(l.metrica)), false, "FlwChat não lista fechados: sem ganho/perda");

  // WTS: s1 (dA, C1), s2 (card -> C1), s4 sem dono; s9 fora da janela. Abertas: s1, s3 do C1; s2 pelo card do C1.
  assert.deepEqual([v(C1, "wts", "sessoes_7d").nexo, v(C1, "wts", "sessoes_7d").fonte_valor], [2, 2]);
  assert.deepEqual([v(C2, "wts", "sessoes_7d").nexo, v(C2, "wts", "sessoes_7d").fonte_valor], [0, 0]);
  assert.deepEqual([v(C1, "wts", "sessoes_abertas_agora").nexo, v(C1, "wts", "sessoes_abertas_agora").fonte_valor], [3, 3]);
  assert.equal((v(C1, "wts", "sessoes_7d").detalhe as { sessoes_sem_dono: { recentes: number } }).sessoes_sem_dono.recentes, 1);
  assert.equal(pedidos.filter((p) => p.url.includes("/chat/v1/session") && p.url.includes("createdat")).length, 1, "parou no corte dos 7 dias");

  // Regra de departamento das telas (crm_filtro_cliente): C1 exclui dA (como a Dra. Juliana Paola exclui a equipe da
  // Dra. Mariela). Fonte: s1 e s3 são do C1 pela equipe dA e saem; s2 fica (card do C1, equipe dB). O Nexo conta pela
  // função da tela (comRegra).
  const pedidosComRegra: boolean[] = [];
  const comRegra: LeitorNexo = {
    ...leitor,
    regrasDepartamento: async (ids) => { assert.deepEqual(ids, [C1, C2]); return new Map([[C1, { incluir: [], excluir: ["dA"] }]]); },
    contarSessoesAbertas: async (c, regra) => { if (c === C1) pedidosComRegra.push(!!regra); return c === C1 ? 1 : 0; },
    contarSessoes: async (c, _d, _a, regra) => { if (c === C1) pedidosComRegra.push(!!regra); return c === C1 ? 1 : 0; },
  };
  const rr = await runConferenciaAoVivo(comRegra, fonte, { fontes: ["wts"], agora: () => AGORA });
  const w = (m: string) => rr.linhas.find((x) => x.client_id === C1 && x.metrica === m)!;
  assert.deepEqual([w("sessoes_abertas_agora").nexo, w("sessoes_abertas_agora").fonte_valor, w("sessoes_abertas_agora").ok], [1, 1, true]);
  assert.deepEqual([w("sessoes_7d").nexo, w("sessoes_7d").fonte_valor], [1, 1]);
  assert.deepEqual(pedidosComRegra, [true, true], "o Nexo conta como a tela quando o cliente tem regra");
  assert.deepEqual((w("sessoes_abertas_agora").detalhe as { sessoes_fora_da_regra: { abertas: number } }).sessoes_fora_da_regra.abertas, 2);
  assert.equal(passaRegraDepartamento({ incluir: ["dM"], excluir: [] }, "dM"), true);
  assert.equal(passaRegraDepartamento({ incluir: ["dM"], excluir: [] }, "dJ"), false);
  assert.equal(passaRegraDepartamento({ incluir: ["dM"], excluir: [] }, null), false, "incluir: sem departamento não passa");
  assert.equal(passaRegraDepartamento({ incluir: [], excluir: ["dM"] }, null), true, "excluir: sem departamento fica com a clínica");
  assert.equal(passaRegraDepartamento(undefined, "qualquer"), true);

  // FlwChat: o que só o Nexo tem sai por motivo e por painel.
  const fl = compararFlwChat({ client_id: C2, crm_connection_id: "flw1", fonte: "flwchat", rodado_em: "x" },
    [{ id: "a", etapa: "e", funil: "p1", resultado: null, valor: null, criadoMs: null, fechadoMs: null }],
    ["p1", "p2"],
    [nx("a", { pipeline_id: "p1" }), nx("b", { pipeline_id: "p1" }), nx("c", { pipeline_id: "p2", removido_na_origem: iso(AGORA), substituido_por: "a" }), nx("d", { pipeline_id: "p2", outcome: "closed" })],
    P, () => 0.5);
  const ab = fl.find((l) => l.metrica === "abertos_agora")!;
  assert.deepEqual([ab.nexo, ab.fonte_valor], [3, 1]);
  assert.deepEqual((ab.detalhe as { so_no_nexo_por_motivo: Record<string, number> }).so_no_nexo_por_motivo, { aberto: 1, substituido: 1 });
  assert.deepEqual((ab.detalhe as { por_painel: Record<string, unknown> }).por_painel, { p1: { fonte: 1, nexo: 2, so_no_nexo: 1 }, p2: { fonte: 0, nexo: 1, so_no_nexo: 1 } });

  // Digisac: grupo e quem nunca conversou ficam fora, como no sync.
  assert.deepEqual([v(C3, "digisac", "abertos_agora").nexo, v(C3, "digisac", "abertos_agora").fonte_valor], [1, 1]);
  assert.equal(v(C3, "digisac", "amostra").nexo, 1);
  assert.deepEqual([v(C3, "digisac", "atendimentos_7d").nexo, v(C3, "digisac", "atendimentos_7d").fonte_valor], [12, 12]);
  assert.deepEqual([v(C3, "digisac", "atendimentos_abertos_agora").nexo, v(C3, "digisac", "atendimentos_abertos_agora").fonte_valor, v(C3, "digisac", "atendimentos_abertos_agora").ok], [9, 4, false]);

  // Resumo e nada de segredo ou id no que é gravado.
  assert.equal(resumo.linhas, linhas.length);
  assert.ok(resumo.divergentes >= 1);
  const serial = JSON.stringify(linhas);
  for (const s of [TOKEN, "tok-rd-falso", "tok-flw-falso", "tok-dig-falso", "tok-wts-falso", "teste interno", "\"k1\"", "\"d1\""]) assert.equal(serial.includes(s), false, `vazou ${s}`);

  // Nunca nenhum pedido que não seja leitura: o BuscarJson não recebe método; o padrão força GET (abaixo).

  // Fonte com erro vira linha "não lida" (ok nulo), sem derrubar a rodada; sem tempo também.
  const quebrada: BuscarJson = async () => ({ status: 401, corpo: null });
  const r2 = await runConferenciaAoVivo(leitor, quebrada, { onlyClientId: C1, fontes: ["kommo"], tokenKommoPadrao: TOKEN, agora: () => AGORA });
  assert.ok(r2.linhas.length > 0 && r2.linhas.every((l) => l.ok === null && /401/.test(String(l.detalhe.erro))));
  let t = AGORA;
  const r3 = await runConferenciaAoVivo(leitor, fonte, { onlyClientId: C1, fontes: ["kommo"], tokenKommoPadrao: TOKEN, agora: () => (t += 1000), prazo: AGORA + 500 });
  assert.ok(r3.linhas.every((l) => l.ok === null && /sem tempo/.test(String(l.detalhe.erro))));

  // Roteador: equipe ambígua não tem dono; o único curinga recebe o resto.
  const rot = roteadorWts([{ id: "a", wts_company_id: "x", wts_department_ids: ["d1", "d2"], wts_api_token: null }, { id: "b", wts_company_id: "x", wts_department_ids: ["d2"], wts_api_token: null }, { id: "c", wts_company_id: "x", wts_department_ids: null, wts_api_token: null }], new Map());
  assert.equal(rot({ id: "1", departmentId: "d1" }), "a");
  assert.equal(rot({ id: "2", departmentId: "d2" }), null);
  assert.equal(rot({ id: "3", departmentId: "outra" }), "c");

  // Amostra: valor 0 e ausente são iguais; registro que falta no Nexo conta como ausente.
  const a = compararAmostra([{ id: "x", etapa: "1", funil: "2", resultado: "open", valor: null, criadoMs: null, fechadoMs: null }, { id: "y", etapa: null, funil: null, resultado: null, valor: null, criadoMs: null, fechadoMs: null }], new Map([["x", nx("x", { status_id: "1", pipeline_id: "2", price: 0 })]]));
  assert.deepEqual(a, { tamanho: 2, iguais: 1, ausentes: 1, divergencias: {} });

  // Resumo da tela: só a última rodada de cada cliente e fonte; não lidas fora da porcentagem.
  const rs = resumirAoVivo([
    { client_id: C1, fonte: "kommo", metrica: "a", ok: false, rodado_em: "2026-10-30T10:00:00Z" },
    { client_id: C1, fonte: "kommo", metrica: "a", ok: true, rodado_em: "2026-11-01T10:00:00Z" },
    { client_id: C1, fonte: "kommo", metrica: "b", ok: false, rodado_em: "2026-11-01T10:00:00Z" },
    { client_id: C1, fonte: "kommo", metrica: "c", ok: null, rodado_em: "2026-11-01T10:00:00Z" },
  ]);
  assert.deepEqual(rs, [{ clientId: C1, fonte: "kommo", conferidas: 2, ok: 1, naoLidas: 1, pctOk: 50, rodadoEm: "2026-11-01T10:00:00Z" }]);

  // buscarSomenteGet: GET, só hosts dos CRMs, Kommo no ritmo; com fetch falso (nada sai para a rede).
  const original = globalThis.fetch;
  const vistos: { metodo: string | undefined; host: string }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    vistos.push({ metodo: init?.method, host: new URL(String(input)).hostname });
    return new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    assert.deepEqual(await buscarSomenteGet("https://conta.kommo.com/api/v4/leads?page=1", { Authorization: "Bearer x" }), { status: 200, corpo: { ok: 1 } });
    await buscarSomenteGet("https://api.wts.chat/chat/v1/session", {});
    await assert.rejects(() => buscarSomenteGet("https://evil.example.com/x", {}), /fora da lista/);
    await assert.rejects(() => buscarSomenteGet("http://conta.kommo.com/x", {}), /fora da lista/);
    assert.deepEqual(vistos.map((x) => x.metodo), ["GET", "GET"]);
  } finally {
    globalThis.fetch = original;
  }
  console.log("test-conferencia-ao-vivo: ok");
}

main().catch((e) => { console.error(e); process.exit(1); });
