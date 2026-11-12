// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03, D-01): o veredito (palavra + UMA frase com número grande), os
// 3 anéis Conversas, Agendaram e Fecharam contra o período anterior DA PRÓPRIA clínica e, nas partes seguintes deste módulo, o dinheiro, a
// comparação "você agora contra você antes" e as descobertas. Módulo puro: sem React, sem banco, sem rede e sem IA; recebe o que a tela
// já carregou. D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero.
import { LIMITES } from "@/lib/limites";
import { variacaoPropria, vereditoDosFatos, checarFraseCinco, textoDaFrase, type ParteDaFrase, type VariacaoPropria, type Veredito } from "./cinco-segundos";
import type { FatosDaTela, TomFato } from "./tipos";

/** Muda quando uma regra de Resultados no formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO_RESULTADOS = 1;

/**
 * Abaixo disto de pessoas no período anterior a variação não é dita: 2 pessoas viram "+100%". É a mesma base de
 * `leituraDoPeriodo` (inteligencia-resultados.ts), a que o texto "O que mudou" já respeita.
 */
const BASE_DO_ANTERIOR = 10;

export type ChaveDoFunil = "mandaram_mensagem" | "agendaram" | "fecharam";
const ORDEM_DO_FUNIL: readonly ChaveDoFunil[] = ["mandaram_mensagem", "agendaram", "fecharam"];
const ROTULO_DO_FUNIL: Record<ChaveDoFunil, string> = { mandaram_mensagem: "Conversas", agendaram: "Agendaram", fecharam: "Fecharam" };
/** Base mínima da etapa de partida de cada passagem (LIMITES.funil): abaixo dela a tela diz "N de M", sem %. */
const BASE_DA_PASSAGEM: Record<ChaveDoFunil, number> = { mandaram_mensagem: 0, agendaram: LIMITES.funil.minLeads, fecharam: LIMITES.funil.minAgendamentos };

// ---------- entrada ----------

export interface LadoDeAnuncios {
  gasto: number | null;
  conversas: number | null;
}

export interface DiaDeAnuncios {
  dia: string;
  gasto: number | null;
  conversas: number | null;
}

export interface MedidaDeSalvos {
  salvos: number;
  alcance: number;
}

/** O retorno em R$ já resumido pela tela a partir de montarRoi (a regra do cálculo continua sendo a de src/lib/roi.ts). */
export interface RetornoDaEntrada {
  calculavel: boolean;
  /** Quanto voltou para cada R$ 1 investido em aquisição. */
  retornoPorReal: number | null;
  /** Por que não há número, em poucas palavras ("precisa do valor médio da consulta"). */
  motivo: string | null;
  /** O que falta é o valor médio da consulta: só a equipe tem o lugar onde ele é informado. */
  equipeInformaValor: boolean;
}

/** O que Resultados da clínica já tem carregado quando monta o formato 5 segundos. */
export interface EntradaCincoResultados {
  /** Fatos de Resultados (portão e leitura). null = ainda sem fatos. */
  fatos: FatosDaTela | null;
  /** Dias fechados de cada período (o atual e o anterior têm o mesmo tamanho). */
  dias: number;
  /** Os números dos cartões de pessoas (pessoas diferentes no período): o que aparece no centro de cada anel. */
  valores: Record<ChaveDoFunil, number | null>;
  /** Soma diária dos dois períodos (a base de toda variação). null = o histórico não cobre 80% dos dias. */
  atual: Record<string, number | null>;
  antes: Record<string, number | null>;
  /** Conversas por dia do período atual (para o dia mais forte). */
  diario: readonly { dia: string; mandaram_mensagem: number | null }[];
  ads: { atual: LadoDeAnuncios | null; anterior: LadoDeAnuncios | null; porDia: readonly DiaDeAnuncios[] } | null;
  seguidores: { atual: number | null; antes: number | null; rotuloAntes: string } | null;
  salvos: { atual: MedidaDeSalvos | null; antes: MedidaDeSalvos | null; rotuloAntes: string } | null;
  retorno: RetornoDaEntrada | null;
}

// ---------- apoio ----------

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
/** Percentual curto: uma casa só abaixo de 10 ("0,7", "5"), inteiro de 10 para cima. */
const taxaTxt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: n < 10 ? 1 : 0 });
const arredonda = (n: number) => Math.round(n * 1000) / 1000;

// ---------- anéis ----------

export type SeloDoAnel = "Em alta" | "Em queda" | "Igual" | "Falta dado";

/**
 * Um anel: a etapa contra a mesma etapa do período anterior da própria clínica. Anel cheio = igual ao de antes, volta mais escura =
 * passou de antes. A proporção sai SEMPRE das somas diárias dos dois períodos (nunca mistura duas fontes); o número do centro é o do
 * cartão de pessoas, o mesmo que a tela já mostrava.
 */
export interface AnelDoPeriodo {
  chave: ChaveDoFunil;
  /** "Conversas", "Agendaram", "Fecharam". */
  rotulo: string;
  /** O número do cartão da etapa. null = sem medida (o centro diz "Falta dado"). */
  valor: number | null;
  /** Soma dos dias do período atual e do anterior: o que as barras do detalhe comparam. */
  somaAtual: number | null;
  somaAntes: number | null;
  variacao: VariacaoPropria | null;
  /** Quanto do anel está preenchido: de 0 a 1 (cheio = igual ao anterior). */
  fracao: number;
  /** A volta a mais quando passou do anterior: de 0 a 1. */
  volta: number;
  selo: SeloDoAnel;
  tom: TomFato;
  /** "N% seguem" (ou "N de M seguem" com base pequena) da etapa anterior até esta. null no primeiro anel e quando não dá para dizer. */
  passagemAteAqui: string | null;
}

