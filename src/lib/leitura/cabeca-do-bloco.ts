// A cabeça de cada bloco do "Ver tudo" (quick-ver-tudo, João 13/11/2026: "a informação deve ficar mais na cara, igual estamos fazendo
// com as telas novas"). Todo bloco que mora no "Ver tudo" (tabela, gráfico por dia, campanhas, plano, comparativo, ranking) abre com UMA
// resposta de até 90 caracteres, tirada por regra dos dados do PRÓPRIO bloco, com o número-chave em destaque; depois vem a prova.
// Sem dado medido para a frase, a cabeça diz "Falta dado: motivo" (nunca um zero de mentira). Nunca compara a clínica com outras (D-02),
// nunca usa jargão (CPL, "mediano", ÷) e nunca promete. Módulo puro: sem React, sem banco, sem rede e sem IA.
import { checarFraseCinco, textoDaFrase, type ParteDaFrase } from "./cinco-segundos";
import type { TomFato } from "./tipos";

/** Muda quando uma regra da cabeça do bloco muda. */
export const VERSAO_REGRAS_CABECA = 1;

/** Até quantos caracteres a frase da cabeça pode ter (a mesma régua do veredito e das descobertas). */
export const MAX_DA_CABECA = 90;

export type CabecaDoBloco =
  | {
      tipo: "frase";
      /** A frase, em partes: o número-chave vai com ênfase (a tela o desenha grande). */
      partes: readonly ParteDaFrase[];
      /** O tom da resposta (o sinal vai junto, nunca só a cor). Neutro quando a frase só descreve. */
      tom: TomFato;
    }
  | {
      tipo: "falta";
      /** O motivo, curto ("poucos dias com conversa"). A tela escreve "Falta dado: motivo". */
      motivo: string;
    };

/** Trecho com ênfase de número (o número-chave da frase). */
export const enfase = (texto: string): ParteDaFrase => ({ texto, enfase: "numero" });

/** O texto inteiro de uma cabeça, como a tela escreve ("Falta dado: motivo" quando falta). */
export function textoDaCabeca(c: CabecaDoBloco): string {
  return c.tipo === "falta" ? `Falta dado: ${c.motivo}` : textoDaFrase(c.partes);
}

/** Problemas de uma cabeça (vazio = pode ir): 90 caracteres, jargão, comparação com outras clínicas e promessa. */
export function checarCabeca(c: CabecaDoBloco): string[] {
  const problemas = checarFraseCinco(textoDaCabeca(c), MAX_DA_CABECA);
  if (c.tipo === "frase" && !c.partes.some((p) => p.enfase === "numero")) problemas.push("frase sem número em destaque");
  return problemas;
}

/** "Falta dado: motivo". O motivo é cortado na fronteira de uma palavra para caber nos 90 caracteres (nunca no meio). */
export function faltaDado(motivo: string): CabecaDoBloco {
  const limpo = motivo.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");
  const max = MAX_DA_CABECA - "Falta dado: ".length;
  if (limpo.length <= max) return { tipo: "falta", motivo: limpo };
  const ate = limpo.slice(0, max - 1);
  const espaco = ate.lastIndexOf(" ");
  return { tipo: "falta", motivo: `${(espaco > 0 ? ate.slice(0, espaco) : ate).replace(/[\s,;:—-]+$/, "")}…` };
}

/**
 * A primeira frase candidata que passa nas guardas (90 caracteres, jargão, D-02, promessa e número em destaque); nenhuma passa,
 * "Falta dado" com o motivo dado. Candidata null é pulada (a regra não teve dado para ela).
 */
export function primeiraQueCabe(candidatas: readonly (readonly ParteDaFrase[] | null | undefined)[], tom: TomFato, motivoDaFalta: string): CabecaDoBloco {
  for (const partes of candidatas) {
    if (!partes || partes.length === 0) continue;
    const c: CabecaDoBloco = { tipo: "frase", partes, tom };
    if (checarCabeca(c).length === 0) return c;
  }
  return faltaDado(motivoDaFalta);
}

// ---------- números ----------

const fmtInteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtUmaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** Inteiro com ponto de milhar. */
export const inteiro = (n: number): string => fmtInteiro.format(Math.round(n));
/** Até uma casa decimal, com vírgula. */
export const umaCasa = (n: number): string => fmtUmaCasa.format(Math.round(n * 10) / 10);
/** Reais inteiros, com ponto de milhar. */
export const reais = (n: number): string => `R$ ${inteiro(n)}`;
/** 12% */
export const porCento = (fracao: number): string => `${Math.round(fracao * 100)}%`;
/** "4,7×": quantas vezes `a` é `b`. null sem base. */
export function vezes(a: number, b: number): string | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return `${umaCasa(a / b)}×`;
}

