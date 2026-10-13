// Diagnóstico de anúncios que respeita o objetivo da campanha.
//
// O diagnóstico antigo (RPC ads_diagnostico) julgava TODA campanha pelo custo
// por conversa de WhatsApp. Campanha de tráfego, alcance ou post impulsionado
// saía "Sem tração" por definição e entrava no "desperdício" — e era a maior
// parte da verba (LINK_CLICKS concentra o gasto de quase todos os clientes).
//
// Aqui cada campanha é medida pelo resultado do objetivo dela e comparada só com
// campanhas do MESMO objetivo. Comparar objetivos diferentes só é feito numa
// leitura à parte e explícita: "quanto custa uma conversa vinda de cada
// objetivo", porque no fim a clínica quer conversa/lead.
//
// Em cima do diagnóstico, este arquivo monta a "central de decisão de verba":
// categoria por campanha (Escalar agora, Manter, Revisar criativo, Revisar
// público, Cortar, Sem dados suficientes), confiança, risco de mexer, ação
// sugerida, e até 3 ações de verba com valores ("Se eu tivesse que agir hoje").
//
// Lógica pura: recebe as linhas diárias de meta_ads_daily + o cadastro das
// campanhas e devolve o diagnóstico. Testável com `npx tsx`.
import { median } from "@/lib/report-metrics";
import { BENCHMARKS } from "@/lib/benchmarks";
import { confiancaPorAmostra, type Confianca, type Impacto, type Insight, type Limitacao, type Tom } from "@/lib/insight";

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

// Veredito "técnico" (usado também pela Leitura do período). A categoria de
// decisão, mais fina, fica em `categoria`.
export type Veredito = "Escalar" | "Manter" | "Cortar" | "Sem resultado" | "Não medido" | "Sem comparação" | "Volume insuficiente";

export type Categoria = "Escalar agora" | "Manter" | "Revisar criativo" | "Revisar público" | "Cortar" | "Sem dados suficientes";
export const ORDEM_CATEGORIAS: Categoria[] = ["Escalar agora", "Cortar", "Revisar público", "Revisar criativo", "Manter", "Sem dados suficientes"];
export const EXPLICA_CATEGORIA: Record<Categoria, string> = {
  "Escalar agora": "Entrega o resultado do objetivo por 60% ou menos do custo da campanha típica do mesmo objetivo, e o anúncio não está perdendo atenção.",
  Manter: "Custo dentro da faixa normal do objetivo. Deixar rodar.",
  "Revisar criativo": "O anúncio está cansando: de cada 100 pessoas que viam, menos clicam agora do que no começo do período (queda de 20% ou mais), ou o custo já passou do típico e a atenção começou a cair.",
  "Revisar público": "As pessoas clicam (tanto ou mais que o normal), mas o clique não vira resultado: custa 2x ou mais o típico, ou não trouxe nenhum.",
  Cortar: "Custa 2x ou mais a campanha típica do mesmo objetivo (ou não trouxe resultado) e nem chama atenção: o anúncio não funciona com esse público.",
  "Sem dados suficientes": "Rodou pouco, o resultado acontece fora daqui (site) ou não há outras campanhas do mesmo objetivo para comparar.",
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
  objetivo: string | null;
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
  cansando: boolean; // cliques por impressão caíram 20%+ da 1ª para a 2ª metade
  atencaoCaindo: boolean; // caíram 10%+
  veredito: Veredito;
  // Decisão
  categoria: Categoria;
  regua: number | null; // custo da campanha típica do mesmo objetivo
  vezesRegua: number | null; // custoPorResultado ÷ regua
  comparacao: string; // "a campanha típica de mensagem custa R$ X por conversa; esta custa 1,8x isso"
  motivo: string;
  acao: string;
  confianca: Confianca;
  motivoConfianca: string;
  risco: { nivel: NivelRisco; texto: string };
}

