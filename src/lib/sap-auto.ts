// Tracker automático do Sistema de Aquisição de Pacientes (SAP).
//
// Os números vêm da RPC sap_tracker_auto (migração 20261015090000), que lê o CRM, o WhatsApp e a Meta
// que o Hub já sincroniza. Aqui ficam só as regras: os 6 KPIs oficiais do SAP, o farol de cada um,
// quando o número ainda não é confiável (e o que falta para ser) e as 2 checagens de qualidade do
// dado (divergência plataforma × CRM e linhas completas). Lógica pura, testada em
// scripts/test-sap-auto.ts.
//
// KPIs oficiais (03.07 / 08.05):
//   1. 1ª resposta: mediana em horário comercial, alvo até 5 min;
//   2. agendamento: agendados ÷ qualificados (A+B);
//   3. comparecimento: compareceram ÷ (compareceram + faltaram);
//   4. conversão da consulta: fechados ÷ compareceram;
//   5. custo por consulta realizada: investimento ÷ compareceram;
//   6. receita atribuída: soma do valor fechado. Acompanha, nunca é meta (o fechamento é do médico).

export type MarcoSap = "desqualificado" | "qualificado" | "agendado" | "faltou" | "compareceu" | "pensando" | "nao_fechou" | "fechou";

export const MARCOS_SAP: { id: MarcoSap; rotulo: string; explica: string }[] = [
  { id: "qualificado", rotulo: "Qualificado", explica: "Tem perfil e interesse (lead A ou B)." },
  { id: "desqualificado", rotulo: "Desqualificado", explica: "Fora do perfil (lead C). Sai da base do agendamento." },
  { id: "agendado", rotulo: "Agendado", explica: "Consulta marcada, ainda não aconteceu." },
  { id: "faltou", rotulo: "Faltou", explica: "Tinha consulta e não veio." },
  { id: "compareceu", rotulo: "Compareceu", explica: "Consulta realizada, aguardando decisão." },
  { id: "pensando", rotulo: "Pensando", explica: "Consultou e está decidindo (cadência de follow-up)." },
  { id: "nao_fechou", rotulo: "Não fechou", explica: "Consultou e decidiu não fazer agora." },
  { id: "fechou", rotulo: "Fechou", explica: "Fechou o tratamento." },
];

export interface TrackerAutoBruto {
  tem_crm: boolean;
  tem_whatsapp: boolean;
  marcos_marcados: number;
  marcos: MarcoSap[];
  leads: number;
  qualificados: number;
  agendados: number;
  compareceram: number;
  faltaram: number;
  pensando: number;
  nao_fecharam: number;
  fechados: number;
  fechados_com_valor: number;
  perdidos: number;
  perdidos_com_motivo: number;
  perdidos_motivo_medivel: number;
  receita: number;
  com_origem: number;
  linhas_completas: number;
  investido: number;
  leads_plataforma: number;
  leads_crm_meta: number;
  resposta_conversas: number;
  resposta_mediana_min: number | null;
  resposta_ate_5min: number;
  canais: { canal: string; leads: number; agendados: number; compareceram: number; fechados: number; receita: number }[];
  semanas: { semana: string; leads: number; agendados: number; compareceram: number; fechados: number; receita: number }[];
}

export type Farol = "verde" | "amarelo" | "vermelho" | "cinza";

export type IdKpi = "resposta" | "agendamento" | "comparecimento" | "conversao" | "custo_consulta" | "receita";

export interface KpiSap {
  id: IdKpi;
  titulo: string;
  valor: number | null;
  texto: string; // valor formatado ou o motivo de não ter
  farol: Farol;
  regra: string; // referência usada no farol
  base: string; // de onde veio o número ("23 de 61 qualificados")
  estimativa?: string; // o número existe, mas com uma aproximação que a tela precisa dizer
  falta?: string; // o que fazer para o número existir / ficar confiável
  amostraPequena?: boolean;
  ehMeta: boolean; // receita nunca é meta
  /** Número existe no CRM mas está errado por falta de configuração: a tela mostra "Dado incompleto", nunca o número. */
  incompleto?: { falta: string; resolver: "etapas" | "rastreamento" | "crm"; parcial: string };
}

/** Regra única de dado incompleto: zera o valor (nada de número grande nem selo verde) e guarda o que falta. */
function semDadoConfiavel(k: KpiSap, falta: string, resolver: NonNullable<KpiSap["incompleto"]>["resolver"]): KpiSap {
  return { ...k, valor: null, farol: "cinza", texto: "Dado incompleto", falta, incompleto: { falta, resolver, parcial: k.texto } };
}

export interface ChecagemSap {
  id: "divergencia" | "linhas";
  titulo: string;
  valor: number | null;
  texto: string;
  ok: boolean | null;
  regra: string;
  falta?: string;
}

