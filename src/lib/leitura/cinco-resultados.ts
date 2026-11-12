// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03, D-01): o veredito (palavra + UMA frase com número grande), os
// 3 anéis Conversas, Agendaram e Fecharam contra o período anterior DA PRÓPRIA clínica e, nas partes seguintes deste módulo, o dinheiro, a
// comparação "você agora contra você antes" e as descobertas. Módulo puro: sem React, sem banco, sem rede e sem IA; recebe o que a tela
// já carregou. D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero.
import { LIMITES } from "@/lib/limites";
import { serieContinua } from "@/lib/linha-30-dias";
import type { Roi } from "@/lib/roi";
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

// ---------- apoio de datas e dinheiro ----------

const DIA_EM_MS = 86_400_000;
const emMs = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const emIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((emMs(b) - emMs(a)) / DIA_EM_MS) + 1;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const reais = (n: number, casas = 0) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const diasAntes = (n: number) => `${n} ${n === 1 ? "dia" : "dias"} antes`;

// ---------- o Instagram em janelas do mesmo tamanho ----------

/** O Instagram só fecha o dia 2 dias depois, e a comparação de seguidores e salvos precisa de uma semana para não oscilar por acaso. */
const DIAS_PARA_FECHAR_O_INSTAGRAM = 2;
const DIAS_DO_INSTAGRAM_PARA_COMPARAR = 7;
/** Fatia dos dias que precisa ter dado dos dois lados (a mesma folga de somaDiaria). */
const COBERTURA_DO_INSTAGRAM = 0.8;

export interface LinhaDoInstagram {
  date: string;
  reach?: number | null;
  saves?: number | null;
  new_followers?: number | null;
}

/**
 * Seguidores novos e salvos a cada mil alcançados nas MESMAS janelas, tirando os dias que o Instagram ainda está fechando: o período
 * atual vai do início até 2 dias atrás e o anterior tem o mesmo número de dias, terminando na véspera do início. Dia sem dado conta
 * como sem dado (nunca zero); sem 80% dos dias dos dois lados, ou com menos de 7 dias, o lado fica null e a tela diz "Falta dado".
 */
export function medidasDoInstagram(e: { metricas: readonly LinhaDoInstagram[]; anterior: readonly LinhaDoInstagram[]; start: string; end: string; hoje: string }): {
  seguidores: NonNullable<EntradaCincoResultados["seguidores"]> | null;
  salvos: NonNullable<EntradaCincoResultados["salvos"]> | null;
} {
  const ateFechado = emIso(emMs(e.hoje) - DIAS_PARA_FECHAR_O_INSTAGRAM * DIA_EM_MS);
  const ate = e.end < ateFechado ? e.end : ateFechado;
  const dias = diasEntre(e.start, ate);
  if (dias < DIAS_DO_INSTAGRAM_PARA_COMPARAR) return { seguidores: null, salvos: null };
  const antIni = emIso(emMs(e.start) - dias * DIA_EM_MS);
  const antFim = emIso(emMs(e.start) - DIA_EM_MS);
  const precisa = Math.ceil(dias * COBERTURA_DO_INSTAGRAM);

  const janela = (linhas: readonly LinhaDoInstagram[], de: string, ate: string) => {
    const dentro = linhas.filter((l) => l.date >= de && l.date <= ate);
    const seg = dentro.filter((l) => l.new_followers != null);
    const sal = dentro.filter((l) => l.reach != null && l.saves != null);
    return {
      seguidores: seg.length >= precisa ? seg.reduce((s, l) => s + Number(l.new_followers), 0) : null,
      salvos: sal.length >= precisa ? { salvos: sal.reduce((s, l) => s + Number(l.saves), 0), alcance: sal.reduce((s, l) => s + Number(l.reach), 0) } : null,
    };
  };
  const agora = janela(e.metricas, e.start, ate);
  const antes = janela(e.anterior, antIni, antFim);
  const rotuloAntes = diasAntes(dias);
  return {
    seguidores: { atual: agora.seguidores, antes: antes.seguidores, rotuloAntes },
    salvos: { atual: agora.salvos, antes: antes.salvos, rotuloAntes },
  };
}

// ---------- você agora contra você antes ----------

