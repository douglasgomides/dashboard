// Funil desenhado (sketch 001, variante A2, aprovada pelo João em 12/11/2026): faixas centradas em escala de raiz, ligações em
// trapézio com "N% passam", a maior perda em vermelho e o toco "Falta dado" no lugar de barra ou zero.
// Módulo puro: sem React, sem banco, sem IA, sem consulta nova. Só regra sobre o que a tela já carregou (D-05 da 03.1.1).
// Cada adaptador traduz o funil que a tela já tem (comercial, pacientes, jornada) para as mesmas 5 etapas.
import type { DadosComerciais, Funil as FunilComercial, IdPasso, PassoFunil } from "./comercial";
import { fmtNdeM, passagem as passagemDaBase } from "./funil-taxa";
import type { EtapaFunil as EtapaDaJornada, Funil as FunilDaJornada, IdEtapa } from "./jornada-funil";
import { foraDeOrdem } from "./leitura/fatos-comercial";
import type { BarraDoFato } from "./leitura/tipos";
import { fmtFracao } from "./metricas";
import { TEXTO_NUMERO, avisoAgendouMenosQueFechou, type ChaveNumero, type PacientesPeriodo } from "./pacientes";

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
  /**
   * Índices das etapas de baixo das ligações em que a etapa tem mais gente que a de cima (D-01 da 03.1.1.1.1). Só essas ligações ficam
   * sem %; nenhuma delas é a maior perda. Vazio = todas em ordem.
   */
  ligacoesForaDeOrdem: number[];
  /** true quando alguma ligação está fora de ordem (o componente mostra o aviso). A maior perda ainda pode existir nas outras. */
  foraDeOrdem: boolean;
  aviso: string | null;
}

export const AVISO_FORA_DE_ORDEM = "Uma etapa tem mais gente que a anterior: essa ligação fica sem %.";
/** O "sem %" da ligação em que a etapa de baixo tem mais gente que a de cima: um pedido para a equipe, nunca uma conta. */
export const SEM_ETAPA_COM_MAIS_GENTE = "Esta etapa tem mais gente que a anterior: conferir a marcação no CRM.";
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

  // D-01: só a ligação em que a etapa tem mais gente que a de cima fica sem %. A taxa do diagnóstico vem cortada em 1, então a ligação
  // que cresce é achada pelos dois passos vizinhos (a mesma regra de foraDeOrdem, só com o par) além de qualquer taxa acima de 1.
  const ligacoes = ligacoesAcimaDeUm(etapas);
  for (let i = 2; i < etapas.length; i++) {
    const cima = passos[i - 2];
    const baixo = passos[i - 1];
    if (!cima || !baixo || etapas[i].passagem?.taxa == null || ligacoes.includes(i)) continue;
    if (foraDeOrdem([cima, baixo])) ligacoes.push(i);
  }
  ligacoes.sort((a, b) => a - b);
  tirarPercentual(etapas, ligacoes);

  // Maior perda da regra do diagnóstico (que já pula o par que cresce), mapeada para índices; nunca numa ligação fora de ordem.
  const mp = funil.maiorPerda;
  let maiorPerda: FunilDesenhado["maiorPerda"] = null;
  if (mp) {
    const para = INDICE_DO_PASSO[mp.para];
    const de = INDICE_DO_PASSO[mp.de];
    if (para === de + 1 && !ligacoes.includes(para) && etapas[de].valor != null && etapas[para].valor != null) {
      const passo = funil.passos.find((p) => p.id === mp.para);
      const texto = passo?.pctDoAnterior != null ? `${fmtFracao(passo.pctDoAnterior)} passam` : `${fmtFracao(Math.max(0, 1 - mp.pct))} passam`;
      maiorPerda = { de, para, texto };
    }
  }
  // O aviso também vale quando a ordem quebra entre passos que não ficam vizinhos no desenho (um passo estimado no meio).
  const fora = ligacoes.length > 0 || foraDeOrdem(funil.passos);
  return { etapas, maiorPerda, ligacoesForaDeOrdem: ligacoes, foraDeOrdem: fora, aviso: fora ? AVISO_FORA_DE_ORDEM : null };
}

// ---------------------------------------------------------------- fechamento comum: maior perda e fora de ordem

