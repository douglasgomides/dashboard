// "Do contato à venda" no formato 5 segundos (Phase 03.1.1.1, plano 05, D-01): o veredito "Aqui você perde mais: só N% ...", as pessoas que
// ficaram na mesa (Virou lead menos Atendido), os 3 números-chave e as descobertas da aba Funil de "Onde os pacientes travam". Módulo
// puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já carregou (D-08: nenhuma consulta nova). D-02: nenhum número de outra
// clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero. D-01 (03.1.1.1.1): a ligação fora de ordem fica sem % e
// nunca é a maior perda, mas as ligações em ordem continuam apontando a maior perda. A regra lê só contagens (T-03.1.1.1-12): nenhum campo de pessoa passa por aqui.
import type { FunilDesenhado } from "@/lib/funil-desenhado";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { LIMITES } from "@/lib/limites";
import { checarDescoberta, checarFraseCinco, textoDaFrase, variacaoPropria, vereditoDosFatos, type Descoberta, type ParteDaFrase, type Veredito } from "./cinco-segundos";
import type { BarraDoFato, FatosDaTela, TomFato } from "./tipos";

/** Muda quando uma regra de "Do contato à venda" no formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO_PACIENTES = 1;

// ---------- entrada ----------

/** O que a aba Funil já tem carregado quando monta o formato 5 segundos. */
export interface EntradaCincoPacientes {
  /** O funil desenhado (a mesma conta dos números da tela). */
  funil: FunilDesenhado;
  /** Soma diária dos dois períodos (a base de toda variação). null = o histórico não cobre 80% dos dias. */
  somas: { atual: Record<string, number | null>; antes: Record<string, number | null> };
  /** O valor de cada número de pessoas da tela (pessoas diferentes no período). null = sem medida. */
  numeros: Record<string, number | null>;
  /** Fatos de Pacientes (portão e leitura). null = ainda sem fatos. */
  fatos: FatosDaTela | null;
  /** Dias fechados de cada período. */
  dias: number;
}

// ---------- veredito ----------

type FraseDaPerda = { pct: (p: string) => string; fracao: (n: string, m: string) => string };

/** A frase da ligação que mais perde, pela etapa de baixo (id do funil desenhado). Os nomes das etapas são os do João (NOMES_DO_FUNIL). */
const FRASE_DA_PERDA: Record<string, FraseDaPerda> = {
  "virou-lead": { pct: (p) => `só ${p} das conversas viram lead`, fracao: (n, m) => `só ${n} de ${m} conversas viram lead` },
  atendido: { pct: (p) => `só ${p} dos leads são atendidos`, fracao: (n, m) => `só ${n} de ${m} leads são atendidos` },
  agendou: { pct: (p) => `só ${p} dos atendidos agendam`, fracao: (n, m) => `só ${n} de ${m} atendidos agendam` },
  fechou: { pct: (p) => `só ${p} dos agendados fecham`, fracao: (n, m) => `só ${n} de ${m} agendados fecham` },
};

const TEXTO_PASSAM = /^(\d[\d.]*(?:,\d+)?%)\s+passam$/;
const TEXTO_N_DE_M = /^(\d[\d.]*)\s+de\s+(\d[\d.]*)$/;

/** A parte da frase que diz quanto passa ("só 10% dos leads são atendidos"), ou null quando o texto da ligação não é nenhum dos dois formatos. */
function perdaEmTexto(paraId: string, texto: string): string | null {
  const regra = FRASE_DA_PERDA[paraId];
  if (!regra) return null;
  const t = texto.replace(/ /g, " ").trim();
  const pct = TEXTO_PASSAM.exec(t);
  if (pct) return regra.pct(pct[1]);
  const fracao = TEXTO_N_DE_M.exec(t);
  return fracao ? regra.fracao(fracao[1], fracao[2]) : null;
}

/** Mesma frase, com a perda em destaque. */
const fraseDaPerda = (perda: string): ParteDaFrase[] => [{ texto: "Aqui você perde mais: " }, { texto: perda, enfase: "ruim" }, { texto: "." }];

/** A frase do veredito quando uma etapa tem mais gente que a anterior e nenhuma ligação em ordem aponta a maior perda (D-01). */
export const FRASE_ETAPA_COM_MAIS_GENTE = "Uma etapa tem mais gente que a anterior: conferir a marcação no CRM.";

