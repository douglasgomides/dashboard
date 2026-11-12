// Atendimento no WhatsApp (aba Qualidade, "Números do atendimento") no formato 5 segundos (Phase 03.1.1.1, plano 06, D-01): o veredito
// "Chegam N conversas por dia.", a faixa do normal da PRÓPRIA clínica, os 3 números-chave contra o período anterior dela, o dia cruzado
// com o Instagram e os anúncios dela e as descobertas. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já
// carregou. D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero. D-06/D-08: a
// "Provável causa" é regra fixa (nunca IA) e as leituras extras são as mesmas chaves que outras telas já guardam. A regra lê só contagens
// (T-03.1.1.1-19): nenhum nome, telefone ou conversa passa por aqui.
import { MIN_DIAS_DA_FAIXA, faixaDoNormal, foraDaFaixa, medianaDaSerie, type FaixaDoNormal, type MarcaDoDia } from "@/lib/faixa-do-normal";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { LIMITES } from "@/lib/limites";
import { nomeDoDia } from "@/lib/linha-30-dias";
import { checarDescoberta, checarFraseCinco, variacaoPropria, type Descoberta, type ParteDaFrase, type Veredito } from "./cinco-segundos";
import type { BarraDoFato, PassoTexto, TomFato } from "./tipos";

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
  /** Dias fechados de cada período (a base da cobertura: um número só é comparado com 80% dos dias medidos nos dois lados). */
  dias: number;
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

// ---------- números-chave ----------

const BASE_DE_CONVERSAS = LIMITES.funil.minLeads;

/** O valor de cada dia de uma fonte solta, no eixo (um dia por posição). Dia sem linha é null (buraco). null = a fonte não respondeu. */
export function valoresNoEixo(datas: readonly string[], dias: readonly DiaSolto[] | null | undefined): (number | null)[] | null {
  if (!dias) return null;
  const porDia = new Map<string, number | null>();
  for (const d of dias) porDia.set(d.dia.slice(0, 10), comValor(d.valor) ? d.valor : null);
  return datas.map((d) => porDia.get(d) ?? null);
}

function somaMedida(s: SerieNoEixo | null | undefined): { soma: number; medidos: number } | null {
  const v = (s?.valores ?? []).filter(comValor);
  return v.length ? { soma: v.reduce((a, b) => a + b, 0), medidos: v.length } : null;
}

const coberturaOk = (medidos: number, dias: number) => dias >= 1 && medidos >= Math.ceil(dias * 0.8);

export interface NumeroDeAtendimento {
  id: "conversas" | "viram-lead" | "pessoas";
  titulo: string;
  /** O número grande. null = sem medida (o cartão diz "Sem dado" e o motivo) ou base pequena (veja valorTexto). */
  valor: number | null;
  /** "N de M" quando a base é pequena demais para "de cada 100". null nos outros casos (o cartão mostra o valor). */
  valorTexto: string | null;
  legenda?: string;
  /** O número do período anterior da própria clínica, quando medido. */
  antes: number | null;
  /** "▲ 20% · melhor que antes" ou "▼ 9 pontos · pior que antes". null quando não há comparação. */
  textoDaVariacao: string | null;
  /** true = melhorou, false = piorou, null = igual ou sem comparação. */
  melhor: boolean | null;
  /** O selo (sinal e palavra) quando não há variação para dizer: "Falta dado · sem período anterior". */
  selo: { tom: TomFato; texto: string } | null;
  /** Por que não há número (só sem medida). */
  motivo: string | null;
  /** A linha de 30 dias do número, quando há série diária. */
  serie?: { rotulo: string; datas: string[]; valores: (number | null)[] };
}

const SEM_ANTERIOR: { tom: TomFato; texto: string } = { tom: "neutro", texto: "Falta dado · sem período anterior" };
const palavraDoLado = (melhor: boolean | null) => (melhor === null ? "" : melhor ? " · melhor que antes" : " · pior que antes");
const pontosTxt = (n: number) => `${ptBr(Math.abs(n))} ${Math.abs(n) === 1 ? "ponto" : "pontos"}`;
const TITULO_DA_TAXA = "Viram lead, de cada 100";

