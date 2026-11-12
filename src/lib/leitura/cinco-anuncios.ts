// Anúncios no formato 5 segundos (Phase 03.1.1.1, plano 09, D-01): o veredito do custo por conversa contra o PERÍODO ANTERIOR da própria
// clínica (com o sinal honesto: nunca "mais barato" quando o custo subiu), o custo de cada dia, a média móvel de 7 dias e as descobertas da
// aba. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já carregou. D-02: nenhum número de outra clínica entra aqui.
// D-05: o rastreio suspeito continua negando o veredito ("Falta dado:" e o Gestor de tráfego), dia sem conversa nunca ganha custo e nenhuma
// frase estima conversa perdida ou projeta resultado.
import { LIMITES } from "@/lib/limites";
import { checarFraseCinco, textoDaFrase, variacaoPropria, vereditoDosFatos, type ParteDaFrase, type Veredito, type VariacaoPropria } from "./cinco-segundos";
import type { FatosDaTela } from "./tipos";

/** Muda quando uma regra de Anúncios no formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO_ANUNCIOS = 1;

// ---------- entrada ----------

/** Um dia que a RPC ads_por_dia devolveu: o gasto e as conversas iniciadas pelos anúncios naquele dia. */
export interface DiaDeAnuncio {
  dia: string;
  gasto: number;
  conversas: number;
}

/** Total de um período (ads_resumo). */
export interface TotalDeAnuncios {
  gasto: number;
  conversas: number;
}

/** Um dia de resultados_diarios; só os dois campos que a descoberta do gargalo lê. */
export interface DiaDoResultado {
  dia: string;
  mandaram_mensagem: number | null;
  agendaram: number | null;
}

export interface EntradaCincoAnuncios {
  /** Os dias do período (a mesma lista da tela). */
  porDia: readonly DiaDeAnuncio[];
  /** Total do período e do período anterior da MESMA clínica. null = a leitura não veio. */
  atual: TotalDeAnuncios | null;
  anterior: TotalDeAnuncios | null;
  /** Os fatos da leitura (com o portão do rastreio). null = ainda carregando. */
  fatos: FatosDaTela | null;
  /** Resultados diários do período (a mesma leitura de Resultados e da Hoje). null = não veio. */
  diario: readonly DiaDoResultado[] | null;
  /** Equipe interna? O gargalo depois do anúncio leva ao Atendimento só para ela; o médico vai ao funil. */
  equipe?: boolean;
}

// ---------- contas simples ----------

