// Funil desenhado (sketch 001, variante A2, aprovada pelo João em 12/11/2026): faixas centradas em escala de raiz, ligações em
// trapézio com "N% passam", a maior perda em vermelho e o toco "Falta dado" no lugar de barra ou zero.
// Módulo puro: sem React, sem banco, sem IA, sem consulta nova. Só regra sobre o que a tela já carregou (D-05 da 03.1.1).
// Cada adaptador traduz o funil que a tela já tem (comercial, pacientes, jornada) para as mesmas 5 etapas.
import type { DadosComerciais, Funil as FunilComercial, IdPasso, PassoFunil } from "./comercial";
import { fmtNdeM } from "./funil-taxa";
import { foraDeOrdem } from "./leitura/fatos-comercial";
import type { BarraDoFato } from "./leitura/tipos";
import { fmtFracao } from "./metricas";

/**
 * Nomes do João em 12/11/2026 (decisão aberta 1 / D-06, só os nomes; registrado em .planning/STATE.md). Valem no funil
 * desenhado; a leitura mantém os nomes dela porque o filtro de jargão de texto.ts proíbe a palavra no texto da leitura.
 */
export const NOMES_DO_FUNIL = ["Conversou", "Virou lead", "Atendido", "Agendou", "Fechou"] as const;

export interface PassagemDesenhada {
  /** Fração 0..1, só quando a base tem o mínimo. */
  taxa: number | null;
  /** "N de M" quando a base é pequena demais para %. */
  fracao: { n: number; m: number } | null;
  /** Por que as duas etapas não ganham % (contam populações diferentes). */
  sem: string | null;
}

export interface VariacaoDaEtapa {
  /** Com sinal: +25 é "25% a mais que o período anterior". */
  pct: number;
  sobe: boolean;
}

export interface EtapaDesenhada {
  id: string;
  nome: string;
  /** null = Falta dado (nunca barra nem zero). */
  valor: number | null;
  /** Número formatado em pt-BR, ou "Falta dado". */
  texto: string;
  /** Mostra "≈" antes do número. */
  estimado: boolean;
  /** Por que falta (só com valor null). */
  motivo: string | null;
  /** Frase curta para a gaveta. */
  explicacao: string | null;
  /** Só quando o período anterior está em memória. */
  variacao: VariacaoDaEtapa | null;
  /** Da etapa de cima para esta. null na primeira etapa e quando uma das duas é Falta dado. */
  passagem: PassagemDesenhada | null;
  /** Barras da gaveta: só contagens. */
  detalhe: BarraDoFato[];
}

export interface FunilDesenhado {
  etapas: EtapaDesenhada[];
  /** Índices das etapas de cima (de) e de baixo (para) da ligação que mais perde. null quando a regra não aponta. */
  maiorPerda: { de: number; para: number; texto: string } | null;
  foraDeOrdem: boolean;
  aviso: string | null;
}

export const AVISO_FORA_DE_ORDEM = "Funil fora de ordem: uma etapa tem mais gente que a anterior, então a maior perda não é apontada.";
export const FALTA_DADO = "Falta dado";

const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
const arredonda2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- geometria e textos

/** Escala de raiz: o fundo continua visível mesmo com alcance de centenas de milhares. Valor 0 e sem valor dão o mínimo. */
export function larguraDaEtapa(valor: number | null | undefined, maior: number, minimo = 8): number {
  if (valor == null || !(valor > 0) || !(maior > 0)) return minimo;
  return Math.min(100, Math.max(minimo, Math.sqrt(valor / maior) * 100));
}

/** O valor que a etapa tinha no período anterior, estimado pela variação que a tela já calculou. */
export function valorDoAnterior(e: Pick<EtapaDesenhada, "valor" | "variacao">): number | null {
  if (e.valor == null || !e.variacao) return null;
  const fator = 1 + e.variacao.pct / 100;
  if (!(fator > 0)) return null;
  return e.valor / fator;
}

/** A maior escala entre os valores de agora e os anteriores estimados, para o contorno nunca ser cortado. */
export function maiorDaEscala(etapas: readonly Pick<EtapaDesenhada, "valor" | "variacao">[]): number {
  let maior = 0;
  for (const e of etapas) {
    if (e.valor != null && e.valor > maior) maior = e.valor;
    const antes = valorDoAnterior(e);
    if (antes != null && antes > maior) maior = antes;
  }
  return maior;
}

/** Largura do contorno tracejado do período anterior (0..100), ou null quando não há como estimar. */
export function larguraDoAnterior(e: Pick<EtapaDesenhada, "valor" | "variacao">, maior: number, minimo = 8): number | null {
  const antes = valorDoAnterior(e);
  return antes == null ? null : larguraDaEtapa(antes, maior, minimo);
}

/** clip-path do trapézio que liga duas faixas centradas (larguras em % do trilho). */
export function poligonoDaLigacao(w1: number, w2: number): string {
  const l1 = arredonda2((100 - w1) / 2);
  const l2 = arredonda2((100 - w2) / 2);
  return `polygon(${l1}% 0, ${arredonda2(100 - l1)}% 0, ${arredonda2(100 - l2)}% 100%, ${l2}% 100%)`;
}

