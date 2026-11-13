// Instagram > Desempenho no formato 5 segundos (Phase 03.1.1.1, plano 07, D-01): o veredito de alcance e seguidores, os 3 números-chave com a
// variação contra a PRÓPRIA clínica e as descobertas da aba. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já
// carregou (D-08: nenhuma consulta nova). D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo,
// nunca zero, e formato, horário ou tema com amostra pequena nunca ganha a palavra "melhor".
import type { GroupStat } from "@/lib/hub-conteudo";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { serieContinua } from "@/lib/linha-30-dias";
import { mapaDosPosts, melhorHorario, nomeDoHorario } from "@/lib/mapa-dos-posts";
import { numeroCurto, temaParaExibir } from "@/lib/texto-que-cabe";
import { checarDescoberta, checarFraseCinco, textoDaFrase, variacaoPropria, vereditoDosFatos, type Descoberta, type ParteDaFrase, type PalavraDoVeredito, type Veredito, type VariacaoPropria } from "./cinco-segundos";
import type { BarraDoFato, FatosDaTela, TomFato } from "./tipos";

/** Muda quando uma regra de Instagram > Desempenho no formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO_INSTAGRAM = 1;

/** Mesmo mínimo de dias medidos do saldo de seguidores de fatos-instagram.ts (MIN_DIAS_SALDO). */
export const MIN_DIAS_MEDIDOS = 5;

// ---------- entrada ----------

/** Um dia da conta do Instagram (instagram_account_daily_metrics). Só estes campos entram. */
export interface DiaDoInstagram {
  date: string;
  reach?: number | null;
  saves?: number | null;
  followers_count?: number | null;
  profile_links_taps?: number | null;
}

/** Um post do período (instagram_posts). Só contagens, formato, tema e data entram nas regras. */
export interface PostDoInstagram {
  posted_at?: string | null;
  reach?: number | null;
  saved?: number | null;
  format?: string | null;
  tema?: string | null;
}

/** O que a aba Desempenho já tem carregado quando monta o formato 5 segundos. */
export interface EntradaCincoInstagram {
  /** Dias do período (a mesma lista da tela). */
  diario: readonly DiaDoInstagram[];
  /** Dias do período anterior da MESMA clínica. null = ainda não carregou ou não veio. */
  diarioAnterior: readonly DiaDoInstagram[] | null;
  posts: readonly PostDoInstagram[];
  /** Saldo de seguidores (bruto menos saídas) já calculado pela tela. null = sem leitura. */
  crescimento: { novos: number; saidas: number; liquido: number; diasMedidos: number } | null;
  /** Formato e tema do período (analyzeFormatsAndTemas). null = ainda sem posts lidos. */
  formatos: { total: number; porFormato: GroupStat[]; porTema: GroupStat[]; melhorFormato: GroupStat | null } | null;
}

// ---------- contas simples ----------

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Soma de um campo diário e quantos dias tinham o campo medido. */
export function somaMedida(dias: readonly DiaDoInstagram[], campo: "reach" | "saves" | "profile_links_taps"): { soma: number; dias: number } {
  let soma = 0;
  let n = 0;
  for (const d of dias) {
    const v = d[campo];
    if (comValor(v)) {
      soma += Number(v);
      n++;
    }
  }
  return { soma, dias: n };
}

