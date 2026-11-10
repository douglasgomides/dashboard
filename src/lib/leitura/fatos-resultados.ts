// ESBOÇO da fase RED (TDD): ainda não calcula fatos. A implementação vem no commit seguinte.
import type { Resultado } from "@/lib/resultado";
import { periodoAnterior, type FatosDaTela } from "./tipos";

export const VERSAO_REGRAS_RESULTADOS = 1;

export interface EntradaFatosResultados {
  resultado: Resultado;
  de: string;
  ate: string;
  hoje: string;
}

export function fatosDeResultados(e: EntradaFatosResultados): FatosDaTela {
  return {
    tela: "resultados",
    versaoRegras: VERSAO_REGRAS_RESULTADOS,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: e.ate, anterior: periodoAnterior(e.de, e.ate) },
    portao: { ok: true },
    fatos: [],
    proximoPasso: null,
    outrosPassos: [],
  };
}