/** O veredito "Maior perda" da ligação que mais perde, ou null quando o funil não aponta uma ou a frase não passa no filtro. */
function vereditoDaMaiorPerda(funil: FunilDesenhado): Veredito | null {
  const mp = funil.maiorPerda;
  const para = mp ? funil.etapas[mp.para] : undefined;
  if (!mp || !para) return null;
  const perda = perdaEmTexto(para.id, mp.texto);
  if (!perda) return null;
  const frase = fraseDaPerda(perda);
  return checarFraseCinco(textoDaFrase(frase)).length === 0 ? { tipo: "veredito", palavra: "Maior perda", tom: "ruim", frase } : null;
}

/**
 * O veredito de "Do contato à venda": a palavra "Maior perda" e UMA frase com a ligação que mais perde, tirada do funil desenhado (a
 * mesma conta que a tela desenha). D-01: uma ligação fora de ordem (etapa com mais gente que a anterior) não apaga a maior perda das
 * ligações em ordem; só sem maior perda a apontar o funil fora de ordem vira "Atenção", sem nomear etapa. Portão negado ou sem maior
 * perda a apontar: o veredito dos fatos (o mesmo "Falta dado: motivo" da leitura, D-05). null = ainda sem fatos.
 */
export function vereditoDePacientes(e: Pick<EntradaCincoPacientes, "funil" | "fatos">): Veredito | null {
  const { funil, fatos } = e;
  const maiorPerda = vereditoDaMaiorPerda(funil);
  if (funil.foraDeOrdem && !maiorPerda) {
    return { tipo: "veredito", palavra: "Atenção", tom: "atencao", frase: [{ texto: FRASE_ETAPA_COM_MAIS_GENTE }] };
  }
  if (fatos && !fatos.portao.ok) return vereditoDosFatos(fatos);
  return maiorPerda ?? vereditoDosFatos(fatos);
}

// ---------- pessoas na mesa ----------

/** A escala fixa de "cada ponto = k leads": nunca passa de 100 pontos. */
const ESCALA_DOS_PONTOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;
const MAXIMO_DE_PONTOS = 100;

export interface PessoasNaMesaMedida {
  faltaDado?: undefined;
  /** Virou lead menos Atendido: quem virou lead e ninguém atendeu ainda. Nunca negativo. */
  esperando: number;
  atendidos: number;
  /** Quantos leads cada ponto vale (da escala fixa 1, 2, 5, 10, 20, 50, 100 ...). */
  porPonto: number;
  /** Quantos pontos o desenho tem (atendidos mais esperando). */
  pontos: number;
  /** Quantos pontos são de atendidos (cheios); o resto é de quem espera (vazados). */
  pontosAtendidos: number;
}

/** Atendido não medido (ou Virou lead sem medida, ou funil fora de ordem): o motivo, e nenhum número, nunca 0. */
export interface PessoasNaMesaSemDado {
  faltaDado: string;
}

export type PessoasNaMesa = PessoasNaMesaMedida | PessoasNaMesaSemDado;

/** O menor "k leads por ponto" da escala que mantém o desenho em até `maximo` pontos. */
export function pontoPorLeads(leads: number, maximo = MAXIMO_DE_PONTOS): number {
  return ESCALA_DOS_PONTOS.find((k) => Math.ceil(leads / k) <= maximo) ?? ESCALA_DOS_PONTOS[ESCALA_DOS_PONTOS.length - 1];
}

/**
 * As pessoas que ficaram na mesa: Virou lead menos Atendido, só quando os dois foram medidos pela regra do funil desenhado (Atendido só vale com as
 * 3 listas inteiras). Sem um dos dois, ou com Atendido acima de Virou lead (funil fora de ordem), é "Falta dado" com o motivo do funil.
 */
