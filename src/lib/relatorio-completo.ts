// Reúne, para o PDF completo, tudo que o dashboard calcula para um cliente.
// Usa as MESMAS funções de leitura das telas (client-data.ts), então os números do
// PDF são os mesmos que o cliente vê em Resultado, Anúncios, WhatsApp e Comercial.
// Cada bloco opcional falha sozinho: se uma leitura der erro, o bloco sai do PDF e
// o motivo vai para `falhas`, em vez de derrubar o relatório inteiro.
import {
  getClient,
  getClientFontes,
  getCrmProvider,
  getAdsCampanhasPeriodo,
  getAdsDiagnostico,
  getAdsPorDia,
  getAdsPorObjetivo,
  getAdsResumo,
  getCrmLeadsPorEtapa,
  getCrmLeadsPorDiaPeriodo,
  getCrmPessoasNovasPorDia,
  getCrmPessoasPeriodo,
  getCrmResumoPeriodo,
  getCrmVendasPeriodo,
  type CrmPessoasPeriodo,
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsPorAgente,
  getWtsPorDepartamento,
  getWtsResumo,
  getWtsVolumeDiario,
  getAtendimentosWhatsapp,
} from "@/lib/client-data";
import { getResumoPeriodo } from "@/lib/audiencia";
import { completeInstagramPeriod } from "@/lib/report-period";
import { aplicarRastreio, diagnosticarAds, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { buildRelatorioEnvio, type RelatorioEnvio } from "@/lib/relatorio-envio";
import { resumirAtendimento, type ResumoAtendimento } from "@/lib/conversa-leitura";
import { avisosDeCobertura, type CoberturaFonte } from "@/lib/cobertura";
import { supabase } from "@/integrations/supabase/client";
import type { VendasPeriodoBanco } from "@/lib/vendas-periodo";

export interface FontesCliente {
  tem_instagram: boolean;
  tem_anuncios: boolean;
  tem_crm: boolean;
  tem_atendimento: boolean;
}

export interface RelatorioCompletoData {
  clientName: string;
  igHandle: string | null;
  specialty: string | null;
  periodLabel: string;
  start: string;
  end: string;
  fontes: FontesCliente;
  crmNome: string | null;
  textoCliente: string;
  metrics: any[];
  posts: any[];
  perguntas: any[];
  ads: {
    resumo: any | null;
    porDia: any[];
    porObjetivo: any[];
    // Diagnóstico que respeita o objetivo de cada campanha (anuncios-objetivo.ts).
    // O custo por conversa do relatório sai SÓ daqui (campanhas de mensagem).
    objetivo: DiagnosticoAds | null;
    diasComDado: string[];
    // Frequência por campanha (campaign_id → vezes que a mesma pessoa viu), com a definição do
    // relatório antigo: RPC ads_diagnostico, `avg(frequency)` = MÉDIA DAS FREQUÊNCIAS DIÁRIAS,
    // não a frequência do período (a Meta não soma frequência entre dias). O PDF diz isso em nota.
    frequencia: Record<string, number | null>;
  } | null;
  wts: {
    resumo: any | null;
    porDepartamento: any[];
    porAgente: any[];
    volumeDiario: any[];
  } | null;
  // Comercial SÓ do período do relatório (auditoria de 31/10/2026: a página 7 mostrava o histórico inteiro do CRM,
  // 242 ganhos, ao lado dos 19 do período na página 1). O histórico por etapa fica num bloco com título explícito.
  crm: {
    // crm_leads_resumo_periodo: novos e perdidos em PESSOAS, ganhos em CARDS (orçamentos); o valor (fora daqui) soma só ganhos.
    resumo: { novos: number; ganhos: number; perdidos: number } | null;
    pessoas: CrmPessoasPeriodo | null; // crm_pessoas_resumo_periodo
    vendas: VendasPeriodoBanco | null; // crm_vendas_periodo (vendas por evento, coorte, origem classificada)
    porDia: { dia: string; pessoas_novas: number }[]; // crm_pessoas_novas_por_dia_periodo
    porEtapaHistorico: any[]; // crm_leads_por_etapa: histórico total da conta
  } | null;
  // Auditoria comercial: leitura por IA de cada conversa (auditoria_comercial) + tempos por regra fixa.
  auditoria: any | null;
  atendimento: ResumoAtendimento | null;
  // "Antes de ler": problemas no dado de entrada (qualidade_dados) e cobertura do período.
  avisosDados: { titulo: string; texto: string; correcao: string }[];
  omitidos: string[];
  falhas: string[];
  // Conteúdo validado (resumo, vitórias, atenção, ações, testes, limitações) da página 1.
  envio: RelatorioEnvio;
}

async function tentar<T>(rotulo: string, falhas: string[], fn: () => Promise<T>, vazio: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    falhas.push(`${rotulo}: ${err instanceof Error ? err.message : String(err)}`);
    return vazio;
  }
}

