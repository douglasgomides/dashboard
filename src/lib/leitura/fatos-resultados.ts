// Fatos de Resultados da clínica (versão completa do 03.1-03). Módulo puro: recebe o Resultado que useResultado já
// montou, os números de pessoas de Pacientes do período e o retorno do investimento, e devolve os fatos separados por
// área. Não importa cliente de banco, não consulta e não chama IA, para a leitura sair na hora, no navegador, sem custo
// e sem lentidão. A lista de pessoas para chamar (paraChamarAgora) não é entrada daqui: nome e telefone nunca viram fato.
import type { Resultado } from "@/lib/resultado";
import type { Rastreio } from "@/lib/rastreio-anuncios";
import type { Selo } from "@/lib/selo";
import { montarRoi, seloDoInvestimento, type DadosRoi } from "@/lib/roi";
import { leituraDoPeriodo, type NumerosLeitura } from "@/lib/inteligencia-resultados";
import type { Area, Insight, Responsavel } from "@/lib/insight";
import { deInsight, deLeituraResultados, deLimitacao, fatoDeEtapaQueCresce, paresQueCrescem, type ParQueCresce } from "./adaptadores";
import { portaoDoPeriodo } from "./portao";
import { periodoAnterior, type Fato, type FatosDaTela, type PassoFato } from "./tipos";

/** Muda quando uma regra de fato muda; fica no resultado para as telas saberem de que regra veio a leitura. */
export const VERSAO_REGRAS_RESULTADOS = 3;

/** Números de pessoas do período (os mesmos de Pacientes do período). null em um número = a fonte não mediu. */
export interface FunilDoPeriodo {
  /** Soma dos dias do período (histórico diário), a mesma base do anterior: é daqui que sai a variação. */
  atual: NumerosLeitura;
  /** Os números dos cartões (pessoas diferentes no período). Decidem se há dado e se o funil está fora de ordem. */
  pessoas?: NumerosLeitura;
  /** Período anterior de mesmo tamanho. null = sem comparação medida. */
  anterior?: NumerosLeitura | null;
  /** Números que vieram sem medida, com o motivo da fonte: viram ressalva, nunca zero. */
  semMedida?: { chave: string; rotulo: string; motivo: string; quem: Responsavel }[];
}

export interface EntradaFatosResultados {
  resultado: Resultado;
  /** Início e fim do período escolhido na tela. */
  de: string;
  ate: string;
  /** Hoje, no fuso de Brasília. */
  hoje: string;
  rastreio?: Rastreio | null;
  selo?: Selo | null;
  funil?: FunilDoPeriodo | null;
  roi?: DadosRoi | null;
}

const DIA = 86_400_000;
const ms = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Quantos insights viram fato no total (os de maior prioridade; o resultado já vem ordenado). */
const MAX_INSIGHTS = 3;
/** Quantas limitações do dado entram como fato de atenção. */
const MAX_LIMITACOES = 3;
const AREAS: Area[] = ["resumo", "conteudo", "anuncios", "comercial", "ideias"];

