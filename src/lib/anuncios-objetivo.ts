// Diagnóstico de anúncios que respeita o objetivo da campanha.
//
// O diagnóstico antigo (RPC ads_diagnostico, migração 20260908223000) julgava
// TODA campanha pelo custo por conversa de WhatsApp, contra a mediana da conta
// inteira. Campanha de tráfego, alcance ou post impulsionado saía "Sem tração"
// por definição e entrava no "desperdício" — e era a maior parte da verba
// (LINK_CLICKS concentra o gasto de quase todos os clientes).
//
// Aqui o veredito oficial continua sendo um dos SEIS do diagnóstico original
// (Escalar, Cortar, Atrai mas não converte, Sem tração, Manter, Volume
// insuficiente), com os mesmos limites (0,6x e 2x da campanha típica; volume
// mínimo de 500 aparições e R$ 30). O que mudou: cada campanha é medida pelo
// resultado do objetivo dela e comparada só com campanhas do MESMO objetivo.
// Quando o objetivo tem menos de 3 campanhas com volume (ou o resultado dele
// não chega aqui), a campanha volta para a régua original: conversa, comparada
// com a conta toda — e isso fica escrito na tela ("Comparada com a conta").
//
// Sinais extras viram SELOS ao lado do veredito, não vereditos: "Criativo
// cansando", "Atenção caindo", "Revisar público", "Resultado não medido",
// "Comparada com a conta".
//
// Comparar objetivos diferentes só é feito numa leitura à parte e explícita:
// "quanto custa uma conversa vinda de cada objetivo".
//
// Em cima do diagnóstico, este arquivo monta a "central de decisão de verba":
// confiança, risco de mexer, ação sugerida, e até 3 ações de verba com valores
// ("Se eu tivesse que agir hoje").
//
// Lógica pura: recebe as linhas diárias de meta_ads_daily + o cadastro das
// campanhas e devolve o diagnóstico. Testável com `npx tsx`.
import { median } from "@/lib/report-metrics";
import { BENCHMARKS } from "@/lib/benchmarks";
import { confiancaPorAmostra, type Confianca, type Impacto, type Insight, type Limitacao, type Tom } from "@/lib/insight";
import { fmtFracao } from "@/lib/metricas";
import { avaliarRastreio, type Rastreio } from "@/lib/rastreio-anuncios";

export type Grupo = "mensagem" | "lead" | "trafego" | "engajamento" | "alcance" | "venda" | "outro";

export const GRUPOS: Record<Grupo, { nome: string; curto: string; resultado: string; resultadoPlural: string; porMil?: boolean; explica: string; paraQue: string }> = {
  mensagem: {
    nome: "Mensagens (WhatsApp/Direct)",
    curto: "mensagem",
    resultado: "conversa",
    resultadoPlural: "conversas",
    explica: "Otimizada para a pessoa abrir uma conversa. Resultado: conversa iniciada.",
    paraQue: "Serve para o paciente chamar no WhatsApp ou no Direct. É o objetivo mais perto da consulta.",
  },
  lead: {
    nome: "Cadastro (leads)",
    curto: "cadastro",
    resultado: "lead",
    resultadoPlural: "leads",
    explica: "Otimizada para a pessoa deixar o contato. Resultado: lead.",
    paraQue: "Serve para o paciente deixar nome e telefone num formulário, para a equipe ligar depois.",
  },
  trafego: {
    nome: "Tráfego (cliques)",
    curto: "tráfego",
    resultado: "clique no link",
    resultadoPlural: "cliques no link",
    explica: "Otimizada para clique no link (perfil, site ou WhatsApp). Resultado: clique no link.",
    paraQue: "Serve para levar gente ao perfil ou ao site. Faz o médico ser conhecido, mas pouca gente chama direto.",
  },
  engajamento: {
    nome: "Engajamento",
    curto: "engajamento",
    resultado: "mil aparições",
    resultadoPlural: "mil aparições",
    porMil: true,
    explica: "Otimizada para curtida, comentário e visualização. A régua é o custo a cada mil vezes que o anúncio aparece.",
    paraQue: "Serve para o post circular e ganhar curtidas e comentários. Não é feito para trazer paciente direto.",
  },
  alcance: {
    nome: "Reconhecimento (alcance)",
    curto: "reconhecimento",
    resultado: "mil aparições",
    resultadoPlural: "mil aparições",
    porMil: true,
    explica: "Otimizada para aparecer para mais gente. A régua é o custo a cada mil vezes que o anúncio aparece.",
    paraQue: "Serve para aparecer para o maior número de pessoas da região, pelo menor preço.",
  },
  venda: {
    nome: "Vendas",
    curto: "vendas",
    resultado: "visita à página",
    resultadoPlural: "visitas à página",
    explica: "Otimizada para compra. A compra não é registrada aqui; a régua provisória é a visita à página.",
    paraQue: "Serve para vender no site (ex.: agendamento pago). A compra em si não chega a este painel.",
  },
  outro: { nome: "Outros objetivos", curto: "outros", resultado: "—", resultadoPlural: "—", explica: "Objetivo sem régua definida.", paraQue: "Objetivo sem régua definida neste painel." },
};

// Tráfego que manda para o WhatsApp: quando 10+ conversas e pelo menos 10 de
// cada 100 cliques viram conversa, o destino do clique é o WhatsApp e a régua
// certa é a conversa, não o clique (ex.: "[TRÁFEGO] [NOVO WHATS]").
export const TRAFEGO_WHATS_MIN_CONVERSAS = 10;
export const TRAFEGO_WHATS_CONVERSAS_POR_CLIQUE = 0.1;

export function grupoDoObjetivo(objetivo: string | null | undefined, conversas: number, cliquesLink = 0): Grupo {
  const o = (objetivo ?? "").toUpperCase();
  if (o === "MESSAGES") return "mensagem";
  // No modelo novo da Meta, campanha de mensagem pode subir como Engajamento com
  // destino WhatsApp/Direct. Sem o destino do conjunto, o sinal é ter conversas.
  if (o === "OUTCOME_ENGAGEMENT") return conversas >= 3 ? "mensagem" : "engajamento";
  if (["POST_ENGAGEMENT", "VIDEO_VIEWS", "PAGE_LIKES", "EVENT_RESPONSES"].includes(o)) return "engajamento";
  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(o)) return "lead";
  if (["LINK_CLICKS", "OUTCOME_TRAFFIC"].includes(o)) {
    if (conversas >= TRAFEGO_WHATS_MIN_CONVERSAS && cliquesLink > 0 && conversas / cliquesLink >= TRAFEGO_WHATS_CONVERSAS_POR_CLIQUE) return "mensagem";
    return "trafego";
  }
  if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(o)) return "alcance";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"].includes(o)) return "venda";
  return "outro";
}

// ---------------------------------------------------------------- vereditos

/** Veredito oficial: os seis rótulos do diagnóstico original. */
export type Veredito = "Escalar" | "Cortar" | "Atrai mas não converte" | "Sem tração" | "Manter" | "Volume insuficiente";
// A ordem importa: "Escalar" primeiro porque é a única linha que pede uma ação
// de crescimento; "Cortar" logo depois porque é dinheiro saindo agora.
export const ORDEM_VEREDITO: Veredito[] = ["Escalar", "Cortar", "Atrai mas não converte", "Sem tração", "Manter", "Volume insuficiente"];
export const EXPLICA_VEREDITO: Record<Veredito, string> = {
  Escalar: "Entrega o resultado por 60% ou menos do custo da campanha típica (do mesmo objetivo; ou da conta, quando há poucas campanhas do objetivo). É onde cabe mais verba.",
  Cortar: "Custa 2x ou mais a campanha típica (do mesmo objetivo; ou da conta). A Meta considera 2x o sinal de anúncio esgotado.",
  "Atrai mas não converte": "Não trouxe nenhum resultado do objetivo, mas as pessoas clicam tanto ou mais que o típico: o anúncio prende, o problema está na oferta, no público ou no destino do clique.",
  "Sem tração": "Não trouxe nenhum resultado do objetivo e pouca gente clica: nem atrai nem converte.",
  Manter: "Custo dentro da faixa normal (entre 0,6x e 2x a campanha típica). Deixar rodar.",
  "Volume insuficiente": "Rodou pouco para julgar (menos de 500 aparições ou menos de R$ 30 no período).",
};

/**
 * Veredito "técnico" usado fora da tela de Anúncios (Resumo, Leitura do
 * período, relatório). É derivado do oficial: "Escalar", "Cortar", "Manter" e
 * "Volume insuficiente" são os mesmos; "Atrai mas não converte" e "Sem tração"
 * viram "Sem resultado", salvo quando o resultado do objetivo não é medido
 * aqui ("Não medido") ou quando a campanha foi julgada pela conversa da conta
 * mas entregou o resultado do próprio objetivo ("Sem comparação").
 */
export type VereditoTecnico = "Escalar" | "Manter" | "Cortar" | "Sem resultado" | "Não medido" | "Sem comparação" | "Volume insuficiente";

