/**
 * Agentic Core · motor de execução, registro de ferramentas e fluxos (docs/sap/arquitetura-hub-sap.md, seção 3).
 * Chamado por api/sync/manual.ts (alvo "agentes", só admin): o plano da Vercel aceita no máximo 12 funções.
 *
 * Como funciona:
 * - Cada fluxo é uma sequência fixa de passos (a IA escreve texto; não decide o processo).
 * - A execução fica no banco (agente_execucoes) com o passo atual e o contexto. agentes_reservar dá posse com prazo:
 *   se o servidor cair no meio, o prazo vence e a próxima chamada retoma do passo salvo.
 * - Todo passo vira uma linha em agente_passos (entrada, saída, erro, custo, tempo). Passo com efeito fora do banco
 *   usa chave de idempotência: se já rodou com sucesso, não roda de novo (não duplica comentário nem marcação).
 * - Ação de risco médio/alto vira item em aprovacoes e a execução para até alguém decidir na Central de Agentes.
 * - Erro: até 3 tentativas com espera crescente; depois a execução fica "falhou" e aparece na fila de exceções.
 * - Teto de custo de IA por execução: estourou, a execução pausa.
 * - Nada é enviado à clínica ou ao paciente pelo agente: mensagens externas são aprovadas e enviadas por uma pessoa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { chamarIAJson, iaDisponivel } from "./ia.js";
import { MARCO_ACESSOS, evidenciaCriticos, mensagemPadrao, mensagemValida, situacaoCriticos, type ItemConfirmado, type ItemPendente } from "../../src/lib/agente-acessos.js";

type Admin = SupabaseClient<any, any, any>;
type Risco = "baixo" | "medio" | "alto";

export interface Execucao {
  id: string; client_id: string; agente: string; fluxo: string; objetivo: string; estado: string; passo_atual: number;
  contexto: Record<string, any>; tentativas: number; custo_usd: number; teto_custo_usd: number;
}

// ---------------------------------------------------------------- registro de ferramentas
// Cada ferramenta declara esquema de entrada, risco, se mexe fora do banco e quanto tempo pode levar. A execução valida
// a entrada antes de chamar; erro de validação é falha do passo (registrada), nunca chamada com dado ruim.
interface Ferramenta<E extends z.ZodTypeAny> {
  nome: string; descricao: string; risco: Risco; externa: boolean; timeoutMs: number;
  entrada: E;
  executar: (admin: Admin, exec: Execucao, e: z.infer<E>) => Promise<any>;
}
function ferramenta<E extends z.ZodTypeAny>(f: Ferramenta<E>) { return f; }

const clickupToken = () => process.env.CLICKUP_API_TOKEN || "";

export const FERRAMENTAS = {
  "sap.ler_clinica": ferramenta({
    nome: "sap.ler_clinica", descricao: "Dados da clínica no SAP (nome, D0, pasta do ClickUp).", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => {
      const { data, error } = await admin.from("sap_clinicas").select("id, nome, d0, especialidade, cidade, clickup_folder_id").eq("client_id", e.client_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  }),
  "sap.ler_acessos": ferramenta({
    nome: "sap.ler_acessos", descricao: "Checklist de acessos 02.05 da clínica.", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ clinica_id: z.string().uuid() }),
    executar: async (admin, _x, e) => {
      const { data, error } = await admin.from("sap_acessos").select("item, status, confirmado_em, confirmado_por, observacao, revogado_em").eq("clinica_id", e.clinica_id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  }),
  "sap.registrar_evento": ferramenta({
    nome: "sap.registrar_evento", descricao: "Registra um evento da clínica (sap_eventos).", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ clinica_id: z.string().uuid(), tipo: z.string().regex(/^agente_[a-z_]{3,40}$/), payload: z.record(z.any()) }),
    executar: async (admin, _x, e) => {
      const { error } = await admin.from("sap_eventos").insert({ clinica_id: e.clinica_id, tipo: e.tipo, payload: e.payload });
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  }),
  "sap.marcar_marco": ferramenta({
    nome: "sap.marcar_marco", descricao: "Marca um item do cronograma como feito, em nome de quem aprovou (exige evidência).", risco: "medio", externa: false, timeoutMs: 10_000,
    entrada: z.object({ aprovacao_id: z.string().uuid(), clinica_id: z.string().uuid(), marco: z.number().int().min(1).max(35), evidencia: z.string().min(10) }),
    executar: async (admin, _x, e) => {
      const { error } = await admin.rpc("agentes_marcar_marco", { p_aprovacao: e.aprovacao_id, p_clinica_id: e.clinica_id, p_marco: e.marco, p_evidencia: e.evidencia });
      if (error) throw new Error(error.message);
      return { ok: true };
    },
  }),
  "ia.gerar_json": ferramenta({
    nome: "ia.gerar_json", descricao: "Texto ou classificação por IA, com custo registrado.", risco: "baixo", externa: true, timeoutMs: 50_000,
    entrada: z.object({ sistema: z.string().min(20), entrada: z.string().min(1).max(20_000), finalidade: z.string() }),
    executar: async (admin, exec, e) => chamarIAJson(admin, { sistema: e.sistema, entrada: e.entrada, finalidade: e.finalidade, clientId: exec.client_id, execucaoId: exec.id, maxTokens: 700 }),
  }),
  // ClickUp: API oficial v2 com token pessoal (CLICKUP_API_TOKEN no servidor). Sem token, a ferramenta responde
  // "não configurada" e o fluxo segue registrando isso; nunca finge que leu ou comentou.
  "clickup.ler_tarefas": ferramenta({
    nome: "clickup.ler_tarefas", descricao: "Tarefas abertas da pasta da clínica no ClickUp.", risco: "baixo", externa: true, timeoutMs: 20_000,
    entrada: z.object({ folder_id: z.string().regex(/^\d+$/).nullable(), contem: z.string().min(3) }),
    executar: async (_a, _x, e) => {
      if (!clickupToken()) return { configurada: false, motivo: "CLICKUP_API_TOKEN não configurado no servidor" };
      if (!e.folder_id) return { configurada: false, motivo: "clínica sem pasta do ClickUp (clickup_folder_id)" };
      const h = { authorization: clickupToken() };
      const listas = await fetch(`https://api.clickup.com/api/v2/folder/${e.folder_id}/list`, { headers: h, signal: AbortSignal.timeout(15_000) });
      if (!listas.ok) throw new Error(`ClickUp respondeu ${listas.status} ao listar as listas`);
      const lj = (await listas.json()) as { lists?: { id: string }[] };
      const tarefas: { id: string; nome: string; status: string; url: string; prazo: string | null }[] = [];
      for (const l of lj.lists ?? []) {
        const r = await fetch(`https://api.clickup.com/api/v2/list/${l.id}/task?archived=false`, { headers: h, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`ClickUp respondeu ${r.status} ao ler tarefas`);
        const j = (await r.json()) as { tasks?: { id: string; name: string; status?: { status?: string }; url: string; due_date?: string | null }[] };
        for (const t of j.tasks ?? []) if (t.name.toLowerCase().includes(e.contem.toLowerCase()))
          tarefas.push({ id: t.id, nome: t.name, status: t.status?.status ?? "", url: t.url, prazo: t.due_date ? new Date(+t.due_date).toISOString().slice(0, 10) : null });
      }
      return { configurada: true, tarefas };
    },
  }),
  "clickup.comentar": ferramenta({
    nome: "clickup.comentar", descricao: "Comenta numa tarefa do ClickUp ligada ao item do SAP.", risco: "baixo", externa: true, timeoutMs: 15_000,
    entrada: z.object({ task_id: z.string().min(3).nullable(), texto: z.string().min(5).max(2000) }),
    executar: async (_a, _x, e) => {
      if (!clickupToken()) return { configurada: false, motivo: "CLICKUP_API_TOKEN não configurado no servidor" };
      if (!e.task_id) return { configurada: false, motivo: "nenhuma tarefa do ClickUp ligada a este item" };
      const r = await fetch(`https://api.clickup.com/api/v2/task/${e.task_id}/comment`, {
        method: "POST", headers: { authorization: clickupToken(), "content-type": "application/json" },
        body: JSON.stringify({ comment_text: e.texto, notify_all: false }), signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`ClickUp respondeu ${r.status} ao comentar`);
      return { configurada: true, ok: true };
    },
  }),
} as const;
type NomeFerramenta = keyof typeof FERRAMENTAS;

async function usar<N extends NomeFerramenta>(admin: Admin, exec: Execucao, nome: N, entrada: z.infer<(typeof FERRAMENTAS)[N]["entrada"]>): Promise<any> {
  const f = FERRAMENTAS[nome] as Ferramenta<any>;
  const e = f.entrada.parse(entrada);
  return await Promise.race([
    f.executar(admin, exec, e),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${nome}: passou de ${f.timeoutMs / 1000}s`)), f.timeoutMs)),
  ]);
}

// ---------------------------------------------------------------- contrato dos passos
type Resultado =
  | { tipo: "seguir"; saida?: unknown; contexto?: Record<string, unknown>; irPara?: string }
  | { tipo: "aprovacao"; risco: "medio" | "alto"; resumo: string; proposta: Record<string, unknown>; evidencias?: unknown[] }
  | { tipo: "aguardar"; minutos: number; motivo: string; irPara?: string }
  | { tipo: "concluir"; resultado: Record<string, unknown> }
  | { tipo: "falhar"; erro: string };
interface Ctx { admin: Admin; exec: Execucao; usar: <N extends NomeFerramenta>(n: N, e: z.infer<(typeof FERRAMENTAS)[N]["entrada"]>) => Promise<any>; aprovacao: (passo: string) => Promise<{ id: string; estado: string; comentario: string | null; proposta: any } | null> }
interface Passo { nome: string; descricao: string; ferramenta?: NomeFerramenta; risco: Risco; idempotente?: boolean; executar: (c: Ctx) => Promise<Resultado> }
interface Fluxo { id: string; agente: string; nome: string; objetivo: string; passos: Passo[] }

// ---------------------------------------------------------------- fluxo 1: Operations · acessos críticos (item 5)
const SISTEMA_COBRANCA = `Você escreve, para a equipe da Doctor Creator revisar, uma mensagem curta de WhatsApp para o grupo de uma clínica médica cliente, cobrando os acessos que ainda faltam no programa.
Regras: português do Brasil, cordial, direto, sem travessão, sem emoji em excesso (no máximo 1). Liste exatamente os itens recebidos, com o nome como veio. Não invente prazo, valor, nome de pessoa nem item. Nada de dado de paciente. No fim, ofereça ajuda.
Responda SOMENTE um JSON: {"mensagem": "texto pronto para revisar"}`;

const FLUXO_ACESSOS: Fluxo = {
  id: "acessos_criticos", agente: "operations", nome: "Acessos críticos (item 5)",
  objetivo: "Garantir os acessos críticos do checklist 02.05 e fechar o item 5 do cronograma com evidência.",
  passos: [
    {
      nome: "ler_dados", descricao: "Lê a clínica e o checklist de acessos", ferramenta: "sap.ler_acessos", risco: "baixo",
      executar: async (c) => {
        const cli = await c.usar("sap.ler_clinica", { client_id: c.exec.client_id });
        if (!cli) return { tipo: "falhar", erro: "Esta clínica não está no SAP." };
        const regs = await c.usar("sap.ler_acessos", { clinica_id: cli.id });
        const { pendentes, resolvidos } = situacaoCriticos(regs);
        const ctx = { clinica_id: cli.id, nome: cli.nome, clickup_folder_id: cli.clickup_folder_id ?? null, pendentes, resolvidos };
        return { tipo: "seguir", saida: { pendentes: pendentes.length, resolvidos: resolvidos.length }, contexto: ctx, irPara: pendentes.length ? undefined : "conferir_acessos" };
      },
    },
    {
      nome: "conferir_clickup", descricao: "Confere as tarefas de acesso no ClickUp", ferramenta: "clickup.ler_tarefas", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("clickup.ler_tarefas", { folder_id: c.exec.contexto.clickup_folder_id, contem: "acesso" });
        return { tipo: "seguir", saida: r, contexto: { clickup: r } };
      },
    },
    {
      nome: "rascunhar_cobranca", descricao: "Prepara a mensagem de cobrança só com o que falta", ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        const pend = c.exec.contexto.pendentes as ItemPendente[];
        const rodada = (Number(c.exec.contexto.rodada) || 0) + 1;
        const correcao = c.exec.contexto.correcao ? `\nCorreção pedida pela equipe na versão anterior: ${c.exec.contexto.correcao}` : "";
        let mensagem = mensagemPadrao(c.exec.contexto.nome, pend);
        let origem = "modelo fixo (IA indisponível)";
        if (iaDisponivel()) {
          try {
            const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_COBRANCA, finalidade: "agente_cobranca_acessos", entrada: `Clínica: ${c.exec.contexto.nome}\nAcessos que faltam:\n${pend.map((p) => `- ${p.nome}`).join("\n")}${correcao}` });
            const m = (r.json as { mensagem?: unknown })?.mensagem;
            if (mensagemValida(m, pend)) { mensagem = m; origem = `IA (${r.modelo})`; }
            else origem = "modelo fixo (a IA não citou todos os itens)";
          } catch (e) {
            origem = `modelo fixo (IA falhou: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`;
          }
        }
        return { tipo: "seguir", saida: { origem, rodada }, contexto: { mensagem, origem_mensagem: origem, rodada, correcao: null } };
      },
    },
    {
      nome: "aprovar_cobranca", descricao: "Pede aprovação para a mensagem à clínica (risco alto: comunicação externa)", risco: "alto",
      executar: async (c) => {
        const a = await c.aprovacao("aprovar_cobranca");
        const rodada = c.exec.contexto.rodada;
        if (a && a.proposta?.rodada === rodada) {
          if (a.estado === "aprovada") return { tipo: "seguir", saida: { aprovada_por: a.id } , contexto: { aprovacao_cobranca: a.id } };
          if (a.estado === "correcao") return { tipo: "seguir", saida: { correcao: a.comentario }, irPara: "rascunhar_cobranca" };
        }
        return {
          tipo: "aprovacao", risco: "alto",
          resumo: `Mensagem para a ${c.exec.contexto.nome} cobrando ${(c.exec.contexto.pendentes as unknown[]).length} acesso(s). Ao aprovar, envie a mensagem no grupo da clínica: o agente só registra que a cobrança foi feita.`,
          proposta: { rodada, mensagem: c.exec.contexto.mensagem, origem: c.exec.contexto.origem_mensagem },
          evidencias: (c.exec.contexto.pendentes as ItemPendente[]).map((p) => ({ item: p.id, nome: p.nome, responsavel_dc: p.quem })),
        };
      },
    },
    {
      nome: "registrar_cobranca", descricao: "Registra a cobrança no SAP e comenta no ClickUp", ferramenta: "sap.registrar_evento", risco: "baixo", idempotente: true,
      executar: async (c) => {
        await c.usar("sap.registrar_evento", { clinica_id: c.exec.contexto.clinica_id, tipo: "agente_cobranca_acessos", payload: { itens: (c.exec.contexto.pendentes as ItemPendente[]).map((p) => p.id), aprovacao: c.exec.contexto.aprovacao_cobranca, execucao: c.exec.id } });
        const tarefa = (c.exec.contexto.clickup?.tarefas ?? [])[0]?.id ?? null;
        const ck = await c.usar("clickup.comentar", { task_id: tarefa, texto: `Cobrança de acessos enviada à clínica (aprovada na Central de Agentes). Itens: ${(c.exec.contexto.pendentes as ItemPendente[]).map((p) => p.id).join(", ")}.` });
        return { tipo: "seguir", saida: { evento: true, clickup: ck } };
      },
    },
    {
      nome: "conferir_acessos", descricao: "Confere de novo o checklist; espera 24 h se ainda faltar algo", ferramenta: "sap.ler_acessos", risco: "baixo",
      executar: async (c) => {
        const regs = await c.usar("sap.ler_acessos", { clinica_id: c.exec.contexto.clinica_id });
        const { pendentes, resolvidos } = situacaoCriticos(regs);
        if (pendentes.length) return { tipo: "aguardar", minutos: 24 * 60, motivo: `Ainda faltam ${pendentes.length} acesso(s): ${pendentes.map((p) => p.id).join(", ")}` };
        const rodada_marco = (Number(c.exec.contexto.rodada_marco) || 0) + 1;
        return { tipo: "seguir", saida: { resolvidos: resolvidos.length }, contexto: { pendentes, resolvidos, evidencia: evidenciaCriticos(resolvidos), rodada_marco } };
      },
    },
    {
      nome: "aprovar_marco", descricao: "Pede aprovação para dar o item 5 como feito (risco médio)", risco: "medio",
      executar: async (c) => {
        const a = await c.aprovacao("aprovar_marco");
        const rodada = c.exec.contexto.rodada_marco;
        if (a && a.proposta?.rodada === rodada) {
          if (a.estado === "aprovada") return { tipo: "seguir", saida: { aprovada: a.id }, contexto: { aprovacao_marco: a.id } };
          if (a.estado === "correcao") return { tipo: "aguardar", minutos: 60, motivo: `Correção pedida: ${a.comentario}. O agente confere o checklist de novo em 1 hora.`, irPara: "conferir_acessos" };
        }
        return {
          tipo: "aprovacao", risco: "medio",
          resumo: `Todos os acessos críticos da ${c.exec.contexto.nome} estão resolvidos. Aprovar marca o item 5 do cronograma como feito, com a evidência abaixo.`,
          proposta: { rodada, marco: MARCO_ACESSOS, evidencia: c.exec.contexto.evidencia },
          evidencias: (c.exec.contexto.resolvidos as ItemConfirmado[]).map((r) => ({ item: r.id, status: r.status, em: r.em, por: r.por })),
        };
      },
    },
    {
      nome: "marcar_marco", descricao: "Marca o item 5 no cronograma do SAP", ferramenta: "sap.marcar_marco", risco: "medio", idempotente: true,
      executar: async (c) => {
        await c.usar("sap.marcar_marco", { aprovacao_id: c.exec.contexto.aprovacao_marco, clinica_id: c.exec.contexto.clinica_id, marco: MARCO_ACESSOS, evidencia: c.exec.contexto.evidencia });
        const tarefa = (c.exec.contexto.clickup?.tarefas ?? [])[0]?.id ?? null;
        const ck = await c.usar("clickup.comentar", { task_id: tarefa, texto: `Item 5 (acessos críticos) marcado como feito no SAP. ${c.exec.contexto.evidencia}` });
        return { tipo: "seguir", saida: { marcado: true, clickup: ck } };
      },
    },
    {
      nome: "concluir", descricao: "Encerra com o resumo", risco: "baixo",
      executar: async (c) => ({ tipo: "concluir", resultado: { marco: MARCO_ACESSOS, resolvidos: (c.exec.contexto.resolvidos as unknown[]).length, evidencia: c.exec.contexto.evidencia } }),
    },
  ],
};

export const FLUXOS: Record<string, Fluxo> = { [FLUXO_ACESSOS.id]: FLUXO_ACESSOS };
/** Catálogo para a Central (sem funções). */
export function catalogoFluxos() {
  return Object.values(FLUXOS).map((f) => ({ id: f.id, agente: f.agente, nome: f.nome, objetivo: f.objetivo, passos: f.passos.map((p) => ({ nome: p.nome, descricao: p.descricao, risco: p.risco, ferramenta: p.ferramenta ?? null })) }));
}

