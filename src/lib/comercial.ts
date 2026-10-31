// "Onde o funil quebra": leitura do comercial em linguagem simples.
//
// Lógica pura (sem React, sem Supabase) para ser testada com dados reais em
// scripts/test-comercial.ts e reaproveitada pela tela Resultado
// (insightsComerciais). Os números chegam de duas formas:
// - completo: RPC crm_diagnostico_comercial (migração 20261013150000), que já
//   devolve o funil do período, leads parados/sem dono e % com telefone/@;
// - reduzido: sem a RPC, montado com crm_metricas_essenciais +
//   crm_leads_por_etapa + jornada_resumo (só a base inteira, menos sinais).
//
// O funil tem 4 passos, sempre os mesmos:
//   entraram → foram atendidos → agendaram → compraram
// - atendido: o lead saiu da 1ª etapa do CRM ("Contato inicial", "Novo lead"...),
//   ou seja, alguém mexeu nele. Ganho/perdido conta como mexido.
// - agendou: está numa etapa marcada como consulta (na tela "A analisar" ou com
//   o nome "Consulta Agendada") ou foi ganho. Sem etapa marcada, usamos as
//   etapas com "agendado" no nome como estimativa (e dizemos isso).
// - comprou: marcado como ganho no CRM.
//
// Todo problema vira um de três tipos, para a equipe saber quem resolve:
// - performance: o funil funciona mas converte pouco (poucos agendam);
// - operacao: a equipe não dá conta (lead parado, sem dono, resposta lenta);
// - rastreamento: o dado não existe ou está errado (origem vazia, etapas sem
//   significado, ganho/perda não marcados, sem telefone/@ para cruzar).

import { BENCHMARKS, CITACAO_HBR_RESPOSTA, avaliar, type Faixa } from "./benchmarks";
import { fmtFracao } from "@/lib/metricas";
import { agendadosSaoGanhos, avisoAgendadosSaoGanhos, minimoDaBase, passagem, type BaseFunil } from "./funil-taxa";
import { confiancaPorAmostra, type Impacto, type Insight, type Limitacao, type Responsavel, type Tom } from "./insight";

// ---------------------------------------------------------------- regras de etapa
// As mesmas da migração (manter em sincronia).
export const RE_ETAPA_ENTRADA =
  /^\s*\d*\s*[.)-]?\s*(contato inicial|primeiro contato|incoming leads?|leads? de entrada|etapa de leads de entrada|entrada|novos? leads?|leads? novos?|lead|novo|base|base \(n[ãa]o abordado\)|n[ãa]o abordado|unsorted|aguardando atendimento|aguardando contato|sem contato)\s*$/i;
export const RE_PARECE_CONSULTA = /(agendad|agendamento)/i;
export const RE_NAO_E_CONSULTA = /(aguard|n[ãa]o veio|resgate|redequa|reagend)/i;
export const RE_CONSULTA_NOME = /consulta agendada/i;
export const RE_FUNIL_LISTA = /(sem hist[óo]rico|s[óo] avalia|nunca comprou|agendou e n[ãa]o veio|base antiga|reativa)/i;

export const ehEtapaEntrada = (nome: string) => RE_ETAPA_ENTRADA.test(nome);
export const pareceConsulta = (nome: string) => RE_PARECE_CONSULTA.test(nome) && !RE_NAO_E_CONSULTA.test(nome);
export const ehFunilDeLista = (pipeline: string) => RE_FUNIL_LISTA.test(pipeline);

// ---------------------------------------------------------------- tipos de entrada
export interface Contagem {
  leads: number;
  atendidos: number | null;
  naEntrada: number | null;
  naEntrada3d: number | null; // abertos na 1ª etapa há mais de 3 dias
  agendados: number | null; // etapa marcada como consulta ou ganho
  emConsulta: number | null; // só a etapa marcada
  agendadosProvaveis: number | null; // + etapas com "agendado" no nome
  ganhosEmEtapaAgenda: number | null; // ganhos parados numa etapa de agendamento
  pareceConsulta: number | null; // em etapas com "agendado" no nome, não confirmadas
  ganhos: number;
  perdidos: number;
  comOrigem: number | null;
  origemEhFunil: number | null; // origem gravada = nome do funil (não diz nada)
  comContato: number | null; // telefone ou @ do Instagram
  abertos: number;
  abertosSemDono: number | null;
}

export interface Whatsapp {
  conectado: boolean;
  conversas: number | null;
  respondidas: number | null; // conversas com tempo de espera medido (alguém assumiu)
  esperaMedianaSeg: number | null;
}

