// As regras da Hoje no formato 5 segundos (Phase 03.1.1.1, plano 02): os 5 sinais da nota do dia (D-03) montados só com o que a Hoje já
// carrega, a frase do veredito e (mais abaixo) as etapas do funil contra o período anterior. Tudo compara a clínica com ELA MESMA (D-02).
// Módulo puro: sem React, sem banco, sem rede e sem IA. Um sinal sem dado confiável vai para "Falta dado" com o motivo (nunca vira 0).
import { LIMITES } from "@/lib/limites";
import { MIN_DIAS_SALDO } from "./fatos-instagram";
import { checarFraseCinco, type ParteDaFrase, type VereditoDaTela } from "./cinco-segundos";
import { palavraDaNota, type EntradaDoFator, type FatorDaNota, type NotaDoDia } from "./nota-do-dia";

/** Gasto e conversas pelo anúncio de um período (a mesma linha agregada que Anúncios lê). */
export interface AdsDoPeriodo {
  gasto: number | null;
  conversas: number | null;
}

/** Seguidores novos de um período e quantos dias fechados foram medidos (analyzeGrowth). */
export interface CrescimentoDoPeriodo {
  novos: number;
  diasMedidos: number;
}

/** O que a Hoje já tem em mãos. `atual` e `antes` são as somas diárias do período e do anterior (somaDiaria). */
export interface EntradaCincoHoje {
  atual: Record<string, number | null>;
  antes: Record<string, number | null>;
  ads: { atual: AdsDoPeriodo | null; antes: AdsDoPeriodo | null } | null;
  crescimento: { atual: CrescimentoDoPeriodo | null; antes: CrescimentoDoPeriodo | null } | null;
  /** O funil de pessoas do período (as 5 etapas); só os valores de Virou lead e Atendido são lidos. */
  pessoas: { etapas: readonly { valor: number | null; motivo?: string | null }[] } | null;
}

const MOTIVO_ATENDIDOS = "O período anterior de pessoas não é medido";
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const medido = (n: number | null | undefined): number | null => (n != null && Number.isFinite(n) ? n : null);
const custoPorConversa = (a: AdsDoPeriodo | null | undefined): number | null => {
  const gasto = medido(a?.gasto);
  const conversas = medido(a?.conversas);
  return gasto != null && conversas != null && gasto > 0 && conversas > 0 ? gasto / conversas : null;
};
const porDia = (c: CrescimentoDoPeriodo | null | undefined): number | null => (c && c.diasMedidos >= MIN_DIAS_SALDO ? c.novos / c.diasMedidos : null);

/**
 * Os 5 sinais da nota, sempre nesta ordem (D-03): conversas, custo por conversa (menos é melhor), seguidores novos, fecharam e leads
 * atendidos (a fatia). Bases mínimas: conversas e as conversas do anúncio do período anterior, LIMITES.funil.minLeads; fecharam,
 * LIMITES.leitura.grupoMinimo; seguidores, MIN_DIAS_SALDO dias medidos nos dois períodos (compara a média por dia medido, porque o período
 * de agora costuma ter menos dias fechados que o anterior). Leads atendidos fica sempre em "Falta dado": o período anterior de pessoas não
 * é medido (D-05).
 */