/** Variação em pontos de uma taxa de cada 100 contra a do período anterior da própria clínica. Menos de 1 ponto é "igual". */
function variacaoEmPontos(agora: number, antes: number): { pontos: number; texto: string; melhor: boolean | null } {
  const pontos = Math.round(agora) - Math.round(antes);
  if (Math.abs(pontos) < 1) return { pontos: 0, texto: "= igual", melhor: null };
  return { pontos, texto: `${pontos > 0 ? "▲" : "▼"} ${pontosTxt(pontos)}`, melhor: pontos > 0 };
}

/** Quantos viram lead de cada 100 que chamaram, só com a base mínima e sem os leads passarem das conversas. */
function taxaDeLead(mandaram: number | null | undefined, leads: number | null | undefined, base: number): number | null {
  return comValor(mandaram) && comValor(leads) && mandaram >= base && mandaram > 0 && leads <= mandaram ? (leads / mandaram) * 100 : null;
}

/** A taxa de cada dia (viraram lead sobre chamaram), só com os dois medidos e sem passar de 100. Menos de 2 dias medidos: sem linha. */
function serieDaTaxa(e: EntradaCincoAtendimento): NumeroDeAtendimento["serie"] {
  const diario = e.diario;
  if (!diario) return undefined;
  const valores = e.conversas.datas.map((_, i) => {
    const m = diario.mandaram[i];
    const l = diario.leads[i];
    return comValor(m) && comValor(l) && m > 0 && l <= m ? Math.round((l / m) * 100) : null;
  });
  return valores.filter(comValor).length >= 2 ? { rotulo: "viram lead de cada 100", datas: e.conversas.datas, valores } : undefined;
}

/**
 * Os 3 números-chave, na ordem da tela: Conversas, Viram lead de cada 100 e Pessoas diferentes. Cada comparação é contra o período
 * anterior da PRÓPRIA clínica e só existe com a base mínima (LIMITES.funil.minLeads) e com 80% dos dias medidos nos dois lados; sem isso o
 * número diz "Falta dado" (nunca 0 nem uma variação inventada).
 */