/** "9,4% passam" (mesmo formato de fmtFracao), "N de M" quando a base é pequena, ou nada. */
export function textoDaPassagem(p: PassagemDesenhada | null | undefined): string | null {
  if (!p) return null;
  if (p.taxa != null) return `${fmtFracao(p.taxa)} passam`;
  if (p.fracao) return fmtNdeM(p.fracao);
  return null;
}

/** "mês antes" com 28 a 31 dias; senão "período anterior". */
export function rotuloDoAnterior(dias: number): string {
  return dias >= 28 && dias <= 31 ? "mês antes" : "período anterior";
}

/** A variação para a tela: "▲ 25%" (o sinal vai no texto, nunca só a cor). */
export function textoDaVariacao(v: VariacaoDaEtapa): string {
  return `${v.sobe ? "▲" : "▼"} ${Math.abs(v.pct)}%`;
}

/** Descrição de uma etapa para leitor de tela: número, variação e passagem ou o motivo de não ter %. */
export function descricaoDaEtapa(e: EtapaDesenhada, rotuloAnterior = "mês antes"): string {
  const partes = [`${e.nome}: ${e.estimado && e.valor != null ? "cerca de " : ""}${e.texto}`];
  if (e.variacao) partes.push(`${e.variacao.sobe ? "subiu" : "caiu"} ${Math.abs(e.variacao.pct)}% sobre o ${rotuloAnterior}`);
  if (e.valor == null) {
    if (e.motivo) partes.push(e.motivo);
  } else if (e.passagem) {
    const t = textoDaPassagem(e.passagem);
    if (t) partes.push(t);
    else if (e.passagem.sem) partes.push(e.passagem.sem);
  }
  return partes.join(", ");
}

/** Uma frase por etapa e a maior perda, para o leitor de tela. */
export function resumoAcessivel(titulo: string, funil: FunilDesenhado, rotuloAnterior = "mês antes"): string {
  const frases = funil.etapas.map((e) => `${descricaoDaEtapa(e, rotuloAnterior)}.`);
  const mp = funil.maiorPerda;
  if (mp) frases.push(`Maior perda: ${funil.etapas[mp.de].nome} para ${funil.etapas[mp.para].nome} (${mp.texto}).`);
  if (funil.aviso) frases.push(funil.aviso);
  return `${titulo}. ${frases.join(" ")}`;
}

// ---------------------------------------------------------------- peças comuns dos adaptadores

/** Barras da gaveta: só as contagens que não são null, com a fração relativa ao maior da própria lista. */
function barrasDe(lista: readonly (readonly [string, number | null | undefined])[]): BarraDoFato[] {
  const itens = lista.filter((l): l is readonly [string, number] => l[1] != null && Number.isFinite(l[1]));
  if (itens.length === 0) return [];
  const maior = Math.max(1, ...itens.map((l) => l[1]));
  return itens.map(([rotulo, v]) => ({ rotulo, exibicao: fmtN(v), fracao: v / maior }));
}

function etapaCom(base: { id: string; nome: string; valor: number | null; estimado?: boolean; motivo?: string | null; explicacao?: string | null; variacao?: VariacaoDaEtapa | null; detalhe?: BarraDoFato[] }): EtapaDesenhada {
  const faltou = base.valor == null;
  return {
    id: base.id,
    nome: base.nome,
    valor: base.valor,
    texto: faltou ? FALTA_DADO : fmtN(base.valor!),
    estimado: !faltou && !!base.estimado,
    motivo: faltou ? base.motivo ?? "Este número não veio neste período." : null,
    explicacao: base.explicacao ?? null,
    variacao: faltou ? null : base.variacao ?? null,
    passagem: null,
    detalhe: faltou ? [] : base.detalhe ?? [],
  };
}

/** Liga a passagem à etapa de baixo. Se uma das duas é Falta dado, a ligação fica neutra. */
function ligar(etapas: EtapaDesenhada[], i: number, p: PassagemDesenhada | null): void {
  const cima = etapas[i - 1];
  const baixo = etapas[i];
  baixo.passagem = cima.valor == null || baixo.valor == null ? null : p;
}

// ---------------------------------------------------------------- Funil › No CRM (crm-painel)

const SEM_CONVERSA_VIRA_LEAD = "Conversas do WhatsApp e cards do CRM são contas diferentes: lead de formulário não passa pela conversa.";
const INDICE_DO_PASSO: Record<IdPasso, number> = { entraram: 1, atendidos: 2, agendaram: 3, compraram: 4 };
const ORDEM_DOS_PASSOS: IdPasso[] = ["entraram", "atendidos", "agendaram", "compraram"];