/** Selos ao lado do veredito: sinais extras, que não mudam o veredito. */
export type SeloCampanha = "Criativo cansando" | "Atenção caindo" | "Revisar público" | "Resultado não medido" | "Comparada com a conta";
export const ORDEM_SELOS: SeloCampanha[] = ["Criativo cansando", "Atenção caindo", "Revisar público", "Resultado não medido", "Comparada com a conta"];
export const EXPLICA_SELO: Record<SeloCampanha, string> = {
  "Criativo cansando": "De cada 100 vezes que o anúncio aparecia, menos gente clica no link na 2ª metade do período do que na 1ª: queda de 20% ou mais. Hora de trocar a arte.",
  "Atenção caindo": "Já custa entre 1x e 2x a campanha típica e os cliques por aparição caíram 10% ou mais da 1ª para a 2ª metade do período.",
  "Revisar público": "As pessoas clicam tanto ou mais que o típico, mas o clique não vira resultado (ou custa 2x ou mais): revisar público e para onde o clique leva.",
  "Resultado não medido": "Campanha de cadastro ou venda com visitas à página (ou cliques), mas sem o resultado registrado aqui: falta o pixel/evento no site.",
  "Comparada com a conta": "Comparada com a conta toda: poucas campanhas deste objetivo (menos de 3 com volume) ou resultado não medido. Vale a régua original: custo por conversa contra a campanha típica da conta.",
};

export interface LinhaAds {
  date: string;
  campaign_id: string;
  spend: number | null;
  impressions: number | null;
  link_clicks: number | null;
  conversations: number | null;
  leads: number | null;
  landing_page_views: number | null;
  reach?: number | null; // alcance do DIA (a Meta não soma pessoas únicas entre dias)
  clicks?: number | null; // todos os cliques (perfil, curtida, link…)
}
export interface CampanhaCadastro {
  campaign_id: string;
  name: string | null;
  objective: string | null;
  permalink?: string | null;
  thumbnail_url?: string | null;
}

export type NivelRisco = "baixo" | "medio" | "alto";

export interface CampanhaDiag {
  campaign_id: string;
  campanha: string;
  objetivo: string | null; // objetivo bruto da Meta (LINK_CLICKS, OUTCOME_ENGAGEMENT…)
  grupo: Grupo;
  permalink: string | null;
  thumbnail_url: string | null;
  gasto: number;
  impressoes: number;
  cliquesLink: number;
  conversas: number;
  leads: number;
  visitasPagina: number;
  diasAtivos: number; // dias com gasto > 0
  gastoDiario: number | null; // gasto ÷ dias ativos (aproxima o orçamento diário)
  resultados: number; // na unidade do grupo (em engajamento/alcance: mil impressões)
  custoPorResultado: number | null;
  custoPorConversa: number | null; // gasto ÷ conversas da própria campanha
  ctrLink: number | null; // fração: cliques no link ÷ impressões
  ctrLink1: number | null; // 1ª metade do período
  ctrLink2: number | null; // 2ª metade
  // Indicadores do criativo (só leitura, não mudam o veredito):
  cpm: number | null; // custo por mil aparições
  cpcLink: number | null; // custo por clique no link
  ctrTodos: number | null; // todos os cliques ÷ aparições
  frequenciaDia: number | null; // aparições ÷ alcance diário somado = vezes que a mesma pessoa viu, em média, por dia
  frequencia7d: number | null; // mesma conta nos últimos 7 dias do período (fadiga recente)
  alcanceDiarioSomado: number; // soma do alcance de cada dia (repete pessoas entre dias)
  conversaPorClique: number | null; // conversas ÷ cliques no link (o clique vira conversa?)
  custoPorVisita: number | null; // gasto ÷ visitas à página
  cansando: boolean; // cliques por impressão caíram 20%+ da 1ª para a 2ª metade
  atencaoCaindo: boolean; // caíram 10%+
  /** Veredito oficial (os seis do diagnóstico original). É o que a tela mostra. */
  vereditoOficial: Veredito;
  /** Derivado do oficial, para Resumo/Leitura/relatório. Ver `VereditoTecnico`. */
  veredito: VereditoTecnico;
  selos: SeloCampanha[];
  /** "objetivo": comparada com as do mesmo objetivo; "conta": régua original (conversa, conta toda); null: não julgada (volume). */
  julgadaPor: "objetivo" | "conta" | null;
  resultadoNaRegua: number; // resultados (objetivo) ou conversas (conta)
  custoNaRegua: number | null; // custo por resultado (objetivo) ou por conversa (conta)
  regua: number | null; // custo da campanha típica usada (objetivo ou conta)
  vezesRegua: number | null; // custoNaRegua ÷ regua
  ctrReferencia: number | null; // atenção típica usada para "Atrai mas não converte"
  atencaoBoa: boolean;
  /** Veredito pela regra original (conversa, conta toda), para comparar na metodologia. */
  vereditoContaToda: Veredito;
  comparacao: string; // "a campanha típica de mensagem custa R$ X por conversa; esta custa 1,8x isso"
  motivo: string;
  notas: string[]; // explicação de cada selo, com os números
  acao: string;
  confianca: Confianca;
  motivoConfianca: string;
  risco: { nivel: NivelRisco; texto: string };
}

export interface GrupoResumo {
  grupo: Grupo;
  campanhas: number;
  campanhasComVolume: number; // as que entram na régua do objetivo
  objetivosBrutos: string[]; // nomes da Meta que caíram neste grupo
  gasto: number;
  resultados: number;
  custoPorResultado: number | null;
  medianaCusto: number | null; // régua usada no veredito (campanha típica); null = objetivo julgado pela conta
  conversas: number;
  custoPorConversa: number | null; // visão de negócio, comparável entre objetivos
  ctrReferencia: number | null; // cliques por impressão da campanha típica do grupo
}

export interface ReguaConta {
  custoPorConversa: number | null; // mediana do custo por conversa (campanhas com 500+ aparições), como o SQL original
  ctrLink: number | null; // mediana dos cliques no link por aparição (500+ aparições)
  campanhas: number; // quantas campanhas entraram no custo por conversa
  custoPorConversaTelaAntiga: number | null; // o número que a tela antiga exibia: mediana "de cima" de todas as campanhas com conversa
}

export interface DiagnosticoAds {
  campanhas: CampanhaDiag[];
  grupos: GrupoResumo[];
  gasto: number;
  impressoes: number;
  cliquesLink: number;
  conversas: number; // de todas as campanhas
  leads: number;
  visitasPagina: number;
  /** Cortar + Sem resultado (veredito técnico): "Verba que não entregou" do Resumo. */
  desperdicio: number;
  /** Atrai mas não converte + Sem tração (veredito oficial): o alerta original da tela Anúncios. */
  desperdicioSemResultado: number;
  conversasMensagem: number;
  custoPorConversaMensagem: number | null; // só campanhas de mensagem
  gastoMensagem: number; // gasto das campanhas de mensagem (numerador do custo acima)
  reguaConta: ReguaConta;
  /** Confiabilidade do rastreio de conversas (aplicarRastreio). Suspeito = nada de custo por conversa nem "não converte". */
  rastreio?: Rastreio;
}

/**
 * Checagem de confiabilidade ANTES de qualquer conclusão sobre conversas. Com rastreio suspeito, devolve uma
 * cópia sem custo por conversa, sem "verba que não entregou" e sem comparação de conversa entre objetivos: assim
 * nenhuma tela, relatório ou PDF tira conclusão de conversão mal rastreada. Os números brutos (gasto, cliques,
 * conversas atribuídas) continuam, para o alerta citar.
 */
export function aplicarRastreio(d: DiagnosticoAds, atendimentosWhatsapp: number | null | undefined): DiagnosticoAds {
  const rastreio = avaliarRastreio({ cliquesLink: d.cliquesLink, conversas: d.conversas, atendimentosWhatsapp });
  if (!rastreio.suspeito) return { ...d, rastreio };
  return {
    ...d,
    rastreio,
    desperdicio: 0,
    desperdicioSemResultado: 0,
    custoPorConversaMensagem: null,
    grupos: d.grupos.map((g) => ({ ...g, custoPorConversa: null })),
    reguaConta: { ...d.reguaConta, custoPorConversa: null, custoPorConversaTelaAntiga: null },
  };
}

function insightRastreio(d: DiagnosticoAds): Insight {
  return {
    id: "anuncios-rastreio-suspeito",
    area: "anuncios",
    tom: "atencao",
    titulo: "Provável problema de rastreio das conversas dos anúncios",
    diagnostico: d.rastreio?.mensagem ?? "",
    evidencia: `${int(d.cliquesLink)} cliques no link, ${int(d.conversas)} conversas atribuídas pela Meta no período.`,
    confianca: "media",
    motivoConfianca: "Conta de cliques e conversas no período; o WhatsApp entra quando está ligado.",
    impacto: "alto",
    acao: { texto: "Conferir o objetivo de cada campanha (tráfego não conta conversa) e colocar código de rastreio no link do WhatsApp. Não pausar campanha por custo por conversa até isso estar resolvido." },
    responsavel: "gestor_trafego",
    risco: "Pausar campanha boa porque a conversa dela não está sendo contada.",
  };
}

