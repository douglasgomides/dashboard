// Adaptadores: transformam o que as telas já calculam (Insight, Limitacao, Achado, leitura do período) em Fato e
// PassoFato. Não reescrevem regra nenhuma: só traduzem para o contrato da leitura. Módulo puro.
import { ROTULO_META, type Leitura, type MetricaMeta, type NumerosLeitura } from "@/lib/inteligencia-resultados";
import { prioridade, type Insight, type Limitacao, type Responsavel } from "@/lib/insight";
import type { Achado, RotaAcao } from "@/lib/leitura-periodo";
import type { Fato, Numeral, PassoFato, VerboPasso } from "./tipos";

// ---------- verbos (D-10, lista PROVISÓRIA em tipos.ts) ----------
/** Palavras que abrem a ação de uma tela e a que verbo da lista cada uma corresponde (infinitivo e imperativo). */
export const SINONIMOS_DE_VERBO: Record<VerboPasso, readonly string[]> = {
  "ligar para": ["ligar", "ligue", "chamar", "chame"],
  responder: ["responder", "responda"],
  revisar: ["revisar", "revise", "rever", "reveja", "analisar", "analise"],
  pausar: ["pausar", "pause", "cortar", "corte", "desligar", "desligue"],
  reforçar: ["reforçar", "reforce", "impulsionar", "impulsione", "aumentar", "aumente", "ampliar", "amplie", "escalar", "escale"],
  corrigir: ["corrigir", "corrija", "ajustar", "ajuste", "marcar", "marque", "preencher", "preencha"],
  publicar: ["publicar", "publique", "postar", "poste"],
  conferir: ["conferir", "confira", "verificar", "verifique", "checar", "cheque"],
};

const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MAPA = new Map<string, VerboPasso>();
for (const [verbo, palavras] of Object.entries(SINONIMOS_DE_VERBO) as [VerboPasso, readonly string[]][]) for (const p of palavras) MAPA.set(SEM_ACENTO(p), verbo);

const primeiraPalavra = (t: string) => SEM_ACENTO(t.trim()).split(/[^a-z]+/)[0] ?? "";
const semPontoFinal = (t: string) => t.trim().replace(/[.\s]+$/, "");
const minuscula = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** O verbo da lista para o texto de uma ação, pela primeira palavra sem acento. "revisar" quando nada casa. */
export function verboDoTexto(texto: string): VerboPasso {
  return MAPA.get(primeiraPalavra(texto)) ?? "revisar";
}

/** Separa o verbo do resto da ação. Quando o verbo não é da lista, a ação inteira vira o complemento de "revisar". */
export function passoDeTexto(texto: string): { verbo: VerboPasso; texto: string } {
  const limpo = semPontoFinal(texto);
  const verbo = MAPA.get(primeiraPalavra(limpo));
  if (!verbo) return { verbo: "revisar", texto: `a ação: ${minuscula(limpo)}` };
  let resto = limpo.replace(/^\S+\s*/, "");
  if (verbo === "ligar para") resto = resto.replace(/^para\s+/i, "");
  return { verbo, texto: resto || "o ponto indicado na tela" };
}

// ---------- Insight → Fato ----------
// prioridade(i) vai de 0,4 a 9 (tom × impacto × confiança). Faixas: 6 ou mais pesa 3; de 3 a 6 pesa 2; abaixo, 1.
const pesoDaPrioridade = (p: number): 1 | 2 | 3 => (p >= 6 ? 3 : p >= 3 ? 2 : 1);

/** Primeira frase da evidência, para ficar ao lado da afirmação. Evidência longa demais não vira número solto. */
function numeroDaEvidencia(evidencia: string | undefined, chave: string): Numeral[] {
  const t = (evidencia ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const primeira = t.split(/(?<=[.!?])\s+/)[0] ?? t;
  return primeira.length <= 220 ? [{ chave, exibicao: primeira }] : [];
}

function passoDe(texto: string | undefined, quem: Responsavel, motivo: string | undefined, fatoId: string): PassoFato | null {
  if (!texto?.trim()) return null;
  const { verbo, texto: resto } = passoDeTexto(texto);
  return { verbo, texto: resto, quem, motivo: motivo?.trim() || undefined, fatoId };
}

export function deInsight(i: Insight): { fato: Fato; passo: PassoFato | null } {
  const fato: Fato = {
    id: i.id,
    tom: i.tom,
    peso: pesoDaPrioridade(prioridade(i)),
    frase: i.titulo,
    numeros: numeroDaEvidencia(i.evidencia, "evidencia"),
  };
  return { fato, passo: passoDe(i.acao?.texto, i.responsavel, i.diagnostico, i.id) };
}

/** O que falta no dado vira fato de atenção e um passo de "corrigir" (ou o verbo do próprio como resolver). */
export function deLimitacao(l: Limitacao): { fato: Fato; passo: PassoFato | null } {
  const fato: Fato = { id: l.id, tom: "atencao", peso: 1, frase: l.texto, numeros: [] };
  const passo: PassoFato = l.comoResolver?.trim()
    ? { ...passoDeTexto(l.comoResolver), quem: l.resolve, fatoId: l.id }
    : { verbo: "corrigir", texto: "o dado que falta", quem: l.resolve, fatoId: l.id };
  return { fato, passo };
}

// ---------- Achado (leitura-periodo.ts) → Fato ----------
const QUEM_DA_ROTA: Record<RotaAcao, Responsavel> = {
  posts: "social_media",
  ideias: "social_media",
  conteudo: "social_media",
  anuncios: "gestor_trafego",
  atendimento: "atendimento",
};

export function deAchado(a: Achado): { fato: Fato; passo: PassoFato | null } {
  const peso = Math.min(3, Math.max(1, Math.round(a.peso))) as 1 | 2 | 3;
  const fato: Fato = { id: a.id, tom: a.tom, peso, frase: a.titulo, numeros: numeroDaEvidencia(a.base, "base") };
  const quem = a.acao?.rota ? QUEM_DA_ROTA[a.acao.rota] : "equipe_hub";
  return { fato, passo: passoDe(a.acao?.texto, quem, a.porque, a.id) };
}

// ---------- leitura do período de Resultados (inteligencia-resultados.ts) → Fato ----------
const PALAVRA_DA_METRICA: [MetricaMeta, RegExp][] = [
  ["mandaram_mensagem", /chamaram|chegou mais gente|contatos/i],
  ["agendaram", /agendamento|agendaram|agendou/i],
  ["fecharam", /fechamento|fecharam/i],
];

/** As frases de "o que mudou" viram fatos, cada um com o número do período ao lado. `numeros` são os do período atual. */
export function deLeituraResultados(leitura: Leitura[], numeros: NumerosLeitura): Fato[] {
  return leitura.map((l, k) => {
    const chave = PALAVRA_DA_METRICA.find(([, re]) => re.test(l.texto))?.[0];
    const valor = chave ? numeros[chave] : null;
    return {
      id: `mudou-${k}`,
      tom: l.tom === "up" ? "bom" : l.tom === "down" ? "ruim" : "neutro",
      peso: 2,
      frase: l.texto,
      numeros: chave && valor != null ? [{ chave, exibicao: `${ROTULO_META[chave]}: ${valor.toLocaleString("pt-BR")}`, valor }] : [],
    } satisfies Fato;
  });
}