/** Índices das etapas de baixo das ligações com taxa acima de 1 (a etapa tem mais gente que a de cima). */
function ligacoesAcimaDeUm(etapas: EtapaDesenhada[]): number[] {
  const ligacoes: number[] = [];
  for (let i = 1; i < etapas.length; i++) if ((etapas[i].passagem?.taxa ?? 0) > 1) ligacoes.push(i);
  return ligacoes;
}

/** Cada ligação fora de ordem perde só o próprio %: fica "sem %" com o pedido de conferir a marcação no CRM. */
function tirarPercentual(etapas: EtapaDesenhada[], ligacoes: readonly number[]): void {
  for (const i of ligacoes) etapas[i].passagem = { taxa: null, fracao: null, sem: SEM_ETAPA_COM_MAIS_GENTE };
}

/**
 * A ligação com a menor taxa abaixo de 1 (maior perda das telas que não trazem a regra pronta). Antes, cada ligação com taxa acima de 1
 * fica sem % (D-01): ela nunca é a maior perda, e as outras continuam valendo.
 */
function fechar(etapas: EtapaDesenhada[]): FunilDesenhado {
  const ligacoes = ligacoesAcimaDeUm(etapas);
  tirarPercentual(etapas, ligacoes);
  let pior: { de: number; para: number; taxa: number } | null = null;
  for (let i = 1; i < etapas.length; i++) {
    const t = etapas[i].passagem?.taxa;
    if (t != null && t < 1 && (!pior || t < pior.taxa)) pior = { de: i - 1, para: i, taxa: t };
  }
  const fora = ligacoes.length > 0;
  return {
    etapas,
    maiorPerda: pior ? { de: pior.de, para: pior.para, texto: textoDaPassagem(etapas[pior.para].passagem)! } : null,
    ligacoesForaDeOrdem: ligacoes,
    foraDeOrdem: fora,
    aviso: fora ? AVISO_FORA_DE_ORDEM : null,
  };
}

const capitaliza = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------------------------------------------------------------- Funil › Do contato à venda (pacientes)

const SEM_CONVERSOU_VIRA_LEAD = "Virou lead conta só pessoas novas, e quem conversou inclui pacientes antigos: sem % entre as duas.";
const SEM_LEAD_VIRA_ATENDIDO = "Atendido inclui pacientes antigos: sem % sobre as pessoas novas.";
const SEM_FECHOU_MAIS_QUE_AGENDOU = "Fecharam conta quem foi marcado como ganho no período, inclusive quem agendou antes: sem % sobre os agendados.";
const ATENDIDO_INCOMPLETO = "A lista de quem foi atendido não veio inteira, então não dá para contar sem repetir pessoas.";

export interface EntradaDePacientes {
  dados: Pick<PacientesPeriodo, "numeros" | "listas">;
  /** Variação já calculada pela tela com o diário (período anterior em memória). null = sem contorno. */
  variacao: (chave: string) => VariacaoDaEtapa | null;
}

/**
 * Atendido em pacientes: pessoas distintas (pela chave `pessoa`) de quem está em atendimento, agendou ou fechou. Só quando as 3
 * listas vieram inteiras (a lista pode vir cortada) e os 3 números têm valor; senão Falta dado com o motivo.
 */
function atendidosDePacientes(d: EntradaDePacientes["dados"]): { valor: number | null; motivo: string | null } {
  const neg = d.numeros?.negociacao;
  if (!neg || neg.valor == null) return { valor: null, motivo: neg?.motivo_sem_dado ?? "Quem está em atendimento agora não foi medido neste período." };
  for (const k of ["agendaram", "fecharam"] as const) {
    const n = d.numeros?.[k];
    if (!n || n.valor == null) return { valor: null, motivo: n?.motivo_sem_dado ?? `${TEXTO_NUMERO[k].rotulo} não foi medido, então não dá para contar quem foi atendido.` };
  }
  const pessoas = new Set<string>();
  for (const k of ["negociacao", "agendaram", "fecharam"] as const) {
    const l = d.listas?.[k];
    if (!l || l.itens.length !== l.total) return { valor: null, motivo: ATENDIDO_INCOMPLETO };
    for (const it of l.itens) pessoas.add(it.pessoa);
  }
  return { valor: pessoas.size, motivo: null };
}

