// Referências de mercado usadas para dizer se um número é bom, ok ou fraco.
//
// Regra da casa: só vira faixa colorida o que tem fonte com metodologia
// publicada (confiabilidade "alta" ou "media"). O resto aparece como
// "referência de mercado" sem pintar, ou nem aparece — e aí a régua é o
// histórico do próprio perfil (mesmo formato, mesmo objetivo de campanha).
//
// Atenção ao denominador: engajamento "por seguidor" (Rival IQ, Socialinsider,
// ~0,3–0,5%) e "por alcance" (mLabs, ~4,5%) são números de ordens diferentes.
// Aqui só se compara com a mesma fórmula da fonte.
//
// Levantamento feito em out/2026. Revisar a cada 6 meses.

export type Faixa = "bom" | "ok" | "fraco";
export type Confiabilidade = "alta" | "media" | "baixa";

export interface Benchmark {
  id: string;
  nome: string;
  formula: string;
  referencia: string; // o valor de mercado em texto
  fonte: string;
  ano: string;
  confiabilidade: Confiabilidade;
  // Classifica um valor. Ausente quando a fonte não sustenta faixas.
  classificar?: (v: number, ctx?: { seguidores?: number }) => Faixa;
}

const menorMelhor = (bom: number, ok: number) => (v: number): Faixa => (v <= bom ? "bom" : v <= ok ? "ok" : "fraco");
const maiorMelhor = (bom: number, ok: number) => (v: number): Faixa => (v >= bom ? "bom" : v >= ok ? "ok" : "fraco");