// Limites do diagnóstico original (ads_diagnostico).
export const MIN_IMPRESSOES = 500;
export const MIN_GASTO = 30;
export const MIN_CAMPANHAS_REGUA = 3;
export const ESCALAR = 0.6; // custo ≤ 60% da campanha típica
export const CORTAR = 2; // custo ≥ 2x a típica: a mesma régua de fadiga da Meta
// Fadiga: cada metade do período precisa de 1000+ aparições para comparar.
export const MIN_IMPRESSOES_METADE = 1000;
// Abaixo disso a taxa de cliques da campanha é mostrada, mas com aviso de amostra pequena.
export const MIN_IMPRESSOES_TAXA = 1000;
export const QUEDA_CTR = 0.8; // fadiga: cliques por impressão caem 20%+
export const QUEDA_ATENCAO = 0.9; // atenção caindo: 10%+ (usado com custo 1–2x)
export const PASSO_ORCAMENTO = 0.2; // a Meta reinicia o aprendizado com mudança > 20%
// Volume mínimo de resultados para confiança média (alta = 3x isso).
export const MIN_RESULTADOS: Record<Grupo, number> = { mensagem: 10, lead: 10, trafego: 100, engajamento: 10, alcance: 10, venda: 30, outro: 10 };
// Referência de mercado de atenção em tráfego, quando não há 3 campanhas para comparar.
export const CTR_TRAFEGO_MERCADO = 0.008;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const redondo = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v));
const x1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => fmtFracao(v);
const curtoNome = (s: string) => (s.length > 48 ? s.slice(0, 47) + "…" : s);
export const aspas = (s: string) => `“${curtoNome(s)}”`;

/** "de cada 100 vezes que o anúncio apareceu, 2,1 viraram clique no link" */
export function porCem(ctr: number | null): string {
  if (ctr == null) return "—";
  return `${(ctr * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} de cada 100`;
}
export function unidade(g: Grupo, v: number): string {
  const G = GRUPOS[g];
  return G.porMil ? `${brl(v)} a cada mil vezes que aparece` : `${brl(v)} por ${G.resultado}`;
}
/** Unidade da régua com que a campanha foi julgada (objetivo ou conversa da conta). */
export function unidadeNaRegua(c: Pick<CampanhaDiag, "grupo" | "julgadaPor">, v: number): string {
  return c.julgadaPor === "conta" ? `${brl(v)} por conversa` : unidade(c.grupo, v);
}

/** Regra original (ads_diagnostico), aplicada à conta toda e pela conversa. */
function vereditoPelaConta(c: { impressoes: number; gasto: number; conversas: number; custoPorConversa: number | null; ctrLink: number | null }, r: ReguaConta): Veredito {
  if (c.impressoes < MIN_IMPRESSOES || c.gasto < MIN_GASTO) return "Volume insuficiente";
  if (c.conversas === 0) return r.ctrLink != null && c.ctrLink != null && c.ctrLink >= r.ctrLink ? "Atrai mas não converte" : "Sem tração";
  const med = r.custoPorConversa;
  if (med == null || c.custoPorConversa == null) return "Manter";
  if (c.custoPorConversa <= med * ESCALAR) return "Escalar";
  if (c.custoPorConversa >= med * CORTAR) return "Cortar";
  return "Manter";
}

