import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lerTrackerAuto, montarKpisSap, type TrackerAutoBruto } from "@/lib/sap-auto";
import type { LinhaPlano } from "@/lib/sap-metas";
import { ITENS_EXECUCAO, resumoSaude, type ItemRegistro, type ResumoSaude, type SemanaSaude } from "@/lib/sap-scores";
import { diaDoPrograma, MARCOS_PRINCIPAIS, type Pausa } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";
import type { RegistroAcesso } from "@/lib/sap-acessos";
import { lerSinais, type AuditoriaSemana, type SinaisBrutos } from "@/lib/sap-sinais";
import type { SemanaFidelizacao } from "@/lib/sap-fidelizacao";
import type { CategoriaMeta, LinhaConversao, RegistroTeste, StatusTeste } from "@/lib/sap-rastreamento";
import type { AcaoBruta, EntradaTarefas, PapelId, RotinaRegistro, StatusRegistro } from "@/lib/sap-tarefas";

// Tracker do Sistema de Aquisição de Pacientes (SAP).
//
// As tabelas sap_* ainda não estão no types.ts gerado, então a leitura passa
// por um cliente sem tipo e os tipos ficam declarados aqui. Quando o types.ts
// for regenerado com as tabelas, dá para trocar `db` por `supabase`.
const db = supabase as unknown as SupabaseClient;

export type SapClinica = {
  id: string;
  client_id: string | null;
  nome: string;
  cidade: string | null;
  especialidade: string | null;
  d0: string | null;
  status: "onboarding" | "rodando" | "pausada" | "encerrada" | null;
  /** Pausas de prazo (01.02 §5), já sem as removidas. */
  pausas?: Pausa[];
};

export type SapLead = {
  id: string;
  data_entrada: string;
  canal: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  servico: string | null;
  pontuacao: "A" | "B" | "C" | null;
  tempo_primeira_resposta_min: number | null;
  agendou: boolean | null;
  data_consulta: string | null;
  compareceu: "Sim" | "Não" | "Remarcou" | null;
  decisao: "Fechou" | "Não fechou" | "Pensando" | null;
  motivo_categoria: string | null;
  valor_apresentado: number | null;
  valor_fechado: number | null;
  toque_fechamento: string | null;
  status_cadencia: string | null;
};

export type SapMeta = { mes: string; etapa: string; meta: number };
export type SapInvestimento = { data: string; canal: string; investimento: number };

export type SapDados = {
  clinica: SapClinica;
  leads: SapLead[];
  investimento: SapInvestimento[];
  metas: SapMeta[];
};

const CAMPOS_LEAD =
  "id, data_entrada, canal, utm_campaign, utm_content, servico, pontuacao, tempo_primeira_resposta_min, agendou, data_consulta, compareceu, decisao, motivo_categoria, valor_apresentado, valor_fechado, toque_fechamento, status_cadencia";

// null quando o cliente do Hub ainda não tem clínica do SAP ligada (ou quando
// a migração das tabelas sap_* ainda não foi aplicada).
export async function getSapDados(clientId: string, start: string, end: string): Promise<SapDados | null> {
  const { data: clinica, error: e1 } = await db
    .from("sap_clinicas")
    .select("id, client_id, nome, cidade, especialidade, d0, status")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) {
    // 42P01 = tabela não existe: migração ainda não aplicada. Mostra o estado vazio.
    if (e1.code === "42P01" || /does not exist|schema cache/i.test(e1.message)) return null;
    throw e1;
  }
  if (!clinica) return null;

  const fim = `${end}T23:59:59.999-03:00`;
  const ini = `${start}T00:00:00-03:00`;

  const [leadsR, metaAdsR, outrosR, metasR] = await Promise.all([
    db.from("sap_leads").select(CAMPOS_LEAD).eq("clinica_id", clinica.id).gte("data_entrada", ini).lte("data_entrada", fim).order("data_entrada", { ascending: false }).limit(5000),
    db.from("meta_ads_daily").select("date, spend").eq("client_id", clientId).gte("date", start).lte("date", end).limit(20000),
    db.from("sap_metricas_diarias").select("data, canal, investimento").eq("clinica_id", clinica.id).gte("data", start).lte("data", end),
    db.from("sap_metas").select("mes, etapa, meta").eq("clinica_id", clinica.id).gte("mes", `${start.slice(0, 7)}-01`).lte("mes", end),
  ]);
  for (const r of [leadsR, metaAdsR, outrosR, metasR]) if (r.error) throw r.error;

  // Meta Ads vem do sync que o Hub já faz (meta_ads_daily). As outras fontes
  // (Google, impulsionamento) entram por sap_metricas_diarias, sem a Meta para
  // não contar duas vezes.
  const investimento: SapInvestimento[] = [
    ...((metaAdsR.data ?? []) as { date: string; spend: number }[]).map((r) => ({ data: r.date, canal: "Meta Ads", investimento: Number(r.spend) || 0 })),
    ...((outrosR.data ?? []) as SapInvestimento[]).filter((r) => r.canal !== "Meta Ads").map((r) => ({ ...r, investimento: Number(r.investimento) || 0 })),
  ];

  return {
    clinica: clinica as SapClinica,
    leads: (leadsR.data ?? []) as SapLead[],
    investimento,
    metas: ((metasR.data ?? []) as SapMeta[]).map((m) => ({ ...m, meta: Number(m.meta) || 0 })),
  };
}

// ---------------------------------------------------------------------------
// Cálculo. Puro: serve para o dado real e para o exemplo.

export type Farol = "verde" | "amarelo" | "vermelho" | "cinza";

export type SapAlerta = { chave: string; titulo: string; valor: string; regra: string; farol: Farol };

export type SapResumo = {
  leads: number;
  qualificados: number;
  agendamentos: number;
  consultas: number;
  fechamentos: number;
  receita: number;
  investimento: number;
  cpl: number | null;
  custoConsulta: number | null;
  roas: number | null;
  ticketMedio: number | null;
  medianaResposta: number | null;
  taxaAgendamento: number | null; // agendamentos / qualificados
  taxaComparecimento: number | null; // consultas / agendamentos que já tiveram desfecho
  taxaConversao: number | null; // fechamentos / consultas
  semanas: { semana: string; leads: number; consultas: number; fechamentos: number; receita: number }[];
  motivos: { motivo: string; total: number }[];
  toques: { toque: string; total: number }[];
  canais: { canal: string; leads: number; consultas: number; fechamentos: number; receita: number; investimento: number }[];
  metas: { etapa: string; rotulo: string; meta: number; esperado: number; realizado: number }[];
  alertas: SapAlerta[];
};

// Referências iniciais Doctor Creator. São hipóteses a validar no piloto,
// nunca dado de mercado (PADRAO_V2, seção 12).
export const REFERENCIA = {
  agendamento: [0.3, 0.5],
  comparecimento: [0.75, 0.85],
  conversao: [0.3, 0.5],
  respostaMin: 5,
} as const;

const ROTULO_ETAPA: Record<string, string> = {
  leads: "Leads",
  qualificados: "Qualificados (A+B)",
  agendamentos: "Agendamentos",
  consultas: "Consultas",
  fechamentos: "Fechamentos",
  receita: "Receita",
};

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function div(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function inicioSemana(iso: string): string {
  const d = new Date(iso);
  const dia = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000) + 1;
}

const pct = (v: number | null) => (v === null ? "sem dado" : `${Math.round(v * 100)}%`);

