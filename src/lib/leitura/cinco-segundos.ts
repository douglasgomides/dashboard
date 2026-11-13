// Contrato das telas no formato 5 segundos (Phase 03.1.1.1, D-01): quem bate o olho por 5 segundos sai sabendo se está bom ou
// ruim, por quê e o que fazer. Este módulo é o que toda tela da fase importa: o veredito (palavra + UMA frase com número), a
// descoberta (frase curta, uma ação que só navega e um "Por quê?" com 2 a 3 fatores em barra), a variação contra a PRÓPRIA clínica
// e as guardas de texto. Módulo puro: sem React, sem banco, sem rede e sem IA. Emoção e ênfase são dado (ParteDaFrase), nunca HTML.
//
// D-02 (João, 12/11/2026): nunca comparar uma clínica com outras. Nada aqui recebe número de outra clínica, e GUARDA_SEM_COMPARAR_CLINICAS
// reprova a frase que tente ("melhor que 3 de 12", "média da carteira", ranking). Só vale o mês anterior, a faixa do normal, o melhor dia
// e a meta da própria clínica.
import { JARGAO_DA_HOJE, MAX_CARACTERES_DA_LEGENDA } from "./fatos-hoje";
import { montarTexto } from "./texto";
import type { BarraDoFato, Fato, FatosDaTela, LinhaTexto, PassoTexto, TomFato } from "./tipos";

/** Muda quando uma regra do formato 5 segundos muda. */
export const VERSAO_REGRAS_CINCO = 1;

/** Quantas descobertas ficam à vista; o resto vai para o "Ver tudo" (D-08: nunca subir o limite de altura). */
export const DESCOBERTAS_A_VISTA = 3;

// ---------- tipos ----------

/** A palavra do veredito. Sempre acompanha o sinal (▲ ▼ ! ●): o tom nunca vai só na cor. */
export type PalavraDoVeredito =
  | "Ótimo" | "Bom" | "Atenção" | "Ruim" | "Recorde" | "Em alta" | "Em queda" | "Estável" | "Maior perda" | "Melhorou" | "Piorou" | "Falta dado";

/** Um trecho de frase. A ênfase é dado: a tela a desenha como texto do React, nunca como HTML escrito pela regra. */
export interface ParteDaFrase {
  texto: string;
  enfase?: "numero" | "bom" | "ruim";
}

export interface VereditoDaTela {
  tipo: "veredito";
  palavra: PalavraDoVeredito;
  tom: TomFato;
  /** UMA frase, até 90 caracteres, com o número em destaque. */
  frase: readonly ParteDaFrase[];
  /** Uma linha de apoio opcional ("comparado com ..."). */
  apoio?: string;
}

/** Portão negado ou sem fato aproveitável: o mesmo "Falta dado: motivo" que a leitura da tela mostra (D-05). */
export interface VereditoSemDado {
  tipo: "sem_leitura";
  motivo: string;
  passo: PassoTexto;
}

export type Veredito = VereditoDaTela | VereditoSemDado;

/** A única ação de uma descoberta. Só navega ou abre um lugar da própria tela (CHAM-07: nada é enviado nem gravado). */
export interface AcaoDaDescoberta {
  rotulo: string;
  /** routeId do registro de telas (só navegação). */
  rota?: string;
  /** Uma chave que a própria tela trata (por exemplo trocar de aba). */
  local?: string;
}

export interface Descoberta {
  id: string;
  tom: TomFato;
  /** O selo ("Em queda"), até 24 caracteres. */
  selo: string;
  /** A frase, até 90 caracteres. */
  frase: string;
  /** Quem resolve, em nome ("Social media"). */
  quem?: string;
  /** Um número MEDIDO em jogo, até 40 caracteres. Nunca projeção nem promessa. */
  impacto?: string;
  acao: AcaoDaDescoberta;
  /** De onde veio, quando veio da leitura do período: "proximo-passo" marca a que leva o próximo passo da leitura (quick-ver-tudo). */
  origem?: "proximo-passo";
  porque: {
    titulo: string;
    /** 2 ou 3 fatores. O fator que falta é uma barra listrada com "Falta dado". */
    barras: readonly BarraDoFato[];
    /** Até 90 caracteres. */
    obs?: string;
  };
}

