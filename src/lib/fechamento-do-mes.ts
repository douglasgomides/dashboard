// Fechamento do mês (Phase 03.1.1.1, plano 08, D-06): os cartões da história em tela cheia que a Resultados da clínica abre. Módulo puro:
// sem React, sem banco, sem rede e sem IA; recebe só o que Resultados já carregou. Cada cartão leva UM número grande e se compara
// SOMENTE com o período anterior DA PRÓPRIA clínica, de mesmo tamanho, com as datas escritas no cartão (D-02: nenhuma outra clínica,
// nenhuma carteira). Nenhum número estimado ou "o que teria sido" (D-05): só o que foi medido. Dado que falta tira o cartão: nunca vira 0.
// D-04: a história não compartilha, não exporta e não envia nada; este módulo nem tem texto para isso.
import type { FunilDesenhado } from "@/lib/funil-desenhado";
import { LIMITES } from "@/lib/limites";
import { nomeDaSaudacao } from "@/lib/leitura/fatos-hoje";
import { checarFraseCinco, variacaoPropria } from "@/lib/leitura/cinco-segundos";
import { custoPorConversa, type AdsDoPeriodo, type CrescimentoDoPeriodo } from "@/lib/leitura/cinco-hoje";
import { MIN_DIAS_SALDO } from "@/lib/leitura/fatos-instagram";
import type { TomFato } from "@/lib/leitura/tipos";
import { nomeLeigoDoFormato } from "@/lib/leitura-periodo";
import { brazilWeekdayAndHour } from "@/lib/report-metrics";

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

/** Pontos de um cartão: o mesmo desenho para "antes" e "agora" (cada ponto vale `passo` pessoas, escrito no cartão). */
export type PontoDaEscala = "base" | "mais" | "menos" | "vazio";

/** O desenho de um cartão (só dados: a peça desenha com tokens, nunca com HTML vindo da regra). */
export type VisualDoCartao =
  | { tipo: "pontos"; pontos: readonly PontoDaEscala[]; legenda: readonly string[] }
  | { tipo: "barras"; valores: readonly (number | null)[]; legenda: string }
  | { tipo: "linha"; valores: readonly (number | null)[]; legenda: string }
  | { tipo: "funil"; etapas: readonly { rotulo: string; valor: string; fracao: number; perda: boolean }[] }
  | { tipo: "regua"; dias: readonly number[]; agora: number; legenda: readonly string[] }
  | { tipo: "lista"; itens: readonly { titulo: string; motivo: string }[] };

export type IdDoCartao = "abertura" | "alcance" | "seguidores" | "post" | "custo" | "whatsapp" | "perda" | "apostas" | "final";

/** O post campeão do mês, em texto (a legenda é da própria clínica e vai como texto, com o corte só no desenho). */
export interface PostDoCartao {
  legenda: string | null;
  alcance: string | null;
  formato: string | null;
  tema: string | null;
  quando: string | null;
}

export interface CartaoDoMes {
  id: IdDoCartao;
  /** A etiqueta pequena de cima ("WhatsApp"). */
  rotulo: string;
  /** O ÚNICO número grande do cartão, já formatado. null nos cartões de texto (abertura, apostas e final). */
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
  post?: PostDoCartao;
  tom: TomFato;
}

/** Uma linha do histórico de posts (o que o banco devolve; só estes campos são lidos). */
export interface PostDoMes {
  saved?: number | null;
  reach?: number | null;
  posted_at?: string | null;
  caption?: string | null;
  format?: string | null;
  tema?: string | null;
}

/** Uma aposta: o verbo e o motivo, as mesmas frases das 3 primeiras descobertas da Hoje. */
export interface ApostaDoMes {
  titulo: string;
  motivo: string;
}

/** O que a Resultados já tem em mãos. Cada parte que falta tira o cartão dela (nunca vira 0). */
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
  /** Alcance do Instagram: soma dos dias fechados dos dois períodos (null = o histórico não cobre 80% dos dias). */
  alcance?: { atual: number | null; antes: number | null } | null;
  /** Seguidores novos dos dois períodos (analyzeGrowth) e o total de seguidores de cada dia do período. */
  seguidores?: { atual: CrescimentoDoPeriodo | null; antes: CrescimentoDoPeriodo | null; total: readonly (number | null)[] } | null;
  /** Os posts do período (o campeão é o de mais salvamentos). */
  posts?: readonly PostDoMes[] | null;
  /** Anúncios: a linha agregada de cada período e um dia por linha do período atual. */
  anuncios?: { atual: AdsDoPeriodo | null; antes: AdsDoPeriodo | null; porDia: readonly { dia: string; gasto: number | null; conversas: number | null }[] } | null;
  /** O funil de pessoas do período e quantos fecharam (soma dos dias) nos dois períodos. */
  funil?: { desenhado: FunilDesenhado | null; fecharam: { atual: number | null; antes: number | null } } | null;
  /** As 3 apostas para o próximo mês (as 3 primeiras descobertas da Hoje). */
  apostas?: readonly ApostaDoMes[] | null;
}