export function numerosDoAtendimento(e: EntradaCincoAtendimento): NumeroDeAtendimento[] {
  // 1. Conversas: a soma do volume diário contra a do período anterior de mesmo tamanho.
  const agoraM = somaMedida(e.conversas);
  const antesM = somaMedida(e.conversasAntes);
  const coberto = agoraM != null && antesM != null && coberturaOk(agoraM.medidos, e.dias) && coberturaOk(antesM.medidos, e.dias);
  const vc = coberto ? variacaoPropria(agoraM.soma, antesM.soma, { baseMinima: BASE_DE_CONVERSAS }) : null;
  let seloC: { tom: TomFato; texto: string } | null = null;
  if (agoraM && !vc) {
    if (e.conversasAntes == null || antesM == null) seloC = SEM_ANTERIOR;
    else if (!coberto) seloC = { tom: "neutro", texto: "Falta dado · poucos dias medidos" };
    else if (antesM.soma < BASE_DE_CONVERSAS) seloC = { tom: "neutro", texto: "Falta dado · poucas conversas antes" };
    else seloC = SEM_ANTERIOR;
  }
  const conversas: NumeroDeAtendimento = {
    id: "conversas",
    titulo: "Conversas",
    valor: agoraM?.soma ?? null,
    valorTexto: null,
    legenda: agoraM ? "conversas no período" : undefined,
    antes: antesM?.soma ?? null,
    textoDaVariacao: vc ? `${vc.texto}${palavraDoLado(vc.melhor)}` : null,
    melhor: vc?.melhor ?? null,
    selo: seloC,
    motivo: agoraM ? null : MOTIVO_SEM_VOLUME,
    serie: e.conversas.datas.length >= 2 ? { rotulo: "conversas", datas: e.conversas.datas, valores: e.conversas.valores } : undefined,
  };

  // 2. Viram lead de cada 100: leads novos sobre quem chamou, no histórico diário dos dois períodos.
  const mandaramAgora = e.somas.atual?.mandaram_mensagem ?? null;
  const leadsAgora = e.somas.atual?.leads_novos ?? null;
  const semMedida = (motivo: string): NumeroDeAtendimento => ({ id: "viram-lead", titulo: TITULO_DA_TAXA, valor: null, valorTexto: null, antes: null, textoDaVariacao: null, melhor: null, selo: null, motivo });
  let daTaxa: NumeroDeAtendimento;
  if (!comValor(mandaramAgora) || !comValor(leadsAgora) || mandaramAgora <= 0) {
    daTaxa = semMedida("o histórico por dia não mede quem chamou e quem virou lead");
  } else if (leadsAgora > mandaramAgora) {
    daTaxa = semMedida("quem virou lead passa de quem chamou (inclui quem não veio pela conversa)");
  } else if (mandaramAgora < LIMITES.funil.minLeads) {
    daTaxa = {
      id: "viram-lead",
      titulo: TITULO_DA_TAXA,
      valor: null,
      valorTexto: `${ptBr(leadsAgora)} de ${ptBr(mandaramAgora)}`,
      legenda: "viraram lead, de poucas conversas",
      antes: null,
      textoDaVariacao: null,
      melhor: null,
      selo: { tom: "neutro", texto: "Falta dado · poucas conversas" },
      motivo: null,
    };
  } else {
    const agora = (leadsAgora / mandaramAgora) * 100;
    const anterior = taxaDeLead(e.somas.antes?.mandaram_mensagem, e.somas.antes?.leads_novos, LIMITES.funil.minLeads);
    const v = anterior == null ? null : variacaoEmPontos(agora, anterior);
    daTaxa = {
      id: "viram-lead",
      titulo: TITULO_DA_TAXA,
      valor: Math.round(agora),
      valorTexto: null,
      legenda: "das conversas viram lead",
      antes: anterior == null ? null : Math.round(anterior),
      textoDaVariacao: v ? `${v.texto}${palavraDoLado(v.melhor)}` : null,
      melhor: v?.melhor ?? null,
      selo: v ? null : SEM_ANTERIOR,
      motivo: null,
      serie: serieDaTaxa(e),
    };
  }

  // 3. Pessoas diferentes: contatos distintos do WTS agora e no período anterior de mesmo tamanho.
  const pv = variacaoPropria(e.pessoas.agora, e.pessoas.antes, { baseMinima: BASE_DE_CONVERSAS });
  let seloP: { tom: TomFato; texto: string } | null = null;
  if (e.pessoas.agora != null && !pv) {
    seloP = e.pessoas.antes != null && e.pessoas.antes > 0 && e.pessoas.antes < BASE_DE_CONVERSAS ? { tom: "neutro", texto: "Falta dado · poucas pessoas antes" } : SEM_ANTERIOR;
  }
  const pessoas: NumeroDeAtendimento = {
    id: "pessoas",
    titulo: "Pessoas diferentes",
    valor: e.pessoas.agora ?? null,
    valorTexto: null,
    legenda: e.pessoas.agora == null ? undefined : "pessoas chamaram no WhatsApp",
    antes: e.pessoas.antes ?? null,
    textoDaVariacao: e.pessoas.agora != null && pv ? `${pv.texto}${palavraDoLado(pv.melhor)}` : null,
    melhor: e.pessoas.agora != null ? (pv?.melhor ?? null) : null,
    selo: seloP,
    motivo: e.pessoas.agora == null ? "o WhatsApp não trouxe as pessoas diferentes deste período" : null,
  };
  return [conversas, daTaxa, pessoas];
}

// ---------- o dia cruzado ----------

export interface LinhaDoCruzamento {
  valor: number | null;
  /** "▲ 250% vs dia comum", "▼ 40% vs dia comum" ou "igual ao dia comum". null quando falta dado ou o dia comum não é conhecido. */
  comparacao: string | null;
  /** "Falta dado" (e por quê) quando a fonte não tem este dia; nunca zero. */
  faltaDado: string | null;
}

