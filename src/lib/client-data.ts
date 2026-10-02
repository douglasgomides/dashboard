import { supabase } from "@/integrations/supabase/client";
import type {
  ContentFormat,
  FunnelStage,
  MethodologyStage,
} from "@/integrations/supabase/types";

export async function getClient(clientId: string) {
  const { data, error } = await supabase.from("clients")
    // Colunas explícitas: `select *` entregaria wts_api_token ao navegador de qualquer membro.
    .select(
      "id, name, specialty, instagram_handle, cfm_score_status, active, created_at, meta_ad_account_id, wts_company_id, avatar_url, wts_department_ids, em_onboarding",
    )
    .eq("id", clientId)
    .single();
  if (error) throw error;
  return data;
}

export async function listMyClients(userId: string) {
  const { data, error } = await supabase
    .from("client_members")
    .select("client_id, clients(id, name, instagram_handle)")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

export async function getMonthlyMetrics(clientId: string, monthStart: string, monthEnd: string) {
  const { data, error } = await supabase
    .from("instagram_account_daily_metrics")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getRankedPosts(clientId: string, monthStart: string, monthEnd: string) {
  const { data, error } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", monthStart)
    .lte("posted_at", monthEnd)
    .order("saved", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getPostsForAnalytics(clientId: string, sinceDate: string, untilDate?: string) {
  let query = supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", sinceDate);
  if (untilDate) query = query.lte("posted_at", untilDate);
  const { data, error } = await query.order("posted_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getNextAngles(clientId: string, limit = 5) {
  const { data, error } = await supabase.rpc("suggest_next_angles", {
    p_client_id: clientId,
    p_limit: limit,
  });
  if (error) throw error;
  return data;
}

export async function classifyPost(
  postId: string,
  fields: Partial<{
    funnel_stage: FunnelStage | null;
    methodology_stage: MethodologyStage | null;
    tema: string | null;
    format: ContentFormat | null;
  }>,
) {
  const { error } = await supabase.from("instagram_posts").update(fields).eq("id", postId);
  if (error) throw error;
}

// Funil de leads por campo customizado (Fonte do Lead, Tipo de
// Procedimento) × resultado (ganho/perdido) — agregado no banco via RPC.
// A base já passa de 17 mil leads, e trazer tudo cru pro navegador batia no
// limite padrão de 1000 linhas do PostgREST, então o cálculo mora no banco.
export async function getCrmFunilPorCampo(clientId: string, fieldNamePattern: string) {
  const { data, error } = await supabase.rpc("crm_funil_por_campo", {
    p_client_id: clientId,
    p_field_name_pattern: fieldNamePattern,
  });
  if (error) throw error;
  return data;
}

// Algumas contas chamam o campo de "Fonte do Lead" e outras de "Origem do Lead".
// Tenta os nomes em ordem e devolve o primeiro que tem pelo menos um valor informado.
export async function getCrmFunilPorCampoAlt(clientId: string, padroes: string[]) {
  let ultimo: Awaited<ReturnType<typeof getCrmFunilPorCampo>> = [];
  for (const padrao of padroes) {
    ultimo = await getCrmFunilPorCampo(clientId, padrao);
    if (ultimo.some((r) => r.chave !== "Não informado")) return ultimo;
  }
  return ultimo;
}

// Leads por etapa nomeada, em todos os pipelines do cliente — mesmo motivo
// de agregar no banco.
export async function getCrmLeadsPorEtapa(clientId: string) {
  const { data, error } = await supabase.rpc("crm_leads_por_etapa", { p_client_id: clientId });
  if (error) throw error;
  return data;
}

// Toda etapa de todo pipeline, inclusive as que nunca tiveram lead — pro
// kanban de estrutura do CRM. Diferente de getCrmLeadsPorEtapa (que omite
// etapa vazia), aqui a etapa vazia é o próprio achado.
export async function getCrmPipelineKanban(clientId: string) {
  const { data, error } = await supabase.rpc("crm_pipeline_kanban", { p_client_id: clientId });
  if (error) throw error;
  return data;
}

// Métricas essenciais pro painel de visão geral do CRM — "o que tá
// acontecendo hoje", um número por indicador.
export async function getCrmMetricasEssenciais(clientId: string) {
  const { data, error } = await supabase.rpc("crm_metricas_essenciais", { p_client_id: clientId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// Novos leads por dia — pro gráfico de tendência com período trocável.
export async function getCrmLeadsPorDia(clientId: string, days = 30) {
  const { data, error } = await supabase.rpc("crm_leads_por_dia", { p_client_id: clientId, p_days: days });
  if (error) throw error;
  return data;
}

// Últimos leads criados, pro feed de atividade recente do painel.
export async function getCrmAtividadeRecente(clientId: string, limit = 10) {
  const { data, error } = await supabase.rpc("crm_atividade_recente", {
    p_client_id: clientId,
    p_limit: limit,
  });
  if (error) throw error;
  return data;
}

// Dúvidas reais de pacientes nos comentários dos posts — matéria-prima pra
// pauta, não conteúdo pronto. is_question é heurística (pontuação/palavra
// interrogativa), sem IA — quem decide o que virar conteúdo é o time.
export async function getPatientQuestions(clientId: string, limit = 200) {
  const { data, error } = await supabase
    .from("instagram_comments")
    .select("*, instagram_posts(caption, permalink, thumbnail_url, posted_at, tema)")
    .eq("client_id", clientId)
    .eq("is_question", true)
    .order("commented_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Biblioteca de inspiração ("Swipe File Médico") — global, não filtrada por
// cliente. Referência de estrutura/gancho pra adaptar, nunca conteúdo pronto.
export async function listInspirationPosts() {
  const { data, error } = await supabase
    .from("inspiration_posts")
    .select("*")
    .order("multiplicador_mediana", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

// Anúncios do Meta. Agregado no banco pelo mesmo motivo das funções de CRM:
// são ~1.800 linhas por cliente (um dia × uma campanha) e a tela mostra
// meia dúzia de números. CTR/CPC/CPM saem do gasto na leitura, nunca
// gravados, pra não divergirem quando a Meta revisa um dia já sincronizado.
export async function getAdsResumo(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("ads_resumo", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getAdsPorDia(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("ads_por_dia", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data;
}


// O objetivo escolhido na campanha é a variável que mais mexeu no custo por
// conversa desta conta, por isso ganha um corte próprio em vez de virar só
// mais uma coluna na tabela de campanhas.
export async function getAdsPorObjetivo(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("ads_por_objetivo", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data;
}

// Veredito por campanha. A régua é a mediana da própria conta no período, não
// benchmark de mercado — o que é caro para uma clínica não é o que é caro para
// um e-commerce, e o histórico da conta é a única comparação honesta que
// temos.
export async function getAdsDiagnostico(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("ads_diagnostico", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data;
}

// Atendimento no WhatsApp (WTS Chat).
export async function getWtsResumo(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("wts_resumo", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getWtsPorDepartamento(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("wts_por_departamento", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getWtsPorAgente(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("wts_por_agente", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getWtsVolumeDiario(clientId: string, start: string, end: string) {
  const { data, error } = await supabase.rpc("wts_volume_diario", {
    p_client_id: clientId,
    p_start: start,
    p_end: end,
  });
  if (error) throw error;
  return data ?? [];
}

// Quais fontes o cliente tem ligadas — usado para o menu não mostrar aba vazia.
export async function getClientFontes(clientId: string) {
  const { data, error } = await supabase.rpc("client_fontes", { p_client_id: clientId });
  if (error) throw error;
  return data?.[0] ?? null;
}

// Qual CRM alimenta esse cliente ('kommo' | 'clint' | 'planilha' | ...).
// Usado só pra nomear o CRM certo na nota do painel — nada de hardcode "Kommo".
export async function getCrmProvider(clientId: string): Promise<string | null> {
  // rpc() tipado por cast: crm_provider não está no types.ts gerado. Retorna o
  // provider ('kommo' | 'clint' | 'planilha' | ...). Chamar pelo próprio client:
  // soltar o método (`const rpc = supabase.rpc`) perde o `this` e a chamada falha
  // em silêncio, o que escondia o botão de sincronizar CRM em todos os clientes.
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("crm_provider", { p_client_id: clientId });
  if (error) throw error;
  return data ?? null;
}

// Perguntas de paciente nos comentários dentro do período (para a fila de
// Ideias e para o Relatório). Mesma heurística is_question de getPatientQuestions.
export async function getPatientQuestionsPeriodo(clientId: string, start: string, end: string, limit = 1000) {
  const { data, error } = await supabase
    .from("instagram_comments")
    .select("id, text, like_count, instagram_post_id, commented_at")
    .eq("client_id", clientId)
    .eq("is_question", true)
    .gte("commented_at", start)
    .lte("commented_at", end + "T23:59:59")
    .order("commented_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---- Aba "A analisar": significado das etapas do CRM -------------------------

export type EtapaParaAnalise = {
  connection_id: string;
  provider: string;
  pipeline_id: string;
  pipeline_name: string;
  status_id: string;
  status_name: string;
  total: number;
  valor: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  confirmado: boolean;
  resultado_confirmado: "open" | "won" | "lost" | null;
};

// rpc fora do types.ts gerado. Chamar pelo client: soltar supabase.rpc perde o `this`.
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export async function listEtapasParaAnalise(clientId: string): Promise<EtapaParaAnalise[]> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("crm_etapas_para_analise", { p_client_id: clientId });
  if (error) throw new Error(error.message ?? "falha ao ler as etapas");
  return ((data as EtapaParaAnalise[] | null) ?? []).map((r) => ({
    ...r,
    total: Number(r.total),
    valor: Number(r.valor),
    ganhos: Number(r.ganhos),
    perdidos: Number(r.perdidos),
    abertos: Number(r.abertos),
  }));
}

export async function definirEtapaResultado(args: {
  connectionId: string;
  pipelineId: string;
  statusId: string;
  outcome: "open" | "won" | "lost";
}): Promise<number> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("crm_definir_etapa_resultado", {
    p_connection: args.connectionId,
    p_pipeline: args.pipelineId,
    p_status: args.statusId,
    p_outcome: args.outcome,
  });
  if (error) throw new Error(error.message ?? "falha ao salvar");
  return Number(data ?? 0);
}

export type EtapaKpi = {
  connection_id: string;
  provider: string;
  pipeline_id: string;
  pipeline_name: string;
  status_id: string;
  status_name: string;
  total: number;
  consulta_agendada: boolean;
  em_atendimento: boolean;
  padrao_consulta: boolean;
  padrao_atendimento: boolean;
  origem_consulta: "equipe" | "sugestao" | null;
  origem_atendimento: "equipe" | "sugestao" | null;
};

export async function listEtapasKpi(clientId: string): Promise<EtapaKpi[]> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc("crm_etapas_kpi_para_analise", { p_client_id: clientId });
  if (error) throw new Error(error.message ?? "falha ao ler as etapas");
  return ((data as EtapaKpi[] | null) ?? []).map((r) => ({ ...r, total: Number(r.total) }));
}

export async function definirEtapaKpi(args: {
  connectionId: string;
  pipelineId: string;
  statusId: string;
  kpi: "consulta_agendada" | "em_atendimento";
  ativo: boolean;
}): Promise<void> {
  const { error } = await (supabase as unknown as RpcClient).rpc("crm_definir_etapa_kpi", {
    p_connection: args.connectionId,
    p_pipeline: args.pipelineId,
    p_status: args.statusId,
    p_kpi: args.kpi,
    p_ativo: args.ativo,
  });
  if (error) throw new Error(error.message ?? "falha ao salvar");
}