export interface DadosComerciais {
  origem: "completo" | "reduzido";
  provider: string | null;
  escopo: "periodo" | "base";
  c: Contagem;
  base: Contagem | null; // base inteira (para checagens que precisam de volume)
  listaImportada: number; // leads de listas antigas fora do funil
  etapas: {
    total: number | null;
    consulta: number;
    consultaEquipe: number | null;
    pareceConsulta: number;
  };
  whatsapp: Whatsapp;
  crmCompartilhado: { clientes: number; nomes: string[] } | null;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const n0 = (v: unknown): number => num(v) ?? 0;

function lerContagem(j: Record<string, unknown> | null | undefined): Contagem | null {
  if (!j || num(j.leads) === null) return null;
  return {
    leads: n0(j.leads),
    atendidos: num(j.atendidos),
    naEntrada: num(j.na_entrada),
    naEntrada3d: num(j.na_entrada_3d),
    agendados: num(j.agendados),
    emConsulta: num(j.em_consulta),
    agendadosProvaveis: num(j.agendados_provaveis),
    ganhosEmEtapaAgenda: num(j.ganhos_em_etapa_agenda),
    pareceConsulta: num(j.parece_consulta),
    ganhos: n0(j.ganhos),
    perdidos: n0(j.perdidos),
    comOrigem: num(j.com_origem),
    origemEhFunil: num(j.origem_eh_funil),
    comContato: num(j.com_contato),
    abertos: n0(j.abertos),
    abertosSemDono: j.dono_conhecido === false ? null : num(j.abertos_sem_dono),
  };
}

export interface WtsResumoMin {
  atendimentos?: number | null;
  espera_mediana_seg?: number | null;
  espera_cobertura?: number | null;
}

function lerWhatsapp(conectado: boolean, wts: WtsResumoMin | null | undefined): Whatsapp {
  const conversas = num(wts?.atendimentos);
  return {
    conectado,
    conversas: conectado ? conversas : null,
    respondidas: conectado ? num(wts?.espera_cobertura) : null,
    esperaMedianaSeg: conectado ? num(wts?.espera_mediana_seg) : null,
  };
}

/** Período com menos leads que isso não sustenta leitura: cai para a base inteira. */
export const MIN_LEADS_PERIODO = 20;

/** Lê o JSON da RPC crm_diagnostico_comercial. */
export function lerDiagnosticoRpc(
  j: Record<string, any>,
  extra: { whatsappConectado: boolean; wts?: WtsResumoMin | null },
): DadosComerciais {
  const periodo = lerContagem(j.periodo);
  const base = lerContagem(j.base);
  const usarPeriodo = !!periodo && periodo.leads >= MIN_LEADS_PERIODO;
  const c = (usarPeriodo ? periodo : base) ?? vazio();
  const comp = j.crm_compartilhado;
  return {
    origem: "completo",
    provider: j.provider ?? null,
    escopo: usarPeriodo ? "periodo" : "base",
    c,
    base,
    listaImportada: usarPeriodo ? n0(j.lista_importada_periodo) : n0(j.lista_importada),
    etapas: {
      total: num(j.etapas_total),
      consulta: n0(j.etapas_consulta),
      consultaEquipe: num(j.etapas_consulta_equipe),
      pareceConsulta: n0(j.etapas_parece_consulta),
    },
    whatsapp: lerWhatsapp(extra.whatsappConectado, extra.wts),
    crmCompartilhado:
      comp && n0(comp.clientes) > 0
        ? {
            clientes: n0(comp.clientes),
            nomes: Array.isArray(comp.nomes) ? comp.nomes.filter(Boolean) : [],
          }
        : null,
  };
}

function vazio(): Contagem {
  return {
    leads: 0,
    atendidos: null,
    naEntrada: null,
    naEntrada3d: null,
    agendados: null,
    emConsulta: null,
    agendadosProvaveis: null,
    ganhosEmEtapaAgenda: null,
    pareceConsulta: null,
    ganhos: 0,
    perdidos: 0,
    comOrigem: null,
    origemEhFunil: null,
    comContato: null,
    abertos: 0,
    abertosSemDono: null,
  };
}

export interface MetricasEssenciais {
  total_leads: number;
  consultas_agendadas: number;
  ganhos: number;
  perdidos: number;
  fonte_preenchida_pct: number | null;
}

/** Sem a RPC: monta a leitura com o que o front já consegue ler (base inteira). */
export function montarDadosReduzidos(args: {
  provider: string | null;
  metricas: MetricasEssenciais | null;
  etapas: { pipeline: string; etapa: string; total: number }[];
  jornada?: { leads_total: number; leads_sem_pessoa: number } | null;
  whatsappConectado: boolean;
  wts?: WtsResumoMin | null;
}): DadosComerciais {
  const m = args.metricas;
  const etapas = args.etapas.map((e) => ({ ...e, total: n0(e.total) }));
  const lista = etapas.filter((e) => ehFunilDeLista(e.pipeline)).reduce((s, e) => s + e.total, 0);
  const vivas = etapas.filter((e) => !ehFunilDeLista(e.pipeline));
  const totalLeads = n0(m?.total_leads);
  const leads = Math.max(0, totalLeads - lista);
  const naEntrada = vivas.filter((e) => ehEtapaEntrada(e.etapa)).reduce((s, e) => s + e.total, 0);
  const consultasNome = vivas.filter((e) => RE_CONSULTA_NOME.test(e.etapa));
  const emConsulta = n0(m?.consultas_agendadas);
  const parece = vivas.filter((e) => !RE_CONSULTA_NOME.test(e.etapa) && pareceConsulta(e.etapa));
  const ganhos = n0(m?.ganhos);
  const perdidos = n0(m?.perdidos);
  const fontePct = num(m?.fonte_preenchida_pct);
  const comOrigemBruto = fontePct === null ? null : Math.round((fontePct / 100) * totalLeads);
  // O Clint grava o nome do funil como origem: preenchido, mas não diz de onde veio.
  const origemEhFunil = args.provider === "clint" ? comOrigemBruto : 0;
  const comOrigem = args.provider === "clint" ? 0 : comOrigemBruto;
  const j = args.jornada;
  const comContato = j && j.leads_total > 0 ? Math.round(((j.leads_total - j.leads_sem_pessoa) / j.leads_total) * leads) : null;
  const pareceTotal = parece.reduce((s, e) => s + e.total, 0);
  const c: Contagem = {
    leads,
    atendidos: etapas.length ? Math.max(0, leads - naEntrada) : null,
    naEntrada: etapas.length ? naEntrada : null,
    naEntrada3d: null,
    agendados: emConsulta + ganhos,
    emConsulta,
    agendadosProvaveis: emConsulta + ganhos + pareceTotal,
    ganhosEmEtapaAgenda: null,
    pareceConsulta: pareceTotal,
    ganhos,
    perdidos,
    comOrigem,
    origemEhFunil,
    comContato,
    abertos: Math.max(0, leads - ganhos - perdidos),
    abertosSemDono: null,
  };
  return {
    origem: "reduzido",
    provider: args.provider,
    escopo: "base",
    c,
    base: c,
    listaImportada: lista,
    etapas: {
      total: etapas.length || null,
      consulta: consultasNome.length || (emConsulta > 0 ? 1 : 0),
      consultaEquipe: null,
      pareceConsulta: parece.length,
    },
    whatsapp: lerWhatsapp(args.whatsappConectado, args.wts),
    crmCompartilhado: null,
  };
}

// ---------------------------------------------------------------- funil
export type TipoProblema = "performance" | "operacao" | "rastreamento";
export const ROTULO_TIPO: Record<TipoProblema, { titulo: string; explica: string }> = {
  performance: {
    titulo: "Problema de performance",
    explica: "O caminho funciona, mas pouca gente avança. Mexer na oferta, na conversa ou no público.",
  },
  operacao: {
    titulo: "Problema de operação",
    explica: "A equipe não está dando conta: lead esperando resposta, sem dono ou parado.",
  },
  rastreamento: {
    titulo: "Problema de rastreamento",
    explica: "O dado não existe ou está errado, então o painel não consegue medir.",
  },
};

export type IdPasso = "entraram" | "atendidos" | "agendaram" | "compraram";

export interface PassoFunil {
  id: IdPasso;
  rotulo: string;
  explica: string; // o que conta neste passo, numa frase
  valor: number | null;
  pctDoAnterior: number | null; // 0..1, só com a base no mínimo (LIMITES.funil)
  fracaoDoAnterior: { n: number; m: number } | null; // "N de M" quando a base é pequena demais para %
  anterior: string | null; // rótulo do passo usado como base do % (pula passo sem número)
  deCada: string | null; // "de cada 10 que entraram, 4 agendaram"
  faixa: Faixa | null; // só com referência de mercado confiável
  estimado: boolean; // valor aproximado (etapa não confirmada)
  aviso?: string; // por que o número não está aqui ou não é confiável
  confiavel: boolean;
}

export interface Funil {
  passos: PassoFunil[];
  maiorPerda: {
    de: IdPasso;
    para: IdPasso;
    perdidos: number;
    pct: number;
    tipo: TipoProblema;
  } | null;
  escopoTexto: string;
}

const pct = (a: number, b: number) => (b > 0 ? a / b : 0);
export const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtPct = (r: number) => fmtFracao(r);

/** "de cada 10 que entraram, 4 agendaram" — usa 100 quando dá menos de 1 em 10. */
export function deCadaFrase(valor: number, base: number, verboBase: string, verbo: [string, string]): string | null {
  if (base <= 0) return null;
  const r = valor / base;
  const v = (n: number) => (n === 1 ? verbo[0] : verbo[1]);
  const de10 = Math.round(r * 10);
  if (de10 >= 1 || r === 0) return `de cada 10 que ${verboBase}, ${de10} ${v(de10)}`;
  const de100 = Math.round(r * 100);
  if (de100 >= 1) return `de cada 100 que ${verboBase}, ${de100} ${v(de100)}`;
  return `menos de 1 em cada 100 que ${verboBase} ${verbo[0]}`;
}

/** "de cada 10, só 3 passam" (ou "de cada 100" quando passa menos de 1 em 10). */
export function passamFrase(pctPerdido: number): string {
  const r = 1 - pctPerdido;
  const de10 = Math.round(r * 10);
  if (de10 >= 1) return `de cada 10, só ${de10} ${de10 === 1 ? "passa" : "passam"}`;
  const de100 = Math.round(r * 100);
  if (de100 >= 1) return `de cada 100, só ${de100} ${de100 === 1 ? "passa" : "passam"}`;
  return "quase ninguém passa";
}

/** O ganho está marcando agendamento (não compra) quando quase todo ganho fica numa etapa de agendamento. */
export function ganhoEhAgendamento(c: Contagem): boolean {
  return c.ganhos >= 5 && c.ganhosEmEtapaAgenda !== null && c.ganhosEmEtapaAgenda / c.ganhos >= 0.8;
}

/** Ganho pouco registrado: muita consulta e quase nenhum ganho. */
export function ganhoPoucoRegistrado(c: Contagem): boolean {
  const consultas = c.emConsulta ?? 0;
  return consultas >= 20 && c.ganhos < consultas * 0.1;
}

/**
 * Há etapa de consulta confirmada E ela é de fato usada. Se a etapa marcada está
 * quase vazia e as etapas "agendado/agendamento" não confirmadas têm muito mais
 * gente, a equipe agenda em outra etapa: aí o número confirmado engana.
 */
export function agendamentoConfirmado(d: DadosComerciais): boolean {
  if (d.etapas.consulta === 0) return false;
  const b = d.base ?? d.c;
  const parece = b.pareceConsulta ?? 0;
  return !(parece >= 20 && parece > 5 * (b.emConsulta ?? 0));
}

/** Unidade de cada passo quando ele é a base da passagem seguinte (mínimos em LIMITES.funil). */
const BASE_DO_PASSO: Record<IdPasso, BaseFunil> = { entraram: "leads", atendidos: "leads", agendaram: "agendamentos", compraram: "consultas" };

export function montarFunil(d: DadosComerciais): Funil {
  const c = d.c;
  const entraram = c.leads;
  const temEtapa = agendamentoConfirmado(d);
  let agendados: number | null = null;
  let agEstimado = false;
  let agAviso: string | undefined;
  if (temEtapa) {
    agendados = c.agendados;
  } else if ((c.agendadosProvaveis ?? 0) > c.ganhos && d.etapas.pareceConsulta > 0) {
    agendados = c.agendadosProvaveis;
    agEstimado = true;
    agAviso =
      d.etapas.consulta > 0
        ? `Estimativa: a etapa marcada como consulta quase não é usada; contamos também as ${d.etapas.pareceConsulta} etapa(s) com "agendado/agendamento" no nome.`
        : `Estimativa: nenhuma etapa do CRM foi confirmada como "consulta agendada"; contamos as ${d.etapas.pareceConsulta} etapa(s) com "agendado/agendamento" no nome.`;
  } else {
    agAviso = 'Nenhuma etapa do CRM está marcada como "consulta agendada", então não dá para contar quem agendou.';
  }
  // Agendados que são só os ganhos não medem agendamento (a passagem daria 100% de agendou para comprou).
  if (agendadosSaoGanhos(agendados, c.ganhos)) {
    agAviso = avisoAgendadosSaoGanhos(agendados!, c.ganhos);
    agendados = null;
    agEstimado = false;
  }

  let compraram: number | null = c.ganhos;
  let coAviso: string | undefined;
  let coConfiavel = true;
  if (ganhoEhAgendamento(c)) {
    compraram = null;
    coAviso = `O CRM marca como "ganho" quem agendou (${fmtN(c.ganhosEmEtapaAgenda ?? 0)} de ${fmtN(c.ganhos)} ganhos estão numa etapa de agendamento), não quem fechou.`;
  } else if (c.ganhos === 0 && c.perdidos === 0) {
    compraram = null;
    coAviso = "Ninguém foi marcado como ganho nem perdido no CRM.";
  } else if (ganhoPoucoRegistrado(d.base ?? c)) {
    coConfiavel = false;
    const b = d.base ?? c;
    coAviso = `Quase nenhuma venda é marcada como ganha (${fmtN(b.ganhos)} ganhos para ${fmtN(b.emConsulta ?? 0)} consultas na base). O número real deve ser maior.`;
  }

  const atendidos = c.atendidos;
  const brutos: Omit<PassoFunil, "pctDoAnterior" | "fracaoDoAnterior" | "anterior" | "deCada" | "faixa">[] = [
    {
      id: "entraram",
      rotulo: "Entraram",
      explica: "Leads novos no CRM.",
      valor: entraram,
      estimado: false,
      confiavel: true,
    },
    {
      id: "atendidos",
      rotulo: "Foram atendidos",
      explica: "Saíram da primeira etapa do CRM — alguém conversou ou mexeu no lead.",
      valor: atendidos,
      estimado: false,
      confiavel: atendidos !== null,
      aviso: atendidos === null ? "Não deu para identificar a primeira etapa do funil." : undefined,
    },
    {
      id: "agendaram",
      rotulo: "Agendaram",
      explica: "Estão numa etapa de consulta agendada, ou já fecharam.",
      valor: agendados,
      estimado: agEstimado,
      confiavel: agendados !== null && !agEstimado,
      aviso: agAviso,
    },
    {
      id: "compraram",
      rotulo: "Compraram",
      explica: "Marcados como ganho (venda fechada) no CRM.",
      valor: compraram,
      estimado: false,
      confiavel: compraram !== null && coConfiavel,
      aviso: coAviso,
    },
  ];
  const verbos: Record<IdPasso, [string, string]> = {
    entraram: ["entrou", "entraram"],
    atendidos: ["foi atendido", "foram atendidos"],
    agendaram: ["agendou", "agendaram"],
    compraram: ["comprou", "compraram"],
  };
  let anterior: number | null = null;
  let anteriorId: IdPasso | null = null;
  let anteriorRotulo: string | null = null;
  const passos: PassoFunil[] = brutos.map((p, i) => {
    const pas = i > 0 && anteriorId ? passagem(p.valor, anterior, BASE_DO_PASSO[anteriorId]) : { taxa: null, fracao: null };
    const pctDoAnterior = pas.taxa === null ? null : Math.min(1, pas.taxa);
    const fracaoDoAnterior = pas.fracao;
    // "De cada 10 que entraram" também é taxa: só com o mínimo de leads.
    const deCada = i > 0 && p.valor !== null && entraram >= minimoDaBase("leads") ? deCadaFrase(p.valor, entraram, "entraram", verbos[p.id]) : null;
    let faixa: Faixa | null = null;
    if (p.id === "agendaram" && p.valor !== null && p.confiavel && entraram >= minimoDaBase("leads"))
      faixa = avaliar(BENCHMARKS.leadParaAgendamento, pct(p.valor, entraram));
    const base = pctDoAnterior !== null || fracaoDoAnterior !== null ? anteriorRotulo : null;
    if (p.valor !== null) {
      anterior = p.valor;
      anteriorId = p.id;
      anteriorRotulo = p.rotulo.toLowerCase();
    }
    return { ...p, pctDoAnterior, fracaoDoAnterior, anterior: base, deCada, faixa };
  });

  // Maior perda: a passagem (entre passos com número confiável) onde mais gente fica pelo caminho.
  const tipoPassagem: Record<IdPasso, TipoProblema> = {
    entraram: "operacao",
    atendidos: "operacao",
    agendaram: "performance",
    compraram: "performance",
  };
  let maiorPerda: Funil["maiorPerda"] = null;
  for (let i = 1; i < passos.length; i++) {
    const a = passos[i - 1];
    const b = passos[i];
    if (a.valor === null || b.valor === null || !a.confiavel || !b.confiavel || a.valor < minimoDaBase(BASE_DO_PASSO[a.id])) continue;
    const perdidos = Math.max(0, a.valor - b.valor);
    if (perdidos === 0) continue;
    const p = perdidos / a.valor;
    if (!maiorPerda || p > maiorPerda.pct)
      maiorPerda = {
        de: a.id,
        para: b.id,
        perdidos,
        pct: p,
        tipo: tipoPassagem[b.id],
      };
  }

  return {
    passos,
    maiorPerda,
    escopoTexto: d.escopo === "periodo" ? "leads que entraram no período" : "toda a base do CRM",
  };
}

// ---------------------------------------------------------------- checklist de dados
export type StatusItem = "feito" | "parcial" | "falta" | "sem_dado";

export interface ItemChecklist {
  id: "whatsapp" | "origem" | "etapas" | "resultado" | "contato";
  titulo: string;
  status: StatusItem;
  pct: number | null; // 0..1 quando é medido em % dos leads
  detalhe: string; // o que está acontecendo, com o número
  semIsso: string; // a conclusão que fica impossível
  resolve: Responsavel;
  comoResolver: string;
  rota?: string;
}

function statusPorPct(p: number | null, feito: number): StatusItem {
  if (p === null) return "sem_dado";
  if (p >= feito) return "feito";
  if (p > 0) return "parcial";
  return "falta";
}

export function checklistDados(d: DadosComerciais): ItemChecklist[] {
  const c = d.base ?? d.c;
  const L = c.leads;
  const itens: ItemChecklist[] = [];

  // 1) WhatsApp
  const w = d.whatsapp;
  itens.push({
    id: "whatsapp",
    titulo: "Conectar o WhatsApp",
    status: w.conectado ? ((w.conversas ?? 0) > 0 ? "feito" : "parcial") : "falta",
    pct: null,
    detalhe: !w.conectado
      ? "O WhatsApp do atendimento não está ligado ao painel."
      : (w.conversas ?? 0) > 0
        ? `Ligado: ${fmtN(w.conversas ?? 0)} conversa(s) no período.`
        : "Ligado, mas nenhuma conversa chegou no período.",
    semIsso: "Sem isso, não dá para medir quanto tempo a equipe leva para responder nem quantas conversas viram lead.",
    resolve: "equipe_hub",
    comoResolver: "Ligar a conta do WTS/Digisac do atendimento no cadastro do cliente.",
  });

  // 2) Origem do lead
  const pOrig = c.comOrigem === null || L === 0 ? null : pct(c.comOrigem, L);
  const pFunil = c.origemEhFunil === null || L === 0 ? 0 : pct(c.origemEhFunil, L);
  let stOrig = statusPorPct(pOrig, 0.9);
  if (stOrig === "falta" && pFunil >= 0.5) stOrig = "parcial";
  itens.push({
    id: "origem",
    titulo: "Preencher a origem do lead",
    status: stOrig,
    pct: pOrig,
    detalhe:
      pOrig === null
        ? "Não deu para medir."
        : pFunil >= 0.5
          ? `O CRM grava o nome do funil como origem em ${fmtPct(pFunil)} dos leads — isso não diz se veio de anúncio, Instagram ou indicação. Origem de verdade: ${fmtPct(pOrig)}.`
          : `${fmtPct(1 - pOrig)} dos leads estão sem origem (${fmtN(L - (c.comOrigem ?? 0))} de ${fmtN(L)}).`,
    semIsso: "Sem isso, não dá para saber quais anúncios ou posts trazem paciente que agenda e compra — só quais trazem mensagem.",
    resolve: "atendimento",
    comoResolver:
      'Deixar o campo "Origem do lead" obrigatório no CRM e preencher no primeiro contato (anúncio, Instagram, indicação, Google).',
  });

  // 3) Etapas padronizadas
  const e = d.etapas;
  const etapaUsada = agendamentoConfirmado(d);
  const stEtapas: StatusItem = etapaUsada ? "feito" : e.consulta > 0 || e.pareceConsulta > 0 ? "parcial" : e.total ? "falta" : "sem_dado";
  itens.push({
    id: "etapas",
    titulo: "Padronizar as etapas do CRM",
    status: stEtapas,
    pct: null,
    detalhe: etapaUsada
      ? `${e.consulta} etapa(s) contam como consulta agendada${e.consultaEquipe ? ` (${e.consultaEquipe} confirmada(s) pela equipe)` : " (pelo nome)"}.`
      : e.consulta > 0
        ? `A etapa marcada como consulta quase não é usada (${fmtN(c.emConsulta ?? 0)} leads), enquanto ${fmtN(c.pareceConsulta ?? 0)} estão em etapas com "agendado/agendamento" no nome ainda não confirmadas.`
        : e.pareceConsulta > 0
          ? `${e.pareceConsulta} etapa(s) têm "agendado" no nome, mas ninguém confirmou se é consulta marcada.`
          : "Nenhuma etapa diz o que significa “consulta agendada”.",
    semIsso: "Sem isso, não dá para contar quantos leads agendaram — o passo mais importante do funil.",
    resolve: "equipe_hub",
    comoResolver: 'Na tela "A analisar", marcar quais etapas são "consulta agendada" e "em atendimento".',
    rota: "/$clientId/analisar",
  });

  // 4) Ganho/perda
  const decididos = c.ganhos + c.perdidos;
  const pRes = L > 0 ? pct(decididos, L) : null;
  let stRes: StatusItem = decididos === 0 ? (L > 0 ? "falta" : "sem_dado") : pRes !== null && pRes >= 0.3 ? "feito" : "parcial";
  let detRes = `${fmtN(decididos)} de ${fmtN(L)} leads (${pRes === null ? "—" : fmtPct(pRes)}) têm ganho ou perda marcado: ${fmtN(c.ganhos)} ganhos, ${fmtN(c.perdidos)} perdidos.`;
  if (ganhoEhAgendamento(c)) {
    stRes = "parcial";
    detRes += " Mas o “ganho” está sendo usado para quem agendou, não para quem fechou.";
  } else if (ganhoPoucoRegistrado(c)) {
    stRes = "parcial";
    detRes += ` Quase nenhuma venda é marcada como ganha (${fmtN(c.ganhos)} para ${fmtN(c.emConsulta ?? 0)} consultas).`;
  }
  itens.push({
    id: "resultado",
    titulo: "Registrar ganho e perda",
    status: stRes,
    pct: pRes,
    detalhe: detRes,
    semIsso: "Sem isso, não dá para dizer quantos pacientes fecharam, quanto cada canal rendeu em dinheiro nem por que se perde lead.",
    resolve: "comercial",
    comoResolver:
      "Ao fechar, mover para “ganho” com o valor; ao desistir, “perdido” com o motivo. Revisar toda sexta os leads abertos há mais de 30 dias.",
  });

  // 5) Telefone ou Instagram
  const pCont = c.comContato === null || L === 0 ? null : pct(c.comContato, L);
  const stCont = statusPorPct(pCont, 0.8);
  const syncKommoSemTel = d.provider === "kommo" && pCont === 0;
  itens.push({
    id: "contato",
    titulo: "Salvar telefone ou Instagram",
    status: stCont,
    pct: pCont,
    detalhe:
      pCont === null
        ? "Não deu para medir."
        : syncKommoSemTel
          ? "Nenhum lead chegou com telefone: a sincronização do Kommo ainda não traz o contato."
          : `${fmtPct(pCont)} dos leads têm telefone ou @ do Instagram.`,
    semIsso: "Sem isso, não dá para ligar o lead à conversa do WhatsApp nem ao comentário no post — a Jornada fica cega.",
    resolve: syncKommoSemTel ? "equipe_hub" : "atendimento",
    comoResolver: syncKommoSemTel
      ? "Incluir o telefone do contato na sincronização do Kommo."
      : "Salvar sempre o telefone com DDD (e o @ quando vier do Instagram) ao criar o lead.",
  });

  return itens;
}

// ---------------------------------------------------------------- insights
const ID = (tipo: TipoProblema, nome: string) => `comercial:${tipo}:${nome}`;

/** Tipo de problema de um insight comercial (pelo id). */
export function tipoProblema(i: Insight): TipoProblema | null {
  const m = /^comercial:(performance|operacao|rastreamento):/.exec(i.id);
  return m ? (m[1] as TipoProblema) : null;
}

function fmtTempo(seg: number): string {
  if (seg < 60) return `${Math.round(seg)} segundos`;
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  const h = seg / 3600;
  return h < 10 ? `${h.toFixed(1).replace(".", ",")} h` : `${Math.round(h)} h`;
}

const TOM_FAIXA: Record<Faixa, Tom> = {
  bom: "bom",
  ok: "atencao",
  fraco: "ruim",
};

const ROTULO_PASSO: Record<IdPasso, string> = {
  entraram: "entrar",
  atendidos: "ser atendido",
  agendaram: "agendar",
  compraram: "comprar",
};

export function insightsComerciais(d: DadosComerciais): Insight[] {
  const out: Insight[] = [];
  const c = d.c;
  if (c.leads === 0) return out;
  const f = montarFunil(d);
  const escopo = d.escopo === "periodo" ? "no período" : "na base toda";
  const passo = (id: IdPasso) => f.passos.find((p) => p.id === id)!;

  // --- performance: lead → agendamento contra o mercado
  const ag = passo("agendaram");
  if (ag.valor !== null && ag.confiavel && c.leads >= 30) {
    const taxa = pct(ag.valor, c.leads);
    const faixa = ag.faixa;
    const tom: Tom = faixa ? TOM_FAIXA[faixa] : "atencao";
    out.push({
      id: ID("performance", "agendamento"),
      area: "comercial",
      tom,
      titulo: `${ag.deCada ? ag.deCada.charAt(0).toUpperCase() + ag.deCada.slice(1) : ""} (${fmtPct(taxa)})`,
      diagnostico:
        faixa === "fraco"
          ? "Bem abaixo do que clínicas costumam conseguir (perto de 4 em cada 10). O lead chega, mas a conversa não vira consulta."
          : faixa === "ok"
            ? "Na média do mercado (clínicas agendam perto de 4 em cada 10 leads). Há espaço para subir."
            : "Acima do que clínicas costumam conseguir (perto de 4 em cada 10). Manter o roteiro de atendimento.",
      evidencia: `${fmtN(ag.valor)} agendaram de ${fmtN(c.leads)} leads ${escopo}. Referência: ${BENCHMARKS.leadParaAgendamento.referencia} (${BENCHMARKS.leadParaAgendamento.fonte}).`,
      confianca: confiancaPorAmostra(c.leads, 30),
      motivoConfianca: `${fmtN(c.leads)} leads ${escopo}; etapa de consulta ${d.etapas.consultaEquipe ? "confirmada pela equipe" : "reconhecida pelo nome"}.`,
      impacto: "alto",
      impactoTexto:
        faixa === "fraco"
          ? `chegar a 2 em cada 10 = ≈ ${fmtN(Math.max(0, c.leads * 0.2 - ag.valor))} consultas a mais com os mesmos leads`
          : undefined,
      acao:
        faixa === "bom"
          ? {
              texto: "Registrar o roteiro de atendimento que está funcionando e usar com quem entrar na equipe.",
            }
          : {
              texto:
                "Ler 10 conversas de quem foi atendido e não agendou, anotar o motivo (preço, horário, só curiosidade) e ajustar a resposta padrão para o motivo mais comum.",
            },
      responsavel: "comercial",
      risco: d.etapas.consultaEquipe
        ? undefined
        : "A etapa de consulta foi reconhecida pelo nome; se a equipe usar outra etapa para agendamento, o número muda.",
    });
  }

  // --- maior perda do funil
  const mp = f.maiorPerda;
  const jaFalouDeAgendamento = out.some((i) => i.id === ID("performance", "agendamento"));
  if (mp && mp.pct >= 0.3 && !(mp.para === "agendaram" && jaFalouDeAgendamento)) {
    const de = passo(mp.de);
    const para = passo(mp.para);
    const acoes: Record<IdPasso, string> = {
      entraram: "",
      atendidos: `Responder hoje os ${fmtN(c.naEntrada ?? mp.perdidos)} leads que ainda estão na primeira etapa do CRM e combinar a regra: todo lead novo recebe resposta no mesmo dia.`,
      agendaram:
        "Separar 10 conversas de quem foi atendido e não agendou, anotar o motivo e oferecer dois horários concretos já na primeira resposta.",
      compraram: "Ligar para quem agendou e não fechou nos últimos 30 dias e registrar no CRM o motivo (preço, faltou, vai pensar).",
    };
    out.push({
      id: ID(mp.tipo, `maior-perda-${mp.para}`),
      area: "comercial",
      tom: mp.pct >= 0.7 ? "ruim" : "atencao",
      titulo: `O funil quebra entre ${de.rotulo.toLowerCase()} e ${para.rotulo.toLowerCase()}: ${passamFrase(mp.pct)}`,
      diagnostico:
        mp.tipo === "operacao"
          ? "A maior perda acontece antes de alguém conversar com o lead. É problema de operação: falta gente ou rotina para responder."
          : mp.para === "agendaram"
            ? "As pessoas são atendidas, mas não marcam consulta. É problema de performance: a conversa, a oferta ou o público não estão convencendo."
            : "As pessoas agendam, mas não fecham. Pode ser preço, falta na consulta ou falta de retorno depois da consulta.",
      evidencia: `${fmtN(de.valor ?? 0)} ${de.rotulo.toLowerCase()} → ${fmtN(para.valor ?? 0)} ${para.rotulo.toLowerCase()} (${fmtN(mp.perdidos)} ficaram pelo caminho, ${fmtPct(mp.pct)}) ${escopo}.`,
      confianca: confiancaPorAmostra(de.valor ?? 0, 30),
      motivoConfianca: `${fmtN(de.valor ?? 0)} leads na etapa anterior.`,
      impacto: "alto",
      acao: { texto: acoes[mp.para] },
      responsavel: mp.tipo === "operacao" ? "atendimento" : "comercial",
      risco:
        mp.para === "atendidos"
          ? "“Atendido” = saiu da primeira etapa do CRM. Se a equipe conversa mas não move o card, o número real é melhor."
          : undefined,
    });
  }

  // --- operação: leads parados na primeira etapa
  if (c.naEntrada3d !== null && c.naEntrada3d >= 5 && pct(c.naEntrada3d, c.leads) >= 0.1) {
    const p = pct(c.naEntrada3d, c.leads);
    out.push({
      id: ID("operacao", "parados"),
      area: "comercial",
      tom: p >= 0.3 ? "ruim" : "atencao",
      titulo: `${fmtN(c.naEntrada3d)} leads estão parados na primeira etapa há mais de 3 dias`,
      diagnostico: `Lead que espera dias pode esfriar. ${CITACAO_HBR_RESPOSTA}`,
      evidencia: `${fmtN(c.naEntrada3d)} de ${fmtN(c.leads)} leads ${escopo} (${fmtPct(p)}) continuam na etapa inicial do CRM, criados há mais de 3 dias.`,
      confianca: "media",
      motivoConfianca: "Conta pela etapa do CRM; se a equipe conversa sem mover o card, parte deles já foi atendida.",
      impacto: p >= 0.3 ? "alto" : "medio",
      acao: {
        texto: `Abrir o CRM na primeira etapa, ordenar pelos mais antigos e responder os ${fmtN(c.naEntrada3d)} leads parados. Marcar como perdido só quem disser que não tem mais interesse.`,
      },
      responsavel: "atendimento",
    });
  }

  // --- operação: leads abertos sem responsável
  if (c.abertosSemDono !== null && c.abertosSemDono >= 5 && pct(c.abertosSemDono, c.abertos) >= 0.1) {
    const p = pct(c.abertosSemDono, c.abertos);
    out.push({
      id: ID("operacao", "sem-dono"),
      area: "comercial",
      tom: p >= 0.3 ? "ruim" : "atencao",
      titulo: `${fmtN(c.abertosSemDono)} leads em aberto não têm ninguém responsável`,
      diagnostico: "Lead sem dono não recebe follow-up: cada um acha que o outro vai responder.",
      evidencia: `${fmtN(c.abertosSemDono)} de ${fmtN(c.abertos)} leads em aberto ${escopo} (${fmtPct(p)}) estão sem responsável no CRM.`,
      confianca: confiancaPorAmostra(c.abertos, 20),
      impacto: p >= 0.3 ? "alto" : "medio",
      acao: {
        texto: `Filtrar no CRM os leads "sem responsável" e distribuir os ${fmtN(c.abertosSemDono)} entre as pessoas do atendimento.`,
      },
      responsavel: "comercial",
    });
  }

  // --- operação: tempo até a 1ª resposta no WhatsApp
  const w = d.whatsapp;
  if (w.conectado && w.esperaMedianaSeg !== null && (w.respondidas ?? 0) >= 10) {
    const faixa = avaliar(BENCHMARKS.primeiraResposta, w.esperaMedianaSeg);
    if (faixa) {
      out.push({
        id: ID("operacao", "primeira-resposta"),
        area: "comercial",
        tom: TOM_FAIXA[faixa],
        titulo: `No WhatsApp, o paciente espera em geral ${fmtTempo(w.esperaMedianaSeg)} pela primeira resposta`,
        diagnostico:
          faixa === "bom"
            ? "Resposta rápida, dentro do que o paciente espera (até 5 minutos)."
            : `63% dos brasileiros esperam resposta em até 5 minutos (Opinion Box). ${CITACAO_HBR_RESPOSTA}`,
        evidencia: `Tempo típico (metade espera menos, metade mais) em ${fmtN(w.respondidas ?? 0)} conversas atendidas no período. Referência: ${BENCHMARKS.primeiraResposta.referencia}.`,
        confianca: confiancaPorAmostra(w.respondidas ?? 0, 20),
        impacto: faixa === "fraco" ? "alto" : "medio",
        acao:
          faixa === "bom"
            ? {
                texto: "Manter a escala de quem responde o WhatsApp, inclusive no horário de almoço.",
              }
            : {
                texto:
                  "Definir uma pessoa de plantão no WhatsApp em cada turno e ligar a mensagem automática de boas-vindas com a pergunta de triagem.",
              },
        responsavel: "atendimento",
      });
    }
  }
  if (w.conectado && (w.conversas ?? 0) >= 20 && w.respondidas !== null) {
    const p = pct(w.respondidas, w.conversas ?? 0);
    if (p < 0.7) {
      out.push({
        id: ID("operacao", "conversas-sem-resposta"),
        area: "comercial",
        tom: p < 0.5 ? "ruim" : "atencao",
        titulo: `${fmtN((w.conversas ?? 0) - w.respondidas)} conversas do WhatsApp ficaram sem ninguém assumir`,
        diagnostico: "Parte das conversas que chegam não tem registro de alguém da equipe assumindo.",
        evidencia: `${fmtN(w.respondidas)} de ${fmtN(w.conversas ?? 0)} conversas (${fmtPct(p)}) tiveram alguém assumindo no período.`,
        confianca: confiancaPorAmostra(w.conversas ?? 0, 20),
        impacto: "medio",
        acao: {
          texto: "Abrir as conversas em espera no WTS e revisar a fila do departamento sem atendente.",
        },
        responsavel: "atendimento",
        risco: "Conversas encerradas por robô ou transferidas podem aparecer sem tempo de espera.",
      });
    }
  }

  // --- rastreamento: um insight por item do checklist que não está feito
  const impactoItem: Record<ItemChecklist["id"], Impacto> = {
    whatsapp: "medio",
    origem: "alto",
    etapas: "alto",
    resultado: "alto",
    contato: "medio",
  };
  for (const it of checklistDados(d)) {
    if (it.status === "feito" || it.status === "sem_dado") continue;
    out.push({
      id: ID("rastreamento", it.id),
      area: "comercial",
      tom: it.status === "falta" ? "ruim" : "atencao",
      titulo: `${it.titulo}: ${it.status === "falta" ? "falta" : "incompleto"}`,
      diagnostico: it.semIsso,
      evidencia: it.detalhe,
      confianca: "alta",
      impacto: impactoItem[it.id],
      acao: {
        texto: it.comoResolver,
        rota: it.rota,
        botao: it.rota ? "Marcar as etapas do CRM" : undefined,
      },
      responsavel: it.resolve,
    });
  }

  // --- rastreamento: mesmo CRM de outro cliente
  if (d.crmCompartilhado && d.crmCompartilhado.clientes > 0) {
    const nomes = d.crmCompartilhado.nomes.length ? ` (${d.crmCompartilhado.nomes.join(", ")})` : "";
    out.push({
      id: ID("rastreamento", "crm-compartilhado"),
      area: "comercial",
      tom: "ruim",
      titulo: `Este CRM é a mesma conta de outro(s) ${d.crmCompartilhado.clientes} cliente(s)`,
      diagnostico:
        "Os leads, agendamentos e vendas daqui são os mesmos que aparecem para os outros clientes ligados à mesma conta. Os números não são só deste médico.",
      evidencia: `Mesma conta de CRM ligada a ${d.crmCompartilhado.clientes} outro(s) cliente(s)${nomes}.`,
      confianca: "alta",
      impacto: "alto",
      acao: {
        texto: "Separar os leads de cada médico no CRM (um funil ou etiqueta por médico) e filtrar a sincronização por esse funil.",
      },
      responsavel: "equipe_hub",
      risco: "Até separar, não compare este cliente com os outros da mesma conta: os números são idênticos.",
    });
  }

  return out;
}

// ---------------------------------------------------------------- limitações
export function limitacoesComerciais(d: DadosComerciais): Limitacao[] {
  const out: Limitacao[] = [];
  if (d.origem === "reduzido") {
    out.push({
      id: "comercial-leitura-reduzida",
      area: "comercial",
      texto:
        "Leitura reduzida: o funil usa a base inteira (não só o período) e ainda não mostra leads parados, leads sem dono nem o aviso de CRM compartilhado.",
      resolve: "equipe_hub",
      comoResolver: "Aplicar a migração crm_diagnostico_comercial no banco.",
    });
  }
  if (d.escopo === "base" && d.origem === "completo") {
    out.push({
      id: "comercial-periodo-curto",
      area: "comercial",
      texto: `Entraram menos de ${MIN_LEADS_PERIODO} leads no período escolhido; o funil mostra a base inteira do CRM.`,
      resolve: "equipe_hub",
      comoResolver: "Escolher um período maior no topo da tela.",
    });
  }
  if (d.listaImportada > 0) {
    out.push({
      id: "comercial-lista-importada",
      area: "comercial",
      texto: `${fmtN(d.listaImportada)} leads de listas importadas (pacientes antigos ou importação em massa) ficaram fora do funil, para não parecer que entraram agora.`,
      resolve: "equipe_hub",
    });
  }
  out.push({
    id: "comercial-no-show",
    area: "comercial",
    texto: "O agendamento sozinho não confirma o comparecimento. A análise de faltas (no-show) depende do registro de quem compareceu ou faltou no CRM.",
    resolve: "atendimento",
    comoResolver: 'Usar as etapas de comparecimento e falta ("No-show" ou "Faltou") e atualizar cada agendamento após a data marcada.',
  });
  return out;
}

/** Tudo de uma vez, para as telas. */
export function lerComercial(d: DadosComerciais) {
  const insights = insightsComerciais(d);
  return {
    funil: montarFunil(d),
    checklist: checklistDados(d),
    insights,
    porTipo: {
      performance: insights.filter((i) => tipoProblema(i) === "performance"),
      operacao: insights.filter((i) => tipoProblema(i) === "operacao"),
      rastreamento: insights.filter((i) => tipoProblema(i) === "rastreamento"),
    } as Record<TipoProblema, Insight[]>,
    limitacoes: limitacoesComerciais(d),
  };
}
