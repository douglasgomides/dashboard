// Atendimento no WhatsApp (aba Qualidade, "Números do atendimento") no formato 5 segundos (Phase 03.1.1.1, plano 06, D-01): o veredito
// "Chegam N conversas por dia.", a faixa do normal da PRÓPRIA clínica, os 3 números-chave contra o período anterior dela, o dia cruzado
// com o Instagram e os anúncios dela e as descobertas. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já
// carregou. D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero. D-06/D-08: a
// "Provável causa" é regra fixa (nunca IA) e as leituras extras são as mesmas chaves que outras telas já guardam. A regra lê só contagens
// (T-03.1.1.1-19): nenhum nome, telefone ou conversa passa por aqui.
import { faixaDoNormal, foraDaFaixa, type FaixaDoNormal } from "@/lib/faixa-do-normal";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import type { Veredito, ParteDaFrase } from "./cinco-segundos";
import type { PassoTexto } from "./tipos";

/** Muda quando uma regra de Atendimento no formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO_ATENDIMENTO = 1;

// ---------- entrada ----------

/** Uma série por dia num eixo contínuo (um dia por posição, em ordem). null = dia sem dado (buraco, nunca zero). */
export interface SerieNoEixo {
  /** AAAA-MM-DD. */
  datas: string[];
  valores: (number | null)[];
}

/** Um dia solto de uma fonte (a tela alinha ao eixo das conversas). */
export interface DiaSolto {
  /** AAAA-MM-DD. */
  dia: string;
  valor: number | null;
}

/** O que Atendimento já tem carregado quando monta o formato 5 segundos. */
export interface EntradaCincoAtendimento {
  /** Conversas por dia do período (só dias fechados), num eixo contínuo. */
  conversas: SerieNoEixo;
  /** Conversas por dia do período anterior de mesmo tamanho. null = a leitura do anterior não veio. */
  conversasAntes: SerieNoEixo | null;
  /** Pessoas diferentes (contatos distintos do WTS), agora e antes, de períodos de mesmo tamanho. null = sem medida. */
  pessoas: { agora: number | null; antes: number | null };
  /** Soma diária dos dois períodos (histórico diário). null = o histórico não cobre 80% dos dias. */
  somas: { atual: Record<string, number | null> | null; antes: Record<string, number | null> | null };
  /** Por dia, no mesmo eixo das conversas: pessoas que chamaram e pessoas que viraram lead (histórico diário). null = sem histórico. */
  diario: { mandaram: (number | null)[]; leads: (number | null)[] } | null;
  /** Alcance diário do Instagram do período inteiro. null = a fonte não respondeu ou a clínica não tem Instagram. */
  alcance: DiaSolto[] | null;
  /** Conversas pelo anúncio por dia do período inteiro. null = a fonte não respondeu ou a clínica não tem anúncio. */
  anuncios: DiaSolto[] | null;
  /** Quem vê: a equipe abre "Conversas e auditoria"; o médico vai ao funil. */
  equipe?: boolean;
}

// ---------- apoio ----------

const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const ptBr = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const PASSO_CONFERIR: PassoTexto = { frase: "Conferir a conexão das fontes.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: ROTULO_RESPONSAVEL.equipe_hub };

/** O motivo quando o WTS não trouxe o volume por dia (o mesmo "Falta dado: motivo" da leitura, D-05). */
export const MOTIVO_SEM_VOLUME = "o WhatsApp não trouxe o volume de conversas por dia neste período.";

/** A faixa do normal de uma série de conversas (a mesma conta de toda tela: src/lib/faixa-do-normal.ts). */
export const faixaDasConversas = (conversas: SerieNoEixo): FaixaDoNormal | null => faixaDoNormal(conversas.valores);

// ---------- veredito ----------

/** "18 conversas por dia", "2,5 conversas por dia", "1 conversa por dia" ou "menos de 1 conversa por dia". */
function conversasPorDia(media: number): string {
  if (media < 1) return "menos de 1 conversa por dia";
  const n = media >= 10 ? Math.round(media) : Math.round(media * 10) / 10;
  return `${ptBr(n, 1)} ${n === 1 ? "conversa" : "conversas"} por dia`;
}

const textoDeDias = (k: number) => (k === 0 ? "nenhum dia fora disso" : k === 1 ? "1 dia fora disso" : `${ptBr(k)} dias fora disso`);

/**
 * O veredito de Atendimento: "Chegam N conversas por dia." (a média dos dias medidos) e, na linha de apoio, o que é normal para esta
 * clínica e quantos dias ficaram fora. A palavra: "Em queda" ou "Em alta" quando os 3 últimos dias medidos estão todos abaixo ou todos
 * acima do normal; "Atenção" quando mais de um quarto dos dias saiu da faixa; senão "Estável". Sem faixa (poucos dias): "Falta dado".
 * Sem nenhum dia medido: "Falta dado: motivo" e o mesmo passo da leitura (D-05).
 */
export function vereditoDoAtendimento(e: Pick<EntradaCincoAtendimento, "conversas">): Veredito {
  const medidos = e.conversas.valores.filter(comValor);
  if (medidos.length === 0) return { tipo: "sem_leitura", motivo: MOTIVO_SEM_VOLUME, passo: PASSO_CONFERIR };
  const media = medidos.reduce((s, v) => s + v, 0) / medidos.length;
  const frase: ParteDaFrase[] = [{ texto: "Chegam " }, { texto: conversasPorDia(media), enfase: "numero" }, { texto: "." }];

  const faixa = faixaDasConversas(e.conversas);
  if (!faixa) return { tipo: "veredito", palavra: "Falta dado", tom: "atencao", frase, apoio: "Falta dado: poucos dias para saber o normal." };

  const marcas = foraDaFaixa(e.conversas.valores, faixa);
  const medidas = marcas.filter((m) => m != null);
  const fora = medidas.filter((m) => m !== "normal").length;
  const ultimos = medidas.slice(-3);
  const apoio = `Normal: de ${ptBr(faixa.lo)} a ${ptBr(faixa.hi)} conversas por dia · ${textoDeDias(fora)}.`;
  if (ultimos.length === 3 && ultimos.every((m) => m === "abaixo")) return { tipo: "veredito", palavra: "Em queda", tom: "ruim", frase, apoio };
  if (ultimos.length === 3 && ultimos.every((m) => m === "acima")) return { tipo: "veredito", palavra: "Em alta", tom: "bom", frase, apoio };
  if (fora / medidas.length > 0.25) return { tipo: "veredito", palavra: "Atenção", tom: "atencao", frase, apoio };
  return { tipo: "veredito", palavra: "Estável", tom: "neutro", frase, apoio };
}