export function fatoresDaHoje(e: EntradaCincoHoje): EntradaDoFator[] {
  // Custo por conversa
  const custoAgora = custoPorConversa(e.ads?.atual);
  const custoAntes = custoPorConversa(e.ads?.antes);
  const motivoDoCusto = !e.ads
    ? "os anúncios não vieram neste período"
    : custoAgora == null
      ? "sem conversas pelo anúncio neste período"
      : custoAntes == null
        ? "sem conversas pelo anúncio no período anterior"
        : undefined;

  // Seguidores novos
  const segAgora = porDia(e.crescimento?.atual);
  const segAntes = porDia(e.crescimento?.antes);
  const motivoDosSeguidores = !e.crescimento
    ? "o Instagram não está medido"
    : segAgora == null || segAntes == null
      ? `menos de ${MIN_DIAS_SALDO} dias medidos de seguidores`
      : undefined;

  // Leads atendidos: a fatia deste período (o anterior não existe)
  const virou = medido(e.pessoas?.etapas[1]?.valor);
  const atendido = medido(e.pessoas?.etapas[2]?.valor);
  const fatia = virou != null && atendido != null && virou > 0 && atendido <= virou ? Math.round((atendido / virou) * 100) : null;

  return [
    {
      id: "conversas",
      rotulo: "Conversas no WhatsApp",
      atual: medido(e.atual.mandaram_mensagem),
      anterior: medido(e.antes.mandaram_mensagem),
      baseMinima: LIMITES.funil.minLeads,
      motivoSemDado: "o histórico diário não cobre o período",
      formatar: inteiro,
    },
    {
      id: "custo-por-conversa",
      rotulo: "Custo por conversa",
      atual: custoAgora,
      anterior: custoAntes,
      menorEhMelhor: true,
      baseMinima: LIMITES.funil.minLeads,
      baseDoAnterior: medido(e.ads?.antes?.conversas),
      motivoSemDado: motivoDoCusto,
      formatar: reais,
    },
    {
      id: "seguidores-novos",
      rotulo: "Seguidores novos",
      atual: segAgora,
      anterior: segAntes,
      motivoSemDado: motivoDosSeguidores,
      formatar: (n) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia`,
    },
    {
      id: "fecharam",
      rotulo: "Pacientes que fecharam",
      atual: medido(e.atual.fecharam),
      anterior: medido(e.antes.fecharam),
      baseMinima: LIMITES.leitura.grupoMinimo,
      motivoSemDado: "o histórico diário não cobre o período",
      formatar: inteiro,
    },
    {
      id: "leads-atendidos",
      rotulo: "Leads que foram atendidos",
      atual: fatia,
      anterior: null,
      motivoSemDado: MOTIVO_ATENDIDOS,
      formatar: (n) => `${inteiro(n)} em cada 100`,
    },
  ];
}

// ---------------------------------------------------------------- o veredito: UMA frase com o número em destaque

interface Clausula {
  pre: string;
  numero: string;
  pos: string;
}

/** O que cada sinal diz quando ajudou (dPct > 0) ou puxou para baixo (dPct < 0). O número é sempre positivo, a palavra diz o sentido. */
function clausulaDe(f: FatorDaNota): Clausula | null {
  const n = `${Math.abs(f.dPct)}%`;
  const bom = f.dPct > 0;
  switch (f.id) {
    case "conversas":
      return { pre: "Chegaram ", numero: n, pos: bom ? " mais conversas" : " menos conversas" };
    case "custo-por-conversa":
      return { pre: "cada conversa ficou ", numero: n, pos: bom ? " mais barata" : " mais cara" };
    case "seguidores-novos":
      return { pre: "entraram ", numero: n, pos: bom ? " mais seguidores" : " menos seguidores" };
    case "fecharam":
      return { pre: bom ? "os fechados subiram " : "os fechados caíram ", numero: n, pos: "" };
    default:
      return null;
  }
}

const maiuscula = (t: string) => (t ? t[0].toLocaleUpperCase("pt-BR") + t.slice(1) : t);
const minuscula = (t: string) => (t ? t[0].toLocaleLowerCase("pt-BR") + t.slice(1) : t);

function partesDe(c: Clausula, enfase: "bom" | "ruim", primeira: boolean): ParteDaFrase[] {
  const pre = primeira ? maiuscula(c.pre) : minuscula(c.pre);
  return [{ texto: pre }, { texto: `${c.numero}${c.pos}`, enfase }];
}

const juntar = (partes: ParteDaFrase[]) => partes.map((p) => p.texto).join("");

/**
 * O veredito da Hoje (D-03): a palavra da faixa da nota e UMA frase de até 90 caracteres com o que mais ajudou e o que mais puxou para
 * baixo, só contra a própria clínica. Ex.: "Chegaram 62% mais conversas, mas os fechados caíram 50%." Sem nota (nenhum sinal com dado):
 * palavra "Falta dado", tom neutro e nenhuma conclusão.
 */
export function vereditoDaHoje(nota: NotaDoDia): VereditoDaTela {
  if (nota.nota == null) {
    return {
      tipo: "veredito",
      palavra: "Falta dado",
      tom: "neutro",
      frase: [{ texto: "Faltam números do período anterior para dar a nota." }],
    };
  }
  const palavra = nota.palavra ?? palavraDaNota(nota.nota);
  const tom = palavra === "Ruim" ? "ruim" : palavra === "Atenção" ? "atencao" : "bom";
  const comClausula = nota.fatores.filter((f) => clausulaDe(f) != null);
  // Em empate, o primeiro da ordem dos sinais.
  const ajudou = comClausula.reduce<FatorDaNota | null>((m, f) => (f.pontos > 50 && (!m || f.pontos > m.pontos) ? f : m), null);
  const puxou = comClausula.reduce<FatorDaNota | null>((m, f) => (f.pontos < 50 && (!m || f.pontos < m.pontos) ? f : m), null);

  const abre = (f: FatorDaNota, enfase: "bom" | "ruim") => partesDe(clausulaDe(f)!, enfase, true);
  const candidatas: ParteDaFrase[][] = [];
  if (ajudou && puxou) {
    candidatas.push([...partesDe(clausulaDe(ajudou)!, "bom", true), { texto: ", mas " }, ...partesDe(clausulaDe(puxou)!, "ruim", false), { texto: "." }]);
  }
  if (ajudou) candidatas.push([...abre(ajudou, "bom"), { texto: "." }]);
  if (puxou) candidatas.push([...abre(puxou, "ruim"), { texto: "." }]);
  candidatas.push([{ texto: ajudou || puxou ? `A nota é ${nota.nota} de 100.` : "Tudo igual ao período anterior." }]);
  // A primeira que cabe nas guardas (90 caracteres, jargão, outras clínicas, promessa).
  const frase = candidatas.find((c) => checarFraseCinco(juntar(c)).length === 0) ?? candidatas[candidatas.length - 1];
  return { tipo: "veredito", palavra, tom, frase };
}