/** De Pacientes do período (pessoas) para as 5 etapas do funil desenhado, com a variação que a tela já calculou pelo diário. */
export function dePacientesDoPeriodo({ dados, variacao }: EntradaDePacientes): FunilDesenhado {
  const n = dados.numeros;
  const valorDe = (k: ChaveNumero): number | null => n?.[k]?.valor ?? null;
  const explica = (k: ChaveNumero) => `${capitaliza(TEXTO_NUMERO[k].legenda)}.`;
  const doNumero = (k: ChaveNumero, id: string, nome: string, detalhe: BarraDoFato[]): EtapaDesenhada =>
    etapaCom({ id, nome, valor: valorDe(k), motivo: n?.[k]?.motivo_sem_dado ?? null, explicacao: explica(k), variacao: variacao(k), detalhe });
  const atendido = atendidosDePacientes(dados);

  const etapas: EtapaDesenhada[] = [
    doNumero("mandaram_mensagem", "conversou", NOMES_DO_FUNIL[0], barrasDe([["Pessoas novas", valorDe("leads_novos")], ["Pacientes antigos", valorDe("antigos")]])),
    doNumero("leads_novos", "virou-lead", NOMES_DO_FUNIL[1], []),
    // O diário não tem o campo de Atendido: nunca tem variação nem contorno.
    etapaCom({
      id: "atendido",
      nome: NOMES_DO_FUNIL[2],
      valor: atendido.valor,
      motivo: atendido.motivo,
      explicacao: "Pessoas diferentes que estão em atendimento agora, agendaram ou fecharam no período.",
      detalhe: barrasDe([["Em atendimento agora", valorDe("negociacao")], ["Agendaram", valorDe("agendaram")], ["Fecharam", valorDe("fecharam")]]),
    }),
    doNumero("agendaram", "agendou", NOMES_DO_FUNIL[3], barrasDe([["Foram na consulta", valorDe("compareceram")], ["Fecharam", valorDe("fecharam")]])),
    doNumero("fecharam", "fechou", NOMES_DO_FUNIL[4], barrasDe([["Fecharam", valorDe("fecharam")]])),
  ];

  // Ligações. As duas primeiras contam populações diferentes (pacientes antigos entram em uma e não na outra): sem %.
  ligar(etapas, 1, { taxa: null, fracao: null, sem: SEM_CONVERSOU_VIRA_LEAD });
  ligar(etapas, 2, { taxa: null, fracao: null, sem: SEM_LEAD_VIRA_ATENDIDO });
  ligar(etapas, 3, { ...passagemDaBase(etapas[3].valor, etapas[2].valor, "leads"), sem: null });
  const ag = etapas[3].valor;
  const fe = etapas[4].valor;
  if (ag != null && fe != null) {
    ligar(etapas, 4, fe <= ag ? { ...passagemDaBase(fe, ag, "agendamentos"), sem: null } : { taxa: null, fracao: null, sem: avisoAgendouMenosQueFechou(dados) ?? SEM_FECHOU_MAIS_QUE_AGENDOU });
  }
  return fechar(etapas);
}

// ---------------------------------------------------------------- Jornada

const SEM_LEAD_VIRA_ATENDIDO_JORNADA = "Atendido conta cards do CRM, e Virou lead conta pessoas: sem % entre as duas.";
const SEM_ATENDIDO_VIRA_AGENDOU_JORNADA = "Agendou conta pessoas, e Atendido conta cards do CRM: sem % entre as duas.";

/** Uma das 3 etapas do Instagram que ficam na faixa "Antes da conversa" (nomes de hoje, número ou Falta dado). */
export interface EtapaAntes {
  id: string;
  nome: string;
  valor: number | null;
  texto: string;
  motivo: string | null;
}

export interface EntradaDaJornada {
  funil: FunilDaJornada;
  /** O que a tela já carrega do diagnóstico comercial (a mesma chave de React Query). */
  comercial?: { funil: FunilComercial; dados: Pick<DadosComerciais, "escopo"> } | null;
}

function etapaDaJornada(e: EtapaDaJornada | undefined, id: string, nome: string): EtapaDesenhada {
  if (!e) return etapaCom({ id, nome, valor: null, motivo: "Esta etapa não veio do funil da jornada." });
  const unidade = e.valor != null && e.unidade ? ` Conta: ${e.unidade}.` : "";
  const falta = e.falta ? `Falta: ${e.falta.integracao}. Dado necessário: ${e.falta.dado}. Onde resolver: ${e.falta.onde}.` : null;
  return etapaCom({
    id,
    nome,
    valor: e.valor,
    motivo: e.explicacao,
    explicacao: e.valor == null ? falta : `${e.explicacao ?? ""}${unidade}`.trim() || null,
  });
}