/** ROI só entra como fato com o selo do investimento e o selo do retorno confiáveis. */
function fatoDeRoi(d: DadosRoi, hoje: string): Fato | null {
  const r = montarRoi(d);
  if (!r.calculavel || r.roi == null || r.retornoPorReal == null) return null;
  if (seloDoInvestimento(d, hoje).nivel !== "confiavel" || r.selo.nivel !== "confiavel") return null;
  const pct = Math.round(r.roi * 100);
  return {
    id: "roi",
    tom: r.roi >= 0 ? "bom" : "ruim",
    peso: 2,
    frase: `O investimento em anúncio de aquisição voltou R$ ${r.retornoPorReal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para cada R$ 1.`,
    numeros: [
      { chave: "roi", exibicao: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("pt-BR")}%`, valor: r.roi },
      { chave: "investido", exibicao: `${brl(r.investido)} investidos`, valor: r.investido },
    ],
  };
}

const CAMPOS_DO_FUNIL = ["mandaram_mensagem", "agendaram", "fecharam"] as const;
const ROTULO_DO_FUNIL: Record<(typeof CAMPOS_DO_FUNIL)[number], string> = { mandaram_mensagem: "Chamaram", agendaram: "Agendaram", fecharam: "Fecharam" };
/** As etapas do funil de pessoas, em ordem, com o rótulo de Resultados. */
const ORDEM_DO_FUNIL = CAMPOS_DO_FUNIL.map((chave) => ({ chave, rotulo: ROTULO_DO_FUNIL[chave] }));

/** As etapas de pessoas maiores que a anterior medida (ex.: mais fechamentos do que agendamentos, com 5 ou mais). */
export function paresDoFunilQueCrescem(n: NumerosLeitura): ParQueCresce[] {
  return paresQueCrescem(n, ORDEM_DO_FUNIL);
}

/** Funil fora de ordem (algum par que cresce). Não nega mais a leitura (D-01): fica para quem só quer o aviso. */
export function funilForaDeOrdem(n: NumerosLeitura): boolean {
  return paresDoFunilQueCrescem(n).length > 0;
}

export function fatosDeResultadosComAreas(e: EntradaFatosResultados): { fatos: FatosDaTela; porArea: Record<Area, Fato[]> } {
  const { resultado: r } = e;
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const cob = r.cobertura;
  const porArea: Record<Area, Fato[]> = { resumo: [], conteudo: [], anuncios: [], comercial: [], ideias: [] };
  const fatos: Fato[] = [];
  const passos: PassoFato[] = [];
  const poe = (area: Area, fato: Fato) => {
    if (fatos.some((f) => f.id === fato.id)) return;
    fatos.push(fato);
    porArea[area].push(fato);
  };

  // Portão (D-03). O dia que a Meta ainda está fechando (hoje e ontem) não conta como atraso: o fim do período para
  // a conferência é o fim menos os dias abertos.
  const ateFechado = iso(ms(fim) - cob.diasAbertos * DIA);
  const problemasAltos = r.insights.filter((i) => i.id.startsWith("dado-") && i.tom === "ruim").length;
  const funil = e.funil ?? null;
  const pessoas = funil ? (funil.pessoas ?? funil.atual) : null;
  const temFunil = !!pessoas && Object.values(pessoas).some((v) => v != null);
  const igVazio = cob.diasComDado === 0;
  const semMedida = funil?.semMedida ?? [];
  const portao = portaoDoPeriodo({
    periodoAte: ateFechado,
    hoje: e.hoje,
    // Só vira "sem dado" quando nenhuma fonte da tela tem dado: Instagram sem dia nenhum e nenhum número de pessoas medido.
    semDado: igVazio && !temFunil
      ? { motivo: semMedida[0]?.motivo.replace(/\.$/, "") ?? "o Instagram não tem nenhum dia com dado neste período", quem: semMedida[0]?.quem ?? "equipe_hub" }
      : null,
    fontes: [{ nome: "Instagram", status: null, ultimoDado: cob.ultimoDado }],
    rastreio: e.rastreio ?? null,
    selo: e.selo ?? null,
    problemasAltos,
    // Sem Instagram, mas com números de pessoas, a amostra do Instagram não manda na conclusão.
    n: igVazio && temFunil ? undefined : cob.diasComDado,
  });

  // Insights: os de maior prioridade e o melhor de cada área (para o resumo enxergar todas as áreas).
  const naoEDado = (i: Insight) => !i.id.startsWith("dado-");
  const escolhidos: Insight[] = r.insights.filter(naoEDado).slice(0, MAX_INSIGHTS);
  for (const area of AREAS) {
    const melhor = r.insights.find((i) => naoEDado(i) && i.area === area);
    if (melhor && !escolhidos.includes(melhor)) escolhidos.push(melhor);
  }
  for (const i of escolhidos) {
    const { fato, passo } = deInsight(i);
    poe(i.area, fato);
    if (passo) passos.push(passo);
  }

  // Cobertura do Instagram: ressalva do dado, nunca conclusão.
  r.cobertura.alertas.forEach((a, k) => {
    poe("conteudo", {
      id: `cobertura-${k}`,
      tom: a.tom,
      peso: 1,
      frase: a.texto,
      ressalva: true,
      numeros: [{ chave: "dias_com_dado", exibicao: `${cob.diasComDado} de ${cob.diasPeriodo} dias com dado` }],
      n: cob.diasComDado,
    });
  });

  // Variação de quem chamou, agendou e fechou, com as mesmas bases mínimas de leituraDoPeriodo (a base do período
  // anterior menor que a mínima não vira frase, e número sem medida nunca entra na conta).
  if (funil?.anterior) {
    for (const f of deLeituraResultados(leituraDoPeriodo(funil.atual, funil.anterior), funil.atual)) poe("comercial", f);
  }

  // Etapa maior que a anterior (D-01): não apaga a leitura; vira fato para a equipe conferir a marcação no CRM, com um
  // passo só da equipe (vai para os outros passos, nunca para o próximo passo da tela).
  for (const par of pessoas ? paresDoFunilQueCrescem(pessoas) : []) {
    const { fato, passo } = fatoDeEtapaQueCresce(par);
    poe("comercial", fato);
    passos.push(passo);
  }

  // O que não foi medido: ressalva "Sem dado" e um passo para conferir a fonte (nunca zero, queda ou conclusão).
  for (const s of semMedida) {
    const id = `sem-medida-${s.chave}`;
    poe("comercial", {
      id,
      tom: "atencao",
      peso: 1,
      ressalva: true,
      frase: `${s.rotulo} não foi medido neste período: ${s.motivo}`,
      numeros: [{ chave: s.chave, exibicao: "Sem dado" }],
    });
    passos.push({ verbo: "conferir", texto: `a fonte do número "${s.rotulo}"`, quem: s.quem, motivo: s.motivo, fatoId: id });
  }

  // Retorno do investimento: só com selo confiável.
  const fatoRoi = e.roi ? fatoDeRoi(e.roi, e.hoje) : null;
  if (fatoRoi) poe("anuncios", fatoRoi);

  // Limitações do dado (o que ainda não dá para dizer): atenção, com o passo de como resolver.
  for (const l of r.limitacoes.slice(0, MAX_LIMITACOES)) {
    const { fato, passo } = deLimitacao(l);
    poe(l.area, { ...fato, ressalva: true });
    if (passo) passos.push(passo);
  }

  // Um próximo passo só (D-05): o da próxima ação do resultado; as outras ações da semana ficam em "ver mais".
  const principal = r.proximaAcao ? deInsight(r.proximaAcao) : null;
  const proximoPasso = principal?.passo ?? null;
  if (principal && r.proximaAcao) poe(r.proximaAcao.area, principal.fato);
  const outrosPassos = [...passos, ...r.semana.filter((i) => i !== r.proximaAcao).map((i) => deInsight(i).passo)]
    .filter((p): p is PassoFato => p != null)
    .filter((p, k, lista) => lista.findIndex((x) => x.fatoId === p.fatoId) === k)
    .filter((p) => p.fatoId !== proximoPasso?.fatoId);

  return {
    fatos: {
      tela: "resultados",
      versaoRegras: VERSAO_REGRAS_RESULTADOS,
      tipoPeriodo: "periodo",
      periodo: { de: e.de, ate: fim, anterior: periodoAnterior(e.de, fim) },
      portao,
      fatos,
      proximoPasso,
      outrosPassos,
    },
    porArea,
  };
}

export function fatosDeResultados(e: EntradaFatosResultados): FatosDaTela {
  return fatosDeResultadosComAreas(e).fatos;
}

// ---------- comparação com o período anterior (compartilhada com Pacientes do período) ----------


const somaDias = (d: string, n: number) => iso(ms(d) + n * DIA);
const diasEntre = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DIA) + 1;

/**
 * O dia de hoje ainda não está fechado no histórico: a comparação usa só dias fechados, com o mesmo número de dias nos
 * dois lados. Mesma conta que Pacientes do período já fazia.
 */
export function periodosDeComparacao(start: string, end: string, hoje: string): { fimFechado: string; dias: number; anterior: { start: string; end: string } } {
  const fimFechado = end >= hoje ? somaDias(hoje, -1) : end;
  const ant = periodoAnterior(start, fimFechado);
  return { fimFechado, dias: diasEntre(start, fimFechado), anterior: { start: ant.de, end: ant.ate } };
}

/** Soma dia a dia de cada número. null = o histórico não cobre pelo menos 80% dos dias (não dá para comparar). */
export function somaDiaria(linhas: ({ dia: string } & Record<string, unknown>)[], dias: number, campos: readonly string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  // Sem nenhum dia fechado no período (ex.: só hoje), não há o que somar: nunca zero.
  if (dias < 1) {
    for (const k of campos) out[k] = null;
    return out;
  }
  for (const k of campos) {
    const medidas = linhas.filter((l) => l[k] != null);
    out[k] = medidas.length >= Math.ceil(dias * 0.8) ? medidas.reduce((s, l) => s + Number(l[k]), 0) : null;
  }
  return out;
}

/** Variação contra o período anterior: só quando os dois lados foram medidos e o anterior não é zero. */
export type VariacaoPct = { pct: number; tom: "up" | "down" | "flat" };
export function variacaoPct(atual: number | null | undefined, antes: number | null | undefined): VariacaoPct | null {
  if (atual == null || antes == null || antes <= 0) return null;
  const pct = Math.round(((atual - antes) / antes) * 100);
  return { pct, tom: pct === 0 ? "flat" : pct > 0 ? "up" : "down" };
}

/** O que a tela de pessoas devolve de cada número (o que a leitura precisa dele). */
interface NumeroDoBanco {
  valor: number | null;
  motivo_sem_dado?: string | null;
  responsavel?: "comercial" | "equipe_hub" | null;
}

/**
 * Junta os números de Pacientes do período (cartões) com a soma diária dos dois períodos (variação) no formato da
 * leitura. null = a consulta de pessoas não respondeu. Número sem medida (valor nulo) vira ressalva com o motivo da
 * própria fonte e nunca entra na conta como zero.
 */
export function funilDosNumeros(e: {
  dados: { numeros?: Partial<Record<string, NumeroDoBanco>> } | null | undefined;
  somaAtual?: Record<string, number | null> | null;
  somaAntes?: Record<string, number | null> | null;
}): FunilDoPeriodo | null {
  if (!e.dados) return null;
  const numeros = e.dados.numeros ?? {};
  const pessoas: NumerosLeitura = {};
  const atual: NumerosLeitura = {};
  const anterior: NumerosLeitura = {};
  const semMedida: NonNullable<FunilDoPeriodo["semMedida"]> = [];
  for (const k of CAMPOS_DO_FUNIL) {
    const n = numeros[k];
    pessoas[k] = n?.valor ?? null;
    atual[k] = e.somaAtual?.[k] ?? null;
    anterior[k] = e.somaAntes?.[k] ?? null;
    if (n && n.valor == null) semMedida.push({ chave: k, rotulo: ROTULO_DO_FUNIL[k], motivo: n.motivo_sem_dado?.trim() || "A fonte não respondeu.", quem: n.responsavel ?? "equipe_hub" });
  }
  const temAnterior = CAMPOS_DO_FUNIL.some((k) => anterior[k] != null);
  return { atual, pessoas, anterior: temAnterior ? anterior : null, semMedida };
}
