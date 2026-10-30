import { supabase } from "@/integrations/supabase/client";
import { aplicarRastreio, diagnosticarAds, type AlcanceJanela, type LinhaAds, type CampanhaCadastro } from "@/lib/anuncios-objetivo";
import type { Acompanhamento } from "@/lib/oportunidades";
import { lerDiagnosticoRpc, montarDadosReduzidos, type DadosComerciais, type MetricasEssenciais, type WtsResumoMin } from "@/lib/comercial";
import { filtrarPerguntas, perguntasDaDeteccaoOriginal } from "@/lib/comentarios";
import { normalizarTemas } from "@/lib/classificacao-post";
import { fetchAllRows } from "@/lib/pagination";
import type {
  ContentFormat,
  FunnelStage,
  MethodologyStage,
} from "@/integrations/supabase/types";

export async function getClient(clientId: string) {
  const { data, error } = await supabase.from("clients")
    // Colunas explícitas: `select *` entregaria wts_api_token ao navegador de qualquer membro.
    .select(
      "id, name, specialty, instagram_handle, cfm_score_status, active, created_at, meta_ad_account_id, wts_company_id, avatar_url, wts_department_ids, em_onboarding, rotulo_custo",
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
  return fetchAllRows((from, to) => supabase
    .from("instagram_account_daily_metrics")
    .select("*")
    .eq("client_id", clientId)
    .gte("date", monthStart)
    .lte("date", monthEnd)
    .order("date", { ascending: true })
    .order("id")
    .range(from, to));
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
  return normalizarTemas(await fetchAllRows((from, to) => supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", desde)
    .lt("posted_at", antesDe)
    .order("saved", { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, to)));
}

export async function getPostsForAnalytics(clientId: string, sinceDate: string, untilDate?: string) {
  const { desde, antesDe } = limitesBR(sinceDate, untilDate ?? sinceDate);
  return normalizarTemas(await fetchAllRows((from, to) => {
    let query = supabase
    .from("instagram_posts")
    .select("*")
    .eq("client_id", clientId)
    .gte("posted_at", desde);
  if (untilDate) query = query.lt("posted_at", antesDe);
    return query.order("posted_at", { ascending: false }).order("id").range(from, to);
  }));
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

// Pessoas x cards (migração 20261023170000). Em painéis como "Orçamentos" da
// WTS cada card é um orçamento e a mesma pessoa tem vários; contar card como
// "lead novo" infla o número. Se a RPC não existir ainda, devolve null e a tela
// segue com a contagem por card.
export interface CrmPessoasPeriodo {
  cards: number;
  pessoas: number;
  pessoas_novas: number;
  pessoas_recorrentes: number;
  cards_de_recorrentes: number;
  ganhos: number;
  perdidos: number;
  abertos: number;
  valor: number;
  valor_ganho: number;
  max_cards_por_pessoa: number;
}

export async function getCrmPessoasPeriodo(clientId: string, from: string, to: string): Promise<CrmPessoasPeriodo | null> {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: CrmPessoasPeriodo[] | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("crm_pessoas_resumo_periodo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error || !data?.[0]) return null;
  const r = data[0];
  return {
    cards: Number(r.cards), pessoas: Number(r.pessoas), pessoas_novas: Number(r.pessoas_novas),
    pessoas_recorrentes: Number(r.pessoas_recorrentes), cards_de_recorrentes: Number(r.cards_de_recorrentes),
    ganhos: Number(r.ganhos), perdidos: Number(r.perdidos), abertos: Number(r.abertos),
    valor: Number(r.valor), valor_ganho: Number(r.valor_ganho), max_cards_por_pessoa: Number(r.max_cards_por_pessoa),
  };
}

export async function getCrmPessoasNovasPorDia(clientId: string, from: string, to: string) {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { dia: string; pessoas_novas: number; cards: number }[] | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("crm_pessoas_novas_por_dia_periodo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) return null;
  return (data ?? []).map((r) => ({ dia: r.dia, pessoas_novas: Number(r.pessoas_novas), cards: Number(r.cards) }));
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
    .select("*, instagram_posts!instagram_comments_instagram_post_id_fkey(caption, permalink, thumbnail_url, posted_at, tema)")
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
      .select("date, campaign_id, spend, impressions, link_clicks, conversations, leads, landing_page_views, reach, clicks")
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
  // Alcance de 7 dias pela campanha inteira (frequência real). Extra: sem a tabela ou com erro, vale a conta antiga.
  const { data: jan, error: e3 } = await (supabase as any)
    .from("meta_ads_alcance_janela")
    .select("campaign_id, desde, ate, reach, impressions, frequency")
    .eq("client_id", clientId);
  return { linhas, cadastro: (cad ?? []) as CampanhaCadastro[], janela: (e3 ? [] : (jan ?? [])) as AlcanceJanela[] };
}

export async function getAdsDiagnosticoPorObjetivo(clientId: string, start: string, end: string) {
  const [{ linhas, cadastro, janela }, whatsapp] = await Promise.all([getAdsCampanhasPeriodo(clientId, start, end), getAtendimentosWhatsapp(clientId, start, end)]);
  // Confiabilidade do rastreio antes de qualquer diagnóstico (src/lib/rastreio-anuncios.ts).
  return aplicarRastreio(diagnosticarAds(linhas, cadastro, start, end.slice(0, 10), janela), whatsapp);
}

/** Atendimentos no WhatsApp do cliente no período; null quando não há WhatsApp ligado ou a leitura falha. */
export async function getAtendimentosWhatsapp(clientId: string, start: string, end: string): Promise<number | null> {
  try {
    const fontes = await getClientFontes(clientId);
    if (!fontes?.tem_atendimento) return null;
    const r: any = await getWtsResumo(clientId, start, end);
    return r?.atendimentos != null ? Number(r.atendimentos) : null;
  } catch {
    return null;
  }
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

// Impulsionamentos lidos da planilha de distribuição de conteúdo da equipe Doctor Creator (clients.ads_planilha_url), para cliente cuja conta de
// anúncios não é lida pela Meta nem pela Windsor. Uma linha por post em cada análise SEMANAL: não é dado diário.
export interface AdsPlanilhaLinha {
  analise_em: string;
  post_url: string;
  nome: string | null;
  tipo: string | null;
  status: string | null;
  acao: string | null;
  orcamento_dia: number | null;
  valor_total: number | null;
  valor_periodo: number | null;
  seguidores_antes: number | null;
  seguidores_apos: number | null;
  seguidores_periodo: number | null;
  mensagens_antes: number | null;
  mensagens_depois: number | null;
  mensagens_periodo: number | null;
  custo_seguidor: number | null;
  custo_mensagem: number | null;
  atualizado_em: string;
}

export async function getAdsPlanilha(clientId: string): Promise<AdsPlanilhaLinha[]> {
  // tabela fora do types.ts gerado: leitura tipada por cast (mesmo padrão de crm_provider)
  const cliente = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: AdsPlanilhaLinha[] | null; error: unknown }>;
        };
      };
    };
  };
  const { data, error } = await cliente
    .from("ads_planilha_semanal")
    .select("analise_em, post_url, nome, tipo, status, acao, orcamento_dia, valor_total, valor_periodo, seguidores_antes, seguidores_apos, seguidores_periodo, mensagens_antes, mensagens_depois, mensagens_periodo, custo_seguidor, custo_mensagem, atualizado_em")
    .eq("client_id", clientId)
    .order("analise_em", { ascending: false });
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
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
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

// ---- Papel de cada funil (migração 20261030170000) ----------------------------
// Sem linha em crm_funil_papel o funil é de captação. Só compra e base saem da contagem de lead novo.
export type PapelFunil = "captacao" | "venda" | "operacional" | "compra" | "base";

export async function listPapeisFunil(connectionIds: string[]): Promise<Map<string, { papel: PapelFunil; definido_por: "regra" | "equipe" }>> {
  const out = new Map<string, { papel: PapelFunil; definido_por: "regra" | "equipe" }>();
  if (connectionIds.length === 0) return out;
  const cliente = supabase as unknown as {
    from: (t: string) => { select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: { crm_connection_id: string; pipeline_id: string; papel: PapelFunil; definido_por: "regra" | "equipe" }[] | null; error: { message?: string } | null }> } };
  };
  const { data, error } = await cliente.from("crm_funil_papel").select("crm_connection_id, pipeline_id, papel, definido_por").in("crm_connection_id", connectionIds);
  if (error) throw new Error(error.message ?? "falha ao ler o papel dos funis");
  for (const r of data ?? []) out.set(`${r.crm_connection_id}|${r.pipeline_id}`, { papel: r.papel, definido_por: r.definido_por });
  return out;
}

