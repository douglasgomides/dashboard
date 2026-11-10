// ESBOÇO da fase RED (TDD): ainda não monta texto. A implementação vem no commit seguinte.
import type { FatosDaTela, PassoFato, PeriodoLeitura, TextoDaLeitura, TextoDoResumo } from "./tipos";

export function montarTexto(_f: FatosDaTela): TextoDaLeitura {
  throw new Error("não implementado");
}
export function frasePasso(_p: PassoFato): string {
  return "";
}
export function rotuloPeriodo(_p: PeriodoLeitura): string {
  return "";
}
export function checarTextoDaLeitura(_t: string): string[] {
  return [];
}
export function problemasDoTexto(_t: TextoDaLeitura | TextoDoResumo): string[] {
  return [];
}
