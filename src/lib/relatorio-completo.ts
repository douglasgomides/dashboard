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
  getCrmFunilPorCampo,
  getCrmLeadsPorDia,
  getCrmLeadsPorEtapa,
  getCrmMetricasEssenciais,
  getCrmLeadsPorDiaPeriodo,
  getCrmResumoPeriodo,
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsPorAgente,
  getWtsPorDepartamento,
  getWtsResumo,
  getWtsVolumeDiario,
} from "@/lib/client-data";
import { getResumoPeriodo } from "@/lib/audiencia";
import { diagnosticarAds, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { buildRelatorioEnvio, type RelatorioEnvio } from "@/lib/relatorio-envio";

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
  crm: {
    metricas: any | null;
    porEtapa: any[];
    porOrigem: any[];
    porDia: any[];
  } | null;
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

  const dias = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);

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
      objetivo: campanhas ? diagnosticarAds(campanhas.linhas, campanhas.cadastro, start, end) : null,
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
  let crmPeriodo: { resumo: { novos: number; ganhos: number; perdidos: number } | null; diasComDado: string[] } | null = null;
  if (fontes.tem_crm) {
    const [resumoP, diasP] = await Promise.all([
      tentar("CRM, resumo do período", falhas, () => getCrmResumoPeriodo(clientId, start, end), null),
      tentar("CRM, contatos por dia", falhas, () => getCrmLeadsPorDiaPeriodo(clientId, start, end), [] as { dia: string; total: number }[]),
    ]);
    crmPeriodo = { resumo: resumoP, diasComDado: (diasP ?? []).filter((d) => Number(d.total) > 0).map((d) => String(d.dia).slice(0, 10)) };
    const [metricas, porEtapa, porOrigem, porDia] = await Promise.all([
      tentar("CRM, métricas", falhas, () => getCrmMetricasEssenciais(clientId), null as any),
      tentar("CRM, etapas", falhas, () => getCrmLeadsPorEtapa(clientId), [] as any[]),
      tentar("CRM, origem", falhas, () => getCrmFunilPorCampo(clientId, "%Fonte do Lead%"), [] as any[]),
      tentar("CRM, leads por dia", falhas, () => getCrmLeadsPorDia(clientId, Math.min(Math.max(dias, 7), 120)), [] as any[]),
    ]);
    crm = { metricas, porEtapa: porEtapa ?? [], porOrigem: porOrigem ?? [], porDia: porDia ?? [] };
  } else {
    omitidos.push("CRM (não conectado)");
  }

  // Conteúdo validado: o da tela (quando veio do Relatório) ou montado aqui com os mesmos dados.
  let envio = args.envio;
  if (!envio) {
    const periodoIg = fontes.tem_instagram ? await getResumoPeriodo(clientId, start, end).catch(() => null) : null;
    envio = buildRelatorioEnvio({
      clientName: client.name,
      periodLabel: args.periodLabel,
      start,
      end,
      fontes,
      metrics: metrics ?? [],
      posts: posts ?? [],
      perguntas: perguntas ?? [],
      alcanceUnico: periodoIg?.dados?.alcance_unico ?? null,
      ads: ads?.objetivo ? { diag: ads.objetivo, diasComDado: ads.diasComDado } : null,
      wts: wts ? { resumo: wts.resumo, diasComDado: (wts.volumeDiario ?? []).filter((d: any) => Number(d.atendimentos) > 0).map((d: any) => String(d.dia).slice(0, 10)) } : null,
      crm: crmPeriodo,
    });
  }

  return {
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
