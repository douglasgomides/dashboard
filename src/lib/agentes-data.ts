// Central de Agentes (admin): leitura das execuções, passos, aprovações e custo de IA, e as ações reais
// (iniciar, rodar, aprovar, rejeitar, pedir correção, pausar, retomar, cancelar). Tudo passa pelas funções do banco
// (agentes_*) ou pelo servidor (/api/sync/manual, alvo "agentes"); nenhuma ação é simulada na tela.
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type EstadoExecucao = "pendente" | "rodando" | "aguardando" | "aguardando_aprovacao" | "pausada" | "concluida" | "falhou" | "cancelada";
export interface ExecucaoAgente {
  id: string; client_id: string; agente: string; fluxo: string; objetivo: string; estado: EstadoExecucao; passo_atual: number;
  proximo_em: string | null; tentativas: number; custo_usd: number; teto_custo_usd: number; erro: string | null;
  resultado: Record<string, unknown> | null; criado_em: string; atualizado_em: string; encerrado_em: string | null;
  contexto: Record<string, unknown>;
}
export interface PassoAgente { id: number; execucao_id: string; ordem: number; nome: string; ferramenta: string | null; risco: string | null; saida: unknown; ok: boolean | null; erro: string | null; custo_usd: number; ms: number | null; criado_em: string }
export interface AprovacaoAgente { id: string; execucao_id: string; client_id: string; passo: string; risco: "medio" | "alto"; resumo: string; proposta: Record<string, unknown>; evidencias: unknown[]; estado: string; comentario: string | null; decidido_em: string | null; criado_em: string }
export interface FluxoCatalogo { id: string; agente: string; nome: string; objetivo: string; passos: { nome: string; descricao: string; risco: string; ferramenta: string | null }[] }

export const NOME_ESTADO: Record<EstadoExecucao, string> = {
  pendente: "Na fila", rodando: "Rodando", aguardando: "Aguardando", aguardando_aprovacao: "Precisa de aprovação",
  pausada: "Pausada", concluida: "Concluída", falhou: "Falhou", cancelada: "Cancelada",
};

export async function getCentralAgentes(): Promise<{ execucoes: ExecucaoAgente[]; aprovacoes: AprovacaoAgente[]; custoMes: number; chamadasMes: number; falhasIaMes: number }> {
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const [ex, ap, ia] = await Promise.all([
    db.from("agente_execucoes").select("*").order("atualizado_em", { ascending: false }).limit(100),
    db.from("aprovacoes").select("*").eq("estado", "pendente").order("criado_em", { ascending: true }),
    db.from("ia_execucoes").select("custo_usd, ok").gte("criado_em", inicioMes.toISOString()),
  ]);
  for (const r of [ex, ap, ia]) if (r.error) throw r.error;
  const linhasIa = (ia.data ?? []) as { custo_usd: number | null; ok: boolean }[];
  return {
    execucoes: (ex.data ?? []) as ExecucaoAgente[],
    aprovacoes: (ap.data ?? []) as AprovacaoAgente[],
    custoMes: linhasIa.reduce((s, r) => s + Number(r.custo_usd ?? 0), 0),
    chamadasMes: linhasIa.length,
    falhasIaMes: linhasIa.filter((r) => !r.ok).length,
  };
}

export async function getPassos(execucaoId: string): Promise<PassoAgente[]> {
  const { data, error } = await db.from("agente_passos").select("*").eq("execucao_id", execucaoId).order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PassoAgente[];
}

async function servidor(corpo: Record<string, unknown>) {
  const { data: sessao } = await supabase.auth.getSession();
  const resp = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token ?? ""}` },
    body: JSON.stringify({ alvo: "agentes", ...corpo }),
  });
  const j = (await resp.json().catch(() => null)) as Record<string, any> | null;
  if (!resp.ok) throw new Error(j?.error ?? `Falha (${resp.status})`);
  return j ?? {};
}

export async function getCatalogoFluxos(): Promise<FluxoCatalogo[]> {
  return ((await servidor({ acao: "catalogo" })).fluxos ?? []) as FluxoCatalogo[];
}
/** Roda a fila (ou só a execução indicada) no servidor, até parar numa aprovação, espera ou fim. */
export async function rodarAgentes(execucaoId?: string) {
  return servidor({ acao: "rodar", execucao_id: execucaoId });
}
export async function iniciarFluxo(clientId: string, fluxo: FluxoCatalogo): Promise<string> {
  const { data, error } = await db.rpc("agentes_iniciar", { p_client_id: clientId, p_agente: fluxo.agente, p_fluxo: fluxo.id, p_objetivo: fluxo.objetivo });
  if (error) throw error;
  return data as string;
}
export async function decidirAprovacao(id: string, decisao: "aprovada" | "rejeitada" | "correcao", comentario: string) {
  const { error } = await db.rpc("agentes_decidir", { p_aprovacao: id, p_decisao: decisao, p_comentario: comentario });
  if (error) throw error;
}
export async function controlarExecucao(id: string, acao: "pausar" | "retomar" | "cancelar") {
  const { error } = await db.rpc("agentes_controlar", { p_execucao: id, p_acao: acao });
  if (error) throw error;
}

/** Fila de exceções: o que precisa de uma pessoa agora, do mais urgente para o menos. */
export function excecoes(execucoes: ExecucaoAgente[], aprovacoes: AprovacaoAgente[]): { tipo: "aprovacao" | "falha" | "teto" | "configuracao"; id: string; risco: number }[] {
  const out: { tipo: "aprovacao" | "falha" | "teto" | "configuracao"; id: string; risco: number }[] = [];
  for (const a of aprovacoes) out.push({ tipo: "aprovacao", id: a.id, risco: a.risco === "alto" ? 3 : 2 });
  for (const e of execucoes) {
    if (["pausada", "aguardando"].includes(e.estado) && /CLICKUP_API_TOKEN|Configuração pendente/i.test(e.erro ?? "")) out.push({ tipo: "configuracao", id: e.id, risco: 3 });
    else if (e.estado === "falhou") out.push({ tipo: "falha", id: e.id, risco: 3 });
    else if (e.estado === "pausada" && /teto/.test(e.erro ?? "")) out.push({ tipo: "teto", id: e.id, risco: 2 });
  }
  return out.sort((a, b) => b.risco - a.risco);
}

/** Inicia um fluxo do catálogo para a clínica e roda até terminar (cada chamada anda alguns passos; uma rodada com IA
 *  leva de 30 s a 2 min). Devolve null se concluiu, ou a mensagem do que impediu. Só admin (agentes_iniciar). */
export async function rodarFluxoAteFim(clientId: string, fluxo: { id: string; agente: string; objetivo: string }, aoAndar?: (t: string) => void): Promise<string | null> {
  const id = await iniciarFluxo(clientId, { ...fluxo, nome: "", passos: [] });
  const fim = ["concluida", "falhou", "cancelada", "pausada", "aguardando_aprovacao"];
  for (let i = 0; i < 8; i++) {
    aoAndar?.(i === 0 ? "Lendo os dados da clínica…" : "A IA está trabalhando…");
    const r = (await rodarAgentes(id)) as { execucoes?: { id: string; estado: string; erro?: string }[] };
    const e = r.execucoes?.find((x) => x.id === id);
    if (e && fim.includes(e.estado)) return e.estado === "concluida" ? null : (e.erro ?? `execução ${NOME_ESTADO[e.estado as EstadoExecucao] ?? e.estado}`);
  }
  return "Ainda rodando. Atualize a página em 1 minuto.";
}