export interface DiaCruzado {
  indice: number;
  dia: string;
  /** "qua., 14/10". */
  titulo: string;
  marca: MarcaDoDia | null;
  /** "▲ acima do normal", "▼ abaixo do normal" ou "dentro do normal". null sem faixa do normal. */
  notaDaMarca: string | null;
  conversas: number | null;
  /** Quem virou lead nesse dia (histórico diário). null = sem medida. */
  leads: number | null;
  alcance: LinhaDoCruzamento;
  anuncio: LinhaDoCruzamento;
  /** "Provável causa: ..." por regra fixa, "Sem causa clara nos outros dados." ou "Dia comum.". */
  causa: string;
  /** Qual regra deu a causa (nenhuma = null). */
  causaVinda: "instagram" | "anuncio" | null;
}

/** O Instagram "bombou" quando o alcance do dia passa do dobro do dia comum da própria clínica. */
export const FATOR_DO_INSTAGRAM_QUE_BOMBOU = 2;
/** O anúncio "quase parou" quando as conversas do dia ficam abaixo de um terço do dia comum da própria clínica. */
export const FRACAO_DO_ANUNCIO_QUE_PAROU = 1 / 3;

function comparacaoComODiaComum(valor: number, comum: number | null): string | null {
  if (comum == null || !(comum > 0)) return null;
  const pct = Math.round(((valor - comum) / comum) * 100);
  return pct === 0 ? "igual ao dia comum" : `${pct > 0 ? "▲" : "▼"} ${ptBr(Math.abs(pct))}% vs dia comum`;
}

/** O dia comum de uma fonte (o dia do meio dos dias medidos do período), só com dias medidos suficientes; senão null. */
export function diaComum(dias: readonly DiaSolto[] | null | undefined): number | null {
  const v = (dias ?? []).map((d) => d.valor).filter(comValor);
  return v.length >= MIN_DIAS_DA_FAIXA ? medianaDaSerie(v) : null;
}

function linhaDoCruzamento(valor: number | null, fonte: readonly DiaSolto[] | null, comum: number | null, nome: string): LinhaDoCruzamento {
  if (fonte == null) return { valor: null, comparacao: null, faltaDado: `Falta dado: ${nome} não respondeu.` };
  if (valor == null) return { valor: null, comparacao: null, faltaDado: "Falta dado" };
  return { valor, comparacao: comparacaoComODiaComum(valor, comum), faltaDado: null };
}

/**
 * O dia escolhido cruzado com o Instagram e os anúncios DA MESMA clínica, cada um contra o dia comum dela. A "Provável causa" é regra
 * fixa, nesta ordem: alcance do Instagram acima do dobro do dia comum, "o Instagram bombou nesse dia"; conversas do anúncio abaixo de um
 * terço do dia comum, "o anúncio quase parou nesse dia"; dia fora do normal sem nenhuma das duas, "Sem causa clara nos outros dados";
 * senão "Dia comum". Fonte sem dado naquele dia mostra "Falta dado" na própria linha e nunca entra como causa. Toda frase passa em
 * checarFraseCinco (aqui só contagens da própria clínica, T-03.1.1.1-19).
 */
export function diaCruzado(i: number, e: EntradaCincoAtendimento): DiaCruzado | null {
  const dia = e.conversas.datas[i];
  if (dia == null) return null;
  const faixa = faixaDasConversas(e.conversas);
  const marca = foraDaFaixa(e.conversas.valores, faixa)[i] ?? null;
  const notaDaMarca = marca == null ? null : marca === "acima" ? "▲ acima do normal" : marca === "abaixo" ? "▼ abaixo do normal" : "dentro do normal";

  const doAlcance = valoresNoEixo(e.conversas.datas, e.alcance);
  const doAnuncio = valoresNoEixo(e.conversas.datas, e.anuncios);
  const comumAlcance = diaComum(e.alcance);
  const comumAnuncio = diaComum(e.anuncios);
  const alcance = linhaDoCruzamento(doAlcance?.[i] ?? null, e.alcance, comumAlcance, "o Instagram");
  const anuncio = linhaDoCruzamento(doAnuncio?.[i] ?? null, e.anuncios, comumAnuncio, "o anúncio");

  let causa: string;
  let causaVinda: DiaCruzado["causaVinda"] = null;
  if (alcance.valor != null && comumAlcance != null && comumAlcance > 0 && alcance.valor > FATOR_DO_INSTAGRAM_QUE_BOMBOU * comumAlcance) {
    causa = "Provável causa: o Instagram bombou nesse dia.";
    causaVinda = "instagram";
  } else if (anuncio.valor != null && comumAnuncio != null && comumAnuncio > 0 && anuncio.valor < FRACAO_DO_ANUNCIO_QUE_PAROU * comumAnuncio) {
    causa = "Provável causa: o anúncio quase parou nesse dia.";
    causaVinda = "anuncio";
  } else if (marca === "acima" || marca === "abaixo") {
    causa = "Sem causa clara nos outros dados.";
  } else if (marca === "normal") {
    causa = "Dia comum.";
  } else {
    causa = "Falta dado: poucos dias para saber o normal.";
  }
  return {
    indice: i,
    dia,
    titulo: nomeDoDia(dia),
    marca,
    notaDaMarca,
    conversas: e.conversas.valores[i] ?? null,
    leads: e.diario?.leads[i] ?? null,
    alcance,
    anuncio,
    causa,
    causaVinda,
  };
}