// ---------- variação contra a própria clínica ----------

export interface VariacaoPropria {
  /** Com sinal: +20 é "20% a mais que antes". */
  pct: number;
  sinal: "▲" | "▼" | "=";
  /** "▲ 20%", "▼ 12%" ou "= igual". O sinal vai junto: nunca só a cor. */
  texto: string;
  /** true quando a mudança é para o lado bom, false quando é para o lado ruim, null quando é igual. */
  melhor: boolean | null;
}

/** Abaixo disto a variação é "igual" (a mesma folga do piloto: 3%). */
const LIMITE_DO_IGUAL = 3;

/**
 * Variação do número atual contra o do período anterior DA MESMA clínica. Sem comparação possível (anterior ausente, zero ou abaixo
 * da base mínima, ou atual ausente) devolve null: a tela diz "Falta dado", nunca um 0% de mentira. `menorEhMelhor` vale para custo e
 * espera: cair é bom, e o sinal continua mostrando a direção do número.
 */
export function variacaoPropria(atual: number | null | undefined, antes: number | null | undefined, opcoes: { menorEhMelhor?: boolean; baseMinima?: number } = {}): VariacaoPropria | null {
  if (atual == null || antes == null || !Number.isFinite(atual) || !Number.isFinite(antes)) return null;
  if (antes <= 0 || antes < (opcoes.baseMinima ?? 0)) return null;
  const pct = Math.round(((atual - antes) / antes) * 100);
  if (Math.abs(pct) < LIMITE_DO_IGUAL) return { pct, sinal: "=", texto: "= igual", melhor: null };
  const sinal = pct > 0 ? "▲" : "▼";
  return { pct, sinal, texto: `${sinal} ${Math.abs(pct)}%`, melhor: opcoes.menorEhMelhor ? pct < 0 : pct > 0 };
}

// ---------- guardas de texto ----------

/**
 * D-02: a frase que compara a clínica com outras (ou com a carteira) nunca vai para a tela. Frases de comparação com a PRÓPRIA clínica
 * ("contra o período anterior", "melhor dia da clínica") não casam com nenhuma destas.
 */
export const GUARDA_SEM_COMPARAR_CLINICAS = new RegExp(
  [
    String.raw`(?<!\p{L})(melhor|pior|mais|menos)\s+que\s+\d+\s+de\s+\d+`,
    String.raw`(?<!\p{L})m[ée]dia\s+(da|das|de)\s+(carteira|cl[ií]nicas)`,
    String.raw`(?<!\p{L})mediana\s+(da|das|de)\s+(carteira|cl[ií]nicas)`,
    String.raw`(?<!\p{L})outras\s+cl[ií]nicas`,
    String.raw`(?<!\p{L})cl[ií]nicas\s+parecidas`,
    String.raw`(?<!\p{L})entre\s+(as|os)\s+\d+\s*%`,
    String.raw`(?<!\p{L})posi[cç][aã]o\s+\d+\s+de\s+\d+`,
    String.raw`(?<!\p{L})ranking(?!\p{L})`,
  ].join("|"),
  "iu",
);

/** Promessa e projeção não entram (regra do molde): "vai fechar", "~10 a mais se...". */
const PROMESSA = /(?<!\p{L})(vai|vão|deve|devem|irá|irão|provavelmente|garante|garantem|projeção|projecao|previsão|previsao)(?!\p{L})|em risco|~/iu;

/**
 * Problemas de uma frase do formato 5 segundos (vazio = pode ir): mais de `max` caracteres (90), jargão da Hoje, comparação com outras
 * clínicas (D-02) e promessa. "lead" fica permitido: é o nome da etapa do funil do João ("Virou lead").
 */
export function checarFraseCinco(texto: string, max = MAX_CARACTERES_DA_LEGENDA): string[] {
  const t = texto.replace(/\s+/g, " ").trim();
  const problemas: string[] = [];
  if (t.length > max) problemas.push(`mais de ${max} caracteres`);
  const jargao = JARGAO_DA_HOJE.exec(t);
  if (jargao) problemas.push(`jargão: "${jargao[0]}"`);
  const comparou = GUARDA_SEM_COMPARAR_CLINICAS.exec(t);
  if (comparou) problemas.push(`compara com outras clínicas: "${comparou[0]}"`);
  const prometeu = PROMESSA.exec(t);
  if (prometeu) problemas.push(`promessa ou projeção: "${prometeu[0]}"`);
  return problemas;
}