export interface GrupoResumo {
  grupo: Grupo;
  campanhas: number;
  gasto: number;
  resultados: number;
  custoPorResultado: number | null;
  medianaCusto: number | null; // régua usada no veredito (campanha típica)
  conversas: number;
  custoPorConversa: number | null; // visão de negócio, comparável entre objetivos
  ctrReferencia: number | null; // cliques por impressão da campanha típica do grupo
}

export interface DiagnosticoAds {
  campanhas: CampanhaDiag[];
  grupos: GrupoResumo[];
  gasto: number;
  impressoes: number;
  cliquesLink: number;
  conversas: number; // de todas as campanhas
  desperdicio: number; // Cortar + Sem resultado (veredito)
  conversasMensagem: number;
  custoPorConversaMensagem: number | null; // só campanhas de mensagem
}

export const MIN_IMPRESSOES = 1000;
export const MIN_GASTO = 50;
export const MIN_CAMPANHAS_REGUA = 3;
export const ESCALAR = 0.6; // custo ≤ 60% da campanha típica do objetivo
export const CORTAR = 2; // custo ≥ 2x a típica: a mesma régua de fadiga da Meta
export const QUEDA_CTR = 0.8; // fadiga: cliques por impressão caem 20%+
export const QUEDA_ATENCAO = 0.9; // atenção caindo: 10%+ (usado com custo 1–2x)
export const PASSO_ORCAMENTO = 0.2; // a Meta reinicia o aprendizado com mudança > 20%
// Volume mínimo de resultados para confiança média (alta = 3x isso).
export const MIN_RESULTADOS: Record<Grupo, number> = { mensagem: 10, lead: 10, trafego: 100, engajamento: 10, alcance: 10, venda: 30, outro: 10 };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const redondo = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v));
const x1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number) => `${Math.round(v * 100)}%`;
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

