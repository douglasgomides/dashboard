// Motor SAP com banco/provedor falsos: tarefas idempotentes, vínculo exato, evidência atual e nenhuma escrita externa.
import assert from "node:assert/strict";
import { situacaoCriticos } from "../src/lib/agente-acessos";
import { ITENS_ACESSO } from "../src/lib/sap-acessos";
type Linha = Record<string, any>;
const CLI = "11111111-1111-4111-8111-111111111111", CLIN = "22222222-2222-4222-8222-222222222222";
const TASK = "task_acessos_5", FOLDER = "12345", atualizado = "2026-10-16T12:00:00.000Z";
const criticos = ITENS_ACESSO.filter((i) => i.prazo === "C"), todos = criticos.map((c) => c.id);
const acessos = (confirmados: string[]) => criticos.map((c) => ({ clinica_id: CLIN, item: c.id, status: confirmados.includes(c.id) ? "confirmado" : "pendente",
  confirmado_em: confirmados.includes(c.id) ? "2026-10-16" : null, confirmado_por: confirmados.includes(c.id) ? "Ana" : null, observacao: null, revogado_em: null, atualizado_em: atualizado }));
const novaExec = () => ({ id: crypto.randomUUID(), client_id: CLI, agente: "operations", fluxo: "acessos_criticos", objetivo: "x", estado: "pendente", passo_atual: 0,
  contexto: {} as Linha, tentativas: 0, custo_usd: 0, teto_custo_usd: 0.5, atualizado_em: new Date().toISOString(), proximo_em: "", lease_ate: "", erro: "", resultado: {} as Linha });
const seed = (confirmados: string[]) => ({ sap_clinicas: [{ id: CLIN, client_id: CLI, nome: "CLÍNICA FICTÍCIA SAP", d0: "2026-10-15", created_at: atualizado, clickup_folder_id: FOLDER }],
  sap_acessos: acessos(confirmados), sap_marco_vinculos: [{ clinica_id: CLIN, marco: 5, clickup_task_id: TASK, atualizado_em: atualizado }] });
