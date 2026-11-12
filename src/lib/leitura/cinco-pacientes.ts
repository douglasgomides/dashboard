// "Do contato à venda" no formato 5 segundos (Phase 03.1.1.1, plano 05, D-01): o veredito "Aqui você perde mais: só N% ...", as pessoas que
// ficaram na mesa (Virou lead menos Atendido), os 3 números-chave e as descobertas da aba Funil de "Onde os pacientes travam". Módulo
// puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já carregou (D-08: nenhuma consulta nova). D-02: nenhum número de outra
// clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo, nunca zero, e a regra do funil fora de ordem continua: sem maior
// perda apontada. A regra lê só contagens (T-03.1.1.1-12): nenhum campo de pessoa passa por aqui.
import type { FunilDesenhado } from "@/lib/funil-desenhado";
import { checarFraseCinco, textoDaFrase, vereditoDosFatos, type ParteDaFrase, type Veredito } from "./cinco-segundos";
import type { FatosDaTela } from "./tipos";

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

/**
 * O veredito de "Do contato à venda": a palavra "Maior perda" e UMA frase com a ligação que mais perde, tirada do funil desenhado (a
 * mesma conta que a tela desenha). Funil fora de ordem: "Atenção" e nenhuma etapa nomeada (AVISO_FORA_DE_ORDEM). Portão negado ou sem
 * maior perda a apontar: o veredito dos fatos (o mesmo "Falta dado: motivo" da leitura, D-05). null = ainda sem fatos.
 */
export function vereditoDePacientes(e: Pick<EntradaCincoPacientes, "funil" | "fatos">): Veredito | null {
  const { funil, fatos } = e;
  if (funil.foraDeOrdem) {
    return { tipo: "veredito", palavra: "Atenção", tom: "atencao", frase: [{ texto: "Funil fora de ordem: a maior perda não é apontada." }] };
  }
  if (fatos && !fatos.portao.ok) return vereditoDosFatos(fatos);
  const mp = funil.maiorPerda;
  const para = mp ? funil.etapas[mp.para] : undefined;
  if (mp && para) {
    const perda = perdaEmTexto(para.id, mp.texto);
    if (perda) {
      const frase = fraseDaPerda(perda);
      if (checarFraseCinco(textoDaFrase(frase)).length === 0) return { tipo: "veredito", palavra: "Maior perda", tom: "ruim", frase };
    }
  }
  return vereditoDosFatos(fatos);
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
