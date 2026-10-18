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
import { limitarTexto } from "./texto-ia.js";
import { FONTES, padroesComerciais, validarPropostas, type Fonte, type PropostaBrain } from "../../src/lib/brand-brain.js";
import { validarIdeias, TIPOS_IDEIA, type IdeiaCampanha } from "../../src/lib/campanhas-ia.js";
import { CALENDARIO } from "../../src/lib/campanhas.js";
import { grupoEspecialidade } from "../../src/lib/benchmark-estrategico.js";
import { validarRecuperacao, validarAnuncios, validarConteudo, pecaParaTexto, type PecaConteudo, type RecomendacaoAds, type SinalAds, type MensagemRecuperacao } from "../../src/lib/agentes-sugestoes.js";
import { AGENTES } from "../../src/lib/agentes-catalogo.js";
import { lerRecuperacao, lerAnuncios, lerConteudo } from "./agentes-leitura.js";
import { aplicarCritica, filtrarComentarios, lerNotas, SISTEMA_CRITICO, type NotaCritica } from "../../src/lib/aprendizado.js";
import { aprenderTodas, lerLicoes } from "./aprendizado.js";
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
  escritaExterna?: boolean;
  entrada: E;
  executar: (admin: Admin, exec: Execucao, e: z.infer<E>) => Promise<any>;
}
function ferramenta<E extends z.ZodTypeAny>(f: Ferramenta<E>) { return f; }

const clickupToken = () => process.env.CLICKUP_API_TOKEN || "";
const operacaoSapSchema = z.object({
  pendentes: z.number().int().nonnegative(), resolvidos: z.number().int().nonnegative(),
  acoes: z.array(z.object({ id: z.string(), codigo: z.string(), texto: z.string(), responsavel: z.string().nullable(), prazo: z.string().nullable(), status: z.string() })),
  proximo_passo: z.string().min(1),
});

class EfeitoExternoIncerto extends Error {}

/**
 * Uma intenção sem confirmação pode significar que o provedor aceitou a ação
 * antes da conexão cair. Ela nunca é reenviada automaticamente. A chave única
 * também impede duas reservas concorrentes de enviar o mesmo comentário.
 */
async function escritaExterna(
  admin: Admin, exec: Execucao, nome: string, entrada: unknown, risco: Risco,
  executar: () => Promise<unknown>,
): Promise<unknown> {
  const chave = `${exec.id}:externo:${exec.passo_atual}:${nome}:${exec.contexto.rodada ?? 0}:${exec.contexto.rodada_marco ?? 0}`;
  const conferir = () => new EfeitoExternoIncerto(`${nome}: envio sem confirmação durável. Confira a tarefa no provedor e o registro ${chave} antes de retomar; reenvio automático bloqueado.`);
  const { data: anterior, error: erroLeitura } = await admin.from("agente_passos").select("ok, saida")
    .eq("chave_idempotencia", chave).maybeSingle();
  if (erroLeitura) throw conferir();
  if (anterior) {
    if (anterior.ok === true) return anterior.saida;
    throw conferir();
  }
  const { error: erroIntencao } = await admin.from("agente_passos").insert({
    execucao_id: exec.id, ordem: exec.passo_atual, nome: `intencao:${nome}`, ferramenta: nome, risco,
    entrada, ok: null, chave_idempotencia: chave, erro: "Intenção registrada; confirmação externa pendente",
  });
  // Até um erro de transporte no INSERT pode ter deixado uma intenção salva.
  // Em qualquer caso o HTTP ainda não foi enviado por esta chamada.
  if (erroIntencao) throw conferir();
  const t0 = Date.now();
  try {
    const saida = await executar();
    const { data: confirmacao, error } = await admin.from("agente_passos")
      .update({ ok: true, saida, erro: null, ms: Date.now() - t0 })
      .eq("chave_idempotencia", chave).select("id").single();
    if (error || !confirmacao) throw conferir();
    return saida;
  } catch { throw conferir(); }
}

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
      const { data, error } = await admin.from("sap_acessos").select("item, status, confirmado_em, confirmado_por, observacao, revogado_em, atualizado_em").eq("clinica_id", e.clinica_id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  }),
  "sap.conferir_operacao": ferramenta({
    nome: "sap.conferir_operacao", descricao: "Reconcilia as ações de cada acesso crítico, com responsável e prazo, sem duplicar tarefas.", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ clinica_id: z.string().uuid() }),
    executar: async (admin, _x, e) => {
      const { data, error } = await admin.rpc("operacao_sap_conferir", { p_clinica_id: e.clinica_id });
      if (error) throw new Error(error.message);
      return operacaoSapSchema.parse(data);
    },
  }),
  "sap.ler_vinculo": ferramenta({
    nome: "sap.ler_vinculo", descricao: "Lê o vínculo explícito do marco 5 com uma tarefa ClickUp.", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ clinica_id: z.string().uuid() }),
    executar: async (admin, _x, e) => {
      const { data, error } = await admin.from("sap_marco_vinculos").select("clinica_id, marco, clickup_task_id, atualizado_em").eq("clinica_id", e.clinica_id).eq("marco", MARCO_ACESSOS).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
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
    nome: "ia.gerar_json", descricao: "Texto ou classificação por IA, com custo registrado.", risco: "baixo", externa: true, timeoutMs: 95_000,
    entrada: z.object({ sistema: z.string().min(20), entrada: z.string().min(1).max(20_000), finalidade: z.string(), max_tokens: z.number().int().min(100).max(4000).optional(), qualidade: z.enum(["padrao", "forte"]).optional() }),
    executar: async (admin, exec, e) => chamarIAJson(admin, { sistema: e.sistema, entrada: e.entrada, finalidade: e.finalidade, clientId: exec.client_id, execucaoId: exec.id, maxTokens: e.max_tokens ?? 700, qualidade: e.qualidade }),
  }),
  "brain.ler_fontes": ferramenta({
    nome: "brain.ler_fontes", descricao: "Lê as fontes atuais da clínica para o Brand Brain (ficha, sessões, conversas, Instagram, banco de anúncios) e o que já está aprovado.", risco: "baixo", externa: false, timeoutMs: 20_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => lerFontesBrain(admin, e.client_id),
  }),
  "brain.propor": ferramenta({
    nome: "brain.propor", descricao: "Grava propostas no Brand Brain (estado proposto; nada vale até uma pessoa aprovar).", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ client_id: z.string().uuid(), itens: z.array(z.object({ memoria: z.string(), chave: z.string(), valor: z.string(), fonte: z.string(), fonte_detalhe: z.string().nullable().optional(), confianca: z.string() })).max(40) }),
    executar: async (admin, exec, e) => {
      const { data, error } = await admin.rpc("brain_propor", { p_client_id: e.client_id, p_itens: e.itens, p_execucao: exec.id });
      if (error) throw new Error(error.message);
      return { gravadas: data as number };
    },
  }),
  "growth.ler_contexto": ferramenta({
    nome: "growth.ler_contexto", descricao: "Lê o Brand Brain aprovado e os dados da clínica (ficha, conversas, CRM, Instagram, anúncios, datas e estratégias anteriores) para o Estrategista de Campanhas.", risco: "baixo", externa: false, timeoutMs: 25_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => lerContextoGrowth(admin, e.client_id),
  }),
  "growth.gravar_ideias": ferramenta({
    nome: "growth.gravar_ideias", descricao: "Grava as estratégias validadas como propostas (nada é enviado; uma pessoa aprova e executa).", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ client_id: z.string().uuid(), ideias: z.array(z.record(z.any())).max(14) }),
    executar: async (admin, exec, e) => {
      if (!e.ideias.length) return { gravadas: 0 };
      const { error } = await admin.from("campanhas_ideias").insert(e.ideias.map((i) => ({ ...i, client_id: e.client_id, execucao_id: exec.id })));
      if (error) throw new Error(error.message);
      return { gravadas: e.ideias.length };
    },
  }),
  "recuperacao.ler": ferramenta({
    nome: "recuperacao.ler", descricao: "Escolhe por regra quem recuperar hoje (interesse sem agendar, esperando a clínica) e lê o tom da clínica e o resultado das mensagens anteriores.", risco: "baixo", externa: false, timeoutMs: 30_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => lerRecuperacao(admin, e.client_id),
  }),
  "anuncios.ler": ferramenta({
    nome: "anuncios.ler", descricao: "Compara cada campanha da Meta (7 dias contra 7 anteriores) e acha o que pausar, revisar, trocar criativo ou escalar.", risco: "baixo", externa: false, timeoutMs: 25_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => lerAnuncios(admin, e.client_id),
  }),
  "conteudo.ler": ferramenta({
    nome: "conteudo.ler", descricao: "Lê Brain, posts mais salvos, dúvidas reais, conversas, datas e o que a equipe usou ou descartou antes.", risco: "baixo", externa: false, timeoutMs: 25_000,
    entrada: z.object({ client_id: z.string().uuid() }),
    executar: async (admin, _x, e) => lerConteudo(admin, e.client_id),
  }),
  "sugestoes.gravar": ferramenta({
    nome: "sugestoes.gravar", descricao: "Grava o que o agente preparou para a equipe (estado proposta; nada é enviado, publicado ou alterado).", risco: "baixo", externa: false, timeoutMs: 10_000,
    entrada: z.object({ client_id: z.string().uuid(), agente: z.enum(["recuperacao", "anuncios", "conteudo"]), itens: z.array(z.record(z.any())).max(20) }),
    executar: async (admin, exec, e) => {
      if (!e.itens.length) return { gravadas: 0 };
      const { error } = await admin.from("sugestoes_agentes").insert(e.itens.map((i) => ({ ...i, client_id: e.client_id, agente: e.agente, execucao_id: exec.id })));
      if (error) throw new Error(error.message);
      return { gravadas: e.itens.length };
    },
  }),
  // O piloto só consulta a tarefa explicitamente vinculada; não publica comentários nem altera tarefas.
  "clickup.ler_tarefa": ferramenta({
    nome: "clickup.ler_tarefa", descricao: "Confere ID, pasta e fechamento da tarefa ClickUp exata do marco.", risco: "baixo", externa: true, timeoutMs: 20_000,
    entrada: z.object({ folder_id: z.string().nullable(), task_id: z.string().nullable() }),
    executar: async (_a, _x, e) => {
      const bloqueada = (motivo: string) => ({ configurada: false, vinculada: false, confirmada: false, motivo });
      if (!clickupToken()) return bloqueada("CLICKUP_API_TOKEN não configurado no servidor; configure a conexão para conferir o marco.");
      if (!e.folder_id || !/^\d{1,30}$/.test(e.folder_id)) return bloqueada("Clínica sem pasta válida do ClickUp (clickup_folder_id); registre a pasta da clínica.");
      if (!e.task_id || !/^[a-z0-9_-]{3,128}$/i.test(e.task_id)) return bloqueada("Nenhuma tarefa ClickUp válida vinculada ao marco 5; vincule a tarefa exata.");
      try {
        const r = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(e.task_id)}`, {
          headers: { authorization: clickupToken(), Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) return bloqueada(`Não foi possível confirmar a tarefa ClickUp (HTTP ${r.status}); confira a conexão e o vínculo.`);
        const tarefa = await r.json() as { id?: unknown; folder?: { id?: unknown }; project?: { id?: unknown }; list?: { folder?: { id?: unknown } }; status?: { type?: unknown } };
        if (tarefa?.id !== e.task_id) return bloqueada("O ClickUp retornou outra tarefa; confira o vínculo do marco 5.");
        // project é o nome legado da pasta; parent é uma tarefa pai, não prova a pasta.
        const pastas = [tarefa.folder?.id, tarefa.project?.id, tarefa.list?.folder?.id].filter((id) => id != null).map(String);
        if (!pastas.length || pastas.some((id) => id !== e.folder_id)) return bloqueada("A tarefa ClickUp não pertence à pasta da clínica; corrija o vínculo antes de concluir.");
        const fechada = tarefa.status?.type === "closed";
        return { configurada: true, vinculada: true, confirmada: fechada, task_id: e.task_id, folder_id: e.folder_id, conferido_em: new Date().toISOString(),
          status_type: fechada ? "closed" : "nao_fechada", motivo: fechada ? null : "A tarefa ClickUp vinculada continua aberta; conclua e confira a tarefa antes de liberar o marco." };
      } catch {
        return bloqueada("Não foi possível conferir a tarefa ClickUp; nenhuma conclusão externa foi confirmada.");
      }
    },
  }),
} as const;
type NomeFerramenta = keyof typeof FERRAMENTAS;

async function usar<N extends NomeFerramenta>(admin: Admin, exec: Execucao, nome: N, entrada: z.infer<(typeof FERRAMENTAS)[N]["entrada"]>): Promise<any> {
  const f = FERRAMENTAS[nome] as Ferramenta<any>;
  const e = f.entrada.parse(entrada);
  const executar = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        f.executar(admin, exec, e),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${nome}: passou de ${f.timeoutMs / 1000}s`)), f.timeoutMs); }),
      ]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  };
  return f.escritaExterna ? escritaExterna(admin, exec, nome, e, f.risco, executar) : executar();
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