function bancoFalso(dados: Record<string, Linha[]>) {
  const t: Record<string, Linha[]> = { agente_execucoes: [], agente_passos: [], aprovacoes: [], ia_execucoes: [], sap_eventos: [], sap_acoes: [], marcados: [], ...dados };
  let seq = 0, provasAntesDoMarco = 0;
  const falhas = { evento: false, vinculo: false, operacao: false, revogarAoMarcar: false };
  const falhasBanco: { tabela: string; op: string; quando: (v: Linha) => boolean }[] = [];
  const falharBanco = (tabela: string, op: "insert" | "update" | "select", quando = (_v: Linha) => true) => { falhasBanco.push({ tabela, op, quando }); };
  const erroBanco = (tabela: string, op: string, v: Linha = {}) => {
    const i = falhasBanco.findIndex((f) => f.tabela === tabela && f.op === op && f.quando(v));
    if (i < 0) return null;
    falhasBanco.splice(i, 1); return { message: `falha simulada ${tabela}/${op}`, code: "XX000" };
  };
  function query(nome: string) {
    const filtros: ((r: Linha) => boolean)[] = [];
    let ordem: [string, boolean] | null = null, lim: number | null = null, alteracao: Linha | null = null;
    const linhas = () => {
      let r = (t[nome] ??= []).filter((x) => filtros.every((f) => f(x)));
      if (ordem) { const [c, asc] = ordem; r = [...r].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
      return lim ? r.slice(0, lim) : r;
    };
    const ler = () => {
      const error = erroBanco(nome, "select");
      if (error) return { data: null, error };
      return nome === "sap_marco_vinculos" && falhas.vinculo ? { data: null, error: { message: "falha de leitura do vínculo" } } : { data: linhas(), error: null };
    };
    const executar = () => {
      if (alteracao) {
        const error = erroBanco(nome, "update", alteracao);
        if (error) return { data: null, error };
        const afetadas = linhas();
        for (const r of afetadas) Object.assign(r, structuredClone(alteracao));
        return { data: afetadas, error: null };
      }
      return ler();
    };
    const q: any = {
      select: () => q, eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; }, gte: (c: string, v: string) => { filtros.push((r) => r[c] >= v); return q; }, not: () => q,
      order: (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q; }, limit: (n: number) => { lim = n; return q; },
      maybeSingle: async () => { const r = executar(); return r.error ? r : { data: r.data?.[0] ?? null, error: null }; }, update: (v: Linha) => { alteracao = v; return q; },
      insert: async (v: Linha) => {
        const error = erroBanco(nome, "insert", v); if (error) return { error };
        if (nome === "sap_eventos" && falhas.evento) { falhas.evento = false; return { error: { message: "falha simulada de rede" } }; }
        if (nome === "agente_passos" && v.chave_idempotencia && t.agente_passos.some((p) => p.chave_idempotencia === v.chave_idempotencia)) return { error: { message: "duplicate key", code: "23505" } };
        if (nome === "aprovacoes" && t.aprovacoes.some((a) => a.execucao_id === v.execucao_id && a.passo === v.passo && a.estado === "pendente")) return { error: { message: "duplicate key", code: "23505" } };
        seq++; (t[nome] ??= []).push({ id: v.id ?? crypto.randomUUID(), criado_em: new Date(Date.now() + seq).toISOString(), estado: nome === "aprovacoes" ? "pendente" : v.estado, ...structuredClone(v) }); return { error: null };
      },
      then: (res: (x: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(executar()).then(res, rej),
    }; return q;
  }
  const admin: any = { from: query, rpc: async (fn: string, a: Linha) => {
    if (fn === "agentes_reservar") {
      const e = t.agente_execucoes.find((x) => (!a.p_execucao || x.id === a.p_execucao) && (x.estado === "pendente" || (x.estado === "aguardando" && Date.parse(x.proximo_em) <= Date.now()) || (x.estado === "rodando" && Date.parse(x.lease_ate) < Date.now())));
      if (!e) return { data: [], error: null };
      Object.assign(e, { estado: "rodando", lease_ate: new Date(Date.now() + a.p_lease_segundos * 1000).toISOString(), tentativas: e.tentativas + 1 }); return { data: [structuredClone(e)], error: null };
    }
    if (fn === "operacao_sap_conferir") {
      if (falhas.operacao) return { data: null, error: { message: "não foi possível conferir as ações" } };
      const s = situacaoCriticos((t.sap_acessos ?? []).filter((r) => r.clinica_id === a.p_clinica_id) as any);
      for (const item of s.pendentes) {
        const codigo = `agente_acesso_${item.id}`, existente = t.sap_acoes.find((x) => x.clinica_id === a.p_clinica_id && x.codigo === codigo);
        if (existente) existente.status = "aberta";
        else t.sap_acoes.push({ id: crypto.randomUUID(), clinica_id: a.p_clinica_id, codigo, texto: item.nome, responsavel: item.quem.includes("Tráfego") ? "Ana · Tráfego" : "Bia · Onboarding", prazo: "2026-10-22", status: "aberta" });
      }
      for (const x of t.sap_acoes) if (x.clinica_id === a.p_clinica_id && !s.pendentes.some((p) => x.codigo === `agente_acesso_${p.id}`)) x.status = "feita";
      return { data: { pendentes: s.pendentes.length, resolvidos: s.resolvidos.length, acoes: t.sap_acoes.filter((x) => x.clinica_id === a.p_clinica_id), proximo_passo: s.pendentes.length ? "Responsáveis: concluir as ações de acesso no prazo registrado." : "Coordenador: conferir os demais pré-requisitos e preparar a Sessão 1." }, error: null };
    }
    if (fn === "agentes_marcar_marco") {
      const ap = t.aprovacoes.find((x) => x.id === a.p_aprovacao && x.estado === "aprovada" && x.passo === "aprovar_marco"), exec = t.agente_execucoes.find((x) => x.id === ap?.execucao_id && x.client_id === CLI);
      if (!ap || !exec || a.p_clinica_id !== CLIN || a.p_marco !== 5 || ap.proposta.marco !== 5) return { error: { message: "sem aprovação válida vinculada" } };
      const prova = exec.contexto.clickup_confirmado;
      assert.deepEqual({ task_id: prova?.task_id, folder_id: prova?.folder_id, status: prova?.status }, { task_id: TASK, folder_id: FOLDER, status: "closed" });
      assert.ok(Date.now() - Date.parse(prova.em) < 10 * 60_000); provasAntesDoMarco++;
      if (falhas.revogarAoMarcar) t.sap_acessos[0].revogado_em = "2026-10-17";
      if (situacaoCriticos(t.sap_acessos as any).pendentes.length) return { error: { message: "acesso pendente na conferência transacional" } };
      if (!t.marcados.some((x) => x.aprovacao === ap.id)) t.marcados.push({ aprovacao: ap.id, marco: a.p_marco, evidencia: a.p_evidencia, clinica: a.p_clinica_id }); return { error: null };
    }
    throw new Error(`RPC inesperada: ${fn}`);
  } };
  const decidir = (passo: string, estado: string, comentario: string | null = null) => {
    const ap = t.aprovacoes.find((x) => x.passo === passo && x.estado === "pendente")!; assert.ok(ap, `aprovação pendente de ${passo}`);
    Object.assign(ap, { estado, comentario, decidido_por: "admin-ficticio" }); const e = t.agente_execucoes.find((x) => x.id === ap.execucao_id)!;
    if (estado === "rejeitada") Object.assign(e, { estado: "cancelada" }); else Object.assign(e, { estado: "pendente", proximo_em: null, contexto: estado === "correcao" ? { ...e.contexto, correcao: comentario } : e.contexto });
  }; return { t, admin, decidir, falhas, falharBanco, provas: () => provasAntesDoMarco };
}
const originalFetch = globalThis.fetch, env = { ...process.env };
let tipoStatus = "closed", pasta: string | null = FOLDER, idRetornado = TASK, usarProject = false, respostaHttp = 200;
const chamadas: string[] = [];
try {
  delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY; process.env.CLICKUP_API_TOKEN = "token-ficticio";
  globalThis.fetch = async (input, init) => {
    const url = String(input); assert.equal(url, `https://api.clickup.com/api/v2/task/${TASK}`, "nenhuma busca por nome, outra tarefa ou escrita externa é permitida");
    assert.equal(init?.method ?? "GET", "GET"); assert.equal(init?.redirect, "error"); assert.ok(init?.signal instanceof AbortSignal); chamadas.push(url);
    return new Response(JSON.stringify({ id: idRetornado, status: { status: "Texto livre não prova fechamento", type: tipoStatus }, ...(pasta === null ? { parent: FOLDER } : usarProject ? { project: { id: pasta } } : { folder: { id: pasta } }) }), { status: respostaHttp, headers: { "content-type": "application/json" } });
  };
  const { rodarAgentes, FLUXOS, FERRAMENTAS } = await import("../api/_lib/agentes");
  const timersAntes = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  const iniciar = (confirmados = todos) => { const b = bancoFalso(seed(confirmados)), e = novaExec(); b.t.agente_execucoes.push(e); return { ...b, e }; };
  const rodar = (b: ReturnType<typeof iniciar>, maxPassos = 8) => rodarAgentes(b.admin, { execucaoId: b.e.id, maxPassos });
  const acordar = (b: ReturnType<typeof iniciar>) => { b.e.proximo_em = new Date(Date.now() - 1000).toISOString(); };
  // Preparação: uma tarefa por acesso, aprovação sem envio e nenhum POST.
  const b = iniciar(["A1", "A2"]); tipoStatus = "open"; await rodar(b);
  assert.equal(b.e.estado, "aguardando_aprovacao"); assert.equal(b.t.aprovacoes.length, 1); assert.equal(b.t.sap_acoes.length, criticos.length - 2);
  assert.ok(b.t.sap_acoes.every((a) => a.codigo.startsWith("agente_acesso_") && a.responsavel && a.prazo)); assert.equal(b.t.sap_eventos.length, 0);
  assert.ok(!b.t.aprovacoes[0].proposta.mensagem.includes(criticos[0].nome)); assert.match(b.t.aprovacoes[0].resumo, /envio.*não está confirmado/);
  assert.equal((await rodar(b)).execucoes.length, 0); b.decidir("aprovar_cobranca", "correcao", "Mais curto, por favor"); await rodar(b);
  assert.equal(b.t.aprovacoes[1].proposta.rodada, 2); assert.equal(b.t.sap_acoes.length, criticos.length - 2, "reconferir não duplica tarefas");
  b.decidir("aprovar_cobranca", "aprovada"); await rodar(b); assert.equal(b.e.estado, "aguardando"); assert.equal(b.t.sap_eventos[0].tipo, "agente_acessos_mensagem_aprovada");
  assert.equal(b.t.sap_eventos[0].payload.envio_confirmado, false); assert.match(b.t.sap_eventos[0].payload.estado, /envio não confirmado/); assert.ok(Date.parse(b.e.proximo_em) > Date.now() + 23 * 3600_000);
  Object.assign(b.e, { estado: "rodando", lease_ate: new Date(Date.now() - 1000).toISOString(), passo_atual: 4 }); await rodar(b); assert.equal(b.t.sap_eventos.length, 1, "retomada não repete evento confirmado");
  // Checklist completo + tarefa exata fechada + aprovação: conclui com prova e próximo responsável.
  b.t.sap_acessos = acessos(todos); tipoStatus = "closed"; acordar(b); await rodar(b); assert.equal(b.e.estado, "aguardando_aprovacao"); assert.equal(b.t.marcados.length, 0);
  b.decidir("aprovar_marco", "aprovada"); await rodar(b); assert.equal(b.e.estado, "concluida"); assert.equal(b.t.marcados.length, 1); assert.ok(b.provas() > 0);
  assert.match(b.e.resultado.proximo_passo, /Coordenador.*Sessão 1/); assert.equal(b.e.resultado.clickup.task_id, TASK); assert.equal(b.e.resultado.clickup.status_type, "closed"); assert.equal(b.e.resultado.envio_confirmado, false);
  Object.assign(b.e, { estado: "rodando", lease_ate: new Date(Date.now() - 1000).toISOString(), passo_atual: 7 }); await rodar(b); assert.equal(b.t.marcados.length, 1, "RPC idempotente por aprovação aplicada");
  // Configuração e identidade são bloqueios visíveis, sem concluir ou aprovar o marco.
  for (const caso of ["vinculo", "token", "pasta", "pasta_errada", "sem_pasta", "outra_tarefa", "aberta", "http"]) {
    const c = iniciar(); pasta = FOLDER; idRetornado = TASK; tipoStatus = "closed"; respostaHttp = 200;
    if (caso === "vinculo") c.t.sap_marco_vinculos = []; if (caso === "token") delete process.env.CLICKUP_API_TOKEN;
    if (caso === "pasta") c.t.sap_clinicas[0].clickup_folder_id = null; if (caso === "pasta_errada") pasta = "99999";
    if (caso === "sem_pasta") pasta = null; if (caso === "outra_tarefa") idRetornado = "outra-tarefa"; if (caso === "aberta") tipoStatus = "open"; if (caso === "http") respostaHttp = 401;
    await rodar(c); assert.equal(c.e.estado, "aguardando", caso); assert.ok(c.e.erro && c.e.erro.length > 10, caso); assert.equal(c.t.marcados.length, 0, caso); assert.equal(c.t.aprovacoes.length, 0, caso); process.env.CLICKUP_API_TOKEN = "token-ficticio";
  }
  pasta = FOLDER; idRetornado = TASK; tipoStatus = "closed"; respostaHttp = 200; usarProject = true;
  const legadoPasta = iniciar(); await rodar(legadoPasta); assert.equal(legadoPasta.e.estado, "aguardando_aprovacao", "project identifica a pasta no formato legado"); usarProject = false;
  // Revogação, edição da evidência, troca do vínculo e reabertura após aprovação.
  for (const caso of ["revogado", "autor", "atualizado", "vinculo_atualizado", "reaberta"]) {
    const c = iniciar(); await rodar(c); c.decidir("aprovar_marco", "aprovada");
    if (caso === "revogado") c.t.sap_acessos[0].revogado_em = "2026-10-17"; if (caso === "autor") c.t.sap_acessos[0].confirmado_por = "Outra pessoa";
    if (caso === "atualizado") c.t.sap_acessos[0].atualizado_em = new Date().toISOString(); if (caso === "vinculo_atualizado") c.t.sap_marco_vinculos[0].atualizado_em = new Date().toISOString(); if (caso === "reaberta") tipoStatus = "open";
    await rodar(c); assert.notEqual(c.e.estado, "concluida", caso); assert.equal(c.t.marcados.length, 0, caso); tipoStatus = "closed";
  }
  for (const extra of [{ confirmado_por: null }, { confirmado_em: null }, { confirmado_em: "2999-01-01" }, { status: "nao_se_aplica", observacao: "abc" }]) {
    const c = iniciar(); Object.assign(c.t.sap_acessos[0], extra); await rodar(c); assert.equal(c.t.marcados.length, 0); assert.ok(c.t.aprovacoes.every((a) => a.passo !== "aprovar_marco")); assert.ok(c.t.sap_acoes.some((a) => a.codigo === "agente_acesso_A1" && a.status === "aberta"));
  }
  const dispensa = iniciar(); Object.assign(dispensa.t.sap_acessos[0], { status: "nao_se_aplica", observacao: "Dispensa justificada pela equipe" }); await rodar(dispensa); assert.equal(dispensa.e.estado, "aguardando_aprovacao"); assert.match(dispensa.t.aprovacoes[0].proposta.evidencia, /Dispensa justificada/);
  // Contexto e cache antigos não provam o ciclo novo; retomada no último índice pede conferência/aprovação.
  const antiga = iniciar(); Object.assign(antiga.e, { passo_atual: 8, contexto: { clinica_id: CLIN, resolvidos: todos, evidencia: "evidência antiga" } }); await rodar(antiga); assert.equal(antiga.e.estado, "aguardando_aprovacao"); assert.equal(antiga.t.marcados.length, 0); antiga.decidir("aprovar_marco", "aprovada"); await rodar(antiga); assert.equal(antiga.e.estado, "concluida");
  // Prova vencida volta ao passo de aprovação para renovação, sem perder aprovação válida.
  const retomar = iniciar(); await rodar(retomar); retomar.decidir("aprovar_marco", "aprovada"); await rodar(retomar, 1); assert.equal(retomar.e.passo_atual, 7);
  retomar.e.contexto.clickup_confirmado.em = new Date(Date.now() - 11 * 60_000).toISOString(); await rodar(retomar, 1); assert.equal(retomar.e.passo_atual, 6); assert.equal(retomar.t.marcados.length, 0); await rodar(retomar); assert.equal(retomar.e.estado, "concluida"); assert.ok(Date.now() - Date.parse(retomar.e.contexto.clickup_confirmado.em) < 60_000);
  for (const caso of ["vinculo", "operacao"] as const) { const c = iniciar(); c.falhas[caso] = true; await rodar(c); assert.notEqual(c.e.estado, "concluida"); assert.equal(c.t.marcados.length, 0); }
  const corrida = iniciar(); await rodar(corrida); corrida.decidir("aprovar_marco", "aprovada"); corrida.falhas.revogarAoMarcar = true; await rodar(corrida); assert.equal(corrida.t.marcados.length, 0, "conferência SQL também barra revogação entre API e marcação"); assert.notEqual(corrida.e.estado, "concluida");
  const rejeitada = iniciar([]); await rodar(rejeitada); rejeitada.decidir("aprovar_cobranca", "rejeitada", "não agora"); await rodar(rejeitada); assert.equal(rejeitada.e.estado, "cancelada"); assert.equal(rejeitada.t.sap_eventos.length, 0);
  const falhaEvento = iniciar([]); await rodar(falhaEvento); falhaEvento.decidir("aprovar_cobranca", "aprovada"); falhaEvento.falhas.evento = true; await rodar(falhaEvento); assert.equal(falhaEvento.e.estado, "aguardando"); assert.match(falhaEvento.e.erro, /falha simulada/); acordar(falhaEvento); await rodar(falhaEvento); assert.equal(falhaEvento.t.sap_eventos.length, 1);
  const teto = iniciar(); teto.e.custo_usd = 0.5; await rodar(teto); assert.equal(teto.e.estado, "pausada"); assert.equal(teto.t.agente_passos.length, 0); assert.ok(chamadas.length > 0);
  // Queda antes de salvar o contexto: leases antigos também respeitam o limite.
  const travada = iniciar(); Object.assign(travada.e, { estado: "rodando", tentativas: 25, lease_ate: new Date(Date.now() - 1000).toISOString() });
  const chamadasAntes = chamadas.length; await rodar(travada);
  assert.equal(travada.e.estado, "falhou"); assert.match(travada.e.erro, /Limite de tentativas/);
  assert.equal(travada.t.agente_passos.length, 0); assert.equal(travada.e.lease_ate, null); assert.equal(chamadas.length, chamadasAntes);
  const ultimaTentativa = iniciar(); ultimaTentativa.e.tentativas = 2; await rodar(ultimaTentativa);
  assert.equal(ultimaTentativa.e.estado, "aguardando_aprovacao", "a terceira tentativa ainda pode progredir");

  // Fluxos locais mínimos exercitam o motor sem IA nem efeitos externos.
  FLUXOS.__teste_contexto = { id: "__teste_contexto", agente: "teste", nome: "Teste", objetivo: "Teste", passos: [
    { nome: "gravar", descricao: "Teste", risco: "baixo", idempotente: true, executar: async (c) => {
      const { error } = await c.admin.from("efeitos_teste").insert({ execucao_id: c.exec.id }); if (error) throw new Error(error.message);
      await c.admin.from("ia_execucoes").insert({ execucao_id: c.exec.id, custo_usd: 0.02 });
      return { tipo: "seguir", contexto: { gravadas: 7 }, irPara: "terminar" };
    } },
    { nome: "nao_executar", descricao: "Teste", risco: "baixo", executar: async () => { throw new Error("O salto persistido foi perdido"); } },
    { nome: "terminar", descricao: "Teste", risco: "baixo", executar: async (c) => ({ tipo: "concluir", resultado: { gravadas: c.exec.contexto.gravadas } }) },
  ] };
  FLUXOS.__teste_concluir = { id: "__teste_concluir", agente: "teste", nome: "Teste", objetivo: "Teste", passos: [
    { nome: "gravar", descricao: "Teste", risco: "baixo", idempotente: true, executar: async (c) => {
      const { error } = await c.admin.from("efeitos_teste").insert({ execucao_id: c.exec.id }); if (error) throw new Error(error.message);
      return { tipo: "concluir", resultado: { entrega: "confirmada" } };
    } },
  ] };
  const generico = (fluxo = "__teste_contexto") => { const c = iniciar(); c.e.fluxo = fluxo; return c; };
  const expirar = (c: ReturnType<typeof iniciar>) => { c.e.lease_ate = new Date(Date.now() - 1000).toISOString(); };

  const estadoFalhou = generico(); estadoFalhou.falharBanco("agente_execucoes", "update", (v) => v.passo_atual === 2);
  await assert.rejects(() => rodar(estadoFalhou), /persistir o estado/);
  assert.equal(estadoFalhou.e.passo_atual, 0); assert.equal(estadoFalhou.e.contexto.gravadas, undefined);
  assert.equal(estadoFalhou.t.efeitos_teste.length, 1); assert.equal(estadoFalhou.e.estado, "rodando");
  expirar(estadoFalhou); await rodar(estadoFalhou);
  assert.equal(estadoFalhou.e.estado, "concluida"); assert.deepEqual(estadoFalhou.e.resultado, { gravadas: 7 });
  assert.equal(estadoFalhou.e.custo_usd, 0.02, "retomada não perde nem cobra novamente custo já registrado");
  assert.equal(estadoFalhou.t.efeitos_teste.length, 1, "cache recupera contexto e salto sem repetir a ação");

  const concluirFalhou = generico("__teste_concluir"); concluirFalhou.falharBanco("agente_execucoes", "update", (v) => v.estado === "concluida");
  await assert.rejects(() => rodar(concluirFalhou), /persistir o estado/); assert.equal(concluirFalhou.e.estado, "rodando");
  expirar(concluirFalhou); await rodar(concluirFalhou);
  assert.equal(concluirFalhou.e.estado, "concluida"); assert.deepEqual(concluirFalhou.e.resultado, { entrega: "confirmada" });
  assert.equal(concluirFalhou.t.efeitos_teste.length, 1, "resultado concluir também deve ser restaurado integralmente");

  // Um cache legado ou adulterado não prova contexto/resultado e exige conferência.
  for (const saida of [{ gravadas: 7 }, { __motor: { versao: 1, ordem: 0, nome: "gravar", custo_usd: 0, resultado: { tipo: "aguardar", minutos: 60, motivo: "não terminou" } } }]) {
    const c = generico(); c.t.agente_passos.push({ execucao_id: c.e.id, chave_idempotencia: `${c.e.id}:gravar:0`, ok: true, saida });
    await rodar(c); assert.equal(c.e.estado, "pausada"); assert.equal(c.e.passo_atual, 0); assert.equal(c.t.efeitos_teste, undefined);
  }
  let esperou = false;
  FLUXOS.__teste_espera = { id: "__teste_espera", agente: "teste", nome: "Teste", objetivo: "Teste", passos: [
    { nome: "esperar", descricao: "Teste", risco: "baixo", idempotente: true, executar: async () => {
      if (!esperou) { esperou = true; return { tipo: "aguardar", minutos: 1, motivo: "condição ainda pendente" }; }
      return { tipo: "concluir", resultado: { condicao: "conferida" } };
    } },
  ] };
  const espera = generico("__teste_espera"); await rodar(espera); assert.equal(espera.e.estado, "aguardando");
  assert.ok(espera.t.agente_passos.every((p) => !p.chave_idempotencia), "aguardar não é cache de conclusão");
  acordar(espera); await rodar(espera); assert.deepEqual(espera.e.resultado, { condicao: "conferida" });

  const logFalhou = iniciar(); logFalhou.falharBanco("agente_passos", "insert", (v) => v.nome === "ler_dados");
  const antesLog = chamadas.length;
  await assert.rejects(() => rodar(logFalhou), /persistir o passo/);
  assert.equal(logFalhou.e.passo_atual, 0); assert.equal(logFalhou.e.estado, "rodando"); assert.equal(chamadas.length, antesLog);
  expirar(logFalhou); await rodar(logFalhou); assert.equal(logFalhou.e.estado, "aguardando_aprovacao");

  const logErroFalhou = iniciar(); logErroFalhou.falhas.operacao = true; logErroFalhou.falharBanco("agente_passos", "insert", (v) => v.ok === false);
  await assert.rejects(() => rodar(logErroFalhou), /registrar a falha/); assert.equal(logErroFalhou.e.estado, "rodando"); assert.equal(logErroFalhou.e.passo_atual, 0);
  const custoFalhou = generico(); custoFalhou.falharBanco("ia_execucoes", "select");
  await assert.rejects(() => rodar(custoFalhou), /verificar o custo/); assert.equal(custoFalhou.t.efeitos_teste, undefined);
  const custoInvalido = generico(); custoInvalido.t.ia_execucoes.push({ execucao_id: custoInvalido.e.id, custo_usd: "NaN" });
  await assert.rejects(() => rodar(custoInvalido), /Custo do agente inválido/); assert.equal(custoInvalido.t.efeitos_teste, undefined);
  const cacheFalhou = generico(); cacheFalhou.falharBanco("agente_passos", "select"); await rodar(cacheFalhou);
  assert.equal(cacheFalhou.e.estado, "aguardando"); assert.equal(cacheFalhou.e.passo_atual, 0); assert.equal(cacheFalhou.t.efeitos_teste, undefined);

  const aprovacaoFalhou = iniciar(); aprovacaoFalhou.falharBanco("aprovacoes", "insert");
  await assert.rejects(() => rodar(aprovacaoFalhou), /persistir a aprovação/);
  assert.equal(aprovacaoFalhou.e.estado, "rodando"); assert.equal(aprovacaoFalhou.t.aprovacoes.length, 0);
  expirar(aprovacaoFalhou); await rodar(aprovacaoFalhou); assert.equal(aprovacaoFalhou.e.estado, "aguardando_aprovacao");
  const estadoAprovacaoFalhou = iniciar(); estadoAprovacaoFalhou.falharBanco("agente_execucoes", "update", (v) => v.estado === "aguardando_aprovacao");
  await assert.rejects(() => rodar(estadoAprovacaoFalhou), /persistir o estado/);
  assert.equal(estadoAprovacaoFalhou.t.aprovacoes.length, 1); assert.equal(estadoAprovacaoFalhou.e.estado, "rodando");
  expirar(estadoAprovacaoFalhou); await rodar(estadoAprovacaoFalhou);
  assert.equal(estadoAprovacaoFalhou.t.aprovacoes.length, 1, "conflito SQLSTATE23505 só reutiliza aprovação pendente existente");
  assert.equal(estadoAprovacaoFalhou.e.estado, "aguardando_aprovacao");
  const leituraAprovacaoFalhou = iniciar(); await rodar(leituraAprovacaoFalhou); leituraAprovacaoFalhou.decidir("aprovar_marco", "aprovada"); leituraAprovacaoFalhou.falharBanco("aprovacoes", "select"); await rodar(leituraAprovacaoFalhou);
  assert.equal(leituraAprovacaoFalhou.e.estado, "aguardando"); assert.equal(leituraAprovacaoFalhou.t.marcados.length, 0); assert.equal(leituraAprovacaoFalhou.t.aprovacoes.length, 1);

  const cancelada = generico("__teste_cancelar");
  FLUXOS.__teste_cancelar = { id: "__teste_cancelar", agente: "teste", nome: "Teste", objetivo: "Teste", passos: [
    { nome: "cancelar", descricao: "Teste", risco: "baixo", executar: async () => { cancelada.e.estado = "cancelada"; return { tipo: "concluir", resultado: { indevido: true } }; } },
  ] };
  await assert.rejects(() => rodar(cancelada), /não está mais disponível/); assert.equal(cancelada.e.estado, "cancelada"); assert.deepEqual(cancelada.e.resultado, {});

  const ferramenta = FERRAMENTAS["sap.ler_clinica"], executarAntes = ferramenta.executar, timeoutAntes = ferramenta.timeoutMs;
  try {
    ferramenta.timeoutMs = 1; ferramenta.executar = async () => new Promise(() => {});
    const timeout = iniciar(); await rodar(timeout); assert.equal(timeout.e.estado, "aguardando"); assert.match(timeout.e.erro, /passou de/);
  } finally { ferramenta.timeoutMs = timeoutAntes; ferramenta.executar = executarAntes; }
  assert.ok(process.getActiveResourcesInfo().filter((r) => r === "Timeout").length <= timersAntes, "timers das ferramentas devem ser limpos em sucesso, erro e timeout");
  for (const nome of ["__teste_contexto", "__teste_concluir", "__teste_espera", "__teste_cancelar"]) delete FLUXOS[nome];
  console.log("ok agentes-motor (SAP verificável, falhas de persistência, retomada com contexto/resultado, custo e timers limpos)");
} finally { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); }
