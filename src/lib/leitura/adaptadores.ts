// ESBOÇO da fase RED (TDD): ainda não adapta nada. A implementação vem no commit seguinte.
import type { Fato, PassoFato, VerboPasso } from "./tipos";
import type { Insight, Limitacao } from "@/lib/insight";

export function verboDoTexto(_texto: string): VerboPasso {
  return "revisar";
}
export function deInsight(_i: Insight): { fato: Fato; passo: PassoFato | null } {
  throw new Error("não implementado");
}
export function deLimitacao(_l: Limitacao): { fato: Fato; passo: PassoFato | null } {
  throw new Error("não implementado");
}