/** Autocrítica: um segundo agente dá nota a cada item (src/lib/aprendizado.ts, SISTEMA_CRITICO). Se a crítica falhar,
 *  os itens seguem sem nota: erro do crítico não joga fora o trabalho. */
async function criticar(c: Ctx, contexto: string, itens: string[], finalidade: string): Promise<Map<number, NotaCritica>> {
  if (!itens.length) return new Map();
  try {
    const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_CRITICO, finalidade: `critico_${finalidade}`, max_tokens: 1200,
      entrada: `### Contexto da clínica (resumo)\n${contexto.slice(0, 7000)}\n\n### Itens para avaliar\n${itens.map((t, i) => `[${i}] ${t.slice(0, 1500)}`).join("\n\n")}`.slice(0, 19_000) });
    return lerNotas(r.json, itens.length);
  } catch { return new Map(); }
}

// ---------------------------------------------------------------- fluxo 1: Operations · acessos críticos (item 5)
const SISTEMA_COBRANCA = `Você escreve, para a equipe da Doctor Creator revisar, uma mensagem curta de WhatsApp para o grupo de uma clínica médica cliente, cobrando os acessos que ainda faltam no programa.
Regras: português do Brasil, cordial, direto, sem travessão, sem emoji em excesso (no máximo 1). Liste exatamente os itens recebidos, com o nome como veio. Não invente prazo, valor, nome de pessoa nem item. Nada de dado de paciente. No fim, ofereça ajuda.
Responda SOMENTE um JSON: {"mensagem": "texto pronto para revisar"}`;

async function conferirOperacaoAcessos(c: Ctx) {
  const cli = await c.usar("sap.ler_clinica", { client_id: c.exec.client_id });
  if (!cli) throw new Error("Esta clínica não está no SAP.");
  if (c.exec.contexto.clinica_id && cli.id !== c.exec.contexto.clinica_id) throw new Error("A clínica da execução mudou; confira o vínculo antes de continuar.");
  const operacao = await c.usar("sap.conferir_operacao", { clinica_id: cli.id }) as z.infer<typeof operacaoSapSchema>;
  const regs = await c.usar("sap.ler_acessos", { clinica_id: cli.id });
  const situacao = situacaoCriticos(regs);
  if (situacao.pendentes.length !== operacao.pendentes || situacao.resolvidos.length !== operacao.resolvidos) throw new Error("O checklist mudou durante a conferência; confira os acessos novamente.");
  const tarefaIncompleta = situacao.pendentes.some((item) => {
    const acoes = operacao.acoes.filter((a) => a.codigo === `agente_acesso_${item.id}`);
    return acoes.length !== 1 || !acoes[0].responsavel?.trim() || !acoes[0].prazo;
  });
  return { cli, operacao, ...situacao, evidencia: evidenciaCriticos(situacao.resolvidos), assinatura: JSON.stringify(situacao.resolvidos),
    bloqueio: tarefaIncompleta ? "As ações de acesso precisam de responsável e prazo; confira os papéis da clínica e o D0." : null };
}

async function conferirClickupAcessos(c: Ctx, cli: { id: string; clickup_folder_id?: string | null }) {
  const vinculo = await c.usar("sap.ler_vinculo", { clinica_id: cli.id });
  const tarefa = await c.usar("clickup.ler_tarefa", { folder_id: cli.clickup_folder_id ?? null, task_id: vinculo?.clickup_task_id ?? null });
  return { ...tarefa, vinculo_atualizado_em: vinculo?.atualizado_em ?? null };
}

function aprovacaoMarcoAtual(a: Awaited<ReturnType<Ctx["aprovacao"]>>, c: Ctx): boolean {
  const p = a?.proposta;
  return !!p && p.versao === 2 && p.rodada === c.exec.contexto.rodada_marco && p.marco === MARCO_ACESSOS
    && p.clinica_id === c.exec.contexto.clinica_id && p.assinatura_acessos === c.exec.contexto.assinatura_acessos
    && p.evidencia === c.exec.contexto.evidencia && p.clickup_task_id === c.exec.contexto.clickup?.task_id
    && p.clickup_folder_id === c.exec.contexto.clickup?.folder_id
    && p.vinculo_atualizado_em === c.exec.contexto.clickup?.vinculo_atualizado_em;
}

const FLUXO_ACESSOS: Fluxo = {
  id: "acessos_criticos", agente: "operations", nome: "Acessos críticos (item 5)",
  objetivo: "Garantir os acessos críticos do checklist 02.05 e fechar o item 5 do cronograma com evidência.",
  passos: [
    {
      nome: "ler_dados", descricao: "Lê a clínica e o checklist de acessos", ferramenta: "sap.ler_acessos", risco: "baixo",
      executar: async (c) => {
        const s = await conferirOperacaoAcessos(c);
        if (s.bloqueio) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio };
        const ctx = { versao_acessos: 2, clinica_id: s.cli.id, nome: s.cli.nome, clickup_folder_id: s.cli.clickup_folder_id ?? null,
          pendentes: s.pendentes, resolvidos: s.resolvidos, operacao_sap: s.operacao, proximo_passo: s.operacao.proximo_passo };
        return { tipo: "seguir", saida: s.operacao, contexto: ctx, irPara: s.pendentes.length ? undefined : "conferir_acessos" };
      },
    },
    {
      nome: "conferir_clickup", descricao: "Confere a tarefa exata vinculada ao marco no ClickUp", ferramenta: "clickup.ler_tarefa", risco: "baixo",
      executar: async (c) => {
        const s = await conferirOperacaoAcessos(c);
        if (s.bloqueio) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio, irPara: "ler_dados" };
        const r = await conferirClickupAcessos(c, s.cli);
        if (!r.vinculada) return { tipo: "aguardar", minutos: 60, motivo: r.motivo };
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
          resumo: `Mensagem preparada para a equipe da ${c.exec.contexto.nome} sobre ${(c.exec.contexto.pendentes as unknown[]).length} acesso(s). Aprovar libera o texto para a equipe; o envio à clínica não está confirmado.`,
          proposta: { rodada, mensagem: c.exec.contexto.mensagem, origem: c.exec.contexto.origem_mensagem },
          evidencias: (c.exec.contexto.pendentes as ItemPendente[]).map((p) => ({ item: p.id, nome: p.nome, responsavel_dc: p.quem })),
        };
      },
    },
    {
      nome: "registrar_cobranca", descricao: "Registra a mensagem aprovada para a equipe, com envio não confirmado", ferramenta: "sap.registrar_evento", risco: "baixo", idempotente: true,
      executar: async (c) => {
        const a = await c.aprovacao("aprovar_cobranca");
        if (!a || a.id !== c.exec.contexto.aprovacao_cobranca || a.estado !== "aprovada" || a.proposta?.rodada !== c.exec.contexto.rodada || a.proposta?.mensagem !== c.exec.contexto.mensagem) return { tipo: "seguir", irPara: "ler_dados" };
        await c.usar("sap.registrar_evento", { clinica_id: c.exec.contexto.clinica_id, tipo: "agente_acessos_mensagem_aprovada", payload: {
          itens: (c.exec.contexto.pendentes as ItemPendente[]).map((p) => p.id), aprovacao: a.id, execucao: c.exec.id, mensagem: c.exec.contexto.mensagem,
          estado: "mensagem aprovada, envio não confirmado", envio_confirmado: false,
        } });
        return { tipo: "seguir", saida: { evento: true, envio_confirmado: false } };
      },
    },
    {
      nome: "conferir_acessos", descricao: "Confere de novo o checklist; espera 24 h se ainda faltar algo", ferramenta: "sap.ler_acessos", risco: "baixo",
      executar: async (c) => {
        const s = await conferirOperacaoAcessos(c);
        if (s.bloqueio) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio };
        if (s.pendentes.length) return { tipo: "aguardar", minutos: 24 * 60, motivo: `Ainda faltam ${s.pendentes.length} acesso(s): ${s.pendentes.map((p) => p.id).join(", ")}. ${s.operacao.proximo_passo}` };
        const clickup = await conferirClickupAcessos(c, s.cli);
        if (!clickup.confirmada) return { tipo: "aguardar", minutos: 60, motivo: clickup.motivo };
        const rodada_marco = (Number(c.exec.contexto.rodada_marco) || 0) + 1;
        return { tipo: "seguir", saida: { resolvidos: s.resolvidos.length, clickup }, contexto: { versao_acessos: 2, clinica_id: s.cli.id, nome: s.cli.nome,
          pendentes: s.pendentes, resolvidos: s.resolvidos, evidencia: s.evidencia, assinatura_acessos: s.assinatura, rodada_marco, clickup,
          operacao_sap: s.operacao, proximo_passo: s.operacao.proximo_passo } };
      },
    },
    {
      nome: "aprovar_marco", descricao: "Pede aprovação para dar o item 5 como feito (risco médio)", risco: "medio",
      executar: async (c) => {
        if (c.exec.contexto.versao_acessos !== 2) return { tipo: "seguir", irPara: "conferir_acessos" };
        const a = await c.aprovacao("aprovar_marco");
        const rodada = c.exec.contexto.rodada_marco;
        if (a && aprovacaoMarcoAtual(a, c)) {
          if (a.estado === "aprovada") {
            const s = await conferirOperacaoAcessos(c);
            if (s.bloqueio || s.pendentes.length || s.assinatura !== c.exec.contexto.assinatura_acessos) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio ?? "A evidência dos acessos mudou; confira e aprove o marco novamente.", irPara: "conferir_acessos" };
            const clickup = await conferirClickupAcessos(c, s.cli);
            if (!clickup.confirmada) return { tipo: "aguardar", minutos: 60, motivo: clickup.motivo, irPara: "conferir_acessos" };
            if (clickup.task_id !== c.exec.contexto.clickup?.task_id || clickup.folder_id !== c.exec.contexto.clickup?.folder_id || clickup.vinculo_atualizado_em !== c.exec.contexto.clickup?.vinculo_atualizado_em) return { tipo: "seguir", irPara: "conferir_acessos" };
            return { tipo: "seguir", saida: { aprovada: a.id, clickup }, contexto: { aprovacao_marco: a.id, clickup,
              clickup_confirmado: { task_id: clickup.task_id, folder_id: clickup.folder_id, em: clickup.conferido_em, status: "closed" } } };
          }
          if (a.estado === "correcao") return { tipo: "aguardar", minutos: 60, motivo: `Correção pedida: ${a.comentario}. O agente confere o checklist de novo em 1 hora.`, irPara: "conferir_acessos" };
        }
        return {
          tipo: "aprovacao", risco: "medio",
          resumo: `Todos os acessos críticos da ${c.exec.contexto.nome} estão resolvidos. Aprovar marca o item 5 do cronograma como feito, com a evidência abaixo.`,
          proposta: { versao: 2, rodada, marco: MARCO_ACESSOS, clinica_id: c.exec.contexto.clinica_id, evidencia: c.exec.contexto.evidencia,
            assinatura_acessos: c.exec.contexto.assinatura_acessos, clickup_task_id: c.exec.contexto.clickup.task_id, clickup_folder_id: c.exec.contexto.clickup.folder_id, vinculo_atualizado_em: c.exec.contexto.clickup.vinculo_atualizado_em },
          evidencias: (c.exec.contexto.resolvidos as ItemConfirmado[]).map((r) => ({ item: r.id, status: r.status, em: r.em, por: r.por })),
        };
      },
    },
    {
      // O cache do passo antigo não prova a nova conferência. A RPC deve ser idempotente pela aprovação aplicada.
      nome: "marcar_marco", descricao: "Reconfere acessos e ClickUp antes de marcar o item 5", ferramenta: "sap.marcar_marco", risco: "medio",
      executar: async (c) => {
        const s = await conferirOperacaoAcessos(c);
        if (s.bloqueio || s.pendentes.length) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio ?? "Um acesso crítico voltou a ficar pendente; confira as evidências antes de marcar.", irPara: "conferir_acessos" };
        const clickup = await conferirClickupAcessos(c, s.cli);
        if (!clickup.confirmada) return { tipo: "aguardar", minutos: 60, motivo: clickup.motivo, irPara: "conferir_acessos" };
        if (c.exec.contexto.versao_acessos !== 2 || s.assinatura !== c.exec.contexto.assinatura_acessos || clickup.task_id !== c.exec.contexto.clickup?.task_id || clickup.folder_id !== c.exec.contexto.clickup?.folder_id || clickup.vinculo_atualizado_em !== c.exec.contexto.clickup?.vinculo_atualizado_em) return { tipo: "seguir", irPara: "conferir_acessos" };
        const a = await c.aprovacao("aprovar_marco");
        if (!a || a.estado !== "aprovada" || a.id !== c.exec.contexto.aprovacao_marco || !aprovacaoMarcoAtual(a, c)) return { tipo: "seguir", irPara: "conferir_acessos" };
        const prova = c.exec.contexto.clickup_confirmado;
        const idade = Date.now() - Date.parse(prova?.em);
        if (prova?.status !== "closed" || prova.task_id !== clickup.task_id || prova.folder_id !== clickup.folder_id || !Number.isFinite(idade) || idade < 0 || idade > 10 * 60_000) return { tipo: "seguir", irPara: "aprovar_marco" };
        await c.usar("sap.marcar_marco", { aprovacao_id: a.id, clinica_id: s.cli.id, marco: MARCO_ACESSOS, evidencia: s.evidencia });
        return { tipo: "seguir", saida: { marcado: true, clickup }, contexto: { marco_confirmado: 2, clickup } };
      },
    },
    {
      nome: "concluir", descricao: "Encerra com o resumo", risco: "baixo",
      executar: async (c) => {
        const s = await conferirOperacaoAcessos(c);
        if (s.bloqueio || s.pendentes.length) return { tipo: "aguardar", minutos: 60, motivo: s.bloqueio ?? "Há acesso crítico pendente; o marco precisa ser conferido novamente.", irPara: "conferir_acessos" };
        const clickup = await conferirClickupAcessos(c, s.cli);
        if (!clickup.confirmada) return { tipo: "aguardar", minutos: 60, motivo: clickup.motivo, irPara: "conferir_acessos" };
        if (c.exec.contexto.marco_confirmado !== 2 || c.exec.contexto.versao_acessos !== 2 || s.assinatura !== c.exec.contexto.assinatura_acessos || clickup.task_id !== c.exec.contexto.clickup?.task_id || clickup.folder_id !== c.exec.contexto.clickup?.folder_id || clickup.vinculo_atualizado_em !== c.exec.contexto.clickup?.vinculo_atualizado_em) return { tipo: "seguir", irPara: "conferir_acessos" };
        return { tipo: "concluir", resultado: { marco: MARCO_ACESSOS, resolvidos: s.resolvidos.length, evidencia: s.evidencia, clickup,
          acoes: s.operacao.acoes, proximo_passo: "Coordenador de Implementação: conferir kickoff, formulário e baseline e preparar a Sessão 1.", envio_confirmado: false } };
      },
    },
  ],
};