export async function definirPapelFunil(args: { connectionId: string; pipelineId: string; papel: PapelFunil }): Promise<void> {
  const { error } = await (supabase as unknown as RpcClient).rpc("crm_definir_papel_funil", {
    p_connection_id: args.connectionId,
    p_pipeline_id: args.pipelineId,
    p_papel: args.papel,
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
      .select("id, text, like_count, instagram_post_id, commented_at, author_username, is_question, instagram_posts!instagram_comments_instagram_post_id_fkey(caption, permalink, thumbnail_url, posted_at, tema)")
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
  const fontes = await getClientFontes(clientId);
  const whatsappConectado = !!fontes?.tem_atendimento;
  const wts: WtsResumoMin | null = whatsappConectado ? await getWtsResumo(clientId, start, end) : null;

  const { data, error } = await cli.rpc("crm_diagnostico_comercial", { p_client_id: clientId, p_from: start, p_to: end });
  if (!error && data && typeof data === "object") {
    return lerDiagnosticoRpc(data as Record<string, any>, { whatsappConectado, wts });
  }
  // Compatibilidade só para função ausente. Rede, permissão e falha de banco
  // precisam chegar à tela; não podem virar um diagnóstico de funil vazio.
  if (error && !["42883", "PGRST202"].includes(error.code ?? "")) throw error;
  if (!error) throw new Error("O diagnóstico comercial não retornou dados válidos. Tente novamente.");

  const [provider, metricas, etapas, jornada] = await Promise.all([
    getCrmProvider(clientId),
    getCrmMetricasEssenciais(clientId),
    getCrmLeadsPorEtapa(clientId),
    cli
      .rpc("jornada_resumo", { p_client: clientId })
      .then((r) => { if (r.error) throw r.error; return r.data as { leads_total: number; leads_sem_pessoa: number } | null; }),
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
    throw new Error("Não foi possível guardar o acompanhamento neste navegador. A alteração não foi salva.");
  }
}
const semTabela = (e: any) => e?.code === "42P01" || e?.code === "PGRST205";

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

// ---- Dúvidas: detecção original (477eb43) ------------------------------------------------------
// A leitura que a tela Dúvidas fazia no baseline: só comentários com is_question = true, com o post
// (miniatura, link, tema), filtrados pela regra original (lib/comentarios.ts `filtrarPerguntasOriginal`:
// sai só texto curto, resposta do próprio perfil e sorteio/convite). Sem período = as últimas 200, de
// qualquer data, exatamente como antes. Com período, usa os limites do fuso de Brasília (limitesBR).
// (Import aqui embaixo para este trecho ficar só acrescentado ao arquivo; imports são içados.)

export async function getPerguntasDeteccaoOriginal(clientId: string, periodo?: { start: string; end: string } | null, limit?: number) {
  const max = limit ?? (periodo ? 1000 : 200);
  let consulta = supabase
    .from("instagram_comments")
    .select("id, text, like_count, instagram_post_id, commented_at, author_username, is_question, instagram_posts!instagram_comments_instagram_post_id_fkey(caption, permalink, thumbnail_url, posted_at, tema)")
    .eq("client_id", clientId)
    .eq("is_question", true);
  if (periodo) {
    const { desde, antesDe } = limitesBR(periodo.start, periodo.end);
    consulta = consulta.gte("commented_at", desde).lt("commented_at", antesDe);
  }
  const [{ data, error }, donos] = await Promise.all([
    consulta.order("commented_at", { ascending: false, nullsFirst: false }).limit(max),
    donosDoPerfil(clientId),
  ]);
  if (error) throw error;
  const lidos = data ?? [];
  return { perguntas: perguntasDaDeteccaoOriginal(lidos, donos), lidos: lidos.length, donos, noLimite: lidos.length >= max, limite: max };
}

// ---- Qualidade dos dados (RPC qualidade_dados, migração 20261013230000) --------
// O que está entrando errado, causa provável, como corrigir e quem corrige.
export interface ProblemaDado {
  id: string;
  fonte: "crm" | "instagram" | "anuncios" | "atendimento" | "comentarios" | string;
  severidade: "alta" | "media" | "baixa";
  titulo: string;
  evidencia: string;
  causa: string;
  correcao: string;
  responsavel: string;
  afeta: string;
}

export async function getQualidadeDados(clientId: string): Promise<ProblemaDado[]> {
  const { data, error } = await (supabase as any).rpc("qualidade_dados", { p_client_id: clientId });
  if (error) {
    // Migração ainda não aplicada neste banco: sem lista, sem quebrar a tela.
    if (error.code === "PGRST202" || /qualidade_dados/.test(error.message ?? "")) return [];
    throw error;
  }
  return Array.isArray(data) ? (data as ProblemaDado[]) : [];
}

// Base viva x parada do CRM (crm_base_viva): só leads em aberto. Sem a função, devolve null.
export interface BaseViva { abertos: number; vivos_30d: number; parados_90d: number; criados_30d: number }
export async function getCrmBaseViva(clientId: string): Promise<BaseViva | null> {
  const { data, error } = await (supabase as any).rpc("crm_base_viva", { p_client_id: clientId });
  if (error) { if (error.code === "PGRST202" || /crm_base_viva/.test(error.message ?? "")) return null; throw error; }
  const j = Array.isArray(data) ? data[0] : data;
  return j && Number(j.abertos) > 0 ? { abertos: Number(j.abertos), vivos_30d: Number(j.vivos_30d), parados_90d: Number(j.parados_90d), criados_30d: Number(j.criados_30d) } : null;
}

// Retorno do investimento do período (RPC roi_periodo). null = sem acesso ou RPC ausente.
export async function getRoiPeriodo(clientId: string, de: string, ate: string): Promise<import("@/lib/roi").DadosRoi | null> {
  const { data, error } = await (supabase as any).rpc("roi_periodo", { p_client_id: clientId, p_de: de, p_ate: ate });
  if (error) throw error;
  if (!data) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    tem_anuncios: !!data.tem_anuncios,
    tem_crm: !!data.tem_crm,
    crm_provider: typeof data.crm_provider === "string" ? data.crm_provider : null,
    rotulo_custo: data.rotulo_custo === "paciente" ? "paciente" : "venda",
    investido: n(data.investido),
    // Banco ainda sem a separação por objetivo: tudo conta como aquisição, como antes, e o selo avisa que é estimativa.
    investido_aquisicao: data.investido_aquisicao === undefined ? n(data.investido) : n(data.investido_aquisicao),
    investido_crescimento: n(data.investido_crescimento),
    investido_estimado: data.investido_estimado === undefined ? n(data.investido) : n(data.investido_estimado),
    leads: n(data.leads),
    leads_com_origem: n(data.leads_com_origem),
    ganhos: n(data.ganhos),
    ganhos_com_valor: n(data.ganhos_com_valor),
    receita: n(data.receita),
    ganho_identificavel: !!data.ganho_identificavel,
    crm_compartilhado: !!data.crm_compartilhado,
    crm_compartilhado_com: Array.isArray(data.crm_compartilhado_com) ? data.crm_compartilhado_com.map(String) : [],
    anuncios_compartilhados_com: Array.isArray(data.anuncios_compartilhados_com) ? data.anuncios_compartilhados_com.map(String) : [],
    anuncios_planilha: !!data.anuncios_planilha,
    anuncios_ate: typeof data.anuncios_ate === "string" ? data.anuncios_ate : null,
  };
}

// Comentários do período (todos, não só perguntas), com o tema do post: base de "Tema que gera identificação".
export async function getComentariosPeriodo(clientId: string, start: string, end: string, limit = 2000) {
  const { desde, antesDe } = limitesBR(start, end);
  const { data, error } = await supabase
    .from("instagram_comments")
    .select("id, text, author_username, instagram_post_id, instagram_posts!instagram_comments_instagram_post_id_fkey(tema)")
    .eq("client_id", clientId)
    .gte("commented_at", desde)
    .lt("commented_at", antesDe)
    .order("commented_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as { id: string; text: string; author_username: string | null; instagram_post_id: string | null; instagram_posts: { tema: string | null } | null }[];
}

// Objeções das conversas de WhatsApp lidas pela IA (auditoria comercial), por tipo. null quando não há.
export async function getObjecoesWhatsapp(clientId: string, start: string, end: string): Promise<Record<string, number> | null> {
  const { data, error } = await (supabase as any).rpc("auditoria_comercial", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
  if (error || !data?.objecoes) return null;
  return data.objecoes as Record<string, number>;
}

// Posts para casar com campanhas de impulsionamento: o post costuma ser publicado antes do período do
// anúncio, então busca desde alguns meses antes. Só as colunas usadas, paginado.
export async function getPostsParaImpulsionados(clientId: string, desde: string) {
  const posts = await fetchAllRows((from, to) => supabase
      .from("instagram_posts")
      .select("id, caption, posted_at, permalink, thumbnail_url, reach")
      .eq("client_id", clientId)
      .gte("posted_at", desde)
      .order("posted_at", { ascending: false })
      .order("id")
      .range(from, to));
  return posts.filter((post): post is typeof post & { posted_at: string } => post.posted_at !== null);
}