export const textoDaFrase = (partes: readonly ParteDaFrase[]): string => partes.map((p) => p.texto).join("");

// ---------- fatores do "Por quê?" ----------

const FALTA_DADO = "Falta dado";
/** Fatores que a regra ainda não mede para a ação: aparecem como barra listrada (nunca cheia, nunca zero). Todos são da própria clínica. */
const FATORES_QUE_FALTAM = ["Período anterior", "Meta da clínica", "Melhor dia da clínica"] as const;

/**
 * De 2 a 3 barras para o "Por quê?". As barras medidas vêm primeiro (a regra calculou a proporção); só um número medido vira uma barra
 * cheia com o próprio rótulo; o que falta para chegar a 2 é barra listrada com "Falta dado". Nunca passa de 3.
 */
export function barrasDoPorque(barras: readonly BarraDoFato[] | undefined, medido?: { rotulo: string; exibicao: string } | null): BarraDoFato[] {
  const medidas: BarraDoFato[] = (barras ?? []).slice(0, 3).map((b) => ({ ...b }));
  const lista: BarraDoFato[] = medidas.length ? medidas : medido ? [{ rotulo: medido.rotulo, exibicao: medido.exibicao, fracao: 1 }] : [];
  for (const rotulo of FATORES_QUE_FALTAM) {
    if (lista.length >= 2) break;
    if (!lista.some((b) => b.rotulo === rotulo)) lista.push({ rotulo, exibicao: FALTA_DADO, fracao: 0, faltou: true });
  }
  return lista.slice(0, 3);
}

/** Problemas de uma descoberta (vazio = pode ir): tamanhos, D-02, promessa no impacto e de 2 a 3 fatores. */
export function checarDescoberta(d: Descoberta): string[] {
  const problemas: string[] = [];
  if (d.selo.length > 24) problemas.push("selo com mais de 24 caracteres");
  for (const p of checarFraseCinco(d.frase)) problemas.push(`frase: ${p}`);
  if (d.impacto != null) {
    if (d.impacto.length > 40) problemas.push("impacto com mais de 40 caracteres");
    if (PROMESSA.test(d.impacto)) problemas.push("impacto com promessa ou projeção");
    if (GUARDA_SEM_COMPARAR_CLINICAS.test(d.impacto)) problemas.push("impacto compara com outras clínicas");
  }
  if (d.porque.obs != null) for (const p of checarFraseCinco(d.porque.obs)) problemas.push(`obs: ${p}`);
  const n = d.porque.barras.length;
  if (n < 2 || n > 3) problemas.push(`${n} fatores no "Por quê?" (de 2 a 3)`);
  for (const b of d.porque.barras) if (b.faltou && b.exibicao !== FALTA_DADO) problemas.push(`fator "${b.rotulo}" falta mas não diz "${FALTA_DADO}"`);
  return problemas;
}

// ---------- visíveis e resto ----------

/** Os `n` primeiros (à vista) e o resto (vai para o "Ver tudo"). */
export function visiveisEResto<T>(lista: readonly T[], n = DESCOBERTAS_A_VISTA): { visiveis: T[]; resto: T[] } {
  return { visiveis: lista.slice(0, n), resto: lista.slice(n) };
}

// ---------- veredito de reserva a partir dos fatos ----------

const PALAVRA_DO_TOM: Record<TomFato, PalavraDoVeredito> = { bom: "Bom", atencao: "Atenção", ruim: "Ruim", neutro: "Estável" };
const ORDEM_TOM: Record<TomFato, number> = { ruim: 0, atencao: 1, bom: 2, neutro: 3 };
const MAX_DA_FRASE = MAX_CARACTERES_DA_LEGENDA;
const NUMERO_NA_FRASE = /(R\$\s?)?\d[\d.]*(,\d+)?\s?%?/;