// ---------------------------------------------------------------- fluxo 2: Brand · carga do Brand Brain
const corta = (t: unknown, n: number) => limitarTexto(String(t ?? "").replace(/\s+/g, " ").trim(), n);

/** Remove identificadores reconhecíveis ANTES de persistir o contexto ou enviar à IA. */
function mensagemKommoSemIdentificadores(mensagem: Record<string, any>): string {
  let texto = typeof mensagem.text === "string" ? mensagem.text.slice(0, 10_000) : "";
  // Nomes fornecidos em metadados não precisam aparecer no texto agregado.
  for (const nome of [mensagem.author?.name, mensagem.contact?.name, mensagem.sender?.name]) {
    if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 200) continue;
    texto = texto.replace(new RegExp(nome.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), "[pessoa]");
  }
  return texto.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]")
    .replace(/@[a-z0-9_.]+/gi, "[perfil]");
}

/** Junta o que a clínica já tem no Hub, em texto curto por fonte. Só entra fonte com dado. */
/** Fontes da clínica para a IA (Brand Brain, copiloto dos documentos). `exigirModulo: false` lê mesmo sem o Brain ativo. */
export async function lerFontesBrain(admin: Admin, clientId: string, opcoes: { exigirModulo?: boolean } = {}) {
  const { data: modulo, error: erroModulo } = opcoes.exigirModulo === false ? { data: true, error: null } : await admin.rpc("tem_modulo", { p_client_id: clientId, p_modulo: "brand_brain" });
  if (erroModulo) throw new Error("Não foi possível conferir o módulo Brand Brain");
  if (!modulo) return { ativo: false, fontes: {} as Partial<Record<Fonte, string>>, aprovados: [] as string[] };
  const { data: cli, error: erroClinica } = await admin.from("sap_clinicas").select("id, nome, especialidade, cidade, servicos, ticket_medio, consulta_paga, ambicao_d90, ajustes_acordados")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (erroClinica) throw new Error(`Não foi possível ler a ficha da clínica: ${erroClinica.message}`);
  const desde = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const [sessoes, resumos, posts, duvidas, pecas, aprovados, kommo] = await Promise.all([
    cli ? admin.from("sap_sessao_registro").select("sessao, chave, texto").eq("clinica_id", cli.id).not("texto", "is", null).limit(60) : Promise.resolve({ data: [] }),
    admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", desde).order("gerado_em", { ascending: false }).limit(40),
    admin.from("instagram_posts").select("tema, format, caption, reach, saved, engagement").eq("client_id", clientId).gte("posted_at", desde).order("engagement", { ascending: false, nullsFirst: false }).limit(15),
    admin.from("instagram_comments").select("text").eq("client_id", clientId).eq("is_question", true).gte("commented_at", desde).order("commented_at", { ascending: false }).limit(50),
    cli ? admin.from("sap_pecas").select("titulo, etapa, formato, ganchos, semaforo, status").eq("clinica_id", cli.id).limit(30) : Promise.resolve({ data: [] }),
    admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado"),
    // O webhook contém mensagens do CRM; a direção nem sempre está confirmada.
    admin.from("crm_raw_events").select("raw_payload").eq("client_id", clientId).eq("event_key", "message").gte("received_at", desde).order("received_at", { ascending: false }).limit(200),
  ]);
  for (const result of [sessoes, resumos, posts, duvidas, pecas, aprovados, kommo]) {
    if ("error" in result && result.error) throw new Error(`Não foi possível ler uma fonte do Brand Brain: ${result.error.message}`);
  }
  const fontes: Partial<Record<Fonte, string>> = {};
  if (cli) {
    const ficha = [cli.especialidade && `Especialidade: ${cli.especialidade}`, cli.cidade && `Cidade: ${cli.cidade}`,
      cli.servicos && `Serviços: ${corta(Array.isArray(cli.servicos) ? cli.servicos.join(", ") : JSON.stringify(cli.servicos), 400)}`,
      cli.ticket_medio && `Ticket médio: R$ ${cli.ticket_medio}`, cli.consulta_paga === false ? "Consulta não é paga" : null,
      cli.ambicao_d90 && `Ambição para o D90: ${corta(cli.ambicao_d90, 300)}`, cli.ajustes_acordados && `Ajustes acordados: ${corta(cli.ajustes_acordados, 300)}`].filter(Boolean);
    if (ficha.length) fontes.ficha_sap = ficha.join("\n");
  }
  const ses = ((sessoes.data ?? []) as { sessao: string; chave: string; texto: string }[]).filter((r) => r.texto?.trim());
  if (ses.length) fontes.sessoes = ses.map((r) => `[${r.sessao} · ${r.chave}] ${corta(r.texto, 300)}`).join("\n");
  const res = (resumos.data ?? []) as { resumo: unknown }[];
  if (res.length) fontes.conversas = `${res.length} resumos (últimos 120 dias):\n` + res.map((r) => `- ${corta(typeof r.resumo === "string" ? r.resumo : JSON.stringify(r.resumo), 350)}`).join("\n");
  const ps = (posts.data ?? []) as { tema: string | null; format: string | null; caption: string | null; reach: number | null; saved: number | null; engagement: number | null }[];
  if (ps.length) fontes.instagram_posts = `${ps.length} posts com mais engajamento (120 dias):\n` + ps.map((p) => `- ${p.format ?? "post"} · tema ${p.tema ?? "?"} · alcance ${p.reach ?? "?"} · salvos ${p.saved ?? "?"} · "${corta(p.caption, 120)}"`).join("\n");
  const dv = (duvidas.data ?? []) as { text: string }[];
  if (dv.length) fontes.instagram_duvidas = `${dv.length} perguntas nos comentários (120 dias):\n` + dv.map((d) => `- ${corta(d.text, 150)}`).join("\n");
  const pc = (pecas.data ?? []) as { titulo: string; etapa: string; formato: string; ganchos: unknown; semaforo: string; status: string }[];
  if (pc.length) fontes.banco_anuncios = pc.map((p) => `- ${p.etapa} · ${p.formato} · ${p.status} · ${p.semaforo ?? ""} · "${corta(p.titulo, 100)}" ganchos: ${corta(JSON.stringify(p.ganchos ?? []), 200)}`).join("\n");
  const msgs = ((kommo.data ?? []) as { raw_payload: any }[])
    .flatMap((r) => { const a = r.raw_payload?.add; return Array.isArray(a) ? a : a && typeof a === "object" ? (typeof a.text === "string" ? [a] : Object.values(a)) : []; })
    .filter((m): m is Record<string, any> => !!m && typeof m === "object" && !Array.isArray(m))
    .map(mensagemKommoSemIdentificadores)
    .map((t) => corta(t, 200)).filter((t) => t.length >= 12);
  const unicas = [...new Set(msgs)].slice(0, 120);
  if (unicas.length) fontes.mensagens_kommo = `${unicas.length} mensagens do CRM (120 dias, as mais recentes; repetidas removidas):\n` + unicas.map((t) => `- ${t}`).join("\n");
  // Objeções e falhas em %: todas as conversas lidas pela auditoria nos últimos 30 dias (não só as 40 acima).
  const corte30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todos: unknown[] = [];
  for (let de = 0; de < 5000; de += 1000) {
    const { data, error } = await admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", corte30).order("gerado_em").range(de, de + 999);
    if (error) throw new Error("Não foi possível ler a auditoria comercial do Brand Brain");
    todos.push(...((data ?? []) as { resumo: unknown }[]).map((r) => r.resumo));
    if ((data ?? []).length < 1000) break;
  }
  const padroes = padroesComerciais(todos, 30);
  if (padroes) fontes.auditoria_comercial = padroes;
  const apr = ((aprovados.data ?? []) as { memoria: string; chave: string; valor: string }[]).map((a) => `${a.memoria}.${a.chave}: ${a.valor}`);
  return { ativo: true, fontes, aprovados: apr };
}

