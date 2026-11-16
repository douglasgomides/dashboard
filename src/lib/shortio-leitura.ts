// O que o cartão dos links do short.gy pode afirmar (debug numeros-nao-batem-fonte, 16/11/2026).
// Os cliques de cada link são os "últimos 30 dias" do Short.io no momento em que o link foi lido (stats_em). Quando a leitura
// para, o número fica velho e a tela seguia dizendo "30 dias" como se fosse hoje. Aqui: a soma de TODOS os links (antes só os 50
// com mais cliques), o dia em que os 30 dias terminam e, com leitura velha, desde quando ela parou. Módulo puro.
import { diasEntre, hojeBrasilia } from "./status-fonte";

/** Linha de shortio_links que o cartão lê. */
export interface LinkShortioLido {
  cliques_total: number | null;
  cliques_humanos: number | null;
  stats_em: string | null;
}

/** A partir de quantos dias sem leitura o cartão diz "Leitura parada" (a mesma régua do amarelo de status-fonte.ts). */
export const DIAS_PARA_LEITURA_PARADA = 2;

export interface ResumoDosLinksShortio {
  links: number;
  /** Links com pelo menos uma leitura de cliques. */
  lidos: number;
  /** Cliques de pessoas (robôs fora; sem a separação, o total) somados nos links lidos. null = nenhum link lido. */
  cliques: number | null;
  /** Dia (Brasília, ISO) da leitura mais nova: os 30 dias do Short.io terminam nele. */
  ate: string | null;
  /** Dia da leitura mais velha, quando é diferente de `ate` (cada link fecha os 30 dias num dia). */
  desde: string | null;
  /** Dia da última leitura, quando ela tem DIAS_PARA_LEITURA_PARADA dias ou mais. null = leitura em dia. */
  paradaDesde: string | null;
}

export function resumoDosLinksShortio(links: readonly LinkShortioLido[], hoje: string = hojeBrasilia()): ResumoDosLinksShortio {
  const lidos = links.filter((l) => l.stats_em && !Number.isNaN(Date.parse(l.stats_em)));
  const dias = lidos.map((l) => hojeBrasilia(new Date(l.stats_em as string))).sort();
  const ate = dias.length ? dias[dias.length - 1] : null;
  const desde = dias.length && dias[0] !== ate ? dias[0] : null;
  const cliques = lidos.length ? lidos.reduce((s, l) => s + (Number(l.cliques_humanos ?? l.cliques_total) || 0), 0) : null;
  return {
    links: links.length,
    lidos: lidos.length,
    cliques,
    ate,
    desde,
    paradaDesde: ate && diasEntre(hoje, ate) >= DIAS_PARA_LEITURA_PARADA ? ate : null,
  };
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "Cliques de pessoas (30 dias até 07/11)". Sem leitura: só "(30 dias)". */
export function rotuloDosCliques(r: Pick<ResumoDosLinksShortio, "ate">): string {
  return r.ate ? `Cliques de pessoas (30 dias até ${ddmm(r.ate)})` : "Cliques de pessoas (30 dias)";
}

/** A nota do número: robôs fora e, quando cada link foi lido num dia, de quando a quando. */
export function notaDosCliques(r: Pick<ResumoDosLinksShortio, "ate" | "desde">): string {
  return r.desde && r.ate ? `Robôs fora · lidos de ${ddmm(r.desde)} a ${ddmm(r.ate)}` : "Robôs fora";
}
