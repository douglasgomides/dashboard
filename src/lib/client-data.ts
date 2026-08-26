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

// Leads da Kommo pro cliente — status_id/pipeline_id numéricos, sem nome
// (o webhook da Kommo não manda nome de etapa, só o número).
export async function getCrmLeads(clientId: string) {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, external_lead_id, status_id, pipeline_id, price, raw_payload, received_at")
    .eq("client_id", clientId)
    .order("received_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Nome de cada etapa/pipeline da Kommo — buscado uma vez via API (token de
// longa duração gerado manualmente no painel dela) e salvo aqui, porque o
// webhook não manda nome, só status_id/pipeline_id numéricos.
export async function getCrmPipelineStatuses(clientId: string) {
  const { data, error } = await supabase
    .from("crm_pipeline_statuses")
    .select("pipeline_id, pipeline_name, status_id, status_name, crm_connections!inner(client_id)")
    .eq("crm_connections.client_id", clientId);
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