/** Contagem de seguidores do período: a última e o ganho (última menos primeira). O ganho precisa de 2 dias com contagem. */
export function seguidoresDoPeriodo(dias: readonly DiaDoInstagram[]): { ultimo: number | null; ganho: number | null; dias: number } {
  const pontos = dias
    .filter((d) => comValor(d.followers_count))
    .map((d) => ({ date: d.date, n: Number(d.followers_count) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pontos.length === 0) return { ultimo: null, ganho: null, dias: 0 };
  const ultimo = pontos[pontos.length - 1].n;
  return { ultimo, ganho: pontos.length >= 2 ? ultimo - pontos[0].n : null, dias: pontos.length };
}

/**
 * Compara a soma de agora com a do período anterior da MESMA clínica. Só compara com pelo menos MIN_DIAS_MEDIDOS dias medidos nos dois
 * lados e com cobertura parecida (o menor lado com pelo menos 80% dos dias do maior): somar 30 dias contra 10 mentiria. Devolve o motivo
 * quando não compara (a tela diz "Falta dado: motivo", nunca um 0%).
 */
export function compararSoma(
  agora: { soma: number; dias: number },
  antes: { soma: number; dias: number } | null,
): { variacao: VariacaoPropria; antes: number } | { motivo: string } {
  if (!antes || antes.dias === 0) return { motivo: "o período anterior não tem dias medidos" };
  if (agora.dias < MIN_DIAS_MEDIDOS || antes.dias < MIN_DIAS_MEDIDOS) return { motivo: `faltam dias medidos (mínimo ${MIN_DIAS_MEDIDOS} em cada período)` };
  if (Math.min(agora.dias, antes.dias) < 0.8 * Math.max(agora.dias, antes.dias)) return { motivo: "o período anterior tem menos dias medidos que o atual" };
  const v = variacaoPropria(agora.soma, antes.soma);
  return v ? { variacao: v, antes: antes.soma } : { motivo: "o período anterior não teve alcance para comparar" };
}

// ---------- veredito ----------

const PASSO_SEM_INSTAGRAM = { frase: "Conferir a conexão do Instagram.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: "Equipe Doctor Creator" } as const;

/**
 * O veredito de Desempenho: a palavra e UMA frase que junta o alcance (contra o período anterior da própria clínica) e o ganho de seguidores
 * do período ("Alcance subiu 143% e você ganhou 6,5 mil seguidores"). Sem o período anterior, só os seguidores; sem nenhum dos dois, ou com
 * o portão negado (Instagram não ligado, fonte parada), o mesmo "Falta dado: motivo" da leitura (D-05).
 */
export function vereditoDoInstagram(e: Pick<EntradaCincoInstagram, "diario" | "diarioAnterior" | "formatos">, fatos?: FatosDaTela | null): Veredito | null {
  if (fatos && !fatos.portao.ok) return vereditoDosFatos(fatos);
  const agora = somaMedida(e.diario, "reach");
  const antes = e.diarioAnterior ? somaMedida(e.diarioAnterior, "reach") : null;
  const alcance = compararSoma(agora, antes);
  const v = "variacao" in alcance ? alcance.variacao : null;
  const ganho = seguidoresDoPeriodo(e.diario).ganho;

  if (!v && ganho == null) {
    const base = fatos ? vereditoDosFatos(fatos) : null;
    if (base && base.tipo === "sem_leitura") return base;
    return { tipo: "sem_leitura", motivo: "faltam dias medidos de alcance e de seguidores neste período.", passo: { ...PASSO_SEM_INSTAGRAM } };
  }

  const lado = (n: number | null | undefined): -1 | 0 | 1 => (n == null || n === 0 ? 0 : n > 0 ? 1 : -1);
  const sinais = [v ? (v.melhor === null ? 0 : v.melhor ? 1 : -1) : 0, lado(ganho)];
  const sobe = sinais.some((s) => s > 0);
  const cai = sinais.some((s) => s < 0);
  const palavra: PalavraDoVeredito = sobe && cai ? "Atenção" : sobe ? "Em alta" : cai ? "Em queda" : "Estável";
  const tom: TomFato = palavra === "Em alta" ? "bom" : palavra === "Em queda" ? "ruim" : palavra === "Atenção" ? "atencao" : "neutro";

  const frase: ParteDaFrase[] = [];
  if (v) {
    const verbo = v.sinal === "=" ? "ficou igual" : v.pct > 0 ? "subiu" : "caiu";
    frase.push({ texto: `Alcance ${verbo}` });
    if (v.sinal !== "=") frase.push({ texto: " " }, { texto: `${Math.abs(v.pct)}%`, enfase: "numero" });
  }
  if (ganho != null) {
    const junta = !v ? "" : sobe && cai ? ", mas " : " e ";
    const sujeito = v ? "você" : "Você";
    if (ganho === 0) frase.push({ texto: `${junta}${sujeito} ficou com os mesmos seguidores` });
    else {
      frase.push({ texto: `${junta}${sujeito} ${ganho > 0 ? "ganhou" : "perdeu"} ` }, { texto: numeroCurto(Math.abs(ganho)), enfase: "numero" }, { texto: ` ${Math.abs(ganho) === 1 ? "seguidor" : "seguidores"}` });
    }
  }
  const texto = textoDaFrase(frase);
  if (checarFraseCinco(texto).length > 0) return { tipo: "sem_leitura", motivo: "a frase do período não passou nas regras de texto.", passo: { ...PASSO_SEM_INSTAGRAM } };

  const melhorFormato = e.formatos?.melhorFormato;
  return { tipo: "veredito", palavra, tom, frase, ...(melhorFormato ? { apoio: `${melhorFormato.label} é o que mais alcança.` } : {}) };
}

// ---------- números-chave ----------

export interface NumeroDoInstagram {
  id: "seguidores" | "alcance" | "salvos";
  titulo: string;
  /** O número grande, já em texto (curto para alcance). null = sem medida (o cartão diz "Sem dado" e o motivo). */
  valorTexto: string | null;
  legenda?: string;
  /** "▲ 143% · vs 1,6 mi antes". null quando não há comparação. */
  textoDaVariacao: string | null;
  /** true = melhorou, false = piorou, null = igual ou sem comparação. */
  melhor: boolean | null;
  /** O selo (sinal e palavra). Sem comparação: "Falta dado · sem período anterior". */
  selo: { tom: TomFato; texto: string } | null;
  /** Por que não há número ou comparação. */
  motivo: string | null;
  /** A linha de 30 dias (buraco = dia sem dado, nunca zero). */
  serie: { rotulo: string; datas: string[]; valores: (number | null)[] } | null;
}

const SEM_ANTERIOR: { tom: TomFato; texto: string } = { tom: "neutro", texto: "Falta dado · sem período anterior" };

function seloDaVariacao(melhor: boolean | null): { tom: TomFato; texto: string } {
  if (melhor === null) return { tom: "neutro", texto: "Estável" };
  return melhor ? { tom: "bom", texto: "Em alta" } : { tom: "ruim", texto: "Em queda" };
}

function serieDe(dias: readonly DiaDoInstagram[], campo: "reach" | "saves" | "followers_count", rotulo: string): NumeroDoInstagram["serie"] {
  const s = serieContinua(dias.map((d) => ({ dia: d.date, valor: comValor(d[campo]) ? Number(d[campo]) : null })));
  return s.datas.length >= 2 && s.valores.filter(comValor).length >= 2 ? { rotulo, ...s } : null;
}

function porcentagem(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(p) < 10 ? 1 : 0 })}%`;
}

/**
 * Os 3 números-chave, na ordem da tela: Seguidores (o ganho do período é a comparação), Pessoas alcançadas e Salvos (somas contra o período
 * anterior da PRÓPRIA clínica). Sem comparação possível o número diz "Falta dado" com o motivo; sem medida, "Sem dado" (nunca 0).
 */
export function numerosDoInstagram(e: Pick<EntradaCincoInstagram, "diario" | "diarioAnterior">): NumeroDoInstagram[] {
  const antesDias = e.diarioAnterior;

  // 1. Seguidores.
  const seg = seguidoresDoPeriodo(e.diario);
  let daSeg: NumeroDoInstagram;
  if (seg.ultimo == null) {
    daSeg = { id: "seguidores", titulo: "Seguidores", valorTexto: null, textoDaVariacao: null, melhor: null, selo: null, motivo: "nenhum dia do período tem contagem de seguidores", serie: null };
  } else if (seg.ganho == null) {
    daSeg = { id: "seguidores", titulo: "Seguidores", valorTexto: inteiro(seg.ultimo), legenda: "na última coleta", textoDaVariacao: null, melhor: null, selo: { tom: "neutro", texto: "Falta dado · só 1 dia com contagem" }, motivo: null, serie: null };
  } else {
    const base = seg.ultimo - seg.ganho;
    const pct = base > 0 ? ` · ${porcentagem((Math.abs(seg.ganho) / base) * 100)}` : "";
    const melhor = seg.ganho === 0 ? null : seg.ganho > 0;
    const texto = seg.ganho === 0 ? "= igual no período" : `${seg.ganho > 0 ? "▲ +" : "▼ −"}${inteiro(Math.abs(seg.ganho))}${pct} no período`;
    daSeg = { id: "seguidores", titulo: "Seguidores", valorTexto: inteiro(seg.ultimo), legenda: "na última coleta", textoDaVariacao: texto, melhor, selo: seloDaVariacao(melhor), motivo: null, serie: serieDe(e.diario, "followers_count", "seguidores") };
  }

  // 2 e 3. Alcance e Salvos.
  const soma = (campo: "reach" | "saves", titulo: string, id: "alcance" | "salvos", legenda: string, rotulo: string, curto: boolean): NumeroDoInstagram => {
    const agora = somaMedida(e.diario, campo);
    if (agora.dias === 0) return { id, titulo, valorTexto: null, textoDaVariacao: null, melhor: null, selo: null, motivo: `nenhum dia do período tem ${titulo === "Salvos" ? "salvos" : "alcance"} medido`, serie: null };
    const fmt = curto ? numeroCurto : inteiro;
    const c = compararSoma(agora, antesDias ? somaMedida(antesDias, campo) : null);
    const comparou = "variacao" in c;
    return {
      id,
      titulo,
      valorTexto: fmt(agora.soma),
      legenda,
      textoDaVariacao: comparou ? `${c.variacao.texto} · vs ${fmt(c.antes)} antes` : null,
      melhor: comparou ? c.variacao.melhor : null,
      selo: comparou ? seloDaVariacao(c.variacao.melhor) : SEM_ANTERIOR,
      motivo: comparou ? null : c.motivo,
      serie: serieDe(e.diario, campo, rotulo),
    };
  };
  return [daSeg, soma("reach", "Pessoas alcançadas", "alcance", "soma do alcance de cada dia", "pessoas alcançadas", true), soma("saves", "Salvos", "salvos", "salvos no período", "salvos", false)];
}

// ---------- formato: quanto salva x quanto você posta ----------

/** Plural para a frase ("47 Reels e 19 estáticos"). Formato fora da lista não entra na frase. */
const PLURAL_DO_FORMATO: Record<string, string> = { reels: "Reels", carrossel: "carrosséis", estatico: "estáticos", stories: "Stories" };

/** Posts mínimos de um formato para ele poder ser apontado como o que mais salva (a mesma amostra de conclusão do painel: 8). */
export const MIN_POSTS_DO_FORMATO = 8;
/** O formato que mais salva precisa salvar pelo menos 25% mais que o mais postado para a frase falar em descompasso. */
const FOLGA_DO_DESCOMPASSO = 1.25;

type FormatosDoPeriodo = Pick<NonNullable<EntradaCincoInstagram["formatos"]>, "porFormato">;

export interface FraseDoFormato {
  tipo: "descompasso" | "alinhado" | "neutro" | "poucos";
  frase: string;
  /** Só no descompasso: quem mais salva, quem você mais posta e quantas vezes mais salva. */
  maisSalva?: GroupStat;
  maisPostado?: GroupStat;
  vezes?: number;
}

/** Os formatos com posts suficientes para comparar (nunca "não classificado"). */
export function formatosComAmostra(fm: FormatosDoPeriodo | null | undefined): GroupStat[] {
  return (fm?.porFormato ?? []).filter((f) => f.key !== "não classificado" && f.count >= MIN_POSTS_DO_FORMATO && PLURAL_DO_FORMATO[f.key] != null);
}

/**
 * A frase da aba Formato: "{A} salva N× mais, mas você postou X {B} e Y {A}." quando o formato que mais salva NÃO é o que você mais posta
 * (os dois com pelo menos MIN_POSTS_DO_FORMATO posts). Sem descompasso, uma frase neutra; com menos de 2 formatos com amostra, nenhum é
 * chamado de "melhor" (D-05). Só a própria clínica (D-02).
 */
export function fraseDoFormato(fm: FormatosDoPeriodo | null | undefined): FraseDoFormato {
  const elegiveis = formatosComAmostra(fm);
  if (elegiveis.length < 2) return { tipo: "poucos", frase: "Poucos posts por formato para apontar o melhor." };
  const maisSalva = [...elegiveis].sort((a, b) => b.savedMean - a.savedMean || b.count - a.count)[0];
  // Empate de quantidade: quem mais salva conta como o mais postado (não há descompasso num empate).
  const maisPostado = [...elegiveis].sort((a, b) => b.count - a.count || Number(b.key === maisSalva.key) - Number(a.key === maisSalva.key))[0];
  if (maisSalva.key === maisPostado.key) return { tipo: "alinhado", frase: `${maisSalva.label} é o que mais salva e o que você mais posta.` };
  const vezes = maisPostado.savedMean > 0 ? maisSalva.savedMean / maisPostado.savedMean : 0;
  if (vezes < FOLGA_DO_DESCOMPASSO) return { tipo: "neutro", frase: "Os formatos salvam parecido: nenhum se destaca." };
  const n = umaCasa(vezes);
  const monta = (multiplicacao: string) =>
    `${maisSalva.label} salva ${n}${multiplicacao} mais, mas você postou ${maisPostado.count} ${PLURAL_DO_FORMATO[maisPostado.key]} e ${maisSalva.count} ${PLURAL_DO_FORMATO[maisSalva.key]}.`;
  // O sinal × passa na guarda de jargão; se um dia deixar de passar, a frase usa "vezes".
  const frase = checarFraseCinco(monta("×")).length === 0 ? monta("×") : monta(" vezes");
  return { tipo: "descompasso", frase, maisSalva, maisPostado, vezes };
}

// ---------- descobertas ----------

/** Chaves de ação que a tela trata (nada é enviado: abrem um lugar da própria tela). */
export const ACOES_DE_INSTAGRAM = { horario: "abrir-horario", top5: "abrir-top5" } as const;
/** Posts mínimos de um tema para ele poder ser apontado como o campeão (a mesma amostra de conclusão do painel: 8). */
export const MIN_POSTS_DO_TEMA = 8;
/** O tema campeão salva pelo menos 25% acima da média dos posts da conta (MARGEM_TEMA de hub-conteudo): abaixo disso é ruído. */
const MARGEM_DO_TEMA = 1.25;
/** Quantas descobertas esta tela mostra, no máximo (as 3 primeiras à vista, o resto em "Ver tudo"). */
const MAXIMO_DE_DESCOBERTAS = 5;

const ROTA_DE_POSTS = "/_authenticated/$clientId/posts";
const ROTA_DE_LINKS = "/_authenticated/$clientId/links";

export interface DescobertasDoInstagram {
  /** Em ordem de impacto: o que piorou primeiro, depois o que melhorou, depois o neutro. De 0 a 5 (nunca inventa). */
  itens: Descoberta[];
  /** "Poucas descobertas neste período: {motivo}." quando há menos de 3. null quando há 3 ou mais. */
  aviso: string | null;
}

const barra = (rotulo: string, exibicao: string, fracao: number): BarraDoFato => ({ rotulo, exibicao, fracao: Math.max(0, Math.min(1, Number.isFinite(fracao) ? fracao : 0)) });
const inteiroOuUmaCasa = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const curtoRotulo = (t: string, max = 28) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const social = ROTULO_RESPONSAVEL.social_media;

function mediaDe(valores: readonly (number | null | undefined)[]): number | null {
  const v = valores.filter(comValor).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * De 0 a 5 descobertas de Desempenho, só com números da própria clínica (D-02): o formato que mais salva contra o que você mais posta, o
 * link da bio, o melhor horário dos seus posts, os salvos a cada mil pessoas contra antes e o tema campeão. Cada uma só existe com a amostra
 * mínima da regra (D-05), tem UMA ação que só navega ou abre um lugar da tela, quem resolve e um "Por quê?" de 2 a 3 fatores em barra.
 * Portão negado: nenhuma descoberta (a tela diz "Falta dado: motivo"). Menos de 3 válidas: só as válidas mais o aviso com o motivo.
 */
export function descobertasDoInstagram(e: EntradaCincoInstagram, fatos?: FatosDaTela | null): DescobertasDoInstagram {
  if (fatos && !fatos.portao.ok) return { itens: [], aviso: null };
  const candidatas: { d: Descoberta; k: number }[] = [];
  const motivos: string[] = [];
  const poe = (d: Descoberta) => {
    if (checarDescoberta(d).length > 0) return;
    candidatas.push({ d, k: candidatas.length });
  };

  // 1. Formato: quem mais salva não é o que você mais posta.
  const ff = fraseDoFormato(e.formatos);
  if (ff.tipo === "descompasso" && ff.maisSalva && ff.maisPostado) {
    const { maisSalva: a, maisPostado: b } = ff;
    const soma = formatosComAmostra(e.formatos).reduce((n, f) => n + f.count, 0);
    poe({
      id: "instagram-formato",
      tom: "bom",
      selo: "Melhor formato",
      frase: ff.frase,
      quem: social,
      impacto: `${inteiroOuUmaCasa(a.savedMean)} vs ${inteiroOuUmaCasa(b.savedMean)} salvos por post`,
      acao: { rotulo: `Pedir mais ${PLURAL_DO_FORMATO[a.key]} à equipe`, rota: ROTA_DE_POSTS },
      porque: {
        titulo: "Por post, em média, no período",
        barras: [
          barra(`Salvos · ${a.label}`, inteiroOuUmaCasa(a.savedMean), 1),
          barra(`Salvos · ${b.label}`, inteiroOuUmaCasa(b.savedMean), a.savedMean > 0 ? b.savedMean / a.savedMean : 0),
          barra(`Você postou · ${b.label}`, `${b.count} de ${soma}`, soma > 0 ? b.count / soma : 0),
        ],
        obs: "Só formatos com 8 posts ou mais entram na conta.",
      },
    });
  } else if (ff.tipo === "poucos") motivos.push("poucos posts por formato para comparar");

  // 2. Link da bio: toques contra as pessoas alcançadas, e contra o período anterior da própria clínica.
  const taps = somaMedida(e.diario, "profile_links_taps");
  const alcance = somaMedida(e.diario, "reach");
  if (taps.dias >= MIN_DIAS_MEDIDOS && alcance.dias >= MIN_DIAS_MEDIDOS && alcance.soma > 0) {
    const porMil = (taps.soma / alcance.soma) * 1000;
    const tapsAntes = e.diarioAnterior ? somaMedida(e.diarioAnterior, "profile_links_taps") : null;
    const alcanceAntes = e.diarioAnterior ? somaMedida(e.diarioAnterior, "reach") : null;
    const comAntes = !!tapsAntes && !!alcanceAntes && tapsAntes.dias >= MIN_DIAS_MEDIDOS && alcanceAntes.dias >= MIN_DIAS_MEDIDOS && alcanceAntes.soma > 0;
    const porMilAntes = comAntes ? (tapsAntes!.soma / alcanceAntes!.soma) * 1000 : null;
    const v = variacaoPropria(porMil, porMilAntes);
    const barras: BarraDoFato[] = [barra("Pessoas alcançadas", numeroCurto(alcance.soma), 1), barra("Toques no link", numeroCurto(taps.soma), taps.soma / alcance.soma)];
    if (v && porMilAntes != null) barras.push(barra("Toques por mil · antes → agora", `${umaCasa(porMilAntes)} → ${umaCasa(porMil)}`, Math.max(porMilAntes, porMil) > 0 ? porMil / Math.max(porMilAntes, porMil) : 0));
    const tom: TomFato = v?.melhor === true ? "bom" : v?.melhor === false ? "ruim" : "neutro";
    poe({
      id: "instagram-link-da-bio",
      tom,
      selo: v?.melhor === true ? "Em alta" : v?.melhor === false ? "Em queda" : "Link da bio",
      frase: `Link da bio: ${numeroCurto(taps.soma)} ${taps.soma === 1 ? "toque" : "toques"} em ${numeroCurto(alcance.soma)} pessoas alcançadas.`,
      quem: social,
      // "0,0 a cada mil pessoas" não diz nada (12/11/2026, João): o chip mostra a contagem de toques do período.
      impacto: `${numeroCurto(taps.soma)} ${taps.soma === 1 ? "toque" : "toques"} no link`,
      acao: { rotulo: "Revisar o link da bio", rota: ROTA_DE_LINKS },
      porque: { titulo: "Toques no link da bio, no período", barras, obs: v ? undefined : "Falta dado: sem o período anterior para comparar." },
    });
  }

  // 3. Melhor horário dos próprios posts (célula com pelo menos 2 posts).
  const mapa = mapaDosPosts(e.posts);
  const melhor = melhorHorario(mapa);
  if (melhor) {
    const outros = mapa.filter((c) => c.posts >= 2 && !(c.dia === melhor.dia && c.hora === melhor.hora)).sort((x, y) => y.alcancePorPost - x.alcancePorPost)[0];
    const media = mediaDe(e.posts.map((p) => p.reach));
    const barras: BarraDoFato[] = [barra(nomeDoHorario(melhor), numeroCurto(melhor.alcancePorPost), 1)];
    if (outros) barras.push(barra(nomeDoHorario(outros), numeroCurto(outros.alcancePorPost), melhor.alcancePorPost > 0 ? outros.alcancePorPost / melhor.alcancePorPost : 0));
    if (media != null) barras.push(barra("Todos os seus posts", numeroCurto(media), melhor.alcancePorPost > 0 ? media / melhor.alcancePorPost : 0));
    // Menos de 2 fatores medidos: o que falta vira barra listrada com "Falta dado" (nunca zero).
    if (barras.length < 2) barras.push({ rotulo: "Todos os seus posts", exibicao: "Falta dado", fracao: 0, faltou: true });
    poe({
      id: "instagram-melhor-horario",
      tom: "bom",
      selo: "Melhor horário",
      frase: `${nomeDoHorario(melhor)} é seu melhor horário: ${numeroCurto(melhor.alcancePorPost)} pessoas por post.`,
      quem: social,
      impacto: `${melhor.posts} posts nesse horário`,
      acao: { rotulo: "Ver mapa de horários", local: ACOES_DE_INSTAGRAM.horario },
      porque: { titulo: "Alcance médio por post, por horário", barras, obs: "Só horários com 2 posts ou mais podem ser o melhor." },
    });
  }

  // 4. Salvos a cada mil pessoas alcançadas, contra o período anterior da própria clínica.
  const salvos = somaMedida(e.diario, "saves");
  const antesAlcance = e.diarioAnterior ? somaMedida(e.diarioAnterior, "reach") : null;
  const antesSalvos = e.diarioAnterior ? somaMedida(e.diarioAnterior, "saves") : null;
  if (salvos.dias >= MIN_DIAS_MEDIDOS && alcance.dias >= MIN_DIAS_MEDIDOS && alcance.soma > 0 && antesAlcance && antesSalvos && antesSalvos.dias >= MIN_DIAS_MEDIDOS && antesAlcance.dias >= MIN_DIAS_MEDIDOS && antesAlcance.soma > 0) {
    const agora = (salvos.soma / alcance.soma) * 1000;
    const antes = (antesSalvos.soma / antesAlcance.soma) * 1000;
    const v = variacaoPropria(agora, antes);
    if (v && v.melhor !== null) {
      // Dias do período que chegaram ao nível de antes (só dias com salvos e alcance medidos).
      const dias = e.diario.filter((d) => comValor(d.saves) && comValor(d.reach) && Number(d.reach) > 0);
      const noNivel = dias.filter((d) => (Number(d.saves) / Number(d.reach)) * 1000 >= antes).length;
      const maior = Math.max(antes, agora);
      poe({
        id: "instagram-salvos-por-mil",
        tom: v.melhor ? "bom" : "atencao",
        selo: v.melhor ? "Em alta" : "Atenção",
        frase: `De cada mil pessoas alcançadas, ${umaCasa(agora)} salvaram. Antes eram ${umaCasa(antes)}.`,
        quem: social,
        impacto: `${umaCasa(antes)} → ${umaCasa(agora)} por mil`,
        acao: { rotulo: "Ver posts que mais salvaram", local: ACOES_DE_INSTAGRAM.top5 },
        porque: {
          titulo: "Salvos a cada mil pessoas alcançadas",
          barras: [
            barra("Antes", umaCasa(antes), maior > 0 ? antes / maior : 0),
            barra("Agora", umaCasa(agora), maior > 0 ? agora / maior : 0),
            barra("Dias no nível de antes", `${noNivel} de ${dias.length}`, dias.length > 0 ? noNivel / dias.length : 0),
          ],
          obs: `${noNivel} de ${dias.length} dias chegaram ao nível de antes.`,
        },
      });
    }
  } else motivos.push("faltam alcance e salvos do período anterior");

  // 5. Tema campeão: o que mais salva entre os temas com amostra, bem acima da média dos posts da conta.
  const temas = (e.formatos?.porTema ?? []).filter((t) => t.count >= MIN_POSTS_DO_TEMA).sort((x, y) => y.savedMean - x.savedMean);
  const mediaDaConta = mediaDe(e.posts.map((p) => p.saved));
  if (temas.length >= 2 && mediaDaConta != null && temas[0].savedMean >= MARGEM_DO_TEMA * mediaDaConta && temas[0].savedMean > temas[1].savedMean) {
    const [c, segundo] = temas;
    const nome = temaParaExibir(c.key) ?? c.key;
    const frases = [
      `${nome} salva ${inteiroOuUmaCasa(c.savedMean)} por post, o melhor tema. Foram ${c.count} posts.`,
      `${nome} é o tema que mais salva: ${inteiroOuUmaCasa(c.savedMean)} por post.`,
      `Tema que mais salva: ${nome}.`,
    ];
    const frase = frases.find((f) => checarFraseCinco(f).length === 0);
    if (frase) {
      poe({
        id: "instagram-tema-campeao",
        tom: "bom",
        selo: "Tema campeão",
        frase,
        quem: social,
        impacto: `${c.count} posts do tema`,
        acao: { rotulo: nome.length <= 24 ? `Pedir mais posts de ${nome}` : "Pedir mais posts desse tema", rota: ROTA_DE_POSTS },
        porque: {
          titulo: "Salvos por post, em média, por tema",
          barras: [
            barra(curtoRotulo(nome), inteiroOuUmaCasa(c.savedMean), 1),
            barra(curtoRotulo(temaParaExibir(segundo.key) ?? segundo.key), inteiroOuUmaCasa(segundo.savedMean), c.savedMean > 0 ? segundo.savedMean / c.savedMean : 0),
            barra("Todos os seus posts", inteiroOuUmaCasa(mediaDaConta), c.savedMean > 0 ? mediaDaConta / c.savedMean : 0),
          ],
          obs: "Só temas com 8 posts ou mais entram na conta.",
        },
      });
    }
  }

  const ORDEM_DO_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };
  const itens = candidatas
    .sort((x, y) => ORDEM_DO_TOM[x.d.tom] - ORDEM_DO_TOM[y.d.tom] || x.k - y.k)
    .slice(0, MAXIMO_DE_DESCOBERTAS)
    .map((c) => c.d);
  const aviso = itens.length >= 3 ? null : `Poucas descobertas neste período: ${motivos[0] ?? "faltam posts ou dias medidos para comparar"}.`;
  return { itens, aviso };
}
