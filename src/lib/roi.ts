// Retorno do investimento (ROI) do período: o objetivo principal do Hub.
// O ROI usa só o investimento em AQUISIÇÃO (mensagens, leads, conversão). O investimento em CRESCIMENTO (seguidores,
// engajamento, alcance, visita ao perfil) aparece separado e não entra na conta.
// A receita do ROI é só a de pessoas com origem anúncio (auditoria de 30/10/2026: a Doctor Creator via ROI de +101%
// com R$ 4.826 de checkout e base importada, sem nenhuma venda vinda de anúncio). A receita total do CRM aparece ao
// lado, com a divisão por origem, mas não entra na conta.
// Só aparece quando os dados permitem ler (limites em src/lib/limites.ts); senão diz por que não dá e o passo a passo.
// Travas de 31/10/2026 (Doctor Creator, 90 dias: ROI de -98% tirado de 1 venda de anúncio, com 159 de 176 vendas sem
// canal conhecido): o percentual só sai com pelo menos 5 vendas de anúncio (Confiável só a partir de 15) e com 70% ou
// mais das vendas do período com canal conhecido, além da trava de origem dos leads. Com 1 a 4 vendas de anúncio, a
// tela mostra só a frase em R$ ("1 venda de anúncio, R$ 197, para R$ 12.196 investidos").
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
  /** Receita de todas as vendas do período no CRM, de qualquer origem. */
  receita: number;
  /** Vendas e receita de pessoas com origem anúncio (no card ou em outro card da mesma pessoa). null = banco sem a separação. */
  ganhos_anuncio: number | null;
  ganhos_anuncio_com_valor: number | null;
  receita_anuncio: number | null;
  /** Vendas do período com canal conhecido (anúncio ou origem classificada). null = banco sem essa conta. */
  ganhos_com_canal?: number | null;
  /** Receita do período por origem, maior primeiro. */
  receita_por_origem: { origem: string; ganhos: number; receita: number }[];
  ganho_identificavel: boolean;
  crm_compartilhado: boolean;
  /** Clientes que leem a mesma conta de CRM (os números deles são os mesmos). */
  crm_compartilhado_com?: string[];
  /** Outros clientes com a mesma conta de anúncios: o investimento é da conta inteira. */
  anuncios_compartilhados_com?: string[];
  /** Anúncios lançados à mão na planilha, sem conta da Meta ligada. */
  anuncios_planilha?: boolean;
  /** Último dia com dado de anúncios (Meta ou planilha). */
  anuncios_ate?: string | null;
}

export type IdItemRoi = "anuncios" | "crm" | "compartilhado" | "etapas" | "valor" | "origem" | "origem_vendas";

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
  /** Receita de leads com origem anúncio: a base do ROI. */
  receita: number;
  /** Vendas de leads com origem anúncio. */
  ganhos: number;
  /** Receita e vendas de todas as origens, só para mostrar ao lado. */
  receitaTotal: number;
  ganhosTotal: number;
  /** De onde veio a receita do período, em português simples (ex.: "Funil de compra, sem origem R$ 3.546"). */
  origensReceita: { origem: string; ganhos: number; receita: number }[];
  roi: number | null; // (receita de anúncio − investido em aquisição) ÷ investido em aquisição
  retornoPorReal: number | null; // receita de anúncio ÷ investido em aquisição
  custo: number | null; // investido em aquisição ÷ vendas de anúncio
  rotuloCusto: string; // "Custo por venda" ou "Custo por paciente", escolhido no cadastro do cliente
  itens: ItemRoi[];
  pendentes: number; // itens não feitos (para "faltam N itens")
  motivoSemCalculo: string | null; // frase "Não dá pra calcular o retorno porque..." quando não aparece
  /** Fato em R$ quando o percentual não sai mas houve venda de anúncio e investimento em aquisição
   * (ex.: "1 venda de anúncio, R$ 197, para R$ 12.196 investidos em aquisição."). null quando o ROI aparece em %. */
  fraseVendasAnuncio: string | null;
  selo: Selo;
  seloInvestimento: Selo;
}