// Referências iniciais Doctor Creator (hipóteses a validar no piloto, nunca dado de mercado).
export const REF_SAP = {
  respostaMin: 5,
  respostaAmarelo: 15,
  agendamento: { min: 0.2, alvo: 0.3 },
  comparecimento: { min: 0.75, alvo: 0.8 },
  conversao: { min: 0.3, alvo: 0.4 },
  divergenciaMax: 0.2,
  linhasMin: 0.9,
  // Amostra mínima do 03.07 para julgar (a mesma da garantia).
  amostra: { qualificados: 30, agendados: 20, consultas: 15 },
} as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const n = (v: number) => Math.round(v).toLocaleString("pt-BR");
const div = (a: number, b: number) => (b > 0 ? a / b : null);

function farolFaixa(v: number | null, min: number, alvo: number): Farol {
  if (v === null) return "cinza";
  return v >= alvo ? "verde" : v >= min ? "amarelo" : "vermelho";
}

export function lerTrackerAuto(raw: unknown): TrackerAutoBruto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (k: string) => Number(r[k] ?? 0) || 0;
  return {
    tem_crm: !!r.tem_crm,
    tem_whatsapp: !!r.tem_whatsapp,
    marcos_marcados: num("marcos_marcados"),
    marcos: (Array.isArray(r.marcos) ? r.marcos : []) as MarcoSap[],
    leads: num("leads"),
    qualificados: num("qualificados"),
    agendados: num("agendados"),
    compareceram: num("compareceram"),
    faltaram: num("faltaram"),
    pensando: num("pensando"),
    nao_fecharam: num("nao_fecharam"),
    fechados: num("fechados"),
    fechados_com_valor: num("fechados_com_valor"),
    perdidos: num("perdidos"),
    perdidos_com_motivo: num("perdidos_com_motivo"),
    perdidos_motivo_medivel: num("perdidos_motivo_medivel"),
    receita: num("receita"),
    com_origem: num("com_origem"),
    linhas_completas: num("linhas_completas"),
    investido: num("investido"),
    leads_plataforma: num("leads_plataforma"),
    leads_crm_meta: num("leads_crm_meta"),
    resposta_conversas: num("resposta_conversas"),
    resposta_mediana_min: r.resposta_mediana_min === null || r.resposta_mediana_min === undefined ? null : Number(r.resposta_mediana_min),
    resposta_ate_5min: num("resposta_ate_5min"),
    canais: ((r.canais as TrackerAutoBruto["canais"]) ?? []).map((c) => ({ ...c, receita: Number(c.receita) || 0 })),
    semanas: ((r.semanas as TrackerAutoBruto["semanas"]) ?? []).map((s) => ({ ...s, receita: Number(s.receita) || 0 })),
  };
}

export interface LeituraTracker {
  kpis: KpiSap[];
  checagens: ChecagemSap[];
  funil: { id: string; rotulo: string; valor: number }[];
  pendencias: string[]; // o que configurar para os números ficarem confiáveis, em ordem
}

