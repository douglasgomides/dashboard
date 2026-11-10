// Resumo da clínica (D-07). Esboço do RED: ainda não monta nada.
import type { Area } from "@/lib/insight";
import type { FatosDaTela, Fato, PassoFato, TextoDoResumo } from "./tipos";

export interface EntradaResumo {
  fatos: FatosDaTela;
  porArea: Record<Area, Fato[]>;
  passos: PassoFato[];
}

export function resumirClinica(_e: EntradaResumo): TextoDoResumo {
  return { tipo: "resumo", aconteceu: null, preocupa: null, acao: null, semAcaoMotivo: null };
}
