// A nota do dia da Hoje (Phase 03.1.1.1, D-03: "Entra, com a regra do piloto"). Uma regra fixa, sem IA: cada sinal compara a clínica
// com ELA MESMA no período anterior (D-02: nenhum sinal usa outra clínica); 50 = igual a antes; cada 2% melhor soma 1 ponto e cada 2%
// pior tira 1, de 0 a 100; a nota é a média dos sinais com dado confiável. Sinal sem período anterior, anterior zerado ou abaixo da base
// mínima NÃO entra na média e vai para "Falta dado" com o motivo (nunca conta como 0). Sem nenhum sinal, a nota é null: a tela diz
// "Falta dado", nunca 0. Módulo puro: sem React, sem banco, sem rede.

/** Muda quando a regra da nota muda (faixas, pontos por percentual ou a média). */
export const VERSAO_REGRA_DA_NOTA = 1;

export type PalavraDaNota = "Ruim" | "Atenção" | "Bom" | "Ótimo";

/** As faixas da palavra, na ordem; a tela marca a atual. */
export const FAIXAS_DA_NOTA = ["0–49 Ruim", "50–69 Atenção", "70–84 Bom", "85–100 Ótimo"] as const;

/** A regra escrita para quem toca na nota: 3 frases curtas, sempre rotulada como regra e sem prometer resultado. */
export const REGRA_DA_NOTA = [
  "Cada sinal compara a clínica com ela mesma no período anterior. 50 = igual.",
  "Cada 2% melhor soma 1 ponto e cada 2% pior tira 1. A nota é a média dos sinais com dado.",
  "Regra do Nexo. A nota mostra o rumo e não garante resultado.",
] as const;

export interface EntradaDoFator {
  id: string;
  rotulo: string;
  /** O número deste período. null = não medido. */
  atual: number | null;
  /** O número do período anterior da MESMA clínica. null = não medido. */
  anterior: number | null;
  /** Custo e espera: cair é melhor. */
  menorEhMelhor?: boolean;
  /** Menor base aceita no período anterior para o sinal valer (LIMITES). */
  baseMinima?: number;
  /** A base que vale contra `baseMinima` quando não é o próprio anterior (por exemplo as conversas do anúncio, no custo por conversa). */
  baseDoAnterior?: number | null;
  /** O motivo escrito quando falta o atual ou o anterior. */
  motivoSemDado?: string;
  /** Como o número aparece na linha do sinal ("R$ 33,33"). */
  formatar?: (n: number) => string;
}

export interface FatorDaNota {
  id: string;
  rotulo: string;
  atual: number;
  anterior: number;
  /** Quanto o sinal ficou melhor (+) ou pior (−) que antes, em %, já olhando para o lado bom (custo que cai é +). */
  dPct: number;
  /** 0 a 100; 50 = igual a antes. */
  pontos: number;
  /** "162 contra 100 · ▲ 62%": até 90 caracteres, com o sinal da direção do número (nunca só a cor). */
  linha: string;
}

export interface FatorSemDado {
  id: string;
  rotulo: string;
  motivo: string;
}

export interface NotaDoDia {
  /** 0 a 100, ou null quando nenhum sinal tem dado (a tela diz "Falta dado"). */
  nota: number | null;
  palavra: PalavraDaNota | null;
  /** Os sinais que entraram na média, na ordem da entrada. */
  fatores: FatorDaNota[];
  /** Os que ficaram de fora, cada um com o motivo. */
  faltaDado: FatorSemDado[];
  versao: number;
}

const limitar = (n: number) => Math.min(100, Math.max(0, n));

/** Pontos de um sinal pela variação em % já olhando para o lado bom: 50 = igual, cada 2% soma ou tira 1 ponto. */
export function pontosDoFator(dPct: number): number {
  return limitar(Math.round(50 + dPct / 2));
}

export function palavraDaNota(nota: number): PalavraDaNota {
  if (nota >= 85) return "Ótimo";
  if (nota >= 70) return "Bom";
  if (nota >= 50) return "Atenção";
  return "Ruim";
}

const formatoPadrao = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const ehNumero = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

function linhaDoFator(e: EntradaDoFator & { atual: number; anterior: number }, mudancaPct: number): string {
  const f = e.formatar ?? formatoPadrao;
  const sinal = mudancaPct === 0 ? "= igual" : `${mudancaPct > 0 ? "▲" : "▼"} ${Math.abs(mudancaPct)}%`;
  return `${f(e.atual)} contra ${f(e.anterior)} · ${sinal}`;
}

/** Por que o sinal não entra na média, ou null quando entra. */
function motivoDeFora(e: EntradaDoFator): string | null {
  if (!ehNumero(e.atual) || !ehNumero(e.anterior)) return e.motivoSemDado ?? "sem medida neste período ou no anterior";
  if (e.anterior <= 0) return "o período anterior foi zero, sem base para comparar";
  if (e.baseMinima != null) {
    const base = e.baseDoAnterior ?? e.anterior;
    if (!ehNumero(base) || base < e.baseMinima) return `base pequena: ${ehNumero(base) ? Math.round(base) : 0} de ${e.baseMinima}`;
  }
  return null;
}

/** A nota do dia: média arredondada dos sinais com dado; null quando nenhum tem. */
export function notaDoDia(entradas: readonly EntradaDoFator[]): NotaDoDia {
  const fatores: FatorDaNota[] = [];
  const faltaDado: FatorSemDado[] = [];
  for (const e of entradas) {
    const motivo = motivoDeFora(e);
    if (motivo != null) {
      faltaDado.push({ id: e.id, rotulo: e.rotulo, motivo });
      continue;
    }
    const atual = e.atual as number;
    const anterior = e.anterior as number;
    const mudanca = Math.round(((atual - anterior) / anterior) * 100) || 0;
    const dPct = (e.menorEhMelhor ? Math.round(((anterior - atual) / anterior) * 100) : mudanca) || 0;
    fatores.push({
      id: e.id,
      rotulo: e.rotulo,
      atual,
      anterior,
      dPct,
      pontos: pontosDoFator(dPct),
      linha: linhaDoFator({ ...e, atual, anterior }, mudanca),
    });
  }
  if (fatores.length === 0) return { nota: null, palavra: null, fatores, faltaDado, versao: VERSAO_REGRA_DA_NOTA };
  const nota = limitar(Math.round(fatores.reduce((s, f) => s + f.pontos, 0) / fatores.length));
  return { nota, palavra: palavraDaNota(nota), fatores, faltaDado, versao: VERSAO_REGRA_DA_NOTA };
}