/** Reais para a frase: inteiro a partir de R$ 10, duas casas abaixo disso. Espaço comum (não o sem quebra) para o texto medir igual. */
export function reais(v: number): string {
  const casas = Math.abs(v) >= 10 || v === 0 ? 0 : 2;
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

/** Reais com centavos, para o "antes" e para a lista dos dias. */
export function reaisComCentavos(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Custo por conversa de um total; null sem gasto ou sem conversa (nunca uma divisão por zero nem um custo de mentira). */
export function custoDoTotal(t: TotalDeAnuncios | null | undefined): number | null {
  if (!t || !(t.gasto > 0) || !(t.conversas > 0)) return null;
  return t.gasto / t.conversas;
}

/**
 * O custo por conversa de agora contra o de antes, ambos da própria clínica. Só compara com o mínimo de conversas do funil nos dois períodos
 * (LIMITES.funil.minLeads): com 8 conversas o custo balança de um período para o outro e o "17% mais barato" seria ruído.
 */
export function compararCusto(atual: TotalDeAnuncios | null | undefined, anterior: TotalDeAnuncios | null | undefined): { agora: number; antes: number; v: VariacaoPropria } | null {
  const agora = custoDoTotal(atual);
  const antes = custoDoTotal(anterior);
  if (agora == null || antes == null) return null;
  const minimo = LIMITES.funil.minLeads;
  if (atual!.conversas < minimo || anterior!.conversas < minimo) return null;
  const v = variacaoPropria(agora, antes, { menorEhMelhor: true });
  return v ? { agora, antes, v } : null;
}

// ---------- veredito ----------

/** "Investido igual; conversas subiram 20%." A comparação do investimento e das conversas que explica a do custo. */
function apoioDoCusto(e: Pick<EntradaCincoAnuncios, "atual" | "anterior">, antes: number): string {
  const vg = e.atual && e.anterior ? variacaoPropria(e.atual.gasto, e.anterior.gasto) : null;
  const vc = e.atual && e.anterior ? variacaoPropria(e.atual.conversas, e.anterior.conversas) : null;
  const partes: string[] = [];
  if (vg) partes.push(vg.sinal === "=" ? "Investido igual" : `Investido ${vg.pct > 0 ? "subiu" : "caiu"} ${Math.abs(vg.pct)}%`);
  if (vc) partes.push(vc.sinal === "=" ? "conversas iguais" : `conversas ${vc.pct > 0 ? "subiram" : "caíram"} ${Math.abs(vc.pct)}%`);
  return `Antes: ${reaisComCentavos(antes)} por conversa.${partes.length ? ` ${partes.join("; ")}.` : ""}`;
}

/**
 * O veredito de Anúncios: a palavra (Melhorou, Piorou ou Estável) e UMA frase com o custo por conversa e a mudança contra o período anterior
 * da própria clínica, com o sinal honesto ("17% mais barato" só quando o custo caiu, "mais caro" quando subiu). Com o portão do rastreio
 * negado, o mesmo "Falta dado: motivo" e o mesmo passo (Gestor de tráfego) da leitura (D-05). Sem base para comparar (menos conversas que o
 * mínimo do funil em algum dos dois períodos), a conclusão que a leitura já tinha, sem percentual. null com os fatos ainda carregando.
 */
export function vereditoDosAnuncios(e: Pick<EntradaCincoAnuncios, "atual" | "anterior" | "fatos">): Veredito | null {
  if (!e.fatos) return null;
  if (!e.fatos.portao.ok) return vereditoDosFatos(e.fatos);
  const c = compararCusto(e.atual, e.anterior);
  if (!c) return vereditoDosFatos(e.fatos);

  const { v, agora, antes } = c;
  const palavra = v.melhor === true ? "Melhorou" : v.melhor === false ? "Piorou" : "Estável";
  const tom = v.melhor === true ? "bom" : v.melhor === false ? "ruim" : "neutro";
  const frase: ParteDaFrase[] =
    v.sinal === "="
      ? [{ texto: reais(agora), enfase: "numero" }, { texto: " por conversa: igual ao período anterior" }]
      : [
          { texto: reais(agora), enfase: "numero" },
          { texto: " por conversa: " },
          { texto: `${Math.abs(v.pct)}%`, enfase: v.melhor ? "bom" : "ruim" },
          { texto: ` mais ${v.pct < 0 ? "barato" : "caro"} que no período anterior` },
        ];
  if (checarFraseCinco(textoDaFrase(frase)).length > 0) return vereditoDosFatos(e.fatos);
  return { tipo: "veredito", palavra, tom, frase, apoio: apoioDoCusto(e, antes) };
}

// ---------- custo por dia ----------

/**
 * O custo por conversa de cada dia da própria clínica. Só entram os dias com conversa E com gasto: dia sem conversa não tem custo (nunca
 * uma divisão por zero nem um custo de zero), e conversa sem gasto no dia não é um dia "de graça".
 */
export function custoPorDia(porDia: readonly DiaDeAnuncio[]): { dia: string; custo: number }[] {
  return porDia
    .filter((d) => d.conversas > 0 && d.gasto > 0)
    .map((d) => ({ dia: d.dia.slice(0, 10), custo: d.gasto / d.conversas }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Uma janela de 7 dias do calendário precisa de pelo menos este tanto de dias com linha para valer (o resto é dia sem dado). */
const MIN_DIAS_NA_JANELA = 4;

/**
 * Custo por conversa em média móvel de 7 dias (gasto da janela ÷ conversas da janela). Os 6 primeiros dias são null (ainda não existem 7), e
 * uma janela com poucos dias com linha ou sem conversa também é null (buraco, nunca zero). `melhor` é a menor média medida e o dia em que
 * a janela termina ("Melhor semana: R$ 12 (7 dias até 10/11)").
 */
export function mediaMovel7(porDia: readonly DiaDeAnuncio[]): { datas: string[]; valores: (number | null)[]; melhor: { valor: number; ate: string } | null } {
  const porData = new Map<string, DiaDeAnuncio>();
  for (const d of porDia) porData.set(d.dia.slice(0, 10), d);
  const dias = [...porData.keys()].sort();
  if (dias.length === 0) return { datas: [], valores: [], melhor: null };
  const datas: string[] = [];
  const fim = new Date(`${dias[dias.length - 1]}T12:00:00Z`).getTime();
  for (let t = new Date(`${dias[0]}T12:00:00Z`).getTime(); t <= fim && datas.length < 800; t += 86_400_000) datas.push(new Date(t).toISOString().slice(0, 10));

  const valores = datas.map((_, i) => {
    if (i < 6) return null;
    let gasto = 0;
    let conversas = 0;
    let comLinha = 0;
    for (let k = i - 6; k <= i; k++) {
      const d = porData.get(datas[k]);
      if (!d) continue;
      comLinha++;
      gasto += d.gasto;
      conversas += d.conversas;
    }
    return comLinha >= MIN_DIAS_NA_JANELA && conversas > 0 && gasto > 0 ? gasto / conversas : null;
  });

  let melhor: { valor: number; ate: string } | null = null;
  valores.forEach((v, i) => {
    if (v != null && (melhor == null || v < melhor.valor)) melhor = { valor: v, ate: datas[i] };
  });
  return { datas, valores, melhor };
}