/** De 28 a 31 dias (o dia de início e o de fim contam). */
export function periodoServeParaFechamento(start: string, end: string): boolean {
  const dias = Math.round((emMs(end) - emMs(start)) / DIA_EM_MS) + 1;
  return dias >= MIN_DIAS_DO_MES && dias <= MAX_DIAS_DO_MES;
}

// ---------- pontos com escala ----------

/** Os degraus de "pessoas por ponto" (1, 2, 5, 10, 20, 50, ...): o menor em que os dois números cabem em até 40 pontos. */
const MAX_DE_PONTOS = 40;
const DEGRAUS = [1, 2, 5];

function rotuloDoPasso(k: number): string {
  if (k >= 1_000_000) return `1 ponto = ${(k / 1_000_000).toLocaleString("pt-BR")} ${k === 1_000_000 ? "milhão" : "milhões"} de pessoas`;
  if (k >= 1000) return `1 ponto = ${(k / 1000).toLocaleString("pt-BR")} mil pessoas`;
  return `1 ponto = ${k} ${k === 1 ? "pessoa" : "pessoas"}`;
}

/**
 * Uma escala só para os dois números do cartão (agora e período anterior): quantas pessoas vale cada ponto, de modo que o maior dos dois
 * caiba em até 40 pontos, e quantos pontos tem cada lado. null sem número medido ou com os dois em zero (nada a desenhar).
 */
export function pontosDaEscala(atual: number | null | undefined, antes: number | null | undefined): { passo: number; rotulo: string; pontosAtual: number; pontosAntes: number } | null {
  const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n >= 0;
  if (!ok(atual) || !ok(antes)) return null;
  const maior = Math.max(atual, antes);
  if (maior <= 0) return null;
  let passo = 0;
  for (let potencia = 1; passo === 0; potencia *= 10) {
    passo = DEGRAUS.map((d) => d * potencia).find((k) => maior / k <= MAX_DE_PONTOS) ?? 0;
  }
  return { passo, rotulo: rotuloDoPasso(passo), pontosAtual: Math.round(atual / passo), pontosAntes: Math.round(antes / passo) };
}

/** Os pontos do cartão: o que já havia antes (base), o que passou (mais) e o que ficou abaixo do período anterior (menos). Em linhas de 10. */
function desenharPontos(pontosAtual: number, pontosAntes: number): PontoDaEscala[] {
  const total = Math.min(MAX_DE_PONTOS, Math.max(10, Math.ceil(Math.max(pontosAtual, pontosAntes) / 10) * 10));
  return Array.from({ length: total }, (_, i): PontoDaEscala => {
    if (i < Math.min(pontosAtual, pontosAntes)) return "base";
    if (i < pontosAtual) return "mais";
    if (i < pontosAntes) return "menos";
    return "vazio";
  });
}

// ---------- comparação e texto ----------

const tomDe = (melhor: boolean | null | undefined): TomFato => (melhor === true ? "bom" : melhor === false ? "ruim" : "neutro");
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** 2.400.000 vira "2,4 mi"; abaixo de um milhão, o número inteiro com ponto de milhar. */
const compacto = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : inteiro(n));

/** "▲ 50% · antes eram 200": o sinal vai junto (nunca só a cor). Sem comparação possível (antes ausente ou zero) devolve null. */
function comparar(
  atual: number | null | undefined,
  antes: number | null | undefined,
  opcoes: { menorEhMelhor?: boolean; formatar?: (n: number) => string } = {},
): { texto: string; melhor: boolean | null } | null {
  const v = variacaoPropria(atual, antes, { menorEhMelhor: opcoes.menorEhMelhor });
  if (!v || antes == null) return null;
  return { texto: `${v.texto} · antes eram ${(opcoes.formatar ?? inteiro)(antes)}`, melhor: v.melhor };
}

