// Tipo de cada comentário ANTES de virar ideia:
//   pergunta          → só ela entra em "Pergunta repetida";
//   elogio, relato    → podem virar "Tema que gera identificação";
//   marcacao          → marcar amigo (@fulana olha isso): não é dúvida nem elogio;
//   outro             → o resto (emoji, conversa, spam).
// Regra simples e explicável (sem IA). Caso real: "Eu poderia ter falado esse texto. Me identifico 200%.
// Seja bem-vindo de volta!" é elogio, não dúvida.

export type TipoComentario = "pergunta" | "elogio" | "relato" | "marcacao" | "outro";

export const ROTULO_TIPO_COMENTARIO: Record<TipoComentario, string> = {
  pergunta: "Pergunta",
  elogio: "Elogio",
  relato: "Relato pessoal",
  marcacao: "Marcação de amigo",
  outro: "Outro",
};

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/\s+/g, " ").trim();

// Começo de pergunta sem "?" (muita gente não usa ponto de interrogação).
const INICIO_PERGUNTA = /^(como|qual|quais|quando|onde|quanto|quantos|quantas|por que|porque|pq|o que|oq|pode|posso|podem|e normal|eh normal|tem como|alguem sabe|sera que|existe|serve|funciona|da pra|da para|precisa|preciso|vale a pena|e verdade|faz mal|atende|voce atende|vc atende|aceita|tem (algum|alguma)|doutor(a)?,? (como|qual|quanto|pode|posso|e normal))\b/;
const PERGUNTA_NO_MEIO = /\b(gostaria de saber|queria saber|quero saber|me tira uma duvida|tenho uma duvida|minha duvida)\b/;

const ELOGIO = /\b(amei|amo|adorei|maravilhos[oa]|parabens|perfeit[oa]|incrivel|sensacional|excelente|otim[oa]|lind[oa]|top|show|arrasou|arrasa|obrigad[oa]|gratidao|grata|grato|me identifico|me identifiquei|identifiquei|que conteudo|conteudo (bom|otimo|excelente|incrivel|maravilhoso)|explicacao (otima|perfeita|maravilhosa|incrivel)|bem[- ]vind[oa]|que bom|muito bom|muito util|ajudou muito|salvando|salvei|concordo|te entendo|isso mesmo|vdd|verdade|exatamente|falou tudo|disse tudo)\b/;
const RELATO = /\b(eu (tive|tenho|tinha|sinto|senti|sofro|sofri|passei|passo|fiz|faco|fazia|estou|to|tava|estava|uso|usei|tomo|tomei|descobri|operei|engravidei|tambem)|eu+ tambem|euu+|me sinto|me senti|me sentia|estou passando|to passando|passo por|minha vida|comigo|aconteceu comigo|minha (mae|filha|irma|avo|esposa|amiga)|meu (filho|pai|marido|irmao|avo)|na minha (familia|casa|gravidez)|desde que eu|ha \d+ anos|faz \d+ anos)\b/;

export function classificarComentario(texto: string): TipoComentario {
  const bruto = (texto ?? "").trim();
  if (!bruto) return "outro";
  const t = norm(bruto);
  const semMencoes = t.replace(/@[\w.]+/g, "").trim();
  const mencoes = (t.match(/@[\w.]+/g) ?? []).length;
  // Marcação: só @ ou @ + poucas palavras ("@fulana olha isso", "@ciclano kkk").
  if (mencoes > 0 && semMencoes.replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).length <= 4) return "marcacao";
  const letras = semMencoes.replace(/[^a-z0-9]/g, "");
  if (letras.length < 4) return "outro";
  const ehPergunta = bruto.includes("?") || INICIO_PERGUNTA.test(semMencoes) || PERGUNTA_NO_MEIO.test(semMencoes);
  // Pergunta para outro seguidor (começa marcando alguém) não é dúvida para o médico.
  if (ehPergunta && /^@[\w.]+/.test(t)) return "outro";
  // Piada curta com "?" ("ah não é possível 😂 já?") não é dúvida.
  if (ehPergunta && /(😂|🤣|kkk|rsrs|haha)/i.test(bruto) && semMencoes.split(" ").filter(Boolean).length < 8) return "outro";
  if (ehPergunta) return "pergunta";
  if (RELATO.test(semMencoes)) return "relato";
  if (ELOGIO.test(semMencoes)) return "elogio";
  return "outro";
}

/** Só as perguntas de verdade (o que pode entrar em "Pergunta repetida"). */
export function soPerguntas<T extends { text: string }>(rows: T[]): T[] {
  return rows.filter((r) => classificarComentario(r.text) === "pergunta");
}
