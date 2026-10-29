// Retorno do investimento (ROI) do período: o objetivo principal do Hub.
// O ROI usa só o investimento em AQUISIÇÃO (mensagens, leads, conversão). O investimento em CRESCIMENTO (seguidores,
// engajamento, alcance, visita ao perfil) aparece separado e não entra na conta.
// Só aparece quando os dados permitem ler (limites em src/lib/limites.ts); senão diz por que não dá e o passo a passo.
// Dados: RPC roi_periodo (supabase/migrations/20261029120000_roi_por_objetivo.sql).

import { LIMITES } from "@/lib/limites";
import { piorSelo, type Selo } from "@/lib/selo";

export interface DadosRoi {
  tem_anuncios: boolean;
  tem_crm: boolean;
  crm_provider: string | null;
  rotulo_custo: "venda" | "paciente";
  investido: number;
  investido_aquisicao: number;
  investido_crescimento: number;
  /** Parte do investimento separada por estimativa (campanha sem destino nem meta de otimização). */
  investido_estimado: number;
  leads: number;
  leads_com_origem: number;
  ganhos: number;
  ganhos_com_valor: number;
  receita: number;
  ganho_identificavel: boolean;
  crm_compartilhado: boolean;
}

export type IdItemRoi = "anuncios" | "crm" | "compartilhado" | "etapas" | "valor" | "origem";

export interface ItemRoi {
  id: IdItemRoi;
  preciso: string; // X
  paraMostrar: string; // Y
  feito: boolean;
  detalhe: string | null; // situação atual (ex.: "12% dos leads têm origem")
  bloqueia: boolean; // sem ele o ROI não aparece
  /** Passo a passo para corrigir, no CRM deste cliente. */
  passos: string[];
  link: { to: "/admin/$clientId" | "/$clientId/analisar" | "/$clientId/crm-guia"; rotulo: string; soAdmin?: boolean };
}

export interface Roi {
  calculavel: boolean;
  /** Investimento em aquisição: a base do ROI e do custo. */
  investido: number;
  investidoCrescimento: number;
  investidoTotal: number;
  receita: number;
  ganhos: number;
  roi: number | null; // (receita − investido em aquisição) ÷ investido em aquisição
  retornoPorReal: number | null; // receita ÷ investido em aquisição
  custo: number | null; // investido em aquisição ÷ vendas ganhas
  rotuloCusto: string; // "Custo por venda" ou "Custo por paciente", escolhido no cadastro do cliente
  itens: ItemRoi[];
  pendentes: number; // itens não feitos (para "faltam N itens")
  motivoSemCalculo: string | null; // frase "Não dá pra calcular o retorno porque..." quando não aparece
  selo: Selo;
  seloInvestimento: Selo;
}

/** Nota fixa: o CRM registra a venda no dia em que fechou, e o contato pode ter vindo antes. */
export const NOTA_DEFASAGEM = "Venda fechada no período pode ter vindo de contato de períodos anteriores.";

const NOME_CRM: Record<string, string> = { kommo: "Kommo", clint: "Clint", flwchat: "FlwChat", rdstation: "RD Station CRM", digisac: "Digisac", planilha: "planilha de vendas" };

export function passosOrigem(provider: string | null): string[] {
  switch (provider) {
    case "kommo":
      return ["No Kommo, abra o card do lead.", "No campo de origem, escolha de onde a pessoa veio: anúncio, Instagram, indicação ou Google.", "Faça isso no primeiro atendimento de todo lead novo."];
    case "clint":
      return ["No Clint, abra o negócio.", "No campo Origem, escolha de onde a pessoa veio: anúncio, Instagram, indicação ou Google.", "Faça isso no primeiro atendimento de todo lead novo."];
    case "flwchat":
      return ["No FlwChat, abra o contato do card.", "Coloque a etiqueta de origem: Anúncio, Instagram, Indicação ou Google.", "Faça isso no primeiro atendimento de todo lead novo."];
    case "rdstation":
      return ["No RD Station CRM, abra a negociação.", "Preencha a Fonte com o canal de onde a pessoa veio.", "Faça isso no primeiro atendimento de toda negociação nova."];
    case "digisac":
      return ["No Digisac, abra o contato.", "Coloque a etiqueta de origem: Anúncio, Instagram, Indicação ou Google.", "Faça isso no primeiro atendimento de todo contato novo."];
    default:
      return ["No CRM, abra o card do lead.", "Preencha de onde a pessoa veio: anúncio, Instagram, indicação ou Google.", "Faça isso no primeiro atendimento de todo lead novo."];
  }
}