/** Uma linha da comparação da clínica com ela mesma: bolinha cinza (antes) e azul (agora), direita = melhor, invertido para custo. */
export interface LinhaAgoraContraAntes {
  id: "conversas" | "custo-por-conversa" | "seguidores-novos" | "salvos-por-mil";
  rotulo: string;
  agora: number | null;
  antes: number | null;
  formatar: (n: number) => string;
  menorEhMelhor?: boolean;
  /** Até 90 caracteres: "62% a mais que antes", "17% mais barato que antes", "Igual a antes". */
  frase: string;
  /** "Conversas · agora: X · 30 dias antes: Y · ▲ melhorou". */
  detalhe: string;
  /** true = melhorou, false = piorou, null = igual ou sem dado. */
  melhor: boolean | null;
  /** De 0 a 100, com a direita sendo o melhor (invertido para custo). null = sem dado: nenhuma bolinha. */
  posicaoAntes: number | null;
  posicaoAgora: number | null;
  rotuloAntes: string;
  /** O motivo de não haver comparação. Com ele a linha vem em cinza, sem bolinhas. */
  faltaDado?: string;
}

function linhaAgoraContraAntes(o: {
  id: LinhaAgoraContraAntes["id"];
  rotulo: string;
  agora: number | null;
  antes: number | null;
  formatar: (n: number) => string;
  menorEhMelhor?: boolean;
  rotuloAntes: string;
  baseMinima?: number;
  motivo: string;
}): LinhaAgoraContraAntes {
  const v = variacaoPropria(o.agora, o.antes, { menorEhMelhor: o.menorEhMelhor, baseMinima: o.baseMinima });
  if (!v || o.agora == null || o.antes == null) {
    return {
      id: o.id,
      rotulo: o.rotulo,
      agora: null,
      antes: null,
      formatar: o.formatar,
      menorEhMelhor: o.menorEhMelhor,
      frase: "Falta dado",
      detalhe: `${o.rotulo} · falta dado: ${o.motivo}`,
      melhor: null,
      posicaoAntes: null,
      posicaoAgora: null,
      rotuloAntes: o.rotuloAntes,
      faltaDado: o.motivo,
    };
  }
  const n = Math.abs(v.pct);
  const frase =
    v.sinal === "="
      ? "Igual a antes"
      : o.menorEhMelhor
        ? `${n}% ${v.sinal === "▲" ? "mais caro" : "mais barato"} que antes`
        : `${n}% ${v.sinal === "▲" ? "a mais" : "a menos"} que antes`;
  const topo = Math.max(o.agora, o.antes) * 1.15;
  const posicao = (x: number) => Math.round((4 + (o.menorEhMelhor ? 1 - x / topo : x / topo) * 92) * 10) / 10;
  const veredito = v.melhor === null ? "= igual" : v.melhor ? "▲ melhorou" : "▼ piorou";
  return {
    id: o.id,
    rotulo: o.rotulo,
    agora: o.agora,
    antes: o.antes,
    formatar: o.formatar,
    menorEhMelhor: o.menorEhMelhor,
    frase,
    detalhe: `${o.rotulo} · agora: ${o.formatar(o.agora)} · ${o.rotuloAntes}: ${o.formatar(o.antes)} · ${veredito}`,
    melhor: v.melhor,
    posicaoAntes: posicao(o.antes),
    posicaoAgora: posicao(o.agora),
    rotuloAntes: o.rotuloAntes,
  };
}

const custoDe = (lado: LadoDeAnuncios | null | undefined): number | null =>
  lado && lado.gasto != null && lado.conversas != null && lado.conversas > 0 ? lado.gasto / lado.conversas : null;
const porMil = (m: MedidaDeSalvos | null | undefined): number | null => (m && m.alcance > 0 ? (m.salvos / m.alcance) * 1000 : null);

