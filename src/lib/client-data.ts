import { supabase } from "@/integrations/supabase/client";
import { diagnosticarAds, type LinhaAds, type CampanhaCadastro } from "@/lib/anuncios-objetivo";
import type { Acompanhamento } from "@/lib/oportunidades";
import { lerDiagnosticoRpc, montarDadosReduzidos, type DadosComerciais, type MetricasEssenciais, type WtsResumoMin } from "@/lib/comercial";
import { filtrarPerguntas } from "@/lib/comentarios";
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

// Limites de um período em datas (YYYY-MM-DD) no fuso de Brasília. Comparar
// posted_at (timestamptz) com "2026-09-30" virava 30/09 00:00 UTC — 29/09 às 21h
// em Brasília — e sumiam os posts do último dia. Aceita também "…T23:59:59",
// que algumas telas ainda mandam: só a data importa.
export function limitesBR(de: string, ate: string): { desde: string; antesDe: string } {
  const dia = ate.slice(0, 10);
  const seguinte = new Date(dia + "T12:00:00Z");
  seguinte.setUTCDate(seguinte.getUTCDate() + 1);
  return { desde: de.slice(0, 10) + "T00:00:00-03:00", antesDe: seguinte.toISOString().slice(0, 10) + "T00:00:00-03:00" };
}