// ---------- regras genéricas ----------

export interface ItemDoBloco {
  nome: string;
  valor: number | null | undefined;
}

/** O item de maior valor medido (empate: o primeiro da lista). null com menos de `minimo` itens medidos ou tudo zero. */
export function maiorItem(itens: readonly ItemDoBloco[], minimo = 2): { nome: string; valor: number; total: number; media: number; medidos: number } | null {
  const medidos = itens.filter((i): i is { nome: string; valor: number } => i.valor != null && Number.isFinite(i.valor));
  if (medidos.length < minimo) return null;
  const total = medidos.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return null;
  const maior = medidos.reduce((a, b) => (b.valor > a.valor ? b : a));
  return { nome: maior.nome, valor: maior.valor, total, media: total / medidos.length, medidos: medidos.length };
}

/** O item de menor valor medido (empate: o primeiro da lista). null com menos de `minimo` itens medidos. */
export function menorItem(itens: readonly ItemDoBloco[], minimo = 2): { nome: string; valor: number } | null {
  const medidos = itens.filter((i): i is { nome: string; valor: number } => i.valor != null && Number.isFinite(i.valor));
  if (medidos.length < minimo) return null;
  return medidos.reduce((a, b) => (b.valor < a.valor ? b : a));
}

const NOME_DO_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;
/** "terça" para um dia AAAA-MM-DD (meio-dia UTC, como date-range.ts). */
export const diaDaSemana = (iso: string): string => NOME_DO_DIA[new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()];
/** "terça" → "Terça" */
export const comMaiuscula = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** "15/10" */
export const diaCurto = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * O dia da semana com a maior média de uma série diária (só dias medidos). Precisa de pelo menos `minimoDeSemanas` medidas em cada
 * dia que disputa (padrão 2), para um dia sozinho não virar "o melhor dia".
 */
export function melhorDiaDaSemana(serie: readonly { dia: string; valor: number | null | undefined }[], minimoDeSemanas = 2): { dia: string; media: number; mediaGeral: number } | null {
  const grupos = new Map<string, number[]>();
  for (const p of serie) {
    if (p.valor == null || !Number.isFinite(p.valor)) continue;
    const d = diaDaSemana(p.dia);
    grupos.set(d, [...(grupos.get(d) ?? []), p.valor]);
  }
  const medias = [...grupos.entries()].filter(([, v]) => v.length >= minimoDeSemanas).map(([dia, v]) => ({ dia, media: v.reduce((s, x) => s + x, 0) / v.length }));
  if (medias.length < 2) return null;
  const todos = [...grupos.values()].flat();
  const mediaGeral = todos.reduce((s, x) => s + x, 0) / todos.length;
  const melhor = medias.reduce((a, b) => (b.media > a.media ? b : a));
  if (melhor.media <= 0) return null;
  return { ...melhor, mediaGeral };
}

/** O dia de maior valor de uma série diária (empate: o primeiro). null com menos de `minimo` dias medidos ou tudo zero. */
export function diaDePico(serie: readonly { dia: string; valor: number | null | undefined }[], minimo = 3): { dia: string; valor: number; media: number } | null {
  const medidos = serie.filter((p): p is { dia: string; valor: number } => p.valor != null && Number.isFinite(p.valor));
  if (medidos.length < minimo) return null;
  const pico = medidos.reduce((a, b) => (b.valor > a.valor ? b : a));
  if (pico.valor <= 0) return null;
  return { dia: pico.dia, valor: pico.valor, media: medidos.reduce((s, p) => s + p.valor, 0) / medidos.length };
}

/**
 * A passagem que mais perde de uma sequência de etapas (de uma etapa medida para a próxima medida): quantas de cada 100 seguem.
 * null com menos de 2 etapas medidas ou etapa de origem zerada.
 */
export function piorPassagem(etapas: readonly ItemDoBloco[]): { de: string; para: string; porCem: number } | null {
  const medidas = etapas.filter((e): e is { nome: string; valor: number } => e.valor != null && Number.isFinite(e.valor));
  let pior: { de: string; para: string; porCem: number } | null = null;
  for (let k = 1; k < medidas.length; k++) {
    const a = medidas[k - 1];
    const b = medidas[k];
    if (a.valor <= 0 || b.valor > a.valor) continue;
    const porCem = Math.round((b.valor / a.valor) * 100);
    if (!pior || porCem < pior.porCem) pior = { de: a.nome, para: b.nome, porCem };
  }
  return pior;
}

