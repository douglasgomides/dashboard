// Brand Brain (admin): leitura dos itens e as ações reais (aprovar, corrigir, rejeitar, restaurar, escrever à mão,
// pedir propostas ao agente). Tudo passa pelas funções brain_* do banco ou pelo motor de agentes.
import { supabase } from "@/integrations/supabase/client";
import { iniciarFluxo, rodarAgentes } from "@/lib/agentes-data";
import type { Confianca, Memoria } from "@/lib/brand-brain";

const db = supabase as any;

export type EstadoItem = "proposto" | "aprovado" | "rejeitado" | "substituido";
export interface ItemBrain {
  id: string; client_id: string; memoria: Memoria; chave: string; valor: string; fonte: string; fonte_detalhe: string | null;
  confianca: Confianca; estado: EstadoItem; origem: "agente" | "manual" | "restaurado"; comentario: string | null;
  criado_em: string; decidido_em: string | null; execucao_id: string | null;
}

/** Clínicas com o módulo Brand Brain (ativo ou beta). */
export async function getClinicasBrain(): Promise<{ client_id: string; nome: string; status: string }[]> {
  const { data, error } = await db.from("cliente_modulos").select("client_id, status, clients(name)").eq("modulo", "brand_brain").in("status", ["ativo", "beta"]);
  if (error) throw error;
  return ((data ?? []) as { client_id: string; status: string; clients: { name: string } | null }[])
    .map((r) => ({ client_id: r.client_id, status: r.status, nome: r.clients?.name ?? "Clínica" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function getItensBrain(clientId: string): Promise<ItemBrain[]> {
  const { data, error } = await db.from("brain_itens").select("*").eq("client_id", clientId).order("criado_em", { ascending: false }).limit(1000);
  if (error) throw error;
  return (data ?? []) as ItemBrain[];
}

const erroBrain = (m: string) =>
  /motivo obrigatorio/.test(m) ? "Escreva o motivo da rejeição."
    : /texto obrigatorio/.test(m) ? "Escreva o texto corrigido."
      : /dado pessoal/.test(m) ? "O texto parece ter telefone, e-mail ou CPF. O Brand Brain não guarda dado de paciente."
        : /ja decidida/.test(m) ? "Esta proposta já foi decidida. Recarregue a tela."
          : /nao ativo/.test(m) ? "Brand Brain não está ativo para esta clínica."
            : m;

export async function decidirItem(id: string, acao: "aprovar" | "corrigir" | "rejeitar", valor?: string, comentario?: string) {
  const { error } = await db.rpc("brain_decidir", { p_id: id, p_acao: acao, p_valor: valor ?? null, p_comentario: comentario ?? null });
  if (error) throw new Error(erroBrain(error.message));
}
export async function restaurarItem(id: string) {
  const { error } = await db.rpc("brain_restaurar", { p_id: id });
  if (error) throw new Error(erroBrain(error.message));
}
export async function escreverItem(clientId: string, memoria: Memoria, chave: string, valor: string) {
  const { error } = await db.rpc("brain_manual", { p_client_id: clientId, p_memoria: memoria, p_chave: chave, p_valor: valor });
  if (error) throw new Error(erroBrain(error.message));
}

/** Última leitura das fontes desta clínica (para mostrar na própria tela do Brand Brain). */
export async function getUltimaLeitura(clientId: string): Promise<{ estado: string; erro: string | null; resultado: Record<string, unknown> | null; quando: string } | null> {
  const { data, error } = await db.from("agente_execucoes").select("estado, erro, resultado, atualizado_em").eq("client_id", clientId).eq("fluxo", "brain_carga")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle()
    .abortSignal(AbortSignal.timeout(15_000)).retry(false);
  if (error) throw error;
  return data ? { estado: data.estado, erro: data.erro, resultado: data.resultado, quando: data.atualizado_em } : null;
}

/** Pede ao agente Brand que leia as fontes e proponha itens. Roda no servidor até o fim (é curto). */
export async function pedirPropostas(clientId: string) {
  const id = await iniciarFluxo(clientId, { id: "brain_carga", agente: "brand", nome: "", objetivo: "Ler as fontes que a clínica já tem no Hub e propor itens para o Brand Brain.", passos: [] });
  const r = await rodarAgentes(id);
  return { execucaoId: id, ...(r as { execucoes?: { estado: string; erro?: string }[] }) };
}

/** Agrupa por memória e chave: a versão aprovada, as propostas pendentes e o histórico. */
export function organizar(itens: ItemBrain[]) {
  const porChave = new Map<string, { memoria: Memoria; chave: string; aprovado: ItemBrain | null; propostas: ItemBrain[]; historico: ItemBrain[] }>();
  for (const i of itens) {
    const k = `${i.memoria}:${i.chave}`;
    const g = porChave.get(k) ?? { memoria: i.memoria, chave: i.chave, aprovado: null, propostas: [], historico: [] };
    if (i.estado === "aprovado") g.aprovado = i;
    else if (i.estado === "proposto") g.propostas.push(i);
    else g.historico.push(i);
    porChave.set(k, g);
  }
  return [...porChave.values()];
}