/** Do funil de 7 etapas da jornada para a faixa "Antes da conversa" (3 etapas do Instagram) e o funil desenhado de 5 etapas. */
export function daJornada({ funil, comercial }: EntradaDaJornada): { antes: EtapaAntes[]; funil: FunilDesenhado } {
  const por = (id: IdEtapa) => funil.etapas.find((e) => e.id === id);
  const antes: EtapaAntes[] = (["alcance", "engajamento", "comentario"] as const).map((id) => {
    const e = por(id);
    const valor = e?.valor ?? null;
    return { id, nome: e?.nome ?? id, valor, texto: valor == null ? FALTA_DADO : fmtN(valor), motivo: valor == null ? e?.explicacao ?? "Esta etapa não veio do funil da jornada." : null };
  });

  // Atendido = o passo "atendidos" do diagnóstico: só com escopo do período, valor e confiança.
  const passo = comercial?.funil.passos.find((p) => p.id === "atendidos");
  let atendidoValor: number | null = null;
  let atendidoMotivo: string | null = null;
  if (!comercial) atendidoMotivo = "O diagnóstico do CRM não respondeu agora, então não dá para contar quem foi atendido.";
  else if (comercial.dados.escopo !== "periodo") atendidoMotivo = "Poucos leads no período: o CRM foi lido na base inteira, sem a contagem do período.";
  else if (!passo || passo.valor == null) atendidoMotivo = passo?.aviso ?? "Não deu para identificar a primeira etapa do funil do CRM.";
  else if (!passo.confiavel) atendidoMotivo = passo.aviso ?? "Este número do CRM não é confiável neste período.";
  else atendidoValor = passo.valor;

  const etapas: EtapaDesenhada[] = [
    etapaDaJornada(por("conversa"), "conversou", NOMES_DO_FUNIL[0]),
    etapaDaJornada(por("lead"), "virou-lead", NOMES_DO_FUNIL[1]),
    etapaCom({ id: "atendido", nome: NOMES_DO_FUNIL[2], valor: atendidoValor, motivo: atendidoMotivo, explicacao: passo?.explica ?? null }),
    etapaDaJornada(por("agendamento"), "agendou", NOMES_DO_FUNIL[3]),
    etapaDaJornada(por("venda"), "fechou", NOMES_DO_FUNIL[4]),
  ];

  // Conversou → Virou lead e Agendou → Fechou herdam a conta da jornada (taxa, "N de M" ou o "sem %"); as de Atendido são sempre sem %.
  const herda = (e: EtapaDaJornada | undefined): PassagemDesenhada => ({ taxa: e?.taxa ?? null, fracao: e?.fracao ?? null, sem: e?.semPassagem ?? null });
  ligar(etapas, 1, herda(por("lead")));
  ligar(etapas, 2, { taxa: null, fracao: null, sem: SEM_LEAD_VIRA_ATENDIDO_JORNADA });
  ligar(etapas, 3, { taxa: null, fracao: null, sem: SEM_ATENDIDO_VIRA_AGENDOU_JORNADA });
  ligar(etapas, 4, herda(por("venda")));

  // D-01: a ligação com taxa acima de 1 fica sem %, e só ela; a maior queda nunca cai numa ligação assim.
  const ligacoes = ligacoesAcimaDeUm(etapas);
  tirarPercentual(etapas, ligacoes);
  // A maior queda do funil de 7 etapas só vale quando de e para ficam vizinhas no funil desenhado.
  const indice: Partial<Record<IdEtapa, number>> = { conversa: 0, lead: 1, agendamento: 3, venda: 4 };
  const mq = funil.maiorQueda;
  let maiorPerda: FunilDesenhado["maiorPerda"] = null;
  if (mq) {
    const de = indice[mq.de];
    const para = indice[mq.para];
    if (de != null && para != null && para === de + 1 && !ligacoes.includes(para)) {
      const texto = textoDaPassagem(etapas[para].passagem) ?? `${fmtFracao(mq.taxa)} passam`;
      maiorPerda = { de, para, texto };
    }
  }
  const fora = ligacoes.length > 0;
  return { antes, funil: { etapas, maiorPerda, ligacoesForaDeOrdem: ligacoes, foraDeOrdem: fora, aviso: fora ? AVISO_FORA_DE_ORDEM : null } };
}