export function diagnosticarAds(linhas: LinhaAds[], cadastro: CampanhaCadastro[], start: string, end: string): DiagnosticoAds {
  const meio = new Date((new Date(start + "T12:00:00Z").getTime() + new Date(end + "T12:00:00Z").getTime()) / 2).toISOString().slice(0, 10);
  const cad = new Map(cadastro.map((c) => [c.campaign_id, c]));
  type Acc = { g: number; i: number; lc: number; cv: number; ld: number; lpv: number; i1: number; c1: number; i2: number; c2: number; dias: Set<string>; r: number; ck: number; i7: number; r7: number };
  const seteDias = new Date(new Date(end + "T12:00:00Z").getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const acc = new Map<string, Acc>();
  for (const l of linhas) {
    if (l.date < start || l.date > end) continue;
    const a = acc.get(l.campaign_id) ?? { g: 0, i: 0, lc: 0, cv: 0, ld: 0, lpv: 0, i1: 0, c1: 0, i2: 0, c2: 0, dias: new Set<string>(), r: 0, ck: 0, i7: 0, r7: 0 };
    a.r += n(l.reach);
    a.ck += n(l.clicks);
    if (l.date >= seteDias && n(l.reach) > 0) {
      a.i7 += n(l.impressions);
      a.r7 += n(l.reach);
    }
    a.g += n(l.spend);
    a.i += n(l.impressions);
    a.lc += n(l.link_clicks);
    a.cv += n(l.conversations);
    a.ld += n(l.leads);
    a.lpv += n(l.landing_page_views);
    if (n(l.spend) > 0) a.dias.add(l.date);
    if (l.date < meio) {
      a.i1 += n(l.impressions);
      a.c1 += n(l.link_clicks);
    } else {
      a.i2 += n(l.impressions);
      a.c2 += n(l.link_clicks);
    }
    acc.set(l.campaign_id, a);
  }

  type Base = Pick<
    CampanhaDiag,
    | "campaign_id" | "campanha" | "objetivo" | "grupo" | "permalink" | "thumbnail_url" | "gasto" | "impressoes" | "cliquesLink" | "conversas" | "leads"
    | "visitasPagina" | "diasAtivos" | "gastoDiario" | "resultados" | "custoPorResultado" | "custoPorConversa" | "ctrLink" | "ctrLink1" | "ctrLink2"
    | "cansando" | "atencaoCaindo" | "cpm" | "cpcLink" | "ctrTodos" | "frequenciaDia" | "frequencia7d" | "alcanceDiarioSomado" | "conversaPorClique" | "custoPorVisita"
  > & { naoMedido: boolean };
  const base: Base[] = [];
  for (const [id, a] of acc) {
    // Conversões podem ser atribuídas depois da veiculação, sem gasto ou
    // impressões novos no período. Só descartar campanhas sem nenhum sinal.
    if (![a.g, a.i, a.lc, a.cv, a.ld, a.lpv, a.r, a.ck].some((v) => v > 0)) continue;
    const c = cad.get(id);
    const grupo = grupoDoObjetivo(c?.objective, a.cv, a.lc);
    let resultados = 0;
    if (grupo === "mensagem") resultados = a.cv;
    else if (grupo === "lead") resultados = a.ld > 0 ? Math.max(a.ld, a.cv) : a.cv; // lead por formulário ou por conversa, sem somar os dois
    else if (grupo === "trafego") resultados = a.lc;
    else if (grupo === "engajamento" || grupo === "alcance") resultados = a.i / 1000;
    else if (grupo === "venda") resultados = a.lpv;
    const ctr1 = a.i1 >= MIN_IMPRESSOES_METADE ? a.c1 / a.i1 : null;
    const ctr2 = a.i2 >= MIN_IMPRESSOES_METADE ? a.c2 / a.i2 : null;
    // Resultado não medido: cadastro/venda sem o resultado registrado aqui, mas
    // com sinal de que a pessoa chegou ao site. Cadastro com nenhum lead e muitas
    // visitas também: as poucas conversas não são o resultado dessa campanha.
    const naoMedido =
      (grupo === "lead" || grupo === "venda") &&
      ((resultados === 0 && (a.lpv > 0 || a.lc > 0)) || (grupo === "lead" && a.ld === 0 && a.lpv >= 10 && a.lpv > a.cv));
    base.push({
      campaign_id: id,
      campanha: c?.name ?? "(campanha removida)",
      objetivo: c?.objective ?? null,
      grupo,
      permalink: c?.permalink ?? null,
      thumbnail_url: c?.thumbnail_url ?? null,
      gasto: a.g,
      impressoes: a.i,
      cliquesLink: a.lc,
      conversas: a.cv,
      leads: a.ld,
      visitasPagina: a.lpv,
      diasAtivos: a.dias.size,
      gastoDiario: a.dias.size > 0 ? a.g / a.dias.size : null,
      resultados,
      custoPorResultado: resultados > 0 ? a.g / resultados : null,
      custoPorConversa: a.cv > 0 ? a.g / a.cv : null,
      ctrLink: a.i > 0 ? a.lc / a.i : null,
      ctrLink1: ctr1,
      ctrLink2: ctr2,
      cansando: ctr1 != null && ctr2 != null && ctr1 > 0 && ctr2 <= ctr1 * QUEDA_CTR,
      atencaoCaindo: ctr1 != null && ctr2 != null && ctr1 > 0 && ctr2 <= ctr1 * QUEDA_ATENCAO,
      cpm: a.i > 0 ? (a.g / a.i) * 1000 : null,
      cpcLink: a.lc > 0 ? a.g / a.lc : null,
      ctrTodos: a.i > 0 && a.ck > 0 ? a.ck / a.i : null,
      frequenciaDia: a.r > 0 ? a.i / a.r : null,
      frequencia7d: a.r7 > 0 ? a.i7 / a.r7 : null,
      alcanceDiarioSomado: a.r,
      conversaPorClique: a.lc >= 20 ? a.cv / a.lc : null,
      custoPorVisita: a.lpv > 0 ? a.g / a.lpv : null,
      naoMedido,
    });
  }

  // Régua por objetivo: custo da campanha típica (mediana) entre as que têm
  // volume e resultado medido. Também a "atenção típica" do objetivo.
  const comVolume = (c: Base) => c.impressoes >= MIN_IMPRESSOES && c.gasto >= MIN_GASTO;
  const reguas = new Map<Grupo, number | null>();
  const ctrRef = new Map<Grupo, number | null>();
  const volumeCampanhasGrupo = new Map<Grupo, number>();
  for (const g of Object.keys(GRUPOS) as Grupo[]) {
    const doGrupo = base.filter((c) => c.grupo === g && comVolume(c) && !c.naoMedido);
    const custos = doGrupo.filter((c) => c.custoPorResultado != null).map((c) => c.custoPorResultado!);
    volumeCampanhasGrupo.set(g, custos.length);
    reguas.set(g, g !== "outro" && custos.length >= MIN_CAMPANHAS_REGUA ? median(custos) : null);
    const ctrs = doGrupo.filter((c) => c.ctrLink != null).map((c) => c.ctrLink!);
    // Sem 3 campanhas para comparar, tráfego usa a referência de mercado de
    // confiabilidade média (WordStream 2025, médicos ~0,8%). Os outros grupos
    // ficam sem referência de atenção.
    const refMercado = g === "trafego" && (BENCHMARKS.ctrTrafego.confiabilidade as string) !== "baixa" ? CTR_TRAFEGO_MERCADO : null;
    ctrRef.set(g, ctrs.length >= MIN_CAMPANHAS_REGUA ? median(ctrs) : refMercado);
  }

  // Régua da conta toda (a do SQL original): campanhas com 500+ aparições.
  const conta500 = base.filter((c) => c.impressoes >= MIN_IMPRESSOES);
  const cpcConta = conta500.filter((c) => c.custoPorConversa != null).map((c) => c.custoPorConversa!);
  const ctrConta = conta500.filter((c) => c.ctrLink != null).map((c) => c.ctrLink!);
  const todosCustos = base.filter((c) => c.custoPorConversa != null).map((c) => c.custoPorConversa!).sort((a, b) => a - b);
  const reguaConta: ReguaConta = {
    custoPorConversa: cpcConta.length ? median(cpcConta) : null,
    ctrLink: ctrConta.length ? median(ctrConta) : null,
    campanhas: cpcConta.length,
    custoPorConversaTelaAntiga: todosCustos.length ? todosCustos[Math.floor(todosCustos.length / 2)] : null,
  };

  const gastoTotal = base.reduce((s, c) => s + c.gasto, 0);
  const conversasTotal = base.reduce((s, c) => s + c.conversas, 0);
  const topConversa = [...base].sort((a, b) => b.conversas - a.conversas)[0];

  const campanhas: CampanhaDiag[] = base.map(({ naoMedido, ...c }) => {
    const G = GRUPOS[c.grupo];
    const volumeOk = comVolume({ ...c, naoMedido });
    const medObjetivo = reguas.get(c.grupo) ?? null;
    const porObjetivo = c.grupo !== "outro" && !naoMedido && medObjetivo != null;
    const julgadaPor: CampanhaDiag["julgadaPor"] = !volumeOk ? null : porObjetivo ? "objetivo" : "conta";
    // Régua mostrada (também para a campanha com pouco volume): a do objetivo quando existe, senão a da conta.
    const usaObjetivo = julgadaPor === "objetivo" || (julgadaPor == null && porObjetivo);
    const regua = usaObjetivo ? medObjetivo : reguaConta.custoPorConversa;
    const ref = usaObjetivo ? (ctrRef.get(c.grupo) ?? null) : reguaConta.ctrLink;
    const resultadoNaRegua = usaObjetivo ? c.resultados : c.conversas;
    const custoNaRegua = usaObjetivo ? c.custoPorResultado : c.custoPorConversa;
    const vezes = custoNaRegua != null && regua != null && regua > 0 ? custoNaRegua / regua : null;
    const atencaoBoa = ref != null && c.ctrLink != null && c.ctrLink >= ref;
    const un = (v: number) => (usaObjetivo ? unidade(c.grupo, v) : `${brl(v)} por conversa`);
    const resultadoTxt = usaObjetivo ? G.resultado : "conversa";
    const tipicaTxt = usaObjetivo ? `a campanha típica de ${G.curto}` : "a campanha típica da conta";
    const nome = aspas(c.campanha);
    const quedaTxt =
      c.ctrLink1 != null && c.ctrLink2 != null
        ? `no começo do período ${porCem(c.ctrLink1)} vezes que o anúncio apareceu viravam clique; no fim, ${porCem(c.ctrLink2)}`
        : "";

    // ---------- veredito oficial (os seis do diagnóstico original) ----------
    // 1. Volume insuficiente: menos de 500 aparições ou menos de R$ 30.
    // 2. Nenhum resultado (do objetivo; ou nenhuma conversa, se julgada pela conta):
    //      cliques por aparição ≥ o típico → Atrai mas não converte; senão → Sem tração.
    // 3. Custo ≤ 0,6x a típica → Escalar; ≥ 2x → Cortar; resto → Manter.
    let vereditoOficial: Veredito;
    if (!volumeOk) vereditoOficial = "Volume insuficiente";
    else if (resultadoNaRegua === 0) vereditoOficial = atencaoBoa ? "Atrai mas não converte" : "Sem tração";
    else if (vezes == null) vereditoOficial = "Manter";
    else if (vezes <= ESCALAR) vereditoOficial = "Escalar";
    else if (vezes >= CORTAR) vereditoOficial = "Cortar";
    else vereditoOficial = "Manter";
    const vereditoContaToda = vereditoPelaConta(c, reguaConta);

    // ---------- selos ----------
    const selos: SeloCampanha[] = [];
    const notas: string[] = [];
    if (c.cansando) {
      selos.push("Criativo cansando");
      notas.push(`Criativo cansando: ${quedaTxt} (queda de ${pct(1 - c.ctrLink2! / c.ctrLink1!)}).`);
    } else if (c.atencaoCaindo && vezes != null && vezes >= 1 && vezes < CORTAR && volumeOk) {
      selos.push("Atenção caindo");
      notas.push(`Atenção caindo: já custa ${x1(vezes)}x ${tipicaTxt} e ${quedaTxt}.`);
    }
    if (vereditoOficial === "Atrai mas não converte" || (vereditoOficial === "Cortar" && atencaoBoa)) {
      selos.push("Revisar público");
      notas.push(
        `Revisar público: as pessoas clicam (${porCem(c.ctrLink)} aparições viram clique, no nível ou acima do típico${ref != null ? ` de ${porCem(ref)}` : ""}), mas o clique não vira ${resultadoTxt}${vereditoOficial === "Cortar" ? " a um custo normal" : ""}.`,
      );
    }
    if (naoMedido) {
      selos.push("Resultado não medido");
      notas.push(
        `Resultado não medido: o resultado dessa campanha (${G.resultado}) acontece no site e não chega aqui: ${c.visitasPagina > 0 ? `${int(c.visitasPagina)} visitas à página` : `${int(c.cliquesLink)} cliques no link`} por ${brl(c.gasto)}${c.conversas > 0 ? ` (e ${int(c.conversas)} ${c.conversas === 1 ? "conversa" : "conversas"})` : ""}.`,
      );
    }
    if (julgadaPor === "conta") {
      selos.push("Comparada com a conta");
      notas.push(
        naoMedido
          ? "Comparada com a conta toda: como o resultado do objetivo não chega aqui, vale a régua original, pela conversa."
          : c.grupo === "outro"
            ? `Comparada com a conta toda: o objetivo ${c.objetivo ?? "(sem objetivo)"} não tem régua própria; vale a régua original, pela conversa.`
            : `Comparada com a conta toda: poucas campanhas deste objetivo (${volumeCampanhasGrupo.get(c.grupo) ?? 0} de ${G.curto} com volume; o mínimo é ${MIN_CAMPANHAS_REGUA}). Vale a régua original, pela conversa.`,
      );
    }

    // ---------- veredito técnico (Resumo, Leitura do período, relatório) ----------
    let veredito: VereditoTecnico;
    if (vereditoOficial === "Atrai mas não converte" || vereditoOficial === "Sem tração") {
      veredito = naoMedido
        ? "Não medido"
        : julgadaPor === "conta" && c.grupo !== "mensagem" && (c.resultados > 0 || c.grupo === "outro")
          ? "Sem comparação"
          : "Sem resultado";
    } else veredito = vereditoOficial;

    // ---------- comparação com a campanha típica ----------
    const vsTxt = vezes != null ? (vezes >= 1.05 ? `; esta custa ${x1(vezes)}x isso` : vezes <= 0.95 ? `; esta custa ${pct(1 - vezes)} menos` : "; esta está no mesmo nível") : "";
    let comparacao: string;
    if (usaObjetivo) comparacao = `A campanha típica de ${G.curto} custa ${un(medObjetivo!)}${vsTxt}.`;
    else {
      const prefixo = naoMedido
        ? "Comparada com a conta toda: o resultado deste objetivo não chega aqui."
        : c.grupo === "outro"
          ? "Comparada com a conta toda: objetivo sem régua própria."
          : `Comparada com a conta toda: poucas campanhas deste objetivo (menos de ${MIN_CAMPANHAS_REGUA} de ${G.curto} com volume).`;
      comparacao =
        reguaConta.custoPorConversa != null
          ? `${prefixo} A conversa da campanha típica da conta custa ${brl(reguaConta.custoPorConversa)}${vsTxt}.`
          : `${prefixo} Nenhuma campanha da conta trouxe conversa para comparar.`;
    }

    // ---------- motivo ----------
    let motivo: string;
    switch (vereditoOficial) {
      case "Volume insuficiente":
        motivo = `Rodou pouco para julgar (${brl(c.gasto)} e ${int(c.impressoes)} aparições; o mínimo é ${brl(MIN_GASTO)} e ${int(MIN_IMPRESSOES)}).`;
        break;
      case "Atrai mas não converte":
        motivo = `Investiu ${brl(c.gasto)}: o anúncio prende (${porCem(c.ctrLink)} aparições viram clique, no nível ou acima do típico${ref != null ? ` de ${porCem(ref)}` : ""}), mas nenhum clique virou ${resultadoTxt}. O problema está na oferta, no público ou no destino, não na arte.`;
        break;
      case "Sem tração":
        motivo = `Investiu ${brl(c.gasto)} e não gerou nenhum(a) ${resultadoTxt}${usaObjetivo ? ", que é o que esse objetivo promete" : ""}. E pouca gente clica (${porCem(c.ctrLink)} aparições${ref != null ? `, contra ${porCem(ref)} do típico` : ""}): nem atrai nem converte.`;
        if (!usaObjetivo && c.grupo !== "mensagem" && c.resultados > 0 && c.grupo !== "outro")
          motivo += ` Pelo objetivo dela, trouxe ${G.porMil ? `${int(c.impressoes)} aparições` : `${int(c.resultados)} ${c.resultados === 1 ? G.resultado : G.resultadoPlural}`}.`;
        break;
      case "Escalar":
        motivo = `${un(custoNaRegua!)}, ${pct(1 - vezes!)} mais barato que ${tipicaTxt} (${un(regua!)}). É onde cabe mais verba.`;
        break;
      case "Cortar":
        motivo = atencaoBoa
          ? c.grupo === "trafego" && usaObjetivo
            ? `O anúncio chama atenção (${porCem(c.ctrLink)} aparições viram clique, acima do típico), mas aparecer para esse público está caro: ${un(custoNaRegua!)}, ${x1(vezes!)}x o típico.`
            : `As pessoas clicam (${porCem(c.ctrLink)} aparições viram clique, acima do típico), mas o clique não vira ${resultadoTxt} a um custo normal: ${un(custoNaRegua!)}, ${x1(vezes!)}x o típico.`
          : `${un(custoNaRegua!)}, ${x1(vezes!)}x ${tipicaTxt} (${un(regua!)}). A Meta considera 2x o sinal de anúncio esgotado, e aqui nem a atenção ajuda (${porCem(c.ctrLink)} aparições viram clique).`;
        break;
      default:
        motivo = vezes != null ? `${un(custoNaRegua!)}, dentro da faixa normal (típica: ${un(regua!)}).` : `${custoNaRegua != null ? un(custoNaRegua) : "Sem custo para comparar"}.`;
    }

    // ---------- confiança (volume de resultados e de aparições) ----------
    const minimo = usaObjetivo ? MIN_RESULTADOS[c.grupo] : MIN_RESULTADOS.mensagem;
    let confianca: Confianca = c.impressoes < MIN_IMPRESSOES_TAXA ? "baixa" : confiancaPorAmostra(resultadoNaRegua, minimo);
    if (vereditoOficial === "Volume insuficiente" || naoMedido) confianca = "baixa";
    const campanhasNaRegua = usaObjetivo ? (volumeCampanhasGrupo.get(c.grupo) ?? 0) : reguaConta.campanhas;
    // Régua feita com poucas campanhas (3–4) ou régua da conta seguram a confiança em média.
    if (confianca === "alta" && (campanhasNaRegua < 5 || julgadaPor === "conta")) confianca = "media";
    const porMilRegua = usaObjetivo && G.porMil;
    const unidadeRes = usaObjetivo ? G : GRUPOS.mensagem;
    const motivoConfianca = `${porMilRegua ? `${int(c.impressoes)} aparições` : `${int(resultadoNaRegua)} ${resultadoNaRegua === 1 ? unidadeRes.resultado : unidadeRes.resultadoPlural} e ${int(c.impressoes)} aparições`} em ${c.diasAtivos} ${c.diasAtivos === 1 ? "dia" : "dias"} com gasto; régua ${usaObjetivo ? `de ${G.curto}` : "da conta"} feita com ${campanhasNaRegua} campanhas. Confiança alta pede ${minimo * 3}+ ${porMilRegua ? "mil aparições" : unidadeRes.resultadoPlural}.`;

    // ---------- risco de mexer ----------
    const fatiaGasto = gastoTotal > 0 ? c.gasto / gastoTotal : 0;
    const fatiaConv = conversasTotal > 0 ? c.conversas / conversasTotal : 0;
    let risco: CampanhaDiag["risco"];
    if (topConversa && topConversa.campaign_id === c.campaign_id && c.conversas >= 10 && fatiaConv >= 0.2) {
      risco = { nivel: "alto", texto: `Alto: é a campanha que mais traz conversas (${int(c.conversas)} de ${int(conversasTotal)}). Mexa aos poucos, 20% por vez a cada 3–4 dias.` };
    } else if (fatiaGasto >= 0.25) {
      risco = { nivel: "alto", texto: `Alto: concentra ${pct(fatiaGasto)} da verba. Mudar o orçamento em mais de 20% de uma vez faz a Meta reiniciar o aprendizado e o custo sobe por alguns dias.` };
    } else if (fatiaGasto < 0.08) {
      risco = { nivel: "baixo", texto: `Baixo: verba pequena (${pct(fatiaGasto)} do total).` };
    } else {
      risco = { nivel: "medio", texto: `Médio: ${pct(fatiaGasto)} da verba. Mudança de mais de 20% no orçamento reinicia o aprendizado da Meta.` };
    }

    // ---------- ação sugerida ----------
    const dia = c.gastoDiario;
    const criativoNovo = `Subir 2 ou 3 criativos novos em ${nome} sem mexer na verba; quando os novos tiverem 3–4 dias rodando, pausar o antigo.`;
    const revisarPublico =
      c.grupo === "mensagem"
        ? `Revisar o público de ${nome} (idade, região, interesses) e conferir se a mensagem automática do WhatsApp responde na hora. Se o custo não cair em 7 dias, pausar.`
        : `Revisar o público de ${nome} (idade, região, interesses) e para onde o clique leva. Se o custo não cair em 7 dias, pausar.`;
    const outroPapel = julgadaPor === "conta" && c.grupo !== "mensagem" && c.grupo !== "outro" && c.resultados > 0;
    let acao: string;
    if (naoMedido) {
      acao = `Instalar o evento de ${G.resultado} no site (pixel da Meta) para medir ${nome}; até lá, conferir os resultados no Gerenciador de Anúncios.`;
    } else {
      switch (vereditoOficial) {
        case "Escalar":
          acao = c.cansando
            ? `${criativoNovo} Ainda é barata: com o criativo novo rodando, aumentar o orçamento em 20%.`
            : dia
              ? `Aumentar o orçamento de ${nome} em 20% (de ~${brl0(dia)}/dia para ~${brl0(dia * 1.2)}/dia) e repetir em 3–4 dias se o custo se mantiver.`
              : `Aumentar o orçamento de ${nome} em 20%.`;
          break;
        case "Manter":
          acao = c.cansando || selos.includes("Atenção caindo") ? criativoNovo : `Manter ${nome} como está e reavaliar no próximo período.`;
          break;
        case "Atrai mas não converte":
          acao = outroPapel
            ? `Decidir se ${nome} tem outro papel (fazer o médico ser conhecido): trouxe ${G.porMil ? `${int(c.impressoes)} aparições` : `${int(c.resultados)} ${G.resultadoPlural}`}, mas nenhuma conversa. Se a meta é conversa, ${revisarPublico.charAt(0).toLowerCase() + revisarPublico.slice(1)}`
            : revisarPublico;
          break;
        case "Sem tração":
          acao = outroPapel
            ? `Decidir se ${nome} tem outro papel (fazer o médico ser conhecido): trouxe ${G.porMil ? `${int(c.impressoes)} aparições` : `${int(c.resultados)} ${G.resultadoPlural}`}, mas nenhuma conversa. Se a meta é conversa, pausar (${brl0(c.gasto)} no período).`
            : risco.nivel === "alto"
              ? `Reduzir ${nome} em 20% agora (~${brl0(c.gasto * PASSO_ORCAMENTO)} no período) e mais 20% a cada 3–4 dias se continuar sem resultado.`
              : `Pausar ${nome} (${brl0(c.gasto)} no período).`;
          break;
        case "Cortar":
          acao = atencaoBoa
            ? revisarPublico
            : risco.nivel === "alto"
              ? `Reduzir ${nome} em 20% agora (~${brl0(c.gasto * PASSO_ORCAMENTO)} no período) e mais 20% a cada 3–4 dias se o custo não melhorar.`
              : `Pausar ${nome} (${brl0(c.gasto)} no período).`;
          break;
        default:
          acao = `Deixar ${nome} rodar até ${brl(MIN_GASTO)} e ${int(MIN_IMPRESSOES)} aparições antes de decidir.`;
      }
    }

    return {
      ...c,
      vereditoOficial,
      veredito,
      selos,
      julgadaPor,
      resultadoNaRegua,
      custoNaRegua,
      regua,
      vezesRegua: vezes,
      ctrReferencia: ref,
      atencaoBoa,
      vereditoContaToda,
      comparacao,
      motivo,
      notas,
      acao,
      confianca,
      motivoConfianca,
      risco,
    };
  });
  campanhas.sort((a, b) => b.gasto - a.gasto);

  const grupos: GrupoResumo[] = (Object.keys(GRUPOS) as Grupo[])
    .map((g) => {
      const cs = campanhas.filter((c) => c.grupo === g);
      const gasto = cs.reduce((s, c) => s + c.gasto, 0);
      const resultados = cs.reduce((s, c) => s + c.resultados, 0);
      const conversas = cs.reduce((s, c) => s + c.conversas, 0);
      return {
        grupo: g,
        campanhas: cs.length,
        campanhasComVolume: volumeCampanhasGrupo.get(g) ?? 0,
        objetivosBrutos: [...new Set(cs.map((c) => c.objetivo ?? "(sem objetivo)"))].sort(),
        gasto,
        resultados,
        custoPorResultado: resultados > 0 ? gasto / resultados : null,
        medianaCusto: reguas.get(g) ?? null,
        conversas,
        custoPorConversa: conversas > 0 ? gasto / conversas : null,
        ctrReferencia: ctrRef.get(g) ?? null,
      };
    })
    .filter((g) => g.campanhas > 0)
    .sort((a, b) => b.gasto - a.gasto);

  const msg = grupos.find((g) => g.grupo === "mensagem");
  const soma = (f: (c: CampanhaDiag) => boolean) => campanhas.filter(f).reduce((s, c) => s + c.gasto, 0);
  return {
    campanhas,
    grupos,
    gasto: gastoTotal,
    impressoes: campanhas.reduce((s, c) => s + c.impressoes, 0),
    cliquesLink: campanhas.reduce((s, c) => s + c.cliquesLink, 0),
    conversas: conversasTotal,
    leads: campanhas.reduce((s, c) => s + c.leads, 0),
    visitasPagina: campanhas.reduce((s, c) => s + c.visitasPagina, 0),
    desperdicio: soma((c) => c.veredito === "Cortar" || c.veredito === "Sem resultado"),
    desperdicioSemResultado: soma((c) => c.vereditoOficial === "Atrai mas não converte" || c.vereditoOficial === "Sem tração"),
    conversasMensagem: msg?.conversas ?? 0,
    custoPorConversaMensagem: msg?.custoPorConversa ?? null,
    gastoMensagem: msg?.gasto ?? 0,
    reguaConta,
  };
}

// Leitura entre objetivos: de onde a conversa sai mais barata. É a única
// comparação entre objetivos que faz sentido, e é dita como tal.
export function conversaMaisBarata(d: DiagnosticoAds): { barato: GrupoResumo; caro: GrupoResumo; vezes: number | null } | null {
  // A referência barata precisa de volume; o grupo caro só precisa de verba relevante
  // (pode ter trazido quase nenhuma conversa — é justamente o achado).
  const barato = d.grupos
    .filter((g) => g.conversas >= 10 && g.custoPorConversa != null)
    .sort((a, b) => a.custoPorConversa! - b.custoPorConversa!)[0];
  if (!barato) return null;
  const caro = d.grupos
    .filter((g) => g !== barato && g.gasto >= d.gasto * 0.15 && (g.grupo === "trafego" || g.grupo === "engajamento" || g.grupo === "alcance" || g.grupo === "lead"))
    .map((g) => ({ g, custo: g.custoPorConversa ?? Infinity }))
    .sort((a, b) => b.custo - a.custo)[0];
  if (!caro) return null;
  const vezes = Number.isFinite(caro.custo) ? caro.custo / barato.custoPorConversa! : null;
  return vezes == null || vezes >= 1.5 ? { barato, caro: caro.g, vezes } : null;
}

// ======================================================================
// "Se eu tivesse que agir hoje": até 3 ações de verba, com valores.
// ======================================================================
//
// Candidatas (cada uma vira um Insight com ação, evidência, confiança e risco):
//  A. Entre objetivos (conversaMaisBarata): tirar verba das campanhas do
//     objetivo caro que mais gastaram sem trazer conversa e passar para a
//     melhor campanha do objetivo barato. Entra sempre que existir.
//  B. Marcadas "Cortar" (sem o selo "Revisar público") e "Sem tração": pausar
//     (ou reduzir 20%, se o risco de mexer é alto) e passar a verba para a
//     melhor campanha do MESMO objetivo marcada "Escalar" (senão "Manter"). Se
//     a campanha foi comparada com a conta, a receptora é a melhor da conta
//     pela conversa. Fica de fora quem tem "Resultado não medido" e quem foi
//     julgada pela conversa mas entregou o resultado do próprio objetivo.
//  C. Marcadas "Escalar" (sem "Criativo cansando") que não receberam verba em
//     A/B: +20% no orçamento.
//  D. "Atrai mas não converte" e selos "Revisar público", "Criativo cansando"
//     ou "Atenção caindo" com verba relevante (≥ 8% do total): não move
//     dinheiro, mas diz quanto está em jogo.
// Ordem: A primeiro; depois por dinheiro em jogo. Uma campanha não aparece
// como origem duas vezes. Quem recebe verba sobe no máximo o próprio gasto do
// período (e sempre 20% por vez, por causa do aprendizado da Meta).

const ORDEM_CONF: Record<Confianca, number> = { baixa: 0, media: 1, alta: 2 };
const menorConf = (...cs: Confianca[]) => cs.reduce((a, b) => (ORDEM_CONF[b] < ORDEM_CONF[a] ? b : a));
function impactoPorFatia(f: number): Impacto {
  return f >= 0.2 ? "alto" : f >= 0.08 ? "medio" : "baixo";
}

const temSelo = (c: CampanhaDiag, s: SeloCampanha) => c.selos.includes(s);
/** Julgada pela conversa da conta, mas entregou o resultado do próprio objetivo: não é dinheiro perdido. */
const outroPapel = (c: CampanhaDiag) => c.julgadaPor === "conta" && c.grupo !== "mensagem" && c.grupo !== "outro" && c.resultados > 0 && c.conversas === 0;

// Quem recebe verba sobe no máximo o próprio gasto do período, somando todas
// as ações (capacidade). Sem capacidade (< R$ 30), passa para a próxima.
const MIN_CAPACIDADE = 30;
function melhorReceptora(cs: CampanhaDiag[], grupo: Grupo | null, excluir: Set<string>, capacidade: Map<string, number>, porConversa = false): CampanhaDiag | null {
  const custo = (c: CampanhaDiag) => (porConversa ? c.custoPorConversa : c.custoPorResultado) ?? Infinity;
  const ok = cs.filter(
    (c) =>
      (grupo == null || c.grupo === grupo) &&
      !excluir.has(c.campaign_id) &&
      (capacidade.get(c.campaign_id) ?? c.gasto) >= MIN_CAPACIDADE &&
      !temSelo(c, "Criativo cansando") &&
      !temSelo(c, "Resultado não medido") &&
      (c.vereditoOficial === "Escalar" || c.vereditoOficial === "Manter") &&
      // Mesmo objetivo: a receptora precisa ter sido julgada pela mesma régua.
      (porConversa || grupo == null || c.julgadaPor === "objetivo") &&
      Number.isFinite(custo(c)),
  );
  ok.sort((a, b) => (a.vereditoOficial === "Escalar" ? 0 : 1) - (b.vereditoOficial === "Escalar" ? 0 : 1) || custo(a) - custo(b));
  return ok[0] ?? null;
}

// Quem recebe não deve mais que dobrar no período; o que sobra fica guardado.
function restoTxt(liberado: number, movido: number): string {
  const resto = redondo(liberado - movido);
  return resto >= 30 && resto >= liberado * 0.2 ? ` O resto (~${brl0(resto)}) fica guardado até haver outra campanha que renda.` : "";
}

export function planoDeAcao(d: DiagnosticoAds): Insight[] {
  if (d.gasto <= 0) return [];
  if (d.rastreio?.suspeito) return [insightRastreio(d)]; // nenhuma ação de verba com conversão mal rastreada
  type Cand = { valor: number; insight: Insight; origens: string[]; destino?: string; prioridade: number };
  const cands: Cand[] = [];
  const cs = d.campanhas;
  const capacidade = new Map<string, number>();
  const cap = (c: CampanhaDiag) => capacidade.get(c.campaign_id) ?? c.gasto;
  const reservar = (c: CampanhaDiag, v: number) => capacidade.set(c.campaign_id, cap(c) - v);

  // ---------- A. entre objetivos ----------
  const cmp = conversaMaisBarata(d);
  if (cmp) {
    const B = GRUPOS[cmp.barato.grupo];
    const C = GRUPOS[cmp.caro.grupo];
    const destino = melhorReceptora(cs, cmp.barato.grupo, new Set(), capacidade, true);
    const cpcBarato = cmp.barato.custoPorConversa!;
    // Excesso = o que a campanha gastou além do que as conversas dela custariam no objetivo barato.
    const origens = cs
      .filter((c) => c.grupo === cmp.caro.grupo && c.vereditoOficial !== "Escalar" && c.gasto >= MIN_GASTO && c.risco.nivel !== "alto" && c.campaign_id !== destino?.campaign_id)
      .map((c) => ({ c, excesso: c.gasto - c.conversas * cpcBarato }))
      .filter((o) => o.excesso > 0)
      .sort((a, b) => b.excesso - a.excesso)
      .slice(0, 2)
      .map((o) => o.c);
    if (destino && origens.length) {
      // Verba média (≥ 8%) reduz 20%; verba pequena pausa.
      const partes = origens.map((c) => {
        const pausar = c.risco.nivel === "baixo";
        return { c, pausar, valor: pausar ? c.gasto : c.gasto * PASSO_ORCAMENTO };
      });
      const liberado = partes.reduce((s, p) => s + p.valor, 0);
      const movido = redondo(Math.min(liberado, cap(destino)));
      reservar(destino, movido);
      // Estimativa conservadora: a verba extra rende como a média do objetivo
      // barato (não como a melhor campanha, que costuma encarecer ao crescer).
      const perdidas = partes.reduce((s, p) => s + p.c.conversas * (p.valor / p.c.gasto), 0);
      const ganho = movido / Math.max(cpcBarato, destino.custoPorConversa!) - perdidas;
      const txtOrigens = partes.map((p) => (p.pausar ? `pausar ${aspas(p.c.campanha)} (${brl0(p.c.gasto)}, ${int(p.c.conversas)} ${p.c.conversas === 1 ? "conversa" : "conversas"})` : `reduzir ${aspas(p.c.campanha)} em 20% (~${brl0(p.valor)} de ${brl0(p.c.gasto)})`)).join(" e ");
      const vezesTxt = cmp.vezes != null ? `${x1(cmp.vezes)}x mais` : "muito mais (quase nenhuma conversa)";
      cands.push({
        prioridade: 2,
        valor: movido,
        origens: origens.map((c) => c.campaign_id),
        destino: destino.campaign_id,
        insight: {
          id: "anuncios-entre-objetivos",
          area: "anuncios",
          tom: "ruim",
          titulo: `Conversa vinda de campanha de ${C.curto} custa ${vezesTxt} que de campanha de ${B.curto}.`,
          diagnostico: `Campanhas de ${C.curto} receberam ${brl0(cmp.caro.gasto)} (${pct(cmp.caro.gasto / d.gasto)} da verba) e trouxeram ${int(cmp.caro.conversas)} conversas${cmp.caro.custoPorConversa ? ` (${brl(cmp.caro.custoPorConversa)} cada)` : ""}. As de ${B.curto} trouxeram ${int(cmp.barato.conversas)} a ${brl(cpcBarato)} cada. ${C.curto[0].toUpperCase() + C.curto.slice(1)} tem outro papel (fazer o médico ser conhecido), então a ideia não é zerar, e sim tirar das que menos rendem.`,
          evidencia: `${partes.map((p) => `${curtoNome(p.c.campanha)}: ${brl(p.c.gasto)}, ${int(p.c.conversas)} conversas`).join(" · ")} · ${curtoNome(destino.campanha)}: ${brl(destino.gasto)}, ${int(destino.conversas)} conversas (${brl(destino.custoPorConversa!)} cada)`,
          confianca: menorConf(confiancaPorAmostra(destino.conversas, 10), confiancaPorAmostra(cmp.barato.conversas, 10)),
          motivoConfianca: `${int(cmp.barato.conversas)} conversas no objetivo de ${B.curto}; ${int(cmp.caro.conversas)} no de ${C.curto}.`,
          impacto: impactoPorFatia(movido / d.gasto) === "baixo" && ganho >= 10 ? "medio" : impactoPorFatia(Math.max(movido / d.gasto, cmp.caro.gasto / d.gasto / 2)),
          impactoTexto: ganho >= 1 ? `≈ ${int(ganho)} conversas a mais no mesmo período, com a mesma verba (supondo que a verba extra renda como a média das campanhas de ${B.curto}, ${brl(Math.max(cpcBarato, destino.custoPorConversa!))} por conversa).` : undefined,
          acao: { texto: `${txtOrigens[0].toUpperCase() + txtOrigens.slice(1)}, e passar ~${brl0(movido)} para ${aspas(destino.campanha)} (${B.curto}, ${brl(destino.custoPorConversa!)} por conversa, marcada "${destino.vereditoOficial}"), subindo 20% a cada 3–4 dias.${restoTxt(liberado, movido)}` },
          responsavel: "gestor_trafego",
          risco: `${destino.risco.nivel === "alto" ? "A campanha que recebe é a principal fonte de conversas: suba 20% por vez. " : ""}Campanha de ${C.curto} pode trazer paciente que chama depois, sem ser contado como conversa do anúncio.`,
        },
      });
    }
  }

  // ---------- B. "Cortar" e "Sem tração" ----------
  const usadosOrigem = new Set(cands.flatMap((c) => c.origens));
  const cortar = cs
    .filter(
      (c) =>
        ((c.vereditoOficial === "Cortar" && !temSelo(c, "Revisar público")) || c.vereditoOficial === "Sem tração") &&
        !temSelo(c, "Resultado não medido") &&
        !outroPapel(c) &&
        c.gasto >= MIN_GASTO &&
        !usadosOrigem.has(c.campaign_id),
    )
    .sort((a, b) => b.gasto - a.gasto);
  for (const c of cortar) {
    const G = GRUPOS[c.grupo];
    const pelaConta = c.julgadaPor === "conta";
    // Pela conta, a régua é a conversa: a receptora é a melhor da conta pela conversa.
    const destino = pelaConta ? melhorReceptora(cs, null, new Set([c.campaign_id]), capacidade, true) : melhorReceptora(cs, c.grupo, new Set([c.campaign_id]), capacidade);
    const custoDest = (x: CampanhaDiag) => (pelaConta ? x.custoPorConversa : x.custoPorResultado);
    const unD = (v: number) => (pelaConta ? `${brl(v)} por conversa` : unidade(c.grupo, v));
    const resPlural = pelaConta ? "conversas" : G.resultadoPlural;
    const resSing = pelaConta ? "conversa" : G.resultado;
    const tipica = pelaConta ? "a campanha típica da conta" : `a campanha típica de ${G.curto}`;
    const pausar = c.risco.nivel !== "alto";
    const liberado = pausar ? c.gasto : c.gasto * PASSO_ORCAMENTO;
    const movido = redondo(destino ? Math.min(liberado, cap(destino)) : liberado);
    if (destino) reservar(destino, movido);
    const vezes = c.vezesRegua != null && c.vereditoOficial === "Cortar" ? `${x1(c.vezesRegua)}x o custo ${pelaConta ? "da campanha típica da conta" : `das outras de ${G.curto}`}` : `nenhum(a) ${resSing}`;
    const verbo = pausar ? `Pausar ${aspas(c.campanha)} (${brl0(c.gasto)} no período, ${vezes})` : `Reduzir ${aspas(c.campanha)} em 20% (~${brl0(liberado)}; ${vezes})`;
    let ganhoTxt: string | undefined;
    const cd = destino ? custoDest(destino) : null;
    if (destino && cd && (pelaConta || !G.porMil)) {
      // Conservador: a verba extra rende como a campanha típica.
      const custoExtra = Math.max(cd, c.regua ?? cd);
      const perdidos = c.resultadoNaRegua * (movido / c.gasto);
      const ganho = movido / custoExtra - perdidos;
      if (ganho >= 1) ganhoTxt = `≈ ${int(ganho)} ${ganho >= 2 ? resPlural : resSing} a mais com a mesma verba (supondo que a verba extra renda como ${tipica}, ${unD(custoExtra)}).`;
    }
    cands.push({
      prioridade: 1,
      valor: liberado,
      origens: [c.campaign_id],
      destino: destino?.campaign_id,
      insight: {
        id: `anuncios-cortar-${c.campaign_id}`,
        area: "anuncios",
        tom: "ruim",
        titulo:
          c.vereditoOficial === "Sem tração"
            ? `${aspas(c.campanha)} (marcada "Sem tração") não trouxe nenhum(a) ${resSing} com ${brl0(c.gasto)}.`
            : `${aspas(c.campanha)} (marcada "Cortar") custa ${c.vezesRegua != null ? `${x1(c.vezesRegua)}x` : "muito mais que"} ${tipica}.`,
        diagnostico: c.motivo,
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultadoNaRegua)} ${resPlural}${c.custoNaRegua ? ` (${unD(c.custoNaRegua)})` : ""}. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        impactoTexto: ganhoTxt,
        acao: {
          texto: destino
            ? `${verbo} e passar ~${brl0(movido)} para ${aspas(destino.campanha)} (${unD(cd!)}, marcada "${destino.vereditoOficial}"), subindo 20% a cada 3–4 dias.${restoTxt(liberado, movido)}`
            : `${verbo}. Guardar a verba até ter uma campanha ${pelaConta ? "" : `de ${G.curto} `}que funcione.`,
        },
        responsavel: "gestor_trafego",
        risco: c.risco.texto,
      },
    });
  }

  // ---------- C. "Escalar" que não recebeu verba ----------
  const destinos = new Set(cands.map((c) => c.destino).filter(Boolean) as string[]);
  for (const c of cs.filter((c) => c.vereditoOficial === "Escalar" && !temSelo(c, "Criativo cansando") && !temSelo(c, "Resultado não medido") && !destinos.has(c.campaign_id))) {
    const G = GRUPOS[c.grupo];
    const pelaConta = c.julgadaPor === "conta";
    const resPlural = pelaConta ? "conversas" : G.resultadoPlural;
    const extra = c.gasto * PASSO_ORCAMENTO;
    const custo = c.custoNaRegua;
    cands.push({
      prioridade: 0,
      valor: extra,
      origens: [],
      destino: c.campaign_id,
      insight: {
        id: `anuncios-escalar-${c.campaign_id}`,
        area: "anuncios",
        tom: "bom",
        titulo: `${aspas(c.campanha)} (marcada "Escalar") entrega ${resPlural} ${c.vezesRegua != null ? `${pct(1 - c.vezesRegua)} mais barato` : "mais barato"} que ${pelaConta ? "a campanha típica da conta" : `a campanha típica de ${G.curto}`}.`,
        diagnostico: c.motivo,
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultadoNaRegua)} ${resPlural}. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        impactoTexto: (pelaConta || !G.porMil) && custo ? `≈ ${int(extra / custo)} ${resPlural} a mais por período com +~${brl0(extra)} (se o custo se mantiver).` : undefined,
        acao: { texto: c.acao },
        responsavel: "gestor_trafego",
        risco: "Ao subir a verba o custo costuma piorar um pouco; por isso 20% por vez, conferindo o custo antes do próximo aumento.",
      },
    });
  }

  // ---------- D. revisar público/criativo com verba relevante ----------
  const revisar = (c: CampanhaDiag) =>
    c.vereditoOficial === "Atrai mas não converte" || temSelo(c, "Revisar público") || temSelo(c, "Criativo cansando") || temSelo(c, "Atenção caindo");
  for (const c of cs.filter((c) => revisar(c) && !temSelo(c, "Resultado não medido") && c.gasto / d.gasto >= 0.08)) {
    const G = GRUPOS[c.grupo];
    const publico = c.vereditoOficial === "Atrai mas não converte" || temSelo(c, "Revisar público");
    cands.push({
      prioridade: 0,
      valor: c.gasto * 0.5, // não move verba: pesa metade na ordenação
      origens: [c.campaign_id],
      insight: {
        id: `anuncios-revisar-${c.campaign_id}`,
        area: "anuncios",
        tom: "atencao",
        titulo: `${aspas(c.campanha)} (marcada "${c.vereditoOficial}", ${brl0(c.gasto)} no período) pede ${publico ? "ajuste de público" : "criativo novo"}.`,
        diagnostico: [c.motivo, ...c.notas.filter((t) => !t.startsWith("Comparada"))].join(" "),
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultados)} ${G.resultadoPlural}; de cada 100 aparições, ${c.ctrLink != null ? (c.ctrLink * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"} viraram clique no link. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        acao: { texto: publico ? c.acao : c.acao.includes("criativos novos") ? c.acao : `Subir 2 ou 3 criativos novos em ${aspas(c.campanha)} sem mexer na verba; quando os novos tiverem 3–4 dias rodando, pausar o antigo.` },
        responsavel: "gestor_trafego",
        risco: c.risco.texto,
      },
    });
  }

  cands.sort((a, b) => b.prioridade - a.prioridade || b.valor - a.valor);
  // A (entre objetivos) sempre entra; depois B por valor; C e D completam.
  const escolhidos: Cand[] = [];
  const origemUsada = new Set<string>();
  for (const c of cands) {
    if (escolhidos.length >= 3) break;
    if (c.origens.some((o) => origemUsada.has(o))) continue;
    escolhidos.push(c);
    c.origens.forEach((o) => origemUsada.add(o));
  }
  return escolhidos.map((c) => c.insight);
}

