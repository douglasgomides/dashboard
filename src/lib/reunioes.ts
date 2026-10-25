/**
 * Reuniões com a clínica: o que a equipe anotou (e a transcrição, se colada) vira resumo, combinados, ações, entregas da
 * semana e propostas de memória para o Brain. Funções puras: montar a entrada mascarada e validar o que a IA devolve.
 * A chamada e a gravação ficam em api/_lib/reuniao.ts.
 */
import { MEMORIAS, type Confianca, type Memoria } from "./brand-brain.js";

export const MAX_NOTAS = 30_000;
export const MAX_TRANSCRICAO = 60_000;
export const MAX_MEMORIAS = 10;
export const MAX_ENTREGAS = 6;

export type TipoEntrega = "conteudo" | "anuncio" | "atendimento" | "comercial" | "outro";
export const TIPOS_ENTREGA: Record<TipoEntrega, string> = { conteudo: "Conteúdo", anuncio: "Anúncio", atendimento: "Atendimento", comercial: "Comercial", outro: "Outro" };

export interface MemoriaProposta { memoria: Memoria; chave: string; valor: string; confianca: Confianca }
export interface Entrega { tipo: TipoEntrega; titulo: string; detalhe: string; porque: string }
export interface ResultadoReuniao {
  resumo: string;
  combinados: string[];
  acoes_clinica: string[];
  acoes_equipe: string[];
  entregas: Entrega[];
  memorias: MemoriaProposta[];
  pendencias: string[];
}

export function mascarar(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
}

/** Mesmo critério do banco (brain_texto_ok): sem e-mail, telefone ou CPF. */
export const semDadoPessoal = (t: string) => !/[^\s@]+@[^\s@]+\.[a-zA-Z]/.test(t) && !/\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}/.test(t) && !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(t);

export function chaveDe(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max = 12) => (Array.isArray(v) ? v.map((x) => texto(x, 400)).filter(Boolean).slice(0, max) : []);
const MEMORIA_OK = new Set<string>(MEMORIAS.map((m) => m.id));
const TIPO_OK = new Set(Object.keys(TIPOS_ENTREGA));

/** Valida e normaliza o JSON da IA. Devolve null se não houver resumo (resposta fora do formato). */
export function lerResultado(json: unknown): ResultadoReuniao | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  const resumo = texto(j.resumo, 1500);
  if (!resumo) return null;
  const vistas = new Set<string>();
  const memorias: MemoriaProposta[] = [];
  for (const m of Array.isArray(j.memorias) ? j.memorias : []) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    const memoria = String(r.memoria ?? ""), valor = texto(r.valor, 600), chave = chaveDe(String(r.chave ?? "") || valor);
    if (!MEMORIA_OK.has(memoria) || valor.length < 3 || chave.length < 3 || !semDadoPessoal(valor) || vistas.has(`${memoria}:${chave}`)) continue;
    vistas.add(`${memoria}:${chave}`);
    const confianca = (["baixa", "media", "alta"] as const).find((c) => c === r.confianca) ?? "media";
    memorias.push({ memoria: memoria as Memoria, chave, valor, confianca });
    if (memorias.length >= MAX_MEMORIAS) break;
  }
  const entregas: Entrega[] = (Array.isArray(j.entregas) ? j.entregas : [])
    .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : {}))
    .map((e) => ({ tipo: (TIPO_OK.has(String(e.tipo)) ? e.tipo : "outro") as TipoEntrega, titulo: texto(e.titulo, 160), detalhe: texto(e.detalhe, 800), porque: texto(e.porque, 400) }))
    .filter((e) => e.titulo)
    .slice(0, MAX_ENTREGAS);
  return { resumo, combinados: lista(j.combinados), acoes_clinica: lista(j.acoes_clinica), acoes_equipe: lista(j.acoes_equipe), entregas, memorias, pendencias: lista(j.pendencias, 8) };
}

export interface ContextoClinica { nome: string; especialidade: string | null; brain: { memoria: string; chave: string; valor: string }[]; plano: string[] }

export function montarEntrada(r: { titulo: string; data: string; participantes: string | null; notas: string; transcricao: string | null }, ctx: ContextoClinica): string {
  const notas = mascarar(r.notas).slice(0, MAX_NOTAS);
  const transcricao = r.transcricao ? mascarar(r.transcricao).slice(0, MAX_TRANSCRICAO) : "";
  return [
    `Reunião: ${r.titulo} (${r.data})${r.participantes ? `. Participantes: ${mascarar(r.participantes)}` : ""}`,
    `Clínica: ${ctx.especialidade ?? "especialidade não informada"}`,
    "",
    "# O que já sabemos da clínica (Brain aprovado)",
    ctx.brain.length ? ctx.brain.map((b) => `- [${b.memoria}] ${b.chave}: ${b.valor}`).join("\n") : "(Brain ainda vazio)",
    "",
    "# Plano desta semana",
    ctx.plano.length ? ctx.plano.map((p) => `- ${p}`).join("\n") : "(sem plano gerado)",
    "",
    "# Notas da equipe sobre a reunião",
    notas.trim() || "(sem notas)",
    transcricao ? `\n# Transcrição (pode estar incompleta)\n${transcricao}` : "",
  ].join("\n");
}
