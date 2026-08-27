import { supabase } from "@/integrations/supabase/client";
import type {
  ContentFormat,
  FunnelStage,
  MethodologyStage,
} from "@/integrations/supabase/types";

export async function getClient(clientId: string) {
  const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).single();
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