/**
 * Insights da área de anúncios para a tela Resultado: as ações do plano e,
 * quando houver campanha de mensagem com volume, a leitura do custo por
 * conversa (só das campanhas de mensagem — dividir a verba toda pelas
 * conversas infla o número).
 */
export function insightsDeAnuncios(d: DiagnosticoAds | null | undefined): Insight[] {
  if (!d || d.gasto <= 0) return [];
  const out = planoDeAcao(d);
  const msg = d.grupos.find((g) => g.grupo === "mensagem");
  if (msg && msg.conversas >= 10 && msg.custoPorConversa != null) {
    const tom: Tom = out.some((i) => i.tom === "ruim") ? "atencao" : "bom";
    out.push({
      id: "anuncios-custo-conversa",
      area: "anuncios",
      tom,
      titulo: `Cada conversa vinda das campanhas de mensagem custou ${brl(msg.custoPorConversa)}.`,
      diagnostico: `${int(msg.conversas)} conversas com ${brl0(msg.gasto)} investidos em ${msg.campanhas} ${msg.campanhas === 1 ? "campanha" : "campanhas"} de mensagem. Conta só campanhas de mensagem: dividir a verba de todos os objetivos pelas conversas deixaria o custo inflado.`,
      evidencia: `${brl(msg.gasto)} ÷ ${int(msg.conversas)} conversas. Referência de mercado (sem estudo independente, não usada para julgar): ${BENCHMARKS.custoPorConversa.referencia}.`,
      confianca: confiancaPorAmostra(msg.conversas, 10),
      motivoConfianca: `${int(msg.conversas)} conversas no período.`,
      impacto: "medio",
      acao: { texto: "Conferir com a secretária quantas dessas conversas viraram consulta, para saber o custo por paciente." },
      responsavel: "gestor_trafego",
      risco: "Conversa iniciada não é paciente agendado: o custo por consulta depende do atendimento.",
    });
  }
  return out;
}