const SISTEMA_BRAIN = `Você monta a memória de marca (Brand Brain) de uma clínica médica cliente da Doctor Creator, para a equipe revisar.
Leia as fontes e proponha itens curtos e úteis para quem vai criar conteúdo, anúncios e atendimento.
Memórias: identidade (quem é, diferencial, tom), audiencia (dores, desejos, dúvidas, objeções reais), comercial (serviços, ticket, motivos de perda, como agenda), criativa (temas, ganchos e formatos que funcionaram ou não), decisao (o que foi decidido nas sessões e ainda vale).
Regras:
- Cada item: uma frase objetiva em português do Brasil, sem travessão, até 300 caracteres.
- Só afirme o que está nas fontes. Quando for padrão, diga o tamanho da amostra (ex.: "em 12 de 40 resumos").
- Da fonte auditoria_comercial, use as porcentagens como vieram (não arredonde de novo nem invente outras): objeções viram itens de audiencia (ex.: objecao_preco), falhas viram itens de comercial (ex.: falha_sem_follow_up), sempre com a % e o total de conversas.
- NUNCA inclua nome, telefone, e-mail, CPF, @ de perfil ou caso clínico de paciente. Só padrões agregados.
- Nada de promessa de resultado, antes e depois ou linguagem proibida pelo CFM.
- "fonte" é uma destas chaves: {FONTES}. Use a de onde o item saiu.
- "confianca": alta (várias evidências), media, baixa (uma evidência só).
- Se um item já aprovado continua certo, não repita. Se as fontes mostram que mudou, proponha a mesma chave com o texto novo.
- No máximo 20 itens. Chave em minúsculas com _ (ex.: objecao_preco).
Responda SOMENTE JSON: {"itens":[{"memoria":"audiencia","chave":"objecao_preco","valor":"...","fonte":"conversas","fonte_detalhe":"12 de 40 resumos","confianca":"media"}]}`;

const FLUXO_BRAIN: Fluxo = {
  id: "brain_carga", agente: "brand", nome: "Brand Brain: propor memória da clínica",
  objetivo: "Ler as fontes que a clínica já tem no Hub e propor itens para o Brand Brain. Nada vale até uma pessoa aprovar na tela Brand Brain.",
  passos: [
    {
      nome: "ler_fontes", descricao: "Lê ficha, sessões, conversas, Instagram e banco de anúncios", ferramenta: "brain.ler_fontes", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("brain.ler_fontes", { client_id: c.exec.client_id });
        if (!r.ativo) return { tipo: "falhar", erro: "Brand Brain não está ativo para esta clínica (módulo brand_brain)." };
        const lidas = Object.keys(r.fontes) as Fonte[];
        if (!lidas.length) return { tipo: "concluir", resultado: { propostas: 0, motivo: "Nenhuma fonte com dado ainda. Escreva itens à mão na tela Brand Brain." } };
        return { tipo: "seguir", saida: { fontes: lidas, aprovados: r.aprovados.length }, contexto: { fontes: r.fontes, fontes_lidas: lidas, aprovados: r.aprovados } };
      },
    },
    {
      nome: "propor", descricao: "A IA propõe itens; o servidor descarta o que não tem fonte ou tem dado pessoal", ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        if (!iaDisponivel()) return { tipo: "falhar", erro: "IA não configurada no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
        const fontes = c.exec.contexto.fontes as Record<string, string>;
        const lidas = c.exec.contexto.fontes_lidas as Fonte[];
        const texto = limitarTexto(lidas.map((f) => `### ${f} (${FONTES[f]})\n${fontes[f]}`).join("\n\n"), 16_000);
        const aprovados = (c.exec.contexto.aprovados as string[]).join("\n") || "(nenhum)";
        const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_BRAIN.replace("{FONTES}", lidas.join(", ")), finalidade: "agente_brain_carga", max_tokens: 2000, entrada: `JÁ APROVADO:\n${aprovados}\n\nFONTES:\n${texto}` });
        const { ok, descartes } = validarPropostas(r.json, lidas);
        return { tipo: "seguir", saida: { propostas: ok.length, descartes, modelo: r.modelo }, contexto: { propostas: ok, fontes: null } };
      },
    },
    {
      nome: "gravar", descricao: "Grava as propostas para revisão (estado proposto)", ferramenta: "brain.propor", risco: "baixo", idempotente: true,
      executar: async (c) => {
        const itens = c.exec.contexto.propostas as PropostaBrain[];
        if (!itens.length) return { tipo: "seguir", saida: { gravadas: 0 } };
        const r = await c.usar("brain.propor", { client_id: c.exec.client_id, itens });
        return { tipo: "seguir", saida: r, contexto: { gravadas: r.gravadas } };
      },
    },
    {
      nome: "concluir", descricao: "Encerra com o resumo", risco: "baixo",
      executar: async (c) => ({ tipo: "concluir", resultado: { propostas: Number(c.exec.contexto.gravadas ?? 0), fontes: c.exec.contexto.fontes_lidas, revisar_em: "Admin → Brand Brain" } }),
    },
  ],
};

