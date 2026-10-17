// Teste do motor do Agentic Core (api/_lib/agentes.ts) com um banco em memória: fluxo "acessos críticos" do começo
// ao fim, aprovação bloqueando ação de risco, pedido de correção, queda no meio (retomada), idempotência, retentativa
// e teto de custo. Sem IA (sem chave no teste: usa a mensagem padrão) e sem ClickUp (sem token: "não configurada").
import assert from "node:assert/strict";
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLICKUP_API_TOKEN;
const { rodarAgentes } = await import("../api/_lib/agentes");
const { ITENS_ACESSO } = await import("../src/lib/sap-acessos");

type Linha = Record<string, any>;
function bancoFalso(seed: Record<string, Linha[]>) {
  const t: Record<string, Linha[]> = { agente_execucoes: [], agente_passos: [], aprovacoes: [], ia_execucoes: [], sap_eventos: [], marcados: [], ...seed };
  let seq = 1;
  const agora = () => new Date();
  let falharProximoInsertEvento = false;
  function query(nome: string) {
    let filtros: ((r: Linha) => boolean)[] = [];
    let ordem: [string, boolean] | null = null;
    let lim: number | null = null;
    let op: { tipo: "select" } | { tipo: "update"; v: Linha } = { tipo: "select" };
    const linhas = () => {
      let r = (t[nome] ??= []).filter((x) => filtros.every((f) => f(x)));
      if (ordem) { const [c, asc] = ordem; r = [...r].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
      return lim ? r.slice(0, lim) : r;
    };
    const exec = () => {
      if (op.tipo === "update") { const v = op.v; for (const r of linhas()) Object.assign(r, v); return { data: null, error: null }; }
      return { data: linhas(), error: null };
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
      gte: (c: string, v: string) => { filtros.push((r) => r[c] >= v); return q; },
      not: () => q,
      order: (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
      update: (v: Linha) => { op = { tipo: "update", v }; return q; },
      insert: async (v: Linha) => {
        if (nome === "sap_eventos" && falharProximoInsertEvento) { falharProximoInsertEvento = false; return { error: { message: "falha simulada de rede" } }; }
        if (nome === "agente_passos" && v.chave_idempotencia && t.agente_passos.some((p) => p.chave_idempotencia === v.chave_idempotencia)) return { error: { message: "duplicate key" } };
        if (nome === "aprovacoes" && t.aprovacoes.some((a) => a.execucao_id === v.execucao_id && a.passo === v.passo && a.estado === "pendente")) return { error: { message: "duplicate key" } };
        seq++; (t[nome] ??= []).push({ id: v.id ?? crypto.randomUUID(), criado_em: new Date(Date.now() + seq).toISOString(), estado: nome === "aprovacoes" ? "pendente" : v.estado, ...v });
        return { error: null };
      },
      then: (res: (x: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(exec()).then(res, rej),
    };
    return q;
  }
  const admin: any = {
    from: (n: string) => query(n),
    rpc: async (fn: string, a: Linha) => {
      if (fn === "agentes_reservar") {
        const e = t.agente_execucoes.find((x) => (!a.p_execucao || x.id === a.p_execucao) && (x.estado === "pendente"
          || (x.estado === "aguardando" && new Date(x.proximo_em) <= agora()) || (x.estado === "rodando" && new Date(x.lease_ate) < agora())));
        if (!e) return { data: [], error: null };
        Object.assign(e, { estado: "rodando", lease_ate: new Date(Date.now() + a.p_lease_segundos * 1000).toISOString(), tentativas: e.tentativas + 1 });
        return { data: [structuredClone(e)], error: null };
      }
      if (fn === "agentes_marcar_marco") {
        const ap = t.aprovacoes.find((x) => x.id === a.p_aprovacao && x.estado === "aprovada");
        if (!ap) return { error: { message: "sem aprovacao valida" } };
        t.marcados.push({ marco: a.p_marco, evidencia: a.p_evidencia, clinica: a.p_clinica_id });
        return { error: null };
      }
      throw new Error("rpc desconhecida " + fn);
    },
  };
  // Como a Central faz (agentes_decidir / agentes_controlar), sem passar pelo banco real.
  const decidir = (passo: string, estado: string, comentario: string | null = null) => {
    const ap = t.aprovacoes.find((x) => x.passo === passo && x.estado === "pendente")!;
    Object.assign(ap, { estado, comentario, decidido_por: "admin1" });
    const e = t.agente_execucoes.find((x) => x.id === ap.execucao_id)!;
    if (estado === "rejeitada") Object.assign(e, { estado: "cancelada" });
    else Object.assign(e, { estado: "pendente", proximo_em: null, contexto: estado === "correcao" ? { ...e.contexto, correcao: comentario } : e.contexto });
  };
  return { t, admin, decidir, falharEvento: () => { falharProximoInsertEvento = true; } };
}

const CLI = "11111111-1111-4111-8111-111111111111";
const CLIN = "22222222-2222-4222-8222-222222222222";
const criticos = ITENS_ACESSO.filter((i) => i.prazo === "C");
const novaExec = (id: string) => ({ id, client_id: CLI, agente: "operations", fluxo: "acessos_criticos", objetivo: "x", estado: "pendente", passo_atual: 0, contexto: {}, tentativas: 0, custo_usd: 0, teto_custo_usd: 0.5, atualizado_em: new Date().toISOString() });
const acessos = (confirmados: string[]) => criticos.map((c) => ({ clinica_id: CLIN, item: c.id, status: confirmados.includes(c.id) ? "confirmado" : "pendente", confirmado_em: confirmados.includes(c.id) ? "2026-10-16" : null, confirmado_por: confirmados.includes(c.id) ? "Ana" : null, observacao: null, revogado_em: null }));
const seed = (confirmados: string[]) => ({ sap_clinicas: [{ id: CLIN, client_id: CLI, nome: "CLÍNICA TESTE SAP V2", d0: "2026-10-15", created_at: "2026-10-15", clickup_folder_id: null }], sap_acessos: acessos(confirmados) });

// 1. Roda até pedir aprovação da mensagem (risco alto). Nada foi registrado como cobrança antes da aprovação.
const b = bancoFalso(seed(["A1", "A2"]));
b.t.agente_execucoes.push(novaExec("e1"));
let r = await rodarAgentes(b.admin, { execucaoId: "e1" });
let e = b.t.agente_execucoes[0];
assert.equal(e.estado, "aguardando_aprovacao");
assert.equal(b.t.aprovacoes.length, 1);
assert.equal(b.t.aprovacoes[0].risco, "alto");
assert.ok(String(b.t.aprovacoes[0].proposta.mensagem).includes(criticos.find((c) => c.id === "A3")!.nome));
assert.ok(!String(b.t.aprovacoes[0].proposta.mensagem).includes(criticos.find((c) => c.id === "A1")!.nome), "não cobra o que já foi confirmado");
assert.equal(b.t.sap_eventos.length, 0, "não registra cobrança antes de aprovar");
assert.deepEqual(b.t.agente_passos.map((p) => p.nome), ["ler_dados", "conferir_clickup", "rascunhar_cobranca", "aprovar_cobranca"]);
assert.equal(b.t.agente_passos[1].saida.configurada, false, "ClickUp sem token aparece como não configurado, não como feito");

// Rodar de novo sem decidir não anda nem duplica a aprovação.
r = await rodarAgentes(b.admin, { execucaoId: "e1" });
assert.equal(r.execucoes.length, 0);
assert.equal(b.t.aprovacoes.length, 1);

// 2. Pedido de correção: refaz o rascunho (rodada 2) e pede nova aprovação.
b.decidir("aprovar_cobranca", "correcao", "Mais curto, por favor");
await rodarAgentes(b.admin, { execucaoId: "e1" });
assert.equal(b.t.aprovacoes.length, 2);
assert.equal(b.t.aprovacoes[1].proposta.rodada, 2);
assert.equal(b.t.agente_execucoes[0].contexto.correcao, null, "correção consumida");

// 3. Aprovada: registra a cobrança uma vez e passa a esperar os acessos (24 h).
b.decidir("aprovar_cobranca", "aprovada");
await rodarAgentes(b.admin, { execucaoId: "e1" });
e = b.t.agente_execucoes[0];
assert.equal(b.t.sap_eventos.length, 1);
assert.equal(b.t.sap_eventos[0].tipo, "agente_cobranca_acessos");
assert.equal(e.estado, "aguardando");
assert.ok(new Date(e.proximo_em).getTime() > Date.now() + 23 * 3600_000);

// 4. Queda no meio + idempotência: força a volta ao passo de registro com a mesma rodada; não duplica o evento.
Object.assign(e, { estado: "rodando", lease_ate: new Date(Date.now() - 1000).toISOString(), passo_atual: 4 });
await rodarAgentes(b.admin, { execucaoId: "e1" });
assert.equal(b.t.sap_eventos.length, 1, "retomada não repetiu a ação");
assert.ok(b.t.agente_passos.some((p) => p.nome === "registrar_cobranca" && p.ok));

// 5. Clínica confirma tudo; na próxima conferência pede aprovação do item 5 (risco médio) com evidência.
b.t.sap_acessos = acessos(criticos.map((c) => c.id));
e = b.t.agente_execucoes[0];
e.proximo_em = new Date(Date.now() - 1000).toISOString();
await rodarAgentes(b.admin, { execucaoId: "e1" });
const apMarco = b.t.aprovacoes.find((a) => a.passo === "aprovar_marco")!;
assert.equal(apMarco.risco, "medio");
assert.ok(String(apMarco.proposta.evidencia).includes(`${criticos.length} acessos críticos`));
assert.equal(b.t.marcados.length, 0, "não marca sem aprovação");

// 6. Aprovado: marca o item 5 uma vez e conclui.
b.decidir("aprovar_marco", "aprovada");
await rodarAgentes(b.admin, { execucaoId: "e1" });
e = b.t.agente_execucoes[0];
assert.equal(e.estado, "concluida");
assert.equal(b.t.marcados.length, 1);
assert.equal(b.t.marcados[0].marco, 5);

// 7. Rejeição cancela e nada é executado.
const b2 = bancoFalso(seed([]));
b2.t.agente_execucoes.push(novaExec("e2"));
await rodarAgentes(b2.admin, { execucaoId: "e2" });
b2.decidir("aprovar_cobranca", "rejeitada", "não agora");
r = await rodarAgentes(b2.admin, { execucaoId: "e2" });
assert.equal(r.execucoes.length, 0);
assert.equal(b2.t.sap_eventos.length, 0);

// 8. Erro de ferramenta: tenta de novo com espera; depois de 3 tentativas, falha (vai para a fila de exceções).
const b3 = bancoFalso(seed([]));
b3.t.agente_execucoes.push(novaExec("e3"));
await rodarAgentes(b3.admin, { execucaoId: "e3" });
b3.decidir("aprovar_cobranca", "aprovada");
b3.falharEvento();
await rodarAgentes(b3.admin, { execucaoId: "e3" });
let e3 = b3.t.agente_execucoes[0];
assert.equal(e3.estado, "aguardando");
assert.ok(/falha simulada/.test(e3.erro));
assert.ok(b3.t.agente_passos.some((p) => p.ok === false && /falha simulada/.test(p.erro)));
// Segunda tentativa funciona: segue e não duplica.
e3.proximo_em = new Date(Date.now() - 1000).toISOString();
await rodarAgentes(b3.admin, { execucaoId: "e3" });
assert.equal(b3.t.sap_eventos.length, 1);
// Três falhas seguidas: estado "falhou".
const b4 = bancoFalso({ sap_clinicas: [], sap_acessos: [] });
b4.t.agente_execucoes.push({ ...novaExec("e4"), fluxo: "nao_existe" });
await rodarAgentes(b4.admin, { execucaoId: "e4" });
assert.equal(b4.t.agente_execucoes[0].estado, "falhou");
// Clínica fora do SAP: falha com motivo claro, sem ação.
const b5 = bancoFalso({ sap_clinicas: [], sap_acessos: [] });
b5.t.agente_execucoes.push(novaExec("e5"));
await rodarAgentes(b5.admin, { execucaoId: "e5" });
assert.equal(b5.t.agente_execucoes[0].estado, "falhou");
assert.ok(/não está no SAP/.test(b5.t.agente_execucoes[0].erro));

// 9. Teto de custo: execução que já gastou o teto pausa antes do próximo passo.
const b6 = bancoFalso(seed([]));
b6.t.agente_execucoes.push({ ...novaExec("e6"), custo_usd: 0.5 });
await rodarAgentes(b6.admin, { execucaoId: "e6" });
assert.equal(b6.t.agente_execucoes[0].estado, "pausada");
assert.equal(b6.t.agente_passos.length, 0);

console.log("ok agentes-motor");
