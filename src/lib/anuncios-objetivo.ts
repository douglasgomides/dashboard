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
// Lógica pura: recebe as linhas diárias de meta_ads_daily + o cadastro das
// campanhas e devolve o diagnóstico. Testável com `npx tsx`.
import { median } from "@/lib/report-metrics";

export type Grupo = "mensagem" | "lead" | "trafego" | "engajamento" | "alcance" | "venda" | "outro";

export const GRUPOS: Record<Grupo, { nome: string; curto: string; resultado: string; resultadoPlural: string; porMil?: boolean; explica: string }> = {
  mensagem: { nome: "Mensagens (WhatsApp/Direct)", curto: "mensagem", resultado: "conversa", resultadoPlural: "conversas", explica: "Otimizada para a pessoa abrir uma conversa. Resultado: conversa iniciada." },
  lead: { nome: "Cadastro (leads)", curto: "cadastro", resultado: "lead", resultadoPlural: "leads", explica: "Otimizada para a pessoa deixar o contato. Resultado: lead." },
  trafego: { nome: "Tráfego (cliques)", curto: "tráfego", resultado: "clique no link", resultadoPlural: "cliques no link", explica: "Otimizada para clique no link (perfil, site ou WhatsApp). Resultado: clique no link." },
  engajamento: { nome: "Engajamento", curto: "engajamento", resultado: "mil impressões", resultadoPlural: "mil impressões", porMil: true, explica: "Otimizada para curtida, comentário e visualização. A régua é o custo por mil impressões (CPM)." },
  alcance: { nome: "Reconhecimento (alcance)", curto: "reconhecimento", resultado: "mil impressões", resultadoPlural: "mil impressões", porMil: true, explica: "Otimizada para aparecer para mais gente. A régua é o custo por mil impressões (CPM)." },
  venda: { nome: "Vendas", curto: "vendas", resultado: "visita à página", resultadoPlural: "visitas à página", explica: "Otimizada para compra. A compra não é registrada aqui; a régua provisória é a visita à página." },
  outro: { nome: "Outros objetivos", curto: "outros", resultado: "—", resultadoPlural: "—", explica: "Objetivo sem régua definida." },
};

export function grupoDoObjetivo(objetivo: string | null | undefined, conversas: number): Grupo {
  const o = (objetivo ?? "").toUpperCase();
  if (o === "MESSAGES") return "mensagem";
  // No modelo novo da Meta, campanha de mensagem pode subir como Engajamento com
  // destino WhatsApp/Direct. Sem o destino do conjunto, o sinal é ter conversas.
  if (o === "OUTCOME_ENGAGEMENT") return conversas >= 3 ? "mensagem" : "engajamento";
  if (["POST_ENGAGEMENT", "VIDEO_VIEWS", "PAGE_LIKES", "EVENT_RESPONSES"].includes(o)) return "engajamento";
  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(o)) return "lead";
  if (["LINK_CLICKS", "OUTCOME_TRAFFIC"].includes(o)) return "trafego";
  if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(o)) return "alcance";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"].includes(o)) return "venda";
  return "outro";
}

export type Veredito = "Escalar" | "Manter" | "Cortar" | "Sem resultado" | "Não medido" | "Sem comparação" | "Volume insuficiente";

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
  resultados: number; // na unidade do grupo (em engajamento/alcance: mil impressões)
  custoPorResultado: number | null;
  ctrLink: number | null; // fração
  cansando: boolean; // CTR caiu 20%+ da 1ª para a 2ª metade
  veredito: Veredito;
  motivo: string;
}

export interface GrupoResumo {
  grupo: Grupo;
  campanhas: number;
  gasto: number;
  resultados: number;
  custoPorResultado: number | null;
  medianaCusto: number | null; // régua usada no veredito
  conversas: number;
  custoPorConversa: number | null; // visão de negócio, comparável entre objetivos
}

export interface DiagnosticoAds {
  campanhas: CampanhaDiag[];
  grupos: GrupoResumo[];
  gasto: number;
  desperdicio: number; // Cortar + Sem resultado
  conversasMensagem: number;
  custoPorConversaMensagem: number | null; // só campanhas de mensagem
}