// ---------------------------------------------------------------- fluxo 3: Growth · Estrategista de Campanhas
/** Contexto da clínica em texto curto, só com números agregados (sem nome, telefone ou caso de paciente). */
async function lerContextoGrowth(admin: Admin, clientId: string) {
  const dia = 86_400_000;
  const desde = (d: number) => new Date(Date.now() - d * dia).toISOString();
  const { data: cliente, error: erroCliente } = await admin.from("clients").select("name, specialty").eq("id", clientId).maybeSingle();
  const { data: cli, error: erroClinica } = await admin.from("sap_clinicas").select("especialidade, cidade, servicos, ticket_medio, consulta_paga, ambicao_d90, verba_mensal")
    .eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (erroCliente || erroClinica) throw new Error("Não foi possível ler a ficha para estratégia");
  const conta = (q: any) => q.then((r: { count: number | null; error?: { message: string } | null }) => { if (r.error) throw new Error("Não foi possível ler os totais do CRM"); return r.count ?? 0; });
  const leads = () => admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("client_id", clientId).is("removido_na_origem", null);
  const [brain, posts, duvidas, ads, anteriores, leads90, ganhos90, perdidos180, abertosAntigos, ganhosFonte] = await Promise.all([
    admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado"),
    admin.from("instagram_posts").select("tema, format, caption, reach, saved, engagement").eq("client_id", clientId).gte("posted_at", desde(90)).order("engagement", { ascending: false, nullsFirst: false }).limit(8),
    admin.from("instagram_comments").select("text").eq("client_id", clientId).gte("commented_at", desde(90)).order("commented_at", { ascending: false }).limit(600),
    admin.from("meta_ads_daily").select("spend, leads, conversations").eq("client_id", clientId).gte("date", desde(30).slice(0, 10)).limit(5000),
    admin.from("campanhas_ideias").select("titulo, tipo, estado, resultado").eq("client_id", clientId).order("criado_em", { ascending: false }).limit(40),
    conta(leads().gte("occurred_at", desde(90))),
    conta(leads().eq("outcome", "won").gte("occurred_at", desde(90))),
    conta(leads().eq("outcome", "lost").gte("occurred_at", desde(180))),
    conta(leads().or("outcome.is.null,outcome.eq.open").lt("occurred_at", desde(90))),
    admin.from("crm_leads").select("source, price").eq("client_id", clientId).eq("outcome", "won").is("removido_na_origem", null).gte("occurred_at", desde(180)).limit(3000),
  ]);
  if ([brain, posts, duvidas, ads, anteriores, ganhosFonte].some(r => r.error)) throw new Error("Não foi possível ler as fontes para estratégia");
  const blocos: string[] = [];
  const esp = cli?.especialidade ?? cliente?.specialty ?? null;
  const ficha = [cliente?.name && `Clínica: ${cliente.name}`, esp && `Especialidade: ${esp}`, cli?.cidade && `Cidade: ${cli.cidade}`,
    cli?.servicos && `Serviços: ${corta(Array.isArray(cli.servicos) ? cli.servicos.join(", ") : JSON.stringify(cli.servicos), 400)}`,
    cli?.ticket_medio && `Ticket médio: R$ ${cli.ticket_medio}`, cli?.consulta_paga === false ? "Consulta não é paga" : null,
    cli?.verba_mensal && `Verba mensal de anúncio: R$ ${cli.verba_mensal}`, cli?.ambicao_d90 && `Ambição: ${corta(cli.ambicao_d90, 300)}`].filter(Boolean);
  if (ficha.length) blocos.push(`### Ficha\n${ficha.join("\n")}`);
  const itens = (brain.data ?? []) as { memoria: string; chave: string; valor: string }[];
  const chaves = itens.map((i) => `${i.memoria}.${i.chave}`);
  if (itens.length) blocos.push(`### Brand Brain aprovado (cite as chaves em "brain")\n${itens.map((i) => `- ${i.memoria}.${i.chave}: ${corta(i.valor, 300)}`).join("\n")}`);
  const licoes = await lerLicoes(admin, clientId, "campanhas");
  if (licoes.texto) blocos.push(licoes.texto);

  const resumos: Record<string, any>[] = [];
  for (let de = 0; de < 6000; de += 1000) {
    const { data, error } = await admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", desde(60)).order("gerado_em").range(de, de + 999);
    if (error) throw new Error("Não foi possível ler as conversas para estratégia");
    resumos.push(...((data ?? []) as { resumo: any }[]).map((r) => r.resumo).filter((r) => r && typeof r === "object"));
    if ((data ?? []).length < 1000) break;
  }
  const padroes = padroesComerciais(resumos, 60);
  if (padroes) blocos.push(`### Auditoria das conversas (60 dias)\n${padroes}`);
  const tally = (vals: unknown[]) => { const m = new Map<string, number>(); for (const v of vals) { const k = corta(v, 60).toLowerCase(); if (k && k !== "null" && k !== "desconhecida") m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const comerciais = resumos.filter((r) => r.comercial !== false);
  const interesse = tally(comerciais.map((r) => r.interesse)).slice(0, 10);
  if (interesse.length) blocos.push(`### O que os pacientes procuram nas conversas (60 dias, ${comerciais.length} conversas)\n${interesse.map(([k, n]) => `- ${k}: ${n}`).join("\n")}`);
  const naoAgendou = tally(comerciais.filter((r) => r.recuperavel === true).map((r) => r.interesse)).slice(0, 6);
  if (naoAgendou.length) blocos.push(`### Interesse real que não agendou (recuperáveis), por assunto\n${naoAgendou.map(([k, n]) => `- ${k}: ${n}`).join("\n")}`);
  const origem = tally(comerciais.map((r) => r.origem)).slice(0, 6);
  if (origem.length) blocos.push(`### De onde chegam as conversas (estimado pela IA)\n${origem.map(([k, n]) => `- ${k}: ${n}`).join("\n")}`);

  const gf = (ganhosFonte.data ?? []) as { source: string | null; price: number | null }[];
  const crm = [`Leads nos últimos 90 dias: ${leads90}`, `Vendas ganhas nos últimos 90 dias: ${ganhos90}`, `Perdidos nos últimos 180 dias: ${perdidos180}`,
    `Leads em aberto criados há mais de 90 dias (base para reativar): ${abertosAntigos}`];
  const receita = gf.reduce((s, g) => s + Number(g.price ?? 0), 0);
  if (gf.length) crm.push(`Vendas ganhas em 180 dias: ${gf.length}${receita ? `, receita registrada R$ ${Math.round(receita).toLocaleString("pt-BR")}` : ""}`);
  const fontes = tally(gf.map((g) => g.source)).slice(0, 6);
  if (fontes.length) crm.push(`Fonte registrada das vendas: ${fontes.map(([k, n]) => `${k} ${n}`).join("; ")}`);
  if (leads90 || gf.length) blocos.push(`### CRM\n${crm.join("\n")}`);

  const ps = (posts.data ?? []) as { tema: string | null; format: string | null; caption: string | null; reach: number | null; saved: number | null }[];
  if (ps.length) blocos.push(`### Posts com mais engajamento (90 dias)\n${ps.map((p) => `- ${p.format ?? "post"} · tema ${p.tema ?? "?"} · alcance ${p.reach ?? "?"} · salvos ${p.saved ?? "?"} · "${corta(p.caption, 100)}"`).join("\n")}`);
  const dv = filtrarComentarios((duvidas.data ?? []) as { text: string }[], ["pergunta"]).uteis.map((d) => corta(d.text, 140));
  if (dv.length) blocos.push(`### Perguntas nos comentários (90 dias)\n${dv.slice(0, 25).map((t) => `- ${t}`).join("\n")}`);
  const ad = (ads.data ?? []) as { spend: number | null; leads: number | null; conversations: number | null }[];
  const gasto = ad.reduce((s, a) => s + Number(a.spend ?? 0), 0);
  if (gasto > 0) {
    const conv = ad.reduce((s, a) => s + Number(a.conversations ?? 0), 0), lds = ad.reduce((s, a) => s + Number(a.leads ?? 0), 0);
    blocos.push(`### Anúncios Meta (30 dias)\nInvestimento R$ ${Math.round(gasto)}; conversas ${conv}${conv ? ` (R$ ${(gasto / conv).toFixed(2)} por conversa)` : ""}; leads de formulário ${lds}.`);
  }
  const area = grupoEspecialidade(esp);
  const hoje = new Date(Date.now() - 3 * 3_600_000);
  const meses = [hoje.getUTCMonth() + 1, ((hoje.getUTCMonth() + 1) % 12) + 1];
  const datas = CALENDARIO.filter((d) => meses.includes(d.mes) && (d.areas === "todas" || (d.areas as string[]).includes(area)));
  if (datas.length) blocos.push(`### Datas de saúde dos próximos 2 meses\n${datas.map((d) => `- ${d.dia ? `${d.dia}/` : ""}${d.mes} ${d.nome}: ${d.angulo}${d.cuidado ? ` (cuidado: ${d.cuidado})` : ""}`).join("\n")}`);
  const ant = (anteriores.data ?? []) as { titulo: string; tipo: string; estado: string; resultado: string | null }[];
  if (ant.length) blocos.push(`### Estratégias já propostas (não repita; aprenda com o estado e o resultado)\n${ant.map((a) => `- [${a.estado}] ${a.tipo}: ${corta(a.titulo, 120)}${a.resultado ? ` → resultado: ${corta(a.resultado, 160)}` : ""}`).join("\n")}`);
  return { texto: limitarTexto(blocos.join("\n\n"), 15_000), chaves, titulos: ant.map((a) => a.titulo), blocos: blocos.length, brain: itens.length, conversas: comerciais.length };
}

const SISTEMA_GROWTH = `Você é o estrategista de crescimento da Doctor Creator para uma clínica médica. Proponha ideias de campanha concretas, criativas e executáveis pela equipe da clínica, cruzando o Brand Brain aprovado com os dados.
FOCO DESTA RODADA: {FOCO}
Para cada ideia:
- tipo: um destes: ${Object.keys(TIPOS_IDEIA).join(", ")}.
- titulo: nome curto e atraente (pode ser o nome do programa ou da campanha).
- publico: quem recebe, descrito pelo dado (ex.: "quem perguntou sobre menopausa e não agendou nos últimos 60 dias").
- oferta: para pacote/programa, o que inclui (consultas, exames, acompanhamento, materiais, retorno, canal direto com a equipe), pensado a partir dos serviços da ficha. NUNCA preço, desconto, condição especial, brinde, sorteio, "grátis", parcelamento ou promessa de resultado. Para outros tipos, a proposta de valor ou null.
- canal: WhatsApp, Instagram orgânico, Meta Ads, presencial, parceiros etc.
- mensagem: texto pronto em português do Brasil, tom do Brand Brain, com [colchetes] para personalizar; sem preço, sem promessa de resultado, sem antes e depois. Pode ser roteiro de Reels, copy de anúncio ou mensagem de WhatsApp.
- porque: a lógica da ideia em 1 a 3 frases, ligando dado e Brain.
- evidencias: 1 a 4 fatos com número tirados do contexto (ex.: "preço aparece em 31% das conversas (n = 212)"). Não invente número.
- brain: chaves do Brand Brain usadas, exatamente como aparecem (memoria.chave). Só as que existem.
- passos: 3 a 6 passos práticos, com quem faz.
- metrica: como saber se funcionou (número e fonte: CRM, conversas, Instagram, anúncios).
- esforco: baixo, medio ou alto. prazo_dias: de 7 a 60.
Regras: varie os tipos e os ângulos; cada ideia tem que ser diferente das já propostas; responda objeções reais e use o que o público procura; aproveite datas de saúde quando fizer sentido; nada de decisão clínica, diagnóstico ou indicação de tratamento individual; nada de nome, telefone, @ ou caso de paciente. Sem travessão.
Responda SOMENTE JSON: {"ideias":[{"tipo":"pacote","titulo":"...","publico":"...","oferta":"...","canal":"...","mensagem":"...","porque":"...","evidencias":["..."],"brain":["audiencia.objecao_preco"],"passos":["..."],"metrica":"...","esforco":"medio","prazo_dias":30}]}`;

const FOCOS_GROWTH: [string, string][] = [
  ["aquisicao", "5 ideias para trazer e converter pacientes novos: pacotes ou programas de cuidado montados com os serviços da clínica, campanhas de anúncio (ângulo, público, criativo), conteúdo de autoridade e parcerias ou eventos."],
  ["relacionamento", "5 ideias para quem já chegou: reativar leads parados e recuperáveis, retorno e acompanhamento de pacientes, abordagens de atendimento que respondam às objeções e corrijam as falhas mais frequentes, e indicação."],
];

const FLUXO_GROWTH: Fluxo = {
  id: "campanhas_estrategia", agente: "growth", nome: "Estrategista de Campanhas: estratégias, pacotes e abordagens",
  objetivo: "Cruzar o Brand Brain com os dados da clínica e propor estratégias de campanha, pacotes e abordagens. Nada é enviado nem publicado: a equipe aprova e executa na aba Campanhas.",
  passos: [
    {
      nome: "ler_contexto", descricao: "Lê Brand Brain, ficha, conversas, CRM, Instagram, anúncios, datas e estratégias anteriores", ferramenta: "growth.ler_contexto", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("growth.ler_contexto", { client_id: c.exec.client_id });
        if (r.blocos < 2) return { tipo: "concluir", resultado: { ideias: 0, motivo: "Pouco dado da clínica ainda (ficha, Brain, conversas, CRM ou Instagram). Ligue as fontes ou aprove o Brand Brain." } };
        return { tipo: "seguir", saida: { blocos: r.blocos, brain: r.brain, conversas: r.conversas }, contexto: { texto: r.texto, chaves: r.chaves, titulos: r.titulos, ideias: [], descartes: [] } };
      },
    },
    ...FOCOS_GROWTH.map(([foco, texto]): Passo => ({
      nome: `propor_${foco}`, descricao: `A IA propõe ideias de ${foco}; o servidor descarta o que fere o CFM, tem dado pessoal ou não tem evidência`, ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        if (!iaDisponivel()) return { tipo: "falhar", erro: "IA não configurada no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
        const ja = c.exec.contexto.ideias as IdeiaCampanha[];
        const titulos = [...(c.exec.contexto.titulos as string[]), ...ja.map((i) => i.titulo)];
        const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_GROWTH.replace("{FOCO}", texto), finalidade: `agente_growth_${foco}`, max_tokens: 2500,
          entrada: `${c.exec.contexto.texto}${ja.length ? `\n\n### Ideias desta rodada (não repita)\n${ja.map((i) => `- ${i.titulo}`).join("\n")}` : ""}` });
        const v = validarIdeias(r.json, c.exec.contexto.chaves as string[], titulos);
        const notas = await criticar(c, c.exec.contexto.texto, v.ok.map((i) => `${i.titulo} (${i.tipo})\nPara quem: ${i.publico}\nPor quê: ${i.porque}\nEvidências: ${i.evidencias.join("; ")}\nTexto: ${i.mensagem ?? ""}`), `growth_${foco}`);
        const { ok, descartes: dc } = aplicarCritica(v.ok, notas);
        const descartes = [...v.descartes, ...dc];
        return { tipo: "seguir", saida: { ideias: ok.length, descartes, modelo: r.modelo }, contexto: { ideias: [...ja, ...ok], descartes: [...(c.exec.contexto.descartes as string[]), ...descartes] } };
      },
    })),
    {
      nome: "gravar", descricao: "Grava as ideias como propostas na aba Campanhas", ferramenta: "growth.gravar_ideias", risco: "baixo", idempotente: true,
      executar: async (c) => {
        const ideias = c.exec.contexto.ideias as IdeiaCampanha[];
        const r = await c.usar("growth.gravar_ideias", { client_id: c.exec.client_id, ideias: ideias as unknown as Record<string, unknown>[] });
        return { tipo: "seguir", saida: r, contexto: { gravadas: r.gravadas, texto: null } };
      },
    },
    {
      nome: "concluir", descricao: "Encerra com o resumo", risco: "baixo",
      executar: async (c) => ({ tipo: "concluir", resultado: { ideias: Number(c.exec.contexto.gravadas ?? 0), descartadas: (c.exec.contexto.descartes as string[]).length, revisar_em: "Cliente → Campanhas" } }),
    },
  ],
};

// ---------------------------------------------------------------- fluxos 4 a 6: Recuperação, Anúncios, Conteúdo
// Mesmo desenho: a regra escolhe (quem, qual campanha); a IA escreve no tom do Brain; o servidor valida; grava como
// proposta. Nada sai do Hub sem uma pessoa.

const REGRAS_TEXTO = `Português do Brasil, natural, como gente fala. Frases curtas. Sem travessão. Sem jargão de marketing ("transforme", "jornada", "incrível", "não perca"). Nada de preço, desconto, condição especial, brinde, sorteio, "grátis", antes e depois ou promessa de resultado (CFM). Nada de diagnóstico ou indicação de tratamento individual. Nunca escreva nome, telefone, e-mail ou @ de paciente.`;

const SISTEMA_RECUPERACAO = `Você escreve, para a secretária de uma clínica médica, a mensagem de WhatsApp que retoma a conversa com cada pessoa da lista. A secretária revisa e envia.
Para cada caso: leia o que aconteceu e escreva UMA mensagem curta (2 a 4 frases), específica para aquela conversa: retome o assunto exato, responda a objeção com informação (sem preço e sem pressão) e termine com uma pergunta fácil de responder ou dois horários entre [colchetes] para a secretária preencher. Comece SEMPRE exatamente com "Oi, [nome]!" (a tela troca pelo primeiro nome). NUNCA invente data, dia da semana, horário, nome de médico ou disponibilidade de agenda: você não sabe a agenda. Também não afirme o estado do agendamento (confirmado, remarcado, cancelado) nem resultado de exame: você não sabe; pergunte. Onde precisar, escreva [dia] e [horário] entre colchetes para a secretária preencher. Se a pessoa estava esperando resposta da clínica, peça desculpa pela demora em uma frase.
Use o tom do Brand Brain. Se houver resultado das mensagens anteriores, siga o estilo que teve mais resposta.
${REGRAS_TEXTO}
Responda SOMENTE JSON: {"mensagens":[{"conversa_id":"...","mensagem":"...","por_que":"em 1 frase, por que esta abordagem"}]}`;

const FLUXO_RECUPERACAO: Fluxo = {
  id: "recuperacao_pacientes", agente: "recuperacao", nome: "Recuperação de pacientes: lista do dia com mensagem pronta",
  objetivo: "Achar quem teve interesse e não agendou ou ficou esperando a clínica, e preparar a mensagem individual. A secretária revisa e envia; o sistema mede sozinho se respondeu e se agendou.",
  passos: [
    {
      nome: "ler", descricao: "A regra escolhe quem recuperar hoje e lê o tom da clínica e o que funcionou antes", ferramenta: "recuperacao.ler", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("recuperacao.ler", { client_id: c.exec.client_id });
        if (!r.casos.length) return { tipo: "concluir", resultado: { mensagens: 0, motivo: r.bloqueio ?? "Ninguém elegível para recuperar hoje (ou as conversas ainda não foram lidas pela auditoria)." } };
        return { tipo: "seguir", saida: { casos: r.casos.length, filtro: r.filtro, licoes: r.n_licoes }, contexto: { casos: r.casos.map((x: any) => ({ conversa_id: x.conversa_id, motivo: x.motivo, prioridade: x.prioridade, dias: x.dias })), filtro: r.filtro,
          texto: limitarTexto(`### Clínica\n${r.ficha}\n\n### Tom e regras da clínica (Brand Brain)\n${r.brain.texto || "(sem Brain aprovado: use tom acolhedor e direto)"}\n\n${r.licoes ? `${r.licoes}\n\n` : ""}${r.aprendizado}\n\n### Lista de hoje\n${r.casos.map((x: any) => x.texto).join("\n\n")}`, 16_000) } };
      },
    },
    {
      nome: "escrever", descricao: "A IA escreve cada mensagem; o servidor descarta o que fere o CFM ou tem dado pessoal", ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        if (!iaDisponivel()) return { tipo: "falhar", erro: "IA não configurada no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
        const casos = c.exec.contexto.casos as { conversa_id: string }[];
        const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_RECUPERACAO, entrada: c.exec.contexto.texto, finalidade: "agente_recuperacao", max_tokens: 3000, qualidade: "forte" });
        const v = validarRecuperacao(r.json, new Set(casos.map((x) => x.conversa_id)));
        const notas = await criticar(c, c.exec.contexto.texto, v.ok.map((m) => `Mensagem de recuperação para a conversa ${m.conversa_id}: ${m.mensagem}`), "recuperacao");
        const cr = aplicarCritica(v.ok, notas);
        const descartes = [...v.descartes, ...cr.descartes];
        return { tipo: "seguir", saida: { mensagens: cr.ok.length, descartes, modelo: r.modelo }, contexto: { mensagens: cr.ok, descartes, texto: null } };
      },
    },
    {
      nome: "gravar", descricao: "Grava a lista do dia para a secretária", ferramenta: "sugestoes.gravar", risco: "baixo", idempotente: true,
      executar: async (c) => {
        const casos = new Map((c.exec.contexto.casos as { conversa_id: string; motivo: string; prioridade: number; dias: number }[]).map((x) => [x.conversa_id, x]));
        const ROT: Record<string, string> = { aguardando_clinica: "Esperando resposta da clínica", pediu_preco: "Pediu valor e não agendou", interesse: "Teve interesse e não agendou" };
        const itens = (c.exec.contexto.mensagens as (MensagemRecuperacao & { nota?: number | null; critica?: string | null })[]).map((m) => {
          const k = casos.get(m.conversa_id)!;
          return { tipo: k.motivo, titulo: `${ROT[k.motivo] ?? "Recuperar"} · parada há ${k.dias} dia${k.dias === 1 ? "" : "s"}`, detalhe: m.por_que || null, mensagem: m.mensagem, conversa_id: m.conversa_id, prioridade: k.prioridade, nota: m.nota ?? null, critica: m.critica ?? null };
        });
        const r = await c.usar("sugestoes.gravar", { client_id: c.exec.client_id, agente: "recuperacao", itens });
        return { tipo: "concluir", resultado: { mensagens: r.gravadas, descartadas: (c.exec.contexto.descartes as string[]).length, filtro: c.exec.contexto.filtro ?? null, revisar_em: "Atendimento e vendas → WhatsApp" } };
      },
    },
  ],
};