const semPonto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");

/**
 * A frase cabendo em 90 caracteres: inteira quando cabe; senão a primeira oração (antes da vírgula, dois-pontos ou travessão);
 * senão corta na fronteira de uma palavra e termina em "…". Nunca corta no meio de uma palavra.
 */
export function caberEm90(frase: string): string {
  const t = semPonto(frase);
  if (t.length + 1 <= MAX_DA_FRASE) return `${t}.`;
  const corte = /, |: | — |; /.exec(t);
  if (corte && corte.index >= 15 && corte.index + 1 <= MAX_DA_FRASE) return `${t.slice(0, corte.index).trim()}.`;
  const ate = t.slice(0, MAX_DA_FRASE - 1);
  const espaco = ate.lastIndexOf(" ");
  const palavras = (espaco > 0 ? ate.slice(0, espaco) : ate).replace(/[\s,;:—-]+$/, "");
  return `${palavras}…`;
}

/** A frase em partes: o primeiro número vai com ênfase; sem número na frase, o número do fato vem depois, quando cabe. */
function partesDaFrase(frase: string, linha: LinhaTexto): ParteDaFrase[] {
  const m = NUMERO_NA_FRASE.exec(frase);
  if (m) {
    const antes = frase.slice(0, m.index);
    const depois = frase.slice(m.index + m[0].length);
    const partes: ParteDaFrase[] = [];
    if (antes) partes.push({ texto: antes });
    partes.push({ texto: m[0], enfase: "numero" });
    if (depois) partes.push({ texto: depois });
    return partes;
  }
  const numero = linha.numeros[0]?.exibicao.trim();
  const sobra = numero ? `${semPonto(frase)} · ${numero}.` : null;
  if (sobra && sobra.length <= MAX_DA_FRASE) return [{ texto: `${semPonto(frase)} · ` }, { texto: `${numero}.`, enfase: "numero" }];
  return [{ texto: frase }];
}

/**
 * O veredito que sai da leitura da tela quando a tela ainda não tem regra própria. Com o portão negado, o mesmo motivo e o mesmo passo
 * de `montarTexto` (D-05). Com o portão ok, o fato de maior peso (conclusão antes de ressalva, depois ruim, atenção, bom) cuja frase passa
 * em `checarFraseCinco` e em `evitar` (uma guarda extra da tela, por exemplo as palavras que a Hoje não mostra). Sem nenhuma, Falta dado.
 * `null` com `fatos` null.
 */
export function vereditoDosFatos(fatos: FatosDaTela | null | undefined, evitar?: RegExp): Veredito | null {
  if (!fatos) return null;
  const texto = montarTexto(fatos);
  if (texto.tipo === "sem_leitura") return { tipo: "sem_leitura", motivo: texto.motivo, passo: texto.passo };

  const ordenados = [...fatos.fatos]
    .filter((f) => f.tom !== "neutro")
    .sort((a, b) => Number(!!a.ressalva) - Number(!!b.ressalva) || b.peso - a.peso || ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom]);
  for (const f of ordenados) {
    const t = montarTexto({ ...fatos, portao: { ok: true }, fatos: [f as Fato], proximoPasso: null, outrosPassos: [] });
    if (t.tipo !== "leitura") continue;
    const frase = caberEm90(t.aconteceu.frase);
    if (checarFraseCinco(frase).length > 0 || evitar?.test(frase)) continue;
    const partes = partesDaFrase(frase, t.aconteceu);
    const inteira = textoDaFrase(partes);
    if (checarFraseCinco(inteira).length > 0 || evitar?.test(inteira)) continue;
    return { tipo: "veredito", palavra: PALAVRA_DO_TOM[t.aconteceu.tom], tom: t.aconteceu.tom, frase: partes };
  }
  // Nenhum fato virou frase curta e limpa: o mesmo "Falta dado" da leitura sem fato aproveitável.
  const vazio = montarTexto({ ...fatos, portao: { ok: true }, fatos: [], proximoPasso: null, outrosPassos: [] });
  return vazio.tipo === "sem_leitura" ? { tipo: "sem_leitura", motivo: vazio.motivo, passo: vazio.passo } : null;
}
