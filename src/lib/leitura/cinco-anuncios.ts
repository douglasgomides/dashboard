// Anúncios no formato 5 segundos (Phase 03.1.1.1, plano 09, D-01): o veredito do custo por conversa contra o PERÍODO ANTERIOR da própria
// clínica (com o sinal honesto: nunca "mais barato" quando o custo subiu), o custo de cada dia, a média móvel de 7 dias e as descobertas da
// aba. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já carregou. D-02: nenhum número de outra clínica entra aqui.
// D-05: o rastreio suspeito continua negando o veredito ("Falta dado:" e o Gestor de tráfego), dia sem conversa nunca ganha custo e nenhuma
// frase estima conversa perdida ou projeta resultado.
import { MIN_DIAS_DA_FAIXA, medianaDaSerie } from "@/lib/faixa-do-normal";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { LIMITES } from "@/lib/limites";
import { checarDescoberta, checarFraseCinco, textoDaFrase, variacaoPropria, vereditoDosFatos, type Descoberta, type ParteDaFrase, type Veredito, type VariacaoPropria } from "./cinco-segundos";
import type { BarraDoFato, FatosDaTela, TomFato } from "./tipos";

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

// ---------- dias de verba baixa ----------

/** Dias com gasto que a regra precisa para saber o que é o dia comum de verba (o mesmo mínimo da faixa do normal). */
const MIN_DIAS_DE_VERBA = MIN_DIAS_DA_FAIXA;
/** Verba baixa é abaixo desta fração da mediana dos dias com gasto da própria clínica. */
const FRACAO_DE_VERBA_BAIXA = 0.5;
/** Se os dias "baixos" passam desta fração dos dias medidos, é o ritmo normal da clínica (fim de semana, por exemplo), não uma queda. */
const MAX_FRACAO_DE_DIAS_BAIXOS = 0.4;

export interface DiasDeVerbaBaixa {
  /** Datas dos dias de verba baixa (AAAA-MM-DD), em ordem. */
  dias: string[];
  /** Primeiro e último desses dias. */
  de: string;
  ate: string;
  /** A menor e a maior verba entre os dias baixos (R$ por dia). */
  verbaMin: number;
  verbaMax: number;
  /** A verba do dia comum da própria clínica: o dia do meio dos dias com gasto. */
  verbaComum: number;
  /** Médias por dia, nos dias baixos contra nos dias normais. */
  verbaMedia: { baixa: number; normal: number };
  conversasMedia: { baixa: number; normal: number };
  /** Custo por conversa nos dias baixos contra nos normais; null quando os dias baixos não tiveram conversa (não há custo). */
  custo: { baixa: number; normal: number } | null;
}

const media = (valores: readonly number[]) => valores.reduce((a, b) => a + b, 0) / valores.length;

/**
 * Os dias em que a verba da própria clínica ficou abaixo da metade do seu dia comum (o dia do meio dos dias com gasto). Só dias com linha
 * entram (dia sem linha é dia sem dado: não dá para saber se foi pausa ou falha da coleta), e dia com linha e gasto zero conta como verba
 * baixa. null quando faltam dias com gasto para saber o que é o comum, quando há menos de 2 dias baixos ou quando eles são mais de 40% dos
 * dias (aí é o ritmo normal da clínica, não uma queda).
 */