const SISTEMA_ANUNCIOS = `Você é gestor de tráfego sênior de clínicas médicas no Brasil. Para cada sinal (campanha com número fora do normal), escreva a recomendação para o gestor de tráfego executar no Gerenciador de Anúncios.
Tipos de sinal: sem_resultado (gastou e não trouxe conversa nem lead), custo_subiu (custo por resultado subiu mais de 40%), fadiga (frequência alta, o público já viu demais), escalar (custo bem abaixo da média, com volume).
Para cada um: "titulo" (ação em até 10 palavras), "acao" (o que fazer e por quê, citando os números do sinal), "passos" (2 a 5 passos práticos e concretos no Gerenciador: público, posicionamento, orçamento em %, criativo, objetivo), e "copies" (para sem_resultado, custo_subiu e fadiga: 2 copies novas de anúncio no tom do Brand Brain, cada uma com "gancho" (primeira frase que para a rolagem), "texto" (2 a 4 frases) e "cta"; para escalar: lista vazia).
Escalar = sugerir aumento gradual (15 a 25% a cada 3 dias), nunca dobrar. Não invente número que não está no sinal.
${REGRAS_TEXTO}
Responda SOMENTE JSON: {"recomendacoes":[{"campanha_id":"...","titulo":"...","acao":"...","passos":["..."],"copies":[{"gancho":"...","texto":"...","cta":"..."}]}]}`;

const FLUXO_ANUNCIOS: Fluxo = {
  id: "gestor_anuncios", agente: "anuncios", nome: "Gestor de anúncios: o que pausar, revisar, trocar ou escalar",
  objetivo: "Comparar cada campanha da Meta com a semana anterior e preparar a recomendação com copies novas. O gestor de tráfego decide e faz; o agente não mexe na conta nem no orçamento.",
  passos: [
    {
      nome: "ler", descricao: "A regra compara 7 dias contra 7 anteriores por campanha", ferramenta: "anuncios.ler", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("anuncios.ler", { client_id: c.exec.client_id });
        if (!r.sinais.length) return { tipo: "concluir", resultado: { recomendacoes: 0, motivo: "Nenhuma campanha fora do normal nos últimos 7 dias (ou a conta não tem gasto)." } };
        const sinais = r.sinais as SinalAds[];
        return { tipo: "seguir", saida: { sinais: sinais.map((s) => `${s.tipo}: ${s.campanha}`) }, contexto: { sinais,
          texto: `### Clínica\n${r.ficha}\n\n### Brand Brain (tom, público e o que funciona em criativo)\n${r.brain.texto || "(sem Brain aprovado)"}\n\n${r.licoes ? `${r.licoes}\n\n` : ""}${r.anteriores ? `### Recomendações anteriores (30 dias) e o que aconteceu depois\n${r.anteriores}\n\n` : ""}### Sinais\n${sinais.map((s) => `campanha_id: ${s.campanha_id}\nCampanha: ${s.campanha}\nSinal: ${s.tipo}\n${s.evidencias.join("\n")}`).join("\n\n")}` } };
      },
    },
    {
      nome: "escrever", descricao: "A IA escreve a recomendação e as copies; o servidor confere CFM", ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        if (!iaDisponivel()) return { tipo: "falhar", erro: "IA não configurada no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
        const sinais = c.exec.contexto.sinais as SinalAds[];
        const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_ANUNCIOS, entrada: c.exec.contexto.texto, finalidade: "agente_anuncios", max_tokens: 3000, qualidade: "forte" });
        const v = validarAnuncios(r.json, new Set(sinais.map((s) => s.campanha_id)));
        const notas = await criticar(c, c.exec.contexto.texto, v.ok.map((x) => `${x.titulo}\n${x.acao}\nPassos: ${x.passos.join(" | ")}\nCopies: ${x.copies.map((k) => `${k.gancho} ${k.texto} ${k.cta}`).join(" || ")}`), "anuncios");
        const cr = aplicarCritica(v.ok, notas);
        const descartes = [...v.descartes, ...cr.descartes];
        return { tipo: "seguir", saida: { recomendacoes: cr.ok.length, descartes, modelo: r.modelo }, contexto: { recomendacoes: cr.ok, descartes, texto: null } };
      },
    },
    {
      nome: "gravar", descricao: "Grava as recomendações para o gestor de tráfego", ferramenta: "sugestoes.gravar", risco: "baixo", idempotente: true,
      executar: async (c) => {
        const sinais = new Map((c.exec.contexto.sinais as SinalAds[]).map((s) => [s.campanha_id, s]));
        const itens = (c.exec.contexto.recomendacoes as (RecomendacaoAds & { nota?: number | null; critica?: string | null })[]).map((r) => {
          const s = sinais.get(r.campanha_id)!;
          return { tipo: s.tipo, titulo: r.titulo, detalhe: r.acao, evidencias: [`Campanha: ${s.campanha}`, ...s.evidencias], campanha_id: r.campanha_id, prioridade: s.prioridade, conteudo: { passos: r.passos, copies: r.copies }, nota: r.nota ?? null, critica: r.critica ?? null };
        });
        const r = await c.usar("sugestoes.gravar", { client_id: c.exec.client_id, agente: "anuncios", itens });
        return { tipo: "concluir", resultado: { recomendacoes: r.gravadas, revisar_em: "Anúncios" } };
      },
    },
  ],
};

const SISTEMA_CONTEUDO = `Você é o roteirista sênior de Instagram de uma clínica médica, especialista em conteúdo que o médico grava sozinho com o celular e que o público SALVA e COMPARTILHA. Entregue peças prontas para usar, não ideias.
FOCO DESTA RODADA: {FOCO}
Como escrever:
- Tema: tire de uma dúvida real, de uma objeção das conversas, do que o público procura ou de um tema que já foi muito salvo. Diga de onde veio em "evidencias" (com número) e quais itens do Brain usou em "brain".
- Gancho: a primeira frase falada e escrita na tela, até 12 palavras, que para a rolagem: pergunta direta, erro comum, mito, número, ou "se você [situação], ...". Nada genérico como "Você sabia?" sozinho.
- Reels: 30 a 60 segundos, 4 a 8 cenas. Em cada cena: "fala" (exatamente o que o médico diz, em primeira pessoa, como conversa), "tela" (texto curto na tela, até 6 palavras) e "visual" (o que aparece: médico falando para a câmera, mostrando algo, b-roll do consultório). Uma ideia por cena. Termine com a chamada.
- Carrossel: 6 a 9 slides. Slide 1 = gancho forte; do 2 ao penúltimo, uma ideia por slide com "titulo" curto e "texto" de até 30 palavras; último = resumo + chamada.
- Legenda: 3 a 6 linhas, começa reforçando o gancho, entrega um ponto extra, fecha com a chamada. Pode usar quebras de linha.
- Chamada: salvar, compartilhar com alguém, comentar uma palavra ou chamar no direct/WhatsApp para tirar dúvida. Sem oferta.
- Hashtags: 3 a 6, específicas da especialidade e da cidade quando houver.
- "objetivo": alcance, salvamento, conversa ou autoridade.
- Use o tom e as palavras do Brand Brain. Siga o estilo das peças que a equipe USOU e evite o das DESCARTADAS.
${REGRAS_TEXTO}
Responda SOMENTE JSON: {"pecas":[{"formato":"reels","titulo":"...","objetivo":"salvamento","gancho":"...","cenas":[{"fala":"...","tela":"...","visual":"..."}],"slides":[],"legenda":"...","cta":"...","hashtags":["#..."],"por_que":"...","evidencias":["..."],"brain":["audiencia.duvida_x"]}]}`;