export function diagnosticarAds(linhas: LinhaAds[], cadastro: CampanhaCadastro[], start: string, end: string): DiagnosticoAds {
  const meio = new Date((new Date(start + "T12:00:00Z").getTime() + new Date(end + "T12:00:00Z").getTime()) / 2).toISOString().slice(0, 10);
  const cad = new Map(cadastro.map((c) => [c.campaign_id, c]));
  type Acc = { g: number; i: number; lc: number; cv: number; ld: number; lpv: number; i1: number; c1: number; i2: number; c2: number; dias: Set<string> };
  const acc = new Map<string, Acc>();
  for (const l of linhas) {
    if (l.date < start || l.date > end) continue;
    const a = acc.get(l.campaign_id) ?? { g: 0, i: 0, lc: 0, cv: 0, ld: 0, lpv: 0, i1: 0, c1: 0, i2: 0, c2: 0, dias: new Set<string>() };
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

  type Base = Omit<CampanhaDiag, "veredito" | "categoria" | "regua" | "vezesRegua" | "comparacao" | "motivo" | "acao" | "confianca" | "motivoConfianca" | "risco">;
  const base: Base[] = [];
  for (const [id, a] of acc) {
    if (a.g <= 0 && a.i <= 0) continue;
    const c = cad.get(id);
    const grupo = grupoDoObjetivo(c?.objective, a.cv, a.lc);
    let resultados = 0;
    if (grupo === "mensagem") resultados = a.cv;
    else if (grupo === "lead") resultados = a.ld > 0 ? Math.max(a.ld, a.cv) : a.cv; // lead por formulário ou por conversa, sem somar os dois
    else if (grupo === "trafego") resultados = a.lc;
    else if (grupo === "engajamento" || grupo === "alcance") resultados = a.i / 1000;
    else if (grupo === "venda") resultados = a.lpv;
    const ctr1 = a.i1 >= MIN_IMPRESSOES ? a.c1 / a.i1 : null;
    const ctr2 = a.i2 >= MIN_IMPRESSOES ? a.c2 / a.i2 : null;
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
    });
  }

  // Régua por grupo: custo da campanha típica (mediana) entre as que têm volume.
  // Também a "atenção típica" do grupo (cliques no link por impressão).
  const comVolume = (c: Base) => c.impressoes >= MIN_IMPRESSOES && c.gasto >= MIN_GASTO;
  const reguas = new Map<Grupo, number | null>();
  const ctrRef = new Map<Grupo, number | null>();
  for (const g of Object.keys(GRUPOS) as Grupo[]) {
    const doGrupo = base.filter((c) => c.grupo === g && comVolume(c));
    const custos = doGrupo.filter((c) => c.custoPorResultado != null).map((c) => c.custoPorResultado!);
    reguas.set(g, custos.length >= MIN_CAMPANHAS_REGUA ? median(custos) : null);
    const ctrs = doGrupo.filter((c) => c.ctrLink != null).map((c) => c.ctrLink!);
    // Sem 3 campanhas para comparar, tráfego usa a referência de mercado de
    // confiabilidade média (WordStream 2025, médicos ~0,8%). Os outros grupos
    // ficam sem referência de atenção.
    const refMercado = g === "trafego" && (BENCHMARKS.ctrTrafego.confiabilidade as string) !== "baixa" ? 0.008 : null;
    ctrRef.set(g, ctrs.length >= MIN_CAMPANHAS_REGUA ? median(ctrs) : refMercado);
  }
  const volumeCampanhasGrupo = new Map<Grupo, number>();
  for (const c of base) if (comVolume(c)) volumeCampanhasGrupo.set(c.grupo, (volumeCampanhasGrupo.get(c.grupo) ?? 0) + 1);

  const gastoTotal = base.reduce((s, c) => s + c.gasto, 0);
  const conversasTotal = base.reduce((s, c) => s + c.conversas, 0);
  const topConversa = [...base].sort((a, b) => b.conversas - a.conversas)[0];

  const campanhas: CampanhaDiag[] = base.map((c) => {
    const G = GRUPOS[c.grupo];
    const med = reguas.get(c.grupo) ?? null;
    const ref = ctrRef.get(c.grupo) ?? null;
    const cpr = c.custoPorResultado;
    const vezes = cpr != null && med != null && med > 0 ? cpr / med : null;
    const atencaoBoa = ref != null && c.ctrLink != null && c.ctrLink >= ref;
    const un = (v: number) => unidade(c.grupo, v);
    const nome = aspas(c.campanha);
    const quedaTxt =
      c.ctrLink1 != null && c.ctrLink2 != null
        ? `no começo do período ${porCem(c.ctrLink1)} vezes que o anúncio apareceu viravam clique; no fim, ${porCem(c.ctrLink2)}`
        : "";

    // ---------- veredito técnico (mantido para a Leitura do período) ----------
    let veredito: Veredito;
    if (c.impressoes < MIN_IMPRESSOES || c.gasto < MIN_GASTO) veredito = "Volume insuficiente";
    else if (c.grupo === "outro") veredito = "Sem comparação";
    else if (c.resultados === 0 && (c.grupo === "lead" || c.grupo === "venda") && (c.visitasPagina > 0 || c.cliquesLink > 0)) veredito = "Não medido";
    // Cadastro no site: nenhum lead registrado, mas muitas visitas à página. As
    // poucas conversas não são o resultado dessa campanha — o cadastro não chega aqui.
    else if (c.grupo === "lead" && c.leads === 0 && c.visitasPagina >= 10 && c.visitasPagina > c.conversas) veredito = "Não medido";
    else if (c.resultados === 0) veredito = "Sem resultado";
    else if (med == null) veredito = "Sem comparação";
    else if (cpr! <= med * ESCALAR) veredito = "Escalar";
    else if (cpr! >= med * CORTAR) veredito = "Cortar";
    else veredito = "Manter";

    // ---------- comparação com a campanha típica do mesmo objetivo ----------
    const comparacao =
      med != null
        ? `A campanha típica de ${G.curto} custa ${un(med)}${vezes != null ? (vezes >= 1.05 ? `; esta custa ${x1(vezes)}x isso` : vezes <= 0.95 ? `; esta custa ${pct(1 - vezes)} menos` : "; esta está no mesmo nível") : ""}.`
        : `Menos de ${MIN_CAMPANHAS_REGUA} campanhas de ${G.curto} com volume no período: não há campanha típica para comparar.`;

    // ---------- categoria (regras explícitas, nesta ordem) ----------
    // 1. Sem dados suficientes: pouco volume, objetivo sem régua, resultado fora
    //    daqui (Não medido) ou sem campanhas do mesmo objetivo para comparar.
    // 2. Sem nenhum resultado, ou custo ≥ 2x a típica:
    //      atenção boa (cliques por impressão ≥ a típica do objetivo) → Revisar público
    //      senão → Cortar
    // 3. Fadiga: cliques por impressão caíram 20%+ da 1ª para a 2ª metade → Revisar criativo
    //    (vale também para campanha barata: trocar o criativo antes de pôr mais verba)
    // 4. Custo entre 1x e 2x a típica e atenção caindo 10%+ → Revisar criativo
    // 5. Custo ≤ 60% da típica → Escalar agora
    // 6. Resto → Manter
    let categoria: Categoria;
    let motivo: string;
    if (veredito === "Volume insuficiente") {
      categoria = "Sem dados suficientes";
      motivo = `Rodou pouco para julgar (${brl(c.gasto)} e ${int(c.impressoes)} aparições; o mínimo é ${brl(MIN_GASTO)} e ${int(MIN_IMPRESSOES)}).`;
    } else if (veredito === "Não medido") {
      categoria = "Sem dados suficientes";
      motivo = `O resultado dessa campanha (${G.resultado}) acontece no site e não chega aqui: ${c.visitasPagina > 0 ? `${int(c.visitasPagina)} visitas à página` : `${int(c.cliquesLink)} cliques no link`} por ${brl(c.gasto)}${c.conversas > 0 ? ` (e ${int(c.conversas)} ${c.conversas === 1 ? "conversa" : "conversas"})` : ""}.`;
    } else if (c.grupo === "outro") {
      categoria = "Sem dados suficientes";
      motivo = `Objetivo ${c.objetivo ?? "não informado"} sem régua definida neste painel.`;
    } else if (c.resultados === 0) {
      categoria = atencaoBoa ? "Revisar público" : "Cortar";
      motivo = atencaoBoa
        ? `Investiu ${brl(c.gasto)}: as pessoas clicam (${porCem(c.ctrLink)} aparições viram clique, acima do típico), mas nenhum clique virou ${G.resultado}.`
        : `Investiu ${brl(c.gasto)} e não gerou nenhum(a) ${G.resultado}, que é o que esse objetivo promete. E pouca gente clica (${porCem(c.ctrLink)} aparições).`;
    } else if (med == null) {
      categoria = "Sem dados suficientes";
      motivo = `${un(cpr!)}. ${comparacao}`;
    } else if (vezes! >= CORTAR) {
      categoria = atencaoBoa ? "Revisar público" : "Cortar";
      motivo = atencaoBoa
        ? c.grupo === "trafego"
          ? `O anúncio chama atenção (${porCem(c.ctrLink)} aparições viram clique, acima do típico), mas aparecer para esse público está caro: ${un(cpr!)}, ${x1(vezes!)}x o típico.`
          : `As pessoas clicam (${porCem(c.ctrLink)} aparições viram clique, acima do típico), mas o clique não vira ${G.resultado}: ${un(cpr!)}, ${x1(vezes!)}x o típico.`
        : `${un(cpr!)}, ${x1(vezes!)}x a campanha típica de ${G.curto} (${un(med)}). A Meta considera 2x o sinal de anúncio esgotado, e aqui nem a atenção ajuda (${porCem(c.ctrLink)} aparições viram clique).`;
    } else if (c.cansando) {
      categoria = "Revisar criativo";
      motivo = `O anúncio está cansando: ${quedaTxt} (queda de ${pct(1 - c.ctrLink2! / c.ctrLink1!)}). Custo hoje: ${un(cpr!)}${vezes! <= ESCALAR ? ", ainda barato — troque o criativo antes de pôr mais verba" : ""}.`;
    } else if (vezes! >= 1 && c.atencaoCaindo) {
      categoria = "Revisar criativo";
      motivo = `Já custa ${x1(vezes!)}x a campanha típica de ${G.curto} e a atenção começou a cair: ${quedaTxt}.`;
    } else if (vezes! <= ESCALAR) {
      categoria = "Escalar agora";
      motivo = `${un(cpr!)}, ${pct(1 - vezes!)} mais barato que a campanha típica de ${G.curto} (${un(med)}). É onde cabe mais verba.`;
    } else {
      categoria = "Manter";
      motivo = `${un(cpr!)}, dentro da faixa normal das campanhas de ${G.curto} (típica: ${un(med)}).`;
    }

    // ---------- confiança (volume de resultados e de aparições) ----------
    const minimo = MIN_RESULTADOS[c.grupo];
    let confianca: Confianca = c.impressoes < MIN_IMPRESSOES ? "baixa" : confiancaPorAmostra(c.resultados, minimo);
    if (categoria === "Sem dados suficientes") confianca = "baixa";
    // Régua feita com poucas campanhas (3–4) segura a confiança em média.
    if (confianca === "alta" && (volumeCampanhasGrupo.get(c.grupo) ?? 0) < 5) confianca = "media";
    const motivoConfianca = `${G.porMil ? `${int(c.impressoes)} aparições` : `${int(c.resultados)} ${c.resultados === 1 ? G.resultado : G.resultadoPlural} e ${int(c.impressoes)} aparições`} em ${c.diasAtivos} ${c.diasAtivos === 1 ? "dia" : "dias"} com gasto; régua de ${G.curto} feita com ${volumeCampanhasGrupo.get(c.grupo) ?? 0} campanhas. Confiança alta pede ${minimo * 3}+ ${G.porMil ? "mil aparições" : G.resultadoPlural}.`;

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
    let acao: string;
    switch (categoria) {
      case "Escalar agora":
        acao = dia
          ? `Aumentar o orçamento de ${nome} em 20% (de ~${brl0(dia)}/dia para ~${brl0(dia * 1.2)}/dia) e repetir em 3–4 dias se o custo se mantiver.`
          : `Aumentar o orçamento de ${nome} em 20%.`;
        break;
      case "Manter":
        acao = `Manter ${nome} como está e reavaliar no próximo período.`;
        break;
      case "Revisar criativo":
        acao = `Subir 2 ou 3 criativos novos em ${nome} sem mexer na verba; quando os novos tiverem 3–4 dias rodando, pausar o antigo.`;
        break;
      case "Revisar público":
        acao =
          c.grupo === "mensagem"
            ? `Revisar o público de ${nome} (idade, região, interesses) e conferir se a mensagem automática do WhatsApp responde na hora. Se o custo não cair em 7 dias, pausar.`
            : `Revisar o público de ${nome} (idade, região, interesses) e para onde o clique leva. Se o custo não cair em 7 dias, pausar.`;
        break;
      case "Cortar":
        acao =
          risco.nivel === "alto"
            ? `Reduzir ${nome} em 20% agora (~${brl0(c.gasto * PASSO_ORCAMENTO)} no período) e mais 20% a cada 3–4 dias se o custo não melhorar.`
            : `Pausar ${nome} (${brl0(c.gasto)} no período).`;
        break;
      default:
        acao =
          veredito === "Não medido"
            ? `Instalar o evento de ${G.resultado} no site (pixel da Meta) para medir ${nome}; até lá, conferir os resultados no Gerenciador de Anúncios.`
            : veredito === "Volume insuficiente"
              ? `Deixar ${nome} rodar até ${brl(MIN_GASTO)} e ${int(MIN_IMPRESSOES)} aparições antes de decidir.`
              : `Acompanhar o custo de ${nome} (${cpr != null ? un(cpr) : "sem resultado ainda"}) no próximo período; com 3+ campanhas de ${G.curto} dá para comparar.`;
    }

    return { ...c, veredito, categoria, regua: med, vezesRegua: vezes, comparacao, motivo, acao, confianca, motivoConfianca, risco };
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
  return {
    campanhas,
    grupos,
    gasto: gastoTotal,
    impressoes: campanhas.reduce((s, c) => s + c.impressoes, 0),
    cliquesLink: campanhas.reduce((s, c) => s + c.cliquesLink, 0),
    conversas: conversasTotal,
    desperdicio: campanhas.filter((c) => c.veredito === "Cortar" || c.veredito === "Sem resultado").reduce((s, c) => s + c.gasto, 0),
    conversasMensagem: msg?.conversas ?? 0,
    custoPorConversaMensagem: msg?.custoPorConversa ?? null,
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
//  B. Cortar: pausar (ou reduzir 20%, se o risco de mexer é alto) e passar a
//     verba para a melhor campanha do MESMO objetivo (Escalar agora > Manter).
//  C. Escalar agora que não recebeu verba em A/B: +20% no orçamento.
//  D. Revisar público/criativo com verba relevante (≥ 8% do total): não move
//     dinheiro, mas diz quanto está em jogo.
// Ordem: A primeiro; depois por dinheiro em jogo. Uma campanha não aparece
// como origem duas vezes. Quem recebe verba sobe no máximo o próprio gasto do
// período (e sempre 20% por vez, por causa do aprendizado da Meta).

const ORDEM_CONF: Record<Confianca, number> = { baixa: 0, media: 1, alta: 2 };
const menorConf = (...cs: Confianca[]) => cs.reduce((a, b) => (ORDEM_CONF[b] < ORDEM_CONF[a] ? b : a));
function impactoPorFatia(f: number): Impacto {
  return f >= 0.2 ? "alto" : f >= 0.08 ? "medio" : "baixo";
}

// Quem recebe verba sobe no máximo o próprio gasto do período, somando todas
// as ações (capacidade). Sem capacidade (< R$ 30), passa para a próxima.
const MIN_CAPACIDADE = 30;
function melhorReceptora(cs: CampanhaDiag[], grupo: Grupo, excluir: Set<string>, capacidade: Map<string, number>, porConversa = false): CampanhaDiag | null {
  const custo = (c: CampanhaDiag) => (porConversa ? c.custoPorConversa : c.custoPorResultado) ?? Infinity;
  const ok = cs.filter(
    (c) =>
      c.grupo === grupo &&
      !excluir.has(c.campaign_id) &&
      (capacidade.get(c.campaign_id) ?? c.gasto) >= MIN_CAPACIDADE &&
      (c.categoria === "Escalar agora" || c.categoria === "Manter" || (porConversa && c.categoria === "Sem dados suficientes" && c.conversas >= 10)) &&
      Number.isFinite(custo(c)),
  );
  ok.sort((a, b) => (a.categoria === "Escalar agora" ? 0 : 1) - (b.categoria === "Escalar agora" ? 0 : 1) || custo(a) - custo(b));
  return ok[0] ?? null;
}

// Quem recebe não deve mais que dobrar no período; o que sobra fica guardado.
function restoTxt(liberado: number, movido: number): string {
  const resto = redondo(liberado - movido);
  return resto >= 30 && resto >= liberado * 0.2 ? ` O resto (~${brl0(resto)}) fica guardado até haver outra campanha que renda.` : "";
}

export function planoDeAcao(d: DiagnosticoAds): Insight[] {
  if (d.gasto <= 0) return [];
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
      .filter((c) => c.grupo === cmp.caro.grupo && c.categoria !== "Escalar agora" && c.gasto >= MIN_GASTO && c.risco.nivel !== "alto" && c.campaign_id !== destino?.campaign_id)
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
          acao: { texto: `${txtOrigens[0].toUpperCase() + txtOrigens.slice(1)}, e passar ~${brl0(movido)} para ${aspas(destino.campanha)} (${B.curto}, ${brl(destino.custoPorConversa!)} por conversa), subindo 20% a cada 3–4 dias.${restoTxt(liberado, movido)}` },
          responsavel: "gestor_trafego",
          risco: `${destino.risco.nivel === "alto" ? "A campanha que recebe é a principal fonte de conversas: suba 20% por vez. " : ""}Campanha de ${C.curto} pode trazer paciente que chama depois, sem ser contado como conversa do anúncio.`,
        },
      });
    }
  }

  // ---------- B. cortar dentro do mesmo objetivo ----------
  const usadosOrigem = new Set(cands.flatMap((c) => c.origens));
  const cortar = cs.filter((c) => c.categoria === "Cortar" && c.gasto >= MIN_GASTO && !usadosOrigem.has(c.campaign_id)).sort((a, b) => b.gasto - a.gasto);
  for (const c of cortar) {
    const G = GRUPOS[c.grupo];
    const destino = melhorReceptora(cs, c.grupo, new Set([c.campaign_id]), capacidade);
    const pausar = c.risco.nivel !== "alto";
    const liberado = pausar ? c.gasto : c.gasto * PASSO_ORCAMENTO;
    const movido = redondo(destino ? Math.min(liberado, cap(destino)) : liberado);
    if (destino) reservar(destino, movido);
    const vezes = c.vezesRegua != null ? `${x1(c.vezesRegua)}x o custo das outras de ${G.curto}` : `nenhum(a) ${G.resultado}`;
    const verbo = pausar ? `Pausar ${aspas(c.campanha)} (${brl0(c.gasto)} no período, ${vezes})` : `Reduzir ${aspas(c.campanha)} em 20% (~${brl0(liberado)}; ${vezes})`;
    let ganhoTxt: string | undefined;
    if (destino && !G.porMil && destino.custoPorResultado) {
      // Conservador: a verba extra rende como a campanha típica do objetivo.
      const custoExtra = Math.max(destino.custoPorResultado, c.regua ?? destino.custoPorResultado);
      const perdidos = c.resultados * (movido / c.gasto);
      const ganho = movido / custoExtra - perdidos;
      if (ganho >= 1) ganhoTxt = `≈ ${int(ganho)} ${ganho >= 2 ? G.resultadoPlural : G.resultado} a mais com a mesma verba (supondo que a verba extra renda como a campanha típica de ${G.curto}, ${unidade(c.grupo, custoExtra)}).`;
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
        titulo: `${aspas(c.campanha)} custa ${c.vezesRegua != null ? `${x1(c.vezesRegua)}x` : "muito mais que"} a campanha típica de ${G.curto}.`,
        diagnostico: c.motivo,
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultados)} ${G.resultadoPlural}${c.custoPorResultado ? ` (${unidade(c.grupo, c.custoPorResultado)})` : ""}. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        impactoTexto: ganhoTxt,
        acao: {
          texto: destino
            ? `${verbo} e passar ~${brl0(movido)} para ${aspas(destino.campanha)} (${unidade(c.grupo, destino.custoPorResultado!)}), subindo 20% a cada 3–4 dias.${restoTxt(liberado, movido)}`
            : `${verbo}. Guardar a verba até ter uma campanha de ${G.curto} que funcione.`,
        },
        responsavel: "gestor_trafego",
        risco: c.risco.texto,
      },
    });
  }

  // ---------- C. escalar quem não recebeu verba ----------
  const destinos = new Set(cands.map((c) => c.destino).filter(Boolean) as string[]);
  for (const c of cs.filter((c) => c.categoria === "Escalar agora" && !destinos.has(c.campaign_id))) {
    const G = GRUPOS[c.grupo];
    const extra = c.gasto * PASSO_ORCAMENTO;
    cands.push({
      prioridade: 0,
      valor: extra,
      origens: [],
      destino: c.campaign_id,
      insight: {
        id: `anuncios-escalar-${c.campaign_id}`,
        area: "anuncios",
        tom: "bom",
        titulo: `${aspas(c.campanha)} entrega ${G.resultadoPlural} ${c.vezesRegua != null ? `${pct(1 - c.vezesRegua)} mais barato` : "mais barato"} que a campanha típica de ${G.curto}.`,
        diagnostico: c.motivo,
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultados)} ${G.resultadoPlural}. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        impactoTexto:
          !G.porMil && c.custoPorResultado ? `≈ ${int(extra / c.custoPorResultado)} ${G.resultadoPlural} a mais por período com +~${brl0(extra)} (se o custo se mantiver).` : undefined,
        acao: { texto: c.acao },
        responsavel: "gestor_trafego",
        risco: "Ao subir a verba o custo costuma piorar um pouco; por isso 20% por vez, conferindo o custo antes do próximo aumento.",
      },
    });
  }

  // ---------- D. revisar público/criativo com verba relevante ----------
  for (const c of cs.filter((c) => (c.categoria === "Revisar público" || c.categoria === "Revisar criativo") && c.gasto / d.gasto >= 0.08)) {
    const G = GRUPOS[c.grupo];
    cands.push({
      prioridade: 0,
      valor: c.gasto * 0.5, // não move verba: pesa metade na ordenação
      origens: [c.campaign_id],
      insight: {
        id: `anuncios-revisar-${c.campaign_id}`,
        area: "anuncios",
        tom: "atencao",
        titulo: `${aspas(c.campanha)} (${brl0(c.gasto)} no período) pede ${c.categoria === "Revisar público" ? "ajuste de público" : "criativo novo"}.`,
        diagnostico: c.motivo,
        evidencia: `${brl(c.gasto)} investidos, ${int(c.resultados)} ${G.resultadoPlural}; de cada 100 aparições, ${c.ctrLink != null ? (c.ctrLink * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"} viraram clique no link. ${c.comparacao}`,
        confianca: c.confianca,
        motivoConfianca: c.motivoConfianca,
        impacto: impactoPorFatia(c.gasto / d.gasto),
        acao: { texto: c.acao },
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
  const naoMedido = d.campanhas.filter((c) => c.veredito === "Não medido");
  if (naoMedido.length) {
    const g = naoMedido.reduce((s, c) => s + c.gasto, 0);
    out.push({
      id: "anuncios-nao-medido",
      area: "anuncios",
      texto: `${naoMedido.length} ${naoMedido.length === 1 ? "campanha" : "campanhas"} de cadastro/venda no site (${brl0(g)}) não ${naoMedido.length === 1 ? "tem" : "têm"} o resultado registrado aqui: dá para ver a visita à página, mas não o cadastro ou a compra.`,
      resolve: "gestor_trafego",
      comoResolver: "Instalar o pixel da Meta com o evento de lead/compra no site.",
    });
  }
  const pouco = d.campanhas.filter((c) => c.veredito === "Volume insuficiente");
  if (pouco.length) {
    out.push({
      id: "anuncios-pouco-volume",
      area: "anuncios",
      texto: `${pouco.length} ${pouco.length === 1 ? "campanha rodou" : "campanhas rodaram"} pouco (${brl0(pouco.reduce((s, c) => s + c.gasto, 0))} no total) e não ${pouco.length === 1 ? "foi julgada" : "foram julgadas"}.`,
      resolve: "gestor_trafego",
    });
  }
  const semRegua = d.grupos.filter((g) => g.medianaCusto == null && g.grupo !== "outro" && g.gasto >= MIN_GASTO);
  if (semRegua.length) {
    out.push({
      id: "anuncios-sem-regua",
      area: "anuncios",
      texto: `${semRegua.map((g) => GRUPOS[g.grupo].nome).join(", ")}: menos de ${MIN_CAMPANHAS_REGUA} campanhas com volume no período, então não dá para dizer se o custo está bom ou ruim comparando com as outras.`,
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