export function diasDeVerbaBaixa(porDia: readonly DiaDeAnuncio[]): DiasDeVerbaBaixa | null {
  const comGasto = porDia.filter((d) => d.gasto > 0);
  if (comGasto.length < MIN_DIAS_DE_VERBA) return null;
  const primeiro = comGasto.reduce((a, d) => (d.dia < a ? d.dia : a), comGasto[0].dia).slice(0, 10);
  const ultimo = comGasto.reduce((a, d) => (d.dia > a ? d.dia : a), comGasto[0].dia).slice(0, 10);
  const verbaComum = medianaDaSerie(comGasto.map((d) => d.gasto));
  if (verbaComum == null) return null;

  const naFaixa = porDia.filter((d) => d.dia.slice(0, 10) >= primeiro && d.dia.slice(0, 10) <= ultimo);
  const limite = verbaComum * FRACAO_DE_VERBA_BAIXA;
  const baixos = naFaixa.filter((d) => d.gasto < limite).sort((a, b) => a.dia.localeCompare(b.dia));
  const normais = naFaixa.filter((d) => d.gasto >= limite);
  if (baixos.length < 2 || normais.length === 0) return null;
  if (baixos.length > MAX_FRACAO_DE_DIAS_BAIXOS * naFaixa.length) return null;

  const soma = (l: readonly DiaDeAnuncio[], k: "gasto" | "conversas") => l.reduce((a, d) => a + d[k], 0);
  const gastoBaixo = soma(baixos, "gasto");
  const convBaixo = soma(baixos, "conversas");
  const gastoNormal = soma(normais, "gasto");
  const convNormal = soma(normais, "conversas");
  const verbas = baixos.map((d) => d.gasto);
  return {
    dias: baixos.map((d) => d.dia.slice(0, 10)),
    de: baixos[0].dia.slice(0, 10),
    ate: baixos[baixos.length - 1].dia.slice(0, 10),
    verbaMin: Math.min(...verbas),
    verbaMax: Math.max(...verbas),
    verbaComum,
    verbaMedia: { baixa: media(baixos.map((d) => d.gasto)), normal: media(normais.map((d) => d.gasto)) },
    conversasMedia: { baixa: media(baixos.map((d) => d.conversas)), normal: media(normais.map((d) => d.conversas)) },
    custo: gastoBaixo > 0 && convBaixo > 0 && gastoNormal > 0 && convNormal > 0 ? { baixa: gastoBaixo / convBaixo, normal: gastoNormal / convNormal } : null,
  };
}

// ---------- descobertas ----------

/** Chaves de ação que a tela trata (nada é enviado: abrem um lugar da própria tela). */
export const ACOES_DE_ANUNCIOS = { plano: "abrir-plano", campanhas: "abrir-campanhas" } as const;
/** Conversas mínimas num dia para ele poder ser chamado de "seu dia mais barato" (um dia com 1 conversa barata é sorte, não recorde). */
export const MIN_CONVERSAS_DO_RECORDE = 2;
/** De cada 100 conversas, abaixo disto agendaram: só aí a frase fala em gargalo depois do anúncio (menos da metade). */
const AGENDAMENTO_DO_GARGALO = 50;
const MAXIMO_DE_DESCOBERTAS = 5;

const ROTA_ATENDIMENTO = "/_authenticated/$clientId/atendimento";
const ROTA_FUNIL = "/_authenticated/$clientId/pacientes";

export interface DescobertasDosAnuncios {
  /** Em ordem de impacto: o que piorou primeiro, depois o que melhorou, depois o neutro. De 0 a 5 (nunca inventa). */
  itens: Descoberta[];
  /** "Poucas descobertas neste período: {motivo}." quando há menos de 3. null quando há 3 ou mais. */
  aviso: string | null;
}

const barra = (rotulo: string, exibicao: string, fracao: number): BarraDoFato => ({ rotulo, exibicao, fracao: Math.max(0, Math.min(1, Number.isFinite(fracao) ? fracao : 0)) });
const faltou = (rotulo: string): BarraDoFato => ({ rotulo, exibicao: "Falta dado", fracao: 0, faltou: true });
/** Fração de `v` em relação ao maior entre `v` e a referência (0 a 1): a barra nunca passa da cheia. */
const contra = (v: number, referencia: number) => (Math.max(v, referencia) > 0 ? v / Math.max(v, referencia) : 0);
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const numeroDeReais = (v: number) => reais(v).replace(/^R\$ /, "");
const ORDEM_DO_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };

/** Os dias estão em sequência (sem dia de fora entre o primeiro e o último)? */
function emSequencia(dias: readonly string[]): boolean {
  if (dias.length < 2) return true;
  return new Date(`${dias[dias.length - 1]}T12:00:00Z`).getTime() - new Date(`${dias[0]}T12:00:00Z`).getTime() === (dias.length - 1) * 86_400_000;
}

/**
 * De 0 a 5 descobertas de Anúncios, só com números da própria clínica (D-02): os dias de verba baixa contra os dias normais, a mudança do custo
 * por conversa contra o período anterior (sinal honesto), o dia mais barato, e o que acontece depois do anúncio. Cada uma só existe com a base
 * mínima da regra (D-05), tem UMA ação que só navega ou abre um lugar da tela (nada é enviado), quem resolve e um "Por quê?" de 2 a 3 fatores
 * em barra; o fator que falta é barra listrada com "Falta dado". Nenhuma frase estima conversa perdida nem projeta resultado. Portão do rastreio
 * negado: nenhuma descoberta (a tela diz "Falta dado: motivo"). Menos de 3 válidas: só as válidas mais o aviso com o motivo.
 */
