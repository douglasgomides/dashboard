// Instagram > Desempenho no formato 5 segundos (Phase 03.1.1.1, plano 07, D-01): o veredito de alcance e seguidores, os 3 números-chave com a
// variação contra a PRÓPRIA clínica e as descobertas da aba. Módulo puro: sem React, sem banco, sem rede e sem IA; só lê o que a tela já
// carregou (D-08: nenhuma consulta nova). D-02: nenhum número de outra clínica entra aqui. D-05: dado que falta é "Falta dado" com o motivo,
// nunca zero, e formato, horário ou tema com amostra pequena nunca ganha a palavra "melhor".
import type { GroupStat } from "@/lib/hub-conteudo";
import { serieContinua } from "@/lib/linha-30-dias";
import { numeroCurto } from "@/lib/texto-que-cabe";
import { checarFraseCinco, textoDaFrase, variacaoPropria, vereditoDosFatos, type ParteDaFrase, type PalavraDoVeredito, type Veredito, type VariacaoPropria } from "./cinco-segundos";
import type { FatosDaTela, TomFato } from "./tipos";

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
