// Mapa de horários dos PRÓPRIOS posts da clínica (Phase 03.1.1.1, plano 07, D-01): o dia da semana e a hora (fuso de São Paulo) em que cada
// post saiu, com o alcance médio por post de cada célula. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê os posts que a aba
// já carregou (D-08). D-02: nenhum dado de outra clínica entra aqui, e o mapa de seguidores online do Público (mapa-de-calor.tsx) é outra
// coisa e não muda. D-05: só uma célula com pelo menos MIN_POSTS_NO_HORARIO posts pode ganhar o ★ ou a palavra "melhor".
import { brazilWeekdayAndHour } from "@/lib/report-metrics";
import { numeroCurto } from "@/lib/texto-que-cabe";

/** Posts mínimos numa célula (dia e hora) para ela poder ser apontada como o melhor horário. */
export const MIN_POSTS_NO_HORARIO = 2;

/** Quando nenhuma célula tem posts suficientes para apontar o melhor. */
export const FRASE_SEM_MELHOR_HORARIO = "Poucos posts por horário para apontar o melhor.";

export interface CelulaDoMapa {
  /** 0 = domingo ... 6 = sábado (fuso de São Paulo). */
  dia: number;
  /** Hora cheia, 0 a 23 (fuso de São Paulo). */
  hora: number;
  /** Posts com alcance medido nesse dia e hora. */
  posts: number;
  /** Alcance médio por post (média, não mediana: é o que a célula diz "pessoas por post"). */
  alcancePorPost: number;
}

/** Ordem das linhas do mapa: segunda a domingo. */
export const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0] as const;
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const DIAS_POR_EXTENSO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(Number(v));

/**
 * Agrupa os posts da clínica por dia da semana e hora de São Paulo. Só entra post com data e alcance medido (post sem alcance não vira
 * zero). Devolve só as células que têm post, em ordem de dia (domingo primeiro) e hora; quem monta o desenho cria as colunas só com as horas
 * que aparecem aqui.
 */
export function mapaDosPosts(posts: readonly { posted_at?: string | null; reach?: number | null }[]): CelulaDoMapa[] {
  const grupos = new Map<string, { dia: number; hora: number; total: number; posts: number }>();
  for (const p of posts) {
    if (!p.posted_at || !comValor(p.reach)) continue;
    const quando = new Date(p.posted_at);
    if (Number.isNaN(quando.getTime())) continue;
    const { weekday, hour } = brazilWeekdayAndHour(p.posted_at);
    const chave = `${weekday}-${hour}`;
    const g = grupos.get(chave) ?? { dia: weekday, hora: hour, total: 0, posts: 0 };
    g.total += Number(p.reach);
    g.posts += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ dia: g.dia, hora: g.hora, posts: g.posts, alcancePorPost: g.total / g.posts }))
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora);
}

/**
 * A célula com o maior alcance por post entre as que têm pelo menos MIN_POSTS_NO_HORARIO posts (empate: a com mais posts, depois a mais cedo
 * na semana). Nenhuma com posts suficientes: null, e a tela diz FRASE_SEM_MELHOR_HORARIO (nunca aponta um melhor com 1 post só).
 */
export function melhorHorario(celulas: readonly CelulaDoMapa[]): CelulaDoMapa | null {
  const elegiveis = celulas.filter((c) => c.posts >= MIN_POSTS_NO_HORARIO);
  if (elegiveis.length === 0) return null;
  return [...elegiveis].sort((a, b) => b.alcancePorPost - a.alcancePorPost || b.posts - a.posts || a.dia - b.dia || a.hora - b.hora)[0];
}

/** As horas que têm pelo menos um post, em ordem: são as colunas do mapa. */
export function horasDoMapa(celulas: readonly CelulaDoMapa[]): number[] {
  return [...new Set(celulas.map((c) => c.hora))].sort((a, b) => a - b);
}

/** "Quarta 18h". */
export const nomeDoHorario = (c: Pick<CelulaDoMapa, "dia" | "hora">) => `${DIAS_POR_EXTENSO[c.dia]} ${c.hora}h`;

const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A frase de uma célula tocada, comparada só com o melhor horário DOS PRÓPRIOS posts. Com poucos posts a frase diz que é pouco para
 * comparar e não usa "melhor" nem "pior".
 */
export function fraseDaCelula(c: CelulaDoMapa, melhor: CelulaDoMapa | null): string {
  const base = `${nomeDoHorario(c)}: ${numeroCurto(c.alcancePorPost)} pessoas por post`;
  if (c.posts < MIN_POSTS_NO_HORARIO) return `${base} · só ${c.posts} post, pouco para comparar.`;
  if (!melhor) return `${base} · ${c.posts} posts.`;
  if (c.dia === melhor.dia && c.hora === melhor.hora) return `${base} · o seu melhor horário.`;
  const razao = c.alcancePorPost > 0 ? melhor.alcancePorPost / c.alcancePorPost : null;
  return razao != null && razao >= 1.05 ? `${base} · ${umaCasa(razao)}× menos que ${nomeDoHorario(melhor)}.` : `${base} · parecido com ${nomeDoHorario(melhor)}.`;
}