/**
 * O dia em que a tela abre o dia cruzado: entre os dias fora do normal, o de maior alcance do Instagram da própria clínica. null quando
 * nenhum dia fora do normal tem alcance medido (a tela pede "Toque num dia para ver o que aconteceu").
 */
export function diaInicialDoCruzamento(e: EntradaCincoAtendimento): number | null {
  const faixa = faixaDasConversas(e.conversas);
  const marcas = foraDaFaixa(e.conversas.valores, faixa);
  const alcance = valoresNoEixo(e.conversas.datas, e.alcance);
  if (!alcance) return null;
  let melhor: number | null = null;
  alcance.forEach((v, i) => {
    if ((marcas[i] === "acima" || marcas[i] === "abaixo") && comValor(v) && (melhor == null || v > (alcance[melhor] as number))) melhor = i;
  });
  return melhor;
}

// ---------- padrão da semana ----------

const NOMES_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
/** De segunda a domingo (o domingo do JavaScript é 0). */
const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

export interface DiaDaSemana {
  /** 0 = domingo ... 6 = sábado. */
  dia: number;
  nome: string;
  /** A média de conversas por dia desse dia da semana, só com 2 dias medidos ou mais; senão null. */
  media: number | null;
  /** Quantos dias medidos entraram. */
  dias: number;
}

/** A média própria de cada dia da semana no período, de segunda a domingo. Dia da semana com menos de 2 dias medidos não tem média. */
export function padraoDaSemana(conversas: SerieNoEixo): DiaDaSemana[] {
  const soma = new Array<number>(7).fill(0);
  const contagem = new Array<number>(7).fill(0);
  conversas.datas.forEach((d, i) => {
    const v = conversas.valores[i];
    if (!comValor(v)) return;
    const w = new Date(`${d}T12:00:00Z`).getUTCDay();
    soma[w] += v;
    contagem[w] += 1;
  });
  return ORDEM_DA_SEMANA.map((w) => ({ dia: w, nome: NOMES_DA_SEMANA[w], media: contagem[w] >= 2 ? soma[w] / contagem[w] : null, dias: contagem[w] }));
}

// ---------- descobertas ----------

const ROTA_INSTAGRAM = "/_authenticated/$clientId/conteudo";
const ROTA_ANUNCIOS = "/_authenticated/$clientId/anuncios";
const ROTA_FUNIL = "/_authenticated/$clientId/pacientes";

/** Chaves de ação que a tela trata (nada é enviado: abrem o "Ver tudo" na equipe ou a aba de conversas, só para a equipe). */
export const ACOES_DE_ATENDIMENTO = { porEquipe: "ver-por-equipe", conversas: "ver-conversas" } as const;
/** Quantas descobertas esta tela mostra, no máximo (as 3 primeiras à vista, o resto em "Ver tudo"). */
const MAXIMO_DE_DESCOBERTAS = 5;
/** A diferença mínima entre os dias cheios e o dia fraco para virar descoberta (abaixo disso é ruído). */
const RAZAO_MINIMA_DA_SEMANA = 1.5;