export async function coletarRelatorioCompleto(args: {
  clientId: string;
  client: { name: string; instagram_handle: string | null; specialty: string | null };
  fontes: FontesCliente;
  start: string;
  end: string;
  periodLabel: string;
  textoCliente: string;
  crmNome: string | null;
  envio?: RelatorioEnvio;
}): Promise<RelatorioCompletoData> {
  const { clientId, client, fontes, start, end } = args;
  const falhas: string[] = [];
  const omitidos: string[] = [];

  const [metrics, posts, perguntas] = fontes.tem_instagram
    ? await Promise.all([
        tentar("métricas da conta", falhas, () => getMonthlyMetrics(clientId, start, end), [] as any[]),
        tentar("posts", falhas, () => getPostsForAnalytics(clientId, start, end + "T23:59:59"), [] as any[]),
        tentar("dúvidas", falhas, () => getPatientQuestionsPeriodo(clientId, start, end), [] as any[]),
      ])
    : [[] as any[], [] as any[], [] as any[]];
  if (!fontes.tem_instagram) omitidos.push("Instagram (perfil não conectado)");

  let ads: RelatorioCompletoData["ads"] = null;
  if (fontes.tem_anuncios) {
    const [resumo, porDia, porObjetivo, campanhas, diagConta] = await Promise.all([
      tentar("anúncios, resumo", falhas, () => getAdsResumo(clientId, start, end), null as any),
      tentar("anúncios, por dia", falhas, () => getAdsPorDia(clientId, start, end), [] as any[]),
      tentar("anúncios, por objetivo", falhas, () => getAdsPorObjetivo(clientId, start, end), [] as any[]),
      tentar("anúncios, campanhas", falhas, () => getAdsCampanhasPeriodo(clientId, start, end), null),
      tentar("anúncios, frequência por campanha", falhas, () => getAdsDiagnostico(clientId, start, end), [] as any[]),
    ]);
    const frequencia: Record<string, number | null> = {};
    for (const r of (diagConta ?? []) as any[]) {
      const v = r?.frequencia == null ? null : Number(r.frequencia);
      frequencia[String(r.campaign_id)] = v != null && Number.isFinite(v) ? v : null;
    }
    ads = {
      frequencia,
      resumo,
      porDia: porDia ?? [],
      porObjetivo: porObjetivo ?? [],
      objetivo: campanhas ? aplicarRastreio(diagnosticarAds(campanhas.linhas, campanhas.cadastro, start, end, campanhas.janela), await tentar("anúncios, atribuição de atendimento", falhas, () => getAtendimentosWhatsapp(clientId, start, end), null)) : null,
      diasComDado: campanhas ? Array.from(new Set(campanhas.linhas.filter((l) => Number(l.spend) > 0 || Number(l.impressions) > 0).map((l) => String(l.date).slice(0, 10)))) : [],
    };
  } else {
    omitidos.push("Anúncios (nenhuma conta de anúncio ligada)");
  }

  let wts: RelatorioCompletoData["wts"] = null;
  if (fontes.tem_atendimento) {
    const [resumo, porDepartamento, porAgente, volumeDiario] = await Promise.all([
      tentar("atendimento, resumo", falhas, () => getWtsResumo(clientId, start, end), null as any),
      tentar("atendimento, por departamento", falhas, () => getWtsPorDepartamento(clientId, start, end), [] as any[]),
      tentar("atendimento, por agente", falhas, () => getWtsPorAgente(clientId, start, end), [] as any[]),
      tentar("atendimento, volume diário", falhas, () => getWtsVolumeDiario(clientId, start, end), [] as any[]),
    ]);
    wts = { resumo, porDepartamento, porAgente, volumeDiario };
  } else {
    omitidos.push("WhatsApp de atendimento (não conectado)");
  }

  let crm: RelatorioCompletoData["crm"] = null;
  let crmPeriodo: { resumo: { novos: number; ganhos: number; perdidos: number } | null; diasComDado: string[]; vendas: VendasPeriodoBanco | null } | null = null;
  if (fontes.tem_crm) {
    const [resumoP, diasP, vendas, pessoas, porDia, porEtapa] = await Promise.all([
      tentar("CRM, resumo do período", falhas, () => getCrmResumoPeriodo(clientId, start, end), null),
      tentar("CRM, contatos por dia", falhas, () => getCrmLeadsPorDiaPeriodo(clientId, start, end), [] as { dia: string; total: number }[]),
      tentar("CRM, vendas do período", falhas, () => getCrmVendasPeriodo(clientId, start, end), null),
      tentar("CRM, pessoas do período", falhas, () => getCrmPessoasPeriodo(clientId, start, end), null),
      tentar("CRM, pessoas novas por dia", falhas, () => getCrmPessoasNovasPorDia(clientId, start, end), null),
      tentar("CRM, etapas (histórico)", falhas, () => getCrmLeadsPorEtapa(clientId), [] as any[]),
    ]);
    crmPeriodo = { resumo: resumoP, diasComDado: (diasP ?? []).filter((d) => Number(d.total) > 0).map((d) => String(d.dia).slice(0, 10)), vendas };
    crm = {
      resumo: resumoP ? { novos: Number(resumoP.novos), ganhos: Number(resumoP.ganhos), perdidos: Number(resumoP.perdidos) } : null,
      pessoas,
      vendas,
      porDia: (porDia ?? []).map((x) => ({ dia: String(x.dia).slice(0, 10), pessoas_novas: Number(x.pessoas_novas) })),
      porEtapaHistorico: porEtapa ?? [],
    };
  } else {
    omitidos.push("CRM (não conectado)");
  }

  // Conteúdo validado: o da tela (quando veio do Relatório) ou montado aqui com os mesmos dados.
  let envio = args.envio;
  if (!envio) {
    const periodoIg = fontes.tem_instagram ? await tentar("Instagram, alcance único do período", falhas, () => getResumoPeriodo(clientId, start, end), null) : null;
    envio = buildRelatorioEnvio({
      clientName: client.name,
      periodLabel: args.periodLabel,
      start,
      end,
      fontes,
      metrics: metrics ?? [],
      posts: posts ?? [],
      perguntas: perguntas ?? [],
      alcanceUnico: completeInstagramPeriod(periodoIg?.dados, start, end)?.alcance_unico ?? null,
      ads: ads?.objetivo ? { diag: ads.objetivo, diasComDado: ads.diasComDado } : null,
      wts: wts ? { resumo: wts.resumo, diasComDado: (wts.volumeDiario ?? []).filter((d: any) => Number(d.atendimentos) > 0).map((d: any) => String(d.dia).slice(0, 10)) } : null,
      crm: crmPeriodo,
    });
  }

  // Auditoria comercial (só onde há conversa guardada; sem conversa, a seção sai do PDF).
  const auditoria = await tentar(
    "Auditoria comercial",
    falhas,
    async () => {
      const { data, error } = await (supabase as any).rpc("auditoria_comercial", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) throw error;
      const j = Array.isArray(data) ? data[0] : data;
      return j && Number(j.conversas_periodo) > 0 ? j : null;
    },
    null,
  );
  const atendimento = auditoria
    ? await tentar(
        "Tempo de resposta",
        falhas,
        async () => {
          const { data, error } = await (supabase as any).rpc("leitura_conversas", { p_client: clientId, p_limite: 500 });
          if (error) throw error;
          const ls = ((data ?? []) as any[])
            .filter((l) => l.ultima_msg_em && String(l.ultima_msg_em).slice(0, 10) >= start && String(l.ultima_msg_em).slice(0, 10) <= end.slice(0, 10))
            .map((l) => ({ ...l, msgs_paciente: Number(l.msgs_paciente), msgs_clinica: Number(l.msgs_clinica), msgs_automaticas: Number(l.msgs_automaticas) }));
          return ls.length ? resumirAtendimento(ls) : null;
        },
        null,
      )
    : null;

  const avisosDados: { titulo: string; texto: string; correcao: string }[] = [];
  const problemas = await tentar(
    "Qualidade dos dados",
    falhas,
    async () => {
      const { data, error } = await (supabase as any).rpc("qualidade_dados", { p_client_id: clientId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as { titulo: string; evidencia: string; correcao: string; severidade: string }[];
    },
    [],
  );
  for (const p of problemas.sort((a, b) => (a.severidade === "alta" ? -1 : 1) - (b.severidade === "alta" ? -1 : 1)).slice(0, 6))
    avisosDados.push({ titulo: p.titulo, texto: p.evidencia, correcao: p.correcao });
  const cobertura = await tentar(
    "Cobertura do período",
    falhas,
    async () => {
      const { data, error } = await (supabase as any).rpc("cobertura_periodo", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) throw error;
      return (data ?? []) as CoberturaFonte[];
    },
    [] as CoberturaFonte[],
  );
  const hojeBr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  for (const a of avisosDeCobertura(cobertura, start, end.slice(0, 10), hojeBr))
    avisosDados.push({ titulo: `${a.rotulo}: período incompleto`, texto: a.texto, correcao: "Os totais desta parte valem só para os dias com dado." });
  if (auditoria && Number(auditoria.lidas) < Number(auditoria.conversas_periodo))
    avisosDados.push({
      titulo: "Nem toda conversa foi lida",
      texto: `A IA leu ${auditoria.lidas} de ${auditoria.conversas_periodo} conversas do período.`,
      correcao: "A leitura roda todo dia; as que faltam entram no próximo relatório.",
    });

  return {
    avisosDados,
    auditoria,
    atendimento,
    envio,
    clientName: client.name,
    igHandle: client.instagram_handle,
    specialty: client.specialty,
    periodLabel: args.periodLabel,
    start,
    end,
    fontes,
    crmNome: args.crmNome,
    textoCliente: args.textoCliente,
    metrics: metrics ?? [],
    posts: posts ?? [],
    perguntas: perguntas ?? [],
    ads,
    wts,
    crm,
    omitidos,
    falhas,
  };
}

const NOME_CRM: Record<string, string> = {
  kommo: "Kommo",
  clint: "Clint",
  rdstation: "RD Station",
  flwchat: "WTS Chat",
  digisac: "Digisac",
  planilha: "planilha",
  feegow: "Feegow",
  ninsaude: "Ninsaúde",
};

// Ponto único dos dois botões de PDF (Resultado e Relatório): busca cliente e fontes,
// reúne os dados e baixa o relatório completo. O PDF é carregado sob demanda.
export async function gerarEBaixarRelatorioCompleto(args: {
  clientId: string;
  start: string;
  end: string;
  periodLabel: string;
  textoCliente?: string;
  envio?: RelatorioEnvio;
}) {
  const [client, fontes, provider] = await Promise.all([
    getClient(args.clientId),
    getClientFontes(args.clientId),
    getCrmProvider(args.clientId).catch(() => null),
  ]);
  const f: FontesCliente = {
    tem_instagram: fontes?.tem_instagram === true,
    tem_anuncios: fontes?.tem_anuncios === true,
    tem_crm: fontes?.tem_crm === true,
    tem_atendimento: fontes?.tem_atendimento === true,
  };
  const dados = await coletarRelatorioCompleto({
    clientId: args.clientId,
    client: { name: client.name, instagram_handle: client.instagram_handle, specialty: client.specialty },
    fontes: f,
    start: args.start,
    end: args.end,
    periodLabel: args.periodLabel,
    textoCliente: args.textoCliente ?? "",
    crmNome: provider ? (NOME_CRM[provider] ?? provider) : null,
    envio: args.envio,
  });
  const { downloadRelatorioCompleto } = await import("@/lib/pdf-relatorio-completo");
  await downloadRelatorioCompleto(dados);
}