const FOCOS_CONTEUDO: [string, string][] = [
  ["reels", "3 roteiros de Reels completos, de ângulos diferentes (uma dúvida real, uma objeção ou mito, um tema que já foi muito salvo)."],
  ["carrossel", "3 carrosséis completos, de ângulos diferentes (um guia prático, um erro comum, uma resposta a objeção das conversas)."],
];

const FLUXO_CONTEUDO: Fluxo = {
  id: "conteudo_semana", agente: "conteudo", nome: "Roteirista de conteúdo: a semana pronta para gravar",
  objetivo: "Entregar roteiros de Reels cena a cena e carrosséis slide a slide, com legenda e chamada, a partir do Brain, das dúvidas reais e do que mais foi salvo. A equipe revisa, grava e publica.",
  passos: [
    {
      nome: "ler", descricao: "Lê Brain, posts mais salvos, dúvidas, conversas, datas e o que foi usado ou descartado", ferramenta: "conteudo.ler", risco: "baixo",
      executar: async (c) => {
        const r = await c.usar("conteudo.ler", { client_id: c.exec.client_id });
        if (r.blocos < 2) return { tipo: "concluir", resultado: { pecas: 0, motivo: "Pouco dado ainda (Brain, Instagram ou conversas)." } };
        return { tipo: "seguir", saida: { blocos: r.blocos, filtro: r.filtro, licoes: r.n_licoes }, contexto: { texto: r.texto, chaves: r.chaves, titulos: r.titulos, pecas: [], descartes: [], filtro: r.filtro } };
      },
    },
    ...FOCOS_CONTEUDO.map(([foco, texto]): Passo => ({
      nome: `escrever_${foco}`, descricao: `A IA escreve ${foco === "reels" ? "os Reels" : "os carrosséis"}; o servidor confere CFM, formato e dado pessoal`, ferramenta: "ia.gerar_json", risco: "baixo",
      executar: async (c) => {
        if (!iaDisponivel()) return { tipo: "falhar", erro: "IA não configurada no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
        const ja = c.exec.contexto.pecas as PecaConteudo[];
        const r = await c.usar("ia.gerar_json", { sistema: SISTEMA_CONTEUDO.replace("{FOCO}", texto), finalidade: `agente_conteudo_${foco}`, max_tokens: 4000, qualidade: "forte",
          entrada: `${c.exec.contexto.texto}${ja.length ? `\n\n### Já escritas nesta rodada (não repita o tema)\n${ja.map((p) => `- ${p.titulo}`).join("\n")}` : ""}` });
        const v = validarConteudo(r.json, c.exec.contexto.chaves as string[], [...(c.exec.contexto.titulos as string[]), ...ja.map((p) => p.titulo)]);
        const notas = await criticar(c, c.exec.contexto.texto, v.ok.map((p) => pecaParaTexto(p)), `conteudo_${foco}`);
        const { ok, descartes: dc } = aplicarCritica(v.ok, notas);
        const descartes = [...v.descartes, ...dc];
        return { tipo: "seguir", saida: { pecas: ok.length, descartes, modelo: r.modelo }, contexto: { pecas: [...ja, ...ok], descartes: [...(c.exec.contexto.descartes as string[]), ...descartes] } };
      },
    })),
    {
      nome: "gravar", descricao: "Grava as peças para a equipe revisar", ferramenta: "sugestoes.gravar", risco: "baixo", idempotente: true,
      executar: async (c) => {
        // Melhor nota primeiro: a equipe vê antes o que o crítico achou mais forte.
        const pecas = [...(c.exec.contexto.pecas as (PecaConteudo & { nota?: number | null; critica?: string | null })[])].sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0));
        const itens = pecas.map(({ nota, critica, ...p }, n) => ({ tipo: p.formato, titulo: p.titulo, detalhe: p.por_que || null, evidencias: p.evidencias, brain: p.brain, conteudo: p, prioridade: 10 - n, nota: nota ?? null, critica: critica ?? null }));
        const r = await c.usar("sugestoes.gravar", { client_id: c.exec.client_id, agente: "conteudo", itens });
        return { tipo: "concluir", resultado: { pecas: r.gravadas, descartadas: (c.exec.contexto.descartes as string[]).length, filtro: c.exec.contexto.filtro ?? null, revisar_em: "Conteúdo → Ideias" } };
      },
    },
  ],
};

export const FLUXOS: Record<string, Fluxo> = Object.fromEntries([FLUXO_ACESSOS, FLUXO_BRAIN, FLUXO_GROWTH, FLUXO_RECUPERACAO, FLUXO_ANUNCIOS, FLUXO_CONTEUDO].map((f) => [f.id, f]));

/** Itens esperando revisão por clínica, para o limite de cada agente (maxAbertas). */
async function abertasPorClinica(admin: Admin, id: string): Promise<Map<string, number>> {
  const q = id === "brain" ? admin.from("brain_itens").select("client_id").eq("estado", "proposto")
    : id === "campanhas" ? admin.from("campanhas_ideias").select("client_id").eq("estado", "proposta")
    : admin.from("sugestoes_agentes").select("client_id").eq("agente", id).eq("estado", "proposta");
  const { data, error } = await q.limit(20_000);
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { client_id: string }[]) m.set(r.client_id, (m.get(r.client_id) ?? 0) + 1);
  return m;
}

/** Agendamento: para cada agente do catálogo (src/lib/agentes-catalogo.ts), põe na fila a rodada de cada clínica com o
 *  módulo do agente quando a última rodada é mais velha que o intervalo e não há uma em andamento. Antes, mede sozinho o
 *  resultado das sugestões de recuperação (sugestoes_medir). Os agentes só preparam; quem aprova é uma pessoa. */
