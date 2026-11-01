import { LIMITES } from "./limites.js";
// Definições centrais das métricas que aparecem em mais de uma tela ou relatório.
// Cada métrica declara: período efetivo, unidade contada, cobertura e denominador.
// Regra: zero medido (a fonte está ligada e contou zero) ≠ dado indisponível (não há como medir).
// Telas e PDFs devem usar estas funções em vez de recalcular por conta própria.

export type Estado = "medido" | "zero" | "indisponivel";

export interface Medida {
  valor: number | null; // null quando indisponível
  estado: Estado;
  unidade: string; // o que está sendo contado ("R$ por conversa", "pessoas", ...)
  numerador?: number | null;
  denominador?: number | null;
  escopo: string; // o recorte (ex.: "todas as campanhas", "só campanhas de mensagem")
  periodo?: { de: string; ate: string } | null; // período efetivo (o que tem dado), não o pedido
  cobertura?: { diasComDado: number; diasPeriodo: number } | null;
  motivo?: string; // por que está indisponível
}

const indisp = (unidade: string, escopo: string, motivo: string): Medida => ({ valor: null, estado: "indisponivel", unidade, escopo, motivo });

/** Razão a/b com estados: b = 0 → indisponível (não existe custo por conversa sem conversa). */
export function razao(num: number | null | undefined, den: number | null | undefined, unidade: string, escopo: string, motivoSemBase = "Sem base para dividir."): Medida {
  if (num == null || den == null) return indisp(unidade, escopo, "Fonte sem dado no período.");
  if (den <= 0) return indisp(unidade, escopo, motivoSemBase);
  const v = num / den;
  return { valor: v, estado: v === 0 ? "zero" : "medido", unidade, numerador: num, denominador: den, escopo };
}

// ---------------------------------------------------------------- anúncios

/** Custo por conversa da conta inteira: gasto de TODAS as campanhas ÷ conversas de todas as campanhas. */
export function custoPorConversaConta(gasto: number | null | undefined, conversas: number | null | undefined): Medida {
  return razao(gasto, conversas, "R$ por conversa", "todas as campanhas", "Nenhuma conversa iniciada pelos anúncios no período.");
}

/** Custo por conversa só das campanhas de mensagem (objetivo mensagem): gasto delas ÷ conversas delas. */
export function custoPorConversaMensagem(gastoMensagem: number | null | undefined, conversasMensagem: number | null | undefined): Medida {
  return razao(gastoMensagem, conversasMensagem, "R$ por conversa", "só campanhas de mensagem", "Sem campanha de mensagem com conversa no período.");
}

// ---------------------------------------------------------------- percentuais

/**
 * Formata uma taxa sem esconder conversões pequenas: 2 de 1.365 vira "0,15%", não "0%".
 * Abaixo de 0,1% mostra "<0,1%". Zero só quando o numerador é zero de verdade.
 * Denominador zero ou ausente → "—" (indisponível, não 0%).
 */