export function passosValor(provider: string | null): string[] {
  switch (provider) {
    case "kommo":
      return ["No Kommo, ao mover o lead para venda ganha, preencha o valor da venda no card.", "Use o valor total fechado com o paciente."];
    case "clint":
      return ["No Clint, ao marcar o negócio como ganho, preencha o Valor.", "Use o valor total fechado com o paciente."];
    case "flwchat":
      return ["No FlwChat, ao mover o card para a etapa de venda, preencha o valor do card.", "Use o valor total fechado com o paciente."];
    case "rdstation":
      return ["No RD Station CRM, ao marcar a negociação como vendida, preencha o valor dos produtos.", "Use o valor total fechado com o paciente."];
    case "digisac":
      return ["O Digisac não registra venda nem valor.", "Para medir o retorno, registre as vendas num CRM ou na planilha de vendas da clínica."];
    default:
      return ["No CRM, ao marcar a venda como ganha, preencha o valor.", "Use o valor total fechado com o paciente."];
  }
}

/** Um ROI incompleto não apaga os volumes medidos; fonte ausente ou compartilhada nunca vira zero. */
export function numerosDisponiveisRoi(d: DadosRoi) {
  const crmDaClinica = d.tem_crm && !d.crm_compartilhado;
  return {
    investido: d.tem_anuncios ? d.investido_aquisicao : null,
    investidoCrescimento: d.tem_anuncios ? d.investido_crescimento : null,
    leads: crmDaClinica ? d.leads : null,
    ganhos: crmDaClinica && d.ganho_identificavel ? d.ganhos : null,
  };
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "sem dado");
const pctLimite = (x: number) => `${Math.round(x * 100)}%`;

/** Selo do investimento separado por objetivo: Parcial quando parte dele foi separada por estimativa. */
export function seloDoInvestimento(d: DadosRoi): Selo {
  if (!d.tem_anuncios) return { nivel: "ilegivel", motivo: "A conta de anúncios não está ligada." };
  if (d.investido <= 0) return { nivel: "confiavel", motivo: "Nenhum gasto em anúncios no período." };
  const fracEstimado = d.investido_estimado / d.investido;
  if (fracEstimado > LIMITES.selo.investimentoEstimadoMaximo) {
    return {
      nivel: "parcial",
      motivo: `${pctLimite(fracEstimado)} do gasto vem de campanhas sem destino nem meta de otimização informados pela Meta. Elas foram separadas pelo resultado: com conversa ou lead contam como aquisição, sem nenhum contam como crescimento.`,
    };
  }
  return { nivel: "confiavel", motivo: "Cada campanha foi separada pelo destino ou pela meta de otimização informados pela Meta." };
}