export async function getRankedPosts(clientId: string, monthStart: string, monthEnd: string) {
  const { desde, antesDe } = limitesBR(monthStart, monthEnd);
  const { data, error } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", desde)
    .lt("posted_at", antesDe)
    .order("saved", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function getPostsForAnalytics(clientId: string, sinceDate: string, untilDate?: string) {
  const { desde, antesDe } = limitesBR(sinceDate, untilDate ?? sinceDate);
  let query = supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", desde);
  if (untilDate) query = query.lt("posted_at", antesDe);
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

// Versoes por periodo (seletor do cabecalho). Datas AAAA-MM-DD, intervalo fechado.
export async function getCrmFunilPorCampoPeriodoAlt(clientId: string, padroes: string[], from: string, to: string) {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { chave: string; total: number }[] | null; error: unknown }>;
  };
  let ultimo: { chave: string; total: number }[] = [];
  for (const padrao of padroes) {
    const { data, error } = await cliente.rpc("crm_funil_por_campo_periodo", {
      p_client_id: clientId,
      p_field_name_pattern: padrao,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;
    ultimo = data ?? [];
    if (ultimo.some((r) => r.chave !== "Não informado")) return ultimo;
  }
  return ultimo;
}

export async function getCrmLeadsPorDiaPeriodo(clientId: string, from: string, to: string) {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { dia: string; total: number }[] | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("crm_leads_por_dia_periodo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

export async function getCrmResumoPeriodo(clientId: string, from: string, to: string) {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{
      data: { novos: number; ganhos: number; perdidos: number; valor: number }[] | null;
      error: unknown;
    }>;
  };
  const { data, error } = await cliente.rpc("crm_leads_resumo_periodo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return data?.[0] ?? { novos: 0, ganhos: 0, perdidos: 0, valor: 0 };
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

// @ das contas do próprio cliente: resposta do perfil nos comentários não é paciente perguntando.
async function donosDoPerfil(clientId: string): Promise<string[]> {
  const { data } = await supabase.from("instagram_accounts").select("ig_username").eq("client_id", clientId);
  return (data ?? []).map((r) => r.ig_username).filter((x): x is string => !!x);
}

export async function getPatientQuestions(clientId: string, limit = 200) {
  const { data, error } = await supabase
    .from("instagram_comments")
    .select("*, instagram_posts(caption, permalink, thumbnail_url, posted_at, tema)")
    .eq("client_id", clientId)
    .eq("is_question", true)
    .order("commented_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  // Sorteio, convite para seguir e resposta do próprio perfil saem da lista (lib/comentarios.ts).
  return filtrarPerguntas(data ?? [], await donosDoPerfil(clientId));
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

// Linhas diárias por campanha + cadastro das campanhas, para o diagnóstico que
// respeita o objetivo (src/lib/anuncios-objetivo.ts). Lido direto das tabelas
// (RLS: membro do cliente ou admin), paginado porque passa de 1.000 linhas.
export async function getAdsCampanhasPeriodo(clientId: string, start: string, end: string) {
  const linhas: LinhaAds[] = [];
  const PAGINA = 1000;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await (supabase as any)
      .from("meta_ads_daily")
      .select("date, campaign_id, spend, impressions, link_clicks, conversations, leads, landing_page_views")
      .eq("client_id", clientId)
      .gte("date", start)
      .lte("date", end.slice(0, 10))
      .order("date", { ascending: true })
      .order("campaign_id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    linhas.push(...((data ?? []) as LinhaAds[]));
    if (!data || data.length < PAGINA) break;
  }
  const { data: cad, error: e2 } = await (supabase as any)
    .from("meta_ads_campaigns")
    .select("campaign_id, name, objective, permalink, thumbnail_url")
    .eq("client_id", clientId);
  if (e2) throw e2;
  return { linhas, cadastro: (cad ?? []) as CampanhaCadastro[] };
}

export async function getAdsDiagnosticoPorObjetivo(clientId: string, start: string, end: string) {
  const { linhas, cadastro } = await getAdsCampanhasPeriodo(clientId, start, end);
  return diagnosticarAds(linhas, cadastro, start, end.slice(0, 10));
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
    .select("id, text, like_count, instagram_post_id, commented_at, author_username")
    .eq("client_id", clientId)
    .eq("is_question", true)
    .gte("commented_at", limitesBR(start, end).desde)
    .lt("commented_at", limitesBR(start, end).antesDe)
    .order("commented_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return filtrarPerguntas(data ?? [], await donosDoPerfil(clientId));
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

// ---- Central de voz do paciente (Dúvidas e Ideias) ---------------------------
// Comentários CRUS do período, antes da triagem: os marcados como pergunta e os que
// falam de preço ou agendamento mesmo sem "?". A triagem (lib/voz-do-paciente.ts) roda
// na tela, para mostrar também o que ficou de fora e por quê.
const TERMOS_COMERCIAIS = ["valor", "preço", "preco", "quanto custa", "agendar", "consulta", "atende", "convênio", "convenio"];

export async function getComentariosVozDoPaciente(clientId: string, start: string, end: string, limit = 1500) {
  const { desde, antesDe } = limitesBR(start, end);
  const filtro = ["is_question.eq.true", ...TERMOS_COMERCIAIS.map((t) => `text.ilike.*${t}*`)].join(",");
  const [{ data, error }, donos] = await Promise.all([
    supabase
      .from("instagram_comments")
      .select("id, text, like_count, instagram_post_id, commented_at, author_username, is_question, instagram_posts(caption, permalink, thumbnail_url, posted_at, tema)")
      .eq("client_id", clientId)
      .or(filtro)
      .gte("commented_at", desde)
      .lt("commented_at", antesDe)
      .order("commented_at", { ascending: false })
      .limit(limit),
    donosDoPerfil(clientId),
  ]);
  if (error) throw error;
  const comentarios = data ?? [];
  return { comentarios, donos, noLimite: comentarios.length >= limit };
}

// ---- Comercial: "onde o funil quebra" + checklist de dados -------------------
// Tenta a RPC crm_diagnostico_comercial (migração 20261013150000). Se ela ainda não
// existe no banco, monta uma leitura reduzida com as funções que já existem.

export async function getDiagnosticoComercial(clientId: string, start: string, end: string): Promise<DadosComerciais> {
  const cli = supabase as unknown as RpcClient;
  const fontes = await getClientFontes(clientId).catch(() => null);
  const whatsappConectado = !!fontes?.tem_atendimento;
  const wts: WtsResumoMin | null = whatsappConectado ? await getWtsResumo(clientId, start, end).catch(() => null) : null;

  const { data, error } = await cli.rpc("crm_diagnostico_comercial", { p_client_id: clientId, p_from: start, p_to: end });
  if (!error && data && typeof data === "object") {
    return lerDiagnosticoRpc(data as Record<string, any>, { whatsappConectado, wts });
  }

  const [provider, metricas, etapas, jornada] = await Promise.all([
    getCrmProvider(clientId).catch(() => null),
    getCrmMetricasEssenciais(clientId).catch(() => null),
    getCrmLeadsPorEtapa(clientId).catch(() => []),
    cli
      .rpc("jornada_resumo", { p_client: clientId })
      .then((r) => (r.error ? null : (r.data as { leads_total: number; leads_sem_pessoa: number } | null)))
      .catch(() => null),
  ]);
  return montarDadosReduzidos({
    provider,
    metricas: metricas as MetricasEssenciais | null,
    etapas: (etapas as { pipeline: string; etapa: string; total: number }[]).map((e) => ({ ...e, total: Number(e.total) })),
    jornada,
    whatsappConectado,
    wts,
  });
}

// ---- Oportunidades: acompanhamento das ações (migração 20261013210000) -------
// Enquanto a tabela não existe no banco, guarda no navegador e avisa a tela
// (`local: true`), para ninguém achar que o histórico está salvo para a equipe.

const chaveLocal = (clientId: string) => `hub-acoes-${clientId}`;
function lerLocal(clientId: string): Acompanhamento[] {
  try {
    return JSON.parse(localStorage.getItem(chaveLocal(clientId)) ?? "[]") as Acompanhamento[];
  } catch {
    return [];
  }
}
function gravarLocal(clientId: string, xs: Acompanhamento[]) {
  try {
    localStorage.setItem(chaveLocal(clientId), JSON.stringify(xs));
  } catch {
    /* navegador sem armazenamento: segue sem persistir */
  }
}
const semTabela = (e: any) => e?.code === "42P01" || e?.code === "PGRST205" || /acoes_acompanhamento/.test(e?.message ?? "");

export async function getAcompanhamentos(clientId: string): Promise<{ itens: Acompanhamento[]; local: boolean }> {
  const { data, error } = await (supabase as any).from("acoes_acompanhamento").select("*").eq("client_id", clientId);
  if (error) {
    if (semTabela(error)) return { itens: lerLocal(clientId), local: true };
    throw error;
  }
  return {
    local: false,
    itens: (data ?? []).map((r: any) => ({
      clientId: r.client_id,
      insightId: r.insight_id,
      titulo: r.titulo,
      status: r.status,
      responsavel: r.responsavel,
      prazo: r.prazo,
      checklist: r.checklist ?? [],
      historico: r.historico ?? [],
      feedback: r.feedback,
      resultado: r.resultado,
      criadoEm: r.criado_em,
      atualizadoEm: r.atualizado_em,
    })),
  };
}

export async function salvarAcompanhamento(a: Acompanhamento): Promise<{ local: boolean }> {
  const { error } = await (supabase as any).from("acoes_acompanhamento").upsert({
    client_id: a.clientId,
    insight_id: a.insightId,
    titulo: a.titulo,
    status: a.status,
    responsavel: a.responsavel,
    prazo: a.prazo,
    checklist: a.checklist,
    historico: a.historico,
    feedback: a.feedback,
    resultado: a.resultado,
    atualizado_em: a.atualizadoEm,
  });
  if (error) {
    if (!semTabela(error)) throw error;
    const xs = lerLocal(a.clientId).filter((x) => x.insightId !== a.insightId);
    gravarLocal(a.clientId, [...xs, a]);
    return { local: true };
  }
  return { local: false };
}