export function fmtTaxa(num: number | null | undefined, den: number | null | undefined): string {
  if (num == null || den == null || den <= 0) return "—";
  if (num <= 0) return "0%";
  const p = (num / den) * 100;
  if (p < 0.1) return "<0,1%";
  const casas = p < 1 ? 2 : p < 10 ? 1 : 0;
  return `${p.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
}

/** Mesmo critério para um valor já em fração (0..1). */
export function fmtFracao(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v <= 0) return "0%";
  return fmtTaxa(v * 1e6, 1e6);
}

// ---------------------------------------------------------------- alcance e seguidores

/** Rótulos fixos para não misturar os três tipos de alcance. */
export const ALCANCE = {
  unico: { rotulo: "Alcance (contas únicas)", explica: "Pessoas diferentes que viram a conta no período, como o “Contas alcançadas” do Instagram. Vem da Meta para o período inteiro; não é soma de dias." },
  somaDiaria: { rotulo: "Alcance (soma dos dias)", explica: "Soma do alcance de cada dia. A mesma pessoa vista em dois dias conta duas vezes; por isso passa do alcance único." },
  posts: { rotulo: "Alcance acumulado dos posts", explica: "Soma do alcance de cada post publicado no período, desde a publicação até hoje (métrica de vida do post, não só do período)." },
} as const;

export interface DiaSeguidores {
  date: string;
  followers_count?: number | null;
  new_followers?: number | null;
  unfollowers?: number | null;
}

/**
 * Seguidores no período com a MESMA cobertura para ganhos, saídas e saldo:
 * - ganhos e saídas: só dias em que a Meta trouxe os dois números (o Instagram só fornece
 *   ganhos/saídas dos últimos 30 dias);
 * - saldo pelo total: diferença de followers_count entre o primeiro e o último dia com total;
 * - saldo pelos ganhos − saídas só é comparável quando cobre os mesmos dias.
 */
export function seguidoresNoPeriodo(dias: DiaSeguidores[], de: string, ate: string) {
  const noPeriodo = dias.filter((d) => d.date >= de && d.date <= ate).sort((a, b) => a.date.localeCompare(b.date));
  const ambos = noPeriodo.filter((d) => d.new_followers != null && d.unfollowers != null);
  const comTotal = noPeriodo.filter((d) => d.followers_count != null);
  const diasPeriodo = Math.max(1, Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) + 1);
  const ganhos = ambos.reduce((s, d) => s + Number(d.new_followers), 0);
  const saidas = ambos.reduce((s, d) => s + Number(d.unfollowers), 0);
  const saldoTotal = comTotal.length >= 2 ? Number(comTotal[comTotal.length - 1].followers_count) - Number(comTotal[0].followers_count) : null;
  return {
    ganhos: ambos.length ? ganhos : null,
    saidas: ambos.length ? saidas : null,
    saldoGanhosSaidas: ambos.length ? ganhos - saidas : null,
    coberturaGanhos: { diasComDado: ambos.length, diasPeriodo, de: ambos[0]?.date ?? null, ate: ambos[ambos.length - 1]?.date ?? null },
    saldoTotal,
    coberturaTotal: { diasComDado: comTotal.length, diasPeriodo, de: comTotal[0]?.date ?? null, ate: comTotal[comTotal.length - 1]?.date ?? null },
    // Os dois saldos só podem ser comparados se cobrem os mesmos dias.
    mesmaCobertura: ambos.length > 0 && ambos.length === comTotal.length && ambos[0]?.date === comTotal[0]?.date,
  };
}

/**
 * Um número só de seguidores para tela, PDF e texto do WhatsApp: o SALDO LÍQUIDO do período.
 * Régua, em ordem:
 *   1. variação do total de seguidores do primeiro ao último dia com o total gravado (é o que o médico vê no perfil);
 *   2. sem o total em 2 dias, ganhos menos saídas nos dias em que a Meta trouxe os dois números;
 *   3. sem nenhum dos dois, não há saldo (os ganhos sozinhos não viram "saldo").
 * Os ganhos e as saídas ficam como detalhe (texto do "i"), nunca como o número principal.
 */
export interface SaldoSeguidores {
  saldo: number | null;
  regua: "total" | "ganhos_saidas" | null;
  de: string | null;
  ate: string | null;
  totalFinal: number | null;
  ganhos: number | null;
  saidas: number | null;
  /** Detalhe para o "i": de onde vem o saldo e os ganhos/saídas, em português simples. */
  detalhe: string;
}

export function saldoSeguidores(dias: DiaSeguidores[], de: string, ate: string): SaldoSeguidores {
  const s = seguidoresNoPeriodo(dias, de, ate);
  const fmt = (v: number) => v.toLocaleString("pt-BR");
  const sinal = (v: number) => `${v >= 0 ? "+" : "-"}${fmt(Math.abs(v))}`;
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const comTotal = dias.filter((d) => d.date >= de && d.date <= ate && d.followers_count != null).sort((a, b) => a.date.localeCompare(b.date));
  const totalFinal = comTotal.length ? Number(comTotal[comTotal.length - 1].followers_count) : null;
  const ganhosTxt =
    s.ganhos != null && s.saidas != null
      ? ` Nos ${s.coberturaGanhos.diasComDado} dias em que a Meta informou entradas e saídas, ${fmt(s.ganhos)} começaram a seguir e ${fmt(s.saidas)} deixaram de seguir.`
      : "";
  if (s.saldoTotal != null)
    return {
      saldo: s.saldoTotal,
      regua: "total",
      de: s.coberturaTotal.de,
      ate: s.coberturaTotal.ate,
      totalFinal,
      ganhos: s.ganhos,
      saidas: s.saidas,
      detalhe: `Saldo de ${sinal(s.saldoTotal)}: total de seguidores em ${dm(s.coberturaTotal.ate!)} (${fmt(totalFinal ?? 0)}) menos o total em ${dm(s.coberturaTotal.de!)}.${ganhosTxt}`,
    };
  if (s.saldoGanhosSaidas != null)
    return {
      saldo: s.saldoGanhosSaidas,
      regua: "ganhos_saidas",
      de: s.coberturaGanhos.de,
      ate: s.coberturaGanhos.ate,
      totalFinal,
      ganhos: s.ganhos,
      saidas: s.saidas,
      detalhe: `Saldo de ${sinal(s.saldoGanhosSaidas)}: quem começou a seguir menos quem deixou de seguir, em ${s.coberturaGanhos.diasComDado} dias com os dois números (o total de seguidores não foi gravado em 2 dias do período).${ganhosTxt}`,
    };
  return { saldo: null, regua: null, de: null, ate: null, totalFinal, ganhos: s.ganhos, saidas: s.saidas, detalhe: "Sem o total de seguidores em 2 dias nem as saídas medidas: não dá para calcular o saldo do período." };
}

// ---------------------------------------------------------------- amostra mínima de posts

/**
 * Um formato, horário ou tema só pode ser chamado de "melhor" ou "pior" com pelo menos 8 posts no grupo.
 * Abaixo disso o dado aparece com o rótulo "amostra pequena" e sem conclusão em texto.
 */
export const MIN_POSTS_CONCLUSAO: number = LIMITES.amostra.conteudo.postsConclusao;
export const ROTULO_AMOSTRA_PEQUENA = "amostra pequena";

/** Selo de confiança por número de posts: baixa (até 7), média (8 a 19), alta (20 ou mais). */
export function confiancaPorPosts(n: number): "baixa" | "media" | "alta" {
  if (n >= 20) return "alta";
  if (n >= MIN_POSTS_CONCLUSAO) return "media";
  return "baixa";
}

export const podeConcluir = (n: number) => n >= MIN_POSTS_CONCLUSAO;