export function pessoasNaMesa(funil: Pick<FunilDesenhado, "etapas">, opcoes: { maximoDePontos?: number } = {}): PessoasNaMesa {
  const lead = funil.etapas.find((et) => et.id === "virou-lead");
  const atendido = funil.etapas.find((et) => et.id === "atendido");
  if (!lead || lead.valor == null) return { faltaDado: lead?.motivo ?? "Virou lead não foi medido neste período." };
  if (!atendido || atendido.valor == null) return { faltaDado: atendido?.motivo ?? "Atendido não foi medido neste período." };
  if (atendido.valor > lead.valor) return { faltaDado: "Funil fora de ordem: Atendido passa de Virou lead, então não dá para contar quem está esperando." };
  const leads = lead.valor;
  const atendidos = atendido.valor;
  const esperando = leads - atendidos;
  const porPonto = pontoPorLeads(leads, opcoes.maximoDePontos);
  const pontos = Math.max(1, Math.ceil(leads / porPonto));
  let pontosAtendidos = Math.min(pontos, Math.round(atendidos / porPonto));
  // Quem foi atendido (ou quem espera) nunca some do desenho por arredondamento.
  if (atendidos > 0 && pontosAtendidos === 0) pontosAtendidos = 1;
  if (esperando > 0 && pontosAtendidos >= pontos) pontosAtendidos = pontos - 1;
  return { esperando, atendidos, porPonto, pontos, pontosAtendidos };
}

// ---------- apoio ----------

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const arredondado = (n: number) => Math.round(n);
const pontosTxt = (n: number) => `${inteiro(Math.abs(n))} ${Math.abs(n) === 1 ? "ponto" : "pontos"}`;

/** Taxa de passagem em % (de cada 100), só com a base mínima da etapa de partida e sem a etapa de baixo passar da de cima. */
function taxaDaPassagem(de: number | null | undefined, para: number | null | undefined, base: number): number | null {
  return de != null && para != null && de >= base && de > 0 && para <= de ? (para / de) * 100 : null;
}

/** A base mínima (LIMITES.funil) da etapa de partida de cada razão de cada 100. */
const BASE_DA_RAZAO = { conversas: 0, leads: LIMITES.funil.minLeads, agendados: LIMITES.funil.minAgendamentos } as const;

/** Variação em pontos de uma taxa de cada 100 contra a do período anterior da própria clínica. Menos de 1 ponto é "igual". */
function variacaoEmPontos(agora: number, antes: number): { pontos: number; sinal: "▲" | "▼" | "="; texto: string; melhor: boolean | null } {
  const pontos = arredondado(agora) - arredondado(antes);
  if (Math.abs(pontos) < 1) return { pontos: 0, sinal: "=", texto: "= igual", melhor: null };
  const sinal = pontos > 0 ? "▲" : "▼";
  return { pontos, sinal, texto: `${sinal} ${pontosTxt(pontos)}`, melhor: pontos > 0 };
}

const palavraDoLado = (melhor: boolean | null) => (melhor === null ? "" : melhor ? " · melhor que antes" : " · pior que antes");

// ---------- números-chave ----------

export interface NumeroDePacientes {
  id: "mesa" | "agendam" | "fecharam";
  titulo: string;
  /** O número grande. null = sem medida (o cartão diz "Sem dado" e o motivo) ou base pequena (veja valorTexto). */
  valor: number | null;
  /** "N de M" quando a base é pequena demais para "de cada 100". null nos outros casos (o cartão mostra o valor). */
  valorTexto: string | null;
  legenda?: string;
  /** Só números com período anterior na memória do diário (o de pessoas únicas anterior é proibido: estoura 8 s, D-05). */
  antes: number | null;
  /** "▼ 27 pontos · pior que antes" ou "▲ 12% · melhor que antes". null quando não há comparação. */
  textoDaVariacao: string | null;
  /** true = melhorou, false = piorou, null = igual ou sem comparação. */
  melhor: boolean | null;
  /** O selo (sinal e palavra). Sem comparação: "Falta dado · sem período anterior". */
  selo: { tom: TomFato; texto: string } | null;
  /** Por que não há número (só sem medida). */
  motivo: string | null;
}

const SEM_ANTERIOR: { tom: TomFato; texto: string } = { tom: "neutro", texto: "Falta dado · sem período anterior" };

function seloDaVariacao(melhor: boolean | null): { tom: TomFato; texto: string } {
  if (melhor === null) return { tom: "neutro", texto: "Igual a antes" };
  return melhor ? { tom: "bom", texto: "Em alta" } : { tom: "ruim", texto: "Em queda" };
}

const TITULO_DA_AGENDA = "Agendam de cada 100 leads";

/**
 * Os 3 números-chave, na ordem da tela: Pessoas na mesa (sem período anterior), Agendam de cada 100 leads e Fecharam. Cada comparação é
 * contra o período anterior da PRÓPRIA clínica e só existe quando o diário o tem em memória; sem ele o número diz "Falta dado" (nunca 0).
 * "Agendam" sai das somas diárias (agendaram sobre leads novos): abaixo da base mínima de leads vira "N de M" sem variação.
 */