export function montarRoi(d: DadosRoi): Roi {
  const fracValor = d.ganhos > 0 ? d.ganhos_com_valor / d.ganhos : 0;
  const fracOrigem = d.leads > 0 ? d.leads_com_origem / d.leads : 0;
  const crm = (d.crm_provider && NOME_CRM[d.crm_provider]) || "CRM";
  const itens: ItemRoi[] = [
    {
      id: "anuncios",
      preciso: "Ligar a conta de anúncios",
      paraMostrar: "quanto foi investido",
      feito: d.tem_anuncios,
      detalhe: d.tem_anuncios ? null : "Nenhuma conta de anúncios ligada a este cliente.",
      bloqueia: true,
      passos: ["A equipe Doctor Creator liga a conta de anúncios no cadastro do cliente."],
      link: { to: "/admin/$clientId", rotulo: "Ligar no cadastro", soAdmin: true },
    },
    {
      id: "crm",
      preciso: "Ligar o CRM",
      paraMostrar: "as vendas e a receita",
      feito: d.tem_crm,
      detalhe: d.tem_crm ? null : "Nenhum CRM ligado a este cliente.",
      bloqueia: true,
      passos: ["A equipe Doctor Creator liga o CRM no cadastro do cliente."],
      link: { to: "/admin/$clientId", rotulo: "Ligar no cadastro", soAdmin: true },
    },
  ];
  if (d.tem_crm && d.crm_compartilhado) {
    // Só aparece quando é um problema: a mesma conta de CRM ligada a outro cliente.
    itens.push({
      id: "compartilhado",
      preciso: "Separar o CRM deste cliente (hoje é a mesma conta de CRM de outro cliente)",
      paraMostrar: "a receita só deste cliente",
      feito: false,
      detalhe: "As vendas aparecem iguais em mais de um cliente: somar daria receita em dobro.",
      bloqueia: true,
      passos: ["A equipe Doctor Creator separa os clientes da mesma conta de CRM por funil, etiqueta ou responsável, no cadastro."],
      link: { to: "/admin/$clientId", rotulo: "Ver a conexão do CRM", soAdmin: true },
    });
  }
  if (d.tem_crm) {
    itens.push(
      {
        id: "etapas",
        preciso: "Marcar quais etapas do CRM significam venda ganha",
        paraMostrar: "quantos pacientes fecharam",
        feito: d.ganho_identificavel,
        detalhe: d.ganho_identificavel ? null : "Nenhum card está marcado como ganho, e nenhuma etapa foi mapeada como venda.",
        bloqueia: true,
        passos: [`No ${crm}, marque como ganho os cards de quem fechou.`, "Ou a equipe Doctor Creator marca qual etapa significa venda, em A analisar."],
        link: { to: "/$clientId/analisar", rotulo: "Marcar em A analisar", soAdmin: true },
      },
      {
        id: "valor",
        preciso: "Preencher o valor da venda no card do CRM ao fechar",
        paraMostrar: "a receita",
        feito: d.ganhos > 0 && fracValor >= LIMITES.roi.valorMinimo,
        detalhe: d.ganhos > 0
          ? `${d.ganhos_com_valor} de ${d.ganhos} vendas ganhas no período têm valor (${pct(d.ganhos_com_valor, d.ganhos)}). O mínimo para ler é ${pctLimite(LIMITES.roi.valorMinimo)}.`
          : "Nenhuma venda ganha no período para conferir o valor.",
        bloqueia: true,
        passos: passosValor(d.crm_provider),
        link: { to: "/$clientId/crm-guia", rotulo: "Ver como organizar o CRM" },
      },
      {
        id: "origem",
        preciso: "Preencher a origem do lead (anúncio, Instagram, indicação)",
        paraMostrar: "quanto do retorno veio dos anúncios",
        feito: d.leads > 0 && fracOrigem >= LIMITES.roi.origemMinima,
        detalhe: d.leads > 0
          ? `Hoje ${pct(d.leads_com_origem, d.leads)} dos leads do período têm origem (${d.leads_com_origem} de ${d.leads}). O mínimo para ler é ${pctLimite(LIMITES.roi.origemMinima)}.`
          : "Nenhum lead no período.",
        bloqueia: true,
        passos: passosOrigem(d.crm_provider),
        link: { to: "/$clientId/crm-guia", rotulo: "Ver como organizar o CRM" },
      },
    );
  }
  const pendentes = itens.filter((i) => !i.feito).length;
  const bloqueios = itens.filter((i) => i.bloqueia && !i.feito);
  const semAquisicao = d.investido_aquisicao <= 0;
  const motivoSemCalculo = bloqueios.length
    ? `Não dá pra calcular o retorno porque falta: ${bloqueios.map((i) => i.preciso.charAt(0).toLowerCase() + i.preciso.slice(1)).join("; ")}.`
    : semAquisicao
      ? d.investido > 0
        ? "Não dá pra calcular o retorno porque todo o investimento do período foi em crescimento (seguidores, engajamento, alcance), não em aquisição."
        : "Não dá pra calcular o retorno porque não houve investimento em anúncios no período."
      : d.ganhos <= 0
        ? "Não dá pra calcular o retorno porque nenhuma venda foi ganha no período."
        : null;
  const calculavel = motivoSemCalculo === null;
  const seloInvestimento = seloDoInvestimento(d);
  const seloDados: Selo[] = [];
  if (calculavel) {
    if (fracOrigem < LIMITES.selo.origemConfiavel) seloDados.push({ nivel: "parcial", motivo: `${pct(d.leads - d.leads_com_origem, d.leads)} dos leads do período estão sem origem.` });
    if (fracValor < LIMITES.selo.valorConfiavel) seloDados.push({ nivel: "parcial", motivo: `${pct(d.ganhos - d.ganhos_com_valor, d.ganhos)} das vendas ganhas estão sem valor, então a receita está abaixo do real.` });
  }
  if (calculavel && seloInvestimento.nivel === "parcial") seloDados.push(seloInvestimento);
  const selo: Selo = !calculavel
    ? { nivel: "ilegivel", motivo: motivoSemCalculo! }
    : seloDados.length
      ? piorSelo(seloDados)
      : { nivel: "confiavel", motivo: "Origem dos leads, valor das vendas e separação do investimento estão completos." };
  return {
    calculavel,
    investido: d.investido_aquisicao,
    investidoCrescimento: d.investido_crescimento,
    investidoTotal: d.investido,
    receita: d.receita,
    ganhos: d.ganhos,
    roi: calculavel ? (d.receita - d.investido_aquisicao) / d.investido_aquisicao : null,
    retornoPorReal: calculavel ? d.receita / d.investido_aquisicao : null,
    custo: calculavel ? d.investido_aquisicao / d.ganhos : null,
    rotuloCusto: d.rotulo_custo === "paciente" ? "Custo por paciente" : "Custo por venda",
    itens,
    pendentes,
    motivoSemCalculo,
    selo,
    seloInvestimento,
  };
}

/** Texto curto para a coluna ROI do admin. */
export function resumoRoi(r: Roi): string {
  if (r.calculavel && r.roi != null) return `${r.roi >= 0 ? "+" : ""}${Math.round(r.roi * 100).toLocaleString("pt-BR")}%`;
  if (r.pendentes > 0) return `faltam ${r.pendentes} ${r.pendentes === 1 ? "item" : "itens"}`;
  return "não dá pra ler";
}