export const BENCHMARKS = {
  // ---------- Instagram ----------
  engajamentoPorAlcance: {
    id: "engajamentoPorAlcance",
    nome: "Taxa de engajamento (por alcance)",
    formula: "interações ÷ contas alcançadas",
    referencia: "média Brasil ~4,5% (2025); marcas globais 3,2–3,7%",
    fonte: "mLabs Índice 2025 (30 mi de posts BR); Socialinsider 2025–26",
    ano: "2025",
    confiabilidade: "media",
    classificar: maiorMelhor(0.05, 0.025),
  },
  crescimentoMensal: {
    id: "crescimentoMensal",
    nome: "Crescimento de seguidores no mês",
    formula: "seguidores ganhos no mês ÷ seguidores no início",
    referencia: "~1,7%/mês em contas até 5 mil; ~0,9%/mês acima de 100 mil",
    fonte: "Socialinsider 2025; Buffer 2025 (1,3%/mês média)",
    ano: "2025",
    confiabilidade: "media",
    classificar: (v, ctx) =>
      (ctx?.seguidores ?? 0) < 10000 ? maiorMelhor(0.02, 0.008)(v) : maiorMelhor(0.013, 0.005)(v),
  },
  frequenciaSemanal: {
    id: "frequenciaSemanal",
    nome: "Posts por semana",
    formula: "posts no feed ÷ semanas",
    referencia: "saúde: engajamento máximo com ~2/semana; mediana geral 3,7–4,5/semana",
    fonte: "Hootsuite Healthcare 2025; Rival IQ 2025",
    ano: "2025",
    confiabilidade: "media",
    classificar: maiorMelhor(3, 2),
  },
  alcanceReelsPorSeguidor: {
    id: "alcanceReelsPorSeguidor",
    nome: "Alcance de Reels ÷ seguidores",
    formula: "alcance mediano dos Reels ÷ seguidores",
    referencia: "mediana 9,8% (1–5 mil), 7,6% (5–10 mil), 7,1% (10–50 mil), 5,6% (50–100 mil), 5,0% (100 mil+)",
    fonte: "Socialinsider, 140 mil Reels, jan–jun/2026",
    ano: "2026",
    confiabilidade: "media",
    classificar: (v, ctx) => {
      const s = ctx?.seguidores ?? 0;
      const mediana = s < 5000 ? 0.098 : s < 10000 ? 0.076 : s < 50000 ? 0.071 : s < 100000 ? 0.056 : 0.05;
      return v >= mediana * 1.5 ? "bom" : v >= mediana * 0.75 ? "ok" : "fraco";
    },
  },

  // ---------- WhatsApp / atendimento ----------
  primeiraResposta: {
    id: "primeiraResposta",
    nome: "Tempo até a 1ª resposta",
    formula: "mediana do tempo entre a 1ª mensagem do paciente e a 1ª resposta",
    referencia: "63% dos brasileiros esperam resposta em até 5 min (Opinion Box); num estudo com leads de empresas nos EUA (HBR, 2011), quem respondeu em até 1h teve ~7x mais chance de qualificar o lead, sem medir pacientes",
    fonte: "HBR, The Short Life of Online Sales Leads (2011); Opinion Box/Mobile Time",
    ano: "2011–2025",
    confiabilidade: "alta",
    classificar: menorMelhor(5 * 60, 30 * 60),
  },

  // ---------- Funil da clínica ----------
  leadParaAgendamento: {
    id: "leadParaAgendamento",
    nome: "Lead → agendamento",
    formula: "leads que agendaram ÷ leads",
    referencia: "39,9% em 278 mil leads de clínicas (EUA)",
    fonte: "Liine 2023",
    ano: "2023",
    confiabilidade: "media",
    classificar: maiorMelhor(0.4, 0.2),
  },
  noShow: {
    id: "noShow",
    nome: "Faltas (no-show)",
    formula: "consultas faltadas ÷ agendadas",
    referencia: "média mundial ~23% (105 estudos); 85% das clínicas privadas BR entre 5% e 20%",
    fonte: "Dantas et al., Health Policy 2018; Doctoralia Panorama 2022/2024",
    ano: "2018–2024",
    confiabilidade: "alta",
    classificar: menorMelhor(0.1, 0.2),
  },

  // ---------- Meta Ads (sempre dentro do mesmo objetivo) ----------
  fadigaCriativo: {
    id: "fadigaCriativo",
    nome: "Fadiga de criativo",
    formula: "custo por resultado ÷ mediana do mesmo objetivo",
    referencia: "a Meta marca fadiga quando o custo por resultado chega a 2x o histórico",
    fonte: "Meta Business Help (status de veiculação “Creative fatigue”)",
    ano: "atual",
    confiabilidade: "alta",
  },
  ctrTrafego: {
    id: "ctrTrafego",
    nome: "CTR de link (campanha de tráfego)",
    formula: "cliques no link ÷ impressões",
    referencia: "médicos 0,83%; todos os setores 1,71% (EUA)",
    fonte: "WordStream/LocaliQ Facebook Ads Benchmarks 2025",
    ano: "2025",
    confiabilidade: "media",
    classificar: maiorMelhor(0.015, 0.008),
  },
  custoPorConversa: {
    id: "custoPorConversa",
    nome: "Custo por conversa (anúncio para WhatsApp/Direct)",
    formula: "investido ÷ conversas iniciadas",
    referencia: "R$ 5–15 em serviços locais; R$ 10–30 em praça competitiva (sem estudo independente)",
    fonte: "agências BR 2025–26",
    ano: "2026",
    confiabilidade: "baixa",
  },
} satisfies Record<string, Benchmark>;

/**
 * Citação da Harvard Business Review (2011) com o contexto certo. O estudo mediu leads de empresas
 * nos EUA e fala em "qualificar" o lead, não em converter nem em paciente. Usar sempre este texto.
 */
export const CITACAO_HBR_RESPOSTA =
  "Num estudo com leads de empresas nos EUA (Harvard Business Review, 2011), quem respondeu na primeira hora teve cerca de 7 vezes mais chance de qualificar o lead. O estudo não mediu pacientes de clínica.";

export const ROTULO_FAIXA: Record<Faixa, string> = { bom: "acima do mercado", ok: "na média do mercado", fraco: "abaixo do mercado" };
export const COR_FAIXA: Record<Faixa, string> = { bom: "var(--good-text)", ok: "var(--text-dim)", fraco: "var(--crit)" };

export function avaliar(b: Benchmark, v: number | null | undefined, ctx?: { seguidores?: number }): Faixa | null {
  if (v == null || !Number.isFinite(v) || !b.classificar || b.confiabilidade === "baixa") return null;
  return b.classificar(v, ctx);
}