export async function enfileirarAgendados(admin: Admin): Promise<{ enfileiradas: number; puladas: number; por_agente: Record<string, number>; medidas: number; cheias: number; expiradas: number; aprendizado: Awaited<ReturnType<typeof aprenderTodas>> }> {
  const { data: medidas, error: erroMedir } = await admin.rpc("sugestoes_medir");
  if (erroMedir) throw new Error(`Medição de sugestões indisponível: ${erroMedir.message}`);
  const { error: erroVerificar } = await admin.rpc("operacao_verificar", { p_client_id: null });
  if (erroVerificar) throw new Error(`Acompanhamento de casos indisponível: ${erroVerificar.message}`);
  const aprendizado = await aprenderTodas(admin, 120_000);
  // O que ninguém revisou some sozinho: o agente propõe de novo com dado novo se ainda fizer sentido.
  const agora = Date.now();
  const { data: exp1, error: erroExp1 } = await admin.from("sugestoes_agentes").update({ estado: "descartada", resultado: "expirou sem revisão" })
    .eq("estado", "proposta").lt("criado_em", new Date(agora - 14 * 86_400_000).toISOString()).select("id");
  const { data: exp2, error: erroExp2 } = await admin.from("campanhas_ideias").update({ estado: "descartada", resultado: "expirou sem revisão" })
    .eq("estado", "proposta").lt("criado_em", new Date(agora - 30 * 86_400_000).toISOString()).select("id");
  if (erroExp1 || erroExp2) throw new Error("Não foi possível expirar propostas antigas");
  const expiradas = (exp1?.length ?? 0) + (exp2?.length ?? 0);
  let cheias = 0;
  const { data: mods, error } = await admin.from("cliente_modulos").select("client_id, modulo").in("status", ["ativo", "beta"]);
  if (error) throw new Error(error.message);
  let enfileiradas = 0, puladas = 0;
  const por_agente: Record<string, number> = {};
  for (const ag of AGENTES) {
    const fluxo = FLUXOS[ag.fluxo];
    if (!fluxo) continue;
    const clientes = [...new Set(((mods ?? []) as { client_id: string; modulo: string }[]).filter((m) => m.modulo === ag.modulo).map((m) => m.client_id))];
    const limite = Date.now() - ag.intervaloHoras * 3_600_000;
    const abertas = await abertasPorClinica(admin, ag.id);
    for (const client_id of clientes) {
      if ((abertas.get(client_id) ?? 0) >= ag.maxAbertas) { cheias++; puladas++; continue; }
      const { data: ult, error: erroUlt } = await admin.from("agente_execucoes").select("estado, criado_em").eq("client_id", client_id).eq("fluxo", fluxo.id)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (erroUlt) throw new Error("Não foi possível verificar a última leitura do agente");
      if (ult && (typeof ult.criado_em !== "string" || !Number.isFinite(Date.parse(ult.criado_em)))) throw new Error("Última execução com data inválida");
      const ativa = ult && !["concluida", "falhou", "cancelada"].includes(ult.estado as string);
      if (ativa || (ult && new Date(ult.criado_em as string).getTime() > limite)) { puladas++; continue; }
      const { error: e } = await admin.from("agente_execucoes").insert({ client_id, agente: fluxo.agente, fluxo: fluxo.id, objetivo: `${fluxo.objetivo} (agendado)`, criado_por: null });
      if (e) { if (e.code === "23505") { puladas++; continue; } throw new Error(e.message); }
      enfileiradas++;
      por_agente[ag.id] = (por_agente[ag.id] ?? 0) + 1;
    }
  }
  // Um marco SAP completo, usando as ações e aprovações existentes; sem comunicação externa automática.
  const clientesSap = [...new Set(((mods ?? []) as { client_id: string; modulo: string }[]).filter(m => m.modulo === "sap").map(m => m.client_id))];
  for (const client_id of clientesSap) {
    const { data: cli, error: erroCli } = await admin.from("sap_clinicas").select("id,status,d0").eq("client_id", client_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (erroCli) throw new Error(erroCli.message);
    if (!cli || ["pausada", "encerrada"].includes(cli.status)) continue;
    const { data: operacaoSap, error: erroOperacao } = await admin.rpc("operacao_sap_conferir", { p_clinica_id: cli.id });
    if (erroOperacao) throw new Error(erroOperacao.message);
    if (!cli.d0) continue;
    const { data: ultimo, error: erroUltimo } = await admin.from("agente_execucoes").select("estado,criado_em").eq("client_id",client_id).eq("fluxo","acessos_criticos").order("criado_em", { ascending:false }).limit(1).maybeSingle();
    if (erroUltimo) throw new Error(erroUltimo.message);
    // A marcação concluída não ganha outra execução diária. Revogação fica visível nas ações reconciliadas.
    if (ultimo && ((! ["concluida", "falhou", "cancelada"].includes(ultimo.estado)) || (ultimo.estado === "concluida" && !operacaoSap?.pendentes) || Date.parse(ultimo.criado_em) > agora - 24*3_600_000)) continue;
    const { error: erroInserir } = await admin.from("agente_execucoes").insert({ client_id, agente:"operations", fluxo:"acessos_criticos", objetivo:"Conduzir os acessos críticos até o marco 5 com evidência (agendado)", criado_por:null });
    if (erroInserir && erroInserir.code !== "23505") throw new Error(erroInserir.message);
    if (!erroInserir) { enfileiradas++; por_agente.operations=(por_agente.operations ?? 0)+1; }
  }
  return { enfileiradas, puladas, por_agente, medidas: Number(medidas ?? 0), cheias, expiradas, aprendizado };
}
/** Nome antigo, usado pelo agendamento do n8n ("brain_enfileirar"): agora enfileira todos os agentes. */
export const enfileirarBrain = enfileirarAgendados;
/** Catálogo para a Central (sem funções). */
export function catalogoFluxos() {
  return Object.values(FLUXOS).map((f) => ({ id: f.id, agente: f.agente, nome: f.nome, objetivo: f.objetivo, passos: f.passos.map((p) => ({ nome: p.nome, descricao: p.descricao, risco: p.risco, ferramenta: p.ferramenta ?? null })) }));
}

// ---------------------------------------------------------------- motor
const LEASE_S = 300; // escrever (até 90 s) + autocrítica (até 95 s) cabem num passo sem perder a posse
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
  const atualizar = async (campos: Record<string, unknown>) => {
    const { data, error } = await admin.from("agente_execucoes").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", exec.id).eq("estado", "rodando").select("id").maybeSingle();
    if (error) throw new Error(`Não foi possível persistir o estado do agente: ${error.message}`);
    if (!data) throw new Error("A execução não está mais disponível para este processamento; nenhum passo adicional foi executado.");
  };
  class CacheIncompleto extends Error {}
  const cacheSchema = z.object({
    versao: z.literal(1), ordem: z.number().int(), nome: z.string(), custo_usd: z.number().finite().nonnegative(),
    resultado: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("seguir"), saida: z.unknown().optional(), contexto: z.record(z.unknown()).optional(), irPara: z.string().min(1).optional() }),
      z.object({ tipo: z.literal("concluir"), resultado: z.record(z.unknown()) }),
    ]),
  });
  if (!fluxo) {
    await atualizar({ estado: "falhou", erro: `fluxo desconhecido: ${exec.fluxo}`, lease_ate: null, encerrado_em: new Date().toISOString() });
    return { id: exec.id, estado: "falhou", passos: 0, erro: "fluxo desconhecido" };
  }
  // Um processo encerrado antes de persistir a falha também consome uma tentativa.
  // Sem esta conferência, leases vencidos podem recomeçar o mesmo passo indefinidamente.
  if (exec.tentativas > MAX_TENTATIVAS) {
    const erro = "Limite de tentativas excedido ao retomar o agente. Confira o histórico antes de iniciar uma nova execução.";
    await atualizar({ estado: "falhou", erro, proximo_em: null, lease_ate: null, encerrado_em: new Date().toISOString() });
    return { id: exec.id, estado: "falhou", passos: 0, erro };
  }
  let passos = 0;
  const ctx: Ctx = {
    admin, exec,
    usar: (n, e) => usar(admin, exec, n, e),
    aprovacao: async (passo) => {
      const { data, error } = await admin.from("aprovacoes").select("id, estado, comentario, proposta").eq("execucao_id", exec.id).eq("passo", passo).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`Não foi possível verificar a aprovação: ${error.message}`);
      return (data as any) ?? null;
    },
  };
  while (passos < maxPassos && Date.now() < fim) {
    const passo = fluxo.passos[exec.passo_atual];
    if (!passo) {
      await atualizar({ estado: "concluida", lease_ate: null, encerrado_em: new Date().toISOString() });
      return { id: exec.id, estado: "concluida", passos };
    }
    const custoAntes = await custoDaExecucao(admin, exec.id);
    exec.custo_usd = Math.max(Number(exec.custo_usd), custoAntes);
    if (Number(exec.custo_usd) >= Number(exec.teto_custo_usd)) {
      await atualizar({ estado: "pausada", estado_antes_pausa: "pendente", erro: `teto de custo de IA atingido (US$ ${exec.teto_custo_usd})`, custo_usd: exec.custo_usd, lease_ate: null });
      return { id: exec.id, estado: "pausada", passos, erro: "teto de custo" };
    }
    const chave = passo.idempotente ? `${exec.id}:${passo.nome}:${exec.contexto.rodada ?? 0}` : null;
    const t0 = Date.now();
    let r: Resultado;
    let jaFeito = false;
    let custoCache = 0;
    try {
      if (chave) {
        const { data: feito, error } = await admin.from("agente_passos").select("saida").eq("chave_idempotencia", chave).eq("ok", true).maybeSingle();
        if (error) throw new Error(`Não foi possível conferir a idempotência: ${error.message}`);
        if (feito) {
          const salvo = cacheSchema.safeParse(feito.saida?.__motor);
          if (!salvo.success || salvo.data.ordem !== exec.passo_atual || salvo.data.nome !== passo.nome) throw new CacheIncompleto("O registro antigo ou incompleto deste passo não prova seu resultado/contexto; confira a execução antes de retomar.");
          jaFeito = true; r = salvo.data.resultado; custoCache = salvo.data.custo_usd;
        }
        else r = await passo.executar(ctx);
      } else r = await passo.executar(ctx);
    } catch (e) {
      const erro = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      const { error: erroRegistro } = await admin.from("agente_passos").insert({ execucao_id: exec.id, ordem: exec.passo_atual, nome: passo.nome, ferramenta: passo.ferramenta ?? null, risco: passo.risco, ok: false, erro, ms: Date.now() - t0 });
      if (erroRegistro) throw new Error(`Não foi possível registrar a falha do agente: ${erroRegistro.message}`);
      if (e instanceof CacheIncompleto || e instanceof EfeitoExternoIncerto) {
        await atualizar({ estado: "pausada", estado_antes_pausa: "pendente", erro: `${passo.nome}: ${erro}`, proximo_em: null, lease_ate: null });
        return { id: exec.id, estado: "pausada", passos, erro };
      }
      const tentativas = exec.tentativas;
      if (tentativas >= MAX_TENTATIVAS) {
        await atualizar({ estado: "falhou", erro: `${passo.nome}: ${erro}`, lease_ate: null, encerrado_em: new Date().toISOString() });
        return { id: exec.id, estado: "falhou", passos, erro };
      }
      const espera = 2 ** tentativas;
      await atualizar({ estado: "aguardando", erro: `${passo.nome}: ${erro} (nova tentativa em ${espera} min)`, proximo_em: new Date(Date.now() + espera * 60_000).toISOString(), lease_ate: null });
      return { id: exec.id, estado: "aguardando", passos, erro };
    }
    const custoDepois = await custoDaExecucao(admin, exec.id);
    const custoPasso = Math.max(0, custoDepois - custoAntes);
    const custoTotal = Math.max(Number(exec.custo_usd), custoDepois, custoCache);
    const linha = { execucao_id: exec.id, ordem: exec.passo_atual, nome: passo.nome, ferramenta: passo.ferramenta ?? null, risco: passo.risco, custo_usd: custoPasso, ms: Date.now() - t0 };
    if (!jaFeito) {
      const cacheavel = !!chave && (r.tipo === "seguir" || r.tipo === "concluir");
      const resumo = resumoSaida(r);
      const saida = cacheavel ? { ...(resumo && typeof resumo === "object" && !Array.isArray(resumo) ? resumo : { resultado: resumo }),
        __motor: { versao: 1, ordem: exec.passo_atual, nome: passo.nome, resultado: r, custo_usd: custoTotal } } : resumo;
      const { error } = await admin.from("agente_passos").insert({ ...linha, ok: r.tipo !== "falhar", saida, erro: r.tipo === "falhar" ? r.erro : null, chave_idempotencia: cacheavel ? chave : null });
      if (error) throw new Error(`Não foi possível persistir o passo do agente: ${error.message}`);
    }
    passos++;

    if (r.tipo === "seguir") {
      const contexto = { ...exec.contexto, ...(r.contexto ?? {}) };
      const prox = r.irPara ? fluxo.passos.findIndex((p) => p.nome === r.irPara) : exec.passo_atual + 1;
      if (r.irPara && prox < 0) throw new Error(`Destino de passo inválido: ${r.irPara}`);
      const proximo = prox;
      await atualizar({ contexto, passo_atual: proximo, tentativas: 0, custo_usd: custoTotal, erro: null, lease_ate: new Date(Date.now() + LEASE_S * 1000).toISOString() });
      exec.contexto = contexto; exec.passo_atual = proximo; exec.tentativas = 0; exec.custo_usd = custoTotal;
      continue;
    }
    if (r.tipo === "aprovacao") {
      const { error } = await admin.from("aprovacoes").insert({ execucao_id: exec.id, client_id: exec.client_id, passo: passo.nome, risco: r.risco, resumo: r.resumo, proposta: r.proposta, evidencias: r.evidencias ?? [] });
      if (error) {
        if (error.code !== "23505") throw new Error(`Não foi possível persistir a aprovação: ${error.message}`);
        const { data: pendente, error: erroPendente } = await admin.from("aprovacoes").select("id").eq("execucao_id", exec.id).eq("passo", passo.nome).eq("estado", "pendente").maybeSingle();
        if (erroPendente || !pendente) throw new Error("Não foi possível confirmar a aprovação pendente após conflito de gravação.");
      }
      await atualizar({ estado: "aguardando_aprovacao", custo_usd: custoTotal, lease_ate: null });
      return { id: exec.id, estado: "aguardando_aprovacao", passos };
    }
    if (r.tipo === "aguardar") {
      const proximo = r.irPara ? fluxo.passos.findIndex((p) => p.nome === r.irPara) : exec.passo_atual;
      if (proximo < 0) throw new Error(`Destino de passo inválido: ${r.irPara}`);
      await atualizar({ estado: "aguardando", passo_atual: proximo, proximo_em: new Date(Date.now() + r.minutos * 60_000).toISOString(), erro: r.motivo, custo_usd: custoTotal, tentativas: 0, lease_ate: null });
      return { id: exec.id, estado: "aguardando", passos };
    }
    if (r.tipo === "concluir") {
      await atualizar({ estado: "concluida", resultado: r.resultado, custo_usd: custoTotal, erro: null, lease_ate: null, encerrado_em: new Date().toISOString() });
      return { id: exec.id, estado: "concluida", passos };
    }
    await atualizar({ estado: "falhou", erro: r.erro, custo_usd: custoTotal, lease_ate: null, encerrado_em: new Date().toISOString() });
    return { id: exec.id, estado: "falhou", passos, erro: r.erro };
  }
  // Limite de passos ou de tempo desta chamada: devolve para a fila, de onde parou.
  await atualizar({ estado: "pendente", lease_ate: null });
  return { id: exec.id, estado: "pendente", passos };
}

async function custoDaExecucao(admin: Admin, id: string): Promise<number> {
  const { data, error } = await admin.from("ia_execucoes").select("custo_usd").eq("execucao_id", id);
  if (error) throw new Error(`Não foi possível verificar o custo do agente: ${error.message}`);
  const custos = ((data ?? []) as { custo_usd: number | null }[]).map((r) => Number(r.custo_usd ?? 0));
  if (custos.some((c) => !Number.isFinite(c) || c < 0)) throw new Error("Custo do agente inválido; confira os registros antes de continuar.");
  return custos.reduce((s, c) => s + c, 0);
}

function resumoSaida(r: Resultado): unknown {
  if (r.tipo === "seguir") return r.saida ?? null;
  if (r.tipo === "aprovacao") return { pediu_aprovacao: r.risco, resumo: r.resumo };
  if (r.tipo === "aguardar") return { aguardando_min: r.minutos, motivo: r.motivo };
  if (r.tipo === "concluir") return r.resultado;
  return null;
}