export function numerosDePacientes(e: EntradaCincoPacientes): NumeroDePacientes[] {
  const { atual, antes } = e.somas;

  // 1. Pessoas na mesa: o período anterior de pessoas únicas não é medido.
  const mesa = pessoasNaMesa(e.funil);
  const daMesa: NumeroDePacientes = {
    id: "mesa",
    titulo: "Pessoas na mesa",
    valor: mesa.faltaDado == null ? mesa.esperando : null,
    valorTexto: null,
    legenda: mesa.faltaDado == null ? "pessoas ficaram na mesa: viraram lead e ninguém atendeu ainda" : undefined,
    antes: null,
    textoDaVariacao: null,
    melhor: null,
    selo: mesa.faltaDado == null ? SEM_ANTERIOR : null,
    motivo: mesa.faltaDado ?? null,
  };

  // 2. Agendam, de cada 100 leads.
  const leadsAgora = atual.leads_novos ?? null;
  const agendaramAgora = atual.agendaram ?? null;
  const semMedida = (motivo: string): NumeroDePacientes => ({ id: "agendam", titulo: TITULO_DA_AGENDA, valor: null, valorTexto: null, antes: null, textoDaVariacao: null, melhor: null, selo: null, motivo });
  let daAgenda: NumeroDePacientes;
  if (leadsAgora == null || agendaramAgora == null || leadsAgora <= 0) {
    daAgenda = semMedida("o histórico por dia não mede quem virou lead e quem agendou");
  } else if (agendaramAgora > leadsAgora) {
    daAgenda = semMedida("agendaram passa de quem virou lead (inclui pacientes antigos)");
  } else if (leadsAgora < BASE_DA_RAZAO.leads) {
    daAgenda = { id: "agendam", titulo: TITULO_DA_AGENDA, valor: null, valorTexto: `${inteiro(agendaramAgora)} de ${inteiro(leadsAgora)}`, legenda: "agendaram, de poucos leads novos", antes: null, textoDaVariacao: null, melhor: null, selo: { tom: "neutro", texto: "Falta dado · poucos leads" }, motivo: null };
  } else {
    const agora = (agendaramAgora / leadsAgora) * 100;
    const anterior = taxaDaPassagem(antes.leads_novos, antes.agendaram, BASE_DA_RAZAO.leads);
    const v = anterior == null ? null : variacaoEmPontos(agora, anterior);
    daAgenda = {
      id: "agendam",
      titulo: TITULO_DA_AGENDA,
      valor: arredondado(agora),
      valorTexto: null,
      legenda: "agendam, de cada 100 leads novos",
      antes: anterior == null ? null : arredondado(anterior),
      textoDaVariacao: v ? `${v.texto}${palavraDoLado(v.melhor)}` : null,
      melhor: v?.melhor ?? null,
      selo: v ? seloDaVariacao(v.melhor) : SEM_ANTERIOR,
      motivo: null,
    };
  }

  // 3. Fecharam: pessoas do período, com a variação das somas diárias.
  const fecharam = e.numeros.fecharam ?? null;
  const etapaFechou = e.funil.etapas.find((et) => et.id === "fechou");
  const vf = variacaoPropria(atual.fecharam, antes.fecharam);
  const deFechar: NumeroDePacientes = {
    id: "fecharam",
    titulo: "Fecharam",
    valor: fecharam,
    valorTexto: null,
    legenda: fecharam == null ? undefined : "pacientes no período",
    antes: antes.fecharam ?? null,
    textoDaVariacao: fecharam != null && vf ? `${vf.texto}${palavraDoLado(vf.melhor)}` : null,
    melhor: fecharam != null ? (vf?.melhor ?? null) : null,
    selo: fecharam == null ? null : vf ? seloDaVariacao(vf.melhor) : SEM_ANTERIOR,
    motivo: fecharam == null ? (etapaFechou?.motivo ?? "Fecharam não foi medido neste período.") : null,
  };
  return [daMesa, daAgenda, deFechar];
}

// ---------- descobertas ----------

/** Chaves de ação que a tela trata (nada é enviado: abrem uma lista que ela já tem ou levam ao funil desenhado). */
export const ACOES_DE_PACIENTES = { leads: "ver-leads", agendaram: "ver-agendaram", fecharam: "ver-fecharam", funil: "ver-funil" } as const;
/** Quantas descobertas esta tela mostra, no máximo (as 3 primeiras à vista, o resto em "Ver tudo"). */
const MAXIMO_DE_DESCOBERTAS = 5;

