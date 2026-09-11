/**
 * Detecta se um comentário é uma DÚVIDA DE PACIENTE — heurística por
 * pontuação e vocabulário, sem IA generativa. Mesma linha do resto do
 * dashboard: só mede o que já está lá, não interpreta nem reescreve.
 *
 * REESCRITO EM 11/09/2026. A versão anterior perguntava "isto é uma
 * pergunta?" e respondia sim para qualquer texto com "?" OU que contivesse
 * uma palavra interrogativa em qualquer lugar, por busca de substring. Nos
 * 11.826 comentários do Dr. Sergio Maia isso marcou 888 — e a maior parte
 * não tinha nada a ver com dúvida de paciente:
 *
 *   - substring sem limite de palavra: "pode" casava com "poderosamente",
 *     "doi" com "doido". Sozinha, "como" marcou 193 comentários, quase todos
 *     em "como sempre", "como você", "tenho vc como inspiração";
 *   - 506 das 888 não tinham sequer "?" — eram elogios que por acaso
 *     continham uma das palavras da lista.
 *
 * A aba existe para virar pauta de conteúdo, então o que importa não é a
 * forma interrogativa e sim o assunto. Agora exige as duas coisas ao mesmo
 * tempo: pontuação de pergunta E vocabulário de saúde/tratamento/consulta.
 *
 * Medido sobre a mesma base: 88 marcados em vez de 888. Testei também uma
 * variante que aceitava pergunta sem "?" quando a frase começava com palavra
 * interrogativa; recuperou 3 comentários, os 3 irrelevantes, e foi descartada.
 *
 * O corte é deliberadamente conservador. Esta lista alimenta a pauta do
 * médico: uma dúvida real que escapa custa pouco, uma tela cheia de elogio
 * marcado como dúvida torna a aba inútil.
 */

// Vocabulário do assunto: sintoma, exame, medicação, corpo, rotina, consulta.
// Sem acento de propósito — o texto chega normalizado por normalize().
const ASSUNTO_CLINICO = new RegExp(
  "\\b(" +
    "exame|sangue|tireoide|hormon|colesterol|glicemia|diabete|pressao|remedio|medicament|" +
    "dose|comprimido|injec|caneta|ozempic|mounjaro|tirzepatida|semaglutida|glp|" +
    "testosterona|estrogen|progesteron|reposicao|implante|chip|anticoncepcional|diu|" +
    "emagrec|engord|peso|kg|gordura|massa|muscul|treino|dieta|jejum|alimenta|proteina|carboidrato|" +
    "suplement|vitamina|creatina|whey|colageno|" +
    "consulta|agendar|atende|convenio|plano de saude|valor|preco|quanto custa|" +
    "sintoma|dor|dores|cansaco|fadiga|sono|insonia|ansiedade|depress|menopausa|tpm|" +
    "tratamento|protocolo|resultado|efeito|colateral|contraindic|" +
    "gravid|gestante|amament|" +
    "cirurgia|procedimento|botox|preenchi|laser|pele|cabelo|queda" +
    ")",
);

// Chamada para ação do próprio médico, postada como primeiro comentário
// ("Me conta aqui nos comentários, você já passou por isso?"). Passa nos dois
// testes acima — é interrogativa e fala do assunto — mas é justamente o
// contrário de uma dúvida: é o médico perguntando, não o paciente.
//
// O filtro é pelo formato da frase porque não há como olhar o autor: desde
// alguma mudança da Meta, /comments não devolve mais `username` nem `from`,
// mesmo pedidos explicitamente (confirmado contra a API em 11/09/2026). Todo
// author_username no banco está vazio.
const CTA_DO_CRIADOR = new RegExp(
  "(me conta|conta aqui|conta pra mim|comenta (aqui|abaixo)|me diz|me diga|" +
    "deixa (nos|seu) coment|escreve aqui|responde (aqui|nos coment)|" +
    "quero saber de voc|voce ja (tinha )?(ouviu|passou|usou|fez|sentiu)|" +
    "\\be (voce|vc)\\?|marca (alguem|aqui)|salva esse|compartilha)",
);

// Abaixo disso é emoji, hashtag ou "kkkk" — nunca uma dúvida de verdade.
const MINIMO_LETRAS = 10;

const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
}

export function isQuestion(text: string): boolean {
  if (!text) return false;

  // Sem "?" não entra. É o filtro que sozinho derruba 506 dos 888 falsos
  // positivos da versão anterior, e nenhuma variante que tentou dispensá-lo
  // recuperou dúvida de verdade.
  if (!text.includes("?")) return false;

  const normalizado = normalize(text);
  if (normalizado.replace(/[^a-z0-9]/g, "").length < MINIMO_LETRAS) return false;
  if (CTA_DO_CRIADOR.test(normalizado)) return false;

  return ASSUNTO_CLINICO.test(normalizado);
}
