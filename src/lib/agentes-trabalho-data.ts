import { supabase } from "@/integrations/supabase/client";
import type { AgenteCatalogo } from "./agentes-catalogo";
import { TRABALHOS_AGENTE, type RodadaAgente, type TrabalhoAgente } from "./agentes-trabalho";

const db = supabase as any;

/** Só metadados; mensagens, nomes e conteúdo das propostas são lidos na ferramenta de revisão existente. */
export async function lerTrabalhoAgente(clientId: string, agente: AgenteCatalogo, admin: boolean): Promise<TrabalhoAgente> {
  const tabela = agente.id === "brain" ? "brain_itens" : agente.id === "campanhas" ? "campanhas_ideias" : "sugestoes_agentes";
  const dias = TRABALHOS_AGENTE[agente.id].janelaDias;
  let pendentes = db.from(tabela).select(agente.id === "recuperacao" ? "id,operacao:operacao_recuperacao(id)" : "id", { count: "exact", head: true })
    .eq("client_id", clientId).eq("estado", agente.id === "brain" ? "proposto" : "proposta");
  let ultima = db.from(tabela).select("criado_em").eq("client_id", clientId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (!["brain", "campanhas"].includes(agente.id)) {
    pendentes = pendentes.eq("agente", agente.id);
    ultima = ultima.eq("agente", agente.id);
  }
  if (dias != null) pendentes = pendentes.gte("criado_em", new Date(Date.now() - dias * 86_400_000).toISOString());
  // Anti-join: uma proposta assumida deixa a fila de revisão e fica no acompanhamento operacional.
  if (agente.id === "recuperacao") pendentes = pendentes.is("operacao", null);
  const [p, u, e] = await Promise.all([
    pendentes, ultima,
    admin ? db.from("agente_execucoes").select("id,estado,criado_em,atualizado_em,resultado")
      .eq("client_id", clientId).eq("fluxo", agente.fluxo).order("criado_em", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [p, u, e]) if (r.error) throw new Error("Não foi possível conferir as entregas e o estado deste agente.");
  if (!Number.isSafeInteger(p.count) || p.count < 0) throw new Error("A contagem de entregas está indisponível.");
  return { pendentes: p.count, ultimaEntrega: u.data?.criado_em ?? null, rodada: e.data as RodadaAgente | null };
}

export async function lerModulosAgentes(clientId: string): Promise<{ modulo: string; status: string }[]> {
  const { data, error } = await db.from("cliente_modulos").select("modulo,status").eq("client_id", clientId);
  if (error) throw new Error("Não foi possível conferir o agendamento contratado para esta clínica.");
  return data ?? [];
}