export interface DescobertasDePacientes {
  /** Em ordem de impacto: o que piorou primeiro, depois pela maior mudança. De 0 a 5 (nunca inventa). */
  itens: Descoberta[];
  /** "Poucas descobertas neste período: {motivo}." quando há menos de 3. null quando há 3 ou mais. */
  aviso: string | null;
}

const barra = (rotulo: string, exibicao: string, fracao: number): BarraDoFato => ({ rotulo, exibicao, fracao: Math.max(0, Math.min(1, fracao)) });
/** Duas contagens "antes → agora": a barra é a de agora sobre a maior das duas. */
const barraDeContagem = (rotulo: string, antes: number, agora: number): BarraDoFato => barra(rotulo, `${inteiro(antes)} → ${inteiro(agora)}`, Math.max(antes, agora) > 0 ? agora / Math.max(antes, agora) : 0);

interface ModeloDaTaxa {
  id: string;
  /** As etapas de partida e de chegada nas somas diárias. */
  de: { campo: string; rotulo: string };
  para: { campo: string; rotulo: string };
  base: number;
  rotuloDaTaxa: string;
  frase: (antes: number, agora: number) => string;
  quem: string;
  acao: { rotulo: string; local: string };
  motivoSemBase: string;
  obs?: string;
}

/**
 * As 3 razões de cada 100 que a tela conta pelas somas diárias: conversas que viram lead, leads que agendam e agendados que fecham. A
 * descoberta só existe com a base mínima de LIMITES.funil nos DOIS períodos, e "igual a antes" (menos de 1 ponto) não é descoberta.
 */
const MODELOS_DA_TAXA: ModeloDaTaxa[] = [
  {
    id: "pacientes-conversa-vira-lead",
    de: { campo: "mandaram_mensagem", rotulo: "Conversas" },
    para: { campo: "leads_novos", rotulo: "Viraram lead" },
    base: BASE_DA_RAZAO.conversas,
    rotuloDaTaxa: "Viram lead, de cada 100",
    frase: (a, b) => `Das conversas, ${b} de cada 100 viram lead. Antes eram ${a}.`,
    quem: ROTULO_RESPONSAVEL.atendimento,
    acao: { rotulo: "Ver quem virou lead", local: ACOES_DE_PACIENTES.leads },
    motivoSemBase: "faltam as conversas e os leads do período anterior",
    obs: "Conversas incluem pacientes antigos: é uma proporção, não uma passagem.",
  },
  {
    id: "pacientes-lead-agenda",
    de: { campo: "leads_novos", rotulo: "Leads novos" },
    para: { campo: "agendaram", rotulo: "Agendaram" },
    base: BASE_DA_RAZAO.leads,
    rotuloDaTaxa: "Agendam, de cada 100 leads",
    frase: (a, b) => `De cada 100 leads, ${b} agendam. Antes eram ${a}.`,
    quem: ROTULO_RESPONSAVEL.comercial,
    acao: { rotulo: "Ver quem agendou", local: ACOES_DE_PACIENTES.agendaram },
    motivoSemBase: "faltam os leads e os agendamentos do período anterior",
  },
  {
    id: "pacientes-agendado-fecha",
    de: { campo: "agendaram", rotulo: "Agendaram" },
    para: { campo: "fecharam", rotulo: "Fecharam" },
    base: BASE_DA_RAZAO.agendados,
    rotuloDaTaxa: "Fecham, de cada 100 agendados",
    frase: (a, b) => `De cada 100 agendados, ${b} fecham. Antes eram ${a}.`,
    quem: ROTULO_RESPONSAVEL.comercial,
    acao: { rotulo: "Ver quem fechou", local: ACOES_DE_PACIENTES.fecharam },
    motivoSemBase: "faltam os agendamentos e os fechados do período anterior",
  },
];

/**
 * A ligação com a maior perda do funil desenhado, em descoberta, sempre que a regra aponta uma ligação. D-01: uma ligação fora de ordem
 * em outro ponto do funil não apaga esta (a ligação fora de ordem nunca é a maior perda).
 */
