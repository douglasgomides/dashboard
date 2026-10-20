// Retorno do investimento (ROI) do período: o objetivo principal do Hub.
// Quando dá para calcular: investido em anúncios, receita das vendas ganhas no CRM, ROI e custo por paciente.
// Quando não dá: checklist "Preciso de X para mostrar Y", cada item com status e link para resolver.
// Dados: RPC roi_periodo (supabase/migrations/20261014200000_roi_periodo.sql).

export interface DadosRoi {
  tem_anuncios: boolean;
  tem_crm: boolean;
  investido: number;
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
  link: { to: "/admin/$clientId" | "/$clientId/analisar" | "/$clientId/crm-guia"; rotulo: string; soAdmin?: boolean };
}

export interface Roi {
  calculavel: boolean;
  investido: number;
  receita: number;
  ganhos: number;
  roi: number | null; // (receita − investido) ÷ investido
  retornoPorReal: number | null; // receita ÷ investido
  custoPorPaciente: number | null; // investido ÷ vendas ganhas
  itens: ItemRoi[];
  pendentes: number; // itens não feitos (para "faltam N itens")
  motivoSemCalculo: string | null; // quando os itens estão feitos, mas falta base (ex.: nenhum investimento no período)
}

/** Fatia mínima de vendas ganhas com valor e de leads com origem para considerar o item feito. */
export const MIN_VALOR = 0.8;
export const MIN_ORIGEM = 0.8;

/** Um ROI incompleto não apaga os volumes medidos; fonte ausente ou compartilhada nunca vira zero. */
export function numerosDisponiveisRoi(d: DadosRoi) {
  const crmDaClinica = d.tem_crm && !d.crm_compartilhado;
  return {
    investido: d.tem_anuncios ? d.investido : null,
    leads: crmDaClinica ? d.leads : null,
    ganhos: crmDaClinica && d.ganho_identificavel ? d.ganhos : null,
  };
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export function montarRoi(d: DadosRoi): Roi {
  const fracValor = d.ganhos > 0 ? d.ganhos_com_valor / d.ganhos : 0;
  const fracOrigem = d.leads > 0 ? d.leads_com_origem / d.leads : 0;
  const itens: ItemRoi[] = [
    {
      id: "anuncios",
      preciso: "Ligar a conta de anúncios",
      paraMostrar: "quanto foi investido",
      feito: d.tem_anuncios,
      detalhe: d.tem_anuncios ? null : "Nenhuma conta de anúncios ligada a este cliente.",
      bloqueia: true,
      link: { to: "/admin/$clientId", rotulo: "Ligar no cadastro", soAdmin: true },
    },
    {
      id: "crm",
      preciso: "Ligar o CRM",
      paraMostrar: "as vendas e a receita",
      feito: d.tem_crm,
      detalhe: d.tem_crm ? null : "Nenhum CRM ligado a este cliente.",
      bloqueia: true,
      link: { to: "/admin/$clientId", rotulo: "Ligar no cadastro", soAdmin: true },
    },
  ];
  if (d.tem_crm && d.crm_compartilhado) {
    // Só aparece quando é um problema: a mesma conta de CRM ligada a outro cliente.
    itens.push({
        id: "compartilhado",
        preciso: "Separar o CRM deste cliente (hoje é a mesma conta de CRM de outro cliente)",
        paraMostrar: "a receita só deste cliente",
        feito: !d.crm_compartilhado,
        detalhe: d.crm_compartilhado ? "As vendas aparecem iguais em mais de um cliente: somar daria receita em dobro." : null,
        bloqueia: true,
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
        link: { to: "/$clientId/analisar", rotulo: "Marcar em A analisar", soAdmin: true },
      },
      {
        id: "valor",
        preciso: "Preencher o valor da venda no card do CRM ao fechar",
        paraMostrar: "a receita",
        feito: d.ganhos > 0 && fracValor >= MIN_VALOR,
        detalhe: d.ganhos > 0 ? `${d.ganhos_com_valor} de ${d.ganhos} vendas ganhas no período têm valor (${pct(d.ganhos_com_valor, d.ganhos)}).` : "Nenhuma venda ganha no período para conferir o valor.",
        bloqueia: true,
        link: { to: "/$clientId/crm-guia", rotulo: "Ver como organizar o CRM" },
      },
      {
        id: "origem",
        preciso: "Preencher a origem do lead (anúncio, Instagram, indicação)",
        paraMostrar: "quanto do retorno veio dos anúncios",
        feito: d.leads > 0 && fracOrigem >= MIN_ORIGEM,
        detalhe: d.leads > 0 ? `Hoje ${pct(d.leads_com_origem, d.leads)} dos leads do período têm origem (${d.leads_com_origem} de ${d.leads}).` : "Nenhum lead no período.",
        bloqueia: false,
        link: { to: "/$clientId/crm-guia", rotulo: "Ver como organizar o CRM" },
      },
    );
  }
  const pendentes = itens.filter((i) => !i.feito).length;
  const bloqueado = itens.some((i) => i.bloqueia && !i.feito);
  const motivoSemCalculo = bloqueado ? null : d.investido <= 0 ? "Sem investimento em anúncios no período." : null;
  const calculavel = !bloqueado && d.investido > 0 && d.ganhos > 0;
  return {
    calculavel,
    investido: d.investido,
    receita: d.receita,
    ganhos: d.ganhos,
    roi: calculavel ? (d.receita - d.investido) / d.investido : null,
    retornoPorReal: calculavel ? d.receita / d.investido : null,
    custoPorPaciente: calculavel ? d.investido / d.ganhos : null,
    itens,
    pendentes,
    motivoSemCalculo,
  };
}

/** Texto curto para a coluna ROI do admin. */
export function resumoRoi(r: Roi): string {
  if (r.calculavel && r.roi != null) return `${r.roi >= 0 ? "+" : ""}${Math.round(r.roi * 100).toLocaleString("pt-BR")}%`;
  if (r.pendentes > 0) return `faltam ${r.pendentes} ${r.pendentes === 1 ? "item" : "itens"}`;
  return r.motivoSemCalculo ?? "sem base no período";
}