export function descobertasDosAnuncios(e: EntradaCincoAnuncios): DescobertasDosAnuncios {
  if (!e.fatos || !e.fatos.portao.ok) return { itens: [], aviso: null };
  const candidatas: { d: Descoberta; k: number }[] = [];
  const motivos: string[] = [];
  const poe = (d: Descoberta) => {
    if (checarDescoberta(d).length > 0) return;
    candidatas.push({ d, k: candidatas.length });
  };
  const gestor = ROTULO_RESPONSAVEL.gestor_trafego;

  // 1. Dias de verba baixa: a verba caiu abaixo da metade do dia comum da própria clínica.
  const baixa = diasDeVerbaBaixa(e.porDia);
  if (baixa) {
    const n = baixa.dias.length;
    const minimo = numeroDeReais(baixa.verbaMin);
    const maximo = numeroDeReais(baixa.verbaMax);
    const faixaDeReais = minimo === maximo ? minimo : `${minimo}-${maximo}`;
    const periodo = emSequencia(baixa.dias) ? `(${dataCurta(baixa.de)} a ${dataCurta(baixa.ate)})` : `entre ${dataCurta(baixa.de)} e ${dataCurta(baixa.ate)}`;
    const frases = [`${n} dias com verba baixa ${periodo}: R$ ${faixaDeReais} por dia.`, `${n} dias com verba baixa: R$ ${faixaDeReais} por dia.`];
    const frase = frases.find((f) => checarFraseCinco(f).length === 0);
    const cai = baixa.conversasMedia.baixa < baixa.conversasMedia.normal;
    if (frase) {
      poe({
        id: "anuncios-verba-baixa",
        tom: cai ? "ruim" : "atencao",
        selo: cai ? "Fora do normal" : "Verba baixa",
        frase,
        quem: gestor,
        impacto: `${umaCasa(baixa.conversasMedia.baixa)} vs ${umaCasa(baixa.conversasMedia.normal)} conversas por dia`,
        acao: { rotulo: "Ver plano de verba", local: ACOES_DE_ANUNCIOS.plano },
        porque: {
          titulo: "Média por dia: dias de verba baixa contra dias normais",
          barras: [
            barra("Verba nos dias baixos", `${reais(baixa.verbaMedia.baixa)} · normal ${reais(baixa.verbaMedia.normal)}`, contra(baixa.verbaMedia.baixa, baixa.verbaMedia.normal)),
            barra("Conversas nos dias baixos", `${umaCasa(baixa.conversasMedia.baixa)} · normal ${umaCasa(baixa.conversasMedia.normal)}`, contra(baixa.conversasMedia.baixa, baixa.conversasMedia.normal)),
            baixa.custo ? barra("Custo nos dias baixos", `${reais(baixa.custo.baixa)} · normal ${reais(baixa.custo.normal)}`, contra(baixa.custo.baixa, baixa.custo.normal)) : faltou("Custo nos dias baixos"),
          ],
          obs: `Verba baixa é menos da metade do seu dia comum (${reais(baixa.verbaComum)}).`,
        },
      });
    }
  } else motivos.push("faltam dias de verba para saber o que é um dia comum");

  // 2. Custo por conversa contra o período anterior, com o sinal honesto.
  const c = compararCusto(e.atual, e.anterior);
  if (c && c.v.sinal !== "=") {
    const caiu = c.v.pct < 0;
    const a = e.atual!;
    const b = e.anterior!;
    poe({
      id: "anuncios-custo-por-conversa",
      tom: caiu ? "bom" : "ruim",
      selo: caiu ? "Melhorou" : "Piorou",
      frase: `Custo por conversa ${caiu ? "caiu" : "subiu"} ${Math.abs(c.v.pct)}%: de ${reais(c.antes)} para ${reais(c.agora)}.`,
      quem: gestor,
      impacto: `${reais(c.antes)} → ${reais(c.agora)} por conversa`,
      acao: { rotulo: "Ver campanhas", local: ACOES_DE_ANUNCIOS.campanhas },
      porque: {
        titulo: "Período anterior → período atual",
        barras: [
          barra("Investido", `${reais(b.gasto)} → ${reais(a.gasto)}`, contra(a.gasto, b.gasto)),
          barra("Conversas", `${Math.round(b.conversas)} → ${Math.round(a.conversas)}`, contra(a.conversas, b.conversas)),
          barra("Custo por conversa", `${reais(c.antes)} → ${reais(c.agora)}`, contra(c.agora, c.antes)),
        ],
      },
    });
  } else if (!c) motivos.push("faltam conversas dos dois períodos para comparar o custo");

  // 3. O dia mais barato: o recorde da própria clínica (só dias com conversas suficientes para o custo não ser sorte).
  const elegiveis = e.porDia.filter((d) => d.conversas >= MIN_CONVERSAS_DO_RECORDE && d.gasto > 0).map((d) => ({ dia: d.dia.slice(0, 10), custo: d.gasto / d.conversas, conversas: d.conversas }));
  if (elegiveis.length >= MIN_DIAS_DA_FAIXA) {
    const ordem = [...elegiveis].sort((x, y) => x.custo - y.custo || x.dia.localeCompare(y.dia));
    const melhor = ordem[0];
    const tres = ordem.slice(0, 3);
    const maior = Math.max(...tres.map((d) => d.custo));
    poe({
      id: "anuncios-dia-mais-barato",
      tom: "bom",
      selo: "Seu recorde",
      frase: `Seu dia mais barato: ${reais(melhor.custo)} por conversa, em ${dataCurta(melhor.dia)}.`,
      quem: gestor,
      impacto: `${melhor.conversas} conversas nesse dia`,
      acao: { rotulo: "Ver campanhas", local: ACOES_DE_ANUNCIOS.campanhas },
      porque: {
        titulo: "Seus 3 dias mais baratos no período",
        barras: tres.map((d) => barra(dataCurta(d.dia), reais(d.custo), maior > 0 ? d.custo / maior : 0)),
        obs: `Só dias com ${MIN_CONVERSAS_DO_RECORDE} conversas ou mais entram na conta.`,
      },
    });
  } else motivos.push("faltam dias com conversas para achar o dia mais barato");

  // 4. O que acontece depois do anúncio: das conversas que chegaram, quantas agendaram (resultados diários; todas as origens).
  const diario = e.diario ?? [];
  const mandaram = diario.reduce((s, d) => s + (d.mandaram_mensagem ?? 0), 0);
  const medidosDeAgenda = diario.filter((d) => d.agendaram != null);
  const agendaram = medidosDeAgenda.reduce((s, d) => s + (d.agendaram ?? 0), 0);
  if (mandaram >= LIMITES.funil.minLeads && medidosDeAgenda.length > 0 && agendaram <= mandaram) {
    const porCem = Math.round((agendaram / mandaram) * 100);
    const gargalo = porCem < AGENDAMENTO_DO_GARGALO;
    poe({
      id: "anuncios-depois-do-anuncio",
      tom: gargalo ? "atencao" : "neutro",
      selo: gargalo ? "Atenção" : "Depois do anúncio",
      frase: gargalo ? `O anúncio traz conversa. O gargalo é depois: de cada 100 conversas, ${porCem} agendaram.` : `De cada 100 conversas, ${porCem} agendaram.`,
      quem: ROTULO_RESPONSAVEL.atendimento,
      impacto: `${agendaram} agendaram de ${mandaram}`,
      acao: e.equipe ? { rotulo: "Ver atendimento", rota: ROTA_ATENDIMENTO } : { rotulo: "Ver o funil", rota: ROTA_FUNIL },
      porque: {
        titulo: "Do WhatsApp até a agenda, no período",
        barras: [barra("Mandaram mensagem", `${mandaram}`, 1), barra("Agendaram", `${agendaram}`, mandaram > 0 ? agendaram / mandaram : 0), faltou("Do anúncio que viraram consulta")],
        obs: "As conversas são de todas as origens, não só dos anúncios.",
      },
    });
  } else motivos.push("faltam conversas e agendamentos medidos para ver o que vem depois do anúncio");

  const itens = candidatas
    .sort((x, y) => ORDEM_DO_TOM[x.d.tom] - ORDEM_DO_TOM[y.d.tom] || x.k - y.k)
    .slice(0, MAXIMO_DE_DESCOBERTAS)
    .map((x) => x.d);
  const aviso = itens.length >= 3 ? null : `Poucas descobertas neste período: ${motivos[0] ?? "faltam dias medidos para comparar"}.`;
  return { itens, aviso };
}