/** O que o diagnóstico de anúncios não consegue dizer (sempre visível no fim da tela). */
export function limitacoesDeAnuncios(d: DiagnosticoAds | null | undefined): Limitacao[] {
  if (!d || d.gasto <= 0) return [];
  const out: Limitacao[] = [];
  const naoMedido = d.campanhas.filter((c) => c.selos.includes("Resultado não medido"));
  if (naoMedido.length) {
    const g = naoMedido.reduce((s, c) => s + c.gasto, 0);
    out.push({
      id: "anuncios-nao-medido",
      area: "anuncios",
      texto: `${naoMedido.length} ${naoMedido.length === 1 ? "campanha" : "campanhas"} de cadastro/venda no site (${brl0(g)}) não ${naoMedido.length === 1 ? "tem" : "têm"} o resultado registrado aqui: dá para ver a visita à página, mas não o cadastro ou a compra. ${naoMedido.length === 1 ? "Ela foi comparada" : "Elas foram comparadas"} com a conta toda, pela conversa.`,
      resolve: "gestor_trafego",
      comoResolver: "Instalar o pixel da Meta com o evento de lead/compra no site.",
    });
  }
  const pouco = d.campanhas.filter((c) => c.vereditoOficial === "Volume insuficiente");
  if (pouco.length) {
    out.push({
      id: "anuncios-pouco-volume",
      area: "anuncios",
      texto: `${pouco.length} ${pouco.length === 1 ? "campanha rodou" : "campanhas rodaram"} pouco (${brl0(pouco.reduce((s, c) => s + c.gasto, 0))} no total; menos de ${int(MIN_IMPRESSOES)} aparições ou ${brl0(MIN_GASTO)}) e ${pouco.length === 1 ? "ficou" : "ficaram"} como "Volume insuficiente".`,
      resolve: "gestor_trafego",
    });
  }
  const semRegua = d.grupos.filter((g) => g.medianaCusto == null && g.grupo !== "outro" && g.gasto >= MIN_GASTO);
  if (semRegua.length) {
    out.push({
      id: "anuncios-sem-regua",
      area: "anuncios",
      texto: `${semRegua.map((g) => GRUPOS[g.grupo].nome).join(", ")}: menos de ${MIN_CAMPANHAS_REGUA} campanhas com volume no período, então essas campanhas foram comparadas com a conta toda, pela conversa (a régua original), e não com as do mesmo objetivo.`,
      resolve: "gestor_trafego",
      comoResolver: "Escolher um período maior ou rodar mais de uma campanha com o mesmo objetivo.",
    });
  }
  out.push({
    id: "anuncios-alcance-frequencia",
    area: "anuncios",
    texto: "Pessoas alcançadas e quantas vezes cada pessoa viu o anúncio não aparecem: a soma do alcance de cada dia conta a mesma pessoa várias vezes, e a média da frequência diária não é a frequência do período.",
    resolve: "equipe_hub",
    comoResolver: "Buscar o alcance e a frequência do período direto da Meta (sem somar dias).",
  });
  return out;
}