/** As 4 linhas: conversas, custo por conversa, seguidores novos e salvos a cada mil alcançados. Só números desta clínica (D-02). */
export function linhasAgoraContraAntes(e: EntradaCincoResultados): LinhaAgoraContraAntes[] {
  const rotuloDoAnterior = diasAntes(e.dias);
  return [
    linhaAgoraContraAntes({
      id: "conversas",
      rotulo: "Conversas no WhatsApp",
      agora: e.atual.mandaram_mensagem ?? null,
      antes: e.antes.mandaram_mensagem ?? null,
      formatar: inteiro,
      rotuloAntes: rotuloDoAnterior,
      baseMinima: BASE_DO_ANTERIOR,
      motivo: "o histórico por dia não cobre os dois períodos",
    }),
    linhaAgoraContraAntes({
      id: "custo-por-conversa",
      rotulo: "Custo por conversa",
      agora: custoDe(e.ads?.atual),
      antes: custoDe(e.ads?.anterior),
      formatar: (n) => reais(n, 2),
      menorEhMelhor: true,
      rotuloAntes: rotuloDoAnterior,
      motivo: "faltam o gasto e as conversas dos anúncios",
    }),
    linhaAgoraContraAntes({
      id: "seguidores-novos",
      rotulo: "Seguidores novos",
      agora: e.seguidores?.atual ?? null,
      antes: e.seguidores?.antes ?? null,
      formatar: inteiro,
      rotuloAntes: e.seguidores?.rotuloAntes ?? rotuloDoAnterior,
      motivo: "o Instagram não tem dias medidos suficientes",
    }),
    linhaAgoraContraAntes({
      id: "salvos-por-mil",
      rotulo: "Salvos a cada mil alcançados",
      agora: porMil(e.salvos?.atual),
      antes: porMil(e.salvos?.antes),
      formatar: umaCasa,
      rotuloAntes: e.salvos?.rotuloAntes ?? rotuloDoAnterior,
      motivo: "falta o alcance do Instagram",
    }),
  ];
}

// ---------- cartões de dinheiro ----------

export interface CartaoDeDinheiro {
  id: "retorno" | "gasto" | "por-paciente";
  titulo: string;
  valor: number | null;
  /** O valor já formatado em R$. null = sem medida (o cartão diz "Sem dado"). */
  valorTexto: string | null;
  legenda?: string;
  antes: number | null;
  variacao: VariacaoPropria | null;
  /** "▼ 8% · gastou menos que antes". null quando não há comparação. */
  textoDaVariacao: string | null;
  /** O selo do cartão (sinal e palavra). Valor medido sem período anterior: "Falta dado · sem período anterior". */
  selo: { tom: TomFato; texto: string } | null;
  semMedida: boolean;
  /** Por que não há número ("precisa do valor médio da consulta"). */
  motivo: string | null;
  /** Só o retorno sem valor da consulta: a equipe tem o lugar onde o valor é informado. */
  equipeInformaValor: boolean;
  /** Série diária (só o gasto, quando há ao menos 2 dias). null = dia sem dado. */
  serie: { rotulo: string; datas: string[]; valores: (number | null)[] } | null;
}

function cartaoDeCusto(o: {
  id: CartaoDeDinheiro["id"];
  titulo: string;
  valor: number | null;
  antes: number | null;
  palavras: { mais: string; menos: string; igual: string };
  seloDe: { mais: string; menos: string };
  motivoSemValor: string;
  serie?: CartaoDeDinheiro["serie"];
}): CartaoDeDinheiro {
  const v = variacaoPropria(o.valor, o.antes, { menorEhMelhor: true });
  const palavra = !v ? null : v.sinal === "▲" ? o.palavras.mais : v.sinal === "▼" ? o.palavras.menos : o.palavras.igual;
  return {
    id: o.id,
    titulo: o.titulo,
    valor: o.valor,
    valorTexto: o.valor != null ? reais(o.valor) : null,
    antes: o.antes,
    variacao: v,
    textoDaVariacao: v && palavra ? `${v.texto} · ${palavra}` : null,
    selo:
      o.valor == null
        ? null
        : v
          ? v.sinal === "="
            ? { tom: "neutro", texto: "Igual a antes" }
            : { tom: v.melhor ? "bom" : "ruim", texto: v.sinal === "▲" ? o.seloDe.mais : o.seloDe.menos }
          : { tom: "neutro", texto: "Falta dado · sem período anterior" },
    semMedida: o.valor == null,
    motivo: o.valor == null ? o.motivoSemValor : null,
    equipeInformaValor: false,
    serie: o.serie ?? null,
  };
}