/** Nota fixa: uma definição só da data da venda, igual à do cálculo (data de criação do card no CRM). */
/** Aviso de mudança de régua, mostrado na tela do retorno. */
export const AVISO_MUDANCA_ROI =
  "Mudou em 31/10: o retorno em percentual só aparece com pelo menos 5 vendas vindas de anúncio e com 70% ou mais das vendas do período com canal conhecido. Com menos de 5, aparece só quanto vendeu e quanto foi investido, em R$. A confiança alta pede 15 vendas de anúncio.";

export const NOTA_DEFASAGEM =
  "Vendas do período são os cards ganhos que foram criados no período, pela data de criação no CRM. A data de fechamento não é usada, porque o CRM costuma fechar cards em lote.";

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

export function passosOrigemVendas(provider: string | null): string[] {
  const crm = (provider && NOME_CRM[provider]) || "CRM";
  if (provider === "digisac") return ["O Digisac não registra venda.", "Para saber de onde veio quem comprou, registre as vendas num CRM ou na planilha de vendas da clínica, com a origem."];
  return [
    `No ${crm}, ao marcar a venda como ganha, confira se o card tem a origem: anúncio, Instagram, indicação ou Google.`,
    "Se a venda foi registrada num card novo (funil de compra, checkout), copie a origem do card em que a pessoa chegou.",
    "Texto que não diz o canal (ex.: nome de material ou de página) não conta: escreva o canal.",
  ];
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

/** Um ROI incompleto não apaga os volumes medidos; fonte ausente nunca vira zero. CRM compartilhado mostra os
 * números da conta inteira, com o aviso de que são os mesmos dos outros clientes dela (o ROI continua bloqueado). */
export function numerosDisponiveisRoi(d: DadosRoi) {
  return {
    investido: d.tem_anuncios ? d.investido_aquisicao : null,
    investidoCrescimento: d.tem_anuncios ? d.investido_crescimento : null,
    leads: d.tem_crm ? d.leads : null,
    ganhos: d.tem_crm && d.ganho_identificavel ? d.ganhos : null,
  };
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Texto curto da situação da fonte de anúncios, igual ao que o admin mostra. */
export function situacaoAnuncios(d: DadosRoi, hoje = new Date().toISOString().slice(0, 10)): string {
  if (!d.tem_anuncios) return "Conta de anúncios não conectada";
  if (d.anuncios_planilha) return "Lançado à mão na planilha";
  if (d.anuncios_compartilhados_com?.length) return `Conta de anúncios compartilhada com ${d.anuncios_compartilhados_com.join(", ")}: o investimento é da conta inteira`;
  if (d.anuncios_ate && d.anuncios_ate < hoje && (Date.parse(hoje) - Date.parse(d.anuncios_ate)) / 86400_000 > 3) return `Conta parada desde ${dataCurta(d.anuncios_ate)}`;
  return "mensagens, leads e conversão";
}

/** Texto curto da situação do CRM para os números de leads e vendas. */
export function situacaoCrm(d: DadosRoi): string | null {
  if (!d.tem_crm) return "CRM não ligado";
  if (d.crm_compartilhado) {
    const outros = d.crm_compartilhado_com ?? [];
    return `CRM compartilhado${outros.length ? ` com ${outros.join(", ")}` : " com outro cliente"}: mesmos números`;
  }
  return null;
}

const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "sem dado");
const pctLimite = (x: number) => `${Math.round(x * 100)}%`;

/** Selo do investimento separado por objetivo: Parcial quando parte dele foi separada por estimativa. */
export function seloDoInvestimento(d: DadosRoi): Selo {
  if (!d.tem_anuncios) return { nivel: "ilegivel", motivo: "A conta de anúncios não está ligada." };
  if (d.investido <= 0) {
    // Planilha semanal sem lançamento no período não prova que não houve gasto (Marcelly, auditoria 30/10/2026).
    if (d.anuncios_planilha) return { nivel: "parcial", motivo: "Os anúncios vêm só da planilha semanal da equipe e não há lançamento neste período. O gasto pode estar faltando." };
    return { nivel: "confiavel", motivo: "Nenhum gasto em anúncios no período." };
  }
  if (d.anuncios_planilha) return { nivel: "parcial", motivo: "Os anúncios vêm só da planilha semanal lançada à mão pela equipe, não da conta da Meta." };
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
  const ganhosComCanal = d.ganhos_com_canal ?? null;
  const fracCanal = ganhosComCanal != null && d.ganhos > 0 ? ganhosComCanal / d.ganhos : 0;
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
      {
        id: "origem_vendas",
        preciso: "Registrar a origem de quem comprou (o canal da venda)",
        paraMostrar: "se o retorno dos anúncios está completo",
        feito: d.ganhos > 0 && ganhosComCanal != null && fracCanal >= LIMITES.roi.ganhosComCanalMinimo,
        detalhe: d.ganhos <= 0
          ? "Nenhuma venda ganha no período para conferir a origem."
          : ganhosComCanal == null
            ? "O banco ainda não separa as vendas por canal conhecido."
            : `Hoje ${pct(ganhosComCanal, d.ganhos)} das vendas do período têm canal conhecido (${ganhosComCanal} de ${d.ganhos}). O mínimo para ler é ${pctLimite(LIMITES.roi.ganhosComCanalMinimo)}. Sem o canal, uma venda de anúncio pode estar contada como "sem origem".`,
        bloqueia: true,
        passos: passosOrigemVendas(d.crm_provider),
        link: { to: "/$clientId/crm-guia", rotulo: "Ver como organizar o CRM" },
      },
    );
  }
  const pendentes = itens.filter((i) => !i.feito).length;
  const bloqueios = itens.filter((i) => i.bloqueia && !i.feito);
  const semAquisicao = d.investido_aquisicao <= 0;
  const receitaAnuncio = d.receita_anuncio ?? 0;
  const ganhosAnuncio = d.ganhos_anuncio ?? 0;
  const origens = d.receita_por_origem ?? [];
  const deOnde = origens
    .filter((o) => o.origem !== "Anúncio")
    .slice(0, 3)
    .map((o) => `${o.origem.charAt(0).toLowerCase() + o.origem.slice(1)} (${o.ganhos} ${o.ganhos === 1 ? "venda" : "vendas"}${o.receita > 0 ? `, ${brl0(o.receita)}` : ""})`)
    .join("; ");
  const motivoSemCalculo = bloqueios.length
    ? `Não dá pra calcular o retorno porque falta: ${bloqueios.map((i) => i.preciso.charAt(0).toLowerCase() + i.preciso.slice(1)).join("; ")}.`
    : semAquisicao
      ? d.investido > 0
        ? "Não dá pra calcular o retorno porque todo o investimento do período foi em crescimento (seguidores, engajamento, alcance), não em aquisição."
        : "Não dá pra calcular o retorno porque não houve investimento em anúncios no período."
      : d.ganhos <= 0
        ? "Não dá pra calcular o retorno porque nenhuma venda foi ganha no período."
        : d.ganhos_anuncio == null
          ? "Não dá pra separar a receita que veio dos anúncios: o banco ainda não tem essa conta. A receita total aparece abaixo, mas não mede o anúncio."
          : ganhosAnuncio <= 0
            ? `Não dá pra calcular o retorno dos anúncios porque nenhuma das ${d.ganhos} ${d.ganhos === 1 ? "venda" : "vendas"} do período veio de pessoa com origem anúncio.${deOnde ? ` A receita veio de: ${deOnde}.` : ""}`
            : ganhosAnuncio < LIMITES.roi.vendasAnuncioMinimas
              ? `Ainda não dá pra ler o retorno em percentual: ${ganhosAnuncio} ${ganhosAnuncio === 1 ? "venda veio" : "vendas vieram"} de anúncio no período, e o mínimo é ${LIMITES.roi.vendasAnuncioMinimas}. Com tão poucas vendas, uma venda a mais ou a menos muda o resultado inteiro.`
              : null;
  const calculavel = motivoSemCalculo === null;
  const fraseVendasAnuncio = !calculavel && ganhosAnuncio > 0 && d.investido_aquisicao > 0
    ? `${ganhosAnuncio} ${ganhosAnuncio === 1 ? "venda de anúncio" : "vendas de anúncio"}, ${receitaAnuncio > 0 ? brl0(receitaAnuncio) : "sem valor"}, para ${brl0(d.investido_aquisicao)} investidos em aquisição.`
    : null;
  const seloInvestimento = seloDoInvestimento(d);
  const seloDados: Selo[] = [];
  if (calculavel) {
    if (ganhosAnuncio < LIMITES.roi.vendasAnuncioAlta) seloDados.push({ nivel: "parcial", motivo: `O retorno sai de ${ganhosAnuncio} vendas vindas de anúncio. A confiança alta pede ${LIMITES.roi.vendasAnuncioAlta}.` });
    if (fracOrigem < LIMITES.selo.origemConfiavel) seloDados.push({ nivel: "parcial", motivo: `${pct(d.leads - d.leads_com_origem, d.leads)} dos leads do período estão sem origem.` });
    const fracValorAnuncio = ganhosAnuncio > 0 ? (d.ganhos_anuncio_com_valor ?? 0) / ganhosAnuncio : 0;
    if (fracValorAnuncio < LIMITES.selo.valorConfiavel) seloDados.push({ nivel: "parcial", motivo: `${pct(ganhosAnuncio - (d.ganhos_anuncio_com_valor ?? 0), ganhosAnuncio)} das vendas vindas de anúncio estão sem valor, então a receita está abaixo do real.` });
  }
  if (calculavel && seloInvestimento.nivel === "parcial") seloDados.push(seloInvestimento);
  const selo: Selo = !calculavel
    ? { nivel: "ilegivel", motivo: motivoSemCalculo! }
    : seloDados.length
      ? piorSelo(seloDados)
      : { nivel: "confiavel", motivo: `Origem dos leads e das vendas, valor das vendas e separação do investimento estão completos, com ${ganhosAnuncio} vendas vindas de anúncio.` };
  return {
    calculavel,
    investido: d.investido_aquisicao,
    investidoCrescimento: d.investido_crescimento,
    investidoTotal: d.investido,
    receita: receitaAnuncio,
    ganhos: ganhosAnuncio,
    receitaTotal: d.receita,
    ganhosTotal: d.ganhos,
    origensReceita: origens,
    roi: calculavel ? (receitaAnuncio - d.investido_aquisicao) / d.investido_aquisicao : null,
    retornoPorReal: calculavel ? receitaAnuncio / d.investido_aquisicao : null,
    custo: calculavel ? d.investido_aquisicao / ganhosAnuncio : null,
    rotuloCusto: d.rotulo_custo === "paciente" ? "Custo por paciente" : "Custo por venda",
    itens,
    pendentes,
    motivoSemCalculo,
    fraseVendasAnuncio,
    selo,
    seloInvestimento,
  };
}

/** Texto curto para a coluna ROI do admin. */
export function resumoRoi(r: Roi): string {
  if (r.calculavel && r.roi != null) return `${r.roi >= 0 ? "+" : ""}${Math.round(r.roi * 100).toLocaleString("pt-BR")}%`;
  // Poucas vendas de anúncio e nada mais faltando: o fato em R$, nunca um percentual.
  if (r.fraseVendasAnuncio && r.pendentes === 0) return `${r.ganhos} ${r.ganhos === 1 ? "venda" : "vendas"} de anúncio, ${r.receita > 0 ? brl0(r.receita) : "sem valor"}`;
  if (r.pendentes > 0) return `faltam ${r.pendentes} ${r.pendentes === 1 ? "item" : "itens"}`;
  return "não dá pra ler";
}