function descobertaDaMaiorPerda(funil: FunilDesenhado): Descoberta | null {
  const mp = funil.maiorPerda;
  if (!mp) return null;
  const de = funil.etapas[mp.de];
  const para = funil.etapas[mp.para];
  if (!de || !para || de.valor == null || para.valor == null) return null;
  const { nome: nomeDe } = de;
  const { nome: nomePara } = para;
  const passam = /passam$/.test(mp.texto) ? mp.texto : `${mp.texto} passam`;
  return {
    id: "pacientes-maior-perda",
    tom: "ruim",
    selo: "Maior perda",
    frase: `Entre ${nomeDe} e ${nomePara}, ${passam}.`,
    quem: para.id === "atendido" || para.id === "virou-lead" ? ROTULO_RESPONSAVEL.atendimento : ROTULO_RESPONSAVEL.comercial,
    impacto: `${inteiro(de.valor)} → ${inteiro(para.valor)} pessoas`,
    acao: { rotulo: "Ver o funil", local: ACOES_DE_PACIENTES.funil },
    porque: {
      titulo: "Quantas pessoas passam de uma etapa para a outra",
      barras: [barra(nomeDe, inteiro(de.valor), 1), barra(nomePara, inteiro(para.valor), de.valor > 0 ? para.valor / de.valor : 0)],
      obs: "Só contagens desta clínica, do período.",
    },
  };
}

/**
 * De 0 a 5 descobertas de "Do contato à venda", só com números da própria clínica (D-02): conversas que viram lead, leads que agendam e
 * agendados que fecham (agora contra antes, de cada 100) e a ligação da maior perda do funil. Cada uma tem UMA ação que só abre uma lista
 * ou leva ao funil, quem resolve e um "Por quê?" de 2 a 3 fatores em barra. As pessoas que esperam NÃO se repetem aqui: são o número-chave 1.
 * Portão negado: nenhuma descoberta (a tela diz "Falta dado: motivo"). Menos de 3 válidas: só as válidas mais o aviso com o motivo.
 */
export function descobertasDePacientes(e: EntradaCincoPacientes): DescobertasDePacientes {
  if (e.fatos && !e.fatos.portao.ok) return { itens: [], aviso: null };
  const { atual, antes } = e.somas;
  const candidatas: { d: Descoberta; impacto: number; ruim: boolean }[] = [];
  const motivos: string[] = [];
  const poe = (d: Descoberta, impacto: number) => {
    if (checarDescoberta(d).length > 0) return;
    candidatas.push({ d, impacto, ruim: d.tom === "ruim" });
  };

  for (const m of MODELOS_DA_TAXA) {
    const agora = taxaDaPassagem(atual[m.de.campo], atual[m.para.campo], m.base);
    const anterior = taxaDaPassagem(antes[m.de.campo], antes[m.para.campo], m.base);
    if (agora == null || anterior == null) {
      motivos.push(m.motivoSemBase);
      continue;
    }
    const v = variacaoEmPontos(agora, anterior);
    if (v.melhor === null) continue;
    const [a0, a1] = [arredondado(anterior), arredondado(agora)];
    const [de0, de1] = [antes[m.de.campo] as number, atual[m.de.campo] as number];
    const [pa0, pa1] = [antes[m.para.campo] as number, atual[m.para.campo] as number];
    poe(
      {
        id: m.id,
        tom: v.melhor ? "bom" : "ruim",
        selo: v.melhor ? "Em alta" : "Em queda",
        frase: m.frase(a0, a1),
        quem: m.quem,
        impacto: `${a0} → ${a1} de cada 100`,
        acao: m.acao,
        porque: {
          titulo: "Quantos seguem, de cada 100",
          barras: [barra(m.rotuloDaTaxa, `${a0} → ${a1}`, a1 / 100), barraDeContagem(m.de.rotulo, de0, de1), barraDeContagem(m.para.rotulo, pa0, pa1)],
          ...(m.obs ? { obs: m.obs } : {}),
        },
      },
      Math.abs(v.pontos),
    );
  }

  const perda = descobertaDaMaiorPerda(e.funil);
  if (perda) poe(perda, 0);

  const itens = candidatas
    .map((c, k) => ({ ...c, k }))
    .sort((a, b) => Number(b.ruim) - Number(a.ruim) || b.impacto - a.impacto || a.k - b.k)
    .slice(0, MAXIMO_DE_DESCOBERTAS)
    .map((c) => c.d);
  const aviso = itens.length >= 3 ? null : `Poucas descobertas neste período: ${motivos[0] ?? "os números ficaram iguais aos de antes"}.`;
  return { itens, aviso };
}