/** O que falta para o retorno, em poucas palavras, pelo primeiro item que bloqueia (a mesma ordem do passo a passo de montarRoi). */
const MOTIVO_DO_ITEM: Record<string, string> = {
  anuncios: "falta ligar a conta de anúncios",
  crm: "falta ligar o CRM",
  compartilhado: "o CRM é compartilhado com outro cliente",
  etapas: "falta marcar as etapas de venda no CRM",
  valor: "precisa do valor médio da consulta",
  origem: "falta a origem dos leads",
  origem_vendas: "falta a origem das vendas",
};
const MOTIVO_FINAL: Record<string, string> = {
  so_crescimento: "sem anúncio de aquisição no período",
  sem_investimento: "sem anúncio de aquisição no período",
  sem_venda: "nenhuma venda ganha no período",
  sem_separacao: "não dá para separar as vendas dos anúncios",
  sem_venda_anuncio: "nenhuma venda veio de anúncio no período",
  poucas_vendas_anuncio: "poucas vendas de anúncio para ler o retorno",
};

/** Resume o retorno de montarRoi para a entrada: calculável, ou o motivo curto. Só "valor" (sem valor médio da consulta) é coisa que a equipe informa. */
export function retornoDaEntrada(r: Pick<Roi, "calculavel" | "retornoPorReal" | "motivoFinal" | "itens"> | null | undefined): RetornoDaEntrada | null {
  if (!r) return null;
  if (r.calculavel && r.retornoPorReal != null) return { calculavel: true, retornoPorReal: r.retornoPorReal, motivo: null, equipeInformaValor: false };
  const pendente = r.itens.find((i) => i.bloqueia && !i.feito);
  const motivo = pendente ? (MOTIVO_DO_ITEM[pendente.id] ?? "faltam dados do CRM") : ((r.motivoFinal && MOTIVO_FINAL[r.motivoFinal]) ?? "o retorno ainda não pode ser calculado");
  return { calculavel: false, retornoPorReal: null, motivo, equipeInformaValor: pendente?.id === "valor" };
}

/** Os 3 cartões de dinheiro: retorno em R$, gasto em anúncios e anúncio por paciente fechado (custo: menos é melhor). */
export function cartoesDeDinheiro(e: EntradaCincoResultados): CartaoDeDinheiro[] {
  const r = e.retorno;
  const temRetorno = !!r?.calculavel && r.retornoPorReal != null;
  const retorno: CartaoDeDinheiro = {
    id: "retorno",
    titulo: "Retorno em R$",
    valor: temRetorno ? r!.retornoPorReal : null,
    valorTexto: temRetorno ? reais(r!.retornoPorReal!, 2) : null,
    legenda: temRetorno ? "para cada R$ 1 em anúncio" : undefined,
    antes: null,
    variacao: null,
    textoDaVariacao: null,
    selo: null,
    semMedida: !temRetorno,
    motivo: temRetorno ? null : (r?.motivo ?? "os números comerciais ainda não chegaram"),
    equipeInformaValor: !temRetorno && !!r?.equipeInformaValor,
    serie: null,
  };

  const gastoAgora = e.ads?.atual?.gasto ?? null;
  const gastoAntes = e.ads?.anterior?.gasto ?? null;
  const dias = serieContinua((e.ads?.porDia ?? []).map((d) => ({ dia: d.dia, valor: d.gasto })));
  const gasto = cartaoDeCusto({
    id: "gasto",
    titulo: "Gasto em anúncios",
    valor: gastoAgora,
    antes: gastoAntes,
    palavras: { mais: "gastou mais que antes", menos: "gastou menos que antes", igual: "gasto igual ao de antes" },
    seloDe: { mais: "Gastou mais", menos: "Gastou menos" },
    motivoSemValor: "a conta de anúncios não respondeu neste período",
    serie: dias.datas.length >= 2 ? { rotulo: "investido", datas: dias.datas, valores: dias.valores } : null,
  });

  const fechadosAgora = e.atual.fecharam ?? null;
  const fechadosAntes = e.antes.fecharam ?? null;
  const porPaciente = (g: number | null, fechados: number | null) => (g != null && fechados != null && fechados > 0 ? g / fechados : null);
  const motivo = gastoAgora == null ? "falta o gasto em anúncios" : fechadosAgora == null ? "os fechados do período não foram medidos" : "ninguém fechou no período";
  const paciente = cartaoDeCusto({
    id: "por-paciente",
    titulo: "Anúncio por paciente fechado",
    valor: porPaciente(gastoAgora, fechadosAgora),
    antes: porPaciente(gastoAntes, fechadosAntes),
    palavras: { mais: "mais caro que antes", menos: "mais barato que antes", igual: "custo igual ao de antes" },
    seloDe: { mais: "Mais caro", menos: "Mais barato" },
    motivoSemValor: motivo,
  });
  return [retorno, gasto, paciente];
}