// ---------- comparação com o período anterior ----------

export interface LinhaDoComparativo {
  rotulo: string;
  agora: number | null;
  antes: number | null;
  /** true quando subir é bom, false quando cair é bom, null quando não há lado bom. */
  bomSobe: boolean | null;
}

/**
 * Uma tabela "este período contra o anterior": o número que mais mudou (a partir de `estavel`, 5% por padrão, a mesma folga da tabela de
 * Anúncios); nenhum mudou, quantos ficaram estáveis. Sem o anterior, "Falta dado".
 */
export function cabecaDoComparativo(linhas: readonly LinhaDoComparativo[], estavel = 0.05): CabecaDoBloco {
  const comVariacao = linhas
    .filter((l) => l.agora != null && l.antes != null && l.antes > 0)
    .map((l) => ({ l, v: l.agora! / l.antes! - 1 }));
  if (comVariacao.length === 0) return faltaDado("sem o período anterior para comparar");
  const maior = comVariacao.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
  if (Math.abs(maior.v) < estavel && comVariacao.length === 1) {
    return primeiraQueCabe([[{ texto: `${maior.l.rotulo} mudou menos de ` }, enfase(`${Math.round(estavel * 100)}%`), { texto: " contra o período anterior." }]], "neutro", "sem o período anterior para comparar");
  }
  if (Math.abs(maior.v) < estavel) {
    return primeiraQueCabe([[{ texto: "Nenhum dos " }, enfase(inteiro(comVariacao.length)), { texto: ` números mudou ${Math.round(estavel * 100)}% ou mais contra o período anterior.` }]], "neutro", "sem o período anterior para comparar");
  }
  const sobe = maior.v > 0;
  const tom = maior.l.bomSobe == null ? "neutro" : sobe === maior.l.bomSobe ? "bom" : "ruim";
  // "Cliques no link subiram", "Aparições subiram": a primeira palavra no plural leva o verbo no plural.
  const plural = /^\p{L}+s(?!\p{L})/u.test(maior.l.rotulo);
  const verbo = sobe ? (plural ? "subiram" : "subiu") : plural ? "caíram" : "caiu";
  return primeiraQueCabe(
    [
      [{ texto: `${maior.l.rotulo} ${verbo} ` }, enfase(porCento(Math.abs(maior.v))), { texto: " contra o período anterior." }],
      [{ texto: `O número que mais mudou ${sobe ? "subiu" : "caiu"} ` }, enfase(porCento(Math.abs(maior.v))), { texto: "." }],
    ],
    tom,
    "sem o período anterior para comparar",
  );
}

// ---------- série diária ----------

/**
 * Um gráfico por dia: o dia da semana que mais traz (quando passa 10% da média de todos os dias), senão o dia de pico (quando passa
 * 1,5× a média), senão "parecidos todo dia" com a média. `nome` no plural ("contatos", "conversas"). Poucos dias: "Falta dado".
 */
export function cabecaDaSerieDiaria(serie: readonly { dia: string; valor: number | null | undefined }[], nome: string, genero: "o" | "a" = "o"): CabecaDoBloco {
  const falta = `poucos dias com ${nome} para comparar um dia com o outro`;
  const semana = melhorDiaDaSemana(serie);
  if (semana && semana.media >= semana.mediaGeral * 1.1) {
    return primeiraQueCabe([[{ texto: `${comMaiuscula(semana.dia)} é o dia com mais ${nome}: ` }, enfase(umaCasa(semana.media)), { texto: " em média." }]], "neutro", falta);
  }
  const pico = diaDePico(serie);
  if (pico && pico.valor >= pico.media * 1.5) {
    return primeiraQueCabe([[{ texto: `O dia de mais ${nome} foi ${diaCurto(pico.dia)}: ` }, enfase(inteiro(pico.valor)), { texto: "." }]], "neutro", falta);
  }
  if (pico) {
    const parecidos = genero === "a" ? "parecidas" : "parecidos";
    return primeiraQueCabe([[{ texto: `${comMaiuscula(genero === "a" ? "as" : "os")} ${nome} vieram ${parecidos} todo dia: ` }, enfase(umaCasa(pico.media)), { texto: " por dia, em média." }]], "neutro", falta);
  }
  return faltaDado(falta);
}