export interface DescobertasDeAtendimento {
  /** Em ordem de impacto: o que piorou primeiro, depois pela maior mudança. De 0 a 5 (nunca inventa). */
  itens: Descoberta[];
  /** "Poucas descobertas neste período: {motivo}." quando há menos de 3. null quando há 3 ou mais. */
  aviso: string | null;
}

const barra = (rotulo: string, exibicao: string, fracao: number): BarraDoFato => ({ rotulo, exibicao, fracao: Math.max(0, Math.min(1, fracao)) });
const barraDeContagem = (rotulo: string, antes: number, agora: number): BarraDoFato => barra(rotulo, `${ptBr(antes)} → ${ptBr(agora)}`, Math.max(antes, agora) > 0 ? agora / Math.max(antes, agora) : 0);
const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const minusculo = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const ehODiaSeguinte = (a: string, b: string) => new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime() === 86_400_000;

/** "5 mil" a partir de 1.000; abaixo disso o número inteiro. */
function alcanceEmTexto(v: number): string {
  return v >= 1000 ? `${ptBr(Math.round(v / 100) / 10, 1)} mil` : ptBr(Math.round(v));
}

/** O maior trecho de dias seguidos com as conversas do anúncio abaixo de um terço do dia comum (2 dias ou mais; empate fica com o mais recente). */
function trechoDoAnuncioParado(anuncios: readonly DiaSolto[], comum: number): DiaSolto[] | null {
  const dias = anuncios.filter((d) => comValor(d.valor)).sort((a, b) => a.dia.localeCompare(b.dia));
  const limite = comum * FRACAO_DO_ANUNCIO_QUE_PAROU;
  let melhor: DiaSolto[] | null = null;
  let atual: DiaSolto[] = [];
  const fecha = () => {
    if (atual.length >= 2 && (melhor == null || atual.length >= melhor.length)) melhor = atual;
    atual = [];
  };
  for (const d of dias) {
    if ((d.valor as number) >= limite) {
      fecha();
      continue;
    }
    if (atual.length && !ehODiaSeguinte(atual[atual.length - 1].dia, d.dia)) fecha();
    atual.push(d);
  }
  fecha();
  return melhor;
}

/**
 * De 0 a 5 descobertas de Atendimento, só com números da própria clínica (D-02), cada uma com UMA ação que só navega, quem resolve e um
 * "Por quê?" de 2 a 3 fatores em barra: o padrão da semana (dias cheios contra o dia fraco), o pico que veio do Instagram, os dias em que o
 * anúncio quase parou e quantos viram lead de cada 100 contra antes. Cada uma só existe com a base mínima do seu dado; o que falta vira o
 * motivo do aviso. "Ver conversas" só para a equipe (T-03.1.1.1-21): o médico vai ao funil. O que não é medido (tempo até a primeira
 * resposta, pessoas esperando) NÃO é descoberta (D-05).
 */
