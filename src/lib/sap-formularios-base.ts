// SAP · Formulários: tipos e atalhos para declarar um documento (sem dependências, para os módulos de documentos importarem
// sem ciclo). O registro de todos os formulários e os cálculos ficam em sap-formularios.ts.

export type TipoCampo = "texto" | "paragrafo" | "numero" | "data" | "link" | "escolha" | "multipla" | "nota" | "arquivo" | "tabela";

export interface Coluna { id: string; rotulo: string; opcoes?: string[] }

export interface Campo {
  id: string;
  rotulo: string;
  ajuda?: string;
  tipo: TipoCampo;
  opcoes?: string[];
  /** Padrão: obrigatório. */
  opcional?: boolean;
  /** nota: pesos do scorecard (nota x peso). Sem peso, conta 1. */
  peso?: number;
  /** multipla: todas as opções precisam estar marcadas (consentimentos). */
  todas?: boolean;
  /** tabela: colunas; linhas fixas (rótulo de cada linha) ou livres (adiciona e remove). */
  colunas?: Coluna[];
  linhas?: string[];
  minLinhas?: number;
  /** arquivo: quantos no máximo (padrão 6). */
  maxArquivos?: number;
}

export interface Secao {
  id: string;
  titulo: string;
  intro?: string;
  campos: Campo[];
  /** A seção só é exigida (e só aparece) quando outro campo tem este valor. */
  quando?: { campo: string; igual: string };
  /** Soma das notas da seção, mostrada no fim (ex.: 0 a 12). */
  total?: "notas" | "scorecard";
}

export interface Formulario {
  codigo: string; // "03.01" ou "reg-10"
  nome: string;
  /** Item do cronograma que este formulário conclui. */
  marco: number | null;
  /** "semana": uma resposta por semana (rotinas); "interessado": pré-venda, sem clínica; padrão: uma por clínica. */
  ref?: "semana" | "interessado";
  serve: string;
  /** Quem preenche e quando (texto do documento). */
  quem?: string;
  secoes: Secao[];
  /** Código do documento no dicionário (para o link do Drive de consulta). */
  doc?: string;
}

export type Valor = string | string[] | Record<string, string>[];
export type Dados = Record<string, Valor>;

export const sim = ["Sim", "Não"];
export const nota012 = ["0", "1", "2"];
export const t = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "texto", ...extra });
export const p = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "paragrafo", ...extra });
export const esc = (id: string, rotulo: string, opcoes: string[], extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "escolha", opcoes, ...extra });
export const nt = (id: string, rotulo: string, ajuda: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "nota", opcoes: nota012, ajuda, ...extra });
export const ar = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "arquivo", ...extra });
export const dt = (id: string, rotulo: string, extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "data", ...extra });
export const tb = (id: string, rotulo: string, colunas: Coluna[], extra: Partial<Campo> = {}): Campo => ({ id, rotulo, tipo: "tabela", colunas, ...extra });

export const reg = (codigo: string, marco: number, nome: string, serve: string, campos: Campo[], extra: Partial<Formulario> = {}): Formulario => ({
  codigo, marco, nome, serve, secoes: [{ id: "reg", titulo: "Registro da entrega", campos }], ...extra,
});