function motivoDeConversou(d: DadosComerciais): string | null {
  const w = d.whatsapp;
  if (!w.conectado) return "O WhatsApp da clínica não está ligado ao Nexo.";
  if (w.conversas == null) return "As conversas do WhatsApp não vieram neste período.";
  if (d.escopo !== "periodo") return "Poucos leads no período: o CRM foi lido na base inteira, sem conversas do período.";
  return null;
}

/** Do diagnóstico comercial (a mesma conta de montarFunil) para as 5 etapas do funil desenhado. */
export function deFunilComercial(d: { funil: FunilComercial; dados: DadosComerciais }): FunilDesenhado {
  const { funil, dados } = d;
  const c = dados.c;
  const motivoConversou = motivoDeConversou(dados);
  const nomeDaEtapa = (passo: PassoFunil | undefined): string | null => {
    if (!passo) return null;
    const i = ORDEM_DOS_PASSOS.indexOf(passo.id);
    return i < 0 ? null : NOMES_DO_FUNIL[i + 1];
  };

  const etapas: EtapaDesenhada[] = [
    etapaCom({
      id: "conversou",
      nome: NOMES_DO_FUNIL[0],
      valor: motivoConversou ? null : dados.whatsapp.conversas,
      motivo: motivoConversou,
      explicacao: "Conversas do WhatsApp que começaram no período.",
      detalhe: barrasDe([["Conversas no período", dados.whatsapp.conversas], ["Com espera medida", dados.whatsapp.respondidas]]),
    }),
  ];
  const detalhes: Record<IdPasso, BarraDoFato[]> = {
    entraram: barrasDe([["Ainda na primeira etapa", c.naEntrada], ["Já atendidos", c.atendidos], ["Perdidos", c.perdidos], ["Fechados", c.ganhos]]),
    atendidos: barrasDe([["Agendaram", c.agendados], ["Fecharam", c.ganhos], ["Perdidos", c.perdidos]]),
    agendaram: barrasDe([["Em consulta agendada", c.emConsulta], ["Fecharam", c.ganhos]]),
    compraram: barrasDe([["Fechados", c.ganhos]]),
  };
  const passos = ORDEM_DOS_PASSOS.map((id) => funil.passos.find((p) => p.id === id));
  passos.forEach((passo, k) => {
    const nome = NOMES_DO_FUNIL[k + 1];
    if (!passo) {
      etapas.push(etapaCom({ id: ORDEM_DOS_PASSOS[k], nome, valor: null, motivo: "O diagnóstico não trouxe esta etapa." }));
      return;
    }
    const explicacao = passo.estimado && passo.aviso ? `${passo.explica} ${passo.aviso}` : passo.explica;
    etapas.push(etapaCom({ id: passo.id, nome, valor: passo.valor, estimado: passo.estimado, motivo: passo.aviso ?? null, explicacao, detalhe: detalhes[passo.id] }));
  });

  // Ligações. Conversou → Virou lead nunca ganha %: são contas diferentes.
  ligar(etapas, 1, { taxa: null, fracao: null, sem: SEM_CONVERSA_VIRA_LEAD });
  for (let i = 2; i < etapas.length; i++) {
    const passo = passos[i - 1];
    if (!passo) continue;
    const p: PassagemDesenhada = { taxa: passo.pctDoAnterior, fracao: passo.fracaoDoAnterior, sem: null };
    if (etapas[i - 1].valor == null && etapas[i].valor != null && (p.taxa != null || p.fracao)) {
      // A de cima é Falta dado: a ligação fica neutra e a conta, com a base que o passo usou, vai para a explicação da etapa.
      const baseDoPasso = passos.find((x) => x?.rotulo.toLowerCase() === passo.anterior);
      const nomeBase = nomeDaEtapa(baseDoPasso);
      const conta = p.taxa != null ? `${fmtFracao(p.taxa)} passam` : fmtNdeM(p.fracao!);
      if (nomeBase) etapas[i].explicacao = `${etapas[i].explicacao ?? ""} Sobre ${nomeBase}: ${conta}.`.trim();
    }
    ligar(etapas, i, p);
  }

  // Maior perda da regra do diagnóstico, mapeada para índices. Funil fora de ordem apaga a maior perda.
  if (foraDeOrdem(funil.passos)) return { etapas, maiorPerda: null, foraDeOrdem: true, aviso: AVISO_FORA_DE_ORDEM };
  const mp = funil.maiorPerda;
  let maiorPerda: FunilDesenhado["maiorPerda"] = null;
  if (mp) {
    const para = INDICE_DO_PASSO[mp.para];
    const de = INDICE_DO_PASSO[mp.de];
    if (para === de + 1 && etapas[de].valor != null && etapas[para].valor != null) {
      const passo = funil.passos.find((p) => p.id === mp.para);
      const texto = passo?.pctDoAnterior != null ? `${fmtFracao(passo.pctDoAnterior)} passam` : `${fmtFracao(Math.max(0, 1 - mp.pct))} passam`;
      maiorPerda = { de, para, texto };
    }
  }
  return { etapas, maiorPerda, foraDeOrdem: false, aviso: null };
}