export function descobertasDoAtendimento(e: EntradaCincoAtendimento): DescobertasDeAtendimento {
  const candidatas: { d: Descoberta; impacto: number; ruim: boolean }[] = [];
  const motivos: string[] = [];
  const poe = (d: Descoberta, impacto: number) => {
    if (checarDescoberta(d).length > 0) return;
    candidatas.push({ d, impacto, ruim: d.tom === "ruim" });
  };
  const faixa = faixaDasConversas(e.conversas);

  // 1. Padrão da semana: os 2 dias mais cheios contra o mais fraco (média própria de cada dia da semana).
  const semana = padraoDaSemana(e.conversas).filter((s): s is DiaDaSemana & { media: number } => s.media != null);
  if (semana.length >= 4) {
    const porMedia = [...semana].sort((a, b) => b.media - a.media);
    const [cheio1, cheio2] = porMedia;
    const fraco = porMedia[porMedia.length - 1];
    const razao = fraco.media > 0 ? (cheio1.media + cheio2.media) / 2 / fraco.media : 0;
    if (razao >= RAZAO_MINIMA_DA_SEMANA) {
      const r = ptBr(Math.round(razao * 10) / 10, 1);
      const mediaDosCheios = (cheio1.media + cheio2.media) / 2;
      let frase = `${cheio1.nome} e ${minusculo(cheio2.nome)} recebem ${r}× mais conversas que ${minusculo(fraco.nome)}.`;
      // O sinal × cai no filtro de linguagem: a mesma frase com a palavra "vezes".
      if (checarFraseCinco(frase).length > 0) frase = `${cheio1.nome} e ${minusculo(cheio2.nome)} recebem ${r} vezes mais conversas que ${minusculo(fraco.nome)}.`;
      poe(
        {
          id: "atendimento-padrao-da-semana",
          tom: "neutro",
          selo: "Padrão da semana",
          frase,
          quem: ROTULO_RESPONSAVEL.atendimento,
          impacto: `${ptBr(Math.round(mediaDosCheios))} contra ${ptBr(Math.round(fraco.media))} por dia`,
          acao: { rotulo: "Ver por equipe", local: ACOES_DE_ATENDIMENTO.porEquipe },
          porque: {
            titulo: "Média de conversas por dia da semana",
            barras: [
              barra(cheio1.nome, `${ptBr(Math.round(cheio1.media))} por dia`, 1),
              barra(cheio2.nome, `${ptBr(Math.round(cheio2.media))} por dia`, cheio2.media / cheio1.media),
              barra(fraco.nome, `${ptBr(Math.round(fraco.media))} por dia`, fraco.media / cheio1.media),
            ],
            obs: "Os dois dias mais cheios e o mais fraco, em média por dia.",
          },
        },
        razao * 10,
      );
    }
  } else {
    motivos.push("faltam dias medidos para ver o padrão da semana");
  }

  // 2. O pico que veio do Instagram: o dia acima do normal, de maior alcance, que a regra do dia cruzado atribui ao Instagram.
  const comumAlcance = diaComum(e.alcance);
  if (e.alcance == null) motivos.push("o Instagram não respondeu");
  else if (comumAlcance == null) motivos.push("há poucos dias de Instagram para saber o dia comum");
  else if (faixa) {
    let pico: DiaCruzado | null = null;
    for (let i = 0; i < e.conversas.datas.length; i++) {
      const d = diaCruzado(i, e);
      if (d && d.causaVinda === "instagram" && d.marca === "acima" && d.conversas != null && d.alcance.valor != null && (pico == null || d.alcance.valor > (pico.alcance.valor as number))) pico = d;
    }
    if (pico && pico.alcance.valor != null && pico.conversas != null && faixa.mediana > 0) {
      const razaoAlcance = pico.alcance.valor / comumAlcance;
      const razaoConversas = pico.conversas / faixa.mediana;
      const maior = Math.max(razaoAlcance, razaoConversas);
      poe(
        {
          id: "atendimento-pico-do-instagram",
          tom: "bom",
          selo: "Fora do normal",
          frase: `O pico veio do Instagram: ${ddmm(pico.dia)} teve ${alcanceEmTexto(pico.alcance.valor)} de alcance e ${ptBr(pico.conversas)} conversas.`,
          quem: ROTULO_RESPONSAVEL.social_media,
          impacto: `alcance ${ptBr(Math.round(razaoAlcance * 10) / 10, 1)}× o comum`,
          acao: { rotulo: "Ver Instagram", rota: ROTA_INSTAGRAM },
          porque: {
            titulo: `${ddmm(pico.dia)} comparado com um dia comum`,
            barras: [
              barra("Alcance no Instagram", `${ptBr(Math.round(razaoAlcance * 10) / 10, 1)}× o comum`, razaoAlcance / maior),
              barra("Conversas no WhatsApp", `${ptBr(Math.round(razaoConversas * 10) / 10, 1)}× o comum`, razaoConversas / maior),
            ],
          },
        },
        razaoAlcance * 10,
      );
    }
  }

  // 3. Dias seguidos em que o anúncio quase parou (abaixo de um terço do dia comum, 2 dias ou mais).
  const comumAnuncio = diaComum(e.anuncios);
  if (e.anuncios == null) motivos.push("o anúncio não respondeu");
  else if (comumAnuncio == null) motivos.push("há poucos dias de anúncio para saber o dia comum");
  else if (comumAnuncio >= 3) {
    const trecho = trechoDoAnuncioParado(e.anuncios, comumAnuncio);
    if (trecho) {
      const valores = trecho.map((d) => d.valor as number);
      const total = valores.reduce((a, b) => a + b, 0);
      const pior = trecho.reduce((a, b) => ((b.valor as number) < (a.valor as number) ? b : a));
      poe(
        {
          id: "atendimento-anuncio-parou",
          tom: "ruim",
          selo: "Abaixo do normal",
          frase: `De ${ddmm(trecho[0].dia)} a ${ddmm(trecho[trecho.length - 1].dia)} o anúncio quase parou: só ${ptBr(total)} conversas pagas em ${trecho.length} dias.`,
          quem: ROTULO_RESPONSAVEL.gestor_trafego,
          impacto: `${ptBr(total)} conversas em ${trecho.length} dias`,
          acao: { rotulo: "Ver anúncios", rota: ROTA_ANUNCIOS },
          porque: {
            titulo: "Conversas pelo anúncio por dia",
            barras: [
              barra("Dia comum", ptBr(Math.round(comumAnuncio)), 1),
              barra("Nesses dias, por dia", ptBr(Math.round((total / trecho.length) * 10) / 10, 1), total / trecho.length / comumAnuncio),
              barra(`Pior dia (${ddmm(pior.dia)})`, ptBr(pior.valor as number), (pior.valor as number) / comumAnuncio),
            ],
          },
        },
        trecho.length * 5,
      );
    }
  }

  // 4. Viram lead de cada 100, agora contra antes (só com a base mínima nos dois períodos).
  const taxa = numerosDoAtendimento(e)[1];
  if (taxa.valor != null && taxa.antes != null && taxa.melhor !== null) {
    const agora = taxa.valor;
    const antes = taxa.antes;
    const chamaramAgora = e.somas.atual?.mandaram_mensagem ?? null;
    const leadsAgora = e.somas.atual?.leads_novos ?? null;
    const chamaramAntes = e.somas.antes?.mandaram_mensagem ?? null;
    const leadsAntes = e.somas.antes?.leads_novos ?? null;
    if (comValor(chamaramAgora) && comValor(leadsAgora) && comValor(chamaramAntes) && comValor(leadsAntes)) {
      poe(
        {
          id: "atendimento-viram-lead",
          tom: taxa.melhor ? "bom" : "ruim",
          selo: taxa.melhor ? "Em alta" : "Em queda",
          frase: `De cada 100 conversas, ${agora} viram lead. Antes eram ${antes}.`,
          quem: ROTULO_RESPONSAVEL.atendimento,
          impacto: `${antes} → ${agora} de cada 100`,
          // O médico não abre a auditoria de conversas (só a equipe): ele vai ao funil.
          acao: e.equipe ? { rotulo: "Ver conversas", local: ACOES_DE_ATENDIMENTO.conversas } : { rotulo: "Ver o funil", rota: ROTA_FUNIL },
          porque: {
            titulo: "Quantos viram lead, de cada 100",
            barras: [barra(TITULO_DA_TAXA, `${antes} → ${agora}`, agora / 100), barraDeContagem("Conversas", chamaramAntes, chamaramAgora), barraDeContagem("Viraram lead", leadsAntes, leadsAgora)],
            obs: "Conversas incluem pacientes antigos: é uma proporção, não uma passagem.",
          },
        },
        Math.abs(agora - antes) * 2,
      );
    }
  } else if (taxa.motivo == null && taxa.antes == null) {
    motivos.push("faltam as conversas e os leads do período anterior");
  }

  const itens = candidatas
    .map((c, k) => ({ ...c, k }))
    .sort((a, b) => Number(b.ruim) - Number(a.ruim) || b.impacto - a.impacto || a.k - b.k)
    .slice(0, MAXIMO_DE_DESCOBERTAS)
    .map((c) => c.d);
  const aviso = itens.length >= 3 ? null : `Poucas descobertas neste período: ${motivos[0] ?? "nada fora do normal nos outros dados"}.`;
  return { itens, aviso };
}
