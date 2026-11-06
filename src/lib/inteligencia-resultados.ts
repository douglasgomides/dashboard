// Inteligência da tela de Resultados (inspirada nas metas e no "o que mudou" do Databox).
// Regras fixas e explicáveis, sem IA: o texto sempre cita os números de onde saiu.

export const METRICAS_META = ["mandaram_mensagem", "agendaram", "fecharam"] as const;
export type MetricaMeta = (typeof METRICAS_META)[number];

export const ROTULO_META: Record<MetricaMeta, string> = {
  mandaram_mensagem: "Pessoas que chamaram",
  agendaram: "Agendamentos",
  fecharam: "Fechamentos",
};

export type StatusMeta = "batida" | "no_prazo" | "em_risco" | "fora_do_prazo" | "cedo";

export interface RitmoMeta {
  status: StatusMeta;
  atual: number;
  meta: number;
  /** Progresso de 0 a 100 (não passa de 100). */
  pct: number;
  /** Quanto falta para a meta (0 se batida). */
  faltam: number;
  /** Quanto precisa por dia, nos dias que restam. null se o mês acabou ou a meta foi batida. */
  porDia: number | null;
  /** Onde o mês termina se o ritmo atual continuar. null cedo demais para projetar. */
  projecao: number | null;
  diasRestantes: number;
}

/** Os primeiros dias do mês não dizem nada sobre o ritmo: abaixo disso, o status é "cedo". */
export const DIAS_MINIMOS_PARA_PROJETAR = 5;

/**
 * Ritmo da meta no mês. Projeção linear: atual / dias passados * dias do mês.
 * no_prazo: a projeção alcança a meta. em_risco: alcança de 80% a 99%. fora_do_prazo: abaixo de 80%.
 */
export function ritmoDaMeta(meta: number, atual: number, diasPassados: number, diasNoMes: number): RitmoMeta {
  const passados = Math.min(Math.max(diasPassados, 0), diasNoMes);
  const diasRestantes = Math.max(diasNoMes - passados, 0);
  const faltam = Math.max(meta - atual, 0);
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0;
  const base = { atual, meta, pct, faltam, diasRestantes };
  if (atual >= meta) return { ...base, status: "batida", porDia: null, projecao: passados > 0 ? Math.round((atual / passados) * diasNoMes) : null };
  const porDia = diasRestantes > 0 ? Math.ceil((faltam / diasRestantes) * 10) / 10 : null;
  if (passados < DIAS_MINIMOS_PARA_PROJETAR) return { ...base, status: "cedo", porDia, projecao: null };
  const projecao = Math.round((atual / passados) * diasNoMes);
  const status: StatusMeta = projecao >= meta ? "no_prazo" : projecao >= meta * 0.8 ? "em_risco" : "fora_do_prazo";
  return { ...base, status, porDia, projecao };
}

export const ROTULO_STATUS: Record<StatusMeta, string> = {
  batida: "Meta batida",
  no_prazo: "No prazo",
  em_risco: "Em risco",
  fora_do_prazo: "Fora do prazo",
  cedo: "Cedo para dizer",
};

export interface Leitura { tom: "up" | "down" | "info"; texto: string }
export interface NumerosLeitura { mandaram_mensagem?: number | null; agendaram?: number | null; fecharam?: number | null }

/** Base mínima no período anterior para falar de variação: abaixo disso, 2 pessoas viram "+100%". */
const BASE_MINIMA = 10;
const VARIACAO_MINIMA = 0.1;

const f = (n: number) => n.toLocaleString("pt-BR");
const taxa = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null);

/**
 * "O que mudou": compara o período com o anterior e escreve de 0 a 4 frases, com os números.
 * Só fala do que foi medido nos dois períodos. Variação pequena ou base pequena não vira frase.
 */
export function leituraDoPeriodo(atual: NumerosLeitura, anterior: NumerosLeitura | null | undefined): Leitura[] {
  if (!anterior) return [];
  const out: Leitura[] = [];
  const nomes: Record<keyof NumerosLeitura, [string, string]> = {
    mandaram_mensagem: ["Mais pessoas chamaram a clínica", "Menos pessoas chamaram a clínica"],
    agendaram: ["Os agendamentos subiram", "Os agendamentos caíram"],
    fecharam: ["Os fechamentos subiram", "Os fechamentos caíram"],
  };
  const var_: Partial<Record<keyof NumerosLeitura, number>> = {};
  for (const k of ["mandaram_mensagem", "agendaram", "fecharam"] as const) {
    const a = atual[k], b = anterior[k];
    if (a == null || b == null || b < BASE_MINIMA) continue;
    const v = (a - b) / b;
    var_[k] = v;
    if (Math.abs(v) >= VARIACAO_MINIMA)
      out.push({ tom: v > 0 ? "up" : "down", texto: `${nomes[k][v > 0 ? 0 : 1]} ${Math.round(Math.abs(v) * 100)}% (de ${f(b)} para ${f(a)}).` });
  }
  const msgA = atual.mandaram_mensagem, agA = atual.agendaram, msgB = anterior.mandaram_mensagem, agB = anterior.agendaram;
  if (msgA != null && agA != null && msgB != null && agB != null && msgA >= 30 && msgB >= 30) {
    const tA = taxa(agA, msgA)!, tB = taxa(agB, msgB)!;
    if (Math.abs(tA - tB) >= 1.5) {
      const r = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      out.push({ tom: tA > tB ? "up" : "down", texto: `De cada 100 pessoas que chamaram, ${r(tA)} agendaram (antes, ${r(tB)}).` });
    }
    const vm = var_.mandaram_mensagem, va = var_.agendaram;
    if (vm != null && va != null) {
      if (vm >= VARIACAO_MINIMA && va <= -VARIACAO_MINIMA)
        out.push({ tom: "info", texto: "Chegou mais gente, mas agendou menos: o ponto fraco está na conversa depois do primeiro contato, não em atrair pessoas." });
      else if (vm <= -VARIACAO_MINIMA && va <= -VARIACAO_MINIMA)
        out.push({ tom: "info", texto: "Os agendamentos caíram junto com os contatos: o ponto fraco está em atrair mais pessoas." });
    }
  }
  return out.slice(0, 4);
}

/** Dias do mês e dias passados (inclui hoje) para uma data ISO yyyy-mm-dd. */
export function diasDoMes(hojeIso: string): { passados: number; total: number; inicio: string } {
  const [y, m, d] = hojeIso.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { passados: d, total, inicio: `${hojeIso.slice(0, 7)}-01` };
}
