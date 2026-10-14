import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export const MARCOS: { dia: number; nome: string }[] = [
  { dia: 3, nome: "Kickoff" },
  { dia: 7, nome: "Acessos críticos e baseline" },
  { dia: 10, nome: "Sessão 1 · Diagnóstico" },
  { dia: 14, nome: "Sessão 2 · Metas assinadas" },
  { dia: 17, nome: "Sessão 3 · Atração" },
  { dia: 21, nome: "Sessão 4 · Conversa" },
  { dia: 29, nome: "Anúncios no ar" },
  { dia: 35, nome: "Sessão 5 · Venda" },
  { dia: 48, nome: "Sessão 6 · Fidelização" },
  { dia: 60, nome: "Checkpoint D60" },
  { dia: 90, nome: "Encerramento D90" },
];

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

export function diaAtual(d0: string | null): number | null {
  if (!d0) return null;
  return Math.floor((Date.now() - Date.parse(`${d0}T12:00:00-03:00`)) / 86400000);
}

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
    dia: diaAtual(d.clinica.d0),
    semana: calcularResumo(recorte(d, j.ini, j.fim), j.ini, j.fim),
    semanaAnterior: calcularResumo(recorte(d, j.iniAnt, j.fimAnt), j.iniAnt, j.fimAnt),
  };
}

// null quando as tabelas sap_* ainda não existem.
export async function getSapPortfolio(): Promise<SapLinhaPortfolio[] | null> {
  const { data: clinicas, error } = await db
    .from("sap_clinicas")
    .select("id, client_id, nome, cidade, especialidade, d0, status")
    .order("d0", { ascending: true });
  if (error) {
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  const lista = (clinicas ?? []) as SapClinica[];
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
  return lista.map((c) =>
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
