// Fechamento do mês (Phase 03.1.1.1, plano 08, D-06): os cartões da história em tela cheia que a Resultados da clínica abre. Módulo puro:
// sem React, sem banco, sem rede e sem IA; recebe só o que Resultados já carregou. Cada cartão leva UM número grande e se compara
// SOMENTE com o período anterior DA PRÓPRIA clínica, de mesmo tamanho, com as datas escritas no cartão (D-02: nenhuma outra clínica,
// nenhuma carteira). Nenhum número estimado ou "o que teria sido" (D-05): só o que foi medido. Dado que falta tira o cartão: nunca vira 0.
// D-04: a história não compartilha, não exporta e não envia nada; este módulo nem tem texto para isso.
import { nomeDaSaudacao } from "@/lib/leitura/fatos-hoje";
import { checarFraseCinco, variacaoPropria } from "@/lib/leitura/cinco-segundos";
import type { TomFato } from "@/lib/leitura/tipos";

/** Muda quando uma regra do Fechamento do mês muda. */
export const VERSAO_REGRAS_FECHAMENTO = 1;

/** A história serve para períodos de 28 a 31 dias (a mesma régua de "média do mês" da linha de 30 dias). */
const MIN_DIAS_DO_MES = 28;
const MAX_DIAS_DO_MES = 31;
const DIA_EM_MS = 86_400_000;

const emMs = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const dePeriodo = (de: string, ate: string) => `${ddmm(de)} a ${ddmm(ate)}`;

/** O desenho de um cartão (só dados: a peça desenha com tokens, nunca com HTML vindo da regra). */
export type VisualDoCartao =
  | { tipo: "barras"; valores: readonly (number | null)[]; legenda: string };

export type IdDoCartao = "abertura" | "whatsapp" | "final";

export interface CartaoDoMes {
  id: IdDoCartao;
  /** A etiqueta pequena de cima ("WhatsApp"). */
  rotulo: string;
  /** O ÚNICO número grande do cartão, já formatado. null nos cartões de texto (abertura e final). */
  numero: string | null;
  /** Texto grande dos cartões sem número ("Fechamento do mês"). */
  titulo?: string;
  /** Até 90 caracteres, sem jargão. */
  legenda: string;
  /** "▲ 50% · antes eram 200": só contra o período anterior da própria clínica. */
  comparacao?: string;
  /** As datas do período do cartão e do anterior, escritas no cartão ("01/10 a 30/10"). */
  periodo?: { atual: string; anterior: string };
  visual?: VisualDoCartao;
  tom: TomFato;
}

/** O que a Resultados já tem em mãos (as partes que faltam entram nos planos seguintes deste módulo). */
export interface EntradaDoMes {
  /** Nome da clínica (só abre o cartão de abertura quando começa com Dr. ou Dra.). */
  nome?: string | null;
  /** Primeiro e último dia FECHADOS do período, e quantos dias são. */
  inicio: string;
  fim: string;
  dias: number;
  /** O período anterior da própria clínica, do mesmo tamanho. */
  anterior: { inicio: string; fim: string };
  /** Conversas no WhatsApp: soma dos dias dos dois períodos e as conversas de cada dia do período. null = o histórico não cobre o período. */
  conversas?: { atual: number | null; antes: number | null; porDia: readonly (number | null)[] } | null;
}

/** De 28 a 31 dias (o dia de início e o de fim contam). */
export function periodoServeParaFechamento(start: string, end: string): boolean {
  const dias = Math.round((emMs(end) - emMs(start)) / DIA_EM_MS) + 1;
  return dias >= MIN_DIAS_DO_MES && dias <= MAX_DIAS_DO_MES;
}

/** "▲ 50% · antes eram 200": o sinal vai junto (nunca só a cor). Sem comparação possível (antes ausente ou zero) devolve null. */
function comparar(atual: number | null | undefined, antes: number | null | undefined, opcoes: { menorEhMelhor?: boolean } = {}): { texto: string; melhor: boolean | null } | null {
  const v = variacaoPropria(atual, antes, opcoes);
  if (!v || antes == null) return null;
  return { texto: `${v.texto} · antes eram ${inteiro(antes)}`, melhor: v.melhor };
}

const tomDe = (melhor: boolean | null | undefined): TomFato => (melhor === true ? "bom" : melhor === false ? "ruim" : "neutro");

/**
 * Os cartões do mês, na ordem da história: abertura, os que têm dado e o resumo final. Cada cartão passa por `checarFraseCinco`
 * (90 caracteres, sem jargão, sem comparar clínicas, sem promessa); o que não passa não entra.
 */
export function cartoesDoMes(e: EntradaDoMes): CartaoDoMes[] {
  const periodo = { atual: dePeriodo(e.inicio, e.fim), anterior: dePeriodo(e.anterior.inicio, e.anterior.fim) };
  const cartoes: CartaoDoMes[] = [];

  const saudacao = nomeDaSaudacao(e.nome);
  cartoes.push({
    id: "abertura",
    rotulo: "Fechamento do mês",
    numero: null,
    titulo: saudacao ? `${saudacao},` : "Seu mês",
    legenda: `seus últimos ${e.dias} dias chegaram.`,
    periodo: { atual: periodo.atual, anterior: periodo.anterior },
    tom: "neutro",
  });

  const c = e.conversas;
  if (c?.atual != null) {
    const comp = comparar(c.atual, c.antes);
    const valores = c.porDia.filter((v): v is number => v != null);
    const pico = valores.length ? Math.max(...valores) : null;
    cartoes.push({
      id: "whatsapp",
      rotulo: "WhatsApp",
      numero: inteiro(c.atual),
      legenda: "pessoas chamaram você",
      ...(comp ? { comparacao: comp.texto } : {}),
      periodo,
      ...(pico != null && pico > 0 ? { visual: { tipo: "barras" as const, valores: c.porDia, legenda: `Conversas por dia · pico de ${inteiro(pico)}` } } : {}),
      tom: tomDe(comp?.melhor),
    });
  }

  const partes: string[] = [];
  if (c?.atual != null) partes.push(`${inteiro(c.atual)} ${c.atual === 1 ? "chamou" : "chamaram"}`);
  cartoes.push({
    id: "final",
    rotulo: "Resumo",
    numero: null,
    titulo: "Fim do mês",
    legenda: partes.length ? `${partes.join(", ")}.` : "Este foi o seu mês.",
    periodo,
    tom: "neutro",
  });

  // A guarda de texto vale para a legenda e para a comparação de cada cartão.
  return cartoes.filter((k) => checarFraseCinco(k.legenda).length === 0 && (k.comparacao == null || checarFraseCinco(k.comparacao).length === 0));
}
