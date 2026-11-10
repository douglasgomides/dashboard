// ESBOÇO da fase RED (TDD): ainda não conclui nada. A implementação vem no commit seguinte.
import type { Portao } from "./tipos";

export interface EntradaPortao {
  periodoAte: string;
  hoje?: string;
  n?: number;
}

export function portaoDoPeriodo(_e: EntradaPortao): Portao {
  return { ok: true };
}

export function piorPortao(_lista: Portao[]): Portao {
  return { ok: true };
}
