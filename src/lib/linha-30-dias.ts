// Linha de 30 dias dos cartões (sketch 002, variante A, aprovada pelo João em 12/11/2026): área, média tracejada e o dia ao passar
// o dedo. Módulo puro: sem React, sem banco, sem consulta. Só regra sobre a série diária que a tela já tem em memória.
// Honestidade: dia sem dado (null) é buraco (o caminho quebra ali, nunca desce a zero) e a média ignora o buraco.

export interface PontoDaLinha {
  /** Posição no viewBox (0 a largura). */
  x: number;
  /** Posição no viewBox (0 a altura); o maior valor fica a 92% da altura, para a linha nunca encostar no topo. */
  y: number;
}

export const LARGURA = 300;
export const ALTURA = 64;
/** Quanto da altura o maior valor ocupa. */
const FOLGA_DO_TOPO = 0.92;

const arredonda2 = (n: number) => Math.round(n * 100) / 100;
const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const maiorDa = (valores: readonly (number | null)[]) => {
  const max = Math.max(0, ...valores.filter(comValor));
  return max > 0 ? max : 1;
};

/** Um ponto por dia com valor, na ordem; dia sem dado vira null (buraco). x vai de 0 a `largura`. */
export function pontosDaLinha(valores: readonly (number | null)[], largura = LARGURA, altura = ALTURA): (PontoDaLinha | null)[] {
  const max = maiorDa(valores);
  const n = valores.length;
  return valores.map((v, i) => (comValor(v) ? { x: n > 1 ? (i / (n - 1)) * largura : 0, y: altura - (v / max) * altura * FOLGA_DO_TOPO } : null));
}

/** Trechos contínuos de pontos (um buraco separa dois trechos). */
function trechos(pontos: readonly (PontoDaLinha | null)[]): PontoDaLinha[][] {
  const saida: PontoDaLinha[][] = [];
  let atual: PontoDaLinha[] = [];
  for (const p of pontos) {
    if (p) atual.push(p);
    else if (atual.length) {
      saida.push(atual);
      atual = [];
    }
  }
  if (atual.length) saida.push(atual);
  return saida;
}

const xy = (p: PontoDaLinha) => `${arredonda2(p.x)},${arredonda2(p.y)}`;

/** Caminho da linha: um "M" novo depois de cada buraco. Sem nenhum ponto, vazio. */
export function caminhoDaLinha(pontos: readonly (PontoDaLinha | null)[]): string {
  return trechos(pontos)
    .map((t) => `M${t.map(xy).join(" L")}`)
    .join(" ");
}

/** Caminho da área: cada trecho de 2 pontos ou mais fecha até a base. Um dia isolado não vira área. */
export function caminhoDaArea(pontos: readonly (PontoDaLinha | null)[], altura = ALTURA): string {
  return trechos(pontos)
    .filter((t) => t.length >= 2)
    .map((t) => `M${t.map(xy).join(" L")} L${arredonda2(t[t.length - 1].x)},${altura} L${arredonda2(t[0].x)},${altura}Z`)
    .join(" ");
}

/** Média dos dias com valor; null quando nenhum dia tem valor. Zero medido é média zero. */
export function mediaDaSerie(valores: readonly (number | null)[]): number | null {
  const v = valores.filter(comValor);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Altura da linha tracejada da média, na mesma escala dos pontos. */
export function yDaMedia(valores: readonly (number | null)[], altura = ALTURA): number | null {
  const media = mediaDaSerie(valores);
  return media == null ? null : altura - (media / maiorDa(valores)) * altura * FOLGA_DO_TOPO;
}

/** O dia mais próximo do dedo: a fração (0 a 1) da largura vira o índice, arredondado e preso entre 0 e n-1. */
export function indiceMaisProximo(fracao: number, n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(fracao * (n - 1))));
}

/** Menos de 2 dias com valor: a peça não desenha nada. */
export function temSerieParaDesenhar(valores: readonly (number | null)[]): boolean {
  return valores.filter(comValor).length >= 2;
}

const formatoPadrao = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** "qua., 14/10" (dia da semana curto, dd/mm), lido em T12:00Z para o dia não trocar por fuso. */
export function nomeDoDia(data: string): string {
  return new Date(`${data}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/** "qua., 14/10: 685", ou "qua., 14/10: sem dado" (nunca 0). */
export function textoDoDia(data: string, valor: number | null, formatar: (n: number) => string = formatoPadrao): string {
  return `${nomeDoDia(data)}: ${comValor(valor) ? formatar(valor) : "sem dado"}`;
}

const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** "média do mês" com 28 a 31 dias; senão "média do período". */
export const rotuloDaMedia = (dias: number) => (dias >= 28 && dias <= 31 ? "média do mês" : "média do período");

/** "▲ 253% vs média do mês": o sinal vai no texto, nunca só a cor. Média 0 ou ausente, ou dia sem dado, não vira %. */
export function comparacaoComAMedia(valor: number | null, media: number | null, dias: number): { sobe: boolean; texto: string } | null {
  if (!comValor(valor) || !comValor(media) || !(media > 0)) return null;
  const pct = Math.round(((valor - media) / media) * 100);
  const rotulo = rotuloDaMedia(dias);
  if (pct === 0) return { sobe: true, texto: `igual à ${rotulo}` };
  return { sobe: pct > 0, texto: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs ${rotulo}` };
}

/** Resumo para leitor de tela: "{rótulo} por dia, dd/mm a dd/mm: média N; maior N em dd/mm; menor N em dd/mm" e os dias sem dado. */
export function resumoDaSerie({ rotulo, datas, valores, formatar = formatoPadrao }: { rotulo: string; datas: readonly string[]; valores: readonly (number | null)[]; formatar?: (n: number) => string }): string {
  const cabeca = `${rotulo} por dia, ${datas.length ? `${ddmm(datas[0])} a ${ddmm(datas[datas.length - 1])}` : "sem dias"}`;
  const media = mediaDaSerie(valores);
  if (media == null) return `${cabeca}: sem dado`;
  let iMax = -1;
  let iMin = -1;
  valores.forEach((v, i) => {
    if (!comValor(v)) return;
    if (iMax < 0 || v > valores[iMax]!) iMax = i;
    if (iMin < 0 || v < valores[iMin]!) iMin = i;
  });
  const buracos = valores.filter((v) => !comValor(v)).length;
  const partes = [`média ${formatar(media)}`, `maior ${formatar(valores[iMax]!)} em ${ddmm(datas[iMax])}`, `menor ${formatar(valores[iMin]!)} em ${ddmm(datas[iMin])}`];
  if (buracos > 0) partes.push(`${buracos} ${buracos === 1 ? "dia" : "dias"} sem dado`);
  return `${cabeca}: ${partes.join("; ")}`;
}
