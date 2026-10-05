// Reúne, para o PDF completo, tudo que o dashboard calcula para um cliente.
// Usa as MESMAS funções de leitura das telas (client-data.ts), então os números do
// PDF são os mesmos que o cliente vê em Resultado, Anúncios, WhatsApp e Comercial.
// Cada bloco opcional falha sozinho: se uma leitura der erro, o bloco sai do PDF e
// o motivo vai para `falhas`, em vez de derrubar o relatório inteiro.
import {
  getClient,
  getClientFontes,
  getCrmProvider,
  getAdsDiagnostico,
  getAdsPorDia,
  getAdsPorObjetivo,
  getAdsResumo,
  getCrmFunilPorCampo,
  getCrmLeadsPorDia,
  getCrmLeadsPorEtapa,
  getCrmMetricasEssenciais,
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsPorAgente,
  getWtsPorDepartamento,
  getWtsResumo,
  getWtsVolumeDiario,
} from "@/lib/client-data";

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
    diagnostico: any[];
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
    const [resumo, porDia, porObjetivo, diagnostico] = await Promise.all([
      tentar("anúncios, resumo", falhas, () => getAdsResumo(clientId, start, end), null as any),
      tentar("anúncios, por dia", falhas, () => getAdsPorDia(clientId, start, end), [] as any[]),
      tentar("anúncios, por objetivo", falhas, () => getAdsPorObjetivo(clientId, start, end), [] as any[]),
      tentar("anúncios, diagnóstico", falhas, () => getAdsDiagnostico(clientId, start, end), [] as any[]),
    ]);
    ads = { resumo, porDia: porDia ?? [], porObjetivo: porObjetivo ?? [], diagnostico: diagnostico ?? [] };
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
  if (fontes.tem_crm) {
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

  return {
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
  });
  const { downloadRelatorioCompleto } = await import("@/lib/pdf-relatorio-completo");
  await downloadRelatorioCompleto(dados);
}