export function montarKpisSap(t: TrackerAutoBruto): LeituraTracker {
  const tem = (m: MarcoSap) => t.marcos.includes(m);
  const temComparecimento = tem("compareceu") || tem("faltou") || tem("pensando") || tem("nao_fechou");
  const temQualificacao = tem("qualificado") || tem("desqualificado");
  const pendencias: string[] = [];

  // 1. 1ª resposta
  const resp: KpiSap = (() => {
    const base = { id: "resposta" as const, titulo: "1ª resposta (mediana)", regra: `Até ${REF_SAP.respostaMin} min em horário comercial`, ehMeta: true };
    if (!t.tem_whatsapp) return { ...base, valor: null, texto: "WhatsApp não ligado", farol: "cinza" as Farol, base: "sem conversas", falta: "Ligar o WhatsApp da clínica ao Nexo (sem isso não há tempo de resposta)." };
    if (t.resposta_mediana_min === null || t.resposta_conversas === 0)
      return { ...base, valor: null, texto: "sem conversas no período", farol: "cinza" as Farol, base: "0 conversas em horário comercial" };
    const v = t.resposta_mediana_min;
    return {
      ...base,
      valor: v,
      texto: v < 1 ? "menos de 1 min" : v >= 60 ? `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, "0")}` : `${Math.round(v)} min`,
      farol: v <= REF_SAP.respostaMin ? "verde" : v <= REF_SAP.respostaAmarelo ? "amarelo" : "vermelho",
      base: `${n(t.resposta_conversas)} conversas em horário comercial · ${pct(t.resposta_ate_5min / t.resposta_conversas)} respondidas em até 5 min`,
      amostraPequena: t.resposta_conversas < 20,
    };
  })();
  if (!t.tem_whatsapp) pendencias.push("Ligar o WhatsApp da clínica ao Nexo para medir a 1ª resposta.");

  // 2. Agendamento
  const ag = div(t.agendados, t.qualificados);
  const agendamento: KpiSap = {
    id: "agendamento",
    titulo: "Agendamento dos qualificados",
    valor: ag,
    texto: ag === null ? "sem qualificados" : pct(ag),
    farol: farolFaixa(ag, REF_SAP.agendamento.min, REF_SAP.agendamento.alvo),
    regra: "Referência DC 30% a 50%",
    base: `${n(t.agendados)} agendados de ${n(t.qualificados)} qualificados`,
    estimativa: temQualificacao ? undefined : "Sem etapa de qualificação marcada: conta como qualificado todo lead que saiu da 1ª etapa do CRM.",
    amostraPequena: t.qualificados < REF_SAP.amostra.qualificados,
    ehMeta: true,
  };
  if (!temQualificacao) pendencias.push("Marcar no CRM a etapa de lead qualificado (A/B) e a de desqualificado (C).");
  if (t.marcos_marcados === 0) pendencias.unshift("Marcar o que cada etapa do CRM significa no funil do SAP (agendado, compareceu, faltou, fechou…).");

  // 3. Comparecimento
  const comp = temComparecimento ? div(t.compareceram, t.compareceram + t.faltaram) : null;
  const comparecimento: KpiSap = {
    id: "comparecimento",
    titulo: "Comparecimento",
    valor: comp,
    texto: !temComparecimento ? "etapa não marcada" : comp === null ? "sem consultas no período" : pct(comp),
    farol: farolFaixa(comp, REF_SAP.comparecimento.min, REF_SAP.comparecimento.alvo),
    regra: "Abaixo de 75% acende vermelho",
    base: temComparecimento ? `${n(t.compareceram)} vieram, ${n(t.faltaram)} faltaram` : "o CRM ainda não diz quem veio à consulta",
    falta: temComparecimento ? (tem("faltou") ? undefined : "Marcar a etapa de falta: sem ela o comparecimento fica sempre perto de 100%.") : "Marcar no CRM a etapa de consulta realizada e a de falta.",
    amostraPequena: t.agendados < REF_SAP.amostra.agendados,
    ehMeta: true,
  };
  if (!temComparecimento) pendencias.push("Marcar no CRM a etapa de consulta realizada e a de falta.");
  else if (!tem("faltou")) pendencias.push("Marcar no CRM a etapa de falta (no-show).");
  const comparecimentoFinal = !temComparecimento
    ? semDadoConfiavel(comparecimento, "Falta marcar no CRM a etapa de consulta realizada e a de falta.", "etapas")
    : !tem("faltou") ? semDadoConfiavel(comparecimento, "Falta marcar no CRM a etapa de falta: sem ela, quem faltou não aparece e o comparecimento fica perto de 100%.", "etapas") : comparecimento;

  // 4. Conversão da consulta
  const conv = temComparecimento ? div(t.fechados, t.compareceram) : null;
  const conversao: KpiSap = {
    id: "conversao",
    titulo: "Conversão da consulta",
    valor: conv,
    texto: !temComparecimento ? "etapa não marcada" : conv === null ? "sem consultas no período" : pct(conv),
    farol: farolFaixa(conv, REF_SAP.conversao.min, REF_SAP.conversao.alvo),
    regra: "Abaixo de 30% acende vermelho",
    base: temComparecimento ? `${n(t.fechados)} fecharam de ${n(t.compareceram)} consultas` : `${n(t.fechados)} fechados no CRM`,
    falta: temComparecimento ? undefined : "Sem a etapa de consulta realizada, não dá para separar quem consultou e não fechou.",
    amostraPequena: t.compareceram < REF_SAP.amostra.consultas,
    ehMeta: true,
  };

  const conversaoFinal = !temComparecimento ? semDadoConfiavel(conversao, "Falta marcar no CRM a etapa de consulta realizada: sem ela, não dá para separar quem consultou e não fechou.", "etapas") : conversao;

  // 5. Custo por consulta realizada
  const cc = temComparecimento && t.investido > 0 ? div(t.investido, t.compareceram) : null;
  const custo: KpiSap = {
    id: "custo_consulta",
    titulo: "Custo por consulta realizada",
    valor: cc,
    texto: t.investido <= 0 ? "sem investimento no período" : !temComparecimento ? "etapa não marcada" : cc === null ? "nenhuma consulta realizada" : brl(cc),
    farol: "cinza",
    regra: "Comparado com a meta da clínica (a partir do D14)",
    base: `${brl(t.investido)} investidos em anúncios · ${n(t.compareceram)} consultas`,
    falta: !temComparecimento ? "Marcar no CRM a etapa de consulta realizada." : undefined,
    amostraPequena: t.compareceram < REF_SAP.amostra.consultas,
    ehMeta: true,
  };

  const custoFinal = t.investido > 0 && !temComparecimento
    ? semDadoConfiavel(custo, "Falta marcar no CRM a etapa de consulta realizada.", "etapas")
    : t.investido > 0 && t.leads_crm_meta === 0
      ? semDadoConfiavel(custo, "Nenhum lead do CRM tem origem Meta: não dá para saber quais consultas vieram do anúncio. Registre a origem (UTM) dos leads.", "rastreamento")
      : custo;

  // 6. Receita atribuída (acompanha, nunca é meta)
  const receita: KpiSap = {
    id: "receita",
    titulo: "Receita atribuída",
    valor: t.receita,
    texto: brl(t.receita),
    farol: "cinza",
    regra: "Acompanhamento. Não é meta do SAP: o fechamento é do médico.",
    base: t.fechados ? `${n(t.fechados_com_valor)} de ${n(t.fechados)} fechamentos com valor no CRM` : "nenhum fechamento no período",
    falta: t.fechados > 0 && t.fechados_com_valor < t.fechados ? "Preencher o valor fechado em todo card ganho." : undefined,
    ehMeta: false,
  };
  if (t.fechados > 0 && t.fechados_com_valor / t.fechados < 0.8) pendencias.push("Preencher o valor fechado nos cards ganhos do CRM.");
  const receitaFinal = t.fechados > 0 && t.fechados_com_valor < t.fechados
    ? semDadoConfiavel(receita, `${n(t.fechados - t.fechados_com_valor)} de ${n(t.fechados)} cards ganhos estão sem valor no CRM. Preencha o valor fechado em cada um.`, "crm")
    : receita;

  // Checagens de qualidade do dado (03.07): divergência ≤ 20% e linhas completas ≥ 90%.
  const divergencia: ChecagemSap = (() => {
    const base = { id: "divergencia" as const, titulo: "Leads da Meta × CRM", regra: "Diferença de até 20%" };
    if (t.leads_plataforma <= 0) return { ...base, valor: null, texto: "sem leads de anúncio no período", ok: null };
    const d = Math.abs(t.leads_crm_meta - t.leads_plataforma) / t.leads_plataforma;
    const ok = d <= REF_SAP.divergenciaMax;
    return {
      ...base,
      valor: d,
      texto: `${n(t.leads_plataforma)} na Meta, ${n(t.leads_crm_meta)} no CRM com origem anúncio (${pct(d)} de diferença)`,
      ok,
      falta: ok ? undefined : t.leads_crm_meta === 0 ? "Nenhum lead do CRM está com origem de anúncio. Preencher a origem (ex.: \"Meta Ads\") ao criar o card." : "Conferir se todo lead de anúncio entra no CRM com a origem preenchida.",
    };
  })();
  if (divergencia.ok === false) pendencias.push("Registrar a origem \"Meta Ads\" nos leads que vêm dos anúncios.");

  const lin = div(t.linhas_completas, t.leads);
  const linhas: ChecagemSap = {
    id: "linhas",
    titulo: "Linhas completas no CRM",
    valor: lin,
    texto: lin === null ? "sem leads no período" : `${pct(lin)} dos leads com origem${t.fechados ? ", valor" : ""}${t.perdidos_motivo_medivel ? " e motivo de perda" : ""}`,
    ok: lin === null ? null : lin >= REF_SAP.linhasMin,
    regra: "90% ou mais",
    falta: lin !== null && lin < REF_SAP.linhasMin ? `Faltam origem em ${n(t.leads - t.com_origem)} leads${t.fechados - t.fechados_com_valor > 0 ? ` e valor em ${n(t.fechados - t.fechados_com_valor)} fechamentos` : ""}.` : undefined,
  };
  if (lin !== null && t.com_origem / Math.max(1, t.leads) < REF_SAP.linhasMin) pendencias.push("Preencher a origem do lead em todo card novo.");

  return {
    kpis: [resp, agendamento, comparecimentoFinal, conversaoFinal, custoFinal, receitaFinal],
    checagens: [divergencia, linhas],
    funil: [
      { id: "leads", rotulo: "Leads", valor: t.leads },
      { id: "qualificados", rotulo: "Qualificados", valor: t.qualificados },
      { id: "agendados", rotulo: "Agendados", valor: t.agendados },
      // Sem etapa de consulta realizada, "consultas" seria só uma cópia dos fechados: fica de fora.
      ...(temComparecimento ? [{ id: "compareceram", rotulo: "Consultas", valor: t.compareceram }] : []),
      { id: "fechados", rotulo: "Fechados", valor: t.fechados },
    ],
    pendencias: [...new Set(pendencias)],
  };
}