// ---------------------------------------------------------------- motor
const LEASE_S = 120;
const MAX_TENTATIVAS = 3;

export async function rodarAgentes(admin: Admin, opcoes: { execucaoId?: string | null; maxPassos?: number; prazoMs?: number }): Promise<{ execucoes: { id: string; estado: string; passos: number; erro?: string }[] }> {
  const fim = Date.now() + (opcoes.prazoMs ?? 45_000);
  const saida: { id: string; estado: string; passos: number; erro?: string }[] = [];
  while (Date.now() < fim) {
    const { data: lista, error } = await admin.rpc("agentes_reservar", { p_execucao: opcoes.execucaoId ?? null, p_lease_segundos: LEASE_S });
    if (error) throw new Error(error.message);
    const exec = ((lista ?? []) as Execucao[])[0];
    if (!exec) break;
    const r = await rodarUma(admin, exec, opcoes.maxPassos ?? 8, fim);
    saida.push(r);
    if (opcoes.execucaoId) break;
  }
  return { execucoes: saida };
}

async function rodarUma(admin: Admin, exec: Execucao, maxPassos: number, fim: number) {
  const fluxo = FLUXOS[exec.fluxo];
  const atualizar = (campos: Record<string, unknown>) => admin.from("agente_execucoes").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", exec.id);
  if (!fluxo) {
    await atualizar({ estado: "falhou", erro: `fluxo desconhecido: ${exec.fluxo}`, lease_ate: null, encerrado_em: new Date().toISOString() });
    return { id: exec.id, estado: "falhou", passos: 0, erro: "fluxo desconhecido" };
  }
  let passos = 0;
  const ctx: Ctx = {
    admin, exec,
    usar: (n, e) => usar(admin, exec, n, e),
    aprovacao: async (passo) => {
      const { data } = await admin.from("aprovacoes").select("id, estado, comentario, proposta").eq("execucao_id", exec.id).eq("passo", passo).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      return (data as any) ?? null;
    },
  };
  while (passos < maxPassos && Date.now() < fim) {
    const passo = fluxo.passos[exec.passo_atual];
    if (!passo) {
      await atualizar({ estado: "concluida", lease_ate: null, encerrado_em: new Date().toISOString() });
      return { id: exec.id, estado: "concluida", passos };
    }
    if (Number(exec.custo_usd) >= Number(exec.teto_custo_usd)) {
      await atualizar({ estado: "pausada", estado_antes_pausa: "pendente", erro: `teto de custo de IA atingido (US$ ${exec.teto_custo_usd})`, lease_ate: null });
      return { id: exec.id, estado: "pausada", passos, erro: "teto de custo" };
    }
    const chave = passo.idempotente ? `${exec.id}:${passo.nome}:${exec.contexto.rodada ?? 0}` : null;
    const t0 = Date.now();
    const custoAntes = await custoDaExecucao(admin, exec.id);
    let r: Resultado;
    let jaFeito = false;
    try {
      if (chave) {
        const { data: feito } = await admin.from("agente_passos").select("saida").eq("chave_idempotencia", chave).eq("ok", true).maybeSingle();
        if (feito) { jaFeito = true; r = { tipo: "seguir", saida: { ...(feito.saida as object), repetido: "já tinha rodado; não repetiu a ação" } }; }
        else r = await passo.executar(ctx);
      } else r = await passo.executar(ctx);
    } catch (e) {
      const erro = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await admin.from("agente_passos").insert({ execucao_id: exec.id, ordem: exec.passo_atual, nome: passo.nome, ferramenta: passo.ferramenta ?? null, risco: passo.risco, ok: false, erro, ms: Date.now() - t0 });
      const tentativas = exec.tentativas;
      if (tentativas >= MAX_TENTATIVAS) {
        await atualizar({ estado: "falhou", erro: `${passo.nome}: ${erro}`, lease_ate: null, encerrado_em: new Date().toISOString() });
        return { id: exec.id, estado: "falhou", passos, erro };
      }
      const espera = 2 ** tentativas;
      await atualizar({ estado: "aguardando", erro: `${passo.nome}: ${erro} (nova tentativa em ${espera} min)`, proximo_em: new Date(Date.now() + espera * 60_000).toISOString(), lease_ate: null });
      return { id: exec.id, estado: "aguardando", passos, erro };
    }
    passos++;
    const custoPasso = Math.max(0, (await custoDaExecucao(admin, exec.id)) - custoAntes);
    exec.custo_usd = Number(exec.custo_usd) + custoPasso;
    const linha = { execucao_id: exec.id, ordem: exec.passo_atual, nome: passo.nome, ferramenta: passo.ferramenta ?? null, risco: passo.risco, custo_usd: custoPasso, ms: Date.now() - t0 };
    if (!jaFeito) await admin.from("agente_passos").insert({ ...linha, ok: r.tipo !== "falhar", saida: resumoSaida(r), erro: r.tipo === "falhar" ? r.erro : null, chave_idempotencia: chave });

    if (r.tipo === "seguir") {
      const contexto = { ...exec.contexto, ...(r.contexto ?? {}) };
      const prox = r.irPara ? fluxo.passos.findIndex((p) => p.nome === r.irPara) : exec.passo_atual + 1;
      exec.contexto = contexto;
      exec.passo_atual = prox < 0 ? exec.passo_atual + 1 : prox;
      exec.tentativas = 0;
      await atualizar({ contexto, passo_atual: exec.passo_atual, tentativas: 0, custo_usd: exec.custo_usd, erro: null, lease_ate: new Date(Date.now() + LEASE_S * 1000).toISOString() });
      continue;
    }
    if (r.tipo === "aprovacao") {
      const { error } = await admin.from("aprovacoes").insert({ execucao_id: exec.id, client_id: exec.client_id, passo: passo.nome, risco: r.risco, resumo: r.resumo, proposta: r.proposta, evidencias: r.evidencias ?? [] });
      if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
      await atualizar({ estado: "aguardando_aprovacao", custo_usd: exec.custo_usd, lease_ate: null });
      return { id: exec.id, estado: "aguardando_aprovacao", passos };
    }
    if (r.tipo === "aguardar") {
      if (r.irPara) { const i = fluxo.passos.findIndex((p) => p.nome === r.irPara); if (i >= 0) exec.passo_atual = i; }
      await atualizar({ estado: "aguardando", passo_atual: exec.passo_atual, proximo_em: new Date(Date.now() + r.minutos * 60_000).toISOString(), erro: r.motivo, custo_usd: exec.custo_usd, tentativas: 0, lease_ate: null });
      return { id: exec.id, estado: "aguardando", passos };
    }
    if (r.tipo === "concluir") {
      await atualizar({ estado: "concluida", resultado: r.resultado, custo_usd: exec.custo_usd, erro: null, lease_ate: null, encerrado_em: new Date().toISOString() });
      return { id: exec.id, estado: "concluida", passos };
    }
    await atualizar({ estado: "falhou", erro: r.erro, lease_ate: null, encerrado_em: new Date().toISOString() });
    return { id: exec.id, estado: "falhou", passos, erro: r.erro };
  }
  // Limite de passos ou de tempo desta chamada: devolve para a fila, de onde parou.
  await atualizar({ estado: "pendente", lease_ate: null });
  return { id: exec.id, estado: "pendente", passos };
}

async function custoDaExecucao(admin: Admin, id: string): Promise<number> {
  const { data } = await admin.from("ia_execucoes").select("custo_usd").eq("execucao_id", id);
  return ((data ?? []) as { custo_usd: number | null }[]).reduce((s, r) => s + Number(r.custo_usd ?? 0), 0);
}

function resumoSaida(r: Resultado): unknown {
  if (r.tipo === "seguir") return r.saida ?? null;
  if (r.tipo === "aprovacao") return { pediu_aprovacao: r.risco, resumo: r.resumo };
  if (r.tipo === "aguardar") return { aguardando_min: r.minutos, motivo: r.motivo };
  if (r.tipo === "concluir") return r.resultado;
  return null;
}
