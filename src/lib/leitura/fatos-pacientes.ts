// Fatos de Pacientes do período e das telas em construção. Esboço do RED: ainda não conclui nada.
import type { MetricaMeta } from "@/lib/inteligencia-resultados";
import type { PacientesPeriodo } from "@/lib/pacientes";
import { periodoAnterior, type FatosDaTela, type TelaId } from "./tipos";

export const VERSAO_REGRAS_PACIENTES = 0;

export interface EntradaFatosPacientes {
  dados: PacientesPeriodo;
  de: string;
  ate: string;
  hoje: string;
  somaAtual?: Record<string, number | null> | null;
  somaAntes?: Record<string, number | null> | null;
  metas?: Partial<Record<MetricaMeta, { meta: number; atual: number | null }>>;
}

export function fatosDePacientes(e: EntradaFatosPacientes): FatosDaTela {
  return { tela: "pacientes", versaoRegras: VERSAO_REGRAS_PACIENTES, tipoPeriodo: "periodo", periodo: { de: e.de, ate: e.ate, anterior: periodoAnterior(e.de, e.ate) }, portao: { ok: true }, fatos: [], proximoPasso: null, outrosPassos: [] };
}

export function fatosEmConstrucao(tela: TelaId): FatosDaTela {
  return { tela, versaoRegras: VERSAO_REGRAS_PACIENTES, tipoPeriodo: "periodo", periodo: { de: "2026-01-01", ate: "2026-01-01", anterior: null }, portao: { ok: true }, fatos: [], proximoPasso: null, outrosPassos: [] };
}
