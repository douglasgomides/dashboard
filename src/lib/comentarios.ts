// Triagem de comentários antes de virarem dúvida ou ideia. "É pergunta?" (isQuestion) pega pontuação e
// palavra interrogativa, e deixava passar sorteio, convite para seguir e resposta do próprio perfil
// ("Já me segue no QUERIDA DIVA? Ainda não te vi por lá"). Aqui sai o que claramente não é paciente perguntando.
// Regras simples e explicáveis, sem IA: ficam de fora só os casos óbvios; na dúvida, o comentário fica.

const DIACRITICOS = new RegExp("[̀-ͯ]", "g");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");

export type CategoriaComentario = "pergunta" | "sorteio_ou_convite" | "do_proprio_perfil" | "sem_conteudo";

const SORTEIO_OU_CONVITE: RegExp[] = [
  /\bsorteio\b/,
  /\bconcorr(e|endo|er)\b/,
  /\bparticip(ar|ando|e)\b.*\b(sorteio|promo)/,
  /\bja (me )?segue\b/,
  /\bme segue\b/,
  /\bme segu(e|a) la\b/,
  /\bnao te vi por la\b/,
  /\bsegue (a|o) (pagina|perfil|conta)\b/,
  /\bmarque? (um|uma|\d+|tres|dois|duas) (amig|pessoa)/,
  /\blink (na|da) bio\b/,
  /\bcupom\b/,
  /\bchama no (direct|dm|whats)/,
  /\bmanda (um )?(direct|dm)\b/,
];

export function categoriaDoComentario(texto: string, autor?: string | null, donos: string[] = []): CategoriaComentario {
  const t = norm(texto).replace(/\s+/g, " ").trim();
  const semEmoji = t.replace(/[^a-z0-9?]/g, "");
  if (semEmoji.length < 6) return "sem_conteudo";
  if (autor && donos.some((d) => d && norm(d) === norm(autor))) return "do_proprio_perfil";
  if (SORTEIO_OU_CONVITE.some((r) => r.test(t))) return "sorteio_ou_convite";
  return "pergunta";
}

export function filtrarPerguntas<T extends { text: string; author_username?: string | null }>(rows: T[], donos: string[] = []): T[] {
  return rows.filter((q) => categoriaDoComentario(q.text, q.author_username, donos) === "pergunta");
}