const mediana = (xs: readonly number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** O dia da semana e a hora (de São Paulo) do post: "qua., 14/10 às 18h". */
function quandoFoiPublicado(iso: string): string | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const dia = t.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} às ${brazilWeekdayAndHour(iso).hour}h`;
}

/** O post com mais salvamentos do período (empate: mais alcance, depois o mais recente). Sem nenhum salvamento medido, não há campeão. */
function campeaoDosPosts(posts: readonly PostDoMes[] | null | undefined): PostDoMes | null {
  const candidatos = (posts ?? []).filter((p) => Number(p.saved) > 0);
  if (!candidatos.length) return null;
  return [...candidatos].sort((a, b) => Number(b.saved) - Number(a.saved) || Number(b.reach ?? 0) - Number(a.reach ?? 0) || String(b.posted_at ?? "").localeCompare(String(a.posted_at ?? "")))[0];
}

// ---------- os cartões ----------

/**
 * Os cartões do mês, na ordem da história: abertura, Instagram (alcance, seguidores novos, post campeão), custo por conversa, WhatsApp,
 * onde mais perdemos, 3 apostas e o resumo final. Cada um só existe com dado medido; cada texto passa por `checarFraseCinco` (90 caracteres,
 * sem jargão, sem comparar clínicas, sem promessa) e o que não passa não entra. Nenhuma estimativa: só o que foi medido.
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

  // Instagram: alcance (soma dos dias fechados) com os pontos "antes" e "agora".
  const a = e.alcance;
  if (a?.atual != null && a.atual > 0) {
    const comp = comparar(a.atual, a.antes, { formatar: compacto });
    const escala = pontosDaEscala(a.atual, a.antes);
    cartoes.push({
      id: "alcance",
      rotulo: "Instagram",
      numero: compacto(a.atual),
      legenda: "de alcance no Instagram, somando os dias",
      ...(comp ? { comparacao: comp.texto } : {}),
      periodo,
      ...(escala && a.antes != null
        ? {
            visual: {
              tipo: "pontos" as const,
              pontos: desenharPontos(escala.pontosAtual, escala.pontosAntes),
              legenda: [`antes: ${escala.pontosAntes} pontos`, `agora: ${escala.pontosAtual} pontos`, escala.rotulo],
            },
          }
        : {}),
      tom: tomDe(comp?.melhor),
    });
  }

  // Instagram: seguidores novos (saldo dos dias fechados medidos) e o total de seguidores dia a dia.
  const sg = e.seguidores;
  if (sg?.atual && sg.atual.diasMedidos >= MIN_DIAS_SALDO && sg.atual.novos > 0) {
    // Os dois períodos têm quantidades diferentes de dias fechados medidos: compara a média por dia.
    const porDia = (c: CrescimentoDoPeriodo | null | undefined) => (c && c.diasMedidos >= MIN_DIAS_SALDO ? c.novos / c.diasMedidos : null);
    const v = variacaoPropria(porDia(sg.atual), porDia(sg.antes));
    const total = sg.total.filter((x): x is number => x != null);
    cartoes.push({
      id: "seguidores",
      rotulo: "Seguidores",
      numero: `+${inteiro(sg.atual.novos)}`,
      legenda: "pessoas novas te seguindo",
      ...(v && sg.antes ? { comparacao: `${v.texto} por dia · antes eram ${inteiro(sg.antes.novos)}` } : {}),
      periodo,
      ...(total.length >= 2 ? { visual: { tipo: "linha" as const, valores: sg.total, legenda: `${inteiro(total[0])} → ${inteiro(total[total.length - 1])} seguidores` } } : {}),
      tom: tomDe(v?.melhor),
    });
  }

  // Instagram: o post campeão (mais salvamentos).
  const campeao = campeaoDosPosts(e.posts);
  if (campeao) {
    const salvos = Number(campeao.saved);
    const legenda = (campeao.caption ?? "").replace(/\s+/g, " ").trim();
    cartoes.push({
      id: "post",
      rotulo: "Seu post campeão",
      numero: inteiro(salvos),
      legenda: salvos === 1 ? "pessoa salvou" : "pessoas salvaram",
      post: {
        legenda: legenda || null,
        alcance: campeao.reach != null && Number(campeao.reach) > 0 ? compacto(Number(campeao.reach)) : null,
        formato: campeao.format ? nomeLeigoDoFormato(campeao.format) : null,
        tema: campeao.tema?.trim() || null,
        quando: campeao.posted_at ? quandoFoiPublicado(campeao.posted_at) : null,
      },
      periodo: { atual: periodo.atual, anterior: periodo.anterior },
      tom: "neutro",
    });
  }

  // Anúncios: custo por conversa (menos é melhor), só com conversas dos dois períodos acima da base mínima do funil.
  const ad = e.anuncios;
  const custoAgora = custoPorConversa(ad?.atual);
  const custoAntes = custoPorConversa(ad?.antes);
  const baseOk = (ad?.atual?.conversas ?? 0) >= LIMITES.funil.minLeads && (ad?.antes?.conversas ?? 0) >= LIMITES.funil.minLeads;
  if (ad && custoAgora != null && custoAntes != null && baseOk) {
    const v = variacaoPropria(custoAgora, custoAntes, { menorEhMelhor: true });
    const chip = v ? (v.sinal === "=" ? `= igual · antes ${reais(custoAntes)}` : `${v.sinal} ${Math.abs(v.pct)}% mais ${v.pct < 0 ? "barato" : "caro"} · antes ${reais(custoAntes)}`) : undefined;
    const dias = ad.porDia
      .filter((d) => d.dia >= e.inicio && d.dia <= e.fim && d.gasto != null && d.conversas != null && d.conversas > 0)
      .map((d) => Number(d.gasto) / Number(d.conversas));
    // A escala passa de duas vezes o custo típico: um dia fora da curva não espreme os outros no canto.
    const teto = Math.max(custoAgora, dias.length ? mediana(dias) : 0) * 2;
    const pos = (x: number) => Math.round((Math.min(x, teto) / teto) * 1000) / 10;
    cartoes.push({
      id: "custo",
      rotulo: "Anúncios",
      numero: reais(custoAgora),
      legenda: "por conversa no WhatsApp",
      ...(chip ? { comparacao: chip } : {}),
      periodo,
      ...(dias.length >= 5
        ? { visual: { tipo: "regua" as const, dias: dias.map(pos), agora: pos(custoAgora), legenda: ["mais barato", "mais caro", "cada ponto = 1 dia seu"] } }
        : {}),
      tom: tomDe(v?.melhor),
    });
  }

  // WhatsApp: conversas dos dois períodos, com as barras por dia.
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

  // Onde mais perdemos: a ligação do funil que mais perde. D-01: a ligação fora de ordem (etapa com mais gente que a anterior) fica sem %
  // e nunca é a maior perda, então uma ligação fora de ordem em outro ponto não tira este cartão.
  const f = e.funil;
  const perda = f?.desenhado?.maiorPerda ?? null;
  if (f?.desenhado && perda) {
    const etapas = f.desenhado.etapas;
    const de = etapas[perda.de];
    const para = etapas[perda.para];
    const taxa = para?.passagem?.taxa;
    if (de && para && taxa != null && de.valor != null && para.valor != null) {
      const maior = Math.max(...etapas.map((x) => x.valor ?? 0), 1);
      const v = variacaoPropria(f.fecharam.atual, f.fecharam.antes);
      cartoes.push({
        id: "perda",
        rotulo: "Onde mais perdemos",
        numero: `${Math.round(taxa * 100)}%`,
        legenda: `passam de ${de.nome} para ${para.nome}`,
        ...(f.fecharam.atual != null && f.fecharam.antes != null
          ? { comparacao: `${v ? `${v.texto} · ` : ""}fecharam ${inteiro(f.fecharam.atual)}, antes ${inteiro(f.fecharam.antes)}` }
          : {}),
        periodo,
        visual: {
          tipo: "funil",
          etapas: etapas.filter((x) => x.valor != null).map((x) => ({ rotulo: x.nome, valor: inteiro(x.valor as number), fracao: Math.max(0.015, (x.valor as number) / maior), perda: x.id === para.id })),
        },
        tom: "ruim",
      });
    }
  }

  // 3 apostas: as mesmas frases das descobertas da Hoje (nada estimado: só o que a regra já mede).
  const apostas = (e.apostas ?? []).filter((x) => checarFraseCinco(x.titulo).length === 0 && checarFraseCinco(x.motivo).length === 0).slice(0, 3);
  if (apostas.length) {
    cartoes.push({
      id: "apostas",
      rotulo: "Próximo mês",
      numero: null,
      titulo: `${apostas.length} ${apostas.length === 1 ? "aposta" : "apostas"}`,
      legenda: "para o próximo mês",
      visual: { tipo: "lista", itens: apostas },
      tom: "neutro",
    });
  }

  // Final: uma frase com o que existe nos cartões (chamaram, fecharam).
  const partes: string[] = [];
  if (c?.atual != null) partes.push(`${inteiro(c.atual)} ${c.atual === 1 ? "chamou" : "chamaram"}`);
  if (f?.fecharam.atual != null) partes.push(`${inteiro(f.fecharam.atual)} ${f.fecharam.atual === 1 ? "fechou" : "fecharam"}`);
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