export const MIN_IMPRESSOES = 1000;
export const MIN_GASTO = 50;
export const MIN_CAMPANHAS_REGUA = 3;
export const ESCALAR = 0.6; // custo ≤ 60% da mediana do objetivo
export const CORTAR = 2; // custo ≥ 2x a mediana: a mesma régua de fadiga da Meta
export const QUEDA_CTR = 0.8;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function diagnosticarAds(linhas: LinhaAds[], cadastro: CampanhaCadastro[], start: string, end: string): DiagnosticoAds {
  const meio = new Date((new Date(start + "T12:00:00Z").getTime() + new Date(end + "T12:00:00Z").getTime()) / 2).toISOString().slice(0, 10);
  const cad = new Map(cadastro.map((c) => [c.campaign_id, c]));
  const acc = new Map<string, { g: number; i: number; lc: number; cv: number; ld: number; lpv: number; i1: number; c1: number; i2: number; c2: number }>();
  for (const l of linhas) {
    if (l.date < start || l.date > end) continue;
    const a = acc.get(l.campaign_id) ?? { g: 0, i: 0, lc: 0, cv: 0, ld: 0, lpv: 0, i1: 0, c1: 0, i2: 0, c2: 0 };
    a.g += n(l.spend);
    a.i += n(l.impressions);
    a.lc += n(l.link_clicks);
    a.cv += n(l.conversations);
    a.ld += n(l.leads);
    a.lpv += n(l.landing_page_views);
    if (l.date < meio) {
      a.i1 += n(l.impressions);
      a.c1 += n(l.link_clicks);
    } else {
      a.i2 += n(l.impressions);
      a.c2 += n(l.link_clicks);
    }
    acc.set(l.campaign_id, a);
  }

  const base: Omit<CampanhaDiag, "veredito" | "motivo">[] = [];
  for (const [id, a] of acc) {
    if (a.g <= 0 && a.i <= 0) continue;
    const c = cad.get(id);
    const grupo = grupoDoObjetivo(c?.objective, a.cv);
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
      resultados,
      custoPorResultado: resultados > 0 ? a.g / resultados : null,
      ctrLink: a.i > 0 ? a.lc / a.i : null,
      cansando: ctr1 != null && ctr2 != null && ctr1 > 0 && ctr2 <= ctr1 * QUEDA_CTR,
    });
  }

  // Régua por grupo: mediana do custo por resultado das campanhas com volume.
  const reguas = new Map<Grupo, number | null>();
  for (const g of Object.keys(GRUPOS) as Grupo[]) {
    const custos = base
      .filter((c) => c.grupo === g && c.impressoes >= MIN_IMPRESSOES && c.gasto >= MIN_GASTO && c.custoPorResultado != null)
      .map((c) => c.custoPorResultado!);
    reguas.set(g, custos.length >= MIN_CAMPANHAS_REGUA ? median(custos) : null);
  }

  const campanhas: CampanhaDiag[] = base.map((c) => {
    const G = GRUPOS[c.grupo];
    const med = reguas.get(c.grupo) ?? null;
    const un = (v: number) => (G.porMil ? `${brl(v)} por mil impressões` : `${brl(v)} por ${G.resultado}`);
    const fadiga = c.cansando ? " O CTR caiu 20%+ da 1ª para a 2ª metade do período: o criativo está cansando." : "";
    let veredito: Veredito;
    let motivo: string;
    if (c.impressoes < MIN_IMPRESSOES || c.gasto < MIN_GASTO) {
      veredito = "Volume insuficiente";
      motivo = "Rodou pouco para julgar.";
    } else if (c.grupo === "outro") {
      veredito = "Sem comparação";
      motivo = `Objetivo ${c.objetivo ?? "não informado"} sem régua definida.`;
    } else if (c.resultados === 0 && (c.grupo === "lead" || c.grupo === "venda") && (c.visitasPagina > 0 || c.cliquesLink > 0)) {
      // Lead/compra feito no site: o pixel não manda o evento para cá. Não é "zero".
      veredito = "Não medido";
      motivo = `O resultado dessa campanha (${G.resultado}) acontece fora do Instagram e não chega aqui: ${c.visitasPagina > 0 ? `${c.visitasPagina} visitas à página` : `${c.cliquesLink} cliques no link`} por ${brl(c.gasto)}. Confira no Gerenciador ou instale o evento no site.`;
    } else if (c.resultados === 0) {
      veredito = "Sem resultado";
      motivo = `Investiu ${brl(c.gasto)} e não gerou nenhum(a) ${G.resultado}, que é o que esse objetivo promete.`;
    } else if (med == null) {
      veredito = "Sem comparação";
      motivo = `${un(c.custoPorResultado!)}. Menos de ${MIN_CAMPANHAS_REGUA} campanhas com esse objetivo no período para comparar.${fadiga}`;
    } else if (c.custoPorResultado! <= med * ESCALAR) {
      veredito = "Escalar";
      motivo = `${un(c.custoPorResultado!)}, bem abaixo da mediana das campanhas de ${G.curto} (${un(med)}). É onde cabe mais verba.${fadiga}`;
    } else if (c.custoPorResultado! >= med * CORTAR) {
      veredito = "Cortar";
      motivo = `${un(c.custoPorResultado!)}, ${(c.custoPorResultado! / med).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x a mediana das campanhas de ${G.curto} (${un(med)}). A Meta chama isso de fadiga a partir de 2x.${fadiga}`;
    } else {
      veredito = "Manter";
      motivo = `${un(c.custoPorResultado!)}, dentro da faixa das campanhas do mesmo objetivo (mediana ${un(med)}).${fadiga}`;
    }
    return { ...c, veredito, motivo };
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
      };
    })
    .filter((g) => g.campanhas > 0)
    .sort((a, b) => b.gasto - a.gasto);

  const msg = grupos.find((g) => g.grupo === "mensagem");
  return {
    campanhas,
    grupos,
    gasto: campanhas.reduce((s, c) => s + c.gasto, 0),
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