export function calcularResumo(d: SapDados, start: string, end: string): SapResumo {
  const L = d.leads;
  const qualificados = L.filter((l) => l.pontuacao === "A" || l.pontuacao === "B").length;
  const agendamentos = L.filter((l) => l.agendou).length;
  const consultas = L.filter((l) => l.compareceu === "Sim").length;
  const comDesfecho = L.filter((l) => l.agendou && (l.compareceu === "Sim" || l.compareceu === "Não")).length;
  const fechados = L.filter((l) => l.decisao === "Fechou");
  const receita = fechados.reduce((s, l) => s + (Number(l.valor_fechado) || 0), 0);
  const investimento = d.investimento.reduce((s, r) => s + r.investimento, 0);
  const medianaResposta = mediana(L.map((l) => l.tempo_primeira_resposta_min).filter((v): v is number => v !== null && v !== undefined).map(Number));

  const taxaAgendamento = div(agendamentos, qualificados);
  const taxaComparecimento = div(consultas, comDesfecho);
  const taxaConversao = div(fechados.length, consultas);

  const porSemana = new Map<string, { leads: number; consultas: number; fechamentos: number; receita: number }>();
  for (const l of L) {
    const k = inicioSemana(l.data_entrada);
    const s = porSemana.get(k) ?? { leads: 0, consultas: 0, fechamentos: 0, receita: 0 };
    s.leads += 1;
    if (l.compareceu === "Sim") s.consultas += 1;
    if (l.decisao === "Fechou") {
      s.fechamentos += 1;
      s.receita += Number(l.valor_fechado) || 0;
    }
    porSemana.set(k, s);
  }
  const semanas = [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semana, s]) => ({ semana, ...s }));

  const contar = (vals: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const motivos = contar(L.filter((l) => l.decisao === "Não fechou" || l.decisao === "Pensando").map((l) => l.motivo_categoria)).map(([motivo, total]) => ({ motivo, total }));
  const toques = contar(fechados.map((l) => l.toque_fechamento)).map(([toque, total]) => ({ toque, total }));

  const canaisMap = new Map<string, SapResumo["canais"][number]>();
  const canalDe = (c: string | null) => c ?? "Outro";
  for (const l of L) {
    const c = canaisMap.get(canalDe(l.canal)) ?? { canal: canalDe(l.canal), leads: 0, consultas: 0, fechamentos: 0, receita: 0, investimento: 0 };
    c.leads += 1;
    if (l.compareceu === "Sim") c.consultas += 1;
    if (l.decisao === "Fechou") {
      c.fechamentos += 1;
      c.receita += Number(l.valor_fechado) || 0;
    }
    canaisMap.set(c.canal, c);
  }
  for (const r of d.investimento) {
    const c = canaisMap.get(r.canal) ?? { canal: r.canal, leads: 0, consultas: 0, fechamentos: 0, receita: 0, investimento: 0 };
    c.investimento += r.investimento;
    canaisMap.set(c.canal, c);
  }
  const canais = [...canaisMap.values()].sort((a, b) => b.leads - a.leads);

  // Meta x realizado, pró-rata pelos dias do período dentro de cada mês.
  const realizado: Record<string, number> = {
    leads: L.length,
    qualificados,
    agendamentos,
    consultas,
    fechamentos: fechados.length,
    receita,
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const fimEfetivo = end < hoje ? end : hoje;
  const esperadoPorEtapa = new Map<string, { meta: number; esperado: number }>();
  for (const m of d.metas) {
    const mesIni = m.mes.slice(0, 10);
    const ultimo = new Date(Date.UTC(Number(mesIni.slice(0, 4)), Number(mesIni.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const diasMes = diasEntre(mesIni, ultimo);
    const a = start > mesIni ? start : mesIni;
    const b = fimEfetivo < ultimo ? fimEfetivo : ultimo;
    if (a > b) continue;
    const frac = diasEntre(a, b) / diasMes;
    const atual = esperadoPorEtapa.get(m.etapa) ?? { meta: 0, esperado: 0 };
    atual.meta += m.meta;
    atual.esperado += m.meta * frac;
    esperadoPorEtapa.set(m.etapa, atual);
  }
  const metas = Object.keys(ROTULO_ETAPA)
    .filter((e) => esperadoPorEtapa.has(e))
    .map((e) => ({ etapa: e, rotulo: ROTULO_ETAPA[e], meta: esperadoPorEtapa.get(e)!.meta, esperado: esperadoPorEtapa.get(e)!.esperado, realizado: realizado[e] ?? 0 }));

  const farolFaixa = (v: number | null, min: number, alvo: number): Farol => (v === null ? "cinza" : v >= alvo ? "verde" : v >= min ? "amarelo" : "vermelho");
  const metaLeads = metas.find((m) => m.etapa === "leads");
  const ritmoLeads = metaLeads && metaLeads.esperado > 0 ? metaLeads.realizado / metaLeads.esperado : null;

  const alertas: SapAlerta[] = [
    {
      chave: "resposta",
      titulo: "Tempo da 1ª resposta",
      valor: medianaResposta === null ? "sem dado" : `${Math.round(medianaResposta)} min`,
      regra: "Mediana até 5 min em horário comercial",
      farol: medianaResposta === null ? "cinza" : medianaResposta <= REFERENCIA.respostaMin ? "verde" : medianaResposta <= 15 ? "amarelo" : "vermelho",
    },
    {
      chave: "agendamento",
      titulo: "Agendamento dos qualificados",
      valor: pct(taxaAgendamento),
      regra: "Referência DC 30% a 50%",
      farol: farolFaixa(taxaAgendamento, 0.2, REFERENCIA.agendamento[0]),
    },
    {
      chave: "comparecimento",
      titulo: "Comparecimento",
      valor: pct(taxaComparecimento),
      regra: "Abaixo de 75% acende vermelho",
      farol: taxaComparecimento === null ? "cinza" : taxaComparecimento >= 0.8 ? "verde" : taxaComparecimento >= REFERENCIA.comparecimento[0] ? "amarelo" : "vermelho",
    },
    {
      chave: "conversao",
      titulo: "Conversão da consulta",
      valor: pct(taxaConversao),
      regra: "Abaixo de 30% acende vermelho",
      farol: taxaConversao === null ? "cinza" : taxaConversao >= 0.4 ? "verde" : taxaConversao >= REFERENCIA.conversao[0] ? "amarelo" : "vermelho",
    },
    {
      chave: "ritmo",
      titulo: "Leads x meta (pró-rata)",
      valor: ritmoLeads === null ? "sem meta" : `${Math.round(ritmoLeads * 100)}%`,
      regra: "Abaixo de 70% da meta do período acende vermelho",
      farol: ritmoLeads === null ? "cinza" : ritmoLeads >= 0.9 ? "verde" : ritmoLeads >= 0.7 ? "amarelo" : "vermelho",
    },
  ];

  return {
    leads: L.length,
    qualificados,
    agendamentos,
    consultas,
    fechamentos: fechados.length,
    receita,
    investimento,
    cpl: div(investimento, L.length),
    custoConsulta: div(investimento, consultas),
    roas: investimento > 0 ? receita / investimento : null,
    ticketMedio: div(receita, fechados.length),
    medianaResposta,
    taxaAgendamento,
    taxaComparecimento,
    taxaConversao,
    semanas,
    motivos,
    toques,
    canais,
    metas,
    alertas,
  };
}

// ---------------------------------------------------------------------------
// Dado de exemplo: só em memória, para ver a tela antes da primeira clínica.
// Nunca é gravado no banco.

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function dadosDeExemplo(start: string, end: string, seed = 42): SapDados {
  const r = rng(seed);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
  const servicos = ["Harmonização facial", "Bioestimulador", "Protocolo de flacidez"] as const;
  const canais = ["Meta Ads", "Meta Ads", "Meta Ads", "Google Ads", "Indicação", "Orgânico"] as const;
  const motivos = ["Preço", "Tempo para decidir", "Cônjuge ou família", "Medo ou insegurança", "Comparando com outro profissional"] as const;
  const toques = ["Consulta", "Consulta", "F1", "F2", "F3"] as const;
  const leads: SapLead[] = [];
  const investimento: SapInvestimento[] = [];
  const dias = Math.max(1, diasEntre(start, end));
  const hoje = Date.now();
  for (let i = 0; i < dias; i++) {
    const dia = new Date(Date.parse(`${start}T12:00:00Z`) + i * 86400000);
    if (dia.getTime() > hoje) break;
    const iso = dia.toISOString().slice(0, 10);
    investimento.push({ data: iso, canal: "Meta Ads", investimento: Math.round(260 + r() * 160) });
    if (i % 7 === 0) investimento.push({ data: iso, canal: "Google Ads", investimento: Math.round(600 + r() * 300) });
    const n = Math.floor(r() * 5) + 2;
    for (let j = 0; j < n; j++) {
      const pont = r() < 0.55 ? "A" : r() < 0.6 ? "B" : "C";
      const qualif = pont !== "C";
      const agendou = qualif && r() < 0.42;
      const antigo = hoje - dia.getTime() > 5 * 86400000;
      const comp = agendou && antigo ? (r() < 0.8 ? "Sim" : r() < 0.5 ? "Não" : "Remarcou") : null;
      const dec = comp === "Sim" ? (r() < 0.38 ? "Fechou" : r() < 0.6 ? "Pensando" : "Não fechou") : null;
      const valor = Math.round((2500 + r() * 5500) / 100) * 100;
      leads.push({
        id: `L-${iso.replace(/-/g, "")}-${String(j + 1).padStart(3, "0")}`,
        data_entrada: `${iso}T${String(9 + Math.floor(r() * 9)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00-03:00`,
        canal: pick(canais),
        utm_campaign: "exemplo",
        utm_content: null,
        servico: pick(servicos),
        pontuacao: pont,
        tempo_primeira_resposta_min: Math.round(r() < 0.7 ? 1 + r() * 6 : 8 + r() * 50),
        agendou,
        data_consulta: null,
        compareceu: comp,
        decisao: dec,
        motivo_categoria: dec && dec !== "Fechou" ? pick(motivos) : null,
        valor_apresentado: comp === "Sim" ? valor : null,
        valor_fechado: dec === "Fechou" ? valor : null,
        toque_fechamento: dec === "Fechou" ? pick(toques) : null,
        status_cadencia: dec === "Pensando" ? "Ativa" : null,
      });
    }
  }
  const metas: SapMeta[] = [];
  const mesIni = new Date(`${start.slice(0, 7)}-01T12:00:00Z`);
  for (let m = new Date(mesIni); m.toISOString().slice(0, 10) <= end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const mes = m.toISOString().slice(0, 10);
    metas.push({ mes, etapa: "leads", meta: 120 }, { mes, etapa: "consultas", meta: 30 }, { mes, etapa: "fechamentos", meta: 12 }, { mes, etapa: "receita", meta: 60000 });
  }
  return {
    clinica: { id: "exemplo", client_id: null, nome: "Clínica de exemplo", cidade: null, especialidade: "Dermatologia estética", d0: start, status: "rodando" },
    leads: leads.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada)),
    investimento,
    metas,
  };
}

// ---------------------------------------------------------------------------
// Portfólio: todas as clínicas do SAP numa tela (admin).

// Sessões e marcos do Cronograma Mestre 00.02 (lista completa em src/lib/sap-cronograma.ts), pelo dia-alvo.
export const MARCOS: { dia: number; nome: string; n: number }[] = MARCOS_PRINCIPAIS;

export function faseDoDia(dia: number | null): string {
  if (dia === null) return "sem D0";
  if (dia < 0) return "antes do D0";
  if (dia <= 7) return "Onboarding";
  if (dia <= 14) return "Diagnóstico e metas";
  if (dia <= 28) return "Montagem";
  if (dia <= 30) return "Lançamento";
  if (dia < 60) return "Venda e fidelização";
  if (dia <= 90) return "Otimização";
  return "Pós-contrato";
}

/** Dia do programa hoje: dias corridos desde o D0 menos os dias de pausa formal já passados (01.02 §5). */
export function diaAtual(d0: string | null, pausas: Pausa[] = []): number | null {
  if (!d0) return null;
  return diaDoPrograma(d0, pausas, hojeBrasilia());
}

type PausaBruta = { tipo: Pausa["tipo"]; inicio: string; fim: string | null; removido_em: string | null; id?: string; motivo?: string | null };
export const pausasValidas = (xs: PausaBruta[] | null | undefined): Pausa[] =>
  (xs ?? []).filter((p) => !p.removido_em).map((p) => ({ id: p.id, tipo: p.tipo, inicio: p.inicio, fim: p.fim, motivo: p.motivo ?? null }));

export function proximoMarco(dia: number | null): { dia: number; nome: string; faltam: number } | null {
  if (dia === null) return null;
  const m = MARCOS.find((x) => x.dia >= dia);
  return m ? { ...m, faltam: m.dia - dia } : null;
}

export type SapLinhaPortfolio = {
  clinica: SapClinica;
  dia: number | null;
  semana: SapResumo;
  semanaAnterior: SapResumo;
  automatico?: boolean; // números do tracker automático (CRM + WhatsApp), não de sap_leads
  execucao?: number | null; // Score de Execução (% do D90), de sap_clinicas.score_execucao
  saude?: ResumoSaude | null; // Score de Saúde semanal (11.04)
};

function isoDia(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(d);
}

// Semana = últimos 7 dias fechados; anterior = os 7 antes dela.
export function janelasDaSemana() {
  return { ini: isoDia(-7), fim: isoDia(-1), iniAnt: isoDia(-14), fimAnt: isoDia(-8) };
}

function recorte(d: SapDados, ini: string, fim: string): SapDados {
  const a = `${ini}T00:00:00-03:00`;
  const b = `${fim}T23:59:59.999-03:00`;
  return {
    ...d,
    leads: d.leads.filter((l) => Date.parse(l.data_entrada) >= Date.parse(a) && Date.parse(l.data_entrada) <= Date.parse(b)),
    investimento: d.investimento.filter((r) => r.data >= ini && r.data <= fim),
  };
}

export function montarLinha(d: SapDados): SapLinhaPortfolio {
  const j = janelasDaSemana();
  return {
    clinica: d.clinica,
    dia: diaAtual(d.clinica.d0, d.clinica.pausas),
    semana: calcularResumo(recorte(d, j.ini, j.fim), j.ini, j.fim),
    semanaAnterior: calcularResumo(recorte(d, j.iniAnt, j.fimAnt), j.iniAnt, j.fimAnt),
  };
}

// null quando as tabelas sap_* ainda não existem.
export async function getSapPortfolio(): Promise<SapLinhaPortfolio[] | null> {
  const { data: clinicas, error } = await db
    .from("sap_clinicas")
    .select("id, client_id, nome, cidade, especialidade, d0, status, piloto, score_execucao, sap_pausas(id, tipo, inicio, fim, removido_em)")
    .order("d0", { ascending: true });
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  const lista = ((clinicas ?? []) as (SapClinica & { sap_pausas?: PausaBruta[] })[]).map(({ sap_pausas, ...c }) => ({ ...c, pausas: pausasValidas(sap_pausas) })) as SapClinica[];
  if (!lista.length) return [];
  const j = janelasDaSemana();
  const ids = lista.map((c) => c.id);
  const clientIds = lista.map((c) => c.client_id).filter((x): x is string => !!x);
  const [leadsR, metaR, outrosR, metasR] = await Promise.all([
    db.from("sap_leads").select(`clinica_id, ${CAMPOS_LEAD}`).in("clinica_id", ids).gte("data_entrada", `${j.iniAnt}T00:00:00-03:00`).limit(20000),
    clientIds.length
      ? db.from("meta_ads_daily").select("client_id, date, spend").in("client_id", clientIds).gte("date", j.iniAnt).limit(50000)
      : Promise.resolve({ data: [], error: null }),
    db.from("sap_metricas_diarias").select("clinica_id, data, canal, investimento").in("clinica_id", ids).gte("data", j.iniAnt),
    db.from("sap_metas").select("clinica_id, mes, etapa, meta").in("clinica_id", ids).gte("mes", `${j.iniAnt.slice(0, 7)}-01`),
  ]);
  for (const r of [leadsR, metaR, outrosR, metasR]) if (r.error) throw r.error;
  type L = SapLead & { clinica_id: string };
  const leads = (leadsR.data ?? []) as L[];
  const meta = (metaR.data ?? []) as { client_id: string; date: string; spend: number }[];
  const outros = (outrosR.data ?? []) as (SapInvestimento & { clinica_id: string })[];
  const metas = (metasR.data ?? []) as (SapMeta & { clinica_id: string })[];
  const linhas = lista.map((c) =>
    montarLinha({
      clinica: c,
      leads: leads.filter((l) => l.clinica_id === c.id),
      investimento: [
        ...meta.filter((m) => m.client_id === c.client_id).map((m) => ({ data: m.date, canal: "Meta Ads", investimento: Number(m.spend) || 0 })),
        ...outros.filter((o) => o.clinica_id === c.id && o.canal !== "Meta Ads").map((o) => ({ data: o.data, canal: o.canal, investimento: Number(o.investimento) || 0 })),
      ],
      metas: metas.filter((m) => m.clinica_id === c.id).map((m) => ({ mes: m.mes, etapa: m.etapa, meta: Number(m.meta) || 0 })),
    }),
  );
  const saudeR = await db.from("sap_saude_semana").select("clinica_id, semana, tarefas_no_prazo, sessoes_marcadas, sessoes_com_decisor, call_grupo, decisor_respondeu, tempo_resposta_h, kpis_verde, kpis_vermelho, sentimento, o_que_aconteceu").in("clinica_id", ids);
  const saudeRows = (saudeR.error ? [] : (saudeR.data ?? [])) as (SemanaSaude & { clinica_id: string })[];
  const nnum = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  // Sem leads registrados um a um: os números vêm do tracker automático (CRM + WhatsApp + Meta).
  return Promise.all(
    linhas.map(async (l0) => {
      const c0 = l0.clinica as SapClinica & { score_execucao?: number | null };
      const semanasSaude = saudeRows
        .filter((r) => r.clinica_id === c0.id)
        .map((r) => ({ ...r, tarefas_no_prazo: nnum(r.tarefas_no_prazo), sessoes_marcadas: nnum(r.sessoes_marcadas), sessoes_com_decisor: nnum(r.sessoes_com_decisor), tempo_resposta_h: nnum(r.tempo_resposta_h), kpis_verde: nnum(r.kpis_verde), kpis_vermelho: nnum(r.kpis_vermelho) }));
      const l: SapLinhaPortfolio = { ...l0, execucao: c0.score_execucao === null || c0.score_execucao === undefined ? null : Number(c0.score_execucao) / 100, saude: semanasSaude.length ? resumoSaude(semanasSaude) : null };
      if (!l.clinica.client_id || l.semana.leads + l.semanaAnterior.leads > 0) return l;
      const [a, b] = await Promise.all([getTrackerAuto(l.clinica.client_id, j.ini, j.fim), getTrackerAuto(l.clinica.client_id, j.iniAnt, j.fimAnt)]);
      const ra = lerTrackerAuto(a);
      const rb = lerTrackerAuto(b);
      return { ...l, semana: ra ? resumoDoAuto(ra) : l.semana, semanaAnterior: rb ? resumoDoAuto(rb) : l.semanaAnterior, automatico: true };
    }),
  );
}

// Converte o tracker automático no formato do resumo (portfólio e leitura semanal).
export function resumoDoAuto(t: TrackerAutoBruto): SapResumo {
  const leitura = montarKpisSap(t);
  const k = (id: string) => leitura.kpis.find((x) => x.id === id)!;
  return {
    leads: t.leads,
    qualificados: t.qualificados,
    agendamentos: t.agendados,
    consultas: t.compareceram,
    fechamentos: t.fechados,
    receita: t.receita,
    investimento: t.investido,
    cpl: div(t.investido, t.leads),
    custoConsulta: k("custo_consulta").valor,
    roas: t.investido > 0 ? t.receita / t.investido : null,
    ticketMedio: div(t.receita, t.fechados_com_valor),
    medianaResposta: t.resposta_mediana_min,
    taxaAgendamento: k("agendamento").valor,
    taxaComparecimento: k("comparecimento").valor,
    taxaConversao: k("conversao").valor,
    semanas: t.semanas.map((s) => ({ semana: s.semana, leads: s.leads, consultas: s.compareceram, fechamentos: s.fechados, receita: s.receita })),
    motivos: [],
    toques: [],
    canais: t.canais.map((c) => ({ canal: c.canal, leads: c.leads, consultas: c.compareceram, fechamentos: c.fechados, receita: c.receita, investimento: c.canal === "Meta Ads" ? t.investido : 0 })),
    metas: [],
    alertas: leitura.kpis
      .filter((x) => x.ehMeta && x.id !== "custo_consulta")
      .map((x) => ({ chave: x.id, titulo: x.titulo, valor: x.texto, regra: x.regra, farol: x.farol })),
  };
}

export function portfolioDeExemplo(): SapLinhaPortfolio[] {
  const base = [
    { nome: "Clínica Aurora Dermatologia", cidade: "Campinas/SP", especialidade: "Dermatologia estética", diasAtras: 41 },
    { nome: "Instituto Vértice Cirurgia Plástica", cidade: "Belo Horizonte/MG", especialidade: "Cirurgia plástica", diasAtras: 12 },
    { nome: "Clínica Sorriso Pleno", cidade: "Recife/PE", especialidade: "Odontologia", diasAtras: 67 },
  ];
  return base.map((b, i) => {
    const d0 = isoDia(-b.diasAtras);
    const d = dadosDeExemplo(isoDia(-21), isoDia(-1), 42 + i * 101);
    const fator = [1, 0.35, 0.8][i];
    const leads = d.leads.filter((_, k) => (k * 7919) % 100 < fator * 100);
    return montarLinha({
      ...d,
      leads,
      clinica: { id: `exemplo-${i}`, client_id: null, nome: b.nome, cidade: b.cidade, especialidade: b.especialidade, d0, status: b.diasAtras < 29 ? "onboarding" : "rodando" },
    });
  });
}

// ---------------------------------------------------------------------------
// Tracker automático (CRM + WhatsApp + Meta), cadastro da clínica e marcos das etapas.
// Regras dos KPIs em src/lib/sap-auto.ts; a conta no banco em sap_tracker_auto.

export type SapCadastro = SapClinica & {
  servicos: string[] | null;
  ticket_medio: number | null;
  piloto: boolean | null;
  consulta_paga: boolean | null;
  verba_em_dia: boolean | null;
  score_execucao: number | null;
  baseline_de: string | null;
  baseline_ate: string | null;
  aceite_metas_em: string | null;
  aceite_metas_por: string | null;
  ajustes_acordados: string | null;
  garantia_status: "nao_avaliada" | "aplicada" | "nao_se_aplica" | null;
  garantia_inicio: string | null;
  pos_contrato: "manutencao" | "encerrado" | "cancelado" | null;
  decisor_nome: string | null;
  decisor_contato: string | null;
  ambicao_d90: string | null;
  coordenador: string | null;
  caminho_tecnologia: "A" | "B" | null;
  categoria_fonte_meta: string | null;
  verba_mensal: number | null;
  meta_pixel_id: string | null;
  meta_ad_account_id: string | null;
  google_ads_customer_id: string | null;
  google_acoes_conversao: Record<string, string> | null;
  status_categoria_meta: CategoriaMeta | null;
  categoria_verificada_em: string | null;
  conversoes_meta: boolean | null;
  conversoes_google: boolean | null;
  rastreamento_conferido_por: string | null;
  rastreamento_conferido_em: string | null;
  drive_pasta_url: string | null;
};

export async function getClinicaSap(clientId: string): Promise<SapCadastro | null> {
  const { data, error } = await db
    .from("sap_clinicas")
    .select("id, client_id, nome, cidade, especialidade, d0, status, servicos, ticket_medio, piloto, consulta_paga, verba_em_dia, score_execucao, baseline_de, baseline_ate, aceite_metas_em, aceite_metas_por, ajustes_acordados, garantia_status, garantia_inicio, pos_contrato, decisor_nome, decisor_contato, ambicao_d90, coordenador, caminho_tecnologia, categoria_fonte_meta, verba_mensal, meta_pixel_id, meta_ad_account_id, google_ads_customer_id, google_acoes_conversao, status_categoria_meta, categoria_verificada_em, conversoes_meta, conversoes_google, rastreamento_conferido_por, rastreamento_conferido_em, drive_pasta_url, sap_pausas(id, tipo, inicio, fim, motivo, removido_em)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  if (!data) return null;
  const { sap_pausas, ...resto } = data as SapCadastro & { sap_pausas?: PausaBruta[] };
  return { ...resto, pausas: pausasValidas(sap_pausas) } as SapCadastro;
}

// ---------------------------------------------------------------- cronograma, pausas, atrasos e contrato (Lote A)

export async function getMarcosSap(clinicaId: string) {
  const { data, error } = await db.from("sap_marco_status").select("marco, concluido_em, evidencia, observacao").eq("clinica_id", clinicaId);
  if (error) throw error;
  return (data ?? []) as { marco: number; concluido_em: string | null; evidencia: string | null; observacao: string | null }[];
}

export async function marcarMarcoSap(clinicaId: string, marco: number, concluidoEm: string | null, evidencia: string, observacao = "") {
  const { error } = await db.rpc("sap_marcar_marco", { p_clinica_id: clinicaId, p_marco: marco, p_concluido_em: concluidoEm, p_evidencia: evidencia, p_observacao: observacao });
  if (error) throw error;
}

export type AtrasoSap = { id: string; data: string; dias_uteis: number; categoria: string; descricao: string | null };

export async function getAtrasosSap(clinicaId: string): Promise<AtrasoSap[]> {
  const { data, error } = await db.from("sap_atrasos").select("id, data, dias_uteis, categoria, descricao").eq("clinica_id", clinicaId).is("removido_em", null).order("data");
  if (error) throw error;
  return (data ?? []) as AtrasoSap[];
}

export async function salvarAtrasoSap(clinicaId: string, a: { id?: string | null; data: string; dias: number; categoria: string; descricao: string }, remover = false) {
  const { error } = await db.rpc("sap_salvar_atraso", { p_clinica_id: clinicaId, p_id: a.id ?? null, p_data: a.data, p_dias: a.dias, p_categoria: a.categoria, p_descricao: a.descricao || null, p_remover: remover });
  if (error) throw error;
}

export async function salvarPausaSap(clinicaId: string, p: { id?: string | null; tipo: Pausa["tipo"]; inicio: string; fim: string | null; motivo: string }, remover = false) {
  const { error } = await db.rpc("sap_salvar_pausa", { p_clinica_id: clinicaId, p_id: p.id ?? null, p_tipo: p.tipo, p_inicio: p.inicio, p_fim: p.fim, p_motivo: p.motivo || null, p_remover: remover });
  if (error) throw error;
}

export async function salvarContratoSap(
  clinicaId: string,
  v: { aceiteEm: string | null; aceitePor: string; ajustes: string; garantiaStatus: SapCadastro["garantia_status"]; garantiaInicio: string | null; posContrato: SapCadastro["pos_contrato"] },
) {
  const { error } = await db.rpc("sap_salvar_contrato", {
    p_clinica_id: clinicaId, p_aceite_em: v.aceiteEm, p_aceite_por: v.aceitePor, p_ajustes: v.ajustes,
    p_garantia_status: v.garantiaStatus, p_garantia_inicio: v.garantiaInicio, p_pos_contrato: v.posContrato,
  });
  if (error) throw error;
}

export async function salvarClinicaSap(clientId: string, v: { d0: string | null; status: string; servicos: string[]; ticket: number | null; piloto: boolean }) {
  const { error } = await db.rpc("sap_salvar_clinica", {
    p_client_id: clientId,
    p_d0: v.d0,
    p_status: v.status,
    p_servicos: v.servicos,
    p_ticket: v.ticket,
    p_piloto: v.piloto,
  });
  if (error) throw error;
}

export async function getTrackerAuto(clientId: string, start: string, end: string): Promise<unknown> {
  const { data, error } = await db.rpc("sap_tracker_auto", { p_client_id: clientId, p_from: start, p_to: end });
  if (error) throw error;
  return data;
}

export type EtapaSap = {
  connection_id: string;
  provider: string;
  pipeline_id: string;
  pipeline_name: string;
  status_id: string;
  status_name: string;
  total: number;
  ganhos: number;
  perdidos: number;
  marco: string | null;
  sugestao: string | null;
};

export async function getEtapasSap(clientId: string): Promise<EtapaSap[]> {
  const { data, error } = await db.rpc("sap_etapas_para_marcar", { p_client_id: clientId });
  if (error) throw error;
  return ((data ?? []) as EtapaSap[]).map((e) => ({ ...e, total: Number(e.total) || 0, ganhos: Number(e.ganhos) || 0, perdidos: Number(e.perdidos) || 0 }));
}

export async function definirMarcoSap(e: Pick<EtapaSap, "connection_id" | "pipeline_id" | "status_id">, marco: string | null) {
  const { error } = await db.rpc("sap_definir_marco", { p_connection: e.connection_id, p_pipeline: e.pipeline_id, p_status: e.status_id, p_marco: marco });
  if (error) throw error;
}

// Baseline D0, metas D90 e condições da garantia (03.07 / 01.02). Regras em src/lib/sap-metas.ts.
export async function getPlanoSap(clinicaId: string): Promise<LinhaPlano[]> {
  const { data, error } = await db.from("sap_kpi_plano").select("kpi, baseline, origem, amostra, meta, conta_garantia").eq("clinica_id", clinicaId);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return ((data ?? []) as LinhaPlano[]).map((l) => ({
    ...l,
    baseline: l.baseline === null ? null : Number(l.baseline),
    meta: l.meta === null ? null : Number(l.meta),
    amostra: l.amostra === null ? null : Number(l.amostra),
  }));
}

export async function salvarPlanoSap(
  clientId: string,
  linhas: LinhaPlano[],
  c: { consultaPaga: boolean; verbaEmDia: boolean; score: number | null; baselineDe: string | null; baselineAte: string | null },
) {
  const { error } = await db.rpc("sap_salvar_plano", {
    p_client_id: clientId,
    p_kpis: linhas,
    p_consulta_paga: c.consultaPaga,
    p_verba_em_dia: c.verbaEmDia,
    p_score_execucao: c.score,
    p_baseline_de: c.baselineDe,
    p_baseline_ate: c.baselineAte,
  });
  if (error) throw error;
}

// Score de Execução e Score de Saúde (11.04). Regras em src/lib/sap-scores.ts.
export async function getExecucaoSap(clinicaId: string): Promise<ItemRegistro[]> {
  const { data, error } = await db.from("sap_execucao_item").select("item, status, data_cumpriu, evidencia, observacao").eq("clinica_id", clinicaId);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as ItemRegistro[];
}

export async function salvarExecucaoSap(clientId: string, registros: ItemRegistro[]): Promise<number | null> {
  const pesos = new Map(ITENS_EXECUCAO.map((i) => [i.n, i.peso]));
  const { data, error } = await db.rpc("sap_salvar_execucao", {
    p_client_id: clientId,
    p_itens: registros.map((r) => ({ ...r, peso: pesos.get(r.item) ?? 1 })),
  });
  if (error) throw error;
  return data === null ? null : Number(data);
}

export async function getSaudeSap(clinicaId: string): Promise<SemanaSaude[]> {
  const { data, error } = await db
    .from("sap_saude_semana")
    .select("semana, tarefas_no_prazo, sessoes_marcadas, sessoes_com_decisor, call_grupo, decisor_respondeu, tempo_resposta_h, kpis_verde, kpis_vermelho, sentimento, o_que_aconteceu")
    .eq("clinica_id", clinicaId)
    .order("semana");
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as SemanaSaude[]).map((s) => ({
    ...s,
    tarefas_no_prazo: n(s.tarefas_no_prazo),
    sessoes_marcadas: n(s.sessoes_marcadas),
    sessoes_com_decisor: n(s.sessoes_com_decisor),
    tempo_resposta_h: n(s.tempo_resposta_h),
    kpis_verde: n(s.kpis_verde),
    kpis_vermelho: n(s.kpis_vermelho),
  }));
}

export async function salvarSaudeSap(clientId: string, semana: SemanaSaude) {
  const { error } = await db.rpc("sap_salvar_saude", { p_client_id: clientId, p_semana: semana });
  if (error) throw error;
}

// ---------------------------------------------------------------- ficha, acessos e ações (Lote B)

export async function salvarFichaSap(clinicaId: string, f: { decisorNome: string; decisorContato: string; ambicao: string; coordenador: string; caminho: string; categoriaFonte: string }) {
  const { error } = await db.rpc("sap_salvar_ficha", {
    p_clinica_id: clinicaId, p_decisor_nome: f.decisorNome, p_decisor_contato: f.decisorContato, p_ambicao: f.ambicao,
    p_coordenador: f.coordenador, p_caminho: f.caminho, p_categoria_fonte: f.categoriaFonte,
  });
  if (error) throw error;
}

export async function getAcessosSap(clinicaId: string): Promise<RegistroAcesso[]> {
  const { data, error } = await db.from("sap_acessos").select("item, status, confirmado_em, confirmado_por, observacao, revogado_em").eq("clinica_id", clinicaId);
  if (error) throw error;
  return (data ?? []) as RegistroAcesso[];
}

export async function salvarAcessoSap(clinicaId: string, r: RegistroAcesso) {
  const { error } = await db.rpc("sap_salvar_acesso", {
    p_clinica_id: clinicaId, p_item: r.item, p_status: r.status, p_confirmado_em: r.confirmado_em, p_confirmado_por: r.confirmado_por ?? "",
    p_observacao: r.observacao ?? "", p_revogado_em: r.revogado_em,
  });
  if (error) throw error;
}

export type AcaoSap = {
  id: string; semana: string; origem: "leitura" | "call" | "saude" | "outro"; codigo: string | null; texto: string;
  lado: "clinica" | "dc"; responsavel: string | null; prazo: string | null; status: "aberta" | "feita" | "nao_feita"; resultado: string | null;
};

export async function getAcoesSap(clinicaId: string): Promise<AcaoSap[]> {
  const { data, error } = await db.from("sap_acoes").select("id, semana, origem, codigo, texto, lado, responsavel, prazo, status, resultado")
    .eq("clinica_id", clinicaId).is("removido_em", null).order("semana", { ascending: false }).order("criado_em", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AcaoSap[];
}

export async function salvarAcaoSap(clinicaId: string, a: Omit<AcaoSap, "id"> & { id?: string | null }, remover = false) {
  const { error } = await db.rpc("sap_salvar_acao", {
    p_clinica_id: clinicaId, p_id: a.id ?? null, p_semana: a.semana, p_origem: a.origem, p_codigo: a.codigo ?? "", p_texto: a.texto,
    p_lado: a.lado, p_responsavel: a.responsavel ?? "", p_prazo: a.prazo, p_status: a.status, p_resultado: a.resultado ?? "", p_remover: remover,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- confirmação, remarcação, motivos e auditoria (Lote C)

export async function getSinaisSap(clientId: string, de: string, ate: string): Promise<SinaisBrutos | null> {
  const { data, error } = await db.rpc("sap_sinais_auto", { p_client_id: clientId, p_from: de, p_to: ate });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  return lerSinais(data);
}

export type SinalEtapa = { crm_connection_id: string; pipeline_id: string; status_id: string; sinal: "confirmado" | "remarcou"; ativo: boolean };

export async function getSinaisEtapasSap(): Promise<SinalEtapa[]> {
  const { data, error } = await db.from("sap_etapa_sinal").select("crm_connection_id, pipeline_id, status_id, sinal, ativo");
  if (error) throw error;
  return (data ?? []) as SinalEtapa[];
}

export async function definirSinalSap(e: { connection_id: string; pipeline_id: string; status_id: string }, sinal: SinalEtapa["sinal"], ligado: boolean) {
  const { error } = await db.rpc("sap_definir_sinal", { p_connection_id: e.connection_id, p_pipeline_id: e.pipeline_id, p_status_id: e.status_id, p_sinal: sinal, p_ligado: ligado });
  if (error) throw error;
}

export async function definirCategoriaMotivoSap(connectionId: string, motivoId: string, categoria: string) {
  const { error } = await db.rpc("sap_definir_categoria_motivo", { p_connection_id: connectionId, p_motivo_id: motivoId, p_categoria: categoria });
  if (error) throw error;
}

export async function getAuditoriasSap(clinicaId: string): Promise<AuditoriaSemana[]> {
  const { data, error } = await db.from("sap_auditoria_semana").select("semana, conversas, nota_media, confirmacao_vespera, f1_24h, pensando_cadencia, observacao")
    .eq("clinica_id", clinicaId).order("semana", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AuditoriaSemana[];
}

export async function salvarAuditoriaSap(clinicaId: string, a: AuditoriaSemana) {
  const { error } = await db.rpc("sap_salvar_auditoria", {
    p_clinica_id: clinicaId, p_semana: a.semana, p_conversas: a.conversas, p_nota: a.nota_media, p_confirmacao: a.confirmacao_vespera,
    p_f1: a.f1_24h, p_pensando: a.pensando_cadencia, p_observacao: a.observacao ?? "",
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- documentos 03.07 e 08.07 (Lote D)

export async function getDocumentoTextoSap(clinicaId: string, documento: "plano" | "d90"): Promise<Record<string, string>> {
  const { data, error } = await db.from("sap_documento_texto").select("secao, texto").eq("clinica_id", clinicaId).eq("documento", documento);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { secao: string; texto: string | null }[]).map((r) => [r.secao, r.texto ?? ""]));
}

export async function salvarDocumentoTextoSap(clinicaId: string, documento: "plano" | "d90", secao: string, texto: string) {
  const { error } = await db.rpc("sap_salvar_documento_texto", { p_clinica_id: clinicaId, p_documento: documento, p_secao: secao, p_texto: texto });
  if (error) throw error;
}

/** Gasto em anúncio por semana (segunda-feira), para o G3 do relatório D90. */
export async function getGastoSemanalSap(clientId: string, de: string, ate: string): Promise<Map<string, number>> {
  const { data, error } = await db.from("meta_ads_daily").select("date, spend").eq("client_id", clientId).gte("date", de).lte("date", ate).limit(50000);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { date: string; spend: number | null }[]) {
    const d = new Date(`${r.date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    m.set(k, (m.get(k) ?? 0) + (Number(r.spend) || 0));
  }
  return m;
}

// ---------------------------------------------------------------- entrada pelo SAP (clínica nova) e selo no Hub

/** Cadastra uma clínica nova direto no Sistema de Aquisição: cria o cliente (que segue no Hub depois do D90) e a clínica. */
export async function novaClinicaSap(v: { nome: string; especialidade: string; cidade: string; instagram: string; d0: string | null; piloto: boolean; servico: string; ticket: number | null }): Promise<string> {
  const { data, error } = await db.rpc("sap_nova_clinica", {
    p_nome: v.nome, p_especialidade: v.especialidade, p_cidade: v.cidade, p_instagram: v.instagram, p_d0: v.d0, p_piloto: v.piloto, p_servico: v.servico, p_ticket: v.ticket,
  });
  if (error) throw error;
  return data as string;
}

/** Clientes do Hub que estão no SAP, com o dia do programa (para o selo "SAP · D23" no Hub). */
export async function getSapPorCliente(): Promise<Map<string, { dia: number | null; status: string | null }>> {
  const { data, error } = await db.from("sap_clinicas").select("client_id, d0, status, sap_pausas(id, tipo, inicio, fim, removido_em)");
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return new Map();
    throw error;
  }
  const m = new Map<string, { dia: number | null; status: string | null }>();
  for (const r of (data ?? []) as { client_id: string | null; d0: string | null; status: string | null; sap_pausas?: PausaBruta[] }[]) {
    if (r.client_id) m.set(r.client_id, { dia: diaAtual(r.d0, pausasValidas(r.sap_pausas)), status: r.status });
  }
  return m;
}

// ---------------------------------------------------------------- verba e fidelização (Lote E)

export async function salvarVerbaSap(clinicaId: string, verbaMensal: number | null, verbaEmDia: boolean | null) {
  const { error } = await db.rpc("sap_salvar_verba", { p_clinica_id: clinicaId, p_verba_mensal: verbaMensal, p_verba_em_dia: verbaEmDia });
  if (error) throw error;
}

/** Gasto em anúncio por dia (Meta), para a verba combinada. */
export async function getGastoDiarioSap(clientId: string, de: string, ate: string): Promise<Map<string, number>> {
  const { data, error } = await db.from("meta_ads_daily").select("date, spend").eq("client_id", clientId).gte("date", de).lte("date", ate).limit(50000);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { date: string; spend: number | null }[]) m.set(r.date, (m.get(r.date) ?? 0) + (Number(r.spend) || 0));
  return m;
}

export async function getFidelizacaoSap(clinicaId: string): Promise<SemanaFidelizacao[]> {
  const { data, error } = await db.from("sap_fidelizacao_semana")
    .select("semana, retornos, recompras, contatados_reativacao, reativados_agendaram, indicacoes, indicacoes_com_codigo, avaliacoes_google, sair, contatados_regua")
    .eq("clinica_id", clinicaId).order("semana", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SemanaFidelizacao[];
}

export async function salvarFidelizacaoSap(clinicaId: string, s: SemanaFidelizacao) {
  const { semana, ...dados } = s;
  const { error } = await db.rpc("sap_salvar_fidelizacao", { p_clinica_id: clinicaId, p_semana: semana, p_dados: dados });
  if (error) throw error;
}

// ---------------------------------------------------------------- rastreamento e conversões offline (Lote F, 05.03)

export async function getTestesRastreioSap(clinicaId: string): Promise<RegistroTeste[]> {
  const { data, error } = await db.from("sap_rastreamento_teste").select("item, status, evidencia, feito_em").eq("clinica_id", clinicaId);
  if (error) throw error;
  return (data ?? []) as RegistroTeste[];
}

export async function salvarTesteRastreioSap(clinicaId: string, item: number, status: StatusTeste, evidencia: string) {
  const { error } = await db.rpc("sap_salvar_teste_rastreamento", { p_clinica_id: clinicaId, p_item: item, p_status: status, p_evidencia: evidencia });
  if (error) throw error;
}

export async function conferirRastreioSap(clinicaId: string, por: string) {
  const { error } = await db.rpc("sap_conferir_rastreamento", { p_clinica_id: clinicaId, p_por: por });
  if (error) throw error;
}

export type ConfigRastreio = {
  meta_pixel_id: string; meta_ad_account_id: string; google_ads_customer_id: string;
  google_acoes_conversao: Record<string, string>; status_categoria_meta: CategoriaMeta | "";
  categoria_verificada_em: string; conversoes_meta: boolean; conversoes_google: boolean;
};

export async function salvarConfigRastreioSap(clinicaId: string, c: ConfigRastreio) {
  const { error } = await db.rpc("sap_salvar_rastreamento", { p_clinica_id: clinicaId, p_dados: c });
  if (error) throw error;
}

/** Fila de conversões offline (só admin lê). Últimos 90 dias. */
export async function getConversoesSap(clinicaId: string): Promise<LinhaConversao[]> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data, error } = await db.from("sap_conversoes").select("etapa, plataforma, status, motivo, ocorreu_em, enviado_em")
    .eq("clinica_id", clinicaId).gte("ocorreu_em", desde).order("ocorreu_em", { ascending: false }).limit(2000);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as LinhaConversao[];
}

// ---------------------------------------------------------------- modo sessão

export type RegistroSessao = { chave: string; texto: string | null; feito_em: string | null };

export async function getSessaoSap(clinicaId: string, sessao: string): Promise<RegistroSessao[]> {
  const { data, error } = await db.from("sap_sessao_registro").select("chave, texto, feito_em").eq("clinica_id", clinicaId).eq("sessao", sessao);
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as RegistroSessao[];
}

/** feito: true marca, false desmarca, null mantém (só salva o texto). */
export async function salvarSessaoSap(clinicaId: string, sessao: string, chave: string, texto: string | null, feito: boolean | null) {
  const { error } = await db.rpc("sap_salvar_sessao", { p_clinica_id: clinicaId, p_sessao: sessao, p_chave: chave, p_texto: texto, p_feito: feito });
  if (error) throw error;
}

export async function salvarPastaDriveSap(clinicaId: string, url: string) {
  const { error } = await db.rpc("sap_salvar_pasta_drive", { p_clinica_id: clinicaId, p_url: url });
  if (error) throw error;
}

/** Rascunho do pós-sessão por IA (api/_lib/sessao-ia.ts via /api/sync/manual, alvo "sessao_ia"). Só admin. */
export async function gerarRascunhoSessao(clientId: string, args: { sessao: string; titulo: string; entregas: string[]; rotulos: Record<string, string>; transcricao: string }) {
  const { data: sessao } = await supabase.auth.getSession();
  const resp = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token ?? ""}` },
    body: JSON.stringify({ client_id: clientId, alvo: "sessao_ia", ...args }),
  });
  const j = (await resp.json().catch(() => null)) as { error?: string } | null;
  if (!resp.ok) throw new Error(j?.error ?? `Falha (${resp.status})`);
  return j;
}

// ---------------------------------------------------------------- IA na auditoria semanal (06.09)

export type SugestaoAuditoria = {
  conversas_semana: number; analisadas: number; sem_analise: number; amostra: number; nota_media_0a10: number | null;
  falhas: { falha: string; n: number }[]; abertas: number; abertas_sem_follow_up: number; recuperaveis: number; pontos_a_melhorar: string[];
};

/** Junta as análises de IA das conversas da semana (conversas_resumos) numa sugestão para a auditoria. Só admin. */
export async function getAuditoriaIASap(clientId: string, semana: string): Promise<SugestaoAuditoria | null> {
  const { data, error } = await db.rpc("sap_auditoria_ia", { p_client_id: clientId, p_semana: semana });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  return (data ?? null) as SugestaoAuditoria | null;
}

// ---------------------------------------------------------------- leads em atenção e atendimento por atendente (IA das conversas)

export type LeadAtencao = { conversa_id: string; motivo: "sem_resposta" | "sem_follow_up" | "recuperavel"; horas_parado: number; interesse: string | null; proximo_passo: string | null; atendente: string | null };
export type AtendenteResumo = { atendente: string; conversas: number; nota_media: number | null; agendou: number; recuperaveis: number; falhas: { falha: string; n: number }[] };

export async function getLeadsAtencaoSap(clientId: string): Promise<LeadAtencao[]> {
  const { data, error } = await db.rpc("sap_leads_atencao", { p_client_id: clientId, p_limite: 30 });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as LeadAtencao[];
}

export async function getAtendentesSap(clientId: string, de: string, ate: string): Promise<AtendenteResumo[]> {
  const { data, error } = await db.rpc("sap_atendimento_por_atendente", { p_client_id: clientId, p_de: de, p_ate: ate });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as AtendenteResumo[];
}

// ---------------------------------------------------------------- tarefas: cronograma como fonte única

export interface PessoaHub { user_id: string; nome: string; email: string; equipe: boolean; client_ids: string[] }

/** Pessoas do Hub para "Quem é quem" (só a equipe vê). */
export async function getPessoasHub(): Promise<PessoaHub[]> {
  const { data, error } = await db.rpc("sap_pessoas_hub");
  if (error) throw error;
  return (data ?? []) as PessoaHub[];
}

export async function salvarPapelSap(clinicaId: string, papel: PapelId, userId: string | null) {
  const { error } = await db.rpc("sap_salvar_papel", { p_clinica_id: clinicaId, p_papel: papel, p_user_id: userId });
  if (error) throw error;
}

export async function marcarTarefaSap(clinicaId: string, marco: number, acao: "feito" | "nao_se_aplica" | "desfazer", v: { data?: string | null; evidencia?: string; motivo?: string; semana?: string | null }) {
  const { error } = await db.rpc("sap_marcar_tarefa", {
    p_clinica_id: clinicaId, p_marco: marco, p_acao: acao, p_data: v.data ?? null, p_evidencia: v.evidencia ?? "", p_motivo: v.motivo ?? "", p_semana: v.semana ?? null,
  });
  if (error) throw new Error(/evidencia obrigatoria/.test(error.message) ? "Cole o link ou o print da evidência." : /motivo obrigatorio/.test(error.message) ? "Escreva o motivo." : error.message);
}

export async function registrarDeteccaoSap(clinicaId: string, detectados: number[], avaliados: number[]) {
  const { error } = await db.rpc("sap_registrar_deteccao", { p_clinica_id: clinicaId, p_detectados: detectados, p_avaliados: avaliados });
  if (error) throw error;
}

const CAMPOS_CLINICA_TAREFAS = "id, client_id, nome, d0, ticket_medio, drive_pasta_url, decisor_nome, coordenador, aceite_metas_em, aceite_metas_por, consulta_paga, status_categoria_meta, categoria_verificada_em, rastreamento_conferido_por, rastreamento_conferido_em, garantia_status, sap_pausas(id, tipo, inicio, fim, motivo, removido_em)";

/** Dados de todas as clínicas que o usuário vê (ou de uma só), no formato da lib de tarefas. A mesma função alimenta
 *  Minhas tarefas, Esta semana, Cronograma, Painel e Todas as clínicas, para os números baterem. */
export async function getEntradasTarefas(clientId?: string, isAdmin = false): Promise<Omit<EntradaTarefas, "hoje">[]> {
  let q = db.from("sap_clinicas").select(CAMPOS_CLINICA_TAREFAS).order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId).limit(1);
  const { data: clinicas, error } = await q;
  if (error) throw error;
  const lista = (clinicas ?? []) as (Record<string, unknown> & { id: string; client_id: string; sap_pausas?: PausaBruta[] })[];
  if (!lista.length) return [];
  const ids = lista.map((c) => c.id);
  const clientIds = lista.map((c) => c.client_id);
  const em = <T,>(r: { data: T[] | null; error: unknown }) => { if (r.error) throw r.error; return r.data ?? []; };
  const [nomesCli, status, rotinas, acessos, testes, plano, acoes, auditorias, fidelizacao, execucao, fontes, papeis, saude, pessoas] = await Promise.all([
    db.from("clients").select("id, name").in("id", clientIds),
    db.from("sap_marco_status").select("clinica_id, marco, concluido_em, evidencia, observacao, estado, atualizado_por, atualizado_em, detectado_em, desfeito_em, desfeito_motivo").in("clinica_id", ids),
    db.from("sap_rotina_semana").select("clinica_id, marco, semana, feito_em, evidencia, feito_por").in("clinica_id", ids),
    db.from("sap_acessos").select("clinica_id, item, status, confirmado_em, confirmado_por, observacao, revogado_em").in("clinica_id", ids),
    db.from("sap_rastreamento_teste").select("clinica_id, item, status, evidencia, feito_em").in("clinica_id", ids),
    db.from("sap_kpi_plano").select("clinica_id, kpi, baseline, origem, meta").in("clinica_id", ids),
    db.from("sap_acoes").select("clinica_id, id, semana, origem, texto, lado, responsavel, prazo, status").in("clinica_id", ids).is("removido_em", null),
    db.from("sap_auditoria_semana").select("clinica_id, semana").in("clinica_id", ids),
    db.from("sap_fidelizacao_semana").select("clinica_id, semana").in("clinica_id", ids),
    db.from("sap_execucao_item").select("clinica_id, item, status, data_cumpriu, evidencia, observacao").in("clinica_id", ids),
    db.rpc("sap_fontes_etapas", { p_client_ids: clientIds }),
    db.rpc("sap_papeis_nomes", { p_clinica_ids: ids }),
    isAdmin ? db.from("sap_saude_semana").select("clinica_id, semana, tarefas_no_prazo, sessoes_marcadas, sessoes_com_decisor, call_grupo, decisor_respondeu, tempo_resposta_h, kpis_verde, kpis_vermelho, sentimento, o_que_aconteceu").in("clinica_id", ids) : Promise.resolve({ data: null, error: null }),
    isAdmin ? db.rpc("sap_pessoas_hub") : Promise.resolve({ data: [], error: null }),
  ]);
  const por = <T extends { clinica_id: string }>(rows: T[], id: string) => rows.filter((r) => r.clinica_id === id);
  const nomeCli = new Map((em(nomesCli) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const fontesPor = new Map((em(fontes) as { client_id: string; tem_crm: boolean; tem_atendimento: boolean; tem_anuncios: boolean; marcos: string[] }[]).map((f) => [f.client_id, f]));
  const papeisRows = em(papeis) as { clinica_id: string; papel: PapelId; user_id: string; nome: string }[];
  const nomes = new Map((em(pessoas) as PessoaHub[]).map((p) => [p.user_id, p.nome]));
  for (const p of papeisRows) nomes.set(p.user_id, p.nome);
  const saudeRows = saude.data === null ? null : (em(saude) as (SemanaSaude & { clinica_id: string })[]);
  return lista.map((c) => {
    const f = fontesPor.get(c.client_id);
    return {
      clinica: {
        id: c.id, clientId: c.client_id, nome: nomeCli.get(c.client_id) ?? String(c.nome ?? "Clínica"),
        d0: (c.d0 as string | null) ?? null, pausas: pausasValidas(c.sap_pausas), ticket: c.ticket_medio ? Number(c.ticket_medio) : null,
        drivePasta: (c.drive_pasta_url as string | null) ?? null, decisor: (c.decisor_nome as string | null) ?? null, coordenador: (c.coordenador as string | null) ?? null,
        aceiteMetasEm: (c.aceite_metas_em as string | null) ?? null, aceiteMetasPor: (c.aceite_metas_por as string | null) ?? null, consultaPaga: c.consulta_paga !== false,
        categoriaMeta: (c.status_categoria_meta as CategoriaMeta | null) ?? null, categoriaVerificadaEm: (c.categoria_verificada_em as string | null) ?? null,
        conferidoPor: (c.rastreamento_conferido_por as string | null) ?? null, conferidoEm: (c.rastreamento_conferido_em as string | null) ?? null,
        garantiaStatus: (c.garantia_status as string | null) ?? null,
      },
      fontes: f ? { crm: f.tem_crm, whatsapp: f.tem_atendimento, anuncios: f.tem_anuncios, marcos: f.marcos ?? [] } : null,
      plano: por(em(plano) as (NonNullable<EntradaTarefas["plano"]>[number] & { clinica_id: string })[], c.id),
      status: por(em(status) as (StatusRegistro & { clinica_id: string })[], c.id),
      rotinas: por(em(rotinas) as (RotinaRegistro & { clinica_id: string })[], c.id),
      acessos: por(em(acessos) as (RegistroAcesso & { clinica_id: string })[], c.id),
      testes: por(em(testes) as (RegistroTeste & { clinica_id: string })[], c.id),
      acoes: por(em(acoes) as (AcaoBruta & { clinica_id: string })[], c.id),
      saude: saudeRows ? por(saudeRows, c.id) : null,
      auditorias: por(em(auditorias) as { clinica_id: string; semana: string }[], c.id).map((a) => a.semana),
      fidelizacao: por(em(fidelizacao) as { clinica_id: string; semana: string }[], c.id).map((a) => a.semana),
      execucao: por(em(execucao) as (ItemRegistro & { clinica_id: string })[], c.id),
      papeis: Object.fromEntries(papeisRows.filter((p) => p.clinica_id === c.id).map((p) => [p.papel, { userId: p.user_id, nome: p.nome }])),
      nomes,
    };
  });
}

/** Sobe um print de evidência (privado) e devolve o valor a guardar no item ("arquivo:<caminho>"). */
export async function enviarEvidenciaSap(clinicaId: string, marco: number, arquivo: File): Promise<string> {
  const ext = (arquivo.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const caminho = `${clinicaId}/${marco}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("sap-evidencias").upload(caminho, arquivo, { upsert: false, contentType: arquivo.type || undefined });
  if (error) throw error;
  return `arquivo:${caminho}`;
}

/** Link temporário (10 min) para abrir um print guardado. */
export async function linkEvidenciaSap(valor: string): Promise<string | null> {
  if (!valor.startsWith("arquivo:")) return valor;
  const { data, error } = await supabase.storage.from("sap-evidencias").createSignedUrl(valor.slice(8), 600);
  if (error) return null;
  return data.signedUrl;
}

export async function getPrefUsuarioSap(): Promise<{ tour_visto_em: string | null; comece_visto_em: string | null } | null> {
  const { data, error } = await db.from("sap_usuario_pref").select("tour_visto_em, comece_visto_em").maybeSingle();
  if (error) return null;
  return (data as { tour_visto_em: string | null; comece_visto_em: string | null } | null) ?? { tour_visto_em: null, comece_visto_em: null };
}

export async function marcarVistoSap(chave: "tour" | "comece" | "tour_reset") {
  const { error } = await db.rpc("sap_marcar_visto", { p_chave: chave });
  if (error) throw error;
}
