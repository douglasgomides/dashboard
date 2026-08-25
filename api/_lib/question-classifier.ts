/**
 * Detecta se um comentário é uma pergunta — heurística por pontuação/palavra
 * interrogativa, sem IA generativa. Mesma linha do resto do dashboard: só
 * mede o que já está lá, não interpreta nem reescreve.
 */
const QUESTION_WORDS = [
  "quanto",
  "quando",
  "onde",
  "como",
  "qual",
  "quais",
  "quem",
  "por que",
  "porque",
  "pq",
  "sera que",
  "dói",
  "doi",
  "pode",
  "posso",
  "tem como",
  "vc sabe",
  "voce sabe",
];

const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

export function isQuestion(text: string): boolean {
  if (text.includes("?")) return true;
  const normalized = normalize(text);
  return QUESTION_WORDS.some((word) => normalized.includes(normalize(word)));
}