function passagem(de: number | null | undefined, para: number | null | undefined, base: number): string | null {
  if (de == null || para == null || de <= 0) return null;
  // Fechou mais do que agendou: o funil está fora de ordem, e dizer "N% seguem" passaria de 100%.
  if (para > de) return null;
  if (de < base) return `${inteiro(para)} de ${inteiro(de)} seguem`;
  return `${taxaTxt((para / de) * 100)}% seguem`;
}

export function aneisDeResultados(e: EntradaCincoResultados): AnelDoPeriodo[] {
  return ORDEM_DO_FUNIL.map((chave, k) => {
    const atual = e.atual[chave] ?? null;
    const antes = e.antes[chave] ?? null;
    const variacao = variacaoPropria(atual, antes, { baseMinima: BASE_DO_ANTERIOR });
    const razao = variacao && atual != null && antes != null ? atual / antes : null;
    const selo: SeloDoAnel = !variacao ? "Falta dado" : variacao.melhor === true ? "Em alta" : variacao.melhor === false ? "Em queda" : "Igual";
    const tom: TomFato = selo === "Em alta" ? "bom" : selo === "Em queda" ? "ruim" : "neutro";
    return {
      chave,
      rotulo: ROTULO_DO_FUNIL[chave],
      valor: e.valores[chave] ?? null,
      somaAtual: atual,
      somaAntes: antes,
      variacao,
      fracao: razao == null ? 0 : arredonda(Math.min(1, razao)),
      volta: razao == null ? 0 : arredonda(Math.min(1, Math.max(0, razao - 1))),
      selo,
      tom,
      passagemAteAqui: k === 0 ? null : passagem(e.atual[ORDEM_DO_FUNIL[k - 1]], atual, BASE_DA_PASSAGEM[chave]),
    };
  });
}

// ---------- veredito ----------

const pct = (v: VariacaoPropria) => `${Math.abs(v.pct).toLocaleString("pt-BR")}%`;

/** A frase em partes (a ênfase é dado, nunca HTML). `ruimOuBom` pinta o "18 contra 36" do lado de fechados. */
function fraseDoVeredito(conversas: VariacaoPropria, fecharam: VariacaoPropria, fechadosAgora: number, fechadosAntes: number, curta: boolean): ParteDaFrase[] {
  const contra = `${inteiro(fechadosAgora)} contra ${inteiro(fechadosAntes)}`;
  const conflito = conversas.melhor !== fecharam.melhor && conversas.melhor !== null && fecharam.melhor !== null;
  const ligacao = conflito ? ", mas fecharam " : " e fecharam ";
  const partes: ParteDaFrase[] = [];
  if (!curta) {
    if (conversas.sinal === "▲") partes.push({ texto: "Chegaram " }, { texto: `${pct(conversas)} mais conversas`, enfase: "numero" });
    else if (conversas.sinal === "▼") partes.push({ texto: "Chegaram " }, { texto: `${pct(conversas)} menos conversas`, enfase: "numero" });
    else partes.push({ texto: "As conversas ficaram " }, { texto: "iguais", enfase: "numero" });
  }
  partes.push({ texto: curta ? "Fecharam " : ligacao });
  if (fecharam.sinal === "▲") partes.push({ texto: contra, enfase: "bom" });
  else if (fecharam.sinal === "▼") partes.push({ texto: `só ${contra}`, enfase: "ruim" });
  else partes.push({ texto: "o mesmo: " }, { texto: inteiro(fechadosAgora), enfase: "numero" });
  partes.push({ texto: "." });
  return partes;
}

/**
 * O veredito de Resultados: palavra + UMA frase com o número em destaque, pelo par (conversas, fecharam) contra o período anterior da
 * própria clínica. Portão negado (ou sem comparação de quem fechou): o veredito dos fatos, que diz o mesmo "Falta dado: motivo" e o
 * mesmo passo que a leitura da tela (D-05). null = ainda sem fatos.
 */
export function vereditoDeResultados(e: EntradaCincoResultados): Veredito | null {
  if (!e.fatos) return null;
  if (!e.fatos.portao.ok) return vereditoDosFatos(e.fatos);
  const [conversas, , fecharam] = aneisDeResultados(e);
  const vc = conversas.variacao;
  const vf = fecharam.variacao;
  if (!vc || !vf || fecharam.somaAtual == null || fecharam.somaAntes == null) return vereditoDosFatos(e.fatos);

  const nota = (v: VariacaoPropria) => (v.melhor === true ? 1 : v.melhor === false ? -1 : 0);
  const [a, b] = [nota(vc), nota(vf)];
  let palavra: "Bom" | "Atenção" | "Ruim" | "Estável";
  if (a === 0 && b === 0) palavra = "Estável";
  else if (a === -1 && b === -1) palavra = "Ruim";
  else if (a + b >= 1 && a !== -1 && b !== -1) palavra = "Bom";
  else palavra = "Atenção";
  const tom: TomFato = palavra === "Bom" ? "bom" : palavra === "Ruim" ? "ruim" : palavra === "Atenção" ? "atencao" : "neutro";

  for (const curta of [false, true]) {
    const frase = fraseDoVeredito(vc, vf, fecharam.somaAtual, fecharam.somaAntes, curta);
    if (checarFraseCinco(textoDaFrase(frase)).length === 0) {
      return { tipo: "veredito", palavra, tom, frase, apoio: `Cada anel cheio é igual aos ${e.dias} dias antes. Toque num anel para abrir.` };
    }
  }
  return vereditoDosFatos(e.fatos);
}
